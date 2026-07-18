import { PrismaClient } from '@prisma/client';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ChatSession {
  sessionId: string;
  knowledgeNodeId?: string | null;
  lastMessageAt: string;
  messageCount: number;
}

type TutorChatLog = {
  prompt: string;
  response: string | null;
  createdAt: Date;
};

function encodePrompt(sessionId: string, userId: string, role: string, timestamp: string): string {
  return `${sessionId}::${userId}::${role}::${timestamp}`;
}

function decodePrompt(prompt: string): { sessionId: string; userId: string; role: string; timestamp: string } | null {
  const parts = prompt.split('::');
  if (parts.length < 4) return null;
  return { sessionId: parts[0], userId: parts[1], role: parts[2], timestamp: parts[3] };
}

export async function saveChatMessage(
  sessionId: string,
  userId: string,
  knowledgeNodeId: string,
  role: 'user' | 'assistant',
  content: string,
  prisma: PrismaClient,
) {
  // 防御性校验：归属编码以 '::' 分隔，sessionId 含 ':' 会破坏编码结构
  // （正常调用方已在路由层拦截，这里是兜底）
  if (sessionId.includes(':')) {
    throw new Error('Invalid sessionId: must not contain ":"');
  }
  const timestamp = new Date().toISOString();
  await prisma.aiGenerationLog.create({
    data: {
      generatorType: 'tutor_chat',
      model: knowledgeNodeId,
      prompt: encodePrompt(sessionId, userId, role, timestamp),
      response: content,
      status: 'success',
    },
  });
}

export async function loadChatHistory(
  sessionId: string,
  userId: string,
  prisma: PrismaClient,
): Promise<ChatMessage[]> {
  const logs = await prisma.aiGenerationLog.findMany({
    where: {
      generatorType: 'tutor_chat',
      prompt: { startsWith: `${sessionId}::${userId}::` },
    },
    orderBy: { createdAt: 'asc' },
  });

  return logs.map((log: TutorChatLog) => {
    const decoded = decodePrompt(log.prompt);
    return {
      role: (decoded?.role ?? 'assistant') as 'user' | 'assistant',
      content: log.response || '',
      timestamp: decoded?.timestamp ?? log.createdAt.toISOString(),
    };
  });
}

export async function listSessions(
  userId: string,
  knowledgeNodeId: string | undefined,
  prisma: PrismaClient,
): Promise<ChatSession[]> {
  const where: Record<string, unknown> = {
    generatorType: 'tutor_chat',
    prompt: { contains: `::${userId}::` },
  };
  if (knowledgeNodeId) {
    where.model = knowledgeNodeId;
  }

  const logs = await prisma.aiGenerationLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  const sessionMap = new Map<string, ChatSession>();
  for (const log of logs) {
    const decoded = decodePrompt(log.prompt);
    if (!decoded) continue;
    const sid = decoded.sessionId;
    if (!sessionMap.has(sid)) {
      sessionMap.set(sid, {
        sessionId: sid,
        knowledgeNodeId: log.model || null,
        lastMessageAt: log.createdAt.toISOString(),
        messageCount: 1,
      });
    } else {
      const existing = sessionMap.get(sid)!;
      existing.messageCount++;
    }
  }

  return Array.from(sessionMap.values());
}

export async function deleteSession(
  sessionId: string,
  userId: string,
  prisma: PrismaClient,
): Promise<number> {
  const result = await prisma.aiGenerationLog.deleteMany({
    where: {
      generatorType: 'tutor_chat',
      prompt: { startsWith: `${sessionId}::${userId}::` },
    },
  });
  return result.count;
}
