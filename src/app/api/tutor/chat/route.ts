import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
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

    // --- Validate required fields ---
    if (!knowledgeNodeId) {
      return NextResponse.json({ error: '缺少 knowledgeNodeId' }, { status: 400 });
    }
    if (!message || !message.trim()) {
      return NextResponse.json({ error: '缺少 message' }, { status: 400 });
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
  } catch (error: any) {
    console.error('[Tutor Chat API] Error:', error);
    return NextResponse.json(
      { error: error.message || '服务器内部错误' },
      { status: 500 },
    );
  }
}
