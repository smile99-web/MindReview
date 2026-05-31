import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/secrets";

/**
 * Test Doubao Embedding Vision API connectivity.
 * POST /v1/embeddings/multimodal
 * Model: doubao-embedding-vision-250615
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const key = typeof body.key === "string" ? body.key.trim() : "";
    const baseUrl =
      typeof body.baseUrl === "string" ? body.baseUrl.trim() : "https://ark.cn-beijing.volces.com/api/v3";
    const model =
      typeof body.model === "string" ? body.model.trim() : "doubao-embedding-vision-250615";

    // Resolve key: use provided key, or fall back to DB-stored key
    let apiKey = key;
    if (!apiKey) {
      const stored = await prisma.apiKey.findUnique({ where: { service: "embedding" } });
      if (!stored) {
        return NextResponse.json({ ok: false, error: "未配置 Embedding API Key" }, { status: 400 });
      }
      apiKey = decryptSecret(stored.key);
    }

    const start = Date.now();

    const res = await fetch(`${baseUrl}/embeddings/multimodal`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [{ type: "text", text: "MindReview embedding test" }],
      }),
    });

    const latencyMs = Date.now() - start;

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return NextResponse.json({
        ok: false,
        error: `Embedding API 返回 ${res.status}${errText ? ": " + errText.slice(0, 200) : ""}`,
        latencyMs,
      });
    }

    const data = await res.json();
    const dim = data.data?.[0]?.embedding?.length || 0;

    // Mark key as tested in DB
    await prisma.apiKey.updateMany({
      where: { service: "embedding" },
      data: { lastTest: new Date(), testOk: true },
    });

    return NextResponse.json({
      ok: true,
      message: `连接成功，向量维度 ${dim}`,
      latencyMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Embedding connection test failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
