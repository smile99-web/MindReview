import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/secrets";
import { assertSafeExternalBaseUrl } from "@/lib/url-security";
import { resolveUserIdFromRequest } from "@/lib/user-context";

export async function POST(req: NextRequest) {
  try {
    // Defense in depth: this route triggers a live LLM API call ($$$).
    await resolveUserIdFromRequest(req);

    const { key, baseUrl, model } = await req.json();
    const saved = await prisma.apiKey.findUnique({ where: { service: "llm" } });
    const apiKey = key || process.env.DEEPSEEK_API_KEY || (saved?.key ? decryptSecret(saved.key) : "");

    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "Please save an API key first" }, { status: 400 });
    }

    const base = baseUrl
      ? assertSafeExternalBaseUrl(baseUrl)
      : saved?.baseUrl || process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
    const safeBase = assertSafeExternalBaseUrl(base);
    const modelName = model || saved?.model || process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";

    const start = Date.now();
    const res = await fetch(`${safeBase}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 10,
      }),
    });

    const elapsed = Date.now() - start;
    const data = await res.json().catch(() => null);

    if (res.ok) {
      await prisma.apiKey.update({ where: { service: "llm" }, data: { lastTest: new Date(), testOk: true } }).catch(() => {});
      return NextResponse.json({
        ok: true,
        model: data?.model || modelName,
        response: data?.choices?.[0]?.message?.content || "(empty)",
        tokens: data?.usage?.total_tokens,
        latencyMs: elapsed,
      });
    }

    await prisma.apiKey.update({ where: { service: "llm" }, data: { lastTest: new Date(), testOk: false } }).catch(() => {});
    return NextResponse.json({
      ok: false,
      status: res.status,
      error: data?.error?.message || data?.message || `HTTP ${res.status}`,
      latencyMs: elapsed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "LLM test failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
