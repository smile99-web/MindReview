import { NextRequest, NextResponse } from 'next/server';
import { searchSimilarNodes } from '@/lib/embedding';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim();
    const subjectId = searchParams.get('subjectId') || undefined;
    // parseInt 对非数字输入得 NaN，NaN 的 take 会让 Prisma 忽略分页
    const rawLimit = parseInt(searchParams.get('limit') || '10', 10);
    const limit = Math.min(20, Math.max(1, Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 10));

    if (!q) {
      return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
    }

    let results = await searchSimilarNodes(q, limit, subjectId);

    // Fallback to text search if vector search returns nothing
    if (results.length === 0) {
      const textResults = await prisma.knowledgeNode.findMany({
        where: {
          // 与向量路径保持同一学科作用域，避免 fallback 泄漏其他学科结果
          ...(subjectId ? { subjectId } : {}),
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

      results = textResults.map((n: { id: string; title: string; summary: string | null; subject: { name: string } | null }) => ({
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
