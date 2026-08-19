import { llmCall } from '@/lib/llm-client';
import { prisma } from '@/lib/prisma';
import { sanitizeJsonString } from '@/lib/utils';
import { SUBJECT_CONFIG, type SubjectName } from '@/types';
import type { Prisma, PrismaClient } from '@prisma/client';

// ========== 表征类型 ==========
export type RepresentationType =
  | 'formula'
  | 'image'
  | 'step'
  | 'timeline'
  | 'causal'
  | 'force'
  | 'reaction'
  | 'mindmap'
  | 'template'
  | 'comparison'
  | 'concept_map'
  // Subject-specific tokens from SUBJECT_CONFIG[*].representationTypes
  // (src/types/index.ts). Required for 语文/物理/化学/历史/道法/地理/生物
  // to actually use their tuned representations instead of collapsing
  // to concept_map.
  | 'text' | 'poem' | 'essay' | 'classical'
  | 'concept' | 'experiment' | 'particle' | 'classification'
  | 'figure' | 'event'
  | 'keyword' | 'viewpoint'
  | 'map' | 'climate' | 'physical' | 'human' | 'regional'
  | 'process' | 'diagram';

const REPRESENTATION_TYPES: RepresentationType[] = [
  'formula',
  // 'image' 移出检测白名单：没有对应的生成器（prompt/normalize 都没有
  // image 分支），LLM 选了它会落库 concept_map 结构 + 'image' 标签，
  // 前端 RepresentationView 没有 image 渲染分支 → 渲染必坏。
  // 需要配图走的是 /api/image 按需生成链路，不是表征检测。
  'step',
  'timeline',
  'causal',
  'force',
  'reaction',
  'mindmap',
  'template',
  'comparison',
  'concept_map',
  // Subject-specific tokens defined in src/types/index.ts
  // SUBJECT_CONFIG[*].representationTypes. The engine previously only
  // accepted the 11 engine-level types above, so when the LLM returned
  // a subject-tuned type (e.g. 'text'/'poem' for 语文, 'map' for 地理,
  // 'process' for 生物, 'particle' for 化学), line 245's allowlist
  // check rejected it and silently fell back to 'concept_map' — making
  // 5 of 8 subjects visually indistinguishable from each other.
  'text', 'poem', 'essay', 'classical',          // 语文
  'concept', 'experiment', 'particle', 'classification', // 物理/化学/生物
  'figure', 'event',                              // 历史
  'keyword', 'viewpoint',                         // 道法
  'map', 'climate', 'physical', 'human', 'regional', // 地理
  'process', 'diagram',                           // 生物
];

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

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  // null/undefined 必须先回退：Number(null) === 0 会通过 isFinite 被钳到 min
  if (value == null) return fallback;
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function normalizeBoundary(value: unknown): string {
  return asString(value, 'This representation is a simplified learning aid and may not cover edge cases.');
}

function normalizeIndexedRelations(value: unknown, itemCount: number): Prisma.JsonArray {
  return asRecordArray(value)
    .map((relation) => {
      const from = typeof relation.from === 'number' ? Math.trunc(relation.from) : NaN;
      const to = typeof relation.to === 'number' ? Math.trunc(relation.to) : NaN;
      // 越界下标直接丢弃：钳位会把模型从未断言的关系静默接到错误概念上
      // （与 llm-client normalizeDecomposeKnowledgeResult 的策略一致）
      if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
      if (from < 0 || to < 0 || from >= itemCount || to >= itemCount || from === to) return null;
      return { from, to, label: asString(relation.label) };
    })
    .filter((relation): relation is { from: number; to: number; label: string } => relation !== null);
}

function normalizeRepresentationContent(
  repType: string,
  value: unknown,
  nodeTitle: string,
  nodeSummary: string,
): Prisma.InputJsonValue {
  const data = isRecord(value) ? value : {};

  if (repType === 'formula') {
    return {
      latex: asString(data.latex, nodeTitle),
      variables: asRecordArray(data.variables).map((variable) => ({
        symbol: asString(variable.symbol),
        name: asString(variable.name),
        unit: asString(variable.unit),
      })),
      steps: asStringArray(data.steps),
      notes: asString(data.notes),
      boundary: normalizeBoundary(data.boundary),
    };
  }

  if (repType === 'force') {
    return {
      body: asString(data.body, nodeTitle),
      forces: asRecordArray(data.forces).map((force) => ({
        name: asString(force.name),
        direction: asString(force.direction),
        magnitude: asString(force.magnitude),
      })),
      coordinateSystem: asString(data.coordinateSystem),
      boundary: normalizeBoundary(data.boundary),
    };
  }

  if (repType === 'timeline') {
    return {
      period: asString(data.period, nodeTitle),
      events: asRecordArray(data.events).map((event) => ({
        date: asString(event.date),
        title: asString(event.title),
        description: asString(event.description),
        importance: clampInt(event.importance, 1, 5, 3),
      })),
      boundary: normalizeBoundary(data.boundary),
    };
  }

  if (repType === 'causal') {
    const nodes = asRecordArray(data.nodes).map((node) => ({
      event: asString(node.event || node.name, nodeTitle),
      description: asString(node.description),
    }));
    return {
      nodes: nodes.length > 0 ? nodes : [{ event: nodeTitle, description: nodeSummary }],
      edges: normalizeIndexedRelations(data.edges, nodes.length || 1),
      boundary: normalizeBoundary(data.boundary),
    };
  }

  if (repType === 'reaction') {
    return {
      equation: asString(data.equation, nodeTitle),
      reactants: asStringArray(data.reactants),
      products: asStringArray(data.products),
      conditions: asString(data.conditions),
      type: asString(data.type),
      mechanism: asString(data.mechanism),
      notes: asString(data.notes),
      boundary: normalizeBoundary(data.boundary),
    };
  }

  if (repType === 'template') {
    return {
      template: asString(data.template, nodeSummary || nodeTitle),
      slots: asStringArray(data.slots),
      examples: asStringArray(data.examples),
      boundary: normalizeBoundary(data.boundary),
    };
  }

  if (repType === 'comparison') {
    return {
      dimensions: asStringArray(data.dimensions),
      items: asRecordArray(data.items).map((item) => ({
        name: asString(item.name),
        values: asStringArray(item.values),
      })),
      boundary: normalizeBoundary(data.boundary),
    };
  }

  if (repType === 'step') {
    return {
      formula: asString(data.formula, nodeTitle),
      steps: asStringArray(data.steps),
      notes: asString(data.notes),
      boundary: normalizeBoundary(data.boundary),
    };
  }

  const concepts = asRecordArray(data.concepts).map((concept) => ({
    name: asString(concept.name, nodeTitle),
    description: asString(concept.description),
  }));

  return {
    concepts: concepts.length > 0 ? concepts : [{ name: nodeTitle, description: nodeSummary }],
    relations: normalizeIndexedRelations(data.relations, concepts.length || 1),
    boundary: normalizeBoundary(data.boundary),
  };
}


// ========== 自动检测表征类型 ==========
/**
 * 使用 AI 自动检测知识点最适合的表征类型
 * 返回: formula/image/step/timeline/causal/force/reaction/mindmap/template/comparison/concept_map
 */
export async function detectRepresentationType(
  subject: string,
  nodeTitle: string,
  nodeSummary: string,
  keywords: string[],
): Promise<string> {
  const subjectConfig = SUBJECT_CONFIG[subject as SubjectName];
  const availableTypes = subjectConfig?.representationTypes ?? [];

  const systemPrompt = `你是一位教育技术专家，擅长为知识点选择最合适的可视化表征形式。
请根据学科、知识点内容和关键词，判断最佳的表征类型。

当前学科: ${subject}
该学科预定义的表征类型: ${availableTypes.join(', ')}

所有可选类型及判断规则:
- formula: 包含公式、方程式，或数理表达式
- image: 适合用静态图片/示意图表达
- step: 包含操作步骤、解题流程、实验步骤
- timeline: 包含时间顺序、历史事件进程
- causal: 包含因果关系、逻辑推导链、影响分析
- force: 包含受力分析、力的分解合成（物理）
- reaction: 包含化学反应方程式、条件、机理（化学）
- mindmap: 适合用思维导图展示概念层级
- template: 适合用答题模板、套路化表达（道法/语文）
- comparison: 适合用表格对比多个事物
- concept_map: 概念关系图，适合展示知识网络（默认）

输出严格JSON格式: {"type": "formula", "reason": "一句话说明选择理由"}`;

  try {
    const result = await llmCall({
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `知识点标题: ${nodeTitle}\n内容摘要: ${nodeSummary}\n关键词: ${keywords.join('、')}`,
        },
      ],
      temperature: 0.1,
      maxTokens: 512, // bumped from 256 — Chinese "reason" text + JSON wrapper can exceed 256 tokens and get truncated
      jsonMode: true,
    });

    let parsed: unknown;
    try {
      const cleaned = sanitizeJsonString(result);
      parsed = JSON.parse(cleaned);
    } catch {
      // JSON might be wrapped in ``` fences even with jsonMode=true,
      // or truncated. Try extracting just the JSON object.
      const m = result.match(/\{[^}]+\}/);
      if (m) {
        try { parsed = JSON.parse(m[0]); } catch { parsed = {}; }
      } else {
        parsed = {};
      }
    }
    const type = isRecord(parsed) && typeof parsed.type === 'string'
      ? parsed.type.trim()
      : 'concept_map';

    return REPRESENTATION_TYPES.includes(type as RepresentationType) ? type : 'concept_map';
  } catch (error) {
    console.error('[detectRepresentationType] AI call failed, fallback to concept_map:', error);
    return 'concept_map';
  }
}

// ========== AI 表征内容生成 ==========
/** 各表征类型的生成 prompt 和示例格式 */
const REPRESENTATION_PROMPTS: Record<
  string,
  { systemPrompt: (subject: string) => string; exampleJson: string }
> = {
  formula: {
    systemPrompt: (subject: string) =>
      `你是一位资深中学${subject}教师。请为以下知识点生成公式表征数据。`,
    exampleJson: `{
  "latex": "F = ma",
  "variables": [
    {"symbol": "F", "name": "力", "unit": "N"},
    {"symbol": "m", "name": "质量", "unit": "kg"},
    {"symbol": "a", "name": "加速度", "unit": "m/s²"}
  ],
  "steps": ["步骤1: 明确研究对象", "步骤2: 分析受力情况"],
  "notes": "使用注意事项",
  "boundary": "该公式仅适用于惯性参考系中的宏观低速运动，当速度接近光速或涉及微观粒子时不适用"
}`,
  },

  force: {
    systemPrompt: () => '你是一位资深中学物理教师。请为以下知识点生成受力分析表征数据。',
    exampleJson: `{
  "body": "水平桌面上的木块",
  "forces": [
    {"name": "重力", "direction": "down", "magnitude": "mg"},
    {"name": "支持力", "direction": "up", "magnitude": "N"},
    {"name": "推力", "direction": "right", "magnitude": "F"}
  ],
  "coordinateSystem": "以木块中心为原点，水平向右为x轴正向，竖直向上为y轴正向",
  "boundary": "该受力分析基于简化的质点模型和光滑接触面假设，当物体不能简化为质点或接触面存在复杂摩擦时不适用"
}`,
  },

  timeline: {
    systemPrompt: () => '你是一位资深历史教师。请为以下知识点生成时间线表征数据。',
    exampleJson: `{
  "period": "春秋战国时期",
  "events": [
    {"date": "公元前770年", "title": "周平王东迁", "description": "东周开始", "importance": 3},
    {"date": "公元前356年", "title": "商鞅变法", "description": "秦国开始变法图强", "importance": 3}
  ],
  "boundary": "该时间线仅包含关键节点事件，忽略了许多复杂的中小事件和地区差异，对于微观史学分析不适用"
}`,
  },

  causal: {
    systemPrompt: (subject: string) => `你是一位资深中学${subject}教师。请为以下知识点生成因果链表征数据。`,
    exampleJson: `{
  "nodes": [
    {"event": "原因/条件A", "description": "详细说明"},
    {"event": "原因/条件B", "description": "详细说明"},
    {"event": "结果C", "description": "最终结果"}
  ],
  "edges": [
    {"from": 0, "to": 2, "label": "导致"},
    {"from": 1, "to": 2, "label": "引发"}
  ],
  "boundary": "该因果链只表示了主要的直接因果关系，省略了间接因素和反事实情况，在涉及多因素交互的复杂系统时不适用"
}`,
  },

  reaction: {
    systemPrompt: () => '你是一位资深中学化学教师。请为以下知识点生成化学反应表征数据。',
    exampleJson: `{
  "equation": "2H₂ + O₂ → 2H₂O",
  "reactants": ["H₂", "O₂"],
  "products": ["H₂O"],
  "conditions": "点燃",
  "type": "synthesis",
  "mechanism": "氢气在氧气中燃烧，发生化合反应生成水",
  "notes": "反应放出大量的热",
  "boundary": "该反应式表示的是理想条件下的总反应，未包含中间自由基反应步骤，在非标准条件或涉及副反应时不适用"
}`,
  },

  template: {
    systemPrompt: (subject: string) => `你是一位资深中学${subject}教师。请为以下知识点生成答题模板表征数据。`,
    exampleJson: `{
  "template": "解题步骤: 1. 审题提取关键信息 → 2. 结合知识点X分析 → 3. 套用公式/模板 → 4. 写出结论",
  "slots": ["关键信息", "对应公式"],
  "examples": ["例题1: 某年真题应用示例"],
  "boundary": "该答题模板适用于标准题型，当题目出现非典型表述、组合多个知识点或开放性设问时模板可能不完全适用"
}`,
  },

  comparison: {
    systemPrompt: (subject: string) => `你是一位资深中学${subject}教师。请为以下知识点生成对比表征数据。`,
    exampleJson: `{
  "dimensions": ["定义", "特点", "举例"],
  "items": [
    {"name": "事物A", "values": ["A的定义", "A的特点", "A的示例"]},
    {"name": "事物B", "values": ["B的定义", "B的特点", "B的示例"]}
  ],
  "boundary": "该对比只覆盖了选定的维度，对于未列出的维度或事物的边缘情况，对比表可能不够全面"
}`,
  },

  concept_map: {
    systemPrompt: (subject: string) => `你是一位资深中学${subject}教师。请为以下知识点生成概念关系图表征数据。`,
    exampleJson: `{
  "concepts": [
    {"name": "核心概念", "description": "概念简要说明"},
    {"name": "子概念1", "description": "与核心概念的关系说明"},
    {"name": "子概念2", "description": "与核心概念的关系说明"}
  ],
  "relations": [
    {"from": 0, "to": 1, "label": "包含"},
    {"from": 0, "to": 2, "label": "衍生"}
  ],
  "boundary": "该概念图展示的是中学阶段的核心知识关系，省略了更深层的学术细节，当涉及学科前沿或跨学科交叉时不适用"
}`,
  },

  step: {
    systemPrompt: (subject: string) => `你是一位资深中学${subject}教师。请为以下知识点生成步骤/流程表征数据。`,
    exampleJson: `{
  "formula": "总体描述",
  "steps": ["步骤1: ...", "步骤2: ...", "步骤3: ..."],
  "notes": "注意事项",
  "boundary": "该步骤流程针对标准情况设计，当遇到特殊情况、参数变化或需要跳步的变体问题时可能不再适用"
}`,
  },
};

/**
 * 使用 AI 生成具体的表征数据
 * @returns 实际生效的类型 + 对应结构化数据。生成失败回退 concept_map 时
 *          返回类型也变为 'concept_map'——调用方必须保存返回的类型，
 *          否则库里出现 representationType='formula' 配 concept_map
 *          结构的脏数据，前端按类型读取字段必坏。
 */
export async function generateRepresentationContent(
  nodeTitle: string,
  nodeSummary: string,
  subject: string,
  repType: string,
): Promise<{ type: string; data: Prisma.InputJsonValue; failed?: boolean }> {
  // 'image' 没有生成器（无 prompt 模板、前端无渲染分支）：即使调用方显式
  // 传入也按 concept_map 生成并落 concept_map 标签，保证类型与数据一致
  if (repType === 'image') {
    repType = 'concept_map';
  }
  const promptConfig =
    REPRESENTATION_PROMPTS[repType] || REPRESENTATION_PROMPTS.concept_map;

  const systemPrompt = `${promptConfig.systemPrompt(subject)}

请根据知识点内容，生成结构化的表征数据。严格按照以下JSON格式输出（字段名必须一致，不要添加额外字段）:

${promptConfig.exampleJson}

要求:
- 数据必须准确，符合中学教学内容
- 使用中文描述
- 如信息不足可根据教学经验合理补充
- 必须在 boundary 字段中描述该表征在什么条件下不适用或会失效（指出模型的假设条件和局限性，以"该..."开头）`;

  try {
    const result = await llmCall({
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `知识点标题: ${nodeTitle}\n内容摘要: ${nodeSummary}\n学科: ${subject}`,
        },
      ],
      temperature: 0.3,
      maxTokens: 4096,
      jsonMode: true,
    });

    const parsed = JSON.parse(sanitizeJsonString(result)) as unknown;
    return {
      type: repType,
      data: normalizeRepresentationContent(repType, parsed, nodeTitle, nodeSummary),
    };
  } catch (error) {
    console.error('[generateRepresentationContent] AI generation failed:', error);

    // 如果当前类型失败，回退到 concept_map 重试一次 (但 concept_map 自身不再回退)
    if (repType !== 'concept_map') {
      try {
        console.log(
          `[generateRepresentationContent] Falling back to concept_map for "${nodeTitle}"`,
        );
        return await generateRepresentationContent(
          nodeTitle,
          nodeSummary,
          subject,
          'concept_map',
        );
      } catch {
        // 彻底失败，返回最小回退数据
      }
    }

    // 最终回退: 最少数据。failed 标记给调用方：这种兜底数据不应落库缓存
    // （否则一次 LLM 故障产生的空壳会被缓存层永久返回）
    return {
      type: 'concept_map',
      data: {
        concepts: [{ name: nodeTitle, description: nodeSummary }],
        relations: [],
      },
      failed: true,
    };
  }
}

// ========== 保存表征数据 ==========
/**
 * 将表征类型和数据保存到 KnowledgeNode
 */
export async function saveRepresentation(
  nodeId: string,
  repType: string,
  repData: Prisma.InputJsonValue,
  prismaClient?: PrismaClient,
): Promise<void> {
  const db = prismaClient || prisma;
  await db.knowledgeNode.update({
    where: { id: nodeId },
    data: {
      representationType: repType,
      representationData: repData,
    },
  });
}
