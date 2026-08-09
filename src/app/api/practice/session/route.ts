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

    // --- 检查 → 复用/补建/新建整体放进 Serializable 事务：并发首建
    // （双击/多标签）会双双看到"无未完成会话"各建 4 个任务 = 8 个；
    // 冲突（P2034/40001）重试时重读命中已有会话，走复用分支 ---
    const runSession = () =>
      prisma.$transaction(
        async (tx) => {
          // --- check for existing active session ---
          const existingIncomplete = await tx.reviewTask.findMany({
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
            }

            // Return the merged session (existing + just back-filled tasks)
            return tx.reviewTask.findMany({
              where: {
                userId: uid,
                knowledgeNodeId,
                completed: false,
              },
              orderBy: { createdAt: 'asc' },
            });
          }

          // --- fresh session (or forceNew): delete stale tasks + create 4
          // new ones atomically, so a mid-way failure can't leave a half
          // session ---
          const now = new Date();
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
        },
        { isolationLevel: 'Serializable' },
      );

    let tasks;
    try {
      tasks = await runSession();
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      if (code !== 'P2034' && code !== '40001') throw error;
      // Serializable 冲突：并发请求已建好会话，重试会走复用分支返回它
      tasks = await runSession();
    }

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
