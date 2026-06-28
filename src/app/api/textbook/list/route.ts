import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { getErrorMessage } from '@/lib/errors';

// GET /api/textbook/list
// Returns the user's recent textbook uploads (newest first).
// The full content is excluded — UI only needs the metadata + the
// chapter-list status. The detail page fetches /api/textbook/[id]
// when the user opens one.
export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserIdFromRequest(req);
    const textbooks = await prisma.textbookUpload.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        fileName: true,
        fileType: true,
        subjectId: true,
        decomposedChapters: true,
        chapterImports: true,
        createdAt: true,
        updatedAt: true,
        subject: { select: { id: true, name: true, icon: true } },
      },
    });
    return NextResponse.json({ textbooks });
  } catch (error: unknown) {
    console.error('[textbook/list] Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
