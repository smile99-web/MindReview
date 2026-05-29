import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUserId } from '@/lib/server-auth';

export async function GET(request: Request) {
  try {
    // Next.js App Router wraps the native Request; cast to access headers
    const { headers } = request;
    const auth = headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const token = auth.slice('Bearer '.length).trim();
    const parts = token.split('.');
    if (parts.length !== 3) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    const userId = payload.sub;

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
