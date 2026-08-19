import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { getErrorMessage, getErrorStatus } from '@/lib/errors';

// POST /api/doc/[id]/create-node
// Creates a KnowledgeNode from the parsed doc so the user can do
// ICAP 4-stage training (same pattern as exam photos).
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await resolveUserIdFromRequest(_req);
    const { id: docId } = await params;

    const doc = await prisma.docUpload.findUnique({
      where: { id: docId },
      select: { userId: true, content: true, fileName: true, subjectName: true, knowledgePoints: true },
    });
    if (!doc) {
      return NextResponse.json({ error: '文件不存在' }, { status: 404 });
    }
    if (doc.userId !== userId) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 });
    }

    const marker = `doc:${docId}`;
    const existing = await prisma.knowledgeNode.findFirst({
      where: { keywords: { has: marker } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ nodeId: existing.id, reused: true });
    }

    const subjectName = doc.subjectName || '通用';
    let subject = await prisma.subject.findFirst({
      where: { name: subjectName },
      select: { id: true },
    });
    if (!subject) {
      subject = await prisma.subject.upsert({
        where: { name: '通用' },
        update: {},
        create: { name: '通用', icon: '📝' },
        select: { id: true },
      });
    }

    const kp = (doc.knowledgePoints as { nodes?: Array<{ title?: string; summary?: string; keywords?: string[]; difficulty?: number; icapLevel?: string }> }) || {};
    const points = kp.nodes || [];

    const nodeTitle = `${doc.fileName?.replace(/\.\w+$/, '') || '上传文件'}（${subjectName}）`;
    const nodeSummary = points.length > 0
      ? points.map((p, i) => `${i + 1}. ${p.title || '未命名'}: ${p.summary || ''}`).join('\n')
      : doc.content.slice(0, 400);
    const allKeywords = points.flatMap((p) => p.keywords || []);
    const uniqueKeywords = Array.from(new Set([...allKeywords, marker])).slice(0, 20);

    const avgDifficulty = points.length > 0
      ? Math.round(points.reduce((s, p) => s + (p.difficulty || 3), 0) / points.length)
      : 3;

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
              title: nodeTitle,
              summary: nodeSummary,
              keywords: uniqueKeywords,
              subjectId: subject.id,
              difficulty: avgDifficulty,
              cognitiveLoad: 3,
              icapLevel: 'Active',
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
    console.error('[doc/create-node] Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: getErrorStatus(error) },
    );
  }
}
