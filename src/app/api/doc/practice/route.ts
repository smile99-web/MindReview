import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { getErrorMessage } from '@/lib/errors';
import { generateQuestions } from '@/lib/llm-client';
import type { GenerateQuestionsResult } from '@/lib/llm-client';
import { splitIntoPoints } from '@/lib/answer-points';

type QuestionTypeConfig = {
  type: string; // 'multiple_choice' | 'fill_blank' | 'short_answer'
  label: string; // 显示名
  count: number; // 每种题型出几道
};

// POST /api/doc/practice
// Body: { docId: string }
// Returns: { questions: [{ questionType, stem, options?, answer, explanation }] }
//
// 根据拆解出的知识点数量自动分配题型比例：
// - 选择题 50%（4 个选项）
// - 填空题 30%（___ 标记）
// - 问答题 20%（开放式简答）
//
// 例如 10 个知识点 → 5 选择 + 3 填空 + 2 问答 = 10 道。
// 最少 3 道（知识点 < 3 时），各题型上限 20/10/10 防 LLM 超时。
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
        fileName: true,
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

    // 按知识点数量分配题型比例：选择 50% / 填空 30% / 问答 20%。
    // 有 10 个知识点 → 5 选择 + 3 填空 + 2 问答 = 10 题。
    const kpNodes = (doc.knowledgePoints as { nodes?: Array<{ title?: string }> }) || {};
    const total = Math.max(3, (kpNodes.nodes || []).length);
    const mc = Math.floor(total * 0.5);
    const fb = Math.floor(total * 0.3);
    const sa = total - mc - fb; // remainder to short_answer

    const typesToGenerate: QuestionTypeConfig[] = [
      { type: 'multiple_choice', label: '选择题', count: Math.min(20, mc) },
      { type: 'fill_blank', label: '填空题', count: Math.min(10, fb) },
      { type: 'short_answer', label: '问答题', count: Math.min(10, sa) },
    ];

    // Build a conditioning snippet from the file content that tells
    // the LLM what the material is about.
    const kp = (doc.knowledgePoints as { nodes?: Array<{ title?: string; summary?: string }> }) || {};
    const kpSummary = (kp.nodes || [])
      .map((n) => `${n.title || ''}: ${n.summary || ''}`)
      .join('\n');

    const allQuestions: Array<Record<string, unknown>> = [];

    // Generate questions for each type IN PARALLEL (3 LLM calls at once)
    // generateQuestions signature: (knowledgeTitle, knowledgeSummary,
    // subject, questionType, icapLevel, count). Previous caller was
    // passing the subject name as the title, which made the LLM ignore
    // the actual document content and produce generic questions
    // with no anchor to the parsed knowledge points.
    const docTitle = doc.fileName?.replace(/\.\w+$/, '') || '上传文件';
    const knowledgeSummary =
      kpSummary || doc.content.slice(0, 400) || '教材内容';
    const results = await Promise.all(
      typesToGenerate.map((cfg) =>
        generateQuestions(
          docTitle,
          knowledgeSummary,
          doc.subjectName || '通用',
          cfg.type,
          'Active',
          cfg.count,
        ).then((r: GenerateQuestionsResult) => ({
          type: cfg.type,
          questions: (r.questions || []).map((q) => ({
            questionType: cfg.type,
            stem: q.stem || q.question || '',
            // 短问答给出答案不给选项 — 用户自己打字，不选 ABC。
            // 选择题才给选项（multiple_choice 的 LLM 输出里才有）。
            options: cfg.type === 'multiple_choice' ? (q.options || []) : undefined,
            answer: q.answer || '',
            points: cfg.type === 'short_answer' ? splitIntoPoints(q.answer || '') : undefined,
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
