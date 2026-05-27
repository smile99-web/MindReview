import OpenAI from 'openai';
import { prisma } from '@/lib/prisma';
import { decryptSecret } from '@/lib/secrets';
import { assertSafeExternalBaseUrl } from '@/lib/url-security';

export type LlmRole = 'system' | 'user' | 'assistant';

export interface LlmMessage {
  role: LlmRole;
  content: string;
}

export interface LlmCallOptions {
  messages: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

async function getLlmSettings() {
  const saved = await prisma.apiKey.findUnique({ where: { service: 'llm' } }).catch(() => null);
  const savedKey = saved?.isActive && saved.key ? decryptSecret(saved.key) : '';
  const apiKey = savedKey || process.env.DEEPSEEK_API_KEY || 'sk-placeholder';
  const baseURL = assertSafeExternalBaseUrl(
    saved?.baseUrl || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  );
  const model = saved?.model || process.env.DEEPSEEK_MODEL || MODEL;

  return { apiKey, baseURL, model };
}

export async function llmCall(options: LlmCallOptions): Promise<string> {
  const { messages, temperature = 0.7, maxTokens = 4096, jsonMode = false } = options;

  try {
    const settings = await getLlmSettings();
    const client = new OpenAI({
      apiKey: settings.apiKey,
      baseURL: settings.baseURL,
    });

    const response = await client.chat.completions.create({
      model: settings.model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      temperature,
      max_tokens: maxTokens,
      response_format: jsonMode ? { type: 'json_object' } : undefined,
    });

    const content = response.choices[0]?.message?.content || '';
    return content;
  } catch (error: any) {
    console.error('[llmCall] Error:', error.message);
    throw new Error(`LLM调用失败: ${error.message}`);
  }
}

export async function llmCallWithLog(
  options: LlmCallOptions & { generatorType?: string },
  prisma?: any,
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
  } catch (error: any) {
    const durationMs = Date.now() - startTime;

    if (prisma) {
      await prisma.aiGenerationLog.create({
        data: {
          generatorType: options.generatorType || 'llm',
          model: settings.model,
          prompt: prompt.slice(0, 4000),
          status: 'failed',
          errorMessage: error.message,
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
): Promise<any> {
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
    maxTokens: 8192,
    jsonMode: true,
  });

  return JSON.parse(result);
}

// ========== 题目生成 ==========
export async function generateQuestions(
  knowledgeTitle: string,
  knowledgeSummary: string,
  subject: string,
  questionType: string,
  icapLevel: string,
  count: number = 3,
): Promise<any> {
  const systemPrompt = `你是一位中学${subject}出题专家。请根据知识点生成${count}道${questionType}题目。
ICAP层级：${icapLevel}
题目要求：
- Passive: 基础识记题
- Active: 填空、判断、选择
- Constructive: 简答、总结归纳
- Interactive: 变式题、综合应用题

输出严格JSON格式：{"questions": [{"stem": "题干", "options": [{"label": "A", "text": "选项"}], "answer": "答案", "explanation": "解析", "difficulty": 3, "cognitiveLoad": 3}]}`;

  const result = await llmCall({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `知识点：${knowledgeTitle}\n解释：${knowledgeSummary}` },
    ],
    temperature: 0.7,
    maxTokens: 4096,
    jsonMode: true,
  });

  return JSON.parse(result);
}

// ========== 错因分析 ==========
export async function analyzeMistake(
  subject: string,
  questionText: string,
  wrongAnswer: string | undefined,
  correctAnswer: string,
): Promise<any> {
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

  return JSON.parse(result);
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
