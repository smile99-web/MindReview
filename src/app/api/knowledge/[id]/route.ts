import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/knowledge/[id] — 获取单个知识点详情
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const node = await prisma.knowledgeNode.findUnique({
      where: { id },
      include: {
        subject: true,
        chapter: true,
        parent: true,
        children: true,
        knowledgeCards: { orderBy: { sortOrder: 'asc' } },
        questions: true,
        outgoingEdges: { include: { to: true } },
        incomingEdges: { include: { from: true } },
        mistakes: true,
      },
    });

    if (!node) {
      return NextResponse.json({ error: '知识点不存在' }, { status: 404 });
    }

    return NextResponse.json(node);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH /api/knowledge/[id] — 更新知识点
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();

    // --- input validation ---
    const requiredStrings = ['title', 'subjectId', 'icapLevel'];
    const optionalStrings = ['summary', 'chapterId', 'parentId', 'representationType'];
    const arrayFields = ['keywords', 'prerequisites', 'commonMistakes', 'typicalQuestions'];
    const numberFields = ['difficulty', 'cognitiveLoad', 'masteryLevel', 'repetitions', 'easeFactor', 'intervalDays', 'forgetRisk'];
    const dateFields = ['nextReviewAt', 'lastReviewAt'];
    const jsonFields = ['representationData'];

    for (const [key, value] of Object.entries(body)) {
      if (requiredStrings.includes(key)) {
        if (typeof value !== 'string' || value.trim() === '') {
          return NextResponse.json(
            { error: `字段 "${key}" 必须是非空字符串` },
            { status: 400 },
          );
        }
      } else if (optionalStrings.includes(key)) {
        if (value !== null && value !== undefined && (typeof value !== 'string' || value.trim() === '')) {
          return NextResponse.json(
            { error: `字段 "${key}" 必须是字符串` },
            { status: 400 },
          );
        }
      } else if (arrayFields.includes(key)) {
        if (!Array.isArray(value)) {
          return NextResponse.json(
            { error: `字段 "${key}" 必须是数组` },
            { status: 400 },
          );
        }
      } else if (numberFields.includes(key)) {
        if (typeof value !== 'number' || Number.isNaN(value)) {
          return NextResponse.json(
            { error: `字段 "${key}" 必须是数字` },
            { status: 400 },
          );
        }
      } else if (dateFields.includes(key)) {
        if (value !== null && value !== undefined && typeof value !== 'string') {
          return NextResponse.json(
            { error: `字段 "${key}" 必须是日期字符串` },
            { status: 400 },
          );
        }
      } else if (jsonFields.includes(key)) {
        if (value !== null && value !== undefined && (typeof value !== 'object' || Array.isArray(value))) {
          return NextResponse.json(
            { error: `字段 "${key}" 必须是 JSON 对象` },
            { status: 400 },
          );
        }
      }
    }
    // --- end validation ---

    const node = await prisma.knowledgeNode.update({
      where: { id },
      data: body,
    });

    return NextResponse.json(node);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/knowledge/[id] — 删除知识点
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await prisma.knowledgeNode.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
