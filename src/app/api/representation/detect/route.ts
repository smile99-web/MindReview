import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
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
  } catch (error: any) {
    console.error('[Representation Detect] Error:', error);
    return NextResponse.json(
      { error: `表征检测失败: ${error.message}` },
      { status: 500 },
    );
  }
}
