import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUserId } from '@/lib/server-auth';

// 每人最多同时持有 10 个推荐码，防止滥用刷码
const MAX_CODES_PER_USER = 10;
// 去除易混淆字符（0/O/1/I/L），口头报码也不容易听错
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateCode(): string {
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

const CODE_SELECT = { id: true, code: true, maxUses: true, usedCount: true, createdAt: true } as const;

// GET /api/invite-codes — 列出当前用户生成的推荐码
export async function GET(request: NextRequest) {
  try {
    const userId = getAuthenticatedUserId(request);
    if (!userId) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }
    const codes = await prisma.inviteCode.findMany({
      where: { createdById: userId },
      orderBy: { createdAt: 'desc' },
      select: CODE_SELECT,
    });
    return NextResponse.json({ codes });
  } catch {
    return NextResponse.json({ detail: '服务器内部错误' }, { status: 500 });
  }
}

// POST /api/invite-codes — 为当前用户生成一个新推荐码（不限使用次数）
export async function POST(request: NextRequest) {
  try {
    const userId = getAuthenticatedUserId(request);
    if (!userId) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }
    const count = await prisma.inviteCode.count({ where: { createdById: userId } });
    if (count >= MAX_CODES_PER_USER) {
      return NextResponse.json(
        { detail: `最多同时持有 ${MAX_CODES_PER_USER} 个推荐码，可先删除不用的` },
        { status: 400 }
      );
    }
    // 随机码撞唯一约束的概率极低（32^8），但撞了重试比直接 500 友好
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const created = await prisma.inviteCode.create({
          data: { code: generateCode(), createdById: userId },
          select: CODE_SELECT,
        });
        return NextResponse.json(created, { status: 201 });
      } catch (err: unknown) {
        if ((err as { code?: string })?.code === 'P2002') continue;
        throw err;
      }
    }
    return NextResponse.json({ detail: '生成失败，请重试' }, { status: 500 });
  } catch {
    return NextResponse.json({ detail: '服务器内部错误' }, { status: 500 });
  }
}

// DELETE /api/invite-codes?id=xxx — 删除自己的推荐码
// deleteMany + createdById 条件：只能删自己的码；CLI 创建的码 createdById 为 NULL，谁都删不掉
export async function DELETE(request: NextRequest) {
  try {
    const userId = getAuthenticatedUserId(request);
    if (!userId) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }
    const id = new URL(request.url).searchParams.get('id');
    if (!id) {
      return NextResponse.json({ detail: '缺少 id 参数' }, { status: 400 });
    }
    const result = await prisma.inviteCode.deleteMany({ where: { id, createdById: userId } });
    if (result.count === 0) {
      return NextResponse.json({ detail: '推荐码不存在' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ detail: '服务器内部错误' }, { status: 500 });
  }
}
