import { getErrorMessage } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/subjects — 获取学科列表
export async function GET() {
  try {
    const subjects = await prisma.subject.findMany({
      include: {
        _count: {
          select: {
            chapters: true,
            knowledgeNodes: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json(subjects);
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

// POST /api/subjects — 创建学科
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // --- Validation ---
    if (body === null || typeof body !== 'object') {
      return NextResponse.json({ error: '请求体必须是 JSON 对象' }, { status: 400 });
    }

    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return NextResponse.json({ error: '学科名称 (name) 是必填项，且必须是非空字符串' }, { status: 400 });
    }

    if (body.icon !== undefined && body.icon !== null && typeof body.icon !== 'string') {
      return NextResponse.json({ error: '图标 (icon) 必须是字符串' }, { status: 400 });
    }

    if (body.colorClass !== undefined && body.colorClass !== null && typeof body.colorClass !== 'string') {
      return NextResponse.json({ error: '颜色类名 (colorClass) 必须是字符串' }, { status: 400 });
    }

    if (body.description !== undefined && body.description !== null && typeof body.description !== 'string') {
      return NextResponse.json({ error: '描述 (description) 必须是字符串' }, { status: 400 });
    }
    // --- End Validation ---

    const subject = await prisma.subject.create({ data: body });
    return NextResponse.json(subject);
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
