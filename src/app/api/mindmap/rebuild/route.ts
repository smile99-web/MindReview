import { getErrorMessage } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { signTaskPayload, verifyTaskToken } from '@/lib/task-token';
import { RELATION_LABELS, type RelationType } from '@/types';

/**
 * POST /api/mindmap/rebuild — 合书默画骨架（Kit-Build 式图谱重组）
 *
 * 学习科学依据：检索练习优于重复观看（Karpicke & Blunt, 2011, Science）；
 * 封闭式零件重组 + 与专家图按命题比对可同时获得生成效应与误解诊断
 * （Kit-Build, Hirashima et al., 2015；命题计分 McClure et al., 1999）。
 * 学生只看节点标题，凭记忆重建节点间的关系，再与系统图比对：
 * 漏掉的边 = 知识缺口，多画的边 = 潜在误解。
 *
 * action=create: { chapterId } → { nodes:[{id,title}], token }
 * action=grade:  { token, edges:[{fromId,toId,relationType}] } → 比对结果
 */

const TOKEN_DOMAIN = 'rebuild';
const TOKEN_TTL = 45 * 60;
const NODE_LIMIT = 10;

interface TrueEdge {
  fromId: string;
  toId: string;
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

// compare 是无向关系（A 对比 B ≡ B 对比 A），其余有向
function edgeKey(fromId: string, toId: string, relationType: string): string {
  if (relationType === 'compare') {
    const [a, b] = [fromId, toId].sort();
    return `${a}|${b}|compare`;
  }
  return `${fromId}|${toId}|${relationType}`;
}

export async function POST(req: NextRequest) {
  try {
    await resolveUserIdFromRequest(req);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: '请求体必须是 JSON 对象' }, { status: 400 });
    }
    if (body.action === 'create') return await createTask(body);
    if (body.action === 'grade') return await gradeTask(body);
    return NextResponse.json({ error: 'action 必须是 create 或 grade' }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

async function createTask(body: { chapterId?: unknown }) {
  const chapterId = typeof body.chapterId === 'string' ? body.chapterId.trim() : '';
  if (!chapterId) return NextResponse.json({ error: 'chapterId 必填' }, { status: 400 });

  const nodes = await prisma.knowledgeNode.findMany({
    where: { chapterId, OR: [{ representationType: null }, { representationType: { not: 'schema' } }] },
    select: { id: true, title: true },
    orderBy: { createdAt: 'asc' },
    take: NODE_LIMIT,
  });
  const nodeIds = new Set(nodes.map((n) => n.id));

  const edges = await prisma.knowledgeEdge.findMany({
    where: { fromId: { in: [...nodeIds] }, toId: { in: [...nodeIds] }, relationType: { not: 'schema_member' } },
    select: { fromId: true, toId: true, relationType: true, label: true },
  });

  if (nodes.length < 4 || edges.length < 3) {
    return NextResponse.json({ error: '这个章节的节点或关系太少，换一章试试' }, { status: 400 });
  }

  const trueEdges: TrueEdge[] = edges.map((e) => ({
    fromId: e.fromId,
    toId: e.toId,
    relationType: e.relationType,
    label: e.label || '',
  }));

  const token = signTaskPayload(TOKEN_DOMAIN, { edges: trueEdges }, TOKEN_TTL);

  // 只发节点，不发任何边——学生凭记忆重建
  return NextResponse.json({
    nodes: shuffle(nodes.map((n) => ({ id: n.id, title: n.title }))),
    token,
  });
}

interface StudentEdge {
  fromId?: unknown;
  toId?: unknown;
  relationType?: unknown;
}

async function gradeTask(body: { token?: unknown; edges?: unknown }) {
  const token = typeof body.token === 'string' ? body.token : '';
  const payload = token ? verifyTaskToken<{ edges: TrueEdge[]; exp: number }>(TOKEN_DOMAIN, token) : null;
  if (!payload || !Array.isArray(payload.edges)) {
    return NextResponse.json({ error: '任务已过期或无效，请重新开始' }, { status: 400 });
  }

  const titleRows = await prisma.knowledgeNode.findMany({
    where: {
      id: {
        in: [...new Set(payload.edges.flatMap((e) => [e.fromId, e.toId]))],
      },
    },
    select: { id: true, title: true },
  });
  const titleById = new Map(titleRows.map((n) => [n.id, n.title]));
  const title = (id: string) => titleById.get(id) ?? '?';
  const describe = (e: { fromId: string; toId: string; relationType: string }) =>
    `${title(e.fromId)} —${RELATION_LABELS[(e.relationType as RelationType)] ?? e.relationType}→ ${title(e.toId)}`;

  const truth = new Map(payload.edges.map((e) => [edgeKey(e.fromId, e.toId, e.relationType), e]));

  const studentEdges: TrueEdge[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(body.edges) ? (body.edges as StudentEdge[]) : []) {
    if (typeof raw?.fromId !== 'string' || typeof raw?.toId !== 'string' || typeof raw?.relationType !== 'string') continue;
    if (raw.fromId === raw.toId) continue;
    const key = edgeKey(raw.fromId, raw.toId, raw.relationType);
    if (seen.has(key)) continue; // 学生重复添加按一条算
    seen.add(key);
    studentEdges.push({ fromId: raw.fromId, toId: raw.toId, relationType: raw.relationType, label: '' });
  }

  const correct: Array<{ text: string; label: string }> = [];
  const extra: string[] = [];
  for (const e of studentEdges) {
    const key = edgeKey(e.fromId, e.toId, e.relationType);
    const hit = truth.get(key);
    if (hit) {
      correct.push({ text: describe(e), label: hit.label });
      truth.delete(key);
    } else {
      extra.push(describe(e));
    }
  }
  const missing = [...truth.values()].map((e) => ({ text: describe(e), label: e.label }));

  // 命题计分：画对 +2，多画 -1（潜在误解），漏画不扣分但在结果里单列
  const score = Math.max(0, correct.length * 2 - extra.length);
  const maxScore = payload.edges.length * 2;

  return NextResponse.json({
    score,
    maxScore,
    correct,
    missing,
    extra,
    trueEdgeCount: payload.edges.length,
  });
}
