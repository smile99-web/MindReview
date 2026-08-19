import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { clearLoginFailures, clientIp, isLoginBlocked, recordLoginFailure } from '@/lib/rate-limit';
import { createAccessToken, createRefreshTokenValue, verifyPassword } from '@/lib/server-auth';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const username = body && typeof body.username === 'string' ? body.username : '';
    const password = body && typeof body.password === 'string' ? body.password : '';

    if (!username || !password) {
      return NextResponse.json({ detail: 'Username and password are required', error: 'Username and password are required' }, { status: 400 });
    }

    // 防爆破：同一 用户名+IP 15 分钟内失败 10 次锁定 15 分钟（进程内计数）。
    const throttleKey = `${String(username).toLowerCase()}|${clientIp(request)}`;
    const blocked = isLoginBlocked(throttleKey);
    if (!blocked.ok) {
      return NextResponse.json(
        { detail: `失败次数过多，请 ${Math.ceil(blocked.retryAfterSeconds / 60)} 分钟后再试`, error: `失败次数过多，请 ${Math.ceil(blocked.retryAfterSeconds / 60)} 分钟后再试` },
        { status: 429, headers: { 'Retry-After': String(blocked.retryAfterSeconds) } },
      );
    }

    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true, email: true, name: true, grade: true, avatarUrl: true, passwordHash: true },
    });

    if (!user || !verifyPassword(password, user.passwordHash)) {
      recordLoginFailure(throttleKey);
      return NextResponse.json({ detail: 'Invalid username or password', error: 'Invalid username or password' }, { status: 401 });
    }
    clearLoginFailures(throttleKey);

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
    return NextResponse.json({ detail: 'Internal server error', error: 'Internal server error' }, { status: 500 });
  }
}
