import { getErrorMessage } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  detectRepresentationType,
  generateRepresentationContent,
  saveRepresentation,
} from '@/lib/representation-engine';

// POST /api/representation/generate
// 生成表征内容（可指定类型或自动检测）
// Body: { knowledgeNodeId: string, representationType?: string }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { knowledgeNodeId, representationType } = body;

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

    // 2. 确定表征类型（优先使用传入的，否则自动检测）
    let repType = representationType;
    if (!repType) {
      repType = await detectRepresentationType(
        subject,
        nodeTitle,
        nodeSummary,
        keywords,
      );
    }

    // 3. 生成表征内容
    const repData = await generateRepresentationContent(
      nodeTitle,
      nodeSummary,
      subject,
      repType,
    );

    // 4. 保存到数据库
    await saveRepresentation(knowledgeNodeId, repType, repData);

    return NextResponse.json({
      success: true,
      nodeId: knowledgeNodeId,
      representationType: repType,
      representationData: repData,
    });
  } catch (error: unknown) {
    console.error('[Representation Generate] Error:', error);
    return NextResponse.json(
      { error: `表征生成失败: ${getErrorMessage(error)}` },
      { status: 500 },
    );
  }
}
