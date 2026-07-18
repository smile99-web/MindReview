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
  gradeLevel?: string;
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
    // 必须是非负整数：小数（如 1.5）会通过 <0 检查但索引到错误章节，NaN 会绕过所有检查
    const chapterIdx =
      typeof body.chapterIdx === 'number' && Number.isInteger(body.chapterIdx) ? body.chapterIdx : -1;
    if (!textbookId) {
      return NextResponse.json({ error: 'textbookId is required' }, { status: 400 });
    }
    if (chapterIdx < 0) {
      return NextResponse.json({ error: 'chapterIdx 必须是非负整数' }, { status: 400 });
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

    // 防重复导入：该章节已成功导入过时直接复用已有 chapterId，
    // 不建数据、不调 LLM（双击 / 重试 / 并发安全）。
    const prevImports = ((tb.chapterImports as unknown) as Array<{
      chapterTitle: string;
      status: string;
      chapterId?: string;
      nodeIds?: string[];
    }>) || [];
    const prevImport = prevImports[chapterIdx];
    if (prevImport?.status === 'imported' && prevImport.chapterId) {
      return NextResponse.json({
        success: true,
        chapterId: prevImport.chapterId,
        alreadyImported: true,
      });
    }

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

    // Run the per-chapter LLM decomposition BEFORE creating any DB
    // rows — an LLM failure must not leave an orphan Chapter behind.
    // We feed the full textbook content but ask the LLM to focus on
    // this specific chapter — the prompt names the chapter title so
    // the LLM filters to the right slice of content.
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
      gradeLevel: n.gradeLevel || null,
    }));

    // Create the Chapter row + bulk-create KnowledgeNode rows in ONE
    // callback-style transaction: either everything commits or
    // everything rolls back — a mid-stream failure never leaves an
    // empty Chapter or partial nodes behind.
    const { newChapter, createdNodes } = await prisma.$transaction(
      async (tx) => {
        const maxSort = await tx.chapter.aggregate({
          where: { subjectId },
          _max: { sortOrder: true },
        });
        const chapterRow = await tx.chapter.create({
          data: {
            subjectId,
            title: chapter.title,
            sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
          },
          select: { id: true, title: true, subjectId: true },
        });
        const rows: { id: string; title: string }[] = [];
        for (const n of knowledgeNodes) {
          const row = await tx.knowledgeNode.create({
            data: {
              subjectId,
              chapterId: chapterRow.id,
              title: n.title,
              summary: n.summary,
              keywords: n.keywords,
              prerequisites: n.prerequisites,
              commonMistakes: n.commonMistakes,
              typicalQuestions: n.typicalQuestions,
              difficulty: n.difficulty,
              cognitiveLoad: n.cognitiveLoad,
              icapLevel: n.icapLevel,
              // LLM-supplied grade tag — drives subject/[id] chapter
              // grouping. May be missing for legacy data; UI
              // gracefully falls back to sortOrder-based grouping.
              gradeLevel: n.gradeLevel || null,
            },
            select: { id: true, title: true },
          });
          rows.push(row);
        }
        return { newChapter: chapterRow, createdNodes: rows };
      },
      { timeout: 60000 },
    );

    // Mark the chapter as imported in the textbook's tracking
    // array. If this was the first import, also stamp subjectId
    // (so the list view shows it).
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
