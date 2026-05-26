import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/secrets";
import { synthesizeSpeech } from "@/lib/tts-client";

const DEFAULT_RESOURCE_ID = process.env.DOUBAO_TTS_RESOURCE_ID || "seed-tts-2.0";
const DEFAULT_VOICE_TYPE = process.env.DOUBAO_TTS_VOICE_TYPE || "zh_female_vv_uranus_bigtts";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, contentType, contentRefId, voiceType, userId } = body;

    if (!text) {
      return NextResponse.json({ error: "Missing text content" }, { status: 400 });
    }

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

    const saved = await prisma.apiKey.findUnique({ where: { service: "tts" } });
    const apiKey = saved?.key ? decryptSecret(saved.key) : undefined;
    const voice = voiceType || saved?.model || DEFAULT_VOICE_TYPE;
    const resourceId = saved?.baseUrl || DEFAULT_RESOURCE_ID;
    const { audioUrl, durationMs } = await synthesizeSpeech({
      text,
      voiceType: voice,
      apiKey,
      resourceId,
      throwOnError: true,
    });

    if (!audioUrl) {
      return NextResponse.json({ error: "TTS generation failed" }, { status: 500 });
    }

    const asset = await prisma.audioAsset.create({
      data: {
        userId,
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
        model: `${resourceId}:${voice}`,
        prompt: text.slice(0, 500),
        status: "success",
        resultUrl: audioUrl,
        durationMs,
      },
    });

    return NextResponse.json({ audioUrl, durationMs, cached: false, assetId: asset.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown TTS error";
    console.error("[TTS API] Error:", message);

    try {
      await prisma.aiGenerationLog.create({
        data: {
          generatorType: "tts",
          model: DEFAULT_RESOURCE_ID,
          prompt: "TTS generation failed",
          status: "failed",
          errorMessage: message,
        },
      });
    } catch {}

    return NextResponse.json({ error: `TTS failed: ${message}` }, { status: 500 });
  }
}
