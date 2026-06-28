import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { getErrorMessage } from '@/lib/errors';
import { analyzeMistake } from '@/lib/llm-client';

interface WrongAnswer {
  questionText: string;
  wrongAnswer: string;
  correctAnswer: string;
  questionType?: string;
  explanation?: string;
}

// POST /api/doc/[id]/record-mistakes
// Body: { wrongAnswers: [{ questionText, wrongAnswer, correctAnswer }] }
//
// Called by the doc practice session's "提交答案" button when the
// user gets one or more questions wrong. Creates a Mistake row for
// each wrong answer, optionally with an LLM-powered error-type
// analysis (conceptual/calculation/careless/application).
//
// The doc's subjectId is attached to the Mistake row so the mistake
// book's 学科分类 grid can group it correctly.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await resolveUserIdFromRequest(req);
    const { id: docId } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      wrongAnswers?: WrongAnswer[];
    };

    const arr = body.wrongAnswers;
    if (!arr || !Array.isArray(arr) || arr.length === 0) {
      return NextResponse.json({ recorded: 0 });
    }

    const doc = await prisma.docUpload.findUnique({
      where: { id: docId },
      select: { userId: true, subjectName: true },
    });
    if (!doc) {
      return NextResponse.json({ error: '文件不存在' }, { status: 404 });
    }
    if (doc.userId !== userId) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 });
    }

    // Resolve subjectId from the doc's cached subjectName so the
    // mistake lands in the right 学科分类.
    let subjectId: string | null = null;
    if (doc.subjectName) {
      const s = await prisma.subject.findFirst({
        where: { name: doc.subjectName },
        select: { id: true },
      });
      subjectId = s?.id || null;
    }

    let recorded = 0;
    for (const item of arr.slice(0, 20)) {
      if (!item.questionText || !item.correctAnswer) continue;

      // Optional: run the LLM mistake analyzer for a richer
      // error-type tag. The fire-and-forget approach means a
      // slow LLM doesn't block the response.
      let mistakeType: string | null = null;
      let analysis: string | null = null;
      try {
        const result = await analyzeMistake(
          doc.subjectName || '通用',
          item.questionText.slice(0, 500),
          item.wrongAnswer || undefined,
          item.correctAnswer,
        );
        mistakeType = result.mistakeType || null;
        analysis = result.analysis || null;
      } catch {
        // LLM failure is non-fatal; the mistake row still gets
        // created with the question text + correct answer.
      }

      // FSRS initial state — same as practice/route.ts
      const nextReviewAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await prisma.mistake.create({
        data: {
          userId,
          knowledgeNodeId: null,
          subjectId,
          questionText: item.questionText.slice(0, 2000),
          wrongAnswer: (item.wrongAnswer || '').slice(0, 500),
          correctAnswer: item.correctAnswer.slice(0, 500),
          mistakeType,
          analysis,
          state: 'new',
          stability: 1,
          difficulty: 5,
          reps: 0,
          lapses: 0,
          lastReviewAt: null,
          nextReviewAt,
          history: [],
        },
      });
      recorded++;
    }

    return NextResponse.json({ recorded });
  } catch (error: unknown) {
    console.error('[doc/record-mistakes] Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
