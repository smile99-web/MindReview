import { getErrorMessage } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { analyzeMistake } from '@/lib/llm-client';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import type { Prisma } from '@prisma/client';

interface MistakeAnalysis {
  mistakeType?: string;
  analysis?: string;
  relatedKnowledge?: string[];
  suggestion?: string;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = await resolveUserIdFromRequest(req);
    const resolved = searchParams.get('resolved');

    const where: Prisma.MistakeWhereInput = { userId };
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
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const subjectId = asString(body?.subjectId) || null;
    const knowledgeNodeId = asString(body?.knowledgeNodeId) || null;
    const questionText = asString(body?.questionText);
    const wrongAnswer = asString(body?.wrongAnswer);
    const correctAnswer = asString(body?.correctAnswer);
    const userId = await resolveUserIdFromRequest(req);

    if (!questionText || !correctAnswer) {
      return NextResponse.json({ error: '缺少题目或正确答案' }, { status: 400 });
    }

    let subjectName = '未知学科';
    if (subjectId) {
      const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
      if (subject) subjectName = subject.name;
    }

    let analysis: MistakeAnalysis = {};
    try {
      analysis = await analyzeMistake(
        subjectName,
        questionText,
        wrongAnswer,
        correctAnswer,
      ) as MistakeAnalysis;
    } catch {
      analysis = {
        mistakeType: 'conceptual',
        analysis: 'AI 分析暂不可用',
        relatedKnowledge: [],
        suggestion: '请稍后重试',
      };
    }

    const mistake = await prisma.mistake.create({
      data: {
        userId,
        knowledgeNodeId,
        subjectId,
        questionText,
        wrongAnswer,
        correctAnswer,
        mistakeType: analysis.mistakeType || 'conceptual',
        analysis: analysis.analysis || '',
      },
    });

    return NextResponse.json({ success: true, mistake, analysis });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
