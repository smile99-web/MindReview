import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAccessToken, createRefreshTokenValue } from '@/lib/server-auth';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const refresh_token =
      body && typeof body === 'object' && typeof (body as { refresh_token?: unknown }).refresh_token === 'string'
        ? (body as { refresh_token: string }).refresh_token
        : '';

    if (!refresh_token) {
      return NextResponse.json({ detail: 'Refresh token is required', error: 'Refresh token is required' }, { status: 400 });
    }

    const now = new Date();

    const row = await prisma.refreshToken.findUnique({
      where: { token: refresh_token },
      include: { user: { select: { id: true, username: true, email: true, name: true, grade: true, avatarUrl: true } } },
    });

    if (!row) {
      return NextResponse.json({ detail: 'Invalid refresh token', error: 'Invalid refresh token' }, { status: 401 });
    }

    if (row.expiresAt < now) {
      await prisma.refreshToken.delete({ where: { token: refresh_token } });
      return NextResponse.json({ detail: 'Refresh token expired; please log in again', error: 'Refresh token expired; please log in again' }, { status: 401 });
    }

    const newRefresh = createRefreshTokenValue();
    const newExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Atomic delete-then-create: a crash between the two used to leave the
    // user with no valid token (logged out). The transaction also closes a
    // race where two concurrent refreshes would both create new rows.
    try {
      await prisma.$transaction([
        prisma.refreshToken.delete({ where: { token: refresh_token } }),
        prisma.refreshToken.create({
          data: {
            id: crypto.randomUUID(),
            token: newRefresh,
            userId: row.userId,
            expiresAt: newExpires,
          },
        }),
      ]);
    } catch (err: unknown) {
      // 并发 refresh 的败者：delete 时记录已被胜者删掉（P2025）。
      // 旧实现把胜者刚创建的最新 refresh token 发给旧 token 持有者，
      // 理由是"旧 token 几毫秒前还有效，可证明身份"——但这同时让
      // refresh token 轮换失去盗用检测能力：任何泄漏的旧 token 都能
      // 经此分支无限续期出最新 token（token 存 localStorage，泄漏
      // 场景现实）。改为直接 401。
      // 前端配套的并发保护在 src/lib/auth.ts：单飞刷新（同 tab 内多个
      // authFetch 共享同一个 refresh 请求）+ 401 后重读 localStorage
      // （跨 tab 轮换后新 token 已写入共享存储），正常用户不会误登出。
      if ((err as { code?: string })?.code === 'P2025') {
        return NextResponse.json({ detail: '登录状态已失效，请重新登录', error: '登录状态已失效，请重新登录' }, { status: 401 });
      }
      throw err;
    }

    const accessToken = createAccessToken(row.user.id, row.user.username);

    return NextResponse.json({
      access_token: accessToken,
      refresh_token: newRefresh,
      token_type: 'bearer',
      user: row.user,
    });
  } catch {
    return NextResponse.json({ detail: 'Internal server error', error: 'Internal server error' }, { status: 500 });
  }
}
