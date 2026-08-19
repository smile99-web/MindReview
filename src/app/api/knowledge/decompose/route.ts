import { getErrorMessage } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decomposeKnowledge } from '@/lib/llm-client';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { rateLimit } from '@/lib/rate-limit';
import type { KnowledgeNode } from '@prisma/client';

// POST /api/knowledge/decompose — 知识点拆解
export async function POST(req: NextRequest) {
  try {
    // 鉴权 + 限流：本路由调付费 LLM 且向全站共享的 Subject/Chapter 写入，
    // 此前仅靠 proxy 单层兜底（项目自身约定见 api/image 注释）
    const userId = await resolveUserIdFromRequest(req);
    const rl = rateLimit(`llm:${userId}`, 60, 60 * 60 * 1000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'AI 调用太频繁了，请稍后再试' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: '请求体必须是 JSON 对象' }, { status: 400 });
    }
    const { grade, chapter: chapterTitle, content } = body as {
      grade?: unknown; chapter?: unknown; content?: unknown;
    };
    const subject = typeof (body as { subject?: unknown }).subject === 'string'
      ? ((body as { subject: string }).subject.trim())
      : '';

    // typeof 校验：非字符串真值（数字/对象）直接透传 Prisma 会 500；
    // grade 缺省时 prompt 里出现 "年级：undefined"
    if (!subject || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json({ error: '缺少必填字段' }, { status: 400 });
    }
    const gradeStr = typeof grade === 'string' && grade.trim() ? grade.trim() : '通用';
    const chapterStr = typeof chapterTitle === 'string' ? chapterTitle.trim() : '';

    // 1. 查找或创建学科（upsert：并发拆解同名新学科时 findUnique→create
    // 会撞 unique 约束，后者直接 500）
    const subjectRecord = await prisma.subject.upsert({
      where: { name: subject },
      update: {},
      create: { name: subject },
    });

    // 2. 查找或创建章节（Serializable + 冲突重试：并发时双方 findFirst
    // 均为空会各建一个重复章节）
    const resolveChapter = () =>
      prisma.$transaction(
        async (tx) => {
          const found = await tx.chapter.findFirst({
            where: { subjectId: subjectRecord.id, title: chapterStr || '未分类', parentId: null },
          });
          if (found) return found;
          return tx.chapter.create({
            data: {
              subjectId: subjectRecord.id,
              title: chapterStr || '未分类',
            },
          });
        },
        { isolationLevel: 'Serializable' },
      );
    let chapter;
    try {
      chapter = await resolveChapter();
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      if (code !== 'P2034' && code !== '40001') throw error;
      chapter = await resolveChapter();
    }

    // 3. AI拆解知识点
    const result = await decomposeKnowledge(subject, gradeStr, chapterStr, content);

    if (!result.nodes || !Array.isArray(result.nodes)) {
      return NextResponse.json({ error: 'AI拆解失败，返回格式不正确' }, { status: 500 });
    }
    const decomposedNodes = result.nodes.filter(
      (node): node is NonNullable<typeof result.nodes>[number] & { title: string } =>
        typeof node.title === 'string' && node.title.trim().length > 0,
    );
    if (decomposedNodes.length === 0) {
      return NextResponse.json({ error: 'AI returned no savable knowledge nodes' }, { status: 500 });
    }

    // 4. 在事务中批量创建知识点、边和卡片
    const result2 = await prisma.$transaction(async (tx) => {
      const createdNodes: KnowledgeNode[] = [];
      for (const node of decomposedNodes) {
        const created = await tx.knowledgeNode.create({
          data: {
            subjectId: subjectRecord.id,
            chapterId: chapter.id,
            title: node.title.trim(),
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
            content: node.summary || '',
          },
        });
      }

      // 记录AI日志
      await tx.aiGenerationLog.create({
        data: {
          generatorType: 'llm',
          model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
          prompt: `拆解${subject}-${chapterStr}`,
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
  } catch (error: unknown) {
    console.error('[Knowledge Decompose] Error:', error);

    // 记录失败日志
    try {
      await prisma.aiGenerationLog.create({
        data: {
          generatorType: 'llm',
          model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
          prompt: '知识点拆解失败',
          status: 'failed',
          errorMessage: getErrorMessage(error),
        },
      });
    } catch {}

    return NextResponse.json(
      { error: `知识点拆解失败: ${getErrorMessage(error)}` },
      { status: 500 },
    );
  }
}
