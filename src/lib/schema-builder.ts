import { llmCall } from '@/lib/llm-client';
import { sanitizeJsonString } from '@/lib/utils';
import type { PrismaClient } from '@prisma/client';

async function llmJson<T>(messages: { role: 'system' | 'user' | 'assistant'; content: string }[]): Promise<T> {
  const raw = await llmCall({ messages, temperature: 0.3, maxTokens: 4096, jsonMode: true });
  try {
    return JSON.parse(sanitizeJsonString(raw)) as T;
  } catch (err: any) {
    // Fallback: try extracting JSON from markdown code fences
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      try {
        return JSON.parse(sanitizeJsonString(fenceMatch[1])) as T;
      } catch (_) {
        throw new Error(`无法解析AI响应为JSON: ${err.message}`);
      }
    }
    throw new Error(`无法解析AI响应为JSON: ${err.message}`);
  }
}

// ── Helper: resolve LLM model name for logging ──
async function resolveLlmModel(prisma: PrismaClient): Promise<string> {
  try {
    const saved = await prisma.apiKey.findUnique({ where: { service: 'llm' } });
    if (saved?.model) return saved.model;
  } catch (_) { /* fall through */ }
  return process.env.DEEPSEEK_MODEL || 'deepseek-chat';
}

// ── Types ──

export interface SchemaSuggestion {
  name: string;
  description: string;
  nodeIds: string[];
  confidence: number; // 0-1
}

export interface SchemaBuildResult {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  representationData: any;
}

export interface TransferOpportunity {
  domain: string;
  relevance: number;
  explanation: string;
  exampleApplication: string;
}

type NodeIdOnly = { id: string };
type EdgeLine = { fromId: string; toId: string; relationType: string; label: string | null };
type SchemaMemberNode = {
  id: string;
  title: string;
  summary: string | null;
  keywords: string[];
  representationType: string | null;
  difficulty: number;
  cognitiveLoad: number;
  masteryLevel: number;
  subjectId: string;
  subject?: { name: string } | null;
};
type TransferMemberNode = { title: string; summary: string | null; keywords: string[] };
type SubjectSummary = { id: string; name: string };

// ── suggestSchemaNodes ──
// Given a seed node, explore DB edges (1-2 hops) and ask AI to suggest
// subsets of nodes that form a coherent schema.

export async function suggestSchemaNodes(
  knowledgeNodeId: string,
  prisma: PrismaClient,
): Promise<SchemaSuggestion[]> {
  const seed = await prisma.knowledgeNode.findUnique({
    where: { id: knowledgeNodeId },
    include: { subject: { select: { id: true, name: true } } },
  });
  if (!seed) throw new Error(`知识点 ${knowledgeNodeId} 不存在`);

  // Gather related nodes via edges (1-hop neighbours)
  const edges = await prisma.knowledgeEdge.findMany({
    where: {
      OR: [{ fromId: knowledgeNodeId }, { toId: knowledgeNodeId }],
    },
  });
  const neighbourIds = new Set<string>();
  for (const e of edges) {
    if (e.fromId !== knowledgeNodeId) neighbourIds.add(e.fromId);
    if (e.toId !== knowledgeNodeId) neighbourIds.add(e.toId);
  }

  // 2-hop expansion
  if (neighbourIds.size > 0) {
    const secondEdges = await prisma.knowledgeEdge.findMany({
      where: {
        OR: [{ fromId: { in: [...neighbourIds] } }, { toId: { in: [...neighbourIds] } }],
      },
    });
    for (const e of secondEdges) {
      neighbourIds.add(e.fromId);
      neighbourIds.add(e.toId);
    }
  }
  neighbourIds.delete(knowledgeNodeId);

  if (neighbourIds.size === 0) {
    return [];
  }

  // Fetch neighbour node info
  const neighbours = await prisma.knowledgeNode.findMany({
    where: { id: { in: [...neighbourIds] } },
    select: { id: true, title: true, summary: true, keywords: true, representationType: true },
  });

  const allIds = [knowledgeNodeId, ...neighbours.map((n: NodeIdOnly) => n.id)];
  const allEdges = await prisma.knowledgeEdge.findMany({
    where: {
      fromId: { in: allIds },
      toId: { in: allIds },
    },
    select: { fromId: true, toId: true, relationType: true, label: true },
  });

  // Build AI context
  const nodeMap = new Map<string, string>();
  nodeMap.set(
    seed.id,
    `[seed] ${seed.title} — ${seed.summary || '(无摘要)'} | keywords: ${seed.keywords?.join(', ') || ''}`,
  );
  for (const n of neighbours) {
    nodeMap.set(
      n.id,
      `${n.title} — ${n.summary || '(无摘要)'} | keywords: ${n.keywords?.join(', ') || ''} | repType: ${n.representationType || 'none'}`,
    );
  }

  const edgeLines = allEdges.map(
    (e: EdgeLine) => `  ${e.fromId} --[${e.relationType}${e.label ? `: ${e.label}` : ''}]--> ${e.toId}`,
  );
  const nodeLines = [...nodeMap.entries()].map(([id, info]) => `[${id}] ${info}`);

  const systemPrompt = `你是一位知识图谱分析专家。给定一组知识点及其关系图，请识别其中可以形成"知识图式(schema)"的节点子集。

知识图式是结构化的认知框架，例如：
- 解题模板（步骤序列、公式套用模式）
- 概念框架（层次化概念关系）
- 实验流程（步骤序列 + 条件 + 结果）
- 因果关系链（原因→结果链条）
- 对比矩阵（多维度对比结构）

对每个候选图式，请给出：
- name: 图式名称（简洁，10字以内）
- description: 图式描述（30-80字，说明图式的结构特征和用途）
- nodeIds: 属于该图式的节点ID列表
- confidence: 0-1之间的置信度（描述该图式是否清晰成立）

只返回质量高的图式（confidence >= 0.5）。若没有合适的图式返回空数组。

输出严格JSON格式：{"suggestions": [...]}`;

  const userPrompt = `学科：${seed.subject?.name || '未知'}
种子节点：${seed.title}

知识节点列表：
${nodeLines.join('\n')}

关系图：
${edgeLines.join('\n')}

请分析以上节点和关系，识别其中可以构成知识图式(Schema)的节点子集。`;

  const result = await llmJson<{ suggestions: SchemaSuggestion[] }>([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);

  // Validate nodeIds exist in our set
  const validIds = new Set(allIds);
  return (result.suggestions || [])
    .map((s) => ({
      ...s,
      nodeIds: s.nodeIds.filter((id) => validIds.has(id)),
      confidence: Math.min(1, Math.max(0, s.confidence)),
    }))
    .filter((s) => s.nodeIds.length >= 2);
}

// ── buildSchema ──
// Given a list of node IDs, ask AI to generate a unified schema description,
// then persist a schema KnowledgeNode and edges.

export async function buildSchema(
  knowledgeNodeIds: string[],
  subject: string | null,
  prisma: PrismaClient,
  userId?: string,
  customName?: string,
): Promise<SchemaBuildResult> {
  if (!knowledgeNodeIds || knowledgeNodeIds.length < 2) {
    throw new Error('至少需要2个知识点才能构建图式');
  }

  const members = await prisma.knowledgeNode.findMany({
    where: { id: { in: knowledgeNodeIds } },
    include: { subject: { select: { id: true, name: true } } },
  });

  if (members.length < 2) {
    throw new Error(`只能找到 ${members.length} 个知识点（至少需要2个）`);
  }

  const foundIds = new Set(members.map((m: SchemaMemberNode) => m.id));
  const missingIds = knowledgeNodeIds.filter((id) => !foundIds.has(id));
  if (missingIds.length > 0) {
    console.warn(`[buildSchema] 以下节点未找到: ${missingIds.join(', ')}`);
  }

  // Fetch edges among members for richer context
  const memberEdges = await prisma.knowledgeEdge.findMany({
    where: {
      fromId: { in: [...foundIds] },
      toId: { in: [...foundIds] },
    },
    select: { fromId: true, toId: true, relationType: true, label: true },
  });

  // Determine subjectId by majority vote
  const subjectIdCounts = new Map<string, number>();
  for (const m of members) subjectIdCounts.set(m.subjectId, (subjectIdCounts.get(m.subjectId) || 0) + 1);
  let subjectId = members[0].subjectId;
  let maxCount = 0;
  for (const [sid, count] of subjectIdCounts) {
    if (count > maxCount) { maxCount = count; subjectId = sid; }
  }
  const subjectName = subject || members.find((m: SchemaMemberNode) => m.subjectId === subjectId)?.subject?.name || '未知';

  // Build AI prompts
  const nodeLines = members.map(
    (m: SchemaMemberNode) =>
      `- [${m.id}] ${m.title}: ${m.summary || '(无摘要)'} | keywords: ${m.keywords?.join(', ') || ''} | difficulty=${m.difficulty} | representationType=${m.representationType || 'none'}`,
  );
  const edgeLines = memberEdges.map(
    (e: EdgeLine) => `  ${e.fromId} --[${e.relationType}${e.label ? `: ${e.label}` : ''}]--> ${e.toId}`,
  );

  const systemPrompt = `你是一位教育认知科学专家，擅长构建知识图式(Schema)。知识图式是一个结构化的认知框架，将一组相关知识点整合成一个可迁移的心智模型。

请为给定的一组知识点生成一个统一的知识图式，包含：
- name: 图式名称（简洁有力，10字以内）
- description: 图式总体描述（80-150字），阐述图式的结构、核心逻辑和应用场景
- schemaType: 图式类型，从以下选择：解题模板/概念框架/实验流程/因果关系链/对比矩阵/分类体系/推导链条/记忆口诀/其他
- keyInsights: 3-5条核心洞见，每条10-30字
- applicationScope: 图式适用的问题类型或场景
- typicalExample: 一个典型应用示例（50字以内）
- transferHints: 可能迁移到其他领域的提示（30字以内）

输出严格JSON格式。`;

  const userPrompt = `学科：${subjectName}

知识点成员：
${nodeLines.join('\n')}

成员间关系：
${edgeLines.length > 0 ? edgeLines.join('\n') : '(无已有关系)'}

请为以上知识点生成统一的知识图式。`;

  const schemaResult = await llmJson<{
    name: string;
    description: string;
    schemaType: string;
    keyInsights: string[];
    applicationScope: string;
    typicalExample: string;
    transferHints: string;
  }>([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);

  const finalName = customName || schemaResult.name || '未命名图式';

  // Persist schema KnowledgeNode
  const representationData = {
    schemaType: schemaResult.schemaType || '概念框架',
    keyInsights: schemaResult.keyInsights || [],
    applicationScope: schemaResult.applicationScope || '',
    typicalExample: schemaResult.typicalExample || '',
    transferHints: schemaResult.transferHints || '',
  };

  const schemaNode = await prisma.knowledgeNode.create({
    data: {
      subjectId,
      title: finalName,
      summary: schemaResult.description || '知识图式',
      keywords: members.flatMap((m: SchemaMemberNode) => m.keywords || []).slice(0, 20),
      representationType: 'schema',
      representationData,
      difficulty: Math.round(members.reduce((sum: number, m: SchemaMemberNode) => sum + m.difficulty, 0) / members.length),
      cognitiveLoad: Math.round(members.reduce((sum: number, m: SchemaMemberNode) => sum + m.cognitiveLoad, 0) / members.length),
      icapLevel: 'Constructive',
      masteryLevel: Math.round(members.reduce((sum: number, m: SchemaMemberNode) => sum + m.masteryLevel, 0) / members.length),
    },
  });

  // Create edges from schema to each member
  const edgeCreates = members.map((m: SchemaMemberNode) =>
    prisma.knowledgeEdge.create({
      data: {
        fromId: schemaNode.id,
        toId: m.id,
        relationType: 'schema_member',
        label: `隶属于图式"${finalName}"`,
      },
    }),
  );
  await Promise.all(edgeCreates);

  // Log to AiGenerationLog
  const model = await resolveLlmModel(prisma);
  await prisma.aiGenerationLog.create({
    data: {
      generatorType: 'llm',
      model,
      prompt: `[system] ${systemPrompt}\n[user] ${userPrompt}`.slice(0, 4000),
      response: JSON.stringify(schemaResult).slice(0, 4000),
      status: 'success',
    },
  });

  return {
    id: schemaNode.id,
    name: finalName,
    description: schemaResult.description || '',
    memberCount: members.length,
    representationData,
  };
}

// ── detectTransferOpportunities ──
// Given a schema node, find other domains/subjects where this schema
// could be applied — cross-domain knowledge transfer.

export async function detectTransferOpportunities(
  schemaNodeId: string,
  prisma: PrismaClient,
): Promise<TransferOpportunity[]> {
  const schemaNode = await prisma.knowledgeNode.findUnique({
    where: { id: schemaNodeId },
    include: { subject: { select: { id: true, name: true } } },
  });
  if (!schemaNode) throw new Error(`图式 ${schemaNodeId} 不存在`);
  if (schemaNode.representationType !== 'schema') {
    throw new Error('该节点不是图式(schema)类型');
  }

  // Fetch schema members
  const memberEdges = await prisma.knowledgeEdge.findMany({
    where: { fromId: schemaNodeId, relationType: 'schema_member' },
    include: { to: { select: { id: true, title: true, summary: true, keywords: true } } },
  });
  const members = memberEdges.map((e: { to: TransferMemberNode }) => e.to);

  // Get all subjects for cross-domain search
  const allSubjects = await prisma.subject.findMany({
    select: { id: true, name: true },
  });

  const schemaData = (schemaNode.representationData as any) || {};
  const otherSubjects = allSubjects.filter((s: SubjectSummary) => s.id !== schemaNode.subjectId);

  const memberLines = members.map(
    (m: TransferMemberNode) => `- ${m.title}: ${m.summary || ''} | keywords: ${m.keywords?.join(', ') || ''}`,
  );

  const systemPrompt = `你是一位跨学科教育专家，擅长识别知识图式在不同领域之间的迁移机会。

分析给定的知识图式，判断它是否可以迁移应用到其他学科或领域。对每个可能的迁移目标，提供：
- domain: 目标领域名称
- relevance: 相关度 0-1
- explanation: 为什么这个图式可以迁移到该领域（30-60字）
- exampleApplication: 一个具体的应用示例（30-60字）

仅返回真正有意义的迁移机会（relevance >= 0.4）。如无可迁移场景返回空数组。

输出严格JSON格式：{"opportunities": [...]}`;

  const userPrompt = `图式名称：${schemaNode.title}
图式描述：${schemaNode.summary || ''}
图式类型：${schemaData.schemaType || '未知'}
核心洞见：${(schemaData.keyInsights || []).join('；')}
应用范围：${schemaData.applicationScope || '未知'}

图式成员知识点：
${memberLines.join('\n')}

源学科：${schemaNode.subject?.name || '未知'}
可能迁移的目标学科：${otherSubjects.map((s: SubjectSummary) => s.name).join('、')}

请分析该图式可以迁移应用到哪些领域。`;

  const result = await llmJson<{ opportunities: TransferOpportunity[] }>([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);

  return (result.opportunities || [])
    .map((o: TransferOpportunity) => ({
      ...o,
      relevance: Math.min(1, Math.max(0, o.relevance)),
    }))
    .filter((o: TransferOpportunity) => o.relevance >= 0.4);
}
