import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { getErrorMessage } from '@/lib/errors';
import { decomposeKnowledge } from '@/lib/llm-client';
import type { DecomposeKnowledgeResult } from '@/lib/llm-client';

interface DecomposedNode {
  title?: string;
  summary?: string;
  keywords?: string[];
  prerequisites?: string[];
  commonMistakes?: string[];
  typicalQuestions?: string[];
  difficulty?: number;
  cognitiveLoad?: number;
  icapLevel?: string;
}

// POST /api/textbook/import-chapter
// Body: { textbookId: string, chapterIdx: number }
// Returns: { chapterId, knowledgeNodeIds }
//
// Imports one chapter from the textbook into the canonical
// Subject→Chapter→KnowledgeNode hierarchy:
//   1. Resolve Subject (textbook.subjectId, else fall back to "通用")
//   2. Create Chapter row
//   3. Call decomposeKnowledge (per-chapter granularity) on the
//      textbook's text — the LLM splits the chapter into minimal
//      knowledge primitives
//   4. Bulk-create KnowledgeNode rows
//   5. Mark this chapter as 'imported' in TextbookUpload.chapterImports
//
// This shape matches the existing "知识点拆解" flow on the
// subjects page (DecomposeForm), so the resulting graph is
// consumable by the same review / ICAP / mistake pipelines.
export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserIdFromRequest(req);
    const body = (await req.json()) as {
      textbookId?: unknown;
      chapterIdx?: unknown;
    };
    const textbookId = typeof body.textbookId === 'string' ? body.textbookId.trim() : '';
    const chapterIdx = typeof body.chapterIdx === 'number' ? body.chapterIdx : -1;
    if (!textbookId) {
      return NextResponse.json({ error: 'textbookId is required' }, { status: 400 });
    }
    if (chapterIdx < 0) {
      return NextResponse.json({ error: 'chapterIdx is required' }, { status: 400 });
    }

    const tb = await prisma.textbookUpload.findUnique({
      where: { id: textbookId },
      select: {
        userId: true,
        content: true,
        fileName: true,
        subjectId: true,
        decomposedChapters: true,
        chapterImports: true,
      },
    });
    if (!tb) {
      return NextResponse.json({ error: '教材不存在' }, { status: 404 });
    }
    if (tb.userId !== userId) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 });
    }

    const chapters = ((tb.decomposedChapters as unknown) as Array<{
      title: string;
      overview?: string;
    }>) || [];
    if (chapterIdx >= chapters.length) {
      return NextResponse.json({ error: '章节索引越界' }, { status: 400 });
    }
    const chapter = chapters[chapterIdx];

    // Resolve or create a Subject. The textbook's bound subjectId
    // takes priority; otherwise fall back to "通用".
    let subjectId = tb.subjectId;
    if (!subjectId) {
      const fallback = await prisma.subject.upsert({
        where: { name: '通用' },
        update: {},
        create: { name: '通用', icon: '📝' },
        select: { id: true },
      });
      subjectId = fallback.id;
    }

    // Create the Chapter row.
    const maxSort = await prisma.chapter.aggregate({
      where: { subjectId },
      _max: { sortOrder: true },
    });
    const newChapter = await prisma.chapter.create({
      data: {
        subjectId,
        title: chapter.title,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
      select: { id: true, title: true, subjectId: true },
    });

    // Run the per-chapter LLM decomposition. We feed the full
    // textbook content but ask the LLM to focus on this specific
    // chapter — the prompt names the chapter title so the LLM
    // filters to the right slice of content.
    const result = (await decomposeKnowledge(
      // Subject name (best-effort) — used in the system prompt.
      // If we only have the id, fall back to '通用' (the
      // decomposeKnowledge prompt doesn't actually use the
      // subject name beyond framing, so this is OK).
      '通用',
      '通用',
      chapter.title,
      // Feed a slice of the textbook content (limit to ~10k
      // chars to stay within LLM context). The LLM is instructed
      // to focus on this chapter; passing a bit of surrounding
      // context helps it resolve ambiguous references.
      tb.content.slice(0, 10000),
    )) as DecomposeKnowledgeResult;

    const knowledgeNodes = (result.nodes || []).map((n: DecomposedNode) => ({
      title: n.title || '',
      summary: n.summary || '',
      keywords: n.keywords || [],
      prerequisites: n.prerequisites || [],
      commonMistakes: n.commonMistakes || [],
      typicalQuestions: n.typicalQuestions || [],
      difficulty: typeof n.difficulty === 'number' ? n.difficulty : 3,
      cognitiveLoad: typeof n.cognitiveLoad === 'number' ? n.cognitiveLoad : 3,
      icapLevel: n.icapLevel || 'Active',
    }));

    // Bulk-create KnowledgeNode rows in a callback-style transaction.
    // The previous $transaction([...]) array form is "interactive"
    // — Prisma creates the rows as the array is evaluated, so a
    // mid-stream failure leaves partial nodes + the chapter
    // stamped 'imported' with inconsistent nodeIds. The callback
    // form runs all creates inside one DB transaction that
    // either commits or rolls back atomically.
    const createdNodes: { id: string; title: string }[] = knowledgeNodes.length > 0
      ? await prisma.$transaction(
          async (tx) => {
            const rows: { id: string; title: string }[] = [];
            for (const n of knowledgeNodes) {
              const row = await tx.knowledgeNode.create({
                data: {
                  subjectId,
                  chapterId: newChapter.id,
                  title: n.title,
                  summary: n.summary,
                  keywords: n.keywords,
                  prerequisites: n.prerequisites,
                  commonMistakes: n.commonMistakes,
                  typicalQuestions: n.typicalQuestions,
                  difficulty: n.difficulty,
                  cognitiveLoad: n.cognitiveLoad,
                  icapLevel: n.icapLevel,
                },
                select: { id: true, title: true },
              });
              rows.push(row);
            }
            return rows;
          },
          { timeout: 60000 },
        )
      : [];

    // Mark the chapter as imported in the textbook's tracking
    // array. If this was the first import, also stamp subjectId
    // (so the list view shows it).
    const prevImports = ((tb.chapterImports as unknown) as Array<{
      chapterTitle: string;
      status: string;
    }>) || [];
    const nextImports = prevImports.map((c, i) =>
      i === chapterIdx
        ? { ...c, status: 'imported', chapterId: newChapter.id, nodeIds: createdNodes.map((n) => n.id) }
        : c,
    );
    await prisma.textbookUpload.update({
      where: { id: textbookId },
      data: {
        subjectId,
        chapterImports: nextImports as unknown as object,
      },
    });

    return NextResponse.json({
      chapterId: newChapter.id,
      chapterTitle: newChapter.title,
      subjectId,
      knowledgeNodeIds: createdNodes.map((n) => n.id),
      knowledgeNodeCount: createdNodes.length,
    });
  } catch (error: unknown) {
    console.error('[textbook/import-chapter] Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
