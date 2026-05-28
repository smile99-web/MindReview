import { llmCall } from '@/lib/llm-client';

// ========== LOCAL COPY of sanitizeJsonString (not exported from llm-client.ts) ==========
function sanitizeJsonString(str: string): string {
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, (ch) => {
    if (ch === '\n') return '\\n';
    if (ch === '\r') return '\\r';
    if (ch === '\t') return '\\t';
    if (ch === '\b') return '\\b';
    if (ch === '\f') return '\\f';
    return '\\u' + ('000' + ch.charCodeAt(0).toString(16)).slice(-4);
  });
}

// ========== TYPES ==========

export interface SocraticDialogueParams {
  studentMessage: string;
  knowledgeNodeTitle: string;
  knowledgeNodeSummary: string;
  subject: string;
  history: Array<{ role: string; content: string }>;
  userId: string;
}

export interface SocraticDialogueResult {
  tutorReply: string;
  questions: string[];
  insights: string[];
  suggestedAction: 'continue' | 'move_on' | 'review_basics' | 'challenge' | 'summarize';
  understandingLevel: 'confused' | 'superficial' | 'developing' | 'proficient' | 'mastered';
}

export interface AssessIcapLevelResult {
  recommendedLevel: 'Passive' | 'Active' | 'Constructive' | 'Interactive';
  reasoning: string;
  prerequisiteGaps: string[];
}

export interface DetectCognitiveGapsResult {
  hasGaps: boolean;
  gaps: Array<{
    category: 'missing_concept' | 'superficial_understanding' | 'inability_to_transfer' | 'misconception';
    description: string;
    suggestion: string;
  }>;
  overallAssessment: string;
}

// ========== SOCRATIC DIALOGUE ==========

const SOCRATIC_SYSTEM_PROMPT = `你是一位苏格拉底式教师（Socratic Tutor），你的教学法核心是：

1. **绝不直接给出答案** — 通过追问引导学生自己发现答案。
2. **认知冲突法** — 当学生给出错误理解时，构造一个反例或矛盾场景使其意识到自己的认知漏洞。
3. **分层追问** — 第一层检查事实理解，第二层检查概念间联系，第三层检查迁移应用能力。
4. **自我纠正引导** — 当发现问题后，不是指出错误，而是通过"如果……那么……"式的假设性提问让学生自己修正。
5. **积极反馈** — 对学生的正确思路给予肯定，但始终保留下一个探询性问题。

你需要同时判断学生的当前理解水平（confused/superficial/developing/proficient/mastered）并据此调整提问深度。

输出严格JSON格式：
{
  "tutorReply": "你的回复内容（中文，自然对话语气，200字以内）",
  "questions": ["后续追问问题1", "追问问题2", "追问问题3"],
  "insights": ["关于学生理解情况的观察1", "观察2"],
  "suggestedAction": "continue | move_on | review_basics | challenge | summarize",
  "understandingLevel": "confused | superficial | developing | proficient | mastered"
}

suggestedAction 含义：
- continue: 继续当前知识点的苏格拉底对话
- move_on: 学生对当前知识点理解较好，可以进入下一个知识点
- review_basics: 学生的前置知识有缺陷，建议回顾基础
- challenge: 学生对当前知识点掌握良好，可以给出更高难度的挑战题
- summarize: 建议学生对当前学习内容进行总结归纳
`;

/**
 * Multi-turn Socratic questioning engine.
 * Uses cognitive conflict technique to guide self-correction.
 * Detects understanding level and adapts questioning depth.
 */
export async function socraticDialogue(
  params: SocraticDialogueParams,
): Promise<SocraticDialogueResult> {
  const { studentMessage, knowledgeNodeTitle, knowledgeNodeSummary, subject, history } = params;

  // Build conversation context from history
  const conversationContext = history.length > 0
    ? history.map((m) => `${m.role === 'user' ? '学生' : '教师'}: ${m.content}`).join('\n\n')
    : '';

  const userPrompt = `## 当前知识点
标题：${knowledgeNodeTitle}
摘要：${knowledgeNodeSummary}
学科：${subject}

## 对话历史
${conversationContext || '（无历史，这是第一轮对话）'}

## 学生最新发言
${studentMessage}

请以苏格拉底式教学法回应。`;

  const result = await llmCall({
    messages: [
      { role: 'system', content: SOCRATIC_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    maxTokens: 2048,
    jsonMode: true,
  });

  const parsed = JSON.parse(sanitizeJsonString(result)) as SocraticDialogueResult;

  // Validate and provide defaults
  return {
    tutorReply: parsed.tutorReply || '能再说说你的理解吗？',
    questions: Array.isArray(parsed.questions) ? parsed.questions : [],
    insights: Array.isArray(parsed.insights) ? parsed.insights : [],
    suggestedAction: ['continue', 'move_on', 'review_basics', 'challenge', 'summarize'].includes(
      parsed.suggestedAction,
    )
      ? parsed.suggestedAction
      : 'continue',
    understandingLevel: [
      'confused',
      'superficial',
      'developing',
      'proficient',
      'mastered',
    ].includes(parsed.understandingLevel)
      ? parsed.understandingLevel
      : 'superficial',
  };
}

// ========== ICAP LEVEL ASSESSMENT ==========

const ICAP_ASSESS_SYSTEM_PROMPT = `你是一位学习评估专家，需要根据学生的前置知识指标评估其适合的ICAP学习层级。

ICAP框架（Chi & Wylie, 2014）：
- Passive（被动学习）: 阅读材料、观看讲解。适用于完全无前置知识的新手。
- Active（主动学习）: 填空、选择、判断、回忆定义。适用于有基本概念但零散的学生。
- Constructive（构建学习）: 总结归纳、画图、解释推理。适用于有系统理解的学生。
- Interactive（互动学习）: 苏格拉底追问、变式题、协同推理。适用于已掌握并能迁移的学生。

评估依据：
1. 知识点标题与摘要的难度和复杂度
2. 学生的当前掌握度 (masteryLevel: 0-100)
3. 学生在相关前置问题上的表现

输出严格JSON格式：
{
  "recommendedLevel": "Passive | Active | Constructive | Interactive",
  "reasoning": "推荐理由的中文说明（100-150字）",
  "prerequisiteGaps": ["发现的前置知识缺口1", "缺口2"]
}`;

/**
 * Determines the starting ICAP level based on prior knowledge indicators.
 * Analyzes node difficulty, mastery level, and prior question performance.
 */
export async function assessIcapLevel(
  nodeTitle: string,
  nodeSummary: string,
  masteryLevel: number,
  priorQuestions: Array<{ stem: string; answer: string; isCorrect: boolean }>,
): Promise<AssessIcapLevelResult> {
  const correctCount = priorQuestions.filter((q) => q.isCorrect).length;
  const totalCount = priorQuestions.length;
  const accuracy = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : null;

  const questionsSummary =
    totalCount > 0
      ? priorQuestions
          .map(
            (q, i) =>
              `${i + 1}. 题目: ${q.stem}\n   正确答案: ${q.answer}\n   学生答对: ${q.isCorrect ? '是' : '否'}`,
          )
          .join('\n')
      : '（无前置答题记录）';

  const userPrompt = `## 知识点信息
标题：${nodeTitle}
摘要：${nodeSummary}

## 学生数据
掌握度: ${masteryLevel}/100
前置题目正确率: ${accuracy !== null ? `${accuracy}%（${correctCount}/${totalCount}）` : '无数据'}

## 前置题目详情
${questionsSummary}

请根据以上信息评估适合的ICAP层级。`;

  const result = await llmCall({
    messages: [
      { role: 'system', content: ICAP_ASSESS_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    maxTokens: 1024,
    jsonMode: true,
  });

  const parsed = JSON.parse(sanitizeJsonString(result)) as AssessIcapLevelResult;

  return {
    recommendedLevel: ['Passive', 'Active', 'Constructive', 'Interactive'].includes(
      parsed.recommendedLevel,
    )
      ? parsed.recommendedLevel
      : 'Active',
    reasoning: parsed.reasoning || '根据掌握度和前置题表现综合判断。',
    prerequisiteGaps: Array.isArray(parsed.prerequisiteGaps) ? parsed.prerequisiteGaps : [],
  };
}

// ========== COGNITIVE GAP DETECTION ==========

const GAP_DETECTION_SYSTEM_PROMPT = `你是一位认知诊断专家，负责分析学生的知识解释，识别认知缺口。

你需要检测以下四类认知缺口：
1. missing_concept（缺失概念）: 学生的解释中缺少关键概念或重要知识点。
2. superficial_understanding（表层理解）: 学生只能复述定义，无法深入解释原理或机制。
3. inability_to_transfer（迁移困难）: 学生无法将知识应用到新情境或变式问题。
4. misconception（误解）: 学生的理解存在错误或混淆，与正确概念相悖。

对于每种发现的缺口，给出具体描述和改进建议。

如果学生解释较为完整准确，hasGaps 应为 false。

输出严格JSON格式：
{
  "hasGaps": true,
  "gaps": [
    {
      "category": "missing_concept | superficial_understanding | inability_to_transfer | misconception",
      "description": "具体缺失/错误描述（中文，50-100字）",
      "suggestion": "改进建议（中文，50-100字）"
    }
  ],
  "overallAssessment": "总体评价（中文，100-200字）"
}`;

/**
 * Analyzes a student's explanation for missing concepts, superficial understanding,
 * and inability to transfer knowledge.
 */
export async function detectCognitiveGaps(
  studentExplanation: string,
  nodeTitle: string,
  nodeSummary: string,
): Promise<DetectCognitiveGapsResult> {
  const userPrompt = `## 知识点
标题：${nodeTitle}
标准摘要：${nodeSummary}

## 学生解释
${studentExplanation}

请分析该解释中存在的认知缺口。`;

  const result = await llmCall({
    messages: [
      { role: 'system', content: GAP_DETECTION_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    maxTokens: 2048,
    jsonMode: true,
  });

  const parsed = JSON.parse(sanitizeJsonString(result)) as DetectCognitiveGapsResult;

  return {
    hasGaps: typeof parsed.hasGaps === 'boolean' ? parsed.hasGaps : true,
    gaps: Array.isArray(parsed.gaps)
      ? parsed.gaps.map((g: any) => ({
          category: [
            'missing_concept',
            'superficial_understanding',
            'inability_to_transfer',
            'misconception',
          ].includes(g.category)
            ? g.category
            : 'superficial_understanding',
          description: g.description || '',
          suggestion: g.suggestion || '',
        }))
      : [],
    overallAssessment: parsed.overallAssessment || '无法完成评估。',
  };
}
