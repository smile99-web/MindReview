import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { getErrorMessage } from '@/lib/errors';
import { generateQuestions } from '@/lib/llm-client';
import type { GenerateQuestionsResult } from '@/lib/llm-client';

// POST /api/exam/practice
// Body: { examId: string, count?: number }
// Returns: { questions: [{ stem, options, answer, explanation, ... }] }
//
// Step 3 of the exam-photo flow. Builds an LLM prompt that conditions
// on the OCR text + the parsed knowledge points, then calls the
// same generateQuestions the Active-stage practice page uses. The
// resulting questions are saved to ExamUpload.practiceQuestions so
// the user can re-attempt the same exam's "类似题" without a fresh
// LLM call.
export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserIdFromRequest(req);
    const body = (await req.json().catch(() => ({}))) as {
      examId?: unknown;
      count?: unknown;
    };
    const examId = typeof body.examId === 'string' ? body.examId.trim() : '';
    const requestedCount = typeof body.count === 'number' ? body.count : 5;
    const count = Math.max(1, Math.min(8, Math.floor(requestedCount)));

    if (!examId) {
      return NextResponse.json(
        { error: 'examId is required' },
        { status: 400 },
      );
    }

    const exam = await prisma.examUpload.findUnique({
      where: { id: examId },
      select: {
        userId: true,
        ocrText: true,
        subjectName: true,
        knowledgePoints: true,
      },
    });
    if (!exam) {
      return NextResponse.json({ error: '试卷不存在' }, { status: 404 });
    }
    if (exam.userId !== userId) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 });
    }

    // Build a context string that ties the new questions to the
    // original question. This is what makes the practice set
    // "类似题" instead of unrelated questions on the same subject.
    const kp = (exam.knowledgePoints as { nodes?: Array<{ title?: string; summary?: string }> }) || {};
    const kpSummary = (kp.nodes || [])
      .map((n) => `${n.title || ''}: ${n.summary || ''}`)
      .join('\n');

    const conditioning = `原题（来自学生拍照上传）：
"""
${exam.ocrText}
"""

${kpSummary ? `拆解出的关键知识点：\n${kpSummary}\n` : ''}
请围绕上述原题考察的相同知识点，生成 ${count} 道考察深度相似的练习题。题目难度与原题一致或略高，题型以"原题考察的核心概念"为主，避免直接重复原题。`;

    const subject = exam.subjectName || '通用';
    // conditioning 此前是死代码：拼好了"原题 + 拆解知识点"的条件串却从未
    // 传给 LLM，只传了 80/400 字符的 OCR 切片（doc/practice:71-83 是正确
    // 做法）。generateQuestions(title, summary, ...) 的用户提示为
    // `知识点：${title}\n解释：${summary}`，把 conditioning 作为 summary
    // 传入，LLM 才能锚定原题与知识点出"类似题"。
    const result: GenerateQuestionsResult = await generateQuestions(
      exam.ocrText.slice(0, 80) || '拍照题目',
      conditioning,
      subject,
      'multiple_choice',
      'Active',
      count,
      // 交互式出题（用户在等）：推理模型会先思考 60s+ 必撞超时
      { preferNonReasoning: true },
    );

    const questions = (result.questions || []).map((q) => ({
      questionType: q.questionType || 'multiple_choice',
      stem: q.stem || q.question || '',
      options: q.options || [],
      answer: q.answer || '',
      explanation: q.explanation || '',
      difficulty: q.difficulty || 3,
      cognitiveLoad: q.cognitiveLoad || 3,
    }));

    // 空结果不落库：LLM 归一化后合法返回空数组时，静默把已存的
    // practiceQuestions 覆盖为 []（用户已生成的练习被清空还返回 200）。
    // doc/practice:119-126 已修过同款问题，此处是漏修的副本。
    if (questions.length === 0) {
      return NextResponse.json(
        { error: 'AI 出题失败，未生成有效题目，请重试' },
        { status: 502 },
      );
    }

    await prisma.examUpload.update({
      where: { id: examId },
      data: { practiceQuestions: questions as unknown as object },
    });

    return NextResponse.json({ questions });
  } catch (error: unknown) {
    console.error('[exam/practice] Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
