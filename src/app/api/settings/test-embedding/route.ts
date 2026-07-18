import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/secrets";
import { assertSafeExternalBaseUrl } from "@/lib/url-security";
import { requireAdmin } from "@/lib/require-admin";

/**
 * Test Doubao Embedding Vision API connectivity.
 * POST /v1/embeddings/multimodal
 * Model: doubao-embedding-vision-250615
 */
export async function POST(req: NextRequest) {
  try {
    // 该路由会真实调用 Embedding API（消耗费用）并读取全局配置，仅管理员可用
    const denied = await requireAdmin(req);
    if (denied) return denied;

    const body = await req.json();
    const key = typeof body.key === "string" ? body.key.trim() : "";
    const model =
      typeof body.model === "string" ? body.model.trim() : "doubao-embedding-vision-250615";

    // Resolve key: use provided key, or fall back to DB-stored key
    // 只有用户显式提供自己的 key 时才允许自定义 baseUrl；
    // 使用服务端保存的 key 时强制走服务端保存的配置/默认地址，防止 key 被发送到攻击者指定的 URL
    let apiKey = key;
    let baseUrl = "";
    if (!apiKey) {
      const stored = await prisma.apiKey.findUnique({ where: { service: "embedding" } });
      if (!stored) {
        return NextResponse.json({ ok: false, error: "未配置 Embedding API Key" }, { status: 400 });
      }
      apiKey = decryptSecret(stored.key);
      baseUrl = stored.baseUrl || "https://ark.cn-beijing.volces.com/api/v3";
    } else {
      baseUrl =
        (typeof body.baseUrl === "string" && body.baseUrl.trim()) ||
        "https://ark.cn-beijing.volces.com/api/v3";
    }
    const safeBaseUrl = assertSafeExternalBaseUrl(baseUrl);

    const start = Date.now();

    const res = await fetch(`${safeBaseUrl}/embeddings/multimodal`, {
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
