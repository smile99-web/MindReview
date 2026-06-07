import { getErrorMessage } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { assessIcapLevel } from '@/lib/ai-tutor';
import { resolveUserIdFromRequest } from '@/lib/user-context';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { knowledgeNodeId } = body as {
      knowledgeNodeId: string;
      userId?: string;
    };

    // --- Resolve userId from JWT token (with DB fallback) ---
    const userId = await resolveUserIdFromRequest(req);

    // --- Validate required fields ---
    if (!knowledgeNodeId) {
      return NextResponse.json({ error: '缺少 knowledgeNodeId' }, { status: 400 });
    }

    // --- Fetch knowledge node ---
    const node = await prisma.knowledgeNode.findUnique({
      where: { id: knowledgeNodeId },
    });

    if (!node) {
      return NextResponse.json({ error: '知识点不存在' }, { status: 404 });
    }

    // --- Fetch question history from review logs and mistakes ---
    // Get questions associated with this knowledge node that the user has attempted
    const [reviewLogs, mistakes] = await Promise.all([
      prisma.reviewLog.findMany({
        where: {
          knowledgeNodeId,
          userId,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          action: true,
          masteryAfter: true,
          quality: true,
          createdAt: true,
        },
      }),
      prisma.mistake.findMany({
        where: {
          knowledgeNodeId,
          userId,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          questionText: true,
          wrongAnswer: true,
          correctAnswer: true,
          mistakeType: true,
        },
      }),
    ]);

    // Build prior questions array from review logs and mistakes
    const priorQuestions: Array<{ stem: string; answer: string; isCorrect: boolean }> = [];

    // From review logs: use quality score (0-5) to infer correctness (quality >= 3 => correct)
    for (const log of reviewLogs) {
      const isCorrect = log.quality !== null && log.quality >= 3;
      priorQuestions.push({
        stem: log.action === 'reviewed' ? '复习回忆' : `复习操作: ${log.action}`,
        answer: isCorrect ? '正确回忆' : '回忆困难',
        isCorrect,
      });
    }

    // From mistakes: parse question text and answers
    for (const mistake of mistakes) {
      priorQuestions.push({
        stem: mistake.questionText,
        answer: mistake.correctAnswer,
        isCorrect: false, // Mistakes are by definition incorrect answers
      });
    }

    // --- Call ICAP assessment ---
    const assessment = await assessIcapLevel(
      node.title,
      node.summary || '',
      node.masteryLevel,
      priorQuestions,
    );

    return NextResponse.json({
      recommendedLevel: assessment.recommendedLevel,
      reasoning: assessment.reasoning,
      prerequisiteGaps: assessment.prerequisiteGaps,
      metadata: {
        knowledgeNodeId,
        masteryLevel: node.masteryLevel,
        questionsAnalyzed: priorQuestions.length,
        mistakesFound: mistakes.length,
      },
    });
  } catch (error: unknown) {
    console.error('[Tutor Assess API] Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, '服务器内部错误') },
      { status: 500 },
    );
  }
}
