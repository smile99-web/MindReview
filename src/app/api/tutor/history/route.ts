import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { loadChatHistory, listSessions, deleteSession } from '@/lib/tutor-persistence';
import { resolveUserIdFromRequest } from '@/lib/user-context';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');
    const userId = await resolveUserIdFromRequest(req);
    const action = searchParams.get('action');
    const knowledgeNodeId = searchParams.get('knowledgeNodeId') || undefined;

    if (action === 'list') {
      const sessions = await listSessions(userId, knowledgeNodeId, prisma);
      return NextResponse.json({ sessions });
    }

    if (sessionId) {
      const messages = await loadChatHistory(sessionId, prisma);
      return NextResponse.json({ sessionId, messages });
    }

    return NextResponse.json({ error: '请提供 sessionId 或 action=list' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '服务器内部错误';
    console.error('[Tutor History API] GET Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: '缺少 sessionId' }, { status: 400 });
    }

    const deleted = await deleteSession(sessionId, prisma);
    return NextResponse.json({ deleted });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '服务器内部错误';
    console.error('[Tutor History API] DELETE Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
