import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decomposeKnowledge, llmCallWithLog } from '@/lib/llm-client';

// POST /api/knowledge/decompose — 知识点拆解
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { subject, grade, chapter: chapterTitle, content } = body;

    if (!subject || !content) {
      return NextResponse.json({ error: '缺少必填字段' }, { status: 400 });
    }

    // 1. 查找或创建学科
    let subjectRecord = await prisma.subject.findUnique({ where: { name: subject } });
    if (!subjectRecord) {
      subjectRecord = await prisma.subject.create({ data: { name: subject } });
    }

    // 2. 查找或创建章节
    let chapter = await prisma.chapter.findFirst({
      where: { subjectId: subjectRecord.id, title: chapterTitle || '未分类' },
    });
    if (!chapter) {
      chapter = await prisma.chapter.create({
        data: {
          subjectId: subjectRecord.id,
          title: chapterTitle || '未分类',
        },
      });
    }

    // 3. AI拆解知识点
    const result = await decomposeKnowledge(subject, grade, chapterTitle, content);

    if (!result.nodes || !Array.isArray(result.nodes)) {
      return NextResponse.json({ error: 'AI拆解失败，返回格式不正确' }, { status: 500 });
    }

    // 4. 在事务中批量创建知识点、边和卡片
    const result2 = await prisma.$transaction(async (tx) => {
      const createdNodes: any[] = [];
      for (const node of result.nodes) {
        const created = await tx.knowledgeNode.create({
          data: {
            subjectId: subjectRecord.id,
            chapterId: chapter.id,
            title: node.title,
            summary: node.summary || '',
            keywords: node.keywords || [],
            prerequisites: node.prerequisites || [],
            commonMistakes: node.commonMistakes || [],
            typicalQuestions: node.typicalQuestions || [],
            difficulty: Math.min(5, Math.max(1, node.difficulty || 3)),
            cognitiveLoad: Math.min(5, Math.max(1, node.cognitiveLoad || 3)),
            icapLevel: node.icapLevel || 'Active',
            masteryLevel: 0,
          },
        });
        createdNodes.push(created);
      }

      // 5. 创建知识点关系
      if (result.edges && Array.isArray(result.edges)) {
        for (const edge of result.edges) {
          const fromNode = createdNodes[edge.fromIndex];
          const toNode = createdNodes[edge.toIndex];

          if (fromNode && toNode) {
            await tx.knowledgeEdge.create({
              data: {
                fromId: fromNode.id,
                toId: toNode.id,
                relationType: edge.relationType || 'contains',
                label: edge.label || '',
              },
            });
          }
        }

        // 同时创建 parentId 关系用于 contains 边
        for (const edge of result.edges) {
          if (edge.relationType === 'contains') {
            const parent = createdNodes[edge.fromIndex];
            const child = createdNodes[edge.toIndex];
            if (parent && child) {
              await tx.knowledgeNode.update({
                where: { id: child.id },
                data: { parentId: parent.id },
              });
            }
          }
        }
      }

      // 6. 为每个知识点生成知识卡片
      for (const node of createdNodes) {
        await tx.knowledgeCard.create({
          data: {
            knowledgeNodeId: node.id,
            cardType: 'summary',
            title: node.title,
            content: node.summary,
          },
        });
      }

      // 记录AI日志
      await tx.aiGenerationLog.create({
        data: {
          generatorType: 'llm',
          model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
          prompt: `拆解${subject}-${chapterTitle}`,
          status: 'success',
        },
      });

      return createdNodes;
    });

    return NextResponse.json({
      success: true,
      nodes: result2,
      count: result2.length,
    });
  } catch (error: any) {
    console.error('[Knowledge Decompose] Error:', error);

    // 记录失败日志
    try {
      await prisma.aiGenerationLog.create({
        data: {
          generatorType: 'llm',
          model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
          prompt: '知识点拆解失败',
          status: 'failed',
          errorMessage: error.message,
        },
      });
    } catch {}

    return NextResponse.json(
      { error: `知识点拆解失败: ${error.message}` },
      { status: 500 },
    );
  }
}
