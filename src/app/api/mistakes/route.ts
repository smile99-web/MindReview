import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { analyzeMistake } from '@/lib/llm-client';
import { resolveUserIdFromRequest } from '@/lib/user-context';

// GET /api/mistakes — 获取错题列表
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = await resolveUserIdFromRequest(req);
    const resolved = searchParams.get('resolved');

    const where: any = { userId };
    if (resolved !== null && resolved !== undefined) {
      where.resolved = resolved === 'true';
    }

    const mistakes = await prisma.mistake.findMany({
      where,
      include: {
        knowledgeNode: { select: { id: true, title: true, subject: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(mistakes);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/mistakes — 录入错题并AI分析
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      subjectId,
      knowledgeNodeId,
      questionText,
      wrongAnswer,
      correctAnswer,
    } = body;
    const userId = await resolveUserIdFromRequest(req);

    if (!questionText || !correctAnswer) {
      return NextResponse.json({ error: '缺少题目或正确答案' }, { status: 400 });
    }

    // 1. 尝试从 subjectId 获取学科名
    let subjectName = '未知学科';
    if (subjectId) {
      const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
      if (subject) subjectName = subject.name;
    }

    // 2. AI分析错因
    let analysis: any = {};
    try {
      analysis = await analyzeMistake(subjectName, questionText, wrongAnswer, correctAnswer);
    } catch {
      analysis = {
        mistakeType: 'conceptual',
        analysis: 'AI分析暂不可用',
        relatedKnowledge: [],
        suggestion: '请稍后重试',
      };
    }

    // 3. 创建错题记录
    const mistake = await prisma.mistake.create({
      data: {
        userId,
        knowledgeNodeId,
        subjectId,
        questionText,
        wrongAnswer: wrongAnswer || '',
        correctAnswer,
        mistakeType: analysis.mistakeType || 'conceptual',
        analysis: analysis.analysis || '',
      },
    });

    // 4. 如果有知识点关联且分析出错因类型，更新掌握度
    if (knowledgeNodeId) {
      const node = await prisma.knowledgeNode.findUnique({ where: { id: knowledgeNodeId } });
      if (node) {
        const penalty = analysis.mistakeType === 'careless' ? 3 : 8;
        const newMastery = Math.max(0, (node.masteryLevel || 0) - penalty);
        await prisma.knowledgeNode.update({
          where: { id: knowledgeNodeId },
          data: { masteryLevel: newMastery },
        });
      }
    }

    return NextResponse.json({ success: true, mistake, analysis });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

