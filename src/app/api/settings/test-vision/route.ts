import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decryptSecret } from '@/lib/secrets';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { getErrorMessage } from '@/lib/errors';
import { assertSafeExternalBaseUrl } from '@/lib/url-security';

// POST /api/settings/test-vision
// Body: { key, baseUrl, model? }
// Returns: { ok, error?, latencyMs, message }
//
// Sanity-checks the vision-model config: calls the configured
// provider with a trivial "say hi" chat request and measures
// latency. Used by the settings page's "测试连接" button so the
// user can verify their API key + baseUrl + model name before
// trying to upload a question photo.
export async function POST(req: NextRequest) {
  try {
    // Auth gate — this route reads the saved vision key.
    await resolveUserIdFromRequest(req);

    const { key, baseUrl, model } = (await req.json()) as {
      key?: string;
      baseUrl?: string;
      model?: string;
    };

    // If no key supplied in body, fall back to the saved 'vision'
    // row so the user can also click "Test" without retyping.
    let effectiveKey = typeof key === 'string' ? key.trim() : '';
    if (!effectiveKey) {
      const saved = await prisma.apiKey
        .findUnique({ where: { service: 'vision' } })
        .catch(() => null);
      if (saved?.isActive && saved.key) {
        effectiveKey = decryptSecret(saved.key);
      }
    }
    if (!effectiveKey) {
      return NextResponse.json(
        { ok: false, error: '请先填写 API Key' },
        { status: 400 },
      );
    }

    const effectiveBaseUrl = (typeof baseUrl === 'string' && baseUrl.trim())
      ? assertSafeExternalBaseUrl(baseUrl.trim())
      : 'https://api.minimaxi.com/v1';
    const effectiveModel = (typeof model === 'string' && model.trim())
      ? model.trim()
      : 'MiniMax-M3';

    const start = Date.now();
    const res = await fetch(`${effectiveBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${effectiveKey}`,
      },
      body: JSON.stringify({
        model: effectiveModel,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 8,
      }),
    });
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json(
        {
          ok: false,
          error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
          latencyMs,
        },
        { status: 200 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: '连接成功',
      latencyMs,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
