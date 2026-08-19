import { getErrorMessage, getErrorStatus } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { analyzeMistake } from '@/lib/llm-client';
import { fsrsInitial } from '@/lib/fsrs';
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
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50));

    const where: Prisma.MistakeWhereInput = { userId };
    // Only apply the resolved filter when the value is explicitly 'true' or
    // 'false' — an empty `?resolved=` would otherwise parse to '' which is
    // not nullish, and `'' === 'true'` is false, silently filtering out
    // resolved mistakes with no signal to the caller.
    if (resolved === 'true' || resolved === 'false') {
      where.resolved = resolved === 'true';
    }

    const mistakes = await prisma.mistake.findMany({
      where,
      include: {
        knowledgeNode: { select: { id: true, title: true, subject: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      // Cap to prevent unbounded payload. The mistake book auto-records on
      // every wrong practice answer; a year-old power user could have 10k+
      // rows. UI should paginate via the `limit` query param.
      take: limit,
    });

    return NextResponse.json(mistakes);
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: getErrorStatus(error) });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: '请求体必须是 JSON 对象' }, { status: 400 });
    }
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
      // 学科不存在时若继续 create，会撞外键约束 P2003 → 500；提前返回 400
      if (!subject) {
        return NextResponse.json({ error: '所选学科不存在' }, { status: 400 });
      }
      subjectName = subject.name;
    }

    // knowledgeNodeId 同理：不存在的节点会让 create 撞外键约束
    if (knowledgeNodeId) {
      const node = await prisma.knowledgeNode.findUnique({
        where: { id: knowledgeNodeId },
        select: { id: true },
      });
      if (!node) {
        return NextResponse.json({ error: '知识点不存在' }, { status: 400 });
      }
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

    // fsrsInitial 提供统一的新错题 FSRS 初始状态（state:'new', stability:1,
    // nextReviewAt=+1天）。此前不落这些字段：nextReviewAt=null 靠查询端
    // "null 视为立即到期"兜底，与 practice/route.ts 手写初始状态两处口径
    // 不统一，任何一处查询口径改动都会断（fsrs.ts 注释声明的用法）。
    const fsrsInit = fsrsInitial();
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
        state: fsrsInit.state,
        stability: fsrsInit.stability,
        difficulty: fsrsInit.difficulty,
        reps: fsrsInit.reps,
        lapses: fsrsInit.lapses,
        lastReviewAt: fsrsInit.lastReviewAt,
        nextReviewAt: fsrsInit.nextReviewAt,
      },
    });

    return NextResponse.json({ success: true, mistake, analysis });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: getErrorStatus(error) });
  }
}
