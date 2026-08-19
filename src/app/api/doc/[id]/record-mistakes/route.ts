import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { getErrorMessage, getErrorStatus } from '@/lib/errors';
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

    // 数组内按 questionText 去重：双击提交/前端重复 push 会写重复行。
    // 元素类型必须先校验：null 元素或非字符串字段会让 .slice/.trim 抛
    // TypeError（此前整个请求 500），非字符串 correctAnswer 也会炸。
    const seen = new Set<string>();
    const rawItems = arr.slice(0, 20).filter((item) => {
      if (!item || typeof item !== 'object') return false;
      if (typeof item.questionText !== 'string') return false;
      if (typeof item.correctAnswer !== 'string' || !item.correctAnswer.trim()) return false;
      if (item.wrongAnswer !== undefined && item.wrongAnswer !== null && typeof item.wrongAnswer !== 'string') return false;
      const key = item.questionText.trim().slice(0, 2000);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    // 统一 trim + 截断后的规范化文本：批内去重用 trim 过的 key，而入库/查重
    // 之前用未 trim 的原文，"题目 " 与 "题目" 会重复建档（口径不一致）。
    const items = rawItems.map((item) => ({
      questionText: item.questionText.trim().slice(0, 2000),
      wrongAnswer: (typeof item.wrongAnswer === 'string' ? item.wrongAnswer : '').slice(0, 500),
      correctAnswer: item.correctAnswer.trim().slice(0, 500),
    }));
    if (items.length === 0) {
      return NextResponse.json({ recorded: 0 });
    }

    // 同一 questionText 已有错题记录则跳过：重复建档会产生两条 FSRS 调度
    const existing = await prisma.mistake.findMany({
      where: {
        userId,
        questionText: { in: items.map((i) => i.questionText) },
      },
      select: { questionText: true },
    });
    const existingTexts = new Set(existing.map((e) => e.questionText));
    const toCreate = items.filter((i) => !existingTexts.has(i.questionText));

    // LLM 分析 + 写库按条并行（allSettled）：单条失败不影响其余条目
    const results = await Promise.allSettled(
      toCreate.map(async (item) => {
        // Optional: run the LLM mistake analyzer for a richer
        // error-type tag. Failure is non-fatal — the row is still
        // created with question text + correct answer.
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

        // 查重 + 创建包进 Serializable 事务：上面的 findMany 查重与创建
        // 之间隔着秒级 LLM 分析，并发请求（双标签页/重试）会双双通过查重，
        // 对同一题干各建一条错题（各带一条 FSRS 调度）——正是上方注释要避免的。
        // 事务内复查兜底，Serializable 冲突（P2034/40001）整体重试一次。
        const createIfAbsent = () =>
          prisma.$transaction(
            async (tx) => {
              const dup = await tx.mistake.findFirst({
                where: { userId, questionText: item.questionText },
                select: { id: true },
              });
              if (dup) return null;
              return tx.mistake.create({
                data: {
                  userId,
                  knowledgeNodeId: null,
                  subjectId,
                  questionText: item.questionText,
                  wrongAnswer: item.wrongAnswer,
                  correctAnswer: item.correctAnswer,
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
            },
            { isolationLevel: 'Serializable' },
          );
        try {
          return (await createIfAbsent()) !== null;
        } catch (error: unknown) {
          const code = (error as { code?: string })?.code;
          if (code === 'P2034' || code === '40001') return (await createIfAbsent()) !== null;
          throw error;
        }
      }),
    );
    // recorded 只计真正新建的行：查重跳过（返回 null）与失败（rejected）都不算
    const recorded = results.filter((r) => r.status === 'fulfilled' && r.value === true).length;

    return NextResponse.json({ recorded });
  } catch (error: unknown) {
    console.error('[doc/record-mistakes] Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: getErrorStatus(error) },
    );
  }
}
