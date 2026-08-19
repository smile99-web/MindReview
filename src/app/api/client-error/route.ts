import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { getAuthenticatedUserId } from '@/lib/server-auth';
import { requireAdmin } from '@/lib/require-admin';
import { getErrorMessage } from '@/lib/errors';

// POST /api/client-error — 前端运行时错误上报（window.onerror /
// unhandledrejection 探针调用）。匿名也可上报（白屏时用户往往已掉登录），
// 按 IP 限流防刷。写库失败绝不影响用户。
export async function POST(req: NextRequest) {
  try {
    // 上报接口异常宽松但不能裸奔：每 IP 每分钟 30 条
    const rl = rateLimit(`clienterr:${clientIp(req)}`, 30, 60 * 1000);
    if (!rl.ok) {
      return NextResponse.json({ ok: false }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: '请求体必须是 JSON 对象' }, { status: 400 });
    }
    const message = typeof (body as { message?: unknown }).message === 'string'
      ? (body as { message: string }).message.slice(0, 1000)
      : '';
    if (!message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    const stack = typeof body.stack === 'string' ? body.stack.slice(0, 4000) : null;
    const url = typeof body.url === 'string' ? body.url.slice(0, 500) : null;
    const userAgent = typeof body.userAgent === 'string'
      ? body.userAgent.slice(0, 300)
      : req.headers.get('user-agent')?.slice(0, 300) ?? null;
    const userId = getAuthenticatedUserId(req); // 匿名上报也接受

    await prisma.clientErrorLog.create({
      data: { userId, message, stack, url, userAgent },
    });
    return NextResponse.json({ ok: true });
  } catch {
    // 上报通道自身的错误绝不外抛（避免错误上报制造新错误）
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}

// GET /api/client-error — 管理员查看最近 100 条前端错误
export async function GET(req: NextRequest) {
  try {
    const adminDenied = await requireAdmin(req);
    if (adminDenied) return adminDenied;
    const logs = await prisma.clientErrorLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return NextResponse.json({ logs });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
