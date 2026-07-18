import { getErrorMessage, getErrorStatus } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import {
  analyzeMistake,
  generateQuestions,
  generateSummary,
  generateWorkedExample,
  llmCall,
} from '@/lib/llm-client';
import { sanitizeJsonString } from '@/lib/utils';
import type { Prisma } from '@prisma/client';

type JsonRecord = Record<string, unknown>;
type SchemaMember = { id: string; title: string; summary: string | null };
type KnowledgePointForSummary = { title: string; summary: string; masteryLevel: number };

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asString(item))
    .filter((item) => item.length > 0);
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function parseAiJsonObject(raw: string): JsonRecord {
  return asRecord(JSON.parse(sanitizeJsonString(raw)) as unknown);
}

function normalizeKnowledgePoints(value: unknown): KnowledgePointForSummary[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(asRecord)
    .map((item) => ({
      title: asString(item.title),
      summary: asString(item.summary),
      masteryLevel: clampInt(item.masteryLevel, 0, 100, 0),
    }))
    .filter((item) => item.title.length > 0);
}

function normalizeMentalModelResult(value: unknown) {
  const result = asRecord(value);
  return {
    completeness: clampInt(result.completeness, 0, 100, 50),
    missingElements: asStringArray(result.missingElements),
    suggestions: asString(result.suggestions),
  };
}

function normalizeSchemaProblem(value: unknown, schemaName: string) {
  const result = asRecord(value);
  const steps = Array.isArray(result.steps)
    ? result.steps
        .map(asRecord)
        .map((step, index) => ({
          step: clampInt(step.step, 1, 20, index + 1),
          label: asString(step.label, `Step ${index + 1}`),
          description: asString(step.description),
        }))
        .filter((step) => step.label.length > 0 || step.description.length > 0)
    : [];

  return {
    problemTitle: asString(result.problemTitle, 'Schema application practice'),
    problemDescription: asString(result.problemDescription),
    schemaApplies: asString(result.schemaApplies, schemaName),
    steps,
  };
}

function normalizeSchemaApplyFeedback(value: unknown) {
  const result = asRecord(value);
  const validStatuses = ['correct', 'partially-correct', 'incorrect'];
  const stepFeedbacks = Array.isArray(result.stepFeedbacks)
    ? result.stepFeedbacks
        .map(asRecord)
        .map((feedback, index) => {
          const status = asString(feedback.status);
          return {
            step: clampInt(feedback.step, 1, 20, index + 1),
            status: validStatuses.includes(status) ? status : 'partially-correct',
            explanation: asString(feedback.explanation),
            score: clampInt(feedback.score, 0, 100, 0),
          };
        })
    : [];

  return {
    stepFeedbacks,
    overallScore: clampInt(result.overallScore, 0, 100, 50),
    overallComment: asString(result.overallComment),
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const action = searchParams.get('action');

    if (action === 'list-logs') {
      const typesParam = searchParams.get('types');
      // parseInt 对非数字输入得 NaN，NaN 的 skip/take 会让 Prisma 忽略分页（全表扫描）
      const rawPage = parseInt(searchParams.get('page') || '1', 10);
      const rawLimit = parseInt(searchParams.get('limit') || '20', 10);
      const page = Math.max(1, Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1);
      const limit = Math.min(50, Math.max(1, Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 20));

      // UI 传 `types=llm,tts,image...` 多个值；空 / 'all' 不过滤。
      // AiGenerationLog.generatorType 实际值见代码各处写入：
      //   llm / chat / tutor_chat / textbook_chapter / textbook_outline /
      //   practice_answer_grading / worked_example / tts / image
      // UI 把这些映射成 4 类，所以后端要支持 IN 查询。
      const where: { generatorType?: { in: string[] } } = {};
      if (typesParam && typesParam !== 'all') {
        const types = typesParam
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (types.length > 0) {
          where.generatorType = { in: types };
        }
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

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: unknown) {
    console.error('[AI API GET] Error:', error);
    return NextResponse.json({ error: getErrorMessage(error, 'Internal server error') }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // Require auth — every action below issues a deepseek LLM call ($$$).
    // Without this guard, a caller that slipped past the proxy could
    // burn the project owner's API quota or trigger image generation.
    // Note: GET (list-logs) is an admin-facing viewer and remains open to
    // any authenticated user; auth is still enforced by the proxy.
    await resolveUserIdFromRequest(req);

    const body = await req.json();
    const { action } = body;

    switch (action) {
      case 'generate-questions': {
        const knowledgeNodeId = asString(body.knowledgeNodeId);
        const questionType = asString(body.questionType, 'multiple_choice');
        const icapLevel = asString(body.icapLevel, 'Active');
        const count = clampInt(body.count, 1, 10, 3);

        const node = await prisma.knowledgeNode.findUnique({ where: { id: knowledgeNodeId } });
        if (!node) {
          return NextResponse.json({ error: 'Knowledge node not found' }, { status: 404 });
        }

        const subject = await prisma.subject.findUnique({ where: { id: node.subjectId } });
        const result = await generateQuestions(
          node.title,
          node.summary || '',
          subject?.name || 'math',
          questionType,
          icapLevel,
          count,
        );

        console.log(
          '[generate-questions] raw result:',
          JSON.stringify({
            questionsCount: (result.questions || []).length,
            firstQuestion: (result.questions || [])[0],
          }).slice(0, 500),
        );

        if (!result.questions || result.questions.length === 0) {
          return NextResponse.json(
            {
              error:
                'AI 生成了题目但格式未能解析。请重试或更换知识点。若持续出现，可能是 LLM 返回的 JSON 与预期格式不匹配。',
            },
            { status: 422 },
          );
        }

        const questions = [];
        for (const questionData of result.questions || []) {
          const question = await prisma.question.create({
            data: {
              knowledgeNodeId,
              questionType: questionData.questionType || questionType,
              icapLevel: questionData.icapLevel || icapLevel,
              stem: questionData.stem || questionData.question || '',
              options: questionData.options === undefined
                ? undefined
                : questionData.options as Prisma.InputJsonValue,
              answer: questionData.answer || '',
              explanation: questionData.explanation || '',
              difficulty: questionData.difficulty || 3,
              cognitiveLoad: questionData.cognitiveLoad || 3,
            },
          });
          questions.push(question);
        }

        return NextResponse.json({ success: true, questions });
      }

      case 'analyze-mistake': {
        const result = await analyzeMistake(
          asString(body.subject),
          asString(body.questionText),
          body.wrongAnswer === undefined ? undefined : asString(body.wrongAnswer),
          asString(body.correctAnswer),
        );
        return NextResponse.json(result);
      }

      case 'generate-summary': {
        const result = await generateSummary(
          asString(body.subject),
          normalizeKnowledgePoints(body.knowledgePoints),
        );
        return NextResponse.json({ summary: result });
      }

      case 'generate-worked-example': {
        const knowledgeNodeId = asString(body.knowledgeNodeId);
        if (!knowledgeNodeId) {
          return NextResponse.json({ error: 'knowledgeNodeId is required' }, { status: 400 });
        }

        const workedExample = await generateWorkedExample(
          knowledgeNodeId,
          asString(body.subject),
          clampInt(body.difficulty, 1, 5, 3),
        );

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
        const knowledgeNodeId = asString(body.knowledgeNodeId);
        const studentText = asString(body.studentText);
        if (!knowledgeNodeId || !studentText) {
          return NextResponse.json({ error: 'knowledgeNodeId and studentText are required' }, { status: 400 });
        }

        const node = await prisma.knowledgeNode.findUnique({
          where: { id: knowledgeNodeId },
          include: { subject: { select: { name: true } } },
        });
        if (!node) {
          return NextResponse.json({ error: 'Knowledge node not found' }, { status: 404 });
        }

        const raw = await llmCall({
          messages: [
            {
              role: 'system',
              content: `Evaluate how complete a student's mental model is.
Return strict JSON: {"completeness":0-100,"missingElements":["..."],"suggestions":"..."}. Prefer Chinese feedback.`,
            },
            {
              role: 'user',
              content: `Subject: ${node.subject?.name || 'general'}
Knowledge node: ${node.title}
Summary: ${node.summary || '(no summary)'}
Keywords: ${(node.keywords || []).join(', ')}

Student text:
${studentText}`,
            },
          ],
          temperature: 0.3,
          maxTokens: 2048,
          jsonMode: true,
        });

        return NextResponse.json(normalizeMentalModelResult(parseAiJsonObject(raw)));
      }

      case 'generate-schema-problem': {
        const schemaId = asString(body.schemaId);
        const schemaName = asString(body.schemaName);
        if (!schemaId || !schemaName) {
          return NextResponse.json({ error: 'schemaId and schemaName are required' }, { status: 400 });
        }

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
          return NextResponse.json({ error: 'Schema not found' }, { status: 404 });
        }

        const members: SchemaMember[] = schemaNode.outgoingEdges?.map((edge) => edge.to) ?? [];
        const repData = asRecord(schemaNode.representationData ?? body.schemaData);
        const memberLines = members
          .map((member, index) => `${index + 1}. ${member.title}: ${member.summary || '(no summary)'}`)
          .join('\n');

        const raw = await llmCall({
          messages: [
            {
              role: 'system',
              content: `Design a schema application practice problem.
Return strict JSON: {"problemTitle":"...","problemDescription":"...","schemaApplies":"...","steps":[{"step":1,"label":"...","description":"..."}]}. Prefer Chinese content.`,
            },
            {
              role: 'user',
              content: `Subject: ${schemaNode.subject?.name || 'general'}
Schema name: ${schemaName}
Schema description: ${asString(body.schemaDescription, schemaNode.summary || '')}
Schema type: ${asString(repData.schemaType, 'unknown')}
Key insights: ${asStringArray(repData.keyInsights).join('; ') || '(none)'}
Application scope: ${asString(repData.applicationScope, 'unknown')}
Members:
${memberLines || '(none)'}`,
            },
          ],
          temperature: 0.4,
          maxTokens: 2048,
          jsonMode: true,
        });

        return NextResponse.json(normalizeSchemaProblem(parseAiJsonObject(raw), schemaName));
      }

      case 'check-schema-apply': {
        const schemaId = asString(body.schemaId);
        const schemaName = asString(body.schemaName);
        const steps: JsonRecord[] = Array.isArray(body.steps) ? body.steps.map(asRecord) : [];
        if (!schemaId || steps.length === 0) {
          return NextResponse.json({ error: 'schemaId and steps are required' }, { status: 400 });
        }

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
          return NextResponse.json({ error: 'Schema not found' }, { status: 404 });
        }

        const members: SchemaMember[] = schemaNode.outgoingEdges?.map((edge) => edge.to) ?? [];
        const repData = asRecord(schemaNode.representationData);
        const memberKnowledge = members
          .map((member) => `- ${member.title}: ${member.summary || ''}`)
          .join('\n');
        const stepsContext = steps
          .map((step) => {
            const stepNo = clampInt(step.step, 1, 20, 1);
            return `Step ${stepNo} [${asString(step.label)}]: requirement=${asString(step.description)} | student=${asString(step.answer, '(empty)')}`;
          })
          .join('\n');

        const raw = await llmCall({
          messages: [
            {
              role: 'system',
              content: `Evaluate a student's schema application steps.
Return strict JSON: {"stepFeedbacks":[{"step":1,"status":"correct|partially-correct|incorrect","explanation":"...","score":85}],"overallScore":75,"overallComment":"..."}. Prefer Chinese feedback.`,
            },
            {
              role: 'user',
              content: `Schema name: ${schemaName}
Schema description: ${schemaNode.summary || '(no summary)'}
Schema type: ${asString(repData.schemaType, 'unknown')}
Key insights: ${asStringArray(repData.keyInsights).join('; ')}

Schema members:
${memberKnowledge || '(none)'}

Problem: ${asString(body.problemTitle)}
Problem description: ${asString(body.problemDescription)}

Student steps:
${stepsContext}`,
            },
          ],
          temperature: 0.3,
          maxTokens: 2048,
          jsonMode: true,
        });

        return NextResponse.json(normalizeSchemaApplyFeedback(parseAiJsonObject(raw)));
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error: unknown) {
    console.error('[AI API] Error:', error);
    // 认证失败返回 401 而非 500，客户端才能触发 token 刷新流程
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: getErrorStatus(error) },
    );
  }
}
