import { getErrorMessage, getErrorStatus } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calcCurrentForgetRisk, getQualityLabel, sm2 } from '@/lib/sm2';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import {
  applyProgressToNode,
  getOrCreateUserKnowledgeProgress,
  updateUserKnowledgeProgress,
} from '@/lib/user-knowledge-progress';

interface ReviewTaskRow {
  id: string;
  taskType: string;
  completed: boolean;
  score: number | null;
}

interface ReviewDueNode {
  id: string;
  title: string;
  summary: string | null;
  difficulty: number;
  icapLevel: string;
  masteryLevel: number;
  repetitions: number;
  easeFactor: number;
  intervalDays: number;
  lastReviewAt: Date | null;
  nextReviewAt: Date | null;
  forgetRisk: number;
  reviewTasks: ReviewTaskRow[];
  currentForgetRisk?: number;
}

interface ReviewReason {
  label: string;
  detail: string;
  riskPercent: number;
  dueInDays: number | null;
  triggers: string[];
  taskType: string;
}

function getReviewTaskType(node: Pick<ReviewDueNode, 'repetitions' | 'easeFactor'>): string {
  if (node.repetitions === 0) return 'passive';
  if (node.repetitions >= 5 && node.easeFactor >= 2.8) return 'interactive';
  if (node.repetitions >= 3 && node.easeFactor >= 2.5) return 'constructive';
  return 'active';
}

function getDaysDelta(target: Date | null, now: Date): number | null {
  if (!target) return null;
  const msPerDay = 24 * 60 * 60 * 1000;
  // Round (was ceil) — ceil made a review due in 1 hour show as
  // "距离到期还有 1 天" because ceil(1/24) = 1. Round gives 0 for
  // anything within ±12h, which the caller's 'dueInDays === 0' branch
  // renders as "今天到期" — a more honest label for short deltas.
  return Math.round((target.getTime() - now.getTime()) / msPerDay);
}

function buildReviewReason(node: ReviewDueNode, taskType: string, now: Date): ReviewReason {
  const risk = node.currentForgetRisk ?? 0;
  const riskPercent = Math.max(0, Math.min(100, Math.round(risk * 100)));
  const dueInDays = getDaysDelta(node.nextReviewAt, now);
  const triggers: string[] = [];

  if (node.repetitions === 0 || !node.lastReviewAt) triggers.push('new_node');
  if (node.nextReviewAt && node.nextReviewAt <= now) triggers.push('due_now');
  if (risk >= 0.3) triggers.push('high_forget_risk');
  if (node.masteryLevel < 60) triggers.push('low_mastery');
  if (taskType === 'constructive' || taskType === 'interactive') triggers.push(`icap_${taskType}`);

  const dueText =
    dueInDays === null
      ? '暂无历史复习计划'
      : dueInDays <= 0
        ? dueInDays === 0
          ? '今天到期'
          : `已逾期 ${Math.abs(dueInDays)} 天`
        : `距离到期还有 ${dueInDays} 天`;
  const masteryText = `掌握度 ${Math.round(node.masteryLevel)}%`;
  const riskText = `遗忘风险 ${riskPercent}%`;

  let label = '按计划复习';
  if (triggers.includes('new_node')) label = '新知识点：先完成首次学习（阅读讲解），再进入间隔复习';
  else if (triggers.includes('high_forget_risk')) label = '遗忘风险正在升高';
  else if (triggers.includes('low_mastery')) label = '掌握度偏低，需要练习';
  else if (triggers.includes('due_now')) label = 'SM-2 建议今天复习';

  return {
    label,
    detail: `${dueText}; ${riskText}; ${masteryText}.`,
    riskPercent,
    dueInDays,
    triggers,
    taskType,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = await resolveUserIdFromRequest(req);
    const mode = searchParams.get('mode') || 'standard';
    const maxTasks = mode === 'basic' ? 5 : mode === 'challenge' ? 12 : 8;
    const now = new Date();

    // 候选池改为查询驱动：不再按 createdAt asc 截断取最旧 80 个节点
    // （旧逻辑下 KnowledgeNode 总数超 80 后，新知识点永远进不了候选池，
    // 最旧 80 个都未到期时复习页返回空）。分两路取候选 id 再合并：
    // 1. userKnowledgeProgress 中 nextReviewAt 已到期（或为 null）的节点；
    // 2. 尚无 progress 记录的新节点（应最优先首次回忆），按创建时间倒序限量。
    const [dueProgressRows, newNodeRows] = await Promise.all([
      prisma.userKnowledgeProgress.findMany({
        where: {
          userId,
          OR: [{ nextReviewAt: { lte: now } }, { nextReviewAt: null }],
        },
        // nulls first：Postgres ASC 默认 NULLS LAST，nextReviewAt=null 的
        // progress 行（仅阅读卡片经 mark-step 产生，从未排期）排在末尾，
        // 到期行超 200 时最先被 take 截掉——与"新内容优先"的设计意图相反
        orderBy: { nextReviewAt: { sort: 'asc', nulls: 'first' } },
        take: 200,
        select: { knowledgeNodeId: true },
      }),
      prisma.knowledgeNode.findMany({
        where: { userProgress: { none: { userId } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true },
      }),
    ]);

    const candidateIds = Array.from(
      new Set([
        ...dueProgressRows.map((row) => row.knowledgeNodeId),
        ...newNodeRows.map((row) => row.id),
      ]),
    );

    const candidateNodes = await prisma.knowledgeNode.findMany({
      where: { id: { in: candidateIds } },
      include: {
        subject: { select: { name: true } },
        chapter: { select: { title: true } },
        userProgress: {
          where: { userId },
          take: 1,
        },
        reviewTasks: {
          where: { userId, completed: false },
          take: 1,
        },
      },
    });

    const dueNodes = candidateNodes
      .map((node) => {
        const { userProgress, ...baseNode } = node;
        return applyProgressToNode(baseNode, userProgress[0]);
      })
      .filter((node) => !node.nextReviewAt || node.nextReviewAt <= now)
      .map((node) => ({
        ...node,
        currentForgetRisk: calcCurrentForgetRisk({
          easeFactor: node.easeFactor,
          repetitions: node.repetitions,
          intervalDays: node.intervalDays,
          lastReviewAt: node.lastReviewAt,
        }),
      }))
      .sort((a, b) => {
        // 新节点（首次回忆）必须排最前：calcCurrentForgetRisk 对
        // lastReviewAt=null 恒返回 0，纯按遗忘风险降序会把新节点压到
        // 队尾被 slice 切掉——候选池注释明言新节点"应最优先首次回忆"。
        const aNew = a.repetitions === 0 || !a.lastReviewAt ? 1 : 0;
        const bNew = b.repetitions === 0 || !b.lastReviewAt ? 1 : 0;
        if (aNew !== bNew) return bNew - aNew;
        if ((b.currentForgetRisk ?? 0) !== (a.currentForgetRisk ?? 0)) {
          return (b.currentForgetRisk ?? 0) - (a.currentForgetRisk ?? 0);
        }
        if (!a.nextReviewAt && b.nextReviewAt) return -1;
        if (a.nextReviewAt && !b.nextReviewAt) return 1;
        return (a.nextReviewAt?.getTime() ?? 0) - (b.nextReviewAt?.getTime() ?? 0);
      })
      .slice(0, maxTasks);

    const tasks = [];
    for (const node of dueNodes) {
      let task: ReviewTaskRow | undefined = node.reviewTasks[0];

      if (!task) {
        const taskType = getReviewTaskType(node);
        // 检查 + 创建包进 Serializable 事务：双击/预取/多标签并发时，
        // 先查后建无事务会为同一 user+node 建出多条未完成 ReviewTask。
        try {
          task = await prisma.$transaction(
            async (tx) => {
              const existingTask = await tx.reviewTask.findFirst({
                where: { userId, knowledgeNodeId: node.id, completed: false },
              });
              if (existingTask) {
                return {
                  id: existingTask.id,
                  taskType: existingTask.taskType,
                  completed: existingTask.completed,
                  score: existingTask.score,
                };
              }
              const createdTask = await tx.reviewTask.create({
                data: {
                  userId,
                  knowledgeNodeId: node.id,
                  taskType,
                  dueDate: now,
                },
              });
              return {
                id: createdTask.id,
                taskType: createdTask.taskType,
                completed: createdTask.completed,
                score: createdTask.score,
              };
            },
            { isolationLevel: 'Serializable' },
          );
        } catch (error: unknown) {
          // Serializable 冲突（P2034/40001）：并发请求已建好任务，重新查询返回已有任务。
          // 与同文件 POST 及 mistakes/[id]/review 一致，两个码都要处理
          const code = (error as { code?: string } | null)?.code;
          if (code !== 'P2034' && code !== '40001') throw error;
          const existingTask = await prisma.reviewTask.findFirst({
            where: { userId, knowledgeNodeId: node.id, completed: false },
          });
          if (!existingTask) throw error;
          task = {
            id: existingTask.id,
            taskType: existingTask.taskType,
            completed: existingTask.completed,
            score: existingTask.score,
          };
        }
      }

      tasks.push({
        id: task.id,
        knowledgeNodeId: node.id,
        taskType: task.taskType,
        completed: task.completed,
        score: task.score,
        knowledgeNode: {
          id: node.id,
          title: node.title,
          summary: node.summary,
          difficulty: node.difficulty,
          icapLevel: node.icapLevel,
          masteryLevel: node.masteryLevel,
          repetitions: node.repetitions,
          easeFactor: node.easeFactor,
          intervalDays: node.intervalDays,
          lastReviewAt: node.lastReviewAt,
          nextReviewAt: node.nextReviewAt,
          forgetRisk: node.currentForgetRisk,
        },
        reviewReason: buildReviewReason(node, task.taskType, now),
      });
    }

    return NextResponse.json({
      tasks,
      sessionId: `session-${Date.now()}`,
      mode,
      total: tasks.length,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: getErrorStatus(error) });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: '请求体必须是 JSON 对象' }, { status: 400 });
    }
    const { taskId, quality, knowledgeNodeId, durationSeconds } = body;
    const uid = await resolveUserIdFromRequest(req);

    if (typeof knowledgeNodeId !== 'string' || !knowledgeNodeId) {
      return NextResponse.json({ error: 'knowledgeNodeId is required' }, { status: 400 });
    }

    // quality is REQUIRED — silently defaulting to 3 (the SM-2 "correct
    // recall" threshold) was a footgun: a passive "mark as reviewed"
    // button or a buggy client would advance the schedule as if the
    // student recalled it perfectly. Force the caller to declare the
    // actual quality score.
    if (typeof quality !== 'number' || !Number.isFinite(quality)) {
      return NextResponse.json(
        { error: 'quality is required (number 0-5)' },
        { status: 400 },
      );
    }
    const safeQuality = Math.max(0, Math.min(5, Math.round(quality)));

    // 先校验 taskId 再推进 SM-2：旧逻辑先推进排程后 updateMany 校验，
    // 传不存在/他人的 taskId 时进度已被推进且无 reviewLog；重试同一
    // taskId 还会反复推进排程。
    if (taskId) {
      const existingTask = await prisma.reviewTask.findFirst({
        where: { id: taskId, userId: uid },
        select: { id: true, completed: true, knowledgeNodeId: true },
      });
      if (!existingTask) {
        return NextResponse.json({ error: 'Review task not found' }, { status: 404 });
      }
      // taskId 必须属于本次提交的 knowledgeNodeId：否则会把 A 节点的任务
      // 标完成（实际未学），同时推进 B 节点的 SM-2 进度（张冠李戴）
      if (existingTask.knowledgeNodeId !== knowledgeNodeId) {
        return NextResponse.json({ error: 'taskId 与 knowledgeNodeId 不匹配' }, { status: 400 });
      }
      if (existingTask.completed) {
        // 幂等：任务已完成，直接返回成功，不再推进 SM-2、不重复写 reviewLog
        return NextResponse.json({ success: true, alreadyCompleted: true });
      }
    }

    // 读进度 → SM-2 计算 → 全部写入放进同一 Serializable 事务，并在事务内
    // 复查 task.completed：此前进度读在事务外、完成检查也在事务外，并发双交
    // （双击/重试）会基于同一快照重复推进排程、写 2 条 reviewLog（quality<3
    // 时还有 2 条 mistakeLog + 2 条错题）。冲突（P2034/40001）整体重试一次，
    // 重试时事务内复查会命中"已完成"幂等返回。
    const runReview = () =>
      prisma.$transaction(
        async (tx) => {
          if (taskId) {
            const task = await tx.reviewTask.findFirst({
              where: { id: taskId, userId: uid },
              select: { completed: true },
            });
            if (!task || task.completed) return { kind: 'alreadyCompleted' as const };
          }

          const progress = await getOrCreateUserKnowledgeProgress(
            uid,
            knowledgeNodeId,
            tx as unknown as typeof prisma,
          );

          const result = sm2(safeQuality, {
            repetitions: progress.repetitions,
            easeFactor: progress.easeFactor,
            intervalDays: progress.intervalDays,
            lastReviewAt: progress.lastReviewAt,
          });

          // progress 更新 + task 完成 + reviewLog 创建必须原子提交，
          // 避免中途失败留下"进度已推进但任务未完成/无日志"的中间态。
          await updateUserKnowledgeProgress(uid, knowledgeNodeId, result.state, tx as unknown as typeof prisma);

          if (taskId) {
            await tx.reviewTask.updateMany({
              where: { id: taskId, userId: uid, knowledgeNodeId, completed: false },
              data: {
                completed: true,
                completedAt: new Date(),
                score: Math.round(safeQuality * 20),
              },
            });
          }

          await tx.reviewLog.create({
            data: {
              userId: uid,
              knowledgeNodeId,
              action: quality !== undefined ? 'solved' : 'reviewed',
              quality: result.log.quality,
              masteryBefore: progress.masteryLevel,
              masteryAfter: result.state.masteryLevel,
              easeFactorBefore: result.log.easeFactorBefore,
              easeFactorAfter: result.log.easeFactorAfter,
              intervalBefore: result.log.intervalBefore,
              intervalAfter: result.log.intervalAfter,
              // After value: matches the ReviewLog.repetitions schema comment
              // ('本次复习时的连续正确次数' = the count as of this review).
              repetitions: result.log.repetitionsAfter,
              forgetRisk: result.log.forgetRisk,
              durationSeconds: typeof durationSeconds === 'number' ? durationSeconds : null,
            },
          });

          if (quality !== undefined && safeQuality < 3) {
            const severity = safeQuality === 0 ? 5 : safeQuality <= 1 ? 4 : 3;
            const mistakeType =
              safeQuality === 0 ? 'conceptual' : safeQuality <= 1 ? 'application' : 'calculation';

            await tx.mistakeLog.create({
              data: {
                userId: uid,
                knowledgeNodeId,
                mistakeType,
                severity,
                triggerCount: 1,
              },
            });

            // SM-2 review failures aren't tied to a specific Question row (the
            // student self-rates recall quality), so there's no real "question
            // stem" to record. Previously this wrote the raw knowledgeNodeId
            // (a UUID) as questionText, which showed up in the mistake book as
            // an unreadable string. Fetch the knowledge node's title + subject
            // so the mistake book entry is actionable: the student can see
            // WHICH knowledge point they forgot and go back to review it.
            const nodeForMistake = await tx.knowledgeNode.findUnique({
              where: { id: knowledgeNodeId },
              select: {
                title: true,
                summary: true,
                subject: { select: { name: true } },
              },
            });
            const nodeTitle = nodeForMistake?.title ?? '未知知识点';
            const subjectName = nodeForMistake?.subject?.name ?? '';
            const nextReviewDate = result.state.nextReviewAt?.toISOString().split('T')[0] ?? '未知';

            await tx.mistake.create({
              data: {
                userId: uid,
                knowledgeNodeId,
                questionText: `[${subjectName}] ${nodeTitle}${
                  nodeForMistake?.summary ? `\n${nodeForMistake.summary.slice(0, 120)}` : ''
                }`,
                wrongAnswer: `复习时回忆失败（质量评分 ${safeQuality}/5：${getQualityLabel(safeQuality)}）`,
                correctAnswer: `已重新调度，下次复习：${nextReviewDate}。建议回到该知识点重新学习。`,
                mistakeType,
              },
            });
          }

          return { kind: 'completed' as const, result };
        },
        { isolationLevel: 'Serializable' },
      );

    let outcome;
    try {
      outcome = await runReview();
    } catch (error: unknown) {
      if (getErrorMessage(error) === 'KnowledgeNode not found') {
        return NextResponse.json({ error: '知识点不存在' }, { status: 404 });
      }
      const code = (error as { code?: string })?.code;
      if (code !== 'P2034' && code !== '40001') throw error;
      // Serializable 冲突：整体重试一次，事务内复查会幂等处理并发已完成
      outcome = await runReview();
    }

    if (outcome.kind === 'alreadyCompleted') {
      return NextResponse.json({ success: true, alreadyCompleted: true });
    }

    return NextResponse.json({
      success: true,
      state: outcome.result.state,
      log: outcome.result.log,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: getErrorStatus(error) });
  }
}
