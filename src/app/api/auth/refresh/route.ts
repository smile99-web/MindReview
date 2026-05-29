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

    await prisma.refreshToken.delete({ where: { token: refresh_token } });

    const newRefresh = createRefreshTokenValue();
    const newExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.refreshToken.create({
      data: {
        id: crypto.randomUUID(),
        token: newRefresh,
        userId: row.userId,
        expiresAt: newExpires,
      },
    });

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
