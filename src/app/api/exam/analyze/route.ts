import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { getErrorMessage } from '@/lib/errors';
import { decomposeKnowledge } from '@/lib/llm-client';
import type { DecomposeKnowledgeResult } from '@/lib/llm-client';

// POST /api/exam/analyze
// Body: { examId: string }
// Returns: { knowledgePoints: [{ title, summary, keywords, ... }] }
//
// Step 2 of the exam-photo flow. Uses the same decomposeKnowledge
// function the textbook generator uses, but pointed at the OCR
// text instead of a chapter. The LLM is asked to break the question
// into the smallest knowledge primitives the student needs to
// understand it (per the project purpose: '把题目拆解为最基本的
// 知识点'), then the UI can show each point with a short
// explanation and link to deeper study.
export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserIdFromRequest(req);
    const body = (await req.json()) as { examId?: unknown };
    const examId = typeof body.examId === 'string' ? body.examId.trim() : '';
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
    if (!exam.ocrText.trim()) {
      return NextResponse.json(
        { error: '该试卷没有可分析的题目文字' },
        { status: 422 },
      );
    }

    // The OCR text is the "content" the textbook generator would
    // normally get. The subject is whatever the vision LLM guessed
    // (or we fall back to a generic label). The chapter is empty
    // since the user uploaded a single question, not a full
    // chapter.
    const subject = exam.subjectName || '通用';
    // 交互式拆解：用户举着 iPad 在屏幕前等。preferNonReasoning 避免推理模型
    // 先思考 60s+（deepseek-v4-flash 实测 24.5s 起步，长文本必超 60s 超时），
    // maxTokens 4096 对单题拆解（~5-10 个知识点）足够，进一步压缩出字时间。
    const result = await decomposeKnowledge(
      subject,
      '通用',
      'OCR 上传',
      exam.ocrText,
      { maxTokens: 4096, preferNonReasoning: true },
    );

    // Persist the parsed knowledge points. The result.nodes field is
    // an array of partial KnowledgeNode shapes (title, summary,
    // keywords, etc.) — we keep it as-is so the UI can render each
    // point and let the user start training from it.
    const knowledgePoints: DecomposeKnowledgeResult = {
      nodes: (result.nodes || []).map((n) => ({
        title: n.title || '',
        summary: n.summary || '',
        keywords: n.keywords || [],
        prerequisites: n.prerequisites || [],
        commonMistakes: n.commonMistakes || [],
        typicalQuestions: n.typicalQuestions || [],
        difficulty: typeof n.difficulty === 'number' ? n.difficulty : 3,
        cognitiveLoad:
          typeof n.cognitiveLoad === 'number' ? n.cognitiveLoad : 3,
        icapLevel: n.icapLevel || 'Active',
      })),
      edges: result.edges || [],
    };

    await prisma.examUpload.update({
      where: { id: examId },
      data: { knowledgePoints: knowledgePoints as unknown as object },
    });

    return NextResponse.json({ knowledgePoints });
  } catch (error: unknown) {
    console.error('[exam/analyze] Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
