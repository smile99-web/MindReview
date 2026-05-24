import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/secrets";

export async function POST(req: NextRequest) {
  try {
    const { key, appId, cluster, voiceType } = await req.json();
    const saved = await prisma.apiKey.findUnique({ where: { service: "tts" } });
    const accessToken = key || process.env.DOUBAO_TTS_ACCESS_TOKEN || (saved?.key ? decryptSecret(saved.key) : "");
    const appIdVal = appId || process.env.DOUBAO_TTS_APP_ID || "";
    const clusterVal = cluster || process.env.DOUBAO_TTS_CLUSTER || "volcano_tts";
    const voiceVal = voiceType || process.env.DOUBAO_TTS_VOICE_TYPE || "BV701_streaming";

    if (!accessToken || !appIdVal) {
      return NextResponse.json({ ok: false, error: "Please save an access token and set App ID" }, { status: 400 });
    }

    const start = Date.now();
    const res = await fetch("https://openspeech.bytedance.com/api/v1/tts_async/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer;${accessToken}` },
      body: JSON.stringify({
        app: { appid: appIdVal, cluster: clusterVal },
        user: "mindreview-test",
        audio: { voice_type: voiceVal, encoding: "mp3", rate: 24000 },
        request: { reqid: `test-${Date.now()}`, text: "Hello, this is a TTS test.", text_type: "plain", operation: "submit" },
      }),
    });

    const elapsed = Date.now() - start;
    const data = await res.json().catch(() => null);

    if (res.ok && data?.code === 3000) {
      await prisma.apiKey.update({ where: { service: "tts" }, data: { lastTest: new Date(), testOk: true } }).catch(() => {});
      return NextResponse.json({
        ok: true,
        voice: voiceVal,
        model: "Doubao TTS",
        message: "TTS task submitted",
        latencyMs: elapsed,
      });
    }

    await prisma.apiKey.update({ where: { service: "tts" }, data: { lastTest: new Date(), testOk: false } }).catch(() => {});
    return NextResponse.json({
      ok: false,
      code: data?.code,
      error: data?.message || `HTTP ${res.status}`,
      latencyMs: elapsed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "TTS test failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
