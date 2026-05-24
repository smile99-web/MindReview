import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/secrets";
import { assertSafeExternalBaseUrl } from "@/lib/url-security";

export async function POST(req: NextRequest) {
  try {
    const { key, baseUrl, model } = await req.json();
    const saved = await prisma.apiKey.findUnique({ where: { service: "image" } });
    const apiKey = key || process.env.SEEDREAM_API_KEY || (saved?.key ? decryptSecret(saved.key) : "");

    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "Please save an API key first" }, { status: 400 });
    }

    const base = baseUrl
      ? assertSafeExternalBaseUrl(baseUrl)
      : saved?.baseUrl || process.env.SEEDREAM_ENDPOINT || "https://ark.cn-beijing.volces.com/api/v3";
    const safeBase = assertSafeExternalBaseUrl(base);
    const modelName = model || saved?.model || process.env.SEEDREAM_MODEL || "doubao-seedream-5-0-260128";

    const start = Date.now();
    const res = await fetch(`${safeBase}/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: modelName,
        prompt: "A simple cute orange cat on a clean background",
        size: "1K",
        output_format: "png",
        watermark: false,
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
        size: data.data[0]?.size || "1K",
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
    const message = err instanceof Error ? err.message : "Image test failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
