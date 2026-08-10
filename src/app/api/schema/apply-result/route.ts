import { getErrorMessage } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';

/**
 * POST /api/schema/apply-result — 图式迁移应用练习成绩落库
 * 之前前端 onComplete 只 console.log，成绩全部丢失，无法追踪图式掌握情况。
 *
 * body: { schemaId: string, score: number, stepCount?: number }
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserIdFromRequest(req);
    const body = await req.json();

    const schemaId = typeof body.schemaId === 'string' ? body.schemaId.trim() : '';
    if (!schemaId) {
      return NextResponse.json({ error: 'schemaId 必填' }, { status: 400 });
    }
    const rawScore = typeof body.score === 'number' ? body.score : NaN;
    if (!Number.isFinite(rawScore)) {
      return NextResponse.json({ error: 'score 必须是数字' }, { status: 400 });
    }
    const score = Math.max(0, Math.min(100, Math.round(rawScore)));
    const stepCount = typeof body.stepCount === 'number' && body.stepCount >= 0 ? Math.floor(body.stepCount) : 0;

    // 只允许给真实存在的图式记成绩
    const schemaNode = await prisma.knowledgeNode.findFirst({
      where: { id: schemaId, representationType: 'schema' },
      select: { id: true },
    });
    if (!schemaNode) {
      return NextResponse.json({ error: '图式不存在' }, { status: 404 });
    }

    const attempt = await prisma.schemaApplyAttempt.create({
      data: { userId, schemaId, score, stepCount },
    });
    return NextResponse.json({ ok: true, id: attempt.id, score: attempt.score });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
