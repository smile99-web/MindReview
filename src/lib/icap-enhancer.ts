import { getErrorMessage } from '@/lib/errors';
/**
 * ICAP Enhancement Engine
 *
 * Provides AI-powered enhancements for the Constructive and Interactive stages
 * of the ICAP pipeline. All functions sanitize LLM JSON responses before parsing.
 */

import { llmCall } from '@/lib/llm-client';
import { sanitizeJsonString } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConstructiveTask {
  selfExplanationPrompts: SelfExplanationPrompt[];
  evaluationCriteria: EvaluationCriterion[];
  knowledgeMapTemplate: string;
}

export interface SelfExplanationPrompt {
  id: string;
  prompt: string;
  category: 'concept' | 'application' | 'connection' | 'contrast';
  expectedLength: 'short' | 'medium' | 'long';
}

export interface EvaluationCriterion {
  id: string;
  criterion: string;
  weight: number; // 0-1, all weights sum to 1
  description: string;
}

export interface InteractiveTask {
  socraticQuestions: SocraticQuestion[];
  variantQuestions: VariantQuestion[];
  scenarioChallenges: ScenarioChallenge[];
}

export interface SocraticQuestion {
  id: string;
  round: number;
  question: string;
  expectedConcepts: string[];
  difficulty: number; // 1-5
  followUpIfStuck: string;
  followUpIfCorrect: string;
}

export interface VariantQuestion {
  id: string;
  stem: string;
  options?: Array<{ label: string; text: string }>;
  answer: string;
  explanation: string;
  difficulty: number;
  variantOf: string; // describes what was changed from the original
}

export interface ScenarioChallenge {
  id: string;
  scenario: string;
  task: string;
  rubric: string[];
  difficulty: number;
}

export interface ValidationResult {
  score: number; // 0-100
  comprehensionLevel: 'poor' | 'basic' | 'good' | 'excellent';
  missingElements: string[];
  misconceptions: Misconception[];
  strengths: string[];
  suggestions: string[];
}

export interface Misconception {
  concept: string;
  studentSaid: string;
  correction: string;
  severity: 'minor' | 'moderate' | 'critical';
}

export interface ProgressionDecision {
  currentLevel: string;
  recommendedLevel: string;
  shouldAdvance: boolean;
  shouldRegress: boolean;
  reason: string;
  confidence: number; // 0-1
}

// ---------------------------------------------------------------------------
// JSON sanitization utilities
// ---------------------------------------------------------------------------

/**
 * Safely parse a JSON string with a typed fallback.
 */
function safeJsonParse<T>(raw: string, fallback: T, context?: string): T {
  const cleaned = sanitizeJsonString(raw);
  try {
    return JSON.parse(cleaned) as T;
  } catch (error: unknown) {
    console.error(
      `[icap-enhancer] JSON parse error${context ? ` (${context})` : ''}:`,
      getErrorMessage(error),
      '\nSanitized input (first 500 chars):',
      cleaned.slice(0, 500),
    );
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Validators (runtime type checks after JSON parse)
// ---------------------------------------------------------------------------

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

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  return Math.round(clampNumber(value, min, max, fallback));
}

function normalizePromptCategory(value: unknown): SelfExplanationPrompt['category'] {
  const category = asString(value);
  return ['concept', 'application', 'connection', 'contrast'].includes(category)
    ? (category as SelfExplanationPrompt['category'])
    : 'concept';
}

function normalizeExpectedLength(value: unknown): SelfExplanationPrompt['expectedLength'] {
  const expectedLength = asString(value);
  return ['short', 'medium', 'long'].includes(expectedLength)
    ? (expectedLength as SelfExplanationPrompt['expectedLength'])
    : 'medium';
}

function normalizeSeverity(value: unknown): Misconception['severity'] {
  const severity = asString(value);
  return ['minor', 'moderate', 'critical'].includes(severity)
    ? (severity as Misconception['severity'])
    : 'minor';
}

function normalizeComprehensionLevel(value: unknown, score: number): ValidationResult['comprehensionLevel'] {
  const level = asString(value);
  if (['poor', 'basic', 'good', 'excellent'].includes(level)) {
    return level as ValidationResult['comprehensionLevel'];
  }
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 50) return 'basic';
  return 'poor';
}

function normalizeConstructiveTask(value: unknown, fallback: ConstructiveTask): ConstructiveTask {
  const root = isRecord(value) ? value : {};
  const selfExplanationPrompts = Array.isArray(root.selfExplanationPrompts)
    ? root.selfExplanationPrompts
        .filter(isRecord)
        .map((prompt, index): SelfExplanationPrompt => ({
          id: asString(prompt.id, `sep-${index + 1}`),
          prompt: asString(prompt.prompt),
          category: normalizePromptCategory(prompt.category),
          expectedLength: normalizeExpectedLength(prompt.expectedLength),
        }))
        .filter((prompt) => prompt.prompt.length > 0)
    : [];

  const evaluationCriteria = Array.isArray(root.evaluationCriteria)
    ? root.evaluationCriteria
        .filter(isRecord)
        .map((criterion, index): EvaluationCriterion => ({
          id: asString(criterion.id, `ec-${index + 1}`),
          criterion: asString(criterion.criterion),
          weight: clampNumber(criterion.weight, 0, 1, 0),
          description: asString(criterion.description),
        }))
        .filter((criterion) => criterion.criterion.length > 0)
    : [];

  return {
    selfExplanationPrompts: selfExplanationPrompts.length > 0
      ? selfExplanationPrompts
      : fallback.selfExplanationPrompts,
    evaluationCriteria: evaluationCriteria.length > 0
      ? evaluationCriteria
      : fallback.evaluationCriteria,
    knowledgeMapTemplate: asString(root.knowledgeMapTemplate, fallback.knowledgeMapTemplate),
  };
}

function normalizeInteractiveTask(value: unknown, fallback: InteractiveTask): InteractiveTask {
  const root = isRecord(value) ? value : {};
  const socraticQuestions = Array.isArray(root.socraticQuestions)
    ? root.socraticQuestions
        .filter(isRecord)
        .map((question, index): SocraticQuestion => ({
          id: asString(question.id, `sq-${index + 1}`),
          round: clampInt(question.round, 1, 10, index + 1),
          question: asString(question.question),
          expectedConcepts: asStringArray(question.expectedConcepts),
          difficulty: clampInt(question.difficulty, 1, 5, 3),
          followUpIfStuck: asString(question.followUpIfStuck),
          followUpIfCorrect: asString(question.followUpIfCorrect),
        }))
        .filter((question) => question.question.length > 0)
    : [];

  const variantQuestions = Array.isArray(root.variantQuestions)
    ? root.variantQuestions
        .filter(isRecord)
        .map((question, index): VariantQuestion => ({
          id: asString(question.id, `vq-${index + 1}`),
          stem: asString(question.stem),
          options: Array.isArray(question.options)
            ? question.options
                .filter(isRecord)
                .map((option, optionIndex) => ({
                  label: asString(option.label, String.fromCharCode(65 + optionIndex)),
                  text: asString(option.text),
                }))
                .filter((option) => option.text.length > 0)
            : undefined,
          answer: asString(question.answer),
          explanation: asString(question.explanation),
          difficulty: clampInt(question.difficulty, 1, 5, 3),
          variantOf: asString(question.variantOf),
        }))
        .filter((question) => question.stem.length > 0 && question.answer.length > 0)
    : [];

  const scenarioChallenges = Array.isArray(root.scenarioChallenges)
    ? root.scenarioChallenges
        .filter(isRecord)
        .map((challenge, index): ScenarioChallenge => ({
          id: asString(challenge.id, `sc-${index + 1}`),
          scenario: asString(challenge.scenario),
          task: asString(challenge.task),
          rubric: asStringArray(challenge.rubric),
          difficulty: clampInt(challenge.difficulty, 1, 5, 3),
        }))
        .filter((challenge) => challenge.scenario.length > 0 && challenge.task.length > 0)
    : [];

  return {
    socraticQuestions: socraticQuestions.length > 0 ? socraticQuestions : fallback.socraticQuestions,
    variantQuestions: variantQuestions.length > 0 ? variantQuestions : fallback.variantQuestions,
    scenarioChallenges: scenarioChallenges.length > 0 ? scenarioChallenges : fallback.scenarioChallenges,
  };
}

function normalizeValidationResult(value: unknown): ValidationResult {
  const root = isRecord(value) ? value : {};
  const fallback = getDefaultValidationResult();
  const score = clampInt(root.score, 0, 100, fallback.score);
  const misconceptions = Array.isArray(root.misconceptions)
    ? root.misconceptions
        .filter(isRecord)
        .map((misconception): Misconception => ({
          concept: asString(misconception.concept),
          studentSaid: asString(misconception.studentSaid),
          correction: asString(misconception.correction),
          severity: normalizeSeverity(misconception.severity),
        }))
        .filter((misconception) => misconception.concept.length > 0 || misconception.correction.length > 0)
    : [];

  return {
    score,
    comprehensionLevel: normalizeComprehensionLevel(root.comprehensionLevel, score),
    missingElements: asStringArray(root.missingElements),
    misconceptions,
    strengths: asStringArray(root.strengths),
    suggestions: asStringArray(root.suggestions),
  };
}

function isValidConstructiveTask(obj: unknown): obj is ConstructiveTask {
  return (
    isRecord(obj) &&
    Array.isArray(obj.selfExplanationPrompts) &&
    Array.isArray(obj.evaluationCriteria) &&
    typeof obj.knowledgeMapTemplate === 'string'
  );
}

function isValidInteractiveTask(obj: unknown): obj is InteractiveTask {
  return (
    isRecord(obj) &&
    Array.isArray(obj.socraticQuestions) &&
    Array.isArray(obj.variantQuestions)
  );
}

function isValidValidationResult(obj: unknown): obj is ValidationResult {
  return (
    isRecord(obj) &&
    typeof obj.score === 'number' &&
    Array.isArray(obj.missingElements) &&
    Array.isArray(obj.misconceptions) &&
    Array.isArray(obj.suggestions)
  );
}

// ---------------------------------------------------------------------------
// Fallback data generators (used when LLM fails or returns invalid JSON)
// ---------------------------------------------------------------------------

function getDefaultConstructiveTask(
  nodeTitle: string,
  nodeSummary: string,
): ConstructiveTask {
  return {
    selfExplanationPrompts: [
      {
        id: 'sep-1',
        prompt: `请用你自己的话解释"${nodeTitle}"这个概念，不要直接复述课本定义。`,
        category: 'concept',
        expectedLength: 'medium',
      },
      {
        id: 'sep-2',
        prompt: `"${nodeTitle}"在现实生活或解题中有什么应用？请举例说明。`,
        category: 'application',
        expectedLength: 'medium',
      },
      {
        id: 'sep-3',
        prompt: `"${nodeTitle}"和你之前学过的哪些知识有关联？请画出它们之间的关系。`,
        category: 'connection',
        expectedLength: 'long',
      },
      {
        id: 'sep-4',
        prompt: `如果有人误解了"${nodeTitle}"，常见的错误理解是什么？你会如何纠正？`,
        category: 'contrast',
        expectedLength: 'short',
      },
    ],
    evaluationCriteria: [
      {
        id: 'ec-1',
        criterion: '核心概念是否准确表述',
        weight: 0.35,
        description: '检查核心定义是否准确，关键术语使用是否正确',
      },
      {
        id: 'ec-2',
        criterion: '是否使用了自己的语言',
        weight: 0.25,
        description: '检查是否有自己的理解和转述，而不是照搬原文',
      },
      {
        id: 'ec-3',
        criterion: '是否建立了知识联系',
        weight: 0.20,
        description: '检查是否能举一反三，联系到其他知识点',
      },
      {
        id: 'ec-4',
        criterion: '逻辑是否清晰完整',
        weight: 0.20,
        description: '检查解释的逻辑结构、因果链条是否合理',
      },
    ],
    knowledgeMapTemplate: `中心概念: ${nodeTitle}\n内容要点: ${nodeSummary}`,
  };
}

function getDefaultInteractiveTask(
  nodeTitle: string,
  subject: string,
): InteractiveTask {
  return {
    socraticQuestions: [
      {
        id: 'sq-1',
        round: 1,
        question: `你是怎么理解"${nodeTitle}"的？能否用一个简单的例子来说明？`,
        expectedConcepts: ['基本定义', '直观理解'],
        difficulty: 1,
        followUpIfStuck: `没关系，我们先从字面意思开始。你觉得"${nodeTitle}"这个词大概是什么意思？`,
        followUpIfCorrect: '很好！那如果条件稍作改变，这个理解还成立吗？',
      },
      {
        id: 'sq-2',
        round: 2,
        question: `"${nodeTitle}"和其他相关概念有什么异同？能不能做一个对比？`,
        expectedConcepts: ['概念对比', '辨析'],
        difficulty: 2,
        followUpIfStuck: '想想看，有没有一个和它相近但又不同的概念？',
        followUpIfCorrect: '那么在实际解题中，如何快速区分它们？',
      },
      {
        id: 'sq-3',
        round: 3,
        question: `如果出一道关于"${nodeTitle}"的${subject}题考别人，你会出什么题目？请设计并解答。`,
        expectedConcepts: ['知识应用', '题目设计', '解题思路'],
        difficulty: 3,
        followUpIfStuck: '你可以想想做过的练习题中，哪些涉及了这个知识点？',
        followUpIfCorrect: '你能再出一道变式题吗？把已知条件和未知条件互换一下。',
      },
    ],
    variantQuestions: [
      {
        id: 'vq-1',
        stem: `在原题基础上，将"${nodeTitle}"的核心条件改为相反情况，结果会变成什么？`,
        answer: '根据条件变化，结论会相应地反转/变化。',
        explanation: '变式训练帮助学生理解条件与结论之间的因果关系，避免死记硬背。',
        difficulty: 2,
        variantOf: '基础练习',
      },
    ],
    scenarioChallenges: [
      {
        id: 'sc-1',
        scenario: `假设你是${subject}老师，要给低年级学生讲"${nodeTitle}"，你会怎么讲？`,
        task: '设计一个3分钟的微课讲解方案（不需要写逐字稿，列出要点即可）',
        rubric: ['概念引入是否生动', '逻辑是否清晰', '是否有互动设计', '是否联系实际'],
        difficulty: 3,
      },
    ],
  };
}

function getDefaultValidationResult(): ValidationResult {
  return {
    score: 50,
    comprehensionLevel: 'basic',
    missingElements: ['无法评估（AI评估系统未返回有效结果）'],
    misconceptions: [],
    strengths: [],
    suggestions: ['请重试或手动评估'],
  };
}

// ---------------------------------------------------------------------------
// Core Functions
// ---------------------------------------------------------------------------

/**
 * Design a Constructive-level task for a knowledge node.
 *
 * Generates self-explanation prompts and evaluation criteria tailored to the
 * specific knowledge point and subject.
 */
export async function designConstructiveTask(
  nodeTitle: string,
  nodeSummary: string | null,
  subject: string,
): Promise<ConstructiveTask> {
  const systemPrompt = `你是一位中学${subject}教育专家，擅长设计ICAP框架下的"构建学习"(Constructive)任务。

请根据给定的知识点设计构建学习任务。输出严格JSON格式：

{
  "selfExplanationPrompts": [
    {
      "id": "sep-1",
      "prompt": "自我解释提示语（引导学生用自己的话解释概念）",
      "category": "concept|application|connection|contrast",
      "expectedLength": "short|medium|long"
    }
  ],
  "evaluationCriteria": [
    {
      "id": "ec-1",
      "criterion": "评价标准名称",
      "weight": 0.25,
      "description": "该标准的具体说明"
    }
  ],
  "knowledgeMapTemplate": "知识结构模板（引导学生画出概念之间的联系）"
}

设计原则：
- selfExplanationPrompts 应包含4个不同维度的提示：概念理解(concept)、应用举例(application)、知识联系(connection)、对比辨析(contrast)
- expectedLength: short=一句话, medium=一段话(50-100字), long=多段话
- evaluationCriteria 应有4-5条，所有权重之和必须等于1.0
- knowledgeMapTemplate 提供一个结构框架，留空让学生填充`;

  const userPrompt = `知识点标题：${nodeTitle}
知识点解释：${nodeSummary || '暂无详细解释'}
学科：${subject}`;

  try {
    const raw = await llmCall({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.5,
      maxTokens: 3072,
      jsonMode: true,
    });

    const parsed = normalizeConstructiveTask(safeJsonParse<unknown>(
      raw,
      getDefaultConstructiveTask(nodeTitle, nodeSummary || ''),
      `designConstructiveTask: ${nodeTitle}`,
    ), getDefaultConstructiveTask(nodeTitle, nodeSummary || ''));

    if (!isValidConstructiveTask(parsed)) {
      console.warn('[icap-enhancer] LLM returned invalid ConstructiveTask structure, using fallback');
      return getDefaultConstructiveTask(nodeTitle, nodeSummary || '');
    }

    // Normalize weights to sum to 1.0
    if (parsed.evaluationCriteria.length > 0) {
      const totalWeight = parsed.evaluationCriteria.reduce((sum, c) => sum + (c.weight || 0), 0);
      if (totalWeight > 0 && Math.abs(totalWeight - 1) > 0.01) {
        for (const c of parsed.evaluationCriteria) {
          c.weight = Number((c.weight / totalWeight).toFixed(4));
        }
      }
    }

    return parsed;
  } catch (error: unknown) {
    console.error('[icap-enhancer] designConstructiveTask error:', getErrorMessage(error));
    return getDefaultConstructiveTask(nodeTitle, nodeSummary || '');
  }
}

/**
 * Design an Interactive-level task for a knowledge node.
 *
 * Generates progressive Socratic questions, variant exercises, and scenario
 * challenges adapted to the student's current level.
 */
export async function designInteractiveTask(
  nodeTitle: string,
  nodeSummary: string | null,
  studentLevel: 'beginner' | 'intermediate' | 'advanced' | string,
  subject: string,
): Promise<InteractiveTask> {
  // Map student level to difficulty hint
  const levelHint =
    studentLevel === 'advanced'
      ? '学生水平较高，问题可以更有深度和挑战性'
      : studentLevel === 'intermediate'
        ? '学生有一定基础，问题难度适中'
        : '学生是初学者，问题应从基础概念开始，循序渐进';

  const systemPrompt = `你是一位中学${subject}教育专家，擅长苏格拉底式提问和变式练习设计。

请根据给定的知识点设计互动深化(Interactive)任务。输出严格JSON格式：

{
  "socraticQuestions": [
    {
      "id": "sq-1",
      "round": 1,
      "question": "苏格拉底式追问问题",
      "expectedConcepts": ["期望学生能说出的核心概念"],
      "difficulty": 1,
      "followUpIfStuck": "学生卡住时的提示语",
      "followUpIfCorrect": "学生回答正确后的进阶追问"
    }
  ],
  "variantQuestions": [
    {
      "id": "vq-1",
      "stem": "变式题题干",
      "options": [{"label": "A", "text": "选项内容"}],
      "answer": "正确答案",
      "explanation": "详细解析",
      "difficulty": 2,
      "variantOf": "说明了与原题相比改变了什么条件"
    }
  ],
  "scenarioChallenges": [
    {
      "id": "sc-1",
      "scenario": "真实情境描述",
      "task": "要求学生完成的任务",
      "rubric": ["评估维度1", "评估维度2"],
      "difficulty": 3
    }
  ]
}

设计原则：
- socraticQuestions 应有3-5轮递进，从理解→应用→分析→评价→创造递进
- variantQuestions 应有2-4题，每道说明"改变了什么"(variantOf)，难度依次递增
- scenarioChallenges 应有1-2个真实情境挑战，与生活或考试场景相关
- ${levelHint}`;

  const userPrompt = `知识点标题：${nodeTitle}
知识点解释：${nodeSummary || '暂无详细解释'}
学科：${subject}
学生水平：${studentLevel}`;

  try {
    const raw = await llmCall({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.6,
      maxTokens: 4096,
      jsonMode: true,
    });

    const parsed = normalizeInteractiveTask(safeJsonParse<unknown>(
      raw,
      getDefaultInteractiveTask(nodeTitle, subject),
      `designInteractiveTask: ${nodeTitle}`,
    ), getDefaultInteractiveTask(nodeTitle, subject));

    if (!isValidInteractiveTask(parsed)) {
      console.warn('[icap-enhancer] LLM returned invalid InteractiveTask structure, using fallback');
      return getDefaultInteractiveTask(nodeTitle, subject);
    }

    // Ensure scenarioChallenges exists (might be omitted by LLM)
    if (!parsed.scenarioChallenges) {
      parsed.scenarioChallenges = [];
    }

    return parsed;
  } catch (error: unknown) {
    console.error('[icap-enhancer] designInteractiveTask error:', getErrorMessage(error));
    return getDefaultInteractiveTask(nodeTitle, subject);
  }
}

/**
 * Validate a student's self-explanation against the knowledge node.
 *
 * Uses AI to evaluate explanation quality, returning a structured score
 * along with identified gaps, misconceptions, and suggestions.
 */
export async function validateExplanation(
  studentText: string,
  nodeTitle: string,
  nodeSummary: string | null,
  subject: string,
): Promise<ValidationResult> {
  if (!studentText || studentText.trim().length < 5) {
    return {
      score: 0,
      comprehensionLevel: 'poor',
      missingElements: ['回答内容过短，无法评估'],
      misconceptions: [],
      strengths: [],
      suggestions: ['请至少写一段完整的解释'],
    };
  }

  const systemPrompt = `你是一位中学${subject}教师，正在评估学生的自我解释质量。

请根据给定的标准知识点和学生提交的解释，进行结构化评估。输出严格JSON格式：

{
  "score": 85,
  "comprehensionLevel": "poor|basic|good|excellent",
  "missingElements": ["学生遗漏的重要概念或要点"],
  "misconceptions": [
    {
      "concept": "被误解的概念名称",
      "studentSaid": "学生原文中表述不当的部分",
      "correction": "正确的理解应该是什么",
      "severity": "minor|moderate|critical"
    }
  ],
  "strengths": ["学生做得好的方面"],
  "suggestions": ["具体的改进建议"]
}

评分标准：
- 90-100 (excellent): 准确全面，有自己深度的理解，举一反三
- 75-89 (good): 核心概念正确，逻辑较清晰，有个别遗漏
- 50-74 (basic): 基本理解但不够深入，有2-3处遗漏或模糊
- 0-49 (poor): 理解有严重偏差，核心概念错误或大段遗漏

评估时请宽容对待表达方式的不同，重点关注概念的准确性、完整性和理解的深度。`;

  const userPrompt = `知识点标题：${nodeTitle}
知识点标准解释：${nodeSummary || '暂无详细解释'}
学科：${subject}

学生提交的解释：
${studentText}`;

  try {
    const raw = await llmCall({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      maxTokens: 3072,
      jsonMode: true,
    });

    const parsed = normalizeValidationResult(safeJsonParse<unknown>(
      raw,
      getDefaultValidationResult(),
      `validateExplanation: ${nodeTitle}`,
    ));

    if (!isValidValidationResult(parsed)) {
      console.warn('[icap-enhancer] LLM returned invalid ValidationResult structure, using fallback');
      return getDefaultValidationResult();
    }

    // Normalize score to 0-100
    parsed.score = Math.max(0, Math.min(100, Math.round(parsed.score)));

    // Ensure all arrays exist
    parsed.missingElements = parsed.missingElements || [];
    parsed.misconceptions = parsed.misconceptions || [];
    parsed.strengths = parsed.strengths || [];
    parsed.suggestions = parsed.suggestions || [];

    // Map comprehension level from score if missing or invalid
    const validLevels = ['poor', 'basic', 'good', 'excellent'];
    if (!validLevels.includes(parsed.comprehensionLevel)) {
      if (parsed.score >= 90) parsed.comprehensionLevel = 'excellent';
      else if (parsed.score >= 75) parsed.comprehensionLevel = 'good';
      else if (parsed.score >= 50) parsed.comprehensionLevel = 'basic';
      else parsed.comprehensionLevel = 'poor';
    }

    return parsed;
  } catch (error: unknown) {
    console.error('[icap-enhancer] validateExplanation error:', getErrorMessage(error));
    return getDefaultValidationResult();
  }
}

/**
 * Recommend whether to advance, maintain, or regress the student's ICAP level.
 *
 * This is a deterministic, rule-based function that considers:
 * - Current mastery level (0-100)
 * - Recent answer accuracy (0-1)
 * - Recent explanation quality scores
 *
 * Returns a recommendation with a confidence score.
 */
export function suggestProgression(
  masteryLevel: number,
  recentAccuracy: number,
  explanationScores: number[],
): ProgressionDecision {
  const ICAP_ORDER = ['Passive', 'Active', 'Constructive', 'Interactive'];

  // Determine current ICAP level from mastery level
  let currentLevel: string;
  if (masteryLevel < 30) {
    currentLevel = 'Passive';
  } else if (masteryLevel < 55) {
    currentLevel = 'Active';
  } else if (masteryLevel < 80) {
    currentLevel = 'Constructive';
  } else {
    currentLevel = 'Interactive';
  }

  const currentIndex = ICAP_ORDER.indexOf(currentLevel);

  // Compute average explanation score if available
  const avgExplanationScore =
    explanationScores.length > 0
      ? explanationScores.reduce((sum, s) => sum + s, 0) / explanationScores.length
      : 50;

  // --- Decision logic ---

  // Strong advancement signal: high accuracy + high explanation quality + high mastery
  if (
    recentAccuracy >= 0.9 &&
    avgExplanationScore >= 85 &&
    masteryLevel >= 75 &&
    currentIndex < ICAP_ORDER.length - 1
  ) {
    const nextLevel = ICAP_ORDER[currentIndex + 1];
    return {
      currentLevel,
      recommendedLevel: nextLevel,
      shouldAdvance: true,
      shouldRegress: false,
      reason: `掌握度${masteryLevel}%、正确率${Math.round(recentAccuracy * 100)}%、解释质量${Math.round(avgExplanationScore)}分，均表现优秀，建议进入${nextLevel}阶段`,
      confidence: 0.85,
    };
  }

  // Moderate advancement: good accuracy + decent explanation
  if (
    recentAccuracy >= 0.8 &&
    avgExplanationScore >= 70 &&
    masteryLevel >= 60 &&
    currentIndex < ICAP_ORDER.length - 1
  ) {
    const nextLevel = ICAP_ORDER[currentIndex + 1];
    return {
      currentLevel,
      recommendedLevel: nextLevel,
      shouldAdvance: true,
      shouldRegress: false,
      reason: `整体表现良好，可以尝试进入${nextLevel}阶段进行挑战`,
      confidence: 0.65,
    };
  }

  // Regression signal: poor accuracy or very low explanation quality
  if (
    recentAccuracy < 0.4 ||
    (avgExplanationScore < 35 && masteryLevel < 40) ||
    (recentAccuracy < 0.2)
  ) {
    const prevLevel = currentIndex > 0 ? ICAP_ORDER[currentIndex - 1] : currentLevel;
    return {
      currentLevel,
      recommendedLevel: prevLevel,
      shouldAdvance: false,
      shouldRegress: prevLevel !== currentLevel,
      reason:
        recentAccuracy < 0.2
          ? '最近正确率过低，建议回到更基础的阶段巩固理解'
          : `当前阶段表现不佳（正确率${Math.round(recentAccuracy * 100)}%、解释质量${Math.round(avgExplanationScore)}分），建议回到${prevLevel}阶段加强基础`,
      confidence: 0.8,
    };
  }

  // Maintenance: steady progress
  return {
    currentLevel,
    recommendedLevel: currentLevel,
    shouldAdvance: false,
    shouldRegress: false,
    reason:
      masteryLevel < 55
        ? '当前阶段仍需巩固，继续练习后再评估'
        : `当前阶段表现稳定（正确率${Math.round(recentAccuracy * 100)}%、掌握度${masteryLevel}%），继续在当前阶段深化`,
    confidence: 0.7,
  };
}
