import { getErrorMessage } from '@/lib/errors';
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
  return Math.ceil((target.getTime() - now.getTime()) / msPerDay);
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
  if (triggers.includes('new_node')) label = '新知识需要首次回忆';
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

    const candidateNodes = await prisma.knowledgeNode.findMany({
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
      orderBy: { createdAt: 'asc' },
      take: Math.max(maxTasks * 8, 80),
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
        const createdTask = await prisma.reviewTask.create({
          data: {
            userId,
            knowledgeNodeId: node.id,
            taskType,
            dueDate: now,
          },
        });
        task = {
          id: createdTask.id,
          taskType: createdTask.taskType,
          completed: createdTask.completed,
          score: createdTask.score,
        };
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
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
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

    let progress;
    try {
      progress = await getOrCreateUserKnowledgeProgress(uid, knowledgeNodeId, prisma);
    } catch (error: unknown) {
      if (getErrorMessage(error) === 'KnowledgeNode not found') {
        return NextResponse.json({ error: '知识点不存在' }, { status: 404 });
      }
      throw error;
    }

    const result = sm2(safeQuality, {
      repetitions: progress.repetitions,
      easeFactor: progress.easeFactor,
      intervalDays: progress.intervalDays,
      lastReviewAt: progress.lastReviewAt,
    });

    await updateUserKnowledgeProgress(uid, knowledgeNodeId, result.state, prisma);

    if (taskId) {
      const updatedTask = await prisma.reviewTask.updateMany({
        where: { id: taskId, userId: uid },
        data: {
          completed: true,
          completedAt: new Date(),
          score: Math.round(safeQuality * 20),
        },
      });
      if (updatedTask.count === 0) {
        return NextResponse.json({ error: 'Review task not found' }, { status: 404 });
      }
    }

    await prisma.reviewLog.create({
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
        repetitions: result.log.repetitions,
        forgetRisk: result.log.forgetRisk,
        durationSeconds: typeof durationSeconds === 'number' ? durationSeconds : null,
      },
    });

    if (quality !== undefined && safeQuality < 3) {
      const severity = safeQuality === 0 ? 5 : safeQuality <= 1 ? 4 : 3;
      const mistakeType =
        safeQuality === 0 ? 'conceptual' : safeQuality <= 1 ? 'application' : 'calculation';

      await prisma.mistakeLog.create({
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
      const nodeForMistake = await prisma.knowledgeNode.findUnique({
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

      await prisma.mistake.create({
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

    return NextResponse.json({
      success: true,
      state: result.state,
      log: result.log,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
