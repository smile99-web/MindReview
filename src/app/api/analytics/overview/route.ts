import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { loadProgressByNodeId } from '@/lib/user-knowledge-progress';
import { appDateKey, startOfAppDay } from '@/lib/date-utils';
import { getErrorMessage } from '@/lib/errors';

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserIdFromRequest(req);
    const now = new Date();

    // Date ranges
    const days30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const days7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Fetch all base data in parallel
    const [
      allNodes,
      subjects,
      reviewLogs30d,
      mistakes,
      mistakeLogs30d,
      reviewTasks,
      studyTimeLogs30d,
    ] = await Promise.all([
      prisma.knowledgeNode.findMany({
        select: {
          id: true,
          masteryLevel: true,
          difficulty: true,
          icapLevel: true,
          easeFactor: true,
          intervalDays: true,
          repetitions: true,
          forgetRisk: true,
          nextReviewAt: true,
          subjectId: true,
          createdAt: true,
        },
      }),
      prisma.subject.findMany({
        select: { id: true, name: true, icon: true, colorClass: true },
        orderBy: { name: 'asc' },
      }),
      prisma.reviewLog.findMany({
        where: {
          userId,
          createdAt: { gte: days30Ago },
        },
        select: {
          id: true,
          action: true,
          quality: true,
          easeFactorBefore: true,
          easeFactorAfter: true,
          intervalAfter: true,
          durationSeconds: true,
          createdAt: true,
          knowledgeNode: {
            select: { id: true, title: true, subjectId: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.mistake.findMany({
        where: { userId },
        select: {
          id: true,
          mistakeType: true,
          resolved: true,
          subjectId: true,
          createdAt: true,
        },
      }),
      prisma.mistakeLog.findMany({
        where: {
          userId,
          createdAt: { gte: days30Ago },
        },
        select: {
          id: true,
          mistakeType: true,
          severity: true,
          createdAt: true,
        },
      }),
      prisma.reviewTask.findMany({
        where: { userId },
        select: {
          id: true,
          completed: true,
          dueDate: true,
          completedAt: true,
          score: true,
          taskType: true,
          createdAt: true,
        },
      }),
      // 学习时长心跳 —— 用 startedAt 锚定"哪一天"，与 dailyActivity / 总时长一致
      prisma.studyTimeLog.findMany({
        where: {
          userId,
          startedAt: { gte: days30Ago },
        },
        select: {
          id: true,
          startedAt: true,
          durationSeconds: true,
        },
      }),
    ]);

    // Re-fetch progress correctly
    const nodeIds = allNodes.map((n) => n.id);
    const progressByNodeId = await loadProgressByNodeId(userId, nodeIds, prisma);

    // --- 1. Daily Review Activity (30 days, inclusive of today) ---
    // 全项目统一按 UTC+8 日界切"天"（用户在中国）：用 appDateKey 取日期 key、
    // startOfAppDay 取当日零点。中国无夏令时，相邻零点恰好相隔 24h，可直接加减天数。
    // count = 复习次数（来自 ReviewLog），duration = 实际学习时长（来自 StudyTimeLog）。
    const todayKey = appDateKey(now);
    const startOfToday = startOfAppDay(todayKey);
    const dailyActivityMap = new Map<string, { count: number; duration: number }>();
    for (let i = 0; i < 31; i++) {
      const d = new Date(startOfToday.getTime() - (30 - i) * 24 * 60 * 60 * 1000);
      dailyActivityMap.set(appDateKey(d), { count: 0, duration: 0 });
    }
    for (const log of reviewLogs30d) {
      const key = appDateKey(log.createdAt);
      const entry = dailyActivityMap.get(key);
      if (entry) {
        entry.count += 1;
      }
    }
    for (const log of studyTimeLogs30d) {
      const key = appDateKey(log.startedAt);
      const entry = dailyActivityMap.get(key);
      if (entry) {
        entry.duration += log.durationSeconds || 0;
      }
    }
    const dailyActivity = Array.from(dailyActivityMap.entries()).map(([date, data]) => ({
      date,
      count: data.count,
      durationMinutes: Math.round((data.duration / 60) * 10) / 10,
    }));

    // --- 2. Mastery Distribution by Subject ---
    const subjectMastery = subjects.map((subject) => {
      const subjectNodes = allNodes.filter((n) => n.subjectId === subject.id);
      const values = subjectNodes.map(
        (node) => progressByNodeId.get(node.id)?.masteryLevel ?? node.masteryLevel,
      );
      const avgMastery =
        values.length > 0
          ? Math.round(values.reduce((s, v) => s + v, 0) / values.length)
          : 0;
      const low = values.filter((v) => v < 34).length;
      const medium = values.filter((v) => v >= 34 && v < 67).length;
      const high = values.filter((v) => v >= 67).length;
      return {
        id: subject.id,
        name: subject.name,
        icon: subject.icon,
        colorClass: subject.colorClass,
        averageMastery: avgMastery,
        nodeCount: subjectNodes.length,
        lowMastery: low,
        mediumMastery: medium,
        highMastery: high,
      };
    });

    // --- 3. Mistake Type Breakdown ---
    const mistakeTypeMap: Record<string, number> = {};
    for (const m of mistakes) {
      const type = m.mistakeType || 'unknown';
      mistakeTypeMap[type] = (mistakeTypeMap[type] || 0) + 1;
    }
    const totalMistakes = mistakes.length;
    const mistakeTypeBreakdown = Object.entries(mistakeTypeMap).map(([type, count]) => ({
      type,
      count,
      percentage: totalMistakes > 0 ? Math.round((count / totalMistakes) * 100) : 0,
    }));
    const resolvedMistakes = mistakes.filter((m) => m.resolved).length;

    // Mistake trend (last 7 days, inclusive of today)
    const last7DailyMistakes: { date: string; count: number }[] = [];
    for (let i = 0; i < 8; i++) {
      const d = new Date(startOfToday.getTime() - (7 - i) * 24 * 60 * 60 * 1000);
      const key = appDateKey(d);
      const count = mistakeLogs30d.filter(
        (m) => appDateKey(m.createdAt) === key,
      ).length;
      last7DailyMistakes.push({ date: key, count });
    }

    // --- 4. ICAP Level Distribution ---
    const icapMap: Record<string, number> = {};
    for (const node of allNodes) {
      const level = node.icapLevel || 'Active';
      icapMap[level] = (icapMap[level] || 0) + 1;
    }
    const icapDistribution = Object.entries(icapMap).map(([level, count]) => ({
      level,
      count,
      percentage: allNodes.length > 0 ? Math.round((count / allNodes.length) * 100) : 0,
    }));

    // --- 5. SM-2 Memory Statistics ---
    const nodesWithProgress = allNodes.map((node) => ({
      easeFactor: progressByNodeId.get(node.id)?.easeFactor ?? node.easeFactor,
      intervalDays: progressByNodeId.get(node.id)?.intervalDays ?? node.intervalDays,
      repetitions: progressByNodeId.get(node.id)?.repetitions ?? node.repetitions,
      forgetRisk: progressByNodeId.get(node.id)?.forgetRisk ?? node.forgetRisk,
      masteryLevel: progressByNodeId.get(node.id)?.masteryLevel ?? node.masteryLevel,
    }));
    const avgEaseFactor =
      nodesWithProgress.length > 0
        ? Math.round(
            (nodesWithProgress.reduce((s, n) => s + n.easeFactor, 0) /
              nodesWithProgress.length) *
              100,
          ) / 100
        : 0;
    const avgInterval =
      nodesWithProgress.length > 0
        ? Math.round(
            nodesWithProgress.reduce((s, n) => s + n.intervalDays, 0) /
              nodesWithProgress.length,
          )
        : 0;
    const avgForgetRisk =
      nodesWithProgress.length > 0
        ? Math.round(
            (nodesWithProgress.reduce((s, n) => s + n.forgetRisk, 0) /
              nodesWithProgress.length) *
              100,
          )
        : 0;
    const nodesDueToday = allNodes.filter((n) => {
      const next = progressByNodeId.get(n.id)?.nextReviewAt ?? n.nextReviewAt;
      return next && new Date(next) <= now;
    }).length;

    // Ease factor distribution buckets
    const easeBuckets = { low: 0, normal: 0, easy: 0 };
    for (const n of nodesWithProgress) {
      if (n.easeFactor < 2.0) easeBuckets.low += 1;
      else if (n.easeFactor < 2.8) easeBuckets.normal += 1;
      else easeBuckets.easy += 1;
    }

    // --- 6. Knowledge Node Growth (last 30 days, inclusive of today) ---
    const nodeGrowthByDay: { date: string; count: number }[] = [];
    for (let i = 0; i < 31; i++) {
      const d = new Date(startOfToday.getTime() - (30 - i) * 24 * 60 * 60 * 1000);
      const key = appDateKey(d);
      const nextD = new Date(d.getTime() + 24 * 60 * 60 * 1000);
      const count = allNodes.filter(
        (n) => n.createdAt < nextD,
      ).length;
      nodeGrowthByDay.push({ date: key, count });
    }

    // --- 7. Review Quality Distribution (SM-2 quality scores) ---
    const qualityCounts: Record<number, number> = {};
    for (const log of reviewLogs30d) {
      if (log.quality != null) {
        qualityCounts[log.quality] = (qualityCounts[log.quality] || 0) + 1;
      }
    }
    const qualityDistribution = Array.from({ length: 6 }, (_, i) => ({
      quality: i,
      label: ['完全遗忘', '几乎遗忘', '有印象', '需提示', '少量提示', '完美回忆'][i],
      count: qualityCounts[i] || 0,
    }));

    // --- 8. Weekly Consistency ---
    // 按 UTC+8 日界切"天"；星期标签由日期 key 推导（key 即 UTC+8 日历日，
    // 将其按 UTC 零点解析后取 getUTCDay()，得到的正是 UTC+8 下的星期几）。
    const weekDays: { day: string; label: string; count: number }[] = [];
    const dayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(startOfToday.getTime() - i * 24 * 60 * 60 * 1000);
      const key = appDateKey(d);
      const dayLogs = reviewLogs30d.filter(
        (l) => appDateKey(l.createdAt) === key,
      );
      weekDays.push({
        day: key,
        label: dayLabels[new Date(key + 'T00:00:00.000Z').getUTCDay()],
        count: dayLogs.length,
      });
    }

    // --- 9. Difficulty Distribution ---
    const diffCounts: Record<number, number> = {};
    for (const node of allNodes) {
      diffCounts[node.difficulty] = (diffCounts[node.difficulty] || 0) + 1;
    }
    const difficultyDistribution = Array.from({ length: 5 }, (_, i) => ({
      level: i + 1,
      count: diffCounts[i + 1] || 0,
    }));

    // --- 10. Task Type Distribution ---
    const taskTypeMap: Record<string, { total: number; completed: number }> = {};
    for (const task of reviewTasks) {
      if (!taskTypeMap[task.taskType]) {
        taskTypeMap[task.taskType] = { total: 0, completed: 0 };
      }
      taskTypeMap[task.taskType].total += 1;
      if (task.completed) taskTypeMap[task.taskType].completed += 1;
    }
    const taskTypeDistribution = Object.entries(taskTypeMap).map(([type, data]) => ({
      type,
      total: data.total,
      completed: data.completed,
      completionRate:
        data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
    }));

    // --- Totals ---
    const totalReviewCount30d = reviewLogs30d.length;
    // 学习时长：按"30 秒内有点击屏幕操作或输入文字"规则统计，来自客户端心跳。
    const totalStudySeconds30d = studyTimeLogs30d.reduce(
      (s, l) => s + (l.durationSeconds || 0),
      0,
    );
    const totalStudyMinutes30d = Math.round(totalStudySeconds30d / 60);

    return NextResponse.json({
      overview: {
        totalNodes: allNodes.length,
        totalSubjects: subjects.length,
        totalMistakes,
        resolvedMistakes,
        totalReviewCount30d,
        totalReviewCount7d: reviewLogs30d.filter((l) => new Date(l.createdAt) >= days7Ago).length,
        totalStudyMinutes30d,
        // 全节点加权平均：sum(每个节点的 mastery) / 总节点数。
        // 与 dashboard 接口口径一致；空学科（0 节点）自然不参与，不再拉低均值。
        avgMastery: nodesWithProgress.length > 0
          ? Math.round(nodesWithProgress.reduce((s, n) => s + n.masteryLevel, 0) / nodesWithProgress.length)
          : 0,
        avgEaseFactor,
        avgInterval,
        avgForgetRisk,
        nodesDueToday,
      },
      dailyActivity,
      subjectMastery,
      mistakeTypeBreakdown,
      mistakeTrend: last7DailyMistakes,
      icapDistribution,
      qualityDistribution,
      easeBuckets,
      weekConsistency: weekDays,
      difficultyDistribution,
      taskTypeDistribution,
      nodeGrowth: nodeGrowthByDay,
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
