import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErrorMessage } from "@/lib/errors";
import { decryptSecret } from "@/lib/secrets";
import { synthesizeSpeech } from "@/lib/tts-client";
import { requireAdmin } from "@/lib/require-admin";
import { SCENES, loadScene } from "@/lib/lab3d/registry";

const DEFAULT_RESOURCE_ID = process.env.DOUBAO_TTS_RESOURCE_ID || "seed-tts-2.0";
const DEFAULT_VOICE_TYPE = process.env.DOUBAO_TTS_VOICE_TYPE || "zh_female_vv_uranus_bigtts";

/**
 * POST /api/lab3d/prewarm[?only=<sceneId>]
 * 管理员专用：为 3D 实验室所有场景的每一步讲解预生成 TTS 音频，
 * 写入 AudioAsset 共享缓存（与 /api/tts 的缓存键完全一致：
 * text + voiceType + contentType='lab3d' + contentRefId='<sceneId>#<step>'）。
 * 可重复调用：已缓存的步骤直接跳过，幂等。
 */
export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  try {
    const only = req.nextUrl.searchParams.get("only");
    const saved = await prisma.apiKey.findUnique({ where: { service: "tts" } });
    const voice = saved?.model || DEFAULT_VOICE_TYPE;
    const resourceId = saved?.baseUrl || DEFAULT_RESOURCE_ID;
    const apiKey = saved?.key ? decryptSecret(saved.key) : undefined;

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
          const { audioUrl, durationMs } = await synthesizeSpeech({
            text,
            voiceType: voice,
            apiKey,
            resourceId,
            throwOnError: true,
          });
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
