import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/secrets";
import { synthesizeSpeech } from "@/lib/tts-client";

const DEFAULT_RESOURCE_ID = process.env.DOUBAO_TTS_RESOURCE_ID || "seed-tts-2.0";
const DEFAULT_VOICE_TYPE = process.env.DOUBAO_TTS_VOICE_TYPE || "zh_female_vv_uranus_bigtts";

export async function POST(req: NextRequest) {
  try {
    const { key, baseUrl, cluster, model, resourceId, voiceType } = await req.json();
    const saved = await prisma.apiKey.findUnique({ where: { service: "tts" } });
    const apiKey =
      key ||
      process.env.DOUBAO_TTS_API_KEY ||
      process.env.DOUBAO_TTS_ACCESS_TOKEN ||
      (saved?.key ? decryptSecret(saved.key) : "");
    const resource = resourceId || cluster || baseUrl || saved?.baseUrl || DEFAULT_RESOURCE_ID;
    const voice = voiceType || model || saved?.model || DEFAULT_VOICE_TYPE;

    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "请先填写或保存豆包 TTS API Key" }, { status: 400 });
    }

    if (/^https?:\/\//i.test(resource)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Resource ID 不要填写接口 URL。豆包 TTS 请求地址已内置，请填写类似 seed-tts-2.0 的 Resource ID。",
        },
        { status: 400 },
      );
    }

    const start = Date.now();
    const result = await synthesizeSpeech({
      text: "Hello, this is a TTS test.",
      voiceType: voice,
      apiKey,
      resourceId: resource,
      throwOnError: true,
    });
    const elapsed = Date.now() - start;

    if (!result.audioUrl) {
      throw new Error("Doubao TTS did not return audio data");
    }

    await prisma.apiKey
      .update({ where: { service: "tts" }, data: { lastTest: new Date(), testOk: true } })
      .catch(() => {});

    return NextResponse.json({
      ok: true,
      voice,
      resourceId: resource,
      model: "Doubao TTS",
      message: "TTS generated successfully",
      latencyMs: elapsed,
    });
  } catch (err) {
    await prisma.apiKey
      .update({ where: { service: "tts" }, data: { lastTest: new Date(), testOk: false } })
      .catch(() => {});

    const message = err instanceof Error ? err.message : "TTS test failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
