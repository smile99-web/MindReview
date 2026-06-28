import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { getErrorMessage } from '@/lib/errors';

// GET /api/doc/list
// Returns the user's recent doc uploads.
export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserIdFromRequest(req);
    const docs = await prisma.docUpload.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        fileName: true,
        subjectName: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ docs });
  } catch (error: unknown) {
    console.error('[doc/list] Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
