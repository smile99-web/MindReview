import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { getErrorMessage } from '@/lib/errors';
import { llmCall } from '@/lib/llm-client';

interface ChapterTitle {
  title: string;
  overview?: string;
}

// POST /api/textbook/decompose
// Body: { textbookId: string, subjectId?: string, maxChapters?: number }
// Returns: { chapters: [{ title, overview }] }
//
// Two-step LLM pipeline (same pattern as /api/doc/analyze):
//   a) Cheap subject classification from the first 300 chars (skip if
//      the caller passed subjectId).
//   b) Single LLM call to extract a flat list of chapter titles
//      from the full document. We do NOT call decomposeKnowledge
//      here — that's the per-chapter step, so the user can pick
//      which chapters to import (textbooks have 10+ chapters).
//
// The result is persisted to TextbookUpload.decomposedChapters so
// the next page (per-chapter import) can read it without
// re-running the LLM.
export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserIdFromRequest(req);
    const body = (await req.json()) as {
      textbookId?: unknown;
      subjectId?: unknown;
      maxChapters?: unknown;
    };
    const textbookId = typeof body.textbookId === 'string' ? body.textbookId.trim() : '';
    if (!textbookId) {
      return NextResponse.json({ error: 'textbookId is required' }, { status: 400 });
    }
    const requestedMax = typeof body.maxChapters === 'number' ? body.maxChapters : 14;
    const maxChapters = Math.max(3, Math.min(20, Math.floor(requestedMax)));

    const tb = await prisma.textbookUpload.findUnique({
      where: { id: textbookId },
      select: {
        userId: true,
        content: true,
        fileName: true,
        subjectId: true,
        chapterImports: true,
      },
    });
    if (!tb) {
      return NextResponse.json({ error: '教材不存在' }, { status: 404 });
    }
    if (tb.userId !== userId) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 });
    }

    // Optional subjectId: bind the upload to a Subject (also
    // pre-empts the per-chapter import step needing to ask).
    let subjectId = (typeof body.subjectId === 'string' ? body.subjectId.trim() : '') || tb.subjectId || '';
    if (subjectId) {
      await prisma.textbookUpload.update({
        where: { id: textbookId },
        data: { subjectId },
      });
    }

    if (!subjectId) {
      // Cheap subject classification.
      const snippet = tb.content.slice(0, 300).replace(/\s+/g, ' ');
      const raw = await llmCall({
        messages: [
          {
            role: 'system',
            content:
              '你是一位中学学科分类助手。根据文本内容，判断它最可能属于哪个学科。只回复一个学科名（数学/物理/化学/历史/道法/语文/地理/生物/英语/通用），不回复其他文字。',
          },
          { role: 'user', content: `文本片段：${snippet}` },
        ],
        temperature: 0,
        maxTokens: 16,
      });
      subjectId = raw.trim();
      if (subjectId && subjectId !== '通用') {
        const subject = await prisma.subject.findFirst({
          where: { name: subjectId },
          select: { id: true },
        });
        if (subject) {
          await prisma.textbookUpload.update({
            where: { id: textbookId },
            data: { subjectId: subject.id },
          });
        }
      }
    }

    // b) Extract chapter list. We sample the document (up to ~12k
    // chars) and ask for a flat JSON array of titles. No overview
    // is required from the LLM at this stage — the per-chapter
    // import step handles summaries.
    const sample = tb.content.length > 12000
      ? tb.content.slice(0, 6000) + '\n\n…(中间省略)…\n\n' + tb.content.slice(-6000)
      : tb.content;
    const raw = await llmCall({
      messages: [
        {
          role: 'system',
          content: `你是一位中学教材编辑。请从下面的教材内容中提取出 ${maxChapters} 个最核心的章节标题。严格 JSON：
{"chapters": [{"title": "...", "overview": "..."}]}

只输出 JSON，不解释。overview 一句话说明该章节主要内容。`,
        },
        {
          role: 'user',
          content: `教材标题：${tb.fileName?.replace(/\.\w+$/, '') || '未命名'}\n\n${sample}`,
        },
      ],
      temperature: 0.2,
      maxTokens: 2048,
      jsonMode: true,
    });

    let parsed: { chapters?: ChapterTitle[] } = {};
    try {
      const cleaned = raw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/```\s*$/, '')
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { parsed = {}; }
      }
    }

    const chapters = (parsed.chapters || [])
      .map((c) => ({
        title: (c.title || '').trim(),
        overview: (c.overview || '').trim(),
      }))
      .filter((c) => c.title.length > 0)
      .slice(0, maxChapters);

    if (chapters.length === 0) {
      return NextResponse.json(
        { error: 'AI 未能从教材中提取出章节标题，请尝试更结构化的教材' },
        { status: 422 },
      );
    }

    // Persist the chapter list along with import status. Chapters
    // already imported keep their 'imported' status / chapterId /
    // nodeIds (matched by title) — a repeat decompose must not wipe
    // them; unmatched old entries are dropped.
    const prevImports = ((tb.chapterImports as unknown) as Array<{
      chapterTitle: string;
      status: string;
      chapterId?: string;
      nodeIds?: string[];
    }>) || [];
    const importedByTitle = new Map(
      prevImports
        .filter((c) => c.status === 'imported')
        .map((c) => [c.chapterTitle, c]),
    );
    await prisma.textbookUpload.update({
      where: { id: textbookId },
      data: {
        decomposedChapters: chapters as unknown as object,
        chapterImports: chapters.map(
          (c) =>
            importedByTitle.get(c.title) ?? {
              chapterTitle: c.title,
              status: 'pending',
            },
        ) as unknown as object,
      },
    });

    return NextResponse.json({
      chapters,
      subjectId: subjectId || null,
    });
  } catch (error: unknown) {
    console.error('[textbook/decompose] Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
