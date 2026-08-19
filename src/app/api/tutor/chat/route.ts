import { getErrorMessage, getErrorStatus } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rate-limit';
import { socraticDialogue } from '@/lib/ai-tutor';
import { saveChatMessage } from '@/lib/tutor-persistence';
import { resolveUserIdFromRequest } from '@/lib/user-context';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      sessionId: inputSessionId,
      knowledgeNodeId,
      message,
      history,
    } = body as {
      sessionId?: string;
      knowledgeNodeId: string;
      message: string;
      userId?: string;
      history?: Array<{ role: string; content: string }>;
    };

    // --- Resolve userId from JWT token (with DB fallback) ---
    const userId = await resolveUserIdFromRequest(req);

    // 限流：每次对话都是一次付费 LLM 调用，每人每小时 60 条，防脚本化烧额度
    const rl = rateLimit(`tutor:${userId}`, 60, 60 * 60 * 1000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: '提问太频繁了，休息一会儿再继续吧' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
      );
    }

    // --- Validate required fields ---
    if (!knowledgeNodeId) {
      return NextResponse.json({ error: '缺少 knowledgeNodeId' }, { status: 400 });
    }
    if (!message || !message.trim()) {
      return NextResponse.json({ error: '缺少 message' }, { status: 400 });
    }
    // sessionId 归属编码用 '::' 分隔（tutor-persistence.ts）。客户端提供的
    // sessionId 若含 ':' 可伪造归属前缀、往他人会话列表注入伪造会话 → 拒绝
    if (inputSessionId && (typeof inputSessionId !== 'string' || inputSessionId.includes(':'))) {
      return NextResponse.json({ error: '无效的会话 ID' }, { status: 400 });
    }

    // --- Fetch knowledge node ---
    const node = await prisma.knowledgeNode.findUnique({
      where: { id: knowledgeNodeId },
      include: { subject: { select: { name: true } } },
    });

    if (!node) {
      return NextResponse.json({ error: '知识点不存在' }, { status: 404 });
    }

    // --- Call Socratic dialogue engine ---
    const result = await socraticDialogue({
      studentMessage: message.trim(),
      knowledgeNodeTitle: node.title,
      knowledgeNodeSummary: node.summary || '',
      subject: node.subject?.name || '通用',
      history: Array.isArray(history) ? history : [],
      userId,
    });

    // --- Generate or reuse session ID ---
    const sessionId = inputSessionId || `tutor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // --- Persist both messages to AiGenerationLog ---
    try {
      await saveChatMessage(sessionId, userId, knowledgeNodeId, 'user', message.trim(), prisma);
      await saveChatMessage(sessionId, userId, knowledgeNodeId, 'assistant', result.tutorReply, prisma);
    } catch (persistError) {
      console.error('[Tutor Chat API] Failed to persist messages:', persistError);
    }

    return NextResponse.json({
      sessionId,
      reply: result.tutorReply,
      questions: result.questions,
      insights: result.insights,
      suggestedAction: result.suggestedAction,
      understandingLevel: result.understandingLevel,
    });
  } catch (error: unknown) {
    console.error('[Tutor Chat API] Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, '服务器内部错误') },
      { status: getErrorStatus(error) },
    );
  }
}
