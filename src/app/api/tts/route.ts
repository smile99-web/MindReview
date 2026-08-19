import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErrorMessage } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { resolveTtsConfig, synthesizeSpeechAuto } from "@/lib/tts-client";
import { resolveUserIdFromRequest } from "@/lib/user-context";
import type { Prisma } from "@prisma/client";

export async function POST(req: NextRequest) {
  try {
    // 鉴权：TTS 是付费调用；缓存改为全库共享后不再按用户过滤
    const userId = await resolveUserIdFromRequest(req);
    // 限流：缓存命中不计费也不计数，只有真正调合成接口才计（换文本绕缓存的
    // 脚本会被这里挡住）——每人每天 300 次新生成，正常使用绰绰有余。
    const body = await req.json();
    const { text, contentType, contentRefId, voiceType } = body;

    if (!text) {
      return NextResponse.json({ error: "Missing text content" }, { status: 400 });
    }
    // 单次付费调用要有长度上限，避免不受限的 TTS 费用
    if (text.length > 2000) {
      return NextResponse.json({ error: "文本过长" }, { status: 400 });
    }

    // 方舟统一调用开启时走方舟 /audio/speech，否则走 OpenSpeech 备选；
    // 音色优先级：请求参数 > 当前通道的配置
    const ttsConfig = await resolveTtsConfig(voiceType);
    const voice = ttsConfig.voice;
    const engine = ttsConfig.mode === 'ark' ? `ark:${ttsConfig.resourceId}` : ttsConfig.resourceId;

    // 缓存全库共享：相同文本 + 音色只生成一次，不按 userId 隔离
    const existingWhere: Prisma.AudioAssetWhereInput = {
      text,
      voiceType: voice,
    };
    if (contentType) existingWhere.contentType = contentType;
    if (contentRefId) existingWhere.contentRefId = contentRefId;

    const existing = await prisma.audioAsset.findFirst({
      where: existingWhere,
      orderBy: { createdAt: "desc" },
    });

    if (existing) {
      return NextResponse.json({
        audioUrl: existing.audioUrl,
        durationMs: existing.durationMs,
        cached: true,
      });
    }

    // 只有未命中缓存、真正要付费合成时才计限流
    const rl = rateLimit(`tts:${userId}`, 300, 24 * 60 * 60 * 1000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: '今日语音生成次数已用完，请明天再来' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
      );
    }

    const { audioUrl, durationMs } = await synthesizeSpeechAuto({ text, voiceType });

    if (!audioUrl) {
      return NextResponse.json({ error: "TTS generation failed" }, { status: 500 });
    }

    const asset = await prisma.audioAsset.create({
      data: {
        userId: null, // 共享缓存资产，不归属单个用户
        contentType: contentType || "card",
        contentRefId,
        text,
        audioUrl,
        durationMs,
        voiceType: voice,
      },
    });

    await prisma.aiGenerationLog.create({
      data: {
        generatorType: "tts",
        model: `${engine}:${voice}`,
        prompt: text.slice(0, 500),
        status: "success",
        resultUrl: audioUrl,
        durationMs,
      },
    });

    return NextResponse.json({ audioUrl, durationMs, cached: false, assetId: asset.id });
  } catch (error) {
    const message = getErrorMessage(error, "Unknown TTS error");
    console.error("[TTS API] Error:", message);

    try {
      await prisma.aiGenerationLog.create({
        data: {
          generatorType: "tts",
          model: "tts",
          prompt: "TTS generation failed",
          status: "failed",
          errorMessage: message,
        },
      });
    } catch {}

    return NextResponse.json(
      { error: `TTS failed: ${message}` },
      { status: message === "Authentication required" ? 401 : 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const uid = await resolveUserIdFromRequest(req);
    const { searchParams } = new URL(req.url);
    const contentType = searchParams.get("contentType");
    const contentRefId = searchParams.get("contentRefId");
    // parseInt 对非数字输入得 NaN，NaN 的 take 会让 Prisma 忽略分页
    const rawLimit = parseInt(searchParams.get("limit") || "10", 10);
    const limit = Math.min(20, Math.max(1, Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 10));

    const where: Prisma.AudioAssetWhereInput = {
      OR: [{ userId: uid }, { userId: null }],
    };
    if (contentType) where.contentType = contentType;
    if (contentRefId) where.contentRefId = contentRefId;

    const assets = await prisma.audioAsset.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json(assets);
  } catch (error: unknown) {
    const message = getErrorMessage(error, "Failed to load audio assets");
    return NextResponse.json(
      { error: message },
      { status: message === "Authentication required" ? 401 : 500 },
    );
  }
}
