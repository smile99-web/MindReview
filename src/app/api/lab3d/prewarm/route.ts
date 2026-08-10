import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErrorMessage } from "@/lib/errors";
import { resolveTtsConfig, synthesizeSpeechAuto } from "@/lib/tts-client";
import { requireAdmin } from "@/lib/require-admin";
import { SCENES, loadScene } from "@/lib/lab3d/registry";

/**
 * POST /api/lab3d/prewarm[?only=<sceneId>]
 * 管理员专用：为 3D 实验室所有场景的每一步讲解预生成 TTS 音频，
 * 写入 AudioAsset 共享缓存（与 /api/tts 的缓存键完全一致：
 * text + voiceType + contentType='lab3d' + contentRefId='<sceneId>#<step>'）。
 * 可重复调用：已缓存的步骤直接跳过，幂等。
 * TTS 通道与 /api/tts 一致：方舟统一调用开启时走方舟，否则 OpenSpeech。
 */
export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  try {
    const only = req.nextUrl.searchParams.get("only");
    const ttsConfig = await resolveTtsConfig();
    const voice = ttsConfig.voice;

    const metas = only ? SCENES.filter((s) => s.id === only) : SCENES;
    let generated = 0;
    let cached = 0;
    const failed: { ref: string; error: string }[] = [];

    for (const meta of metas) {
      const def = await loadScene(meta.id);
      if (!def) {
        failed.push({ ref: meta.id, error: "scene load failed" });
        continue;
      }
      for (let i = 0; i < def.steps.length; i++) {
        const text = def.steps[i].text;
        const contentRefId = `${meta.id}#${i}`;
        try {
          const existing = await prisma.audioAsset.findFirst({
            where: { text, voiceType: voice, contentType: "lab3d", contentRefId },
            orderBy: { createdAt: "desc" },
          });
          if (existing) {
            cached += 1;
            continue;
          }
          const { audioUrl, durationMs } = await synthesizeSpeechAuto({ text });
          if (!audioUrl) throw new Error("empty audioUrl");
          await prisma.audioAsset.create({
            data: {
              userId: null,
              contentType: "lab3d",
              contentRefId,
              text,
              audioUrl,
              durationMs,
              voiceType: voice,
            },
          });
          generated += 1;
        } catch (e) {
          failed.push({ ref: contentRefId, error: getErrorMessage(e, "unknown") });
        }
      }
    }

    return NextResponse.json({
      total: metas.length,
      generated,
      cached,
      failedCount: failed.length,
      failed: failed.slice(0, 20),
    });
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error, "prewarm failed") },
      { status: 500 },
    );
  }
}
