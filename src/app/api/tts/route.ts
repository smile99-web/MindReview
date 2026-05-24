import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { synthesizeSpeech } from '@/lib/tts-client';

// POST /api/tts — 文字转语音
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, contentType, contentRefId, voiceType, userId } = body;

    if (!text) {
      return NextResponse.json({ error: '缺少文本内容' }, { status: 400 });
    }

    // 检查是否已有缓存
    const existing = await prisma.audioAsset.findFirst({
      where: { text, voiceType: voiceType || undefined },
    });

    if (existing) {
      return NextResponse.json({
        audioUrl: existing.audioUrl,
        durationMs: existing.durationMs,
        cached: true,
      });
    }

    // 生成TTS
    const { audioUrl, durationMs } = await synthesizeSpeech({ text, voiceType });

    if (!audioUrl) {
      return NextResponse.json({ error: 'TTS生成失败' }, { status: 500 });
    }

    // 保存到数据库
    const asset = await prisma.audioAsset.create({
      data: {
        userId,
        contentType: contentType || 'card',
        contentRefId,
        text,
        audioUrl,
        durationMs,
        voiceType,
      },
    });

    // 记录AI日志
    await prisma.aiGenerationLog.create({
      data: {
        generatorType: 'tts',
        model: process.env.DOUBAO_TTS_VOICE_TYPE || 'volcano_tts',
        prompt: text.slice(0, 500),
        status: 'success',
        resultUrl: audioUrl,
        durationMs,
      },
    });

    return NextResponse.json({ audioUrl, durationMs, cached: false, assetId: asset.id });
  } catch (error: any) {
    console.error('[TTS API] Error:', error);

    try {
      await prisma.aiGenerationLog.create({
        data: {
          generatorType: 'tts',
          model: process.env.DOUBAO_TTS_VOICE_TYPE || 'volcano_tts',
          prompt: 'TTS生成失败',
          status: 'failed',
          errorMessage: error.message,
        },
      });
    } catch {}

    return NextResponse.json({ error: `TTS失败: ${error.message}` }, { status: 500 });
  }
}
