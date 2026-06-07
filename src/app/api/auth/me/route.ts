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

    return NextResponse.json(user);
  } catch {
    return NextResponse.json({ detail: 'Internal server error' }, { status: 500 });
  }
}
