import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateImage } from '@/lib/image-client';

// POST /api/image — 生成图片
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, imageType, contentRefId, style } = body;

    if (!prompt) {
      return NextResponse.json({ error: '缺少生成提示词' }, { status: 400 });
    }

    // 生成图片
    const result = await generateImage({ prompt, imageType: imageType || 'knowledge', style });

    // 保存到数据库
    const asset = await prisma.imageAsset.create({
      data: {
        imageType: imageType || 'knowledge',
        prompt,
        imageUrl: result.imageUrl,
        contentRefId,
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
  } catch (error: any) {
    console.error('[Image API] Error:', error);

    try {
      await prisma.aiGenerationLog.create({
        data: {
          generatorType: 'image',
          model: process.env.SEEDREAM_MODEL || 'doubao-seedream-5-0',
          prompt: '图片生成失败',
          status: 'failed',
          errorMessage: error.message,
        },
      });
    } catch {}

    return NextResponse.json({ error: `图片生成失败: ${error.message}` }, { status: 500 });
  }
}

// GET /api/image — 获取图片列表
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const imageType = searchParams.get('imageType');
    const status = searchParams.get('status');
    const contentRefId = searchParams.get('contentRefId');

    const where: any = {};
    if (imageType) where.imageType = imageType;
    if (status) where.status = status;
    if (contentRefId) where.contentRefId = contentRefId;

    const images = await prisma.imageAsset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json(images);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
