import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { getErrorMessage } from '@/lib/errors';

// POST /api/exam/[id]/learn/[nodeIdx]
// Creates a single KnowledgeNode from the exam's knowledgePoints[n].
// Returns { nodeId } — the client redirects to /cards/[nodeId] for
// ICAP training + practice.
//
// Idempotent: same exam + same index → same node. Uses keywords
// array marker "exam:<examId>:<nodeIdx>" to find existing.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; nodeIdx: string }> },
) {
  try {
    const userId = await resolveUserIdFromRequest(_req);
    const { id: examId, nodeIdx: idxStr } = await params;
    const nodeIdx = parseInt(idxStr, 10);
    if (!Number.isFinite(nodeIdx) || nodeIdx < 0) {
      return NextResponse.json({ error: 'nodeIdx 必须是 >= 0 的整数' }, { status: 400 });
    }

    const exam = await prisma.examUpload.findUnique({
      where: { id: examId },
      select: { userId: true, subjectName: true, knowledgePoints: true },
    });
    if (!exam) {
      return NextResponse.json({ error: '试卷不存在' }, { status: 404 });
    }
    if (exam.userId !== userId) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 });
    }

    const kp = (exam.knowledgePoints as { nodes?: Array<{ title?: string; summary?: string; keywords?: string[]; prerequisites?: string[]; commonMistakes?: string[]; typicalQuestions?: string[]; difficulty?: number; cognitiveLoad?: number; icapLevel?: string }> }) || {};
    const points = kp.nodes || [];
    if (nodeIdx >= points.length) {
      return NextResponse.json({ error: '知识点索引越界' }, { status: 400 });
    }
    const point = points[nodeIdx];
    if (!point || !point.title?.trim()) {
      return NextResponse.json({ error: '该知识点标题为空' }, { status: 400 });
    }

    // Idempotency marker
    const marker = `exam:${examId}:${nodeIdx}`;
    const existing = await prisma.knowledgeNode.findFirst({
      where: { keywords: { has: marker } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ nodeId: existing.id, reused: true });
    }

    // Resolve or create Subject
    let subjectId: string | null = null;
    if (exam.subjectName) {
      const s = await prisma.subject.findFirst({ where: { name: exam.subjectName }, select: { id: true } });
      subjectId = s?.id || null;
    }
    if (!subjectId) {
      const s = await prisma.subject.upsert({ where: { name: '通用' }, update: {}, create: { name: '通用', icon: '📝' }, select: { id: true } });
      subjectId = s.id;
    }

    const title = `${point.title.trim()}`;
    const summary = (point.summary || '').trim();
    const keywords = Array.from(new Set([...(point.keywords || []).slice(0, 10), marker])).slice(0, 20);
    const difficulty = typeof point.difficulty === 'number' ? Math.max(1, Math.min(5, point.difficulty)) : 3;

    // 并发双击/多标签：两个请求可同时通过上面的 findFirst 幂等检查。
    // 事务内复查 marker + Serializable：后进入者命中已有节点直接复用；
    // 冲突（P2034/40001）整体重试一次，重试时复查生效。
    const createNode = () =>
      prisma.$transaction(
        async (tx) => {
          const dup = await tx.knowledgeNode.findFirst({
            where: { keywords: { has: marker } },
            select: { id: true, title: true },
          });
          if (dup) return { node: dup, reused: true as const };
          const node = await tx.knowledgeNode.create({
            data: {
              subjectId,
              title,
              summary,
              keywords,
              prerequisites: (point.prerequisites || []).slice(0, 10),
              commonMistakes: (point.commonMistakes || []).slice(0, 10),
              typicalQuestions: (point.typicalQuestions || []).slice(0, 10),
              difficulty,
              cognitiveLoad: typeof point.cognitiveLoad === 'number' ? point.cognitiveLoad : 3,
              icapLevel: (point.icapLevel || 'Active'),
            },
            select: { id: true, title: true },
          });
          return { node, reused: false as const };
        },
        { isolationLevel: 'Serializable' },
      );
    let outcome;
    try {
      outcome = await createNode();
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      if (code !== 'P2034' && code !== '40001') throw error;
      outcome = await createNode();
    }

    return NextResponse.json({ nodeId: outcome.node.id, title: outcome.node.title, reused: outcome.reused });
  } catch (error: unknown) {
    console.error('[exam/learn] Error:', error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
