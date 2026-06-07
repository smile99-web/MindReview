import type { PrismaClient } from '@prisma/client';

export interface UserKnowledgeProgressState {
  masteryLevel: number;
  repetitions: number;
  easeFactor: number;
  intervalDays: number;
  nextReviewAt: Date | null;
  lastReviewAt: Date | null;
  forgetRisk: number;
}

interface KnowledgeNodeProgressSeed extends UserKnowledgeProgressState {
  id: string;
}

export interface ProgressAwareNode {
  id: string;
  masteryLevel: number;
  repetitions: number;
  easeFactor: number;
  intervalDays: number;
  nextReviewAt: Date | null;
  lastReviewAt: Date | null;
  forgetRisk: number;
}

function toProgressState(seed: KnowledgeNodeProgressSeed): UserKnowledgeProgressState {
  return {
    masteryLevel: seed.masteryLevel,
    repetitions: seed.repetitions,
    easeFactor: seed.easeFactor,
    intervalDays: seed.intervalDays,
    nextReviewAt: seed.nextReviewAt,
    lastReviewAt: seed.lastReviewAt,
    forgetRisk: seed.forgetRisk,
  };
}

export async function getOrCreateUserKnowledgeProgress(
  userId: string,
  knowledgeNodeId: string,
  prisma: PrismaClient,
): Promise<UserKnowledgeProgressState> {
  const existing = await prisma.userKnowledgeProgress.findUnique({
    where: { userId_knowledgeNodeId: { userId, knowledgeNodeId } },
  });

  if (existing) {
    return existing;
  }

  const node = await prisma.knowledgeNode.findUnique({
    where: { id: knowledgeNodeId },
    select: {
      id: true,
      masteryLevel: true,
      repetitions: true,
      easeFactor: true,
      intervalDays: true,
      nextReviewAt: true,
      lastReviewAt: true,
      forgetRisk: true,
    },
  });

  if (!node) {
    throw new Error('KnowledgeNode not found');
  }

  return prisma.userKnowledgeProgress.upsert({
    where: { userId_knowledgeNodeId: { userId, knowledgeNodeId } },
    update: {},
    create: {
      userId,
      knowledgeNodeId,
      ...toProgressState(node),
    },
  });
}

export async function updateUserKnowledgeProgress(
  userId: string,
  knowledgeNodeId: string,
  state: UserKnowledgeProgressState,
  prisma: PrismaClient,
) {
  return prisma.userKnowledgeProgress.upsert({
    where: { userId_knowledgeNodeId: { userId, knowledgeNodeId } },
    update: state,
    create: {
      userId,
      knowledgeNodeId,
      ...state,
    },
  });
}

export function applyProgressToNode<T extends ProgressAwareNode>(
  node: T,
  progress?: Partial<UserKnowledgeProgressState> | null,
): T {
  if (!progress) return node;

  return {
    ...node,
    masteryLevel: progress.masteryLevel ?? node.masteryLevel,
    repetitions: progress.repetitions ?? node.repetitions,
    easeFactor: progress.easeFactor ?? node.easeFactor,
    intervalDays: progress.intervalDays ?? node.intervalDays,
    nextReviewAt: progress.nextReviewAt ?? node.nextReviewAt,
    lastReviewAt: progress.lastReviewAt ?? node.lastReviewAt,
    forgetRisk: progress.forgetRisk ?? node.forgetRisk,
  };
}

export async function loadProgressByNodeId(
  userId: string,
  knowledgeNodeIds: string[],
  prisma: PrismaClient,
): Promise<Map<string, UserKnowledgeProgressState>> {
  if (knowledgeNodeIds.length === 0) {
    return new Map();
  }

  const rows = await prisma.userKnowledgeProgress.findMany({
    where: { userId, knowledgeNodeId: { in: knowledgeNodeIds } },
  });

  return new Map(rows.map((row) => [row.knowledgeNodeId, row]));
}
