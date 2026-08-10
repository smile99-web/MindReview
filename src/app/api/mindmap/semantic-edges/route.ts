import { getErrorMessage } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/require-admin';
import { llmCall } from '@/lib/llm-client';
import { parseAiJson } from '@/lib/ai-service';

/**
 * POST /api/mindmap/semantic-edges — 语义关系边补全（管理员）
 *
 * 背景：图谱里 690 条边几乎全是教材生成时按章节顺序机械灌的 prerequisite
 * 顺序链（label 形如 "A → B"），设计的 6 种语义关系（因果/对比/公式推导/
 * 实验验证/易错关联/题型关联）一条都没有。没有语义边，挖空连接词、
 * 纠错式找茬、关系推理这些高价值学习动作都没有地基。
 *
 * 本路由对单个章节调一次 LLM，让模型在章内节点之间标注语义关系。
 * 全量跑法：逐个章节 POST { chapterId }（脚本/循环驱动，避免长请求超时）。
 *
 * body: { chapterId: string, dryRun?: boolean }
 * dryRun=true 只返回提案不落库，用于先抽查质量。
 */

// 学生侧可见、且适合 LLM 标注的语义关系（prerequisite/contains 已有机械链，不让 LLM 重复标）
const SEMANTIC_TYPES = ['cause', 'compare', 'formula', 'experiment', 'mistake', 'questionType'] as const;
type SemanticType = (typeof SEMANTIC_TYPES)[number];

// 单章节点太多时截断：超出后 prompt 又长又贵，且 LLM 对长清单的召回明显下降
const MAX_NODES_PER_CHAPTER = 40;
const MIN_CONFIDENCE = 0.6;

interface ProposedEdge {
  from?: string;
  to?: string;
  relationType?: string;
  label?: string;
  confidence?: number;
}

interface LlmEdgesResponse {
  edges?: ProposedEdge[];
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const chapterId = typeof body.chapterId === 'string' ? body.chapterId.trim() : '';
    const dryRun = body.dryRun === true;

    if (!chapterId) {
      return NextResponse.json({ error: 'chapterId 必填（每次处理一章，全量请循环调用）' }, { status: 400 });
    }

    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
      include: { subject: { select: { name: true } } },
    });
    if (!chapter) {
      return NextResponse.json({ error: '章节不存在' }, { status: 404 });
    }

    const allNodes = await prisma.knowledgeNode.findMany({
      where: {
        chapterId,
        OR: [{ representationType: null }, { representationType: { not: 'schema' } }],
      },
      select: { id: true, title: true, summary: true, keywords: true },
      orderBy: { createdAt: 'asc' },
    });

    if (allNodes.length < 3) {
      return NextResponse.json({ chapterId, skipped: true, reason: '节点少于3个', nodeCount: allNodes.length, inserted: 0, proposals: [] });
    }

    const truncated = allNodes.length > MAX_NODES_PER_CHAPTER;
    const nodes = allNodes.slice(0, MAX_NODES_PER_CHAPTER);
    const nodeIds = new Set(nodes.map((n) => n.id));

    // 已有边（章内，两端都在节点集里）——给 LLM 看避免重复，也用于落库前去重
    const existingEdges = await prisma.knowledgeEdge.findMany({
      where: { fromId: { in: [...nodeIds] }, toId: { in: [...nodeIds] } },
      select: { fromId: true, toId: true, relationType: true },
    });
    const existingKeys = new Set(existingEdges.map((e) => `${e.fromId}|${e.toId}|${e.relationType}`));
    // 无序对去重：同一对节点之间同类型边只留一条（双向 causal 之类由 LLM 判断方向，不强行拦）
    const existingPairType = new Set(existingEdges.map((e) => {
      const [a, b] = [e.fromId, e.toId].sort();
      return `${a}|${b}|${e.relationType}`;
    }));

    const systemPrompt = `你是中学课程知识图谱专家。任务：在给定知识点清单中找出知识点之间的语义关系，并用命题式短语标注。
规则：
- relationType 只允许：cause 因果（从因到果）/ compare 对比（易混淆或可比的两个概念）/ formula 公式推导（从基础概念到推导出的公式或结论）/ experiment 实验验证（从实验到被验证的结论）/ mistake 易错关联（从知识点指向它最容易犯的错误或误解）/ questionType 题型关联（从知识点指向它常考的题型）
- 方向必须准确，尤其是 cause 和 formula
- label 必须写出具体的关系内容（25字以内），例如"电流越大，磁场越强"；禁止"A → B"式空标签
- 只标注你确信的关系，宁缺毋滥；没有可靠关系就返回空数组
- confidence 取 0~1，只有 >=${MIN_CONFIDENCE} 的会被采用
输出 JSON：{"edges":[{"from":"节点id","to":"节点id","relationType":"cause","label":"...","confidence":0.9}]}`;

    const userPayload = {
      subject: chapter.subject.name,
      chapter: chapter.title,
      nodes: nodes.map((n) => ({
        id: n.id,
        title: n.title,
        summary: (n.summary || '').slice(0, 120),
        keywords: n.keywords.slice(0, 8),
      })),
      existingEdges: existingEdges
        .filter((e) => (SEMANTIC_TYPES as readonly string[]).includes(e.relationType))
        .map((e) => ({ from: e.fromId, to: e.toId, relationType: e.relationType })),
    };

    const raw = await llmCall({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(userPayload) },
      ],
      temperature: 0.2,
      maxTokens: 4096,
      jsonMode: true,
      // 方舟 doubao-seed 是推理模型，图谱标注任务会思考 >200s 挂起；关掉思考 20s 内返回
      disableThinking: true,
      timeoutMs: 120000,
      preferNonReasoning: true,
    });

    const parsed = parseAiJson<LlmEdgesResponse>(raw, 'semantic-edges');
    const rawEdges = Array.isArray(parsed.edges) ? parsed.edges : [];

    // 校验 + 清洗 + 去重
    const seen = new Set<string>();
    const valid: Array<{ fromId: string; toId: string; relationType: SemanticType; label: string }> = [];
    let dropped = 0;
    for (const e of rawEdges) {
      const from = typeof e.from === 'string' ? e.from : '';
      const to = typeof e.to === 'string' ? e.to : '';
      const type = e.relationType as SemanticType;
      const label = typeof e.label === 'string' ? e.label.trim().slice(0, 60) : '';
      const confidence = typeof e.confidence === 'number' ? e.confidence : 0;

      if (!nodeIds.has(from) || !nodeIds.has(to) || from === to) { dropped += 1; continue; }
      if (!(SEMANTIC_TYPES as readonly string[]).includes(type)) { dropped += 1; continue; }
      if (confidence < MIN_CONFIDENCE) { dropped += 1; continue; }
      if (!label) { dropped += 1; continue; }

      const key = `${from}|${to}|${type}`;
      const [a, b] = [from, to].sort();
      const pairKey = `${a}|${b}|${type}`;
      if (seen.has(key) || existingKeys.has(key) || existingPairType.has(pairKey)) { dropped += 1; continue; }
      seen.add(key);
      valid.push({ fromId: from, toId: to, relationType: type, label });
    }

    let inserted = 0;
    if (!dryRun && valid.length > 0) {
      await prisma.$transaction(
        valid.map((e) =>
          prisma.knowledgeEdge.create({
            data: { fromId: e.fromId, toId: e.toId, relationType: e.relationType, label: e.label },
          }),
        ),
      );
      inserted = valid.length;
    }

    return NextResponse.json({
      chapterId,
      chapterTitle: chapter.title,
      subject: chapter.subject.name,
      nodeCount: allNodes.length,
      truncated,
      proposed: rawEdges.length,
      dropped,
      accepted: valid.length,
      inserted,
      dryRun,
      proposals: valid,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
