import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type SchemaMember = { id: string; title: string; masteryLevel: number };
type SchemaNodeForList = {
  id: string;
  title: string;
  summary: string | null;
  subjectId: string;
  subject?: { name: string } | null;
  representationData: unknown;
  difficulty: number;
  cognitiveLoad: number;
  icapLevel: string;
  masteryLevel: number;
  outgoingEdges: { to: SchemaMember }[];
  createdAt: Date;
  updatedAt: Date;
};

// GET /api/schema/list?subjectId=xxx
// Finds all KnowledgeNodes with representationType='schema'.
// Includes member counts and average mastery level.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const subjectId = searchParams.get('subjectId');

    const where: any = {
      representationType: 'schema',
    };
    if (subjectId) {
      where.subjectId = subjectId;
    }

    const schemaNodes = await prisma.knowledgeNode.findMany({
      where,
      include: {
        subject: { select: { id: true, name: true } },
        outgoingEdges: {
          where: { relationType: 'schema_member' },
          include: {
            to: {
              select: { id: true, title: true, masteryLevel: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const schemas = (schemaNodes as SchemaNodeForList[]).map((node) => {
      const members = node.outgoingEdges.map((e: { to: SchemaMember }) => e.to);
      const memberCount = members.length;
      const avgMastery =
        memberCount > 0
          ? Math.round(
              members.reduce((sum: number, m: SchemaMember) => sum + m.masteryLevel, 0) / memberCount,
            )
          : 0;

      return {
        id: node.id,
        name: node.title,
        description: node.summary,
        subjectId: node.subjectId,
        subjectName: node.subject?.name || null,
        representationData: node.representationData,
        difficulty: node.difficulty,
        cognitiveLoad: node.cognitiveLoad,
        icapLevel: node.icapLevel,
        masteryLevel: node.masteryLevel,
        memberCount,
        avgMemberMastery: avgMastery,
        members: members.map((m: SchemaMember) => ({
          id: m.id,
          title: m.title,
          masteryLevel: m.masteryLevel,
        })),
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
      };
    });

    return NextResponse.json({ schemas });
  } catch (error: any) {
    console.error('[Schema List API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
