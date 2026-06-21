import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getErrorMessage } from '@/lib/errors';
import { resolveUserIdFromRequest } from '@/lib/user-context';
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
    // Auth gate — this route triggers an LLM call ($$$).
    await resolveUserIdFromRequest(req);

    const body = (await req.json()) as { schemaNodeId?: unknown };
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
      { status: 500 },
    );
  }
}
