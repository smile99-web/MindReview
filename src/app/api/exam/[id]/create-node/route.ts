import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { getErrorMessage } from '@/lib/errors';

interface KnowledgePointLite {
  title?: string;
  summary?: string;
  keywords?: string[];
  prerequisites?: string[];
  difficulty?: number;
  icapLevel?: string;
}

// POST /api/exam/[id]/create-node
// Returns: { nodeId: string }
//
// "ICAP 训练" 入口：当用户选择"用 ICAP 训练这道题"时，把 ExamUpload 的
// OCR 文字 + 拆解出的知识点持久化成一个 KnowledgeNode，然后跳转到
// 标准的 IcapPipeline 训练页（cards/[id] 渲染的 ICAP tab）。
//
// 之前用户点"出类似题训练"是直接答类似题（Active 阶段替代）。
// 这个端点提供完整的 4 阶段 ICAP 训练流程（Passive 读 / Active 答 /
// Constructive 自解释 / Interactive 追问），更符合项目"ICAP 分层
// 学习"的核心定位。
//
// Idempotent：同一张 examId 第二次调用会复用上次的 node。
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await resolveUserIdFromRequest(_req);
    const { id: examId } = await params;

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

    // Idempotency: derive a stable marker from the examId. If a node
    // was previously created from this exam, return its id.
    // The marker is stored in the node's keywords[] field, prefixed
    // with 'exam:' so we can find it without a separate column.
    const marker = `exam:${examId}`;
    const existing = await prisma.knowledgeNode.findFirst({
      where: {
        keywords: { has: marker },
        subject: { name: exam.subjectName || '通用' },
      },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ nodeId: existing.id, reused: true });
    }

    // Resolve or create a Subject row for the exam's subject so the
    // new node has a valid foreign key. We don't fail the whole flow
    // if the subject is unknown — fall back to "通用".
    let subject = null;
    if (exam.subjectName) {
      subject = await prisma.subject.findFirst({
        where: { name: exam.subjectName },
        select: { id: true },
      });
    }
    if (!subject) {
      subject = await prisma.subject.findFirst({
        where: { name: '通用' },
        select: { id: true },
      });
    }
    if (!subject) {
      // Last-resort: skip the foreign key by upserting the subject
      // on the fly. Avoids breaking the feature if "通用" is missing.
      subject = await prisma.subject.upsert({
        where: { name: '通用' },
        update: {},
        create: { name: '通用', icon: '📝' },
        select: { id: true },
      });
    }

    // Build the node's content from the parsed knowledge points.
    // Title = original OCR question (truncated). Summary = knowledge
    // points joined into a single readable string. Keywords = point
    // titles + the exam marker (for idempotency lookup).
    const kp = (exam.knowledgePoints as { nodes?: KnowledgePointLite[] }) || {};
    const points = kp.nodes || [];
    const titlePrefix = exam.subjectName ? `[${exam.subjectName}] ` : '';
    const nodeTitle = `${titlePrefix}${exam.ocrText
      .replace(/\s+/g, ' ')
      .slice(0, 80)}${exam.ocrText.length > 80 ? '…' : ''}`;
    const nodeSummary = points.length > 0
      ? points
          .map((p, i) => `${i + 1}. ${p.title || '未命名'}: ${p.summary || ''}`)
          .join('\n')
      : exam.ocrText.slice(0, 400);
    const allKeywords = points.flatMap((p) => p.keywords || []);
    const uniqueKeywords = Array.from(new Set([...allKeywords, marker])).slice(0, 20);

    // Average difficulty / cognitiveLoad from the parsed points.
    const avgDifficulty = points.length > 0
      ? Math.round(
          points.reduce((s, p) => s + (p.difficulty || 3), 0) / points.length,
        )
      : 3;
    const avgCognitiveLoad = points.length > 0
      ? Math.round(
          points.reduce((s, p) => s + (p.icapLevel === 'Interactive' ? 5 : 3), 0) /
            points.length,
        )
      : 3;

    const created = await prisma.knowledgeNode.create({
      data: {
        title: nodeTitle,
        summary: nodeSummary,
        keywords: uniqueKeywords,
        subjectId: subject.id,
        difficulty: avgDifficulty,
        cognitiveLoad: avgCognitiveLoad,
        // IcapPipeline reads icapLevel as a string; default to Active
        // (the most common case for a generated knowledge node).
        icapLevel: 'Active',
      },
      select: { id: true, title: true },
    });

    return NextResponse.json({
      nodeId: created.id,
      title: created.title,
      reused: false,
    });
  } catch (error: unknown) {
    console.error('[exam/create-node] Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
