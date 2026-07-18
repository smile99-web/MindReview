import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/secrets";
import { assertSafeExternalBaseUrl } from "@/lib/url-security";
import { requireAdmin } from "@/lib/require-admin";

function describeError(err: unknown): string {
  if (!(err instanceof Error)) return "Image test failed";
  const cause = (err as Error & { cause?: { code?: string; message?: string } }).cause;
  if (cause?.code || cause?.message) {
    return `${err.message}: ${[cause.code, cause.message].filter(Boolean).join(" - ")}`;
  }
  return err.message;
}

export async function POST(req: NextRequest) {
  try {
    // 该路由会真实调用图像生成 API（消耗费用）并读取全局配置，仅管理员可用
    const denied = await requireAdmin(req);
    if (denied) return denied;

    const { key, baseUrl, model } = await req.json();
    const saved = await prisma.apiKey.findUnique({ where: { service: "image" } });
    // 只有用户显式提供自己的 key 时才允许自定义 baseUrl；
    // 使用服务端保存/env 的 key 时强制走服务端配置，防止 key 被发送到攻击者指定的 URL
    const hasOwnKey = typeof key === "string" && key.trim().length > 0;
    const apiKey = hasOwnKey ? key : process.env.SEEDREAM_API_KEY || (saved?.key ? decryptSecret(saved.key) : "");

    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "Please save an API key first" }, { status: 400 });
    }

    const base = hasOwnKey && baseUrl
      ? assertSafeExternalBaseUrl(baseUrl)
      : saved?.baseUrl || process.env.SEEDREAM_ENDPOINT || "https://ark.cn-beijing.volces.com/api/v3";
    const safeBase = assertSafeExternalBaseUrl(base);
    const modelName = model || saved?.model || process.env.SEEDREAM_MODEL || "doubao-seedream-5-0-260128";
    const imageEndpoint = `${safeBase.replace(/\/$/, "")}/images/generations`;

    const start = Date.now();
    const res = await fetch(imageEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: modelName,
        prompt: "A simple cute orange cat on a clean background",
        n: 1,
        size: "1920x1920",
        response_format: "url",
      }),
    });

    const elapsed = Date.now() - start;
    const data = await res.json().catch(() => null);

    if (res.ok && data?.data?.length > 0) {
      await prisma.apiKey.update({ where: { service: "image" }, data: { lastTest: new Date(), testOk: true } }).catch(() => {});
      return NextResponse.json({
        ok: true,
        model: modelName,
        imageUrl: data.data[0]?.url ? "(generated, temporary URL hidden)" : "(generated)",
        size: data.data[0]?.size || "1024x1024",
        latencyMs: elapsed,
      });
    }

    await prisma.apiKey.update({ where: { service: "image" }, data: { lastTest: new Date(), testOk: false } }).catch(() => {});
    return NextResponse.json({
      ok: false,
      status: res.status,
      error: data?.error?.message || data?.message || `HTTP ${res.status}`,
      latencyMs: elapsed,
    });
  } catch (err) {
    const message = describeError(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
