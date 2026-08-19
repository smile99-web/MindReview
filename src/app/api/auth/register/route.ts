import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAccessToken, createRefreshTokenValue, hashPassword } from '@/lib/server-auth';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { username, password, email, name, inviteCode } =
      body && typeof body === 'object' ? body : {};
    const normalizedUsername = typeof username === 'string' ? username.trim() : '';
    // 邮箱大小写归一：Gmail 等邮箱本地部分大小写不敏感，不归一会同邮箱双账号
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    const normalizedInviteCode = typeof inviteCode === 'string' ? inviteCode.trim() : '';

    // 推荐码必填，先校验再查库，避免无码请求打到数据库
    if (!normalizedInviteCode) {
      return NextResponse.json({ detail: '请填写推荐码', error: '请填写推荐码' }, { status: 400 });
    }
    const invite = await prisma.inviteCode.findUnique({ where: { code: normalizedInviteCode } });
    if (!invite) {
      return NextResponse.json({ detail: '推荐码无效', error: '推荐码无效' }, { status: 403 });
    }
    if (invite.maxUses > 0 && invite.usedCount >= invite.maxUses) {
      return NextResponse.json({ detail: '推荐码使用次数已用完', error: '推荐码使用次数已用完' }, { status: 403 });
    }

    if (normalizedUsername.length < 3 || normalizedUsername.length > 30) {
      return NextResponse.json({ detail: '用户名长度必须为 3-30 个字符', error: '用户名长度必须为 3-30 个字符' }, { status: 400 });
    }
    if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
      return NextResponse.json({ detail: '密码长度必须为 6-128 个字符', error: '密码长度必须为 6-128 个字符' }, { status: 400 });
    }
    if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(normalizedUsername)) {
      return NextResponse.json({ detail: '用户名只能包含中文、字母、数字和下划线', error: '用户名只能包含中文、字母、数字和下划线' }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { username: normalizedUsername } });
    if (existing) {
      return NextResponse.json({ detail: '用户名已存在', error: '用户名已存在' }, { status: 409 });
    }

    if (normalizedEmail) {
      const emailExists = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (emailExists) {
        return NextResponse.json({ detail: '邮箱已存在', error: '邮箱已存在' }, { status: 409 });
      }
    }

    const hashed = hashPassword(password);
    const now = new Date();

    // 上面的 findUnique 预检存在 TOCTOU 竞态：两个并发请求可同时通过检查，
    // 其中一个在 create 时撞唯一约束（P2002）→ 返回 409 而非 500
    // 推荐码核销与用户创建放同一事务：updateMany 带条件兜底并发抢码，
    // 用户创建失败（如 P2002）时整个事务回滚，不会白扣使用次数
    let user;
    try {
      user = await prisma.$transaction(async (tx) => {
        const consumed = await tx.inviteCode.updateMany({
          where: {
            code: normalizedInviteCode,
            OR: [{ maxUses: 0 }, { usedCount: { lt: invite.maxUses } }],
          },
          data: { usedCount: { increment: 1 } },
        });
        if (consumed.count === 0) {
          throw new Error('INVITE_CODE_EXHAUSTED');
        }
        return tx.user.create({
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
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'INVITE_CODE_EXHAUSTED') {
        return NextResponse.json({ detail: '推荐码使用次数已用完', error: '推荐码使用次数已用完' }, { status: 403 });
      }
      if ((err as { code?: string })?.code === 'P2002') {
        return NextResponse.json({ detail: '用户名或邮箱已存在', error: '用户名或邮箱已存在' }, { status: 409 });
      }
      throw err;
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
      user,
    });
  } catch {
    return NextResponse.json({ detail: '服务器内部错误', error: '服务器内部错误' }, { status: 500 });
  }
}
