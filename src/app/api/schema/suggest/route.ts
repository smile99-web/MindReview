import { getErrorMessage } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { suggestSchemaNodes } from '@/lib/schema-builder';

// POST /api/schema/suggest
// Body: { seedNodeId: string }
// Returns: { suggestions: [{ nodeIds: string[], rationale: string }] }
//
// Wires up the previously-unused suggestSchemaNodes function in
// src/lib/schema-builder.ts. The /schemas page previously only
// accepted arbitrary user-picked nodes (defeating the 'AI identifies
// the schema' promise). With this route, the UI can offer 'AI 推荐'
// as an alternative starting point.
export async function POST(req: NextRequest) {
  try {
    // Auth gate — this route is read-only but still behind auth.
    await resolveUserIdFromRequest(req);

    const body = (await req.json()) as { seedNodeId?: unknown };
    const seedNodeId = typeof body.seedNodeId === 'string' ? body.seedNodeId.trim() : '';
    if (!seedNodeId) {
      return NextResponse.json(
        { error: 'seedNodeId is required' },
        { status: 400 },
      );
    }

    const suggestions = await suggestSchemaNodes(seedNodeId, prisma);
    return NextResponse.json({ suggestions });
  } catch (error: unknown) {
    console.error('[schema/suggest] Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
