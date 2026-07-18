import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAccessToken, createRefreshTokenValue } from '@/lib/server-auth';

export async function POST(request: Request) {
  try {
    const { refresh_token } = await request.json();

    if (!refresh_token) {
      return NextResponse.json({ detail: 'Refresh token is required' }, { status: 400 });
    }

    const now = new Date();

    const row = await prisma.refreshToken.findUnique({
      where: { token: refresh_token },
      include: { user: { select: { id: true, username: true, email: true, name: true, grade: true, avatarUrl: true } } },
    });

    if (!row) {
      return NextResponse.json({ detail: 'Invalid refresh token' }, { status: 401 });
    }

    if (row.expiresAt < now) {
      await prisma.refreshToken.delete({ where: { token: refresh_token } });
      return NextResponse.json({ detail: 'Refresh token expired; please log in again' }, { status: 401 });
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
      // 调用方刚刚持有有效旧 token（胜者几毫秒前才轮换），证明身份，
      // 直接返回胜者创建的最新 token，避免该设备被误登出 + 误导性 500。
      if ((err as { code?: string })?.code === 'P2025') {
        const latest = await prisma.refreshToken.findFirst({
          where: { userId: row.userId },
          orderBy: { expiresAt: 'desc' },
        });
        if (latest) {
          const accessToken = createAccessToken(row.user.id, row.user.username);
          return NextResponse.json({
            access_token: accessToken,
            refresh_token: latest.token,
            token_type: 'bearer',
            user: row.user,
          });
        }
        return NextResponse.json({ detail: '登录状态已失效，请重新登录' }, { status: 401 });
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
    return NextResponse.json({ detail: 'Internal server error' }, { status: 500 });
  }
}
