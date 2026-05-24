import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateQuestions, analyzeMistake, generateSummary } from '@/lib/llm-client';

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
