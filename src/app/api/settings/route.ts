import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptSecret, maskSecret } from "@/lib/secrets";
import { assertSafeExternalBaseUrl } from "@/lib/url-security";

const SERVICES = new Set(["llm", "tts", "image"]);

export async function GET() {
  try {
    const keys = await prisma.apiKey.findMany({
      select: {
        id: true,
        service: true,
        key: true,
        baseUrl: true,
        model: true,
        isActive: true,
        lastTest: true,
        testOk: true,
      },
      orderBy: { service: "asc" },
    });

    return NextResponse.json(
      keys.map((key) => ({
        ...key,
        key: key.key ? maskSecret(key.key) : "",
      }))
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const service = typeof body.service === "string" ? body.service : "";
    const key = typeof body.key === "string" ? body.key.trim() : "";
    const model = typeof body.model === "string" ? body.model.trim() : undefined;
    const baseUrl = typeof body.baseUrl === "string" && body.baseUrl.trim()
      ? assertSafeExternalBaseUrl(body.baseUrl.trim())
      : undefined;

    if (!SERVICES.has(service) || !key) {
      return NextResponse.json({ error: "service and key are required" }, { status: 400 });
    }

    const encryptedKey = encryptSecret(key);
    const result = await prisma.apiKey.upsert({
      where: { service },
      update: {
        key: encryptedKey,
        ...(baseUrl ? { baseUrl } : {}),
        ...(model ? { model } : {}),
      },
      create: { service, key: encryptedKey, baseUrl, model },
    });

    return NextResponse.json({
      success: true,
      id: result.id,
      service: result.service,
      masked: maskSecret(result.key),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
