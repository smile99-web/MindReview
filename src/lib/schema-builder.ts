import { getErrorMessage } from '@/lib/errors';
import { parseArkModels } from '@/lib/ark';
import { llmCall } from '@/lib/llm-client';
import { sanitizeJsonString } from '@/lib/utils';
import type { Prisma, PrismaClient } from '@prisma/client';

type LlmMessage = { role: 'system' | 'user' | 'assistant'; content: string };

async function llmJson(messages: LlmMessage[]): Promise<unknown> {
  const raw = await llmCall({ messages, temperature: 0.3, maxTokens: 4096, jsonMode: true });
  try {
    return JSON.parse(sanitizeJsonString(raw)) as unknown;
  } catch (err: unknown) {
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      try {
        return JSON.parse(sanitizeJsonString(fenceMatch[1])) as unknown;
      } catch {
        throw new Error(`Unable to parse AI JSON response: ${getErrorMessage(err)}`);
      }
    }
    throw new Error(`Unable to parse AI JSON response: ${getErrorMessage(err)}`);
  }
}

async function resolveLlmModel(prisma: PrismaClient): Promise<string> {
  // 仅用于 AiGenerationLog 记录实际走的模型名；调用本身走 llmCall（已内部处理方舟优先）
  try {
    const ark = await prisma.apiKey.findUnique({ where: { service: 'ark' } });
    if (ark?.isActive && ark.key) {
      return parseArkModels(ark.model).llm;
    }
    const saved = await prisma.apiKey.findUnique({ where: { service: 'llm' } });
    if (saved?.model) return saved.model;
  } catch {
    // fall through
  }
  return process.env.DEEPSEEK_MODEL || 'deepseek-chat';
}

export interface SchemaSuggestion {
  name: string;
  description: string;
  nodeIds: string[];
  confidence: number;
}

export interface SchemaBuildResult {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  representationData: SchemaRepresentationData;
}

type SchemaRepresentationData = Prisma.JsonObject & {
  schemaType: string;
  keyInsights: string[];
  applicationScope: string;
  typicalExample: string;
  transferHints: string;
};

export interface TransferOpportunity {
  domain: string;
  relevance: number;
  explanation: string;
  exampleApplication: string;
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asString(item))
    .filter((item) => item.length > 0);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  // null/undefined 必须先回退：Number(null) === 0 会通过 isFinite 被钳到 min
  if (value == null) return fallback;
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function isSchemaRepresentationData(value: unknown): value is SchemaRepresentationData {
  return (
    isRecord(value) &&
    typeof value.schemaType === 'string' &&
    isStringArray(value.keyInsights) &&
    typeof value.applicationScope === 'string' &&
    typeof value.typicalExample === 'string' &&
    typeof value.transferHints === 'string'
  );
}

function normalizeSchemaSuggestions(value: unknown, validIds: Set<string>): SchemaSuggestion[] {
  const root = isRecord(value) ? value : {};
  if (!Array.isArray(root.suggestions)) return [];

  return root.suggestions
    .filter(isRecord)
    .map((suggestion): SchemaSuggestion => ({
      name: asString(suggestion.name, 'Schema'),
      description: asString(suggestion.description),
      nodeIds: asStringArray(suggestion.nodeIds).filter((id) => validIds.has(id)),
      confidence: clampNumber(suggestion.confidence, 0, 1, 0),
    }))
    .filter((suggestion) => suggestion.nodeIds.length >= 2 && suggestion.confidence >= 0.5);
}

function normalizeSchemaBuildPayload(value: unknown, fallbackName: string): {
  name: string;
  description: string;
  representationData: SchemaRepresentationData;
} {
  const root = isRecord(value) ? value : {};
  return {
    name: asString(root.name, fallbackName),
    description: asString(root.description, 'Knowledge schema'),
    representationData: {
      schemaType: asString(root.schemaType, 'conceptual framework'),
      keyInsights: asStringArray(root.keyInsights),
      applicationScope: asString(root.applicationScope),
      typicalExample: asString(root.typicalExample),
      transferHints: asString(root.transferHints),
    },
  };
}

function normalizeTransferOpportunities(value: unknown): TransferOpportunity[] {
  const root = isRecord(value) ? value : {};
  if (!Array.isArray(root.opportunities)) return [];

  return root.opportunities
    .filter(isRecord)
    .map((opportunity): TransferOpportunity => ({
      domain: asString(opportunity.domain),
      relevance: clampNumber(opportunity.relevance, 0, 1, 0),
      explanation: asString(opportunity.explanation),
      exampleApplication: asString(opportunity.exampleApplication),
    }))
    .filter((opportunity) => opportunity.domain.length > 0 && opportunity.relevance >= 0.4);
}

export async function suggestSchemaNodes(
  knowledgeNodeId: string,
  prisma: PrismaClient,
): Promise<SchemaSuggestion[]> {
  const seed = await prisma.knowledgeNode.findUnique({
    where: { id: knowledgeNodeId },
    include: { subject: { select: { id: true, name: true } } },
  });
  if (!seed) throw new Error(`Knowledge node ${knowledgeNodeId} does not exist`);

  const edges = await prisma.knowledgeEdge.findMany({
    where: {
      OR: [{ fromId: knowledgeNodeId }, { toId: knowledgeNodeId }],
    },
  });

  const neighbourIds = new Set<string>();
  for (const edge of edges) {
    if (edge.fromId !== knowledgeNodeId) neighbourIds.add(edge.fromId);
    if (edge.toId !== knowledgeNodeId) neighbourIds.add(edge.toId);
  }

  if (neighbourIds.size > 0) {
    const secondEdges = await prisma.knowledgeEdge.findMany({
      where: {
        OR: [{ fromId: { in: [...neighbourIds] } }, { toId: { in: [...neighbourIds] } }],
      },
    });
    for (const edge of secondEdges) {
      neighbourIds.add(edge.fromId);
      neighbourIds.add(edge.toId);
    }
  }
  neighbourIds.delete(knowledgeNodeId);

  if (neighbourIds.size === 0) return [];

  const neighbours = await prisma.knowledgeNode.findMany({
    where: { id: { in: [...neighbourIds] } },
    select: { id: true, title: true, summary: true, keywords: true, representationType: true },
  });

  const allIds = [knowledgeNodeId, ...neighbours.map((node) => node.id)];
  const allEdges = await prisma.knowledgeEdge.findMany({
    where: {
      fromId: { in: allIds },
      toId: { in: allIds },
    },
    select: { fromId: true, toId: true, relationType: true, label: true },
  });

  const nodeMap = new Map<string, string>();
  nodeMap.set(
    seed.id,
    `[seed] ${seed.title} - ${seed.summary || '(no summary)'} | keywords: ${seed.keywords?.join(', ') || ''}`,
  );
  for (const node of neighbours) {
    nodeMap.set(
      node.id,
      `${node.title} - ${node.summary || '(no summary)'} | keywords: ${node.keywords?.join(', ') || ''} | repType: ${node.representationType || 'none'}`,
    );
  }

  const edgeLines = allEdges.map(
    (edge: EdgeLine) => `  ${edge.fromId} --[${edge.relationType}${edge.label ? `: ${edge.label}` : ''}]--> ${edge.toId}`,
  );
  const nodeLines = [...nodeMap.entries()].map(([id, info]) => `[${id}] ${info}`);

  const result = await llmJson([
    {
      role: 'system',
      content: `You identify coherent knowledge schemas from graph nodes.
Return strict JSON: {"suggestions":[{"name":"...","description":"...","nodeIds":["id"],"confidence":0.8}]}.`,
    },
    {
      role: 'user',
      content: `Subject: ${seed.subject?.name || 'unknown'}
Seed node: ${seed.title}

Nodes:
${nodeLines.join('\n')}

Edges:
${edgeLines.join('\n')}`,
    },
  ]);

  return normalizeSchemaSuggestions(result, new Set(allIds));
}

export async function buildSchema(
  knowledgeNodeIds: string[],
  subject: string | null,
  prisma: PrismaClient,
  _userId?: string,
  customName?: string,
): Promise<SchemaBuildResult> {
  if (!knowledgeNodeIds || knowledgeNodeIds.length < 2) {
    throw new Error('At least two knowledge nodes are required to build a schema');
  }

  const members = await prisma.knowledgeNode.findMany({
    where: { id: { in: knowledgeNodeIds } },
    include: { subject: { select: { id: true, name: true } } },
  });

  if (members.length < 2) {
    throw new Error(`Only found ${members.length} knowledge nodes; at least two are required`);
  }

  const foundIds = new Set(members.map((member: SchemaMemberNode) => member.id));
  const missingIds = knowledgeNodeIds.filter((id) => !foundIds.has(id));
  if (missingIds.length > 0) {
    console.warn(`[buildSchema] Missing nodes: ${missingIds.join(', ')}`);
  }

  const memberEdges = await prisma.knowledgeEdge.findMany({
    where: {
      fromId: { in: [...foundIds] },
      toId: { in: [...foundIds] },
    },
    select: { fromId: true, toId: true, relationType: true, label: true },
  });

  const subjectIdCounts = new Map<string, number>();
  for (const member of members) {
    subjectIdCounts.set(member.subjectId, (subjectIdCounts.get(member.subjectId) || 0) + 1);
  }

  let subjectId = members[0].subjectId;
  let maxCount = 0;
  for (const [sid, count] of subjectIdCounts) {
    if (count > maxCount) {
      maxCount = count;
      subjectId = sid;
    }
  }
  const subjectName =
    subject ||
    members.find((member: SchemaMemberNode) => member.subjectId === subjectId)?.subject?.name ||
    'unknown';

  const nodeLines = members.map(
    (member: SchemaMemberNode) =>
      `- [${member.id}] ${member.title}: ${member.summary || '(no summary)'} | keywords: ${member.keywords?.join(', ') || ''} | difficulty=${member.difficulty} | representationType=${member.representationType || 'none'}`,
  );
  const edgeLines = memberEdges.map(
    (edge: EdgeLine) => `  ${edge.fromId} --[${edge.relationType}${edge.label ? `: ${edge.label}` : ''}]--> ${edge.toId}`,
  );

  const schemaResult = normalizeSchemaBuildPayload(
    await llmJson([
      {
        role: 'system',
        content: `You build a transferable knowledge schema from related knowledge nodes.
Return strict JSON with fields: name, description, schemaType, keyInsights, applicationScope, typicalExample, transferHints.`,
      },
      {
        role: 'user',
        content: `Subject: ${subjectName}

Members:
${nodeLines.join('\n')}

Relations:
${edgeLines.length > 0 ? edgeLines.join('\n') : '(no relations)'}`,
      },
    ]),
    customName || 'Knowledge schema',
  );

  const finalName = customName || schemaResult.name;
  const representationData = schemaResult.representationData;

  // 节点 + 成员边包进一个事务：之前先建节点再逐条建边，
  // 边创建中途失败（如成员节点被并发删除）会留下无成员边的孤儿 schema
  const schemaNode = await prisma.$transaction(async (tx) => {
    const node = await tx.knowledgeNode.create({
      data: {
        subjectId,
        title: finalName,
        summary: schemaResult.description,
        keywords: members.flatMap((member: SchemaMemberNode) => member.keywords || []).slice(0, 20),
        representationType: 'schema',
        representationData,
        difficulty: Math.round(members.reduce((sum: number, member: SchemaMemberNode) => sum + member.difficulty, 0) / members.length),
        cognitiveLoad: Math.round(members.reduce((sum: number, member: SchemaMemberNode) => sum + member.cognitiveLoad, 0) / members.length),
        icapLevel: 'Constructive',
        masteryLevel: Math.round(members.reduce((sum: number, member: SchemaMemberNode) => sum + member.masteryLevel, 0) / members.length),
      },
    });

    await Promise.all(
      members.map((member: SchemaMemberNode) =>
        tx.knowledgeEdge.create({
          data: {
            fromId: node.id,
            toId: member.id,
            relationType: 'schema_member',
            label: `Member of schema "${finalName}"`,
          },
        }),
      ),
    );

    return node;
  });

  const model = await resolveLlmModel(prisma);
  await prisma.aiGenerationLog.create({
    data: {
      generatorType: 'llm',
      model,
      prompt: `Build schema for ${members.map((member) => member.title).join(', ')}`.slice(0, 4000),
      response: JSON.stringify(schemaResult).slice(0, 4000),
      status: 'success',
    },
  });

  return {
    id: schemaNode.id,
    name: finalName,
    description: schemaResult.description,
    memberCount: members.length,
    representationData,
  };
}

export async function detectTransferOpportunities(
  schemaNodeId: string,
  prisma: PrismaClient,
): Promise<TransferOpportunity[]> {
  const schemaNode = await prisma.knowledgeNode.findUnique({
    where: { id: schemaNodeId },
    include: { subject: { select: { id: true, name: true } } },
  });
  if (!schemaNode) throw new Error(`Schema ${schemaNodeId} does not exist`);
  if (schemaNode.representationType !== 'schema') {
    throw new Error('This node is not a schema representation');
  }

  const memberEdges = await prisma.knowledgeEdge.findMany({
    where: { fromId: schemaNodeId, relationType: 'schema_member' },
    include: { to: { select: { id: true, title: true, summary: true, keywords: true } } },
  });
  const members = memberEdges.map((edge: { to: TransferMemberNode }) => edge.to);

  const allSubjects = await prisma.subject.findMany({
    select: { id: true, name: true },
  });

  const schemaData: SchemaRepresentationData = isSchemaRepresentationData(schemaNode.representationData)
    ? schemaNode.representationData
    : {
        schemaType: '',
        keyInsights: [],
        applicationScope: '',
        typicalExample: '',
        transferHints: '',
      };
  const otherSubjects = allSubjects.filter((item: SubjectSummary) => item.id !== schemaNode.subjectId);

  const memberLines = members.map(
    (member: TransferMemberNode) => `- ${member.title}: ${member.summary || ''} | keywords: ${member.keywords?.join(', ') || ''}`,
  );

  const result = await llmJson([
    {
      role: 'system',
      content: `You identify cross-domain transfer opportunities for a knowledge schema.
Return strict JSON: {"opportunities":[{"domain":"...","relevance":0.7,"explanation":"...","exampleApplication":"..."}]}.`,
    },
    {
      role: 'user',
      content: `Schema name: ${schemaNode.title}
Schema description: ${schemaNode.summary || ''}
Schema type: ${schemaData.schemaType || 'unknown'}
Key insights: ${schemaData.keyInsights.join('; ')}
Application scope: ${schemaData.applicationScope || 'unknown'}

Schema members:
${memberLines.join('\n')}

Source subject: ${schemaNode.subject?.name || 'unknown'}
Possible target subjects: ${otherSubjects.map((item: SubjectSummary) => item.name).join(', ')}`,
    },
  ]);

  return normalizeTransferOpportunities(result);
}
