import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sm2, calcCurrentForgetRisk } from '@/lib/sm2';

// GET /api/review — 获取待复习知识点
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let userId = searchParams.get('userId') || 'default-user';
    // 如果不是真实用户 ID，查找第一个用户作为默认
    if (userId === 'default-user') {
      const defaultUser = await prisma.user.findFirst({ select: { id: true } });
      if (defaultUser) userId = defaultUser.id;
    }
    const mode = searchParams.get('mode') || 'standard';
    const maxTasks = mode === 'basic' ? 5 : mode === 'challenge' ? 12 : 8;

    const now = new Date();

    // 1. 查找到期 SM-2 任务 (nextReviewAt <= now 或从未复习)
    const dueNodes = await prisma.knowledgeNode.findMany({
      where: {
        OR: [
          { nextReviewAt: null },
          { nextReviewAt: { lte: now } },
        ],
      },
      include: {
        subject: { select: { name: true } },
        chapter: { select: { title: true } },
        reviewTasks: {
          where: { userId, completed: false },
          take: 1,
        },
      },
      orderBy: [
        { forgetRisk: 'desc' },
        { nextReviewAt: { sort: 'asc', nulls: 'first' } },
      ],
      take: maxTasks,
    });

    // 2. 计算遗忘风险
    const nodesWithRisk = dueNodes.map((node) => ({
      ...node,
      currentForgetRisk: calcCurrentForgetRisk({
        easeFactor: node.easeFactor,
        repetitions: node.repetitions,
        intervalDays: node.intervalDays,
        lastReviewAt: node.lastReviewAt,
      }),
    }));

    // 3. 创建或复用 ReviewTask
    const tasks = [];
    for (const node of nodesWithRisk) {
      let task = node.reviewTasks[0];

      if (!task) {
        // 确定任务类型
        let taskType = 'active';
        if (node.repetitions === 0) taskType = 'passive';
        else if (node.repetitions >= 3 && node.easeFactor >= 2.5) taskType = 'constructive';
        else if (node.repetitions >= 5 && node.easeFactor >= 2.8) taskType = 'interactive';

        task = await prisma.reviewTask.create({
          data: {
            userId,
            knowledgeNodeId: node.id,
            taskType,
            dueDate: now,
          },
        });
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
          // SM-2 状态
          repetitions: node.repetitions,
          easeFactor: node.easeFactor,
          intervalDays: node.intervalDays,
          lastReviewAt: node.lastReviewAt,
          nextReviewAt: node.nextReviewAt,
          forgetRisk: node.currentForgetRisk,
        },
      });
    }

    return NextResponse.json({
      tasks,
      sessionId: `session-${Date.now()}`,
      mode,
      total: tasks.length,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/review — 提交复习结果（SM-2 调度）
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      taskId,
      quality,        // SM-2 质量评分 0-5
      knowledgeNodeId,
      userId,
      durationSeconds,
    } = body;

    let uid = userId || 'default-user';
    if (uid === 'default-user') {
      const defaultUser = await prisma.user.findFirst({ select: { id: true } });
      if (defaultUser) uid = defaultUser.id;
    }

    // 1. 获取知识点当前 SM-2 状态
    const node = await prisma.knowledgeNode.findUnique({
      where: { id: knowledgeNodeId },
      select: {
        id: true,
        repetitions: true,
        easeFactor: true,
        intervalDays: true,
        lastReviewAt: true,
        masteryLevel: true,
      },
    });

    if (!node) {
      return NextResponse.json({ error: '知识点不存在' }, { status: 404 });
    }

    // 2. 执行 SM-2 + 艾宾浩斯计算
    const result = sm2(quality ?? 3, {
      repetitions: node.repetitions,
      easeFactor: node.easeFactor,
      intervalDays: node.intervalDays,
      lastReviewAt: node.lastReviewAt,
    });

    // 3. 更新知识点
    await prisma.knowledgeNode.update({
      where: { id: knowledgeNodeId },
      data: {
        repetitions: result.state.repetitions,
        easeFactor: result.state.easeFactor,
        intervalDays: result.state.intervalDays,
        nextReviewAt: result.state.nextReviewAt,
        lastReviewAt: result.state.lastReviewAt,
        forgetRisk: result.state.forgetRisk,
        masteryLevel: result.state.masteryLevel,
      },
    });

    // 4. 更新 ReviewTask
    if (taskId) {
      await prisma.reviewTask.update({
        where: { id: taskId },
        data: {
          completed: true,
          completedAt: new Date(),
          score: quality !== undefined ? Math.round(quality * 20) : null,
        },
      });
    }

    // 5. 写入 ReviewLog（含 SM-2 快照）
    await prisma.reviewLog.create({
      data: {
        userId: uid,
        knowledgeNodeId,
        action: quality !== undefined ? 'solved' : 'reviewed',
        quality: result.log.quality,
        masteryBefore: node.masteryLevel,
        masteryAfter: result.state.masteryLevel,
        easeFactorBefore: result.log.easeFactorBefore,
        easeFactorAfter: result.log.easeFactorAfter,
        intervalBefore: result.log.intervalBefore,
        intervalAfter: result.log.intervalAfter,
        repetitions: result.log.repetitions,
        forgetRisk: result.log.forgetRisk,
        durationSeconds: durationSeconds || null,
      },
    });

    // 6. 如果质量 < 3，写入 MistakeLog
    if (quality !== undefined && quality < 3) {
      const severity = quality === 0 ? 5 : quality === 1 ? 4 : 3;
      await prisma.mistakeLog.create({
        data: {
          userId: uid,
          knowledgeNodeId,
          mistakeType: quality === 0 ? 'conceptual' : quality === 1 ? 'application' : 'calculation',
          severity,
          triggerCount: 1,
        },
      });

      // 也写入旧的 Mistake 表（兼容）
      await prisma.mistake.create({
        data: {
          userId: uid,
          knowledgeNodeId,
          questionText: `[SM-2 复习] ${node.id}`,
          wrongAnswer: `质量评分: ${quality}/5`,
          correctAnswer: `已重新调度，下次复习: ${result.state.nextReviewAt?.toISOString().split('T')[0]}`,
          mistakeType: quality === 0 ? 'conceptual' : quality === 1 ? 'application' : 'calculation',
        },
      });
    }

    return NextResponse.json({
      success: true,
      state: result.state,
      log: result.log,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
