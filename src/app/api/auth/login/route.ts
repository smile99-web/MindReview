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
