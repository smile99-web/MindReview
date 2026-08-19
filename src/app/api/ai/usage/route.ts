import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/require-admin';
import { getErrorMessage } from '@/lib/errors';
import { appDateKey, startOfAppDay } from '@/lib/date-utils';

// GET /api/ai/usage — 本月 LLM/图片/TTS 调用用量（管理员）。
// 数据来自 AiGenerationLog（每次 AI 调用都会写一行），
// 方便盯紧方舟/DeepSeek 配额（2026-08 embedding 回填曾打满 5 小时配额）。
export async function GET(req: NextRequest) {
  try {
    const adminDenied = await requireAdmin(req);
    if (adminDenied) return adminDenied;

    const now = new Date();
    // "本月"按 UTC+8 日历月切（用户在在中国）：容器本地是 UTC，
    // new Date(y, m, 1) 在月初 8 点前会差一天
    const todayKey = appDateKey(now); // 'YYYY-MM-DD'（UTC+8）
    const monthStart = startOfAppDay(`${todayKey.slice(0, 7)}-01`);

    const [byType, totals, daily] = await Promise.all([
      prisma.aiGenerationLog.groupBy({
        by: ['generatorType', 'status'],
        where: { createdAt: { gte: monthStart } },
        _count: { id: true },
        _sum: { durationMs: true },
      }),
      prisma.aiGenerationLog.aggregate({
        where: { createdAt: { gte: monthStart } },
        _count: { id: true },
        _sum: { durationMs: true },
      }),
      // 近 14 天按天调用量（看趋势/异常峰值）。
      // 时区口径：TIMESTAMP 列存 UTC 墙钟——必须先 AT TIME ZONE 'UTC' 还原为
      // 绝对时间，再 AT TIME ZONE 'Asia/Shanghai' 转成上海墙钟切"天"，
      // 单写后者会把存储值当上海时间解释（方向反，每天 16 小时归错前一天）
      prisma.$queryRaw<Array<{ day: string; c: number }>>`
        SELECT to_char(date_trunc('day', ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Shanghai'), 'YYYY-MM-DD') AS day,
               count(*)::int AS c
        FROM "AiGenerationLog"
        WHERE "createdAt" >= ${new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000)}
        GROUP BY 1
        ORDER BY 1
      `,
    ]);

    // 聚合成 { type: { success, failed, totalMs } } 结构
    const byGenerator: Record<string, { success: number; failed: number; totalMs: number }> = {};
    for (const row of byType) {
      const entry = (byGenerator[row.generatorType] ??= { success: 0, failed: 0, totalMs: 0 });
      if (row.status === 'success') entry.success += row._count.id;
      else entry.failed += row._count.id;
      entry.totalMs += row._sum.durationMs ?? 0;
    }

    return NextResponse.json({
      month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      totalCalls: totals._count.id,
      totalMinutes: Math.round(((totals._sum.durationMs ?? 0) / 60000) * 10) / 10,
      byGenerator,
      daily: daily.map((r) => ({ date: r.day, count: Number(r.c) })),
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
