import { getErrorMessage } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';

type LearningStep = 'read' | 'practiced';

const VALID_STEPS = new Set<LearningStep>(['read', 'practiced']);

/**
 * POST /api/progress/mark-step
 *
 * 幂等地把"学习完成度"某一步标记为已完成（首次）。
 * 用于 cards 页的"学习清单"组件：阅读卡 3s 后标记 read；答对 1 题后标记 practiced。
 *
 * Body: { nodeId: string, step: 'read' | 'practiced' }
 *
 * Response: { readCompletedAt, practicedCompletedAt }  // 当前的真实时间戳
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserIdFromRequest(req);
    const body = (await req.json().catch(() => ({}))) as {
      nodeId?: unknown;
      step?: unknown;
    };

    const nodeId = typeof body.nodeId === 'string' ? body.nodeId.trim() : '';
    const step = typeof body.step === 'string' ? (body.step as LearningStep) : null;

    if (!nodeId) {
      return NextResponse.json({ error: 'nodeId is required' }, { status: 400 });
    }
    if (!step || !VALID_STEPS.has(step)) {
      return NextResponse.json(
        { error: 'step must be "read" or "practiced"' },
        { status: 400 },
      );
    }

    // 确认节点存在（防误传）
    const node = await prisma.knowledgeNode.findUnique({
      where: { id: nodeId },
      select: { id: true },
    });
    if (!node) {
      return NextResponse.json({ error: 'KnowledgeNode not found' }, { status: 404 });
    }

    // getOrCreate：没有就建一条空 progress
    const progress = await prisma.userKnowledgeProgress.upsert({
      where: { userId_knowledgeNodeId: { userId, knowledgeNodeId: nodeId } },
      create: { userId, knowledgeNodeId: nodeId },
      update: {},
    });

    // 幂等：仅在未完成时写入
    const fieldName = step === 'read' ? 'readCompletedAt' : 'practicedCompletedAt';
    const updated = progress[fieldName]
      ? progress
      : await prisma.userKnowledgeProgress.update({
          where: { id: progress.id },
          data: { [fieldName]: new Date() },
        });

    return NextResponse.json({
      readCompletedAt: updated.readCompletedAt,
      practicedCompletedAt: updated.practicedCompletedAt,
      justMarked: !progress[fieldName],
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    return NextResponse.json(
      { error: message },
      { status: message === 'Authentication required' ? 401 : 500 },
    );
  }
}
