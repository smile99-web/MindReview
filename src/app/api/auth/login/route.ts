import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAccessToken, createRefreshTokenValue, verifyPassword } from '@/lib/server-auth';

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ detail: 'Username and password are required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true, email: true, name: true, grade: true, avatarUrl: true, passwordHash: true },
    });

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ detail: 'Invalid username or password' }, { status: 401 });
    }

    const now = new Date();

    // Clean expired refresh tokens
    await prisma.refreshToken.deleteMany({
      where: { userId: user.id, expiresAt: { lt: now } },
    });

    // 多设备支持：保留最近 5 个 active session 防止 token 无限累积。
    // 同账号可在多设备同时登录，新登录不会踢旧设备（旧设备 refresh 时如果
    // 旧 token 已不在 DB 中就清理）。超过 5 个时删除最老的。
    const activeSessions = await prisma.refreshToken.findMany({
      where: { userId: user.id, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (activeSessions.length >= 5) {
      const idsToDelete = activeSessions.slice(4).map((s) => s.id);
      await prisma.refreshToken.deleteMany({ where: { id: { in: idsToDelete } } });
    }

    const refreshValue = createRefreshTokenValue();
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.refreshToken.create({
      data: {
        id: crypto.randomUUID(),
        token: refreshValue,
        userId: user.id,
        expiresAt: expires,
      },
    });

    const accessToken = createAccessToken(user.id, user.username);

    return NextResponse.json({
      access_token: accessToken,
      refresh_token: refreshValue,
      token_type: 'bearer',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        grade: user.grade,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch {
    return NextResponse.json({ detail: 'Internal server error' }, { status: 500 });
  }
}
