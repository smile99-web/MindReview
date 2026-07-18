import { getErrorMessage } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUserId } from '@/lib/server-auth';
import { appDateKey, startOfAppDay } from '@/lib/date-utils';

// 单次心跳最多承认 5 分钟，防客户端时钟漂移 / 长时挂起后回传巨大值。
const MAX_HEARTBEAT_SECONDS = 300;
const MIN_HEARTBEAT_SECONDS = 1;

interface HeartbeatBody {
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  source?: string;
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

  // 起点缺省为 endedAt - duration
  const finalStartedAt = startedAt || new Date(endedAt.getTime() - duration * 1000);

  // 拒绝明显未来的时间（容忍 2 分钟时钟漂移）
  if (finalStartedAt.getTime() > endedAt.getTime() + 2 * 60 * 1000) {
    return NextResponse.json({ error: 'startedAt 晚于 endedAt' }, { status: 400 });
  }
  if (endedAt.getTime() > now.getTime() + 2 * 60 * 1000) {
    return NextResponse.json({ error: 'endedAt 不能是未来时间' }, { status: 400 });
  }

  const source = typeof body.source === 'string' && body.source.trim()
    ? body.source.trim().slice(0, 32)
    : 'activity-tracker';

  try {
    const created = await prisma.studyTimeLog.create({
      data: {
        userId,
        startedAt: finalStartedAt,
        endedAt,
        durationSeconds: duration,
        source,
      },
      select: { id: true, durationSeconds: true },
    });

    return NextResponse.json({
      ok: true,
      id: created.id,
      duration: created.durationSeconds,
    });
  } catch (err) {
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