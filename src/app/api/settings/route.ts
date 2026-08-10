import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptSecret, maskSecret } from "@/lib/secrets";
import { assertSafeExternalBaseUrl } from "@/lib/url-security";
import { requireAdmin } from "@/lib/require-admin";

const SERVICES = new Set(["llm", "tts", "image", "embedding", "vision", "ark"]);

export async function GET(req: NextRequest) {
  try {
    // 全局 API Key 列表（即使已脱敏）仅管理员可读
    const denied = await requireAdmin(req);
    if (denied) return denied;

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
      keys.map((key: { key: string | null }) => ({
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
    // 全局 API Key 为全站共享配置，仅管理员可写
    const denied = await requireAdmin(req);
    if (denied) return denied;

    const body = await req.json();
    const service = typeof body.service === "string" ? body.service : "";
    const key = typeof body.key === "string" ? body.key.trim() : "";
    const rawModel = typeof body.model === "string" ? body.model.trim() : "";
    const rawBaseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";
    const isActive = typeof body.isActive === "boolean" ? body.isActive : undefined;

    if (!SERVICES.has(service)) {
      return NextResponse.json({ error: "valid service is required" }, { status: 400 });
    }

    // key 留空 = 保留已保存的 key 只更新其他字段（开关/模型等）；没有已存行时 key 必填
    const existing = key ? null : await prisma.apiKey.findUnique({ where: { service } });
    if (!key && !existing?.key) {
      return NextResponse.json({ error: "service and key are required" }, { status: 400 });
    }

    const model = rawModel || undefined;
    const baseUrl = rawBaseUrl
      ? service === "tts"
        ? rawBaseUrl
        : assertSafeExternalBaseUrl(rawBaseUrl)
      : undefined;

    // 无 key 时走纯 update：upsert 的 create 分支即使不执行也会被 Prisma 校验，
    // key: undefined 会直接抛 "Argument key is missing"
    if (!key && existing) {
      const result = await prisma.apiKey.update({
        where: { service },
        data: {
          ...(baseUrl ? { baseUrl } : {}),
          ...(model ? { model } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
        },
      });
      return NextResponse.json({
        success: true,
        id: result.id,
        service: result.service,
        masked: maskSecret(result.key),
      });
    }

    const encryptedKey = encryptSecret(key);
    const result = await prisma.apiKey.upsert({
      where: { service },
      update: {
        key: encryptedKey,
        ...(baseUrl ? { baseUrl } : {}),
        ...(model ? { model } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
      create: { service, key: encryptedKey, baseUrl, model, isActive: isActive ?? true },
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

export async function DELETE(req: NextRequest) {
  try {
    // 全局 API Key 为全站共享配置，仅管理员可删
    const denied = await requireAdmin(req);
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const service = searchParams.get('service');

    if (!service || !SERVICES.has(service)) {
      return NextResponse.json({ error: "valid service is required" }, { status: 400 });
    }

    await prisma.apiKey.deleteMany({ where: { service } });
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
