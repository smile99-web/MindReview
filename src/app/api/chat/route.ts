import { getErrorMessage } from '@/lib/errors';
import { sanitizeJsonString } from '@/lib/utils';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { llmCall } from '@/lib/llm-client';
import { generateImage } from '@/lib/image-client';
import { getAuthenticatedUserId } from '@/lib/server-auth';
import type { Prisma } from '@prisma/client';

const CHAT_TITLE_MAX_LEN = 30;
const MAX_HISTORY_MESSAGES = 20; // 单次 LLM 调用最多携带历史轮数（避免上下文爆栈）
const MAX_USER_MESSAGE_LEN = 2000;
const IMAGE_TYPES = ['knowledge', 'experiment', 'timeline', 'force', 'reaction', 'portrait'] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

interface ChatKnowledgeContext {
  nodeId?: string;
  subject?: string;
  chapter?: string;
  title?: string;
  summary?: string;
  keywords?: string[];
}

interface ChatRequestBody {
  conversationId?: string;
  message?: string;
  knowledgeContext?: ChatKnowledgeContext;
}

interface ChatLlmReply {
  reply: string;
  needsImage?: boolean;
  imagePrompt?: string;
  imageType?: ImageType;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  return fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asString(item)).filter((s) => s.length > 0);
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function normalizeLlmReply(raw: string): ChatLlmReply {
  const cleaned = sanitizeJsonString(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // 兜底：把整段 raw 当作纯文本 reply
    return { reply: raw.trim() };
  }
  const record = asRecord(parsed);
  const reply = asString(record.reply);
  const needsImage = record.needsImage === true;
  const imageTypeRaw = asString(record.imageType).toLowerCase();
  const imageType: ImageType | undefined = (IMAGE_TYPES as readonly string[]).includes(imageTypeRaw)
    ? (imageTypeRaw as ImageType)
    : undefined;
  return {
    reply,
    needsImage,
    imagePrompt: asString(record.imagePrompt) || undefined,
    imageType,
  };
}

function buildSystemPrompt(ctx: ChatKnowledgeContext | undefined): string {
  const ctxLines: string[] = [];
  if (ctx?.subject) ctxLines.push(`学科：${ctx.subject}`);
  if (ctx?.chapter) ctxLines.push(`章节：${ctx.chapter}`);
  if (ctx?.title) ctxLines.push(`当前知识点：${ctx.title}`);
  if (ctx?.summary) ctxLines.push(`知识点简介：${ctx.summary}`);
  if (ctx?.keywords && ctx.keywords.length > 0) {
    ctxLines.push(`关键词：${ctx.keywords.join('、')}`);
  }
  const ctxBlock = ctxLines.length > 0 ? `\n【学生当前学习内容】\n${ctxLines.join('\n')}\n` : '';

  return `你是一位耐心、亲切、专业的中学辅导老师，正在和一位中学生进行多轮对话答疑。

你的任务：
1. 用通俗易懂的中文回答学生关于概念、公式、定理、例题、实验等的问题。
2. 必要时给出一个**贴近生活的类比**或**小例子**，帮学生建立直觉。
3. 学生提出的概念模糊或答错时，先复述学生理解、再温和纠正，并补一句鼓励。
4. 公式必须用 LaTeX：行内用 $...$，独立公式用 $$...$$。
5. 不要直接给整道题的答案；先引导学生思考。
6. 严禁出现 Markdown 标题符号（#）、列表项目符号（- * 1.），用自然段 + LaTeX 表达即可。
7. 对话语言：中文。${ctxBlock}

【输出格式 — 必须为严格 JSON】
{
  "reply": "给学生看的回复文本（包含可能的 LaTeX）",
  "needsImage": true | false,
  "imagePrompt": "仅当 needsImage=true 时填写；用中文写一段适合生成教育插图的画面描述",
  "imageType": "knowledge | experiment | timeline | force | reaction | portrait 中的一个"
}

【何时需要 needsImage=true】
- 学生明确说"画一张图 / 生成图片 / 配张图 / 看看长什么样"等；
- 学生要求"示意图 / 流程图 / 受力图 / 反应过程 / 时间线 / 人物肖像"等可视化内容；
- 涉及抽象概念（如电场、分子结构、历史事件顺序）时，学生暗示想要画面帮助理解。

【imagePrompt 编写要点】
- 用中文描述，主体清晰、风格适合中学生；
- 明确"白色背景 / 教育插图风格 / 中文标注"等关键约束；
- 不要写"图"、"图片"等元词，直接描述画面。`;
}

function buildTitleFromMessages(userText: string): string {
  const cleaned = userText.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '新对话';
  const slice = cleaned.slice(0, CHAT_TITLE_MAX_LEN);
  return slice.length < cleaned.length ? `${slice}…` : slice;
}

// POST /api/chat — 发起或继续一次多轮对话
export async function POST(req: NextRequest) {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: '未登录或会话已过期' }, { status: 401 });
  }

  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: '请求体格式错误' }, { status: 400 });
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) {
    return NextResponse.json({ error: '消息内容不能为空' }, { status: 400 });
  }
  if (message.length > MAX_USER_MESSAGE_LEN) {
    return NextResponse.json(
      { error: `单条消息最多 ${MAX_USER_MESSAGE_LEN} 字` },
      { status: 400 },
    );
  }

  // 取或创建会话
  let conversationId = typeof body.conversationId === 'string' ? body.conversationId : '';
  let isNewConversation = false;
  let conversationTitle = '';

  if (conversationId) {
    const existing = await prisma.chatConversation.findUnique({ where: { id: conversationId } });
    if (!existing || existing.userId !== userId) {
      return NextResponse.json({ error: '会话不存在或无权访问' }, { status: 404 });
    }
  } else {
    const created = await prisma.chatConversation.create({
      data: {
        userId,
        knowledgeNodeId: body.knowledgeContext?.nodeId || null,
        title: buildTitleFromMessages(message),
      },
    });
    conversationId = created.id;
    conversationTitle = created.title;
    isNewConversation = true;
  }

  // 写入用户消息
  await prisma.chatMessage.create({
    data: {
      conversationId,
      role: 'user',
      content: message,
    },
  });

  // 拉历史
  const history = await prisma.chatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    take: MAX_HISTORY_MESSAGES,
    select: { role: true, content: true },
  });

  // 构建 LLM messages
  const llmMessages = [
    { role: 'system' as const, content: buildSystemPrompt(body.knowledgeContext) },
    ...history.map((m) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: m.content,
    })),
  ];

  // 调用 LLM（结构化 JSON）
  let llmReply: ChatLlmReply;
  try {
    const raw = await llmCall({
      messages: llmMessages,
      temperature: 0.7,
      maxTokens: 2048,
      jsonMode: true,
    });
    llmReply = normalizeLlmReply(raw);
    if (!llmReply.reply) {
      throw new Error('LLM 返回内容为空');
    }
  } catch (err) {
    const errMsg = getErrorMessage(err);
    console.error('[Chat] LLM 调用失败:', errMsg);
    return NextResponse.json(
      { error: `AI 老师暂时无法回复: ${errMsg}` },
      { status: 502 },
    );
  }

  // 触发图片生成（如有）
  let imageUrl: string | null = null;
  let imagePrompt: string | null = null;
  if (llmReply.needsImage) {
    const prompt = llmReply.imagePrompt?.trim() || message;
    imagePrompt = prompt;
    try {
      const result = await generateImage({
        prompt,
        imageType: llmReply.imageType || 'knowledge',
        style: '适合中学生理解的教育插图，中文标注',
      });
      if (result.status === 'success' && result.imageUrl) {
        imageUrl = result.imageUrl;
      } else {
        console.warn('[Chat] 图片生成失败:', result.errorMessage);
      }
    } catch (err) {
      console.warn('[Chat] 图片生成异常:', getErrorMessage(err));
    }
  }

  // 写入助手消息
  const assistant = await prisma.chatMessage.create({
    data: {
      conversationId,
      role: 'assistant',
      content: llmReply.reply,
      imageUrl: imageUrl || undefined,
      imagePrompt: imagePrompt || undefined,
    },
  });

  // 更新会话 updatedAt（以及首次生成时回填 title）
  await prisma.chatConversation.update({
    where: { id: conversationId },
    data: {
      updatedAt: new Date(),
      ...(isNewConversation ? {} : {}),
      title: conversationTitle || undefined,
    },
  });

  // 记录 AI 日志
  await prisma.aiGenerationLog.create({
    data: {
      generatorType: 'chat',
      model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
      prompt: `[chat:${conversationId}] ${message}`.slice(0, 4000),
      response: llmReply.reply.slice(0, 4000),
      status: 'success',
    },
  }).catch(() => {/* 日志失败不影响主流程 */});

  return NextResponse.json({
    conversationId,
    isNewConversation,
    userMessage: { role: 'user', content: message, createdAt: new Date().toISOString() },
    assistantMessage: {
      id: assistant.id,
      role: 'assistant',
      content: assistant.content,
      imageUrl: assistant.imageUrl,
      imagePrompt: assistant.imagePrompt,
      createdAt: assistant.createdAt.toISOString(),
    },
  });
}

// GET /api/chat — 列出当前用户的所有会话
export async function GET(req: NextRequest) {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: '未登录或会话已过期' }, { status: 401 });
  }

  const where: Prisma.ChatConversationWhereInput = { userId };
  const conversations = await prisma.chatConversation.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: 50,
    select: {
      id: true,
      title: true,
      knowledgeNodeId: true,
      createdAt: true,
      updatedAt: true,
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { content: true, role: true, imageUrl: true, createdAt: true },
      },
    },
  });

  const items = conversations.map((c) => {
    const last = c.messages[0];
    return {
      id: c.id,
      title: c.title,
      knowledgeNodeId: c.knowledgeNodeId,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      lastMessage: last
        ? {
            role: last.role,
            content: last.content,
            imageUrl: last.imageUrl,
            createdAt: last.createdAt.toISOString(),
          }
        : null,
    };
  });

  return NextResponse.json({ conversations: items });
}