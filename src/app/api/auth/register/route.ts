import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAccessToken, createRefreshTokenValue, hashPassword } from '@/lib/server-auth';

export async function POST(request: Request) {
  try {
    const { username, password, email, name } = await request.json();

    if (!username || username.trim().length < 3 || username.trim().length > 30) {
      return NextResponse.json({ detail: 'Username must be 3–30 characters' }, { status: 400 });
    }
    if (!password || password.length < 6 || password.length > 128) {
      return NextResponse.json({ detail: 'Password must be 6–128 characters' }, { status: 400 });
    }
    if (!/^[a-zA-Z0-9_一-鿿]+$/.test(username.trim())) {
      return NextResponse.json({ detail: 'Username contains invalid characters' }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { username: username.trim() } });
    if (existing) {
      return NextResponse.json({ detail: 'Username already exists' }, { status: 409 });
    }

    if (email) {
      const emailExists = await prisma.user.findUnique({ where: { email: email.trim() || undefined } });
      if (emailExists) {
        return NextResponse.json({ detail: 'Email already exists' }, { status: 409 });
      }
    }

    const hashed = hashPassword(password);
    const now = new Date();

    const user = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        username: username.trim(),
        email: email?.trim() || null,
        passwordHash: hashed,
        name: name?.trim() || null,
        grade: null,
        updatedAt: now,
      },
      select: { id: true, username: true, email: true, name: true, grade: true, avatarUrl: true },
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
      user,
    });
  } catch {
    return NextResponse.json({ detail: 'Internal server error' }, { status: 500 });
  }
}
