import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUserId } from '@/lib/server-auth';

export async function GET(request: NextRequest) {
  try {
    // Use canonical JWT verification with HMAC-SHA256 signature check
    const userId = getAuthenticatedUserId(request);

    if (!userId) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, email: true, name: true, grade: true, avatarUrl: true },
    });

    if (!user) {
      return NextResponse.json({ detail: 'User not found' }, { status: 401 });
    }

    // 管理员标记：与 requireAdmin 同口径，前端据此隐藏管理向按钮
    // （如思维导图"补全导图关系"），避免普通用户点了才收到 403
    const adminUsernames = (process.env.ADMIN_USERNAMES || '')
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);
    const isAdmin = adminUsernames.length > 0 && adminUsernames.includes(user.username);

    return NextResponse.json({ ...user, isAdmin });
  } catch {
    return NextResponse.json({ detail: 'Internal server error' }, { status: 500 });
  }
}
