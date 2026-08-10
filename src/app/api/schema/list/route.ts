import { getErrorMessage } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { loadProgressByNodeId } from '@/lib/user-knowledge-progress';
import type { Prisma } from '@prisma/client';

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

    const where: Prisma.KnowledgeNodeWhereInput = {
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

    // 成员掌握度按当前用户合并：KnowledgeNode.masteryLevel 是全局快照，
    // 复习只写 UserKnowledgeProgress——不合并的话成员掌握度永远停留在图式创建时。
    const allMemberIds = [
      ...new Set(
        (schemaNodes as SchemaNodeForList[]).flatMap((n) => n.outgoingEdges.map((e) => e.to.id)),
      ),
    ];
    let progressByNodeId = new Map<string, { masteryLevel: number }>();
    try {
      const userId = await resolveUserIdFromRequest(req);
      progressByNodeId = await loadProgressByNodeId(userId, allMemberIds, prisma);
    } catch {
      // proxy 已保证登录；兜底保持旧的未合并行为
    }

    const schemas = (schemaNodes as SchemaNodeForList[]).map((node) => {
      const members = node.outgoingEdges.map((e: { to: SchemaMember }) => {
        const progress = progressByNodeId.get(e.to.id);
        return progress ? { ...e.to, masteryLevel: progress.masteryLevel } : e.to;
      });
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
        // 图式自身掌握度同样是创建时快照，展示层用成员均值的 per-user 版本代替
        masteryLevel: avgMastery,
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
  } catch (error: unknown) {
    console.error('[Schema List API] Error:', error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
