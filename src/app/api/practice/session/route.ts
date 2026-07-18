import { getErrorMessage } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { applyProgressToNode } from '@/lib/user-knowledge-progress';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * All four ICAP levels, in order from least to most demanding.
 * `ReviewTask.taskType` stores the **lowercase** form in the database.
 */
const ICAP_TASK_TYPES = ['passive', 'active', 'constructive', 'interactive'] as const;

/** PascalCase display form for each task type. */
const ICAP_PASCAL: Record<string, string> = {
  passive: 'Passive',
  active: 'Active',
  constructive: 'Constructive',
  interactive: 'Interactive',
};

// ---------------------------------------------------------------------------
// POST /api/practice/session
//
// Body: { userId?, knowledgeNodeId, forceNew? }
//
// Starts a new ICAP practice session by creating one ReviewTask for every
// ICAP level (4 tasks total).  If an active incomplete session already
// exists for this user + node, it is returned as-is unless `forceNew: true`
// is set (in which case stale tasks are deleted first).
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { knowledgeNodeId, forceNew = false } = body;

    // --- validation ---
    if (!knowledgeNodeId) {
      return NextResponse.json(
        { error: 'knowledgeNodeId is required' },
        { status: 400 },
      );
    }

    // --- resolve user ---
    const uid = await resolveUserIdFromRequest(req);

    // --- fetch knowledge node (sanity check) ---
    const knowledgeNode = await prisma.knowledgeNode.findUnique({
      where: { id: knowledgeNodeId },
      select: {
        id: true,
        title: true,
        summary: true,
        difficulty: true,
        masteryLevel: true,
        repetitions: true,
        easeFactor: true,
        intervalDays: true,
        nextReviewAt: true,
        lastReviewAt: true,
        forgetRisk: true,
        icapLevel: true,
        userProgress: {
          where: { userId: uid },
          take: 1,
        },
        subject: { select: { id: true, name: true } },
      },
    });

    if (!knowledgeNode) {
      return NextResponse.json(
        { error: `KnowledgeNode "${knowledgeNodeId}" not found` },
        { status: 404 },
      );
    }

    const progressAwareNode = applyProgressToNode(knowledgeNode, knowledgeNode.userProgress[0]);

    // --- check for existing active session ---
    const existingIncomplete = await prisma.reviewTask.findMany({
      where: {
        userId: uid,
        knowledgeNodeId,
        completed: false,
      },
      select: { taskType: true, id: true },
    });

    if (!forceNew && existingIncomplete.length > 0) {
      // Reuse the incomplete tasks and only back-fill the taskTypes that
      // are missing. Previously a partially-completed session (any one of
      // the 4 tasks done) fell through to the create path below, stacking
      // 4 fresh tasks on top of the stale ones on every refresh.
      const existingLevels = new Set(
        existingIncomplete.map((t: { taskType: string }) => t.taskType),
      );
      const missingLevels = ICAP_TASK_TYPES.filter((level) => !existingLevels.has(level));

      if (missingLevels.length > 0) {
        const now = new Date();
        await Promise.all(
          missingLevels.map((taskType) =>
            prisma.reviewTask.create({
              data: {
                userId: uid,
                knowledgeNodeId,
                taskType,
                dueDate: now,
              },
            }),
          ),
        );
      }

      // Return the merged session (existing + just back-filled tasks)
      const tasks = await prisma.reviewTask.findMany({
        where: {
          userId: uid,
          knowledgeNodeId,
          completed: false,
        },
        orderBy: { createdAt: 'asc' },
      });

      return NextResponse.json(buildSessionResponse(progressAwareNode, tasks, 'active'));
    }

    // --- fresh session (or forceNew): delete stale tasks + create 4 new
    // ones atomically, so a mid-way failure can't leave a half session ---
    const now = new Date();
    const tasks = await prisma.$transaction(async (tx) => {
      if (forceNew) {
        await tx.reviewTask.deleteMany({
          where: {
            userId: uid,
            knowledgeNodeId,
            completed: false,
          },
        });
      }

      return Promise.all(
        ICAP_TASK_TYPES.map((taskType) =>
          tx.reviewTask.create({
            data: {
              userId: uid,
              knowledgeNodeId,
              taskType,
              dueDate: now,
            },
          }),
        ),
      );
    });

    return NextResponse.json(buildSessionResponse(progressAwareNode, tasks, 'active'));
  } catch (error: unknown) {
    console.error('[practice/session POST]', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Internal server error') },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Response builder
// ---------------------------------------------------------------------------

interface NodeInfo {
  id: string;
  title: string;
  summary: string | null;
  difficulty: number;
  masteryLevel: number;
  icapLevel: string;
  subject: { id: string; name: string } | null;
}

interface TaskRow {
  id: string;
  taskType: string;
  completed: boolean;
  score: number | null;
}

function buildSessionResponse(
  knowledgeNode: NodeInfo,
  tasks: TaskRow[],
  status: string,
) {
  const sessionId = `session-${knowledgeNode.id}-${Date.now()}`;

  return {
    sessionId,
    status,
    knowledgeNode: {
      id: knowledgeNode.id,
      title: knowledgeNode.title,
      summary: knowledgeNode.summary,
      difficulty: knowledgeNode.difficulty,
      masteryLevel: knowledgeNode.masteryLevel,
      icapLevel: knowledgeNode.icapLevel,
      subject: knowledgeNode.subject,
    },
    tasks: tasks.map((t) => ({
      id: t.id,
      taskType: t.taskType,
      icapLevel: ICAP_PASCAL[t.taskType] || t.taskType,
      completed: t.completed,
      score: t.score,
    })),
    levels: ICAP_TASK_TYPES.map((tt) => ({
      taskType: tt,
      icapLevel: ICAP_PASCAL[tt],
    })),
  };
}
