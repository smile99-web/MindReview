import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { getErrorMessage } from '@/lib/errors';
import { generateQuestions } from '@/lib/llm-client';
import type { GenerateQuestionsResult } from '@/lib/llm-client';

type QuestionTypeConfig = {
  type: string; // 'multiple_choice' | 'fill_blank' | 'short_answer'
  label: string; // 显示名
  count: number; // 每种题型出几道
};

const DEFAULT_TYPES: QuestionTypeConfig[] = [
  { type: 'multiple_choice', label: '选择题', count: 3 },
  { type: 'fill_blank', label: '填空题', count: 2 },
  { type: 'short_answer', label: '问答题', count: 2 },
];

// POST /api/doc/practice
// Body: { docId: string, types?: [{type, count}] }
// Returns: { questions: [{ questionType, stem, options?, answer, explanation }] }
//
// Generates practice questions for each requested type. Defaults to
// 3 选择题 + 2 填空题 + 2 问答题. Uses the same generateQuestions
// LLM helper as the exist
// 练习的类型有选择、填空、问答三种类型
export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserIdFromRequest(req);
    const body = (await req.json().catch(() => ({}))) as {
      docId?: unknown;
      types?: QuestionTypeConfig[];
    };
    const docId = typeof body.docId === 'string' ? body.docId.trim() : '';
    if (!docId) {
      return NextResponse.json({ error: 'docId is required' }, { status: 400 });
    }

    const doc = await prisma.docUpload.findUnique({
      where: { id: docId },
      select: {
        userId: true,
        content: true,
        subjectName: true,
        knowledgePoints: true,
      },
    });
    if (!doc) {
      return NextResponse.json({ error: '文件不存在' }, { status: 404 });
    }
    if (doc.userId !== userId) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 });
    }

    const typesToGenerate =
      Array.isArray(body.types) && body.types.length > 0
        ? body.types.map((t) => ({
            type: typeof t.type === 'string' ? t.type : 'multiple_choice',
            count: Math.max(1, Math.min(5, typeof t.count === 'number' ? Math.floor(t.count) : 2)),
          }))
        : DEFAULT_TYPES;

    // Build a conditioning snippet from the file content that tells
    // the LLM what the material is about.
    const kp = (doc.knowledgePoints as { nodes?: Array<{ title?: string; summary?: string }> }) || {};
    const kpSummary = (kp.nodes || [])
      .map((n) => `${n.title || ''}: ${n.summary || ''}`)
      .join('\n');

    const allQuestions: Array<Record<string, unknown>> = [];

    // Generate questions for each type IN PARALLEL (3 LLM calls at once)
    const results = await Promise.all(
      typesToGenerate.map((cfg) =>
        generateQuestions(
          doc.subjectName || '通用',
          kpSummary || doc.content.slice(0, 80) || '知识点',
          cfg.type,
          'Active',
          String(cfg.count),
        ).then((r: GenerateQuestionsResult) => ({
          type: cfg.type,
          questions: (r.questions || []).map((q) => ({
            questionType: cfg.type,
            stem: q.stem || q.question || '',
            options: q.options || (cfg.type === 'multiple_choice' ? undefined : undefined),
            answer: q.answer || '',
            explanation: q.explanation || '',
            difficulty: q.difficulty || 3,
            cognitiveLoad: q.cognitiveLoad || 3,
          })),
        })).catch((err: unknown) => {
          console.warn(`[doc/practice] generate failed for ${cfg.type}:`, err);
          return { type: cfg.type, questions: [] };
        })
      ),
    );
    for (const r of results) {
      allQuestions.push(...r.questions);
    }

    await prisma.docUpload.update({
      where: { id: docId },
      data: { practiceQuestions: allQuestions as unknown as object },
    });

    return NextResponse.json({ questions: allQuestions });
  } catch (error: unknown) {
    console.error('[doc/practice] Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
