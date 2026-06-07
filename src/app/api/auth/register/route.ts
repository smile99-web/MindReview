import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAccessToken, createRefreshTokenValue, hashPassword } from '@/lib/server-auth';

export async function POST(request: Request) {
  try {
    const { username, password, email, name } = await request.json();
    const normalizedUsername = typeof username === 'string' ? username.trim() : '';
    const normalizedEmail = typeof email === 'string' ? email.trim() : '';
    const normalizedName = typeof name === 'string' ? name.trim() : '';

    if (normalizedUsername.length < 3 || normalizedUsername.length > 30) {
      return NextResponse.json({ detail: '用户名长度必须为 3-30 个字符' }, { status: 400 });
    }
    if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
      return NextResponse.json({ detail: '密码长度必须为 6-128 个字符' }, { status: 400 });
    }
    if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(normalizedUsername)) {
      return NextResponse.json({ detail: '用户名只能包含中文、字母、数字和下划线' }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { username: normalizedUsername } });
    if (existing) {
      return NextResponse.json({ detail: '用户名已存在' }, { status: 409 });
    }

    if (normalizedEmail) {
      const emailExists = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (emailExists) {
        return NextResponse.json({ detail: '邮箱已存在' }, { status: 409 });
      }
    }

    const hashed = hashPassword(password);
    const now = new Date();

    const user = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        username: normalizedUsername,
        email: normalizedEmail || null,
        passwordHash: hashed,
        name: normalizedName || null,
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
    return NextResponse.json({ detail: '服务器内部错误' }, { status: 500 });
  }
}
