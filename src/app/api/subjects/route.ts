import { getErrorMessage } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

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

    // 字段白名单：直接传 body 会让多余字段触发 Prisma 校验错误（500），
    // 也可能写入调用方本不该控制的列
    // Subject.name 为 @unique：重名创建撞 P2002，返回 409 而非不透明 500。
    // 不做 findUnique 预检——预检存在 TOCTOU 竞态，约束兜底才是正解
    // （写法与 auth/register 的 P2002 处理一致）
    let subject;
    try {
      subject = await prisma.subject.create({
        data: {
          name: body.name.trim(),
          icon: body.icon ?? null,
          colorClass: body.colorClass ?? null,
          description: body.description ?? null,
        },
      });
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return NextResponse.json({ error: '该学科已存在' }, { status: 409 });
      }
      throw err;
    }
    return NextResponse.json(subject);
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
