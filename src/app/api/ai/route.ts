import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateQuestions, analyzeMistake, generateSummary } from '@/lib/llm-client';

// GET /api/ai?action=list-logs — 查询 AI 生成日志
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const action = searchParams.get('action');

    if (action === 'list-logs') {
      const generatorType = searchParams.get('generatorType') || 'all';
      const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
      const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));

      const where: Record<string, string> = {};
      if (generatorType !== 'all') {
        where.generatorType = generatorType;
      }

      const [logs, total] = await Promise.all([
        prisma.aiGenerationLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.aiGenerationLog.count({ where }),
      ]);

      return NextResponse.json({ logs, total, page, limit });
    }

    return NextResponse.json({ error: '未知操作' }, { status: 400 });
  } catch (error: any) {
    console.error('[AI API GET] Error:', error);
    return NextResponse.json({ error: error.message || '服务器内部错误' }, { status: 500 });
  }
}

// POST /api/ai/questions — 生成题目
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case 'generate-questions': {
        const { knowledgeNodeId, questionType, icapLevel, count = 3 } = body;

        const node = await prisma.knowledgeNode.findUnique({ where: { id: knowledgeNodeId } });
        if (!node) {
          return NextResponse.json({ error: '知识点不存在' }, { status: 404 });
        }

        const subject = await prisma.subject.findUnique({ where: { id: node.subjectId } });
        const result = await generateQuestions(
          node.title,
          node.summary || '',
          subject?.name || '数学',
          questionType || 'multiple_choice',
          icapLevel || 'Active',
          count,
        );

        // 批量保存题目
        const questions = [];
        if (result.questions) {
          for (const q of result.questions) {
            const question = await prisma.question.create({
              data: {
                knowledgeNodeId,
                questionType: q.questionType || questionType || 'multiple_choice',
                icapLevel: q.icapLevel || icapLevel || 'Active',
                stem: q.stem || q.question || '',
                options: q.options || [],
                answer: q.answer || '',
                explanation: q.explanation || '',
                difficulty: q.difficulty || 3,
                cognitiveLoad: q.cognitiveLoad || 3,
              },
            });
            questions.push(question);
          }
        }

        return NextResponse.json({ success: true, questions });
      }

      case 'analyze-mistake': {
        const { subject, questionText, wrongAnswer, correctAnswer } = body;
        const result = await analyzeMistake(subject, questionText, wrongAnswer, correctAnswer);
        return NextResponse.json(result);
      }

      case 'generate-summary': {
        const { subject, knowledgePoints } = body;
        const result = await generateSummary(subject, knowledgePoints);
        return NextResponse.json({ summary: result });
      }

      default:
        return NextResponse.json({ error: '未知操作' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[AI API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
