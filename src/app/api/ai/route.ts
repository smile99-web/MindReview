import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateQuestions, analyzeMistake, generateSummary, generateWorkedExample } from '@/lib/llm-client';

// GET /api/ai?action=list-logs — 查询 AI 生成日志
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const action = searchParams.get('action');

    if (action === 'list-logs') {
      const generatorType = searchParams.get('generatorType') || 'all';
      const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
      const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));

      const where: Record<string, string> = {};
      if (generatorType !== 'all') {
        where.generatorType = generatorType;
      }

      const [logs, total] = await Promise.all([
        prisma.aiGenerationLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.aiGenerationLog.count({ where }),
      ]);

      return NextResponse.json({ logs, total, page, limit });
    }

    return NextResponse.json({ error: '未知操作' }, { status: 400 });
  } catch (error: any) {
    console.error('[AI API GET] Error:', error);
    return NextResponse.json({ error: error.message || '服务器内部错误' }, { status: 500 });
  }
}

// POST /api/ai/questions — 生成题目
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case 'generate-questions': {
        const { knowledgeNodeId, questionType, icapLevel, count = 3 } = body;

        const node = await prisma.knowledgeNode.findUnique({ where: { id: knowledgeNodeId } });
        if (!node) {
          return NextResponse.json({ error: '知识点不存在' }, { status: 404 });
        }

        const subject = await prisma.subject.findUnique({ where: { id: node.subjectId } });
        const result = await generateQuestions(
          node.title,
          node.summary || '',
          subject?.name || '数学',
          questionType || 'multiple_choice',
          icapLevel || 'Active',
          count,
        );

        // 批量保存题目
        const questions = [];
        if (result.questions) {
          for (const q of result.questions) {
            const question = await prisma.question.create({
              data: {
                knowledgeNodeId,
                questionType: q.questionType || questionType || 'multiple_choice',
                icapLevel: q.icapLevel || icapLevel || 'Active',
                stem: q.stem || q.question || '',
                options: q.options || [],
                answer: q.answer || '',
                explanation: q.explanation || '',
                difficulty: q.difficulty || 3,
                cognitiveLoad: q.cognitiveLoad || 3,
              },
            });
            questions.push(question);
          }
        }

        return NextResponse.json({ success: true, questions });
      }

      case 'analyze-mistake': {
        const { subject, questionText, wrongAnswer, correctAnswer } = body;
        const result = await analyzeMistake(subject, questionText, wrongAnswer, correctAnswer);
        return NextResponse.json(result);
      }

      case 'generate-summary': {
        const { subject, knowledgePoints } = body;
        const result = await generateSummary(subject, knowledgePoints);
        return NextResponse.json({ summary: result });
      }

      case 'generate-worked-example': {
        const { knowledgeNodeId, subject: subjectName, difficulty } = body;

        if (!knowledgeNodeId) {
          return NextResponse.json({ error: '缺少 knowledgeNodeId' }, { status: 400 });
        }

        const workedExample = await generateWorkedExample(
          knowledgeNodeId,
          subjectName || '',
          difficulty || 3,
        );

        // Save as a KnowledgeCard so it appears in the node's card list
        const knowledgeCard = await prisma.knowledgeCard.create({
          data: {
            knowledgeNodeId,
            cardType: 'worked_example',
            title: workedExample.problem.slice(0, 120),
            content: JSON.stringify(workedExample),
          },
        });

        return NextResponse.json({
          success: true,
          workedExample,
          knowledgeCard: {
            id: knowledgeCard.id,
            cardType: knowledgeCard.cardType,
            title: knowledgeCard.title,
            content: knowledgeCard.content,
          },
        });
      }

      case 'check-mental-model': {
        const { knowledgeNodeId, studentText } = body;

        if (!knowledgeNodeId || !studentText) {
          return NextResponse.json({ error: '缺少 knowledgeNodeId 或 studentText' }, { status: 400 });
        }

        const node = await prisma.knowledgeNode.findUnique({
          where: { id: knowledgeNodeId },
          include: { subject: { select: { name: true } } },
        });
        if (!node) {
          return NextResponse.json({ error: '知识点不存在' }, { status: 404 });
        }

        const subjectName = node.subject?.name || '通用';

        const systemPrompt = `你是一位教育评估专家。你的任务是评估学生对知识点的理解完整性。

学生需要用自己的话描述一个知识点的运作机制。请比较学生的描述与该知识点的实际内容，评估理解的完整度。

评估标准：
- 是否包含了核心概念和定义
- 是否描述了各要素之间的关系/运作机制
- 是否涵盖了关键的应用场景或边界条件
- 是否避免了明显的误解

输出严格JSON格式：
{
  "completeness": 0-100的整数，表示理解完整度百分比,
  "missingElements": ["缺失的关键要素1", "缺失的关键要素2"],
  "suggestions": "具体的改进建议，帮助学生完善心智模型（80-150字）"
}`;

        const userPrompt = `学科：${subjectName}
知识点标题：${node.title}
知识点摘要：${node.summary || '(无摘要)'}
关键词：${(node.keywords || []).join('、')}

学生的描述：
${studentText}

请评估学生对以上知识点的理解完整性。`;

        const { llmCall } = await import('@/lib/llm-client');
        const { sanitizeJsonString } = await import('@/lib/utils');

        const raw = await llmCall({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
          maxTokens: 2048,
          jsonMode: true,
        });

        const result = JSON.parse(sanitizeJsonString(raw));
        return NextResponse.json({
          completeness: Math.min(100, Math.max(0, result.completeness ?? 50)),
          missingElements: result.missingElements ?? [],
          suggestions: result.suggestions ?? '',
        });
      }

      case 'generate-schema-problem': {
        const { schemaId, schemaName, schemaDescription, schemaData, memberCount } = body;

        if (!schemaId || !schemaName) {
          return NextResponse.json({ error: '缺少 schemaId 或 schemaName' }, { status: 400 });
        }

        // Fetch schema node and its members
        const schemaNode = await prisma.knowledgeNode.findUnique({
          where: { id: schemaId },
          include: {
            subject: { select: { name: true } },
            outgoingEdges: {
              where: { relationType: 'schema_member' },
              include: { to: { select: { id: true, title: true, summary: true } } },
            },
          },
        });

        if (!schemaNode) {
          return NextResponse.json({ error: '图式不存在' }, { status: 404 });
        }

        const members = schemaNode.outgoingEdges?.map((e: any) => e.to) ?? [];
        const subjectName = schemaNode.subject?.name || '通用';
        const repData = (schemaNode.representationData as any) || schemaData || {};
        const memberLines = members
          .map((m: any, i: number) => `${i + 1}. ${m.title}: ${m.summary || '(无描述)'}`)
          .join('\n');

        const systemPrompt = `你是一位教育设计专家，擅长设计"图式应用"练习题。

图式（Schema）是一组相关知识点的结构化认知框架。你需要：
1. 设计一个新颖的问题，适合用给定的图式来解决
2. 将图式的应用步骤拆解为具体的操作步骤

请生成：
- problemTitle: 问题的简短标题（10字以内）
- problemDescription: 问题的详细描述（50-100字），应当是一个具体的情境/场景
- schemaApplies: 应用哪个图式（即图式的名字）
- steps: 应用步骤数组，每个步骤包含 step（序号）、label（步骤名，8字以内）、description（该步骤的具体要求，20-60字）

步骤数量：3-6步，根据图式的复杂度决定。每一步应该是对学生来说可操作的具体要求。

输出严格JSON格式：
{
  "problemTitle": "...",
  "problemDescription": "...",
  "schemaApplies": "图式名称",
  "steps": [
    {"step": 1, "label": "步骤名", "description": "具体要求说明"}
  ]
}`;

        const userPrompt = `学科：${subjectName}
图式名称：${schemaName}
图式描述：${schemaDescription || schemaNode.summary || '(无描述)'}
图式类型：${repData.schemaType || '未指定'}
核心洞见：${(repData.keyInsights || []).join('；') || '(无)'}
应用范围：${repData.applicationScope || '未指定'}
包含知识点（${members.length}个）：
${memberLines || '(无)'}

请为以上图式设计一个新颖的应用练习题。`;

        const { llmCall: llmCall2 } = await import('@/lib/llm-client');
        const { sanitizeJsonString: sanitize2 } = await import('@/lib/utils');

        const raw2 = await llmCall2({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.4,
          maxTokens: 2048,
          jsonMode: true,
        });

        const result2 = JSON.parse(sanitize2(raw2));
        return NextResponse.json({
          problemTitle: result2.problemTitle || '图式应用练习',
          problemDescription: result2.problemDescription || '',
          schemaApplies: result2.schemaApplies || schemaName,
          steps: (result2.steps || []).map((s: any, i: number) => ({
            step: s.step ?? i + 1,
            label: s.label || `步骤${s.step ?? i + 1}`,
            description: s.description || '',
          })),
        });
      }

      case 'check-schema-apply': {
        const { schemaId, schemaName, problemTitle, problemDescription, steps } = body;

        if (!schemaId || !steps || !Array.isArray(steps)) {
          return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
        }

        // Fetch schema for context
        const schemaNode = await prisma.knowledgeNode.findUnique({
          where: { id: schemaId },
          include: {
            subject: { select: { name: true } },
            outgoingEdges: {
              where: { relationType: 'schema_member' },
              include: { to: { select: { id: true, title: true, summary: true } } },
            },
          },
        });

        if (!schemaNode) {
          return NextResponse.json({ error: '图式不存在' }, { status: 404 });
        }

        const members = schemaNode.outgoingEdges?.map((e: any) => e.to) ?? [];
        const repData = (schemaNode.representationData as any) || {};
        const memberKnowledge = members
          .map((m: any) => `- ${m.title}: ${m.summary || ''}`)
          .join('\n');

        const stepsContext = steps
          .map((s: any) => `步骤${s.step} [${s.label}]: 要求=${s.description} | 学生回答=${s.answer || '(未填写)'}`)
          .join('\n');

        const systemPrompt = `你是一位严格但公正的教育评估专家。你的任务是根据学生的图式应用步骤回答，逐一评估每步的正确性。

图式（Schema）是一个结构化的认知框架。给定图式名称、图式包含的知识点内容、问题描述和学生的分步回答，请对每步进行评估。

对每一步，判断：
- status: "correct"（完全正确，符合图式要求）| "partially-correct"（思路对但不完整或有小错）| "incorrect"（方向错误或严重误解）
- explanation: 对学生的具体评价（20-50字），指出对在哪里或错在哪里
- score: 该步得分 0-100

同时给出：
- overallScore: 所有步骤的综合得分 0-100
- overallComment: 对整体应用情况的总结评价（40-80字）

输出严格JSON格式：
{
  "stepFeedbacks": [
    {"step": 1, "status": "correct|partially-correct|incorrect", "explanation": "...", "score": 85}
  ],
  "overallScore": 75,
  "overallComment": "..."
}`;

        const userPrompt = `图式名称：${schemaName}
图式描述：${schemaNode.summary || '(无描述)'}
图式类型：${repData.schemaType || '未指定'}
核心洞见：${(repData.keyInsights || []).join('；')}

图式包含的知识点：
${memberKnowledge || '(无)'}

问题：${problemTitle}
问题描述：${problemDescription}

学生的分步回答：
${stepsContext}

请逐步骤评估学生的回答。`;

        const { llmCall: llmCall3 } = await import('@/lib/llm-client');
        const { sanitizeJsonString: sanitize3 } = await import('@/lib/utils');

        const raw3 = await llmCall3({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
          maxTokens: 2048,
          jsonMode: true,
        });

        const result3 = JSON.parse(sanitize3(raw3));
        const stepFeedbacks = (result3.stepFeedbacks || []).map((sf: any) => ({
          step: sf.step ?? 0,
          status: ['correct', 'partially-correct', 'incorrect'].includes(sf.status) ? sf.status : 'partially-correct',
          explanation: sf.explanation || '',
          score: Math.min(100, Math.max(0, sf.score ?? 0)),
        }));

        return NextResponse.json({
          stepFeedbacks,
          overallScore: Math.min(100, Math.max(0, result3.overallScore ?? 50)),
          overallComment: result3.overallComment || '',
        });
      }

      default:
        return NextResponse.json({ error: '未知操作' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[AI API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
