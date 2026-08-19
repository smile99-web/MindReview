import { getErrorMessage } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUserId } from '@/lib/server-auth';
import { appDateKey, startOfAppDay } from '@/lib/date-utils';

// 单次心跳最多承认 5 分钟，防客户端时钟漂移 / 长时挂起后回传巨大值。
const MAX_HEARTBEAT_SECONDS = 300;
const MIN_HEARTBEAT_SECONDS = 1;
// 心跳是近实时上报：endedAt 距今超过 10 分钟的记录视为回填历史日期，
// 会污染按天统计（streak/dailyActivity），直接拒绝。
// 容忍窗口覆盖挂起恢复 + 时钟漂移（单条上限才 5 分钟，10 分钟足够宽）。
const MAX_HEARTBEAT_AGE_MS = 10 * 60 * 1000;

interface HeartbeatBody {
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  source?: string;
  heartbeatId?: string;
}

export async function POST(req: NextRequest) {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: '未登录或会话已过期' }, { status: 401 });
  }

  let body: HeartbeatBody;
  try {
    body = (await req.json()) as HeartbeatBody;
  } catch {
    return NextResponse.json({ error: '请求体格式错误' }, { status: 400 });
  }

  const now = new Date();
  const endedAt = parseDate(body.endedAt) || now;
  const startedAt = parseDate(body.startedAt);

  // 时长：优先用客户端显式 durationSeconds；否则用 endedAt - startedAt 推算
  let duration: number;
  if (typeof body.durationSeconds === 'number' && Number.isFinite(body.durationSeconds)) {
    duration = Math.floor(body.durationSeconds);
  } else if (startedAt) {
    duration = Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000);
  } else {
    return NextResponse.json({ error: '缺少 startedAt 或 durationSeconds' }, { status: 400 });
  }

  if (duration < MIN_HEARTBEAT_SECONDS) {
    // 不足 1 秒丢弃（用户基本没在学习）
    return NextResponse.json({ ok: true, duration: 0, dropped: true });
  }
  if (duration > MAX_HEARTBEAT_SECONDS) {
    duration = MAX_HEARTBEAT_SECONDS;
  }

  // 起点统一由 endedAt - duration 重算：客户端同时传 startedAt +
  // durationSeconds 时，duration 被钳到 300s 后库里会出现"跨度 1 小时、
  // 时长 300 秒"的自相矛盾段落。派生起点保证三者始终一致。
  const finalStartedAt = new Date(endedAt.getTime() - duration * 1000);

  // endedAt 拒绝明显未来时间（容忍 2 分钟时钟漂移）。
  // （原"startedAt 晚于 endedAt"检查已删：起点由 endedAt-duration 派生后恒成立，属死代码）
  if (endedAt.getTime() > now.getTime() + 2 * 60 * 1000) {
    return NextResponse.json({ error: 'endedAt 不能是未来时间' }, { status: 400 });
  }
  if (endedAt.getTime() < now.getTime() - MAX_HEARTBEAT_AGE_MS) {
    return NextResponse.json({ error: '心跳时间过旧，已丢弃' }, { status: 400 });
  }

  const source = typeof body.source === 'string' && body.source.trim()
    ? body.source.trim().slice(0, 32)
    : 'activity-tracker';
  const heartbeatId = typeof body.heartbeatId === 'string' && body.heartbeatId.trim()
    ? body.heartbeatId.trim().slice(0, 64)
    : null;

  try {
    const created = await prisma.studyTimeLog.create({
      data: {
        userId,
        startedAt: finalStartedAt,
        endedAt,
        durationSeconds: duration,
        source,
        heartbeatId,
      },
      select: { id: true, durationSeconds: true },
    });

    return NextResponse.json({
      ok: true,
      id: created.id,
      duration: created.durationSeconds,
    });
  } catch (err) {
    // 幂等：同一 (userId, heartbeatId) 已落库（弱网重试/响应丢失重发），
    // 直接返回成功不重复计时
    if ((err as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ ok: true, dedup: true, duration });
    }
    return NextResponse.json(
      { error: `心跳记录失败: ${getErrorMessage(err)}` },
      { status: 500 },
    );
  }
}

// GET /api/study-time/heartbeat — 返回今日累计学习时长
export async function GET(req: NextRequest) {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: '未登录或会话已过期' }, { status: 401 });
  }

  // 用 UTC+8 日界锚定"今天"，与 analytics / dashboard 口径一致（用户在中国）
  const now = new Date();
  const startOfToday = startOfAppDay(appDateKey(now));

  const [todayAgg, last7Agg] = await Promise.all([
    prisma.studyTimeLog.aggregate({
      where: { userId, startedAt: { gte: startOfToday } },
      _sum: { durationSeconds: true },
    }),
    prisma.studyTimeLog.aggregate({
      where: {
        userId,
        startedAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
      },
      _sum: { durationSeconds: true },
    }),
  ]);

  return NextResponse.json({
    todaySeconds: todayAgg._sum.durationSeconds || 0,
    last7DaysSeconds: last7Agg._sum.durationSeconds || 0,
  });
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return null;
  return new Date(ts);
}