import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/secrets";
import { assertSafeExternalBaseUrl } from "@/lib/url-security";
import { requireAdmin } from "@/lib/require-admin";

export async function POST(req: NextRequest) {
  try {
    // 该路由会真实调用 LLM API（消耗费用）并读取全局配置，仅管理员可用
    const denied = await requireAdmin(req);
    if (denied) return denied;

    const { key, baseUrl, model } = await req.json();
    const saved = await prisma.apiKey.findUnique({ where: { service: "llm" } });
    // 只有用户显式提供自己的 key 时才允许自定义 baseUrl；
    // 使用服务端保存/env 的 key 时强制走服务端配置，防止 key 被发送到攻击者指定的 URL
    const hasOwnKey = typeof key === "string" && key.trim().length > 0;
    const apiKey = hasOwnKey ? key : process.env.DEEPSEEK_API_KEY || (saved?.key ? decryptSecret(saved.key) : "");

    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "Please save an API key first" }, { status: 400 });
    }

    const base = hasOwnKey && baseUrl
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
