import { getErrorMessage } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import type { Prisma } from '@prisma/client';
import {
  detectRepresentationType,
  generateRepresentationContent,
  saveRepresentation,
} from '@/lib/representation-engine';

// POST /api/representation/detect
// 自动检测表征类型、生成内容并保存
// Body: { knowledgeNodeId: string }
export async function POST(req: NextRequest) {
  try {
    // Require auth — this route triggers an LLM call ($$$). Previously any
    // caller that slipped past the proxy (or forged a JWT via the dev
    // secret) could burn the project owner's API quota.
    await resolveUserIdFromRequest(req);

    const body = await req.json();
    const { knowledgeNodeId } = body;

    if (!knowledgeNodeId) {
      return NextResponse.json(
        { error: '缺少必填字段: knowledgeNodeId' },
        { status: 400 },
      );
    }

    // 1. 获取知识点
    const node = await prisma.knowledgeNode.findUnique({
      where: { id: knowledgeNodeId },
      include: { subject: { select: { name: true } } },
    });

    if (!node) {
      return NextResponse.json(
        { error: '知识点不存在' },
        { status: 404 },
      );
    }

    const subject = node.subject?.name || '';
    const nodeTitle = node.title || '';
    const nodeSummary = node.summary || '';
    const keywords = node.keywords || [];

    // 2. 检测最佳表征类型
    const repType = await detectRepresentationType(
      subject,
      nodeTitle,
      nodeSummary,
      keywords,
    );

    // 3. 生成表征内容（如果 LLM 超时或 prompt 不在 REPRESENTATION_PROMPTS
    //    中，回退到 concept_map 数据，不抛错 — 用户至少能看到一个视图）
    let repData: Record<string, unknown> = { concepts: [{ name: nodeTitle, description: nodeSummary }], relations: [] };
    try {
      const generated = await generateRepresentationContent(
        nodeTitle,
        nodeSummary,
        subject,
        repType,
      );
      if (generated && typeof generated === 'object') repData = generated as Record<string, unknown>;
    } catch (genErr: unknown) {
      console.error('[Representation Detect] generate failed, using concept_map fallback:', genErr);
    }

    // 4. 保存到数据库
    await saveRepresentation(knowledgeNodeId, repType, repData as Prisma.InputJsonValue);

    return NextResponse.json({
      success: true,
      nodeId: knowledgeNodeId,
      representationType: repType,
      representationData: repData,
    });
  } catch (error: unknown) {
    console.error('[Representation Detect] Error:', error);
    return NextResponse.json(
      { error: `表征生成失败: ${getErrorMessage(error)}` },
      { status: 500 },
    );
  }
}
