import { getErrorMessage } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { signTaskPayload, verifyTaskToken } from '@/lib/task-token';
import { llmCall } from '@/lib/llm-client';
import { parseAiJson } from '@/lib/ai-service';
import { RELATION_LABELS, type RelationType } from '@/types';

/**
 * POST /api/mindmap/cloze — 连接词挖空（cloze concept map）
 *
 * 学习科学依据：概念图里"连接词（命题）"才是意义的基本单元（Novak），
 * 挖连接词比挖概念节点更有效（Ruiz-Primo et al., 2001）。
 * 给出两个知识点，学生选关系类型 + 用自己的话写出关系内容。
 *
 * action=create: { chapterId, count? } → { items:[{edgeId,fromTitle,toTitle}], token }
 * action=grade:  { token, answers:[{edgeId, relationType, labelText?}] } → 评分与揭晓
 */

const TOKEN_DOMAIN = 'cloze';
const TOKEN_TTL = 30 * 60;
const SEMANTIC_TYPES = ['cause', 'compare', 'formula', 'experiment', 'mistake', 'questionType'];

interface ClozeItem {
  edgeId: string;
  relationType: string;
  label: string;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserIdFromRequest(req);
    const body = await req.json();
    if (body.action === 'create') return await createTask(body, userId);
    if (body.action === 'grade') return await gradeTask(body);
    return NextResponse.json({ error: 'action 必须是 create 或 grade' }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

// 支架淡出（expertise reversal：新手需要支架，高手用支架反而是冗余负荷）：
// 按该章 per-user 平均掌握度分档——guided 描述选填；standard 描述必填；
// expert 建议直接去零支架的默画。
type ScaffoldLevel = 'guided' | 'standard' | 'expert';

function scaffoldOf(avgMastery: number): ScaffoldLevel {
  if (avgMastery >= 75) return 'expert';
  if (avgMastery >= 40) return 'standard';
  return 'guided';
}

async function createTask(body: { chapterId?: unknown; count?: unknown }, userId: string) {
  const chapterId = typeof body.chapterId === 'string' ? body.chapterId.trim() : '';
  if (!chapterId) return NextResponse.json({ error: 'chapterId 必填' }, { status: 400 });
  const count = typeof body.count === 'number' ? Math.max(2, Math.min(8, Math.floor(body.count))) : 5;

  const nodes = await prisma.knowledgeNode.findMany({
    where: { chapterId, OR: [{ representationType: null }, { representationType: { not: 'schema' } }] },
    select: { id: true, title: true },
  });
  const nodeIds = new Set(nodes.map((n) => n.id));
  const titleById = new Map(nodes.map((n) => [n.id, n.title]));

  const edges = await prisma.knowledgeEdge.findMany({
    where: { fromId: { in: [...nodeIds] }, toId: { in: [...nodeIds] }, relationType: { not: 'schema_member' } },
    select: { id: true, fromId: true, toId: true, relationType: true, label: true },
  });

  // 语义边优先（认知价值高），不足再用前置/包含补齐
  const semantic = shuffle(edges.filter((e) => SEMANTIC_TYPES.includes(e.relationType)));
  const structural = shuffle(edges.filter((e) => !SEMANTIC_TYPES.includes(e.relationType)));
  const picked = [...semantic, ...structural].slice(0, count);

  if (picked.length < 2) {
    return NextResponse.json({ error: '这个章节的关系太少，换一章试试' }, { status: 400 });
  }

  const items: ClozeItem[] = picked.map((e) => ({
    edgeId: e.id,
    relationType: e.relationType,
    label: e.label || '',
  }));

  const token = signTaskPayload(TOKEN_DOMAIN, { items }, TOKEN_TTL);

  // 本章 per-user 平均掌握度 → 支架档位（无进度记录的节点按 0 计）
  const progressRows = await prisma.userKnowledgeProgress.findMany({
    where: { userId, knowledgeNodeId: { in: [...nodeIds] } },
    select: { masteryLevel: true },
  });
  const avgMastery = Math.round(
    progressRows.reduce((sum, r) => sum + r.masteryLevel, 0) / Math.max(nodeIds.size, 1),
  );

  return NextResponse.json({
    items: picked.map((e) => ({
      edgeId: e.id,
      fromTitle: titleById.get(e.fromId) ?? '?',
      toTitle: titleById.get(e.toId) ?? '?',
    })),
    token,
    scaffoldLevel: scaffoldOf(avgMastery),
    chapterMastery: avgMastery,
  });
}

interface ClozeAnswer {
  edgeId?: unknown;
  relationType?: unknown;
  labelText?: unknown;
}

async function gradeTask(body: { token?: unknown; answers?: unknown }) {
  const token = typeof body.token === 'string' ? body.token : '';
  const payload = token ? verifyTaskToken<{ items: ClozeItem[]; exp: number }>(TOKEN_DOMAIN, token) : null;
  if (!payload || !Array.isArray(payload.items)) {
    return NextResponse.json({ error: '任务已过期或无效，请重新开始' }, { status: 400 });
  }

  const answers: ClozeAnswer[] = Array.isArray(body.answers) ? body.answers : [];
  const answerByEdgeId = new Map<string, { relationType: string; labelText: string }>();
  for (const a of answers) {
    if (typeof a?.edgeId !== 'string') continue;
    answerByEdgeId.set(a.edgeId, {
      relationType: typeof a.relationType === 'string' ? a.relationType : '',
      labelText: typeof a.labelText === 'string' ? a.labelText.trim().slice(0, 200) : '',
    });
  }

  // 揭晓需要节点标题
  const edgeRows = await prisma.knowledgeEdge.findMany({
    where: { id: { in: payload.items.map((i) => i.edgeId) } },
    select: { id: true, fromId: true, toId: true },
  });
  const endpointIds = [...new Set(edgeRows.flatMap((e) => [e.fromId, e.toId]))];
  const nodeRows = await prisma.knowledgeNode.findMany({
    where: { id: { in: endpointIds } },
    select: { id: true, title: true },
  });
  const titleById = new Map(nodeRows.map((n) => [n.id, n.title]));
  const edgeById = new Map(edgeRows.map((e) => [e.id, e]));

  // 学生写了关系描述的，批量给 AI 对照评判（语义等价即可，不要求字面一致）
  const labelJudgements = new Map<string, { ok: boolean; comment: string }>();
  const toJudge = payload.items
    .map((item, idx) => {
      const a = answerByEdgeId.get(item.edgeId);
      const edge = edgeById.get(item.edgeId);
      if (!a?.labelText || !edge) return null;
      return {
        i: idx,
        from: titleById.get(edge.fromId) ?? '',
        to: titleById.get(edge.toId) ?? '',
        relation: RELATION_LABELS[(item.relationType as RelationType)] ?? item.relationType,
        reference: item.label,
        student: a.labelText,
      };
    })
    .filter(Boolean) as Array<{ i: number; from: string; to: string; relation: string; reference: string; student: string }>;

  let labelGraded = false;
  if (toJudge.length > 0) {
    try {
      const raw = await llmCall({
        messages: [
          {
            role: 'system',
            content: `你是中学老师，判断学生对知识点关系的描述是否抓住了要点。语义等价即可，不要求字面一致；明显说反、张冠李戴或太空泛（如"它们有关系"）判不通过。comment 给中学生看，30字以内，先肯定再指出差距。输出 JSON：{"judgements":[{"i":0,"ok":true,"comment":"..."}]}`,
          },
          { role: 'user', content: JSON.stringify({ pairs: toJudge }) },
        ],
        temperature: 0.2,
        maxTokens: 2048,
        jsonMode: true,
        disableThinking: true,
        timeoutMs: 60000,
        preferNonReasoning: true,
      });
      const parsed = parseAiJson<{ judgements?: Array<{ i?: number; ok?: boolean; comment?: string }> }>(raw, 'cloze-label-judge');
      for (const j of parsed.judgements ?? []) {
        if (typeof j.i !== 'number') continue;
        const item = payload.items[j.i];
        if (!item) continue;
        labelJudgements.set(item.edgeId, { ok: j.ok === true, comment: (j.comment || '').slice(0, 80) });
      }
      labelGraded = true;
    } catch {
      // AI 评判失败不阻塞出分：类型分照给，描述分跳过
      labelGraded = false;
    }
  }

  let score = 0;
  let maxScore = 0;
  const details = payload.items.map((item) => {
    const a = answerByEdgeId.get(item.edgeId);
    const edge = edgeById.get(item.edgeId);
    const typeCorrect = a?.relationType === item.relationType;
    const judgement = labelJudgements.get(item.edgeId);

    maxScore += 2;
    if (typeCorrect) score += 2;
    if (a?.labelText) {
      maxScore += 1;
      if (judgement?.ok) score += 1;
    }

    return {
      edgeId: item.edgeId,
      fromTitle: edge ? (titleById.get(edge.fromId) ?? '?') : '?',
      toTitle: edge ? (titleById.get(edge.toId) ?? '?') : '?',
      typeCorrect,
      correctRelationType: item.relationType,
      correctRelationLabel: RELATION_LABELS[(item.relationType as RelationType)] ?? item.relationType,
      correctLabel: item.label,
      labelOk: judgement?.ok ?? null,
      labelComment: judgement?.comment ?? null,
    };
  });

  return NextResponse.json({ score, maxScore, labelGraded, details });
}
