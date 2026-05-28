import { llmCall } from '@/lib/llm-client';
import { prisma } from '@/lib/prisma';
import { SUBJECT_CONFIG, type SubjectName } from '@/types';

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
  | 'concept_map';

// ========== JSON 清洗 ==========
function sanitizeJson(str: string): string {
  let cleaned = str
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();
  // Remove markdown code fences
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  // Extract JSON object boundaries
  const startIdx = cleaned.indexOf('{');
  const endIdx = cleaned.lastIndexOf('}');
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    cleaned = cleaned.slice(startIdx, endIdx + 1);
  }
  return cleaned || '{}';
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
      maxTokens: 256,
      jsonMode: true,
    });

    const parsed = JSON.parse(sanitizeJson(result));
    const type = parsed.type?.trim() || 'concept_map';

    return type;
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
  "notes": "使用注意事项"
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
  "coordinateSystem": "以木块中心为原点，水平向右为x轴正向，竖直向上为y轴正向"
}`,
  },

  timeline: {
    systemPrompt: () => '你是一位资深历史教师。请为以下知识点生成时间线表征数据。',
    exampleJson: `{
  "period": "春秋战国时期",
  "events": [
    {"date": "公元前770年", "title": "周平王东迁", "description": "东周开始", "importance": 3},
    {"date": "公元前356年", "title": "商鞅变法", "description": "秦国开始变法图强", "importance": 3}
  ]
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
  ]
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
  "notes": "反应放出大量的热"
}`,
  },

  template: {
    systemPrompt: (subject: string) => `你是一位资深中学${subject}教师。请为以下知识点生成答题模板表征数据。`,
    exampleJson: `{
  "template": "解题步骤: 1. 审题提取关键信息 → 2. 结合知识点X分析 → 3. 套用公式/模板 → 4. 写出结论",
  "slots": ["关键信息", "对应公式"],
  "examples": ["例题1: 某年真题应用示例"]
}`,
  },

  comparison: {
    systemPrompt: (subject: string) => `你是一位资深中学${subject}教师。请为以下知识点生成对比表征数据。`,
    exampleJson: `{
  "dimensions": ["定义", "特点", "举例"],
  "items": [
    {"name": "事物A", "values": ["A的定义", "A的特点", "A的示例"]},
    {"name": "事物B", "values": ["B的定义", "B的特点", "B的示例"]}
  ]
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
  ]
}`,
  },

  step: {
    systemPrompt: (subject: string) => `你是一位资深中学${subject}教师。请为以下知识点生成步骤/流程表征数据。`,
    exampleJson: `{
  "formula": "总体描述",
  "steps": ["步骤1: ...", "步骤2: ...", "步骤3: ..."],
  "notes": "注意事项"
}`,
  },
};

/**
 * 使用 AI 生成具体的表征数据
 * @returns 根据 repType 返回对应的结构化数据
 */
export async function generateRepresentationContent(
  nodeTitle: string,
  nodeSummary: string,
  subject: string,
  repType: string,
): Promise<any> {
  const promptConfig =
    REPRESENTATION_PROMPTS[repType] || REPRESENTATION_PROMPTS.concept_map;

  const systemPrompt = `${promptConfig.systemPrompt(subject)}

请根据知识点内容，生成结构化的表征数据。严格按照以下JSON格式输出（字段名必须一致，不要添加额外字段）:

${promptConfig.exampleJson}

要求:
- 数据必须准确，符合中学教学内容
- 使用中文描述
- 如信息不足可根据教学经验合理补充`;

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

    const parsed = JSON.parse(sanitizeJson(result));
    return parsed;
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

    // 最终回退: 最少数据
    return {
      concepts: [{ name: nodeTitle, description: nodeSummary }],
      relations: [],
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
  repData: any,
  prismaClient?: any,
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
