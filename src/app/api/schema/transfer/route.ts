import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getErrorMessage, getErrorStatus } from '@/lib/errors';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { rateLimit } from '@/lib/rate-limit';
import { detectTransferOpportunities } from '@/lib/schema-builder';

// POST /api/schema/transfer
// Body: { schemaNodeId: string }
// Returns: { opportunities: [{ domain, relevance, explanation, exampleApplication }] }
//
// Wires up the previously-orphaned detectTransferOpportunities function
// in src/lib/schema-builder.ts. The function was fully implemented
// (queries other subjects, builds an LLM prompt, returns
// TransferOpportunity[]) but had no API route and no caller. Now the
// /schemas/[id]/apply page can show cross-domain transfer hints
// alongside the schema application exercise.
export async function POST(req: NextRequest) {
  try {
    // Auth gate + 限流：this route triggers an LLM call ($$$)
    const userId = await resolveUserIdFromRequest(req);
    const rl = rateLimit(`llm:${userId}`, 60, 60 * 60 * 1000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'AI 调用太频繁了，请稍后再试' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
      );
    }

    const body = (await req.json().catch(() => null)) as { schemaNodeId?: unknown } | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: '请求体必须是 JSON 对象' }, { status: 400 });
    }
    const schemaNodeId = typeof body.schemaNodeId === 'string' ? body.schemaNodeId.trim() : '';
    if (!schemaNodeId) {
      return NextResponse.json(
        { error: 'schemaNodeId is required' },
        { status: 400 },
      );
    }

    const opportunities = await detectTransferOpportunities(schemaNodeId, prisma);
    return NextResponse.json({ opportunities });
  } catch (error: unknown) {
    console.error('[schema/transfer] Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: getErrorStatus(error) },
    );
  }
}
