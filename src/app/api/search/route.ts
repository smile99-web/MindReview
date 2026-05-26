import { NextRequest, NextResponse } from 'next/server';
import { searchSimilarNodes } from '@/lib/embedding';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim();
    const subjectId = searchParams.get('subjectId') || undefined;
    const limit = Math.min(20, Math.max(1, parseInt(searchParams.get('limit') || '10')));

    if (!q) {
      return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
    }

    let results = await searchSimilarNodes(q, limit, subjectId);

    // Fallback to text search if vector search returns nothing
    if (results.length === 0) {
      const textResults = await prisma.knowledgeNode.findMany({
        where: {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { summary: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          title: true,
          summary: true,
          subject: { select: { name: true } },
        },
        take: limit,
      });

      results = textResults.map(n => ({
        id: n.id,
        title: n.title,
        summary: n.summary || '',
        subjectName: n.subject?.name || '',
        score: 0.3,
      }));
    }

    return NextResponse.json({ results, query: q, total: results.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
