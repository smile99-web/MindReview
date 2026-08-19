import { getErrorMessage } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rate-limit';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { generateImage } from '@/lib/image-client';
import type { Prisma } from '@prisma/client';

// POST /api/image — 生成图片
export async function POST(req: NextRequest) {
  try {
    // Require auth — this route triggers a paid image generation call
    // (Doubao Seedream). Without this guard, any caller that slipped past
    // the proxy could burn the project owner's image quota.
    const userId = await resolveUserIdFromRequest(req);

    // 先校验 body 再限流：顺序反了会让 400 的非法请求也烧掉每日配额
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: '请求体必须是 JSON 对象' }, { status: 400 });
    }
    const { prompt, imageType, contentRefId, style } = body as {
      prompt?: unknown; imageType?: unknown; contentRefId?: unknown; style?: unknown;
    };

    // prompt 必须是非空字符串：只验 !prompt 时，数字/对象等真值会漏到
    // 下游 prompt.slice 抛 TypeError（500）
    if (typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ error: '缺少生成提示词' }, { status: 400 });
    }
    if (prompt.length > 4000) {
      return NextResponse.json({ error: '提示词过长（上限 4000 字）' }, { status: 400 });
    }
    if (imageType !== undefined && imageType !== null && typeof imageType !== 'string') {
      return NextResponse.json({ error: 'imageType 必须是字符串' }, { status: 400 });
    }
    // 白名单：generateImage 只接受这 6 种类型，非法值会被 TS 拒收
    const VALID_IMAGE_TYPES = ['knowledge', 'experiment', 'timeline', 'force', 'reaction', 'portrait'] as const;
    type ValidImageType = (typeof VALID_IMAGE_TYPES)[number];
    if (typeof imageType === 'string' && !(VALID_IMAGE_TYPES as readonly string[]).includes(imageType)) {
      return NextResponse.json(
        { error: `imageType 必须是: ${VALID_IMAGE_TYPES.join(', ')}` },
        { status: 400 },
      );
    }
    const safeImageType: ValidImageType = (imageType as ValidImageType | undefined) || 'knowledge';
    if (contentRefId !== undefined && contentRefId !== null && typeof contentRefId !== 'string') {
      return NextResponse.json({ error: 'contentRefId 必须是字符串' }, { status: 400 });
    }

    // 限流：生图是付费调用（Seedream），每人每天 30 张，防止脚本化烧额度
    const rl = rateLimit(`img:${userId}`, 30, 24 * 60 * 60 * 1000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: '今日配图生成次数已用完，请明天再来' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
      );
    }

    // 生成图片
    const result = await generateImage({
      prompt: prompt.trim(),
      imageType: safeImageType,
      style: style as string | undefined,
    });

    // 保存到数据库
    const asset = await prisma.imageAsset.create({
      data: {
        imageType: safeImageType,
        prompt: prompt.trim(),
        imageUrl: result.imageUrl,
        contentRefId: (contentRefId as string | undefined) ?? null,
        status: result.status,
        errorMessage: result.errorMessage,
      },
    });

    // 记录AI日志
    await prisma.aiGenerationLog.create({
      data: {
        generatorType: 'image',
        model: process.env.SEEDREAM_MODEL || 'doubao-seedream-5-0',
        prompt: prompt.slice(0, 1000),
        status: result.status,
        resultUrl: result.imageUrl || undefined,
        errorMessage: result.errorMessage,
      },
    });

    if (result.status === 'failed') {
      return NextResponse.json({
        imageUrl: '',
        status: 'failed',
        errorMessage: result.errorMessage,
        assetId: asset.id,
      }, { status: 500 });
    }

    return NextResponse.json({
      imageUrl: result.imageUrl,
      status: 'success',
      prompt: result.prompt,
      assetId: asset.id,
    });
  } catch (error: unknown) {
    console.error('[Image API] Error:', error);

    try {
      await prisma.aiGenerationLog.create({
        data: {
          generatorType: 'image',
          model: process.env.SEEDREAM_MODEL || 'doubao-seedream-5-0',
          prompt: '图片生成失败',
          status: 'failed',
          errorMessage: getErrorMessage(error),
        },
      });
    } catch {}

    return NextResponse.json({ error: `图片生成失败: ${getErrorMessage(error)}` }, { status: 500 });
  }
}

// GET /api/image — 获取图片列表
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const imageType = searchParams.get('imageType');
    const status = searchParams.get('status');
    const contentRefId = searchParams.get('contentRefId');
    // parseInt 对非数字输入得 NaN，NaN 的 take 会让 Prisma 忽略分页
    const rawLimit = parseInt(searchParams.get('limit') || '50', 10);
    const limit = Math.min(50, Math.max(1, Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 50));

    const where: Prisma.ImageAssetWhereInput = {};
    if (imageType) where.imageType = imageType;
    if (status) where.status = status;
    if (contentRefId) where.contentRefId = contentRefId;

    const images = await prisma.imageAsset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json(images);
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
