import { getErrorMessage } from '@/lib/errors';
import { parseAiJson, runAiTask } from '@/lib/ai-service';
import OpenAI from 'openai';
import { prisma } from '@/lib/prisma';
import { decryptSecret } from '@/lib/secrets';
import { assertSafeExternalBaseUrl } from '@/lib/url-security';
import type { PrismaClient } from '@prisma/client';
import type { WorkedExample } from '@/types';

export type LlmRole = 'system' | 'user' | 'assistant';

/**
 * One part of a multimodal message. Mirrors the OpenAI Chat
 * Completions multimodal shape (text + image_url). Only used when
 * the LLM provider supports vision input (e.g. Doubao-1.5-vision-pro,
 * Qwen-VL, GPT-4o, etc.). For text-only providers, fall back to
 * string content.
 */
export type LlmContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface LlmMessage {
  role: LlmRole;
  // String for text-only models, or an array of text/image parts for
  // vision-capable models. The OpenAI SDK accepts both shapes
  // directly, so callers can pass either.
  content: string | LlmContentPart[];
}

export interface LlmCallOptions {
  messages: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

interface DecomposedKnowledgeNode {
  title?: string;
  summary?: string;
  keywords?: string[];
  prerequisites?: string[];
  commonMistakes?: string[];
  typicalQuestions?: string[];
  difficulty?: number;
  cognitiveLoad?: number;
  icapLevel?: string;
}

interface DecomposedKnowledgeEdge {
  fromIndex: number;
  toIndex: number;
  relationType?: string;
  label?: string;
}

export interface DecomposeKnowledgeResult {
  nodes?: DecomposedKnowledgeNode[];
  edges?: DecomposedKnowledgeEdge[];
}

export interface GeneratedQuestion {
  questionType?: string;
  icapLevel?: string;
  stem?: string;
  question?: string;
  options?: unknown;
  answer?: string;
  explanation?: string;
  difficulty?: number;
  cognitiveLoad?: number;
}

export interface GenerateQuestionsResult {
  questions?: GeneratedQuestion[];
}

export interface MistakeAnalysisResult {
  mistakeType?: string;
  analysis?: string;
  relatedKnowledge?: string[];
  suggestion?: string;
}

export interface AnswerGradeResult {
  isCorrect: boolean;
  score: number;
  quality: number;
  feedback: string;
  confidence: number;
}

const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const LLM_TIMEOUT_MS = Number(process.env.AI_LLM_TIMEOUT_MS || 60_000);
const LLM_RETRIES = Number(process.env.AI_LLM_RETRIES || 1);
const VALID_ICAP_LEVELS = ['Passive', 'Active', 'Constructive', 'Interactive'];
const VALID_RELATION_TYPES = ['contains', 'prerequisite', 'cause', 'compare', 'formula', 'experiment'];
const VALID_MISTAKE_TYPES = ['conceptual', 'calculation', 'careless', 'application'];

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
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function normalizeOptions(value: unknown): unknown {
  if (!Array.isArray(value)) return undefined;
  const options = value
    .filter(isRecord)
    .map((option, index) => ({
      label: asString(option.label, String.fromCharCode(65 + index)),
      text: asString(option.text || option.value || option.content),
    }))
    .filter((option) => option.text.length > 0);
  return options.length > 0 ? options : undefined;
}

function normalizeDecomposeKnowledgeResult(value: unknown): DecomposeKnowledgeResult {
  const root = isRecord(value) ? value : {};
  const nodes = Array.isArray(root.nodes)
    ? root.nodes
        .filter(isRecord)
        .map((node): DecomposedKnowledgeNode => ({
          title: asString(node.title),
          summary: asString(node.summary),
          keywords: asStringArray(node.keywords),
          prerequisites: asStringArray(node.prerequisites),
          commonMistakes: asStringArray(node.commonMistakes),
          typicalQuestions: asStringArray(node.typicalQuestions),
          difficulty: clampInt(node.difficulty, 1, 5, 3),
          cognitiveLoad: clampInt(node.cognitiveLoad, 1, 5, 3),
          icapLevel: VALID_ICAP_LEVELS.includes(asString(node.icapLevel))
            ? asString(node.icapLevel)
            : 'Active',
        }))
        .filter((node) => !!node.title)
    : [];

  const edges = Array.isArray(root.edges)
    ? root.edges
        .filter(isRecord)
        .map((edge): DecomposedKnowledgeEdge => ({
          fromIndex: clampInt(edge.fromIndex, 0, Math.max(0, nodes.length - 1), 0),
          toIndex: clampInt(edge.toIndex, 0, Math.max(0, nodes.length - 1), 0),
          relationType: VALID_RELATION_TYPES.includes(asString(edge.relationType))
            ? asString(edge.relationType)
            : 'contains',
          label: asString(edge.label),
        }))
        .filter((edge) => edge.fromIndex !== edge.toIndex)
    : [];

  return { nodes, edges };
}

function normalizeGenerateQuestionsResult(value: unknown): GenerateQuestionsResult {
  // The LLM sometimes returns a bare array (new prompt format) and
  // sometimes wraps it in {questions: [...]}. Handle both.
  let rawQuestions: unknown[] = [];
  if (Array.isArray(value)) {
    rawQuestions = value;
  } else if (isRecord(value) && Array.isArray((value as Record<string,unknown>).questions)) {
    rawQuestions = (value as Record<string,unknown>).questions as unknown[];
  }

  const questions = rawQuestions
    .filter(isRecord)
    .map((question): GeneratedQuestion => {
      const stem = asString(question.stem || question.question);
      return {
        questionType: asString(question.questionType),
        icapLevel: VALID_ICAP_LEVELS.includes(asString(question.icapLevel))
          ? asString(question.icapLevel)
          : undefined,
        stem,
        question: stem,
        options: normalizeOptions(question.options),
        answer: asString(question.answer),
        explanation: asString(question.explanation),
        difficulty: clampInt(question.difficulty, 1, 5, 3),
        cognitiveLoad: clampInt(question.cognitiveLoad, 1, 5, 3),
      };
    })
    .filter((question) => !!question.stem && !!question.answer);

  return { questions };
}

function normalizeMistakeAnalysisResult(value: unknown): MistakeAnalysisResult {
  const root = isRecord(value) ? value : {};
  const mistakeType = asString(root.mistakeType);
  return {
    mistakeType: VALID_MISTAKE_TYPES.includes(mistakeType) ? mistakeType : 'conceptual',
    analysis: asString(root.analysis),
    relatedKnowledge: asStringArray(root.relatedKnowledge),
    suggestion: asString(root.suggestion),
  };
}

function normalizeAnswerGradeResult(value: unknown): AnswerGradeResult {
  const root = isRecord(value) ? value : {};
  const score = clampNumber(root.score, 0, 1, 0);
  const quality = clampInt(root.quality, 0, 5, score >= 0.75 ? 4 : score >= 0.5 ? 3 : 1);
  const isCorrect = typeof root.isCorrect === 'boolean' ? root.isCorrect : score >= 0.65;

  return {
    isCorrect,
    score,
    quality,
    feedback: asString(root.feedback, isCorrect ? '回答基本正确。' : '答案还不够完整，请对照解析补充关键点。'),
    confidence: clampNumber(root.confidence, 0, 1, 0.6),
  };
}

function normalizeWorkedExample(value: unknown): WorkedExample {
  const root = isRecord(value) ? value : {};
  const reasoningSteps = Array.isArray(root.reasoningSteps)
    ? root.reasoningSteps
        .filter(isRecord)
        .map((step, index) => ({
          step: clampInt(step.step, 1, 20, index + 1),
          explanation: asString(step.explanation),
        }))
        .filter((step) => step.explanation.length > 0)
    : [];

  return {
    problem: asString(root.problem),
    solution: asString(root.solution),
    reasoningSteps,
    similarProblem: asString(root.similarProblem),
    similarProblemSolution: asString(root.similarProblemSolution),
  };
}

async function getLlmSettings() {
  const saved = await prisma.apiKey.findUnique({ where: { service: 'llm' } }).catch(() => null);
  const savedKey = saved?.isActive && saved.key ? decryptSecret(saved.key) : '';
  const apiKey = savedKey || process.env.DEEPSEEK_API_KEY || '';
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY not configured. Please add your API key in Settings.');
  }
  const baseURL = assertSafeExternalBaseUrl(
    saved?.baseUrl || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  );
  const model = saved?.model || process.env.DEEPSEEK_MODEL || MODEL;

  return { apiKey, baseURL, model };
}

/**
 * Vision-capable model settings. Pulled from the dedicated 'vision'
 * row in the ApiKey table (configured separately in Settings →
 * "视觉模型 (MiniMax M3)") or, as a fallback, from VISION_*
 * environment variables. The default model is MiniMax-M3 (a
 * multimodal model the user picked for exam-photo OCR).
 *
 * Kept separate from the regular LLM settings because the OCR path
 * often wants a different model from text reasoning (a vision
 * model, not DeepSeek). Falling back to the LLM config is an
 * explicit decision the user makes by leaving the vision row empty.
 */
export async function getVisionSettings(): Promise<{
  apiKey: string;
  baseURL: string;
  model: string;
}> {
  const saved = await prisma.apiKey
    .findUnique({ where: { service: 'vision' } })
    .catch(() => null);
  const savedKey = saved?.isActive && saved.key ? decryptSecret(saved.key) : '';
  // Fall back to the LLM row's apiKey/baseUrl only if explicitly
  // configured there. Most users will keep the vision row separate.
  const fallback = await prisma.apiKey
    .findUnique({ where: { service: 'llm' } })
    .catch(() => null);
  const fallbackKey =
    fallback?.isActive && fallback.key ? decryptSecret(fallback.key) : '';

  const apiKey = savedKey || process.env.VISION_API_KEY || fallbackKey || '';
  if (!apiKey) {
    throw new Error(
      '未配置视觉模型 API Key。请在 设置 → 视觉模型 (MiniMax M3) 填写你的 API Key。',
    );
  }
  const baseURL = assertSafeExternalBaseUrl(
    saved?.baseUrl ||
      process.env.VISION_BASE_URL ||
      fallback?.baseUrl ||
      'https://api.minimaxi.com/v1',
  );
  // Default to MiniMax-M3 (per the user's choice for exam-photo OCR).
  // The model name is also overridable per-provider since MiniMax's
  // exact API path / model string may change.
  const model =
    saved?.model ||
    process.env.VISION_MODEL ||
    fallback?.model ||
    'MiniMax-M3';

  return { apiKey, baseURL, model };
}

/**
 * Vision-capable LLM call. Sends a base64-encoded image plus a text
 * prompt and returns the model's reply. Uses the dedicated 'vision'
 * settings (configured in Settings → 视觉模型 (MiniMax M3)). The
 * default model is MiniMax-M3.
 *
 * The image is sent as a data: URL (no separate file upload needed).
 * Larger images should be downscaled by the caller before calling.
 */
export async function llmVisionCall(options: {
  prompt: string;
  imageBase64: string;
  mimeType?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}): Promise<string> {
  const {
    prompt,
    imageBase64,
    mimeType = 'image/png',
    systemPrompt,
    temperature = 0.3,
    maxTokens = 2048,
    jsonMode = false,
  } = options;

  const messages: LlmMessage[] = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({
    role: 'user',
    content: [
      { type: 'text', text: prompt },
      {
        type: 'image_url',
        image_url: { url: `data:${mimeType};base64,${imageBase64}` },
      },
    ],
  });

  // Use the dedicated vision settings (default: MiniMax-M3) rather
  // than the regular LLM settings. Keeps the two model choices
  // independent — the user can swap vision providers without
  // affecting text reasoning, and vice versa.
  const settings = await getVisionSettings();
  const client = new OpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.baseURL,
  });

  return runAiTask(
    {
      service: 'llm',
      operation: 'chat.completions.create',
      timeoutMs: LLM_TIMEOUT_MS,
      retries: LLM_RETRIES,
    },
    () => client.chat.completions.create({
      model: settings.model,
      messages: messages as unknown as Parameters<typeof client.chat.completions.create>[0]['messages'],
      temperature,
      max_tokens: maxTokens,
      response_format: jsonMode ? { type: 'json_object' } : undefined,
    }),
  ).then((res) => {
    // res is a ChatCompletion (not a Stream) because we don't pass stream:true
    const content = (res as { choices: Array<{ message: { content?: string | null } }> }).choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('视觉模型未返回内容，请检查模型名/网络/Key');
    }
    return content;
  });
}

export async function llmCall(options: LlmCallOptions): Promise<string> {
  const { messages, temperature = 0.7, maxTokens = 4096, jsonMode = false } = options;

  try {
    const settings = await getLlmSettings();
    const client = new OpenAI({
      apiKey: settings.apiKey,
      baseURL: settings.baseURL,
    });

    const response = await runAiTask(
      {
        service: 'llm',
        operation: 'chat.completions.create',
        timeoutMs: LLM_TIMEOUT_MS,
        retries: LLM_RETRIES,
      },
      () => client.chat.completions.create({
        model: settings.model,
        // Cast to the OpenAI SDK's message-param union. Our LlmMessage
        // uses a permissive `string | ContentPart[]` for content so we
        // can build multimodal messages, which the OpenAI runtime
        // handles correctly even though the .d.ts narrows content by
        // role.
        messages: messages as unknown as Parameters<typeof client.chat.completions.create>[0]['messages'],
        temperature,
        max_tokens: maxTokens,
        response_format: jsonMode ? { type: 'json_object' } : undefined,
      }),
    );

    const content = response.choices[0]?.message?.content || '';
    return content;
  } catch (error: unknown) {
    console.error('[llmCall] Error:', getErrorMessage(error));
    throw new Error(`LLM调用失败: ${getErrorMessage(error)}`);
  }
}

export async function llmCallWithLog(
  options: LlmCallOptions & { generatorType?: string },
  prisma?: Pick<PrismaClient, 'aiGenerationLog'>,
): Promise<string> {
  const startTime = Date.now();
  const prompt = options.messages.map(m => `[${m.role}] ${m.content}`).join('\n');
  const settings = await getLlmSettings();

  try {
    const response = await llmCall(options);
    const durationMs = Date.now() - startTime;

    if (prisma) {
      await prisma.aiGenerationLog.create({
        data: {
          generatorType: options.generatorType || 'llm',
          model: settings.model,
          prompt: prompt.slice(0, 4000),
          response: response.slice(0, 4000),
          status: 'success',
          durationMs,
        },
      });
    }

    return response;
  } catch (error: unknown) {
    const durationMs = Date.now() - startTime;

    if (prisma) {
      await prisma.aiGenerationLog.create({
        data: {
          generatorType: options.generatorType || 'llm',
          model: settings.model,
          prompt: prompt.slice(0, 4000),
          status: 'failed',
          errorMessage: getErrorMessage(error),
          durationMs,
        },
      });
    }

    throw error;
  }
}


// ========== 知识点拆解 ==========
export async function decomposeKnowledge(
  subject: string,
  grade: string,
  chapter: string,
  content: string,
): Promise<DecomposeKnowledgeResult> {
  const systemPrompt = `你是一位资深中学${subject}教师，擅长将教材内容拆解为最小可复习知识点。

请将以下内容拆解为知识点列表。每个知识点包含：
- title: 知识点标题（简洁准确）
- summary: 简明解释（50-100字）
- keywords: 关键词数组
- prerequisites: 前置知识数组
- commonMistakes: 常见错误数组
- typicalQuestions: 典型题型数组
- difficulty: 难度 1-5
- cognitiveLoad: 认知负荷 1-5
- icapLevel: Passive/Active/Constructive/Interactive

同时给出知识点之间的关系：
- contains: 包含
- prerequisite: 前置
- cause: 因果
- compare: 对比
- formula: 公式推导
- experiment: 实验验证

输出严格JSON格式：{"nodes": [...], "edges": [{"fromIndex": 0, "toIndex": 1, "relationType": "contains", "label": "包含"}]}`;

  const userPrompt = `学科：${subject}
年级：${grade}
章节：${chapter}
内容：${content}`;

  const result = await llmCall({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    maxTokens: 16384,
    jsonMode: true,
  });

  return normalizeDecomposeKnowledgeResult(parseAiJson<unknown>(result, 'decomposeKnowledge'));
}

// ========== 题目生成 ==========

/** 按题型生成不同的系统提示和 JSON 格式，防止 LLM 把简答题也出成选择题。 */
function buildQuestionPrompt(
  subject: string,
  questionType: string,
  count: number,
): string {
  const header = `你是一位中学${subject}出题专家。请根据知识点生成 ${count} 道"${questionType}"题目。`;
  const footer = '注意：只输出 JSON 数组，不附加解释文字。每题 difficulty 为 1-5（5 最难）。';

  switch (questionType) {
    case 'multiple_choice':
      return `${header}

=== 题型要求 ===
- 4 个选项，标 A/B/C/D
- 题干不得包含"以下哪一项"等提示性词语（除非知识点的核心就是区分概念）
- answer 填正确选项的字母（如 "C"）

=== 输出格式（严格 JSON）===
{"stem": "题干", "options": [{"label": "A", "text": "…"}, {"label": "B", "text": "…"}, {"label": "C", "text": "…"}, {"label": "D", "text": "…"}], "answer": "C", "explanation": "解析", "difficulty": 3}

${footer}`;

    case 'fill_blank':
      return `${header}

=== 题型要求 ===
- 题干中用 "___" 标记空缺
- 一个空填一个简短答案（词、数、公式）
- answer 填空缺处的准确答案
- 不要配 options

=== 输出格式（严格 JSON）===
{"stem": "题干（含 ___ 标记）", "answer": "正确答案", "explanation": "解析", "difficulty": 3}

${footer}`;

    case 'short_answer':
      return `${header}

=== 题型要求 ===
- 题干为开放式问题：为什么？如何？请解释……
- **不要出选择题**（不要用"下列/哪一项/以下"等选择题措辞）
- **禁止配 options 字段** — 简答题不需要 ABCD 选项
- answer 为 3-6 句话的参考答案（段落，不是字母/单词）

=== 输出格式（严格 JSON）===
{"stem": "题干", "answer": "参考答案（3-6 句话）", "explanation": "解析", "difficulty": 3}

${footer}`;

    default:
      return `${header}
输出 JSON：{"stem": "题干", "options": [{"label": "A", "text": "选项"}], "answer": "答案", "explanation": "解析", "difficulty": 3}
${footer}`;
  }
}

export async function generateQuestions(
  knowledgeTitle: string,
  knowledgeSummary: string,
  subject: string,
  questionType: string,
  icapLevel: string,
  count: number = 3,
): Promise<GenerateQuestionsResult> {
  const systemPrompt = buildQuestionPrompt(subject, questionType, count);

  const result = await llmCall({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `知识点：${knowledgeTitle}\n解释：${knowledgeSummary}` },
    ],
    temperature: 0.7,
    maxTokens: 4096,
    jsonMode: true,
  });

  const raw = result;
  let parsed: unknown;
  try {
    parsed = parseAiJson<unknown>(raw, 'generateQuestions');
  } catch (err) {
    console.error(
      '[generateQuestions] JSON parse failed. Raw LLM output (first 500 chars):',
      raw.slice(0, 500),
    );
    throw err;
  }
  const normalized = normalizeGenerateQuestionsResult(parsed);
  if (!normalized.questions || normalized.questions.length === 0) {
    console.error(
      '[generateQuestions] normalized to empty. Raw JSON (first 800 chars):',
      JSON.stringify(parsed).slice(0, 800),
    );
  }
  return normalized;
}

// ========== 错因分析 ==========
export async function analyzeMistake(
  subject: string,
  questionText: string,
  wrongAnswer: string | undefined,
  correctAnswer: string,
): Promise<MistakeAnalysisResult> {
  const systemPrompt = `你是一位中学${subject}教师，擅长分析学生的错题原因。
请分析以下错题，输出JSON：
{
  "mistakeType": "conceptual|calculation|careless|application",
  "analysis": "详细错因分析（100-200字）",
  "relatedKnowledge": ["相关知识点"],
  "suggestion": "针对性的学习建议"
}`;

  const wrongPart = wrongAnswer ? `错误答案：${wrongAnswer}` : '';
  const result = await llmCall({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `题目：${questionText}\n${wrongPart}\n正确答案：${correctAnswer}` },
    ],
    temperature: 0.5,
    maxTokens: 2048,
    jsonMode: true,
  });

  return normalizeMistakeAnalysisResult(parseAiJson<unknown>(result, 'analyzeMistake'));
}

// ========== 建构类答案判分 ==========
export async function gradeConstructedAnswer(options: {
  knowledgeTitle: string;
  questionText: string;
  userAnswer: string;
  correctAnswer: string;
  explanation?: string | null;
}, logPrisma?: Pick<PrismaClient, 'aiGenerationLog'>): Promise<AnswerGradeResult> {
  const systemPrompt = `你是一位严谨的中学教师，正在批改简答题或变式应用题。
请根据语义而不是字面完全一致来判分。允许学生使用等价表述、等价公式或合理步骤。
如果答案只命中部分关键点，应给部分分；如果概念方向错误，即使包含少量关键词也应判为不正确。

输出严格 JSON：
{
  "isCorrect": true,
  "score": 0.0,
  "quality": 0,
  "feedback": "给学生的一句话中文反馈",
  "confidence": 0.0
}

字段要求：
- score: 0 到 1，表示答案完整度
- quality: 0 到 5，用于复习调度；0-2 不通过，3 部分掌握，4-5 掌握
- isCorrect: score >= 0.65 且关键概念没有方向性错误时为 true
- feedback: 中文，具体指出缺了什么或哪里正确`;

  const userPrompt = `知识点：${options.knowledgeTitle}
题目：${options.questionText}
标准答案：${options.correctAnswer}
解析：${options.explanation || '无'}
学生答案：${options.userAnswer}`;

  const result = await llmCallWithLog({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.1,
    maxTokens: 900,
    jsonMode: true,
    generatorType: 'practice_answer_grading',
  }, logPrisma);

  return normalizeAnswerGradeResult(parseAiJson<unknown>(result, 'gradeConstructedAnswer'));
}

// ========== 复习总结 ==========
export async function generateSummary(
  subject: string,
  knowledgePoints: { title: string; summary: string; masteryLevel: number }[],
): Promise<string> {
  const systemPrompt = `你是一位中学${subject}教师。请根据学生的知识点掌握情况生成个性化复习总结。
包括：已掌握的亮点、需要加强的薄弱点、下一步建议。控制在200字以内。`;

  const kpList = knowledgePoints
    .map(k => `- ${k.title}（掌握度：${k.masteryLevel}/100）：${k.summary}`)
    .join('\n');

  const result = await llmCall({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: kpList },
    ],
    temperature: 0.5,
    maxTokens: 1024,
  });

  return result;
}

// ========== 样例工作（Cognitive Load Theory - Worked Example） ==========
export async function generateWorkedExample(
  knowledgeNodeId: string,
  subject: string,
  difficulty: number = 3,
): Promise<WorkedExample> {
  const node = await prisma.knowledgeNode.findUnique({
    where: { id: knowledgeNodeId },
    include: { subject: { select: { name: true } } },
  });

  if (!node) {
    throw new Error(`知识点不存在: ${knowledgeNodeId}`);
  }

  const subjectName = subject || node.subject?.name || '数学';

  const systemPrompt = `你是一位资深中学${subjectName}教师，擅长按照认知负荷理论设计"样例教学"（Worked Example）。

样例教学的核心结构：
1. 给出一个典型问题（Problem）
2. 给出完整解答过程（Solution）
3. 拆解为逐步推理步骤（Reasoning Steps），每步包含 step 编号和 explanation 解释
4. 再给出一个相似但略有变化的练习题（Similar Problem）及其参考答案（Similar Problem Solution）

要求：
- 题目难度与知识点难度 ${difficulty}/5 匹配
- 语言简洁准确，适合中学生理解
- 解答步骤要完整、逻辑清晰
- 相似练习题要改变数值或场景，但考察同一知识点

输出严格JSON格式：
{
  "problem": "问题陈述",
  "solution": "完整解答",
  "reasoningSteps": [
    { "step": 1, "explanation": "第一步的推理说明" },
    { "step": 2, "explanation": "第二步的推理说明" }
  ],
  "similarProblem": "相似练习题",
  "similarProblemSolution": "相似练习题解答"
}`;

  const userPrompt = `学科：${subjectName}
知识点：${node.title}
知识点解释：${node.summary || ''}
关键词：${(node.keywords || []).join('、')}
难度：${difficulty}/5
认知负荷：${node.cognitiveLoad}/5

请为上述知识点生成一个样例教学（Worked Example）。`;

  const result = await llmCallWithLog(
    {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      maxTokens: 4096,
      jsonMode: true,
      generatorType: 'worked_example',
    },
    prisma,
  );

  const parsed = normalizeWorkedExample(parseAiJson<unknown>(result, 'generateWorkedExample'));

  // Validate the structure
  if (!parsed.problem || !parsed.solution || !Array.isArray(parsed.reasoningSteps)) {
    throw new Error('LLM 返回的样例数据不完整，缺少必要字段');
  }

  // Ensure reasoning steps have consistent step numbers
  parsed.reasoningSteps = parsed.reasoningSteps.map((s, i) => ({
    step: typeof s.step === 'number' ? s.step : i + 1,
    explanation: s.explanation || '',
  }));

  if (!parsed.similarProblem) {
    parsed.similarProblem = '';
  }
  if (!parsed.similarProblemSolution) {
    parsed.similarProblemSolution = '';
  }

  return parsed;
}
