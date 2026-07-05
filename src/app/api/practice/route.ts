import { getErrorMessage } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { analyzeMistake, generateQuestions, gradeConstructedAnswer } from '@/lib/llm-client';
import { sm2 } from '@/lib/sm2';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import {
  getOrCreateUserKnowledgeProgress,
  updateUserKnowledgeProgress,
} from '@/lib/user-knowledge-progress';
import type { Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_ICAP_LEVELS = new Set(['Passive', 'Active', 'Constructive', 'Interactive']);
const VALID_ICAP_LOWERCASE: Record<string, string> = {
  passive: 'Passive',
  active: 'Active',
  constructive: 'Constructive',
  interactive: 'Interactive',
};

/** Normalize an ICAP level input to PascalCase; return null if invalid. */
function resolveIcapLevel(raw: string | null): string | null {
  if (!raw) return null;
  if (VALID_ICAP_LEVELS.has(raw)) return raw;
  const mapped = VALID_ICAP_LOWERCASE[raw.toLowerCase()];
  return mapped || null;
}

/**
 * Map an ICAP level to an appropriate LLM question-type description for the
 * `generateQuestions` prompt.
 */
const ICAP_QUESTION_TYPE_MAP: Record<string, string[]> = {
  Passive: ['multiple_choice', 'true_false'],
  Active: ['fill_blank', 'multiple_choice'],
  Constructive: ['short_answer'],
  Interactive: ['variant', 'short_answer'],
};

function pickQuestionTypeForIcap(icapLevel: string): string {
  const types = ICAP_QUESTION_TYPE_MAP[icapLevel] || ['multiple_choice'];
  return types[Math.floor(Math.random() * types.length)];
}

/**
 * Strip punctuation, spaces, and case for answer comparison.
 * Chinese-friendly: after stripping whitespace we compare character-by-character
 * overlap for constructed-response questions.
 */
function normalizeAnswer(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，。！？、：；""''（）【】《》\-,.!\?;:'"()\[\]{}<>「」『』　]/g, '');
}

interface CompareResult {
  isCorrect: boolean;
  normalizedUser: string;
  normalizedCorrect: string;
}

interface PracticeGradeResult {
  isCorrect: boolean;
  quality: number;
  feedback: string | null;
  source: 'rule' | 'ai' | 'self';
}

type PracticeQuestion = Awaited<ReturnType<typeof prisma.question.findMany>>[number];

/** 把题干的 stem + 4 个选项拼成完整题目文本，用于错题本的 questionText。
 *  例如："家庭联产承包责任制与…的根本区别在于？\nA. 土地私有制\nB. 土地公有制\nC. 土地集体所有制\nD. 土地国有制" */
function formatFullQuestion(stem: string, options?: unknown): string {
  if (!options || !Array.isArray(options) || (options as Array<unknown>).length === 0) {
    return stem;
  }
  const lines = [stem];
  for (const opt of options as Array<{ label?: string; text?: string }>) {
    const label = opt.label || '';
    const text = opt.text || '';
    if (label && text) {
      lines.push(`${label}. ${text}`);
    } else if (text) {
      lines.push(text);
    }
  }
  return lines.join('\n');
}

interface GeneratedQuestion {
  questionType?: string;
  stem?: string;
  options?: Prisma.QuestionCreateInput['options'];
  answer?: string;
  explanation?: string;
  difficulty?: number;
  cognitiveLoad?: number;
}

interface PracticeRequestBody {
  action?: unknown;
  knowledgeNodeId?: unknown;
  icapLevel?: unknown;
  count?: unknown;
  questionId?: unknown;
  userAnswer?: unknown;
  durationSeconds?: unknown;
  selfQuality?: unknown;
}

function compareAnswer(
  userAnswer: string,
  correctAnswer: string,
  questionType: string,
): CompareResult {
  const ua = normalizeAnswer(userAnswer);
  const ca = normalizeAnswer(correctAnswer);

  if (!ua) {
    return { isCorrect: false, normalizedUser: ua, normalizedCorrect: ca };
  }

  if (questionType === 'multiple_choice' || questionType === 'true_false') {
    // Exact match after normalization (handles "A", "a", "a.", "A.", etc.)
    return { isCorrect: ua === ca, normalizedUser: ua, normalizedCorrect: ca };
  }

  if (questionType === 'fill_blank') {
    // Substring match in either direction
    const correct =
      ua === ca ||
      ua.includes(ca) ||
      ca.includes(ua);
    return { isCorrect: correct, normalizedUser: ua, normalizedCorrect: ca };
  }

  // short_answer / variant: character-level Jaccard-like overlap
  const uaChars = new Set(ua);
  const caChars = new Set(ca);
  if (caChars.size === 0) {
    return { isCorrect: ua === ca, normalizedUser: ua, normalizedCorrect: ca };
  }
  const intersection = [...uaChars].filter((c) => caChars.has(c)).length;
  const similarity = intersection / caChars.size; // fraction of correct chars present
  return {
    isCorrect: similarity >= 0.5,
    normalizedUser: ua,
    normalizedCorrect: ca,
  };
}

/**
 * Convert answer correctness + optional self-assessment into an SM-2 quality
 * score (0-5).
 */
function qualityFromCorrectness(isCorrect: boolean, selfQuality?: number | null): number {
  if (selfQuality !== undefined && selfQuality !== null) {
    return Math.max(0, Math.min(5, Math.round(selfQuality)));
  }
  return isCorrect ? 4 : 1;
}

function shouldUseAiGrading(questionType: string): boolean {
  return questionType === 'short_answer' || questionType === 'variant';
}

function buildPracticeContext(knowledgeNode: {
  summary: string | null;
  representationType?: string | null;
  outgoingEdges?: Array<{ to: { title: string; summary: string | null } }>;
}): string {
  const schemaMemberContext = knowledgeNode.representationType === 'schema'
    ? (knowledgeNode.outgoingEdges || [])
      .map((edge, index) => `${index + 1}. ${edge.to.title}: ${edge.to.summary || ''}`.trim())
      .join('\n')
    : '';

  return [
    knowledgeNode.summary || '',
    schemaMemberContext ? `图式成员知识点：\n${schemaMemberContext}` : '',
  ].filter(Boolean).join('\n\n');
}

async function gradePracticeAnswer(options: {
  question: {
    questionType: string;
    stem: string;
    answer: string;
    explanation: string | null;
    knowledgeNode: { title: string };
  };
  userAnswer: string;
  selfQuality: number | null;
}): Promise<PracticeGradeResult> {
  const ruleResult = compareAnswer(
    options.userAnswer,
    options.question.answer,
    options.question.questionType,
  );

  if (!shouldUseAiGrading(options.question.questionType)) {
    return {
      isCorrect: ruleResult.isCorrect,
      quality: qualityFromCorrectness(ruleResult.isCorrect, options.selfQuality),
      feedback: null,
      source: options.selfQuality !== null ? 'self' : 'rule',
    };
  }

  try {
    const aiGrade = await gradeConstructedAnswer({
      knowledgeTitle: options.question.knowledgeNode.title,
      questionText: options.question.stem,
      userAnswer: options.userAnswer,
      correctAnswer: options.question.answer,
      explanation: options.question.explanation,
    }, prisma);

    return {
      isCorrect: aiGrade.isCorrect,
      quality: qualityFromCorrectness(aiGrade.isCorrect, options.selfQuality ?? aiGrade.quality),
      feedback: aiGrade.feedback,
      source: options.selfQuality !== null ? 'self' : 'ai',
    };
  } catch (error: unknown) {
    console.warn('[practice POST] AI grading failed; falling back to rule grading:', getErrorMessage(error));
    return {
      isCorrect: ruleResult.isCorrect,
      quality: qualityFromCorrectness(ruleResult.isCorrect, options.selfQuality),
      feedback: null,
      source: options.selfQuality !== null ? 'self' : 'rule',
    };
  }
}

// ---------------------------------------------------------------------------
// GET /api/practice
// Query: ?knowledgeNodeId=xxx&icapLevel=Active&count=3&forceGenerate=false
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');
    if (action === 'recommendations') {
      return handlePracticeRecommendations(await resolveUserIdFromRequest(req));
    }
    if (action === 'history') {
      return handlePracticeHistory(await resolveUserIdFromRequest(req));
    }

    await resolveUserIdFromRequest(req);

    const knowledgeNodeId = searchParams.get('knowledgeNodeId');
    const icapLevelRaw = searchParams.get('icapLevel') || 'Active';
    const count = Math.min(parseInt(searchParams.get('count') || '3', 10) || 3, 10);
    const forceGenerate = searchParams.get('forceGenerate') === 'true';

    // --- validation ---
    if (!knowledgeNodeId) {
      return NextResponse.json(
        { error: 'knowledgeNodeId query parameter is required' },
        { status: 400 },
      );
    }

    const icapLevel = resolveIcapLevel(icapLevelRaw);
    if (!icapLevel) {
      return NextResponse.json(
        {
          error: `Invalid icapLevel "${icapLevelRaw}". Must be one of: Passive, Active, Constructive, Interactive`,
        },
        { status: 400 },
      );
    }

    // --- fetch knowledge node ---
    const knowledgeNode = await prisma.knowledgeNode.findUnique({
      where: { id: knowledgeNodeId },
      select: {
        id: true,
        title: true,
        summary: true,
        representationType: true,
        subject: { select: { name: true } },
        outgoingEdges: {
          where: { relationType: 'schema_member' },
          select: {
            to: {
              select: {
                title: true,
                summary: true,
              },
            },
          },
        },
      },
    });

    if (!knowledgeNode) {
      return NextResponse.json({ error: 'KnowledgeNode not found' }, { status: 404 });
    }

    // --- fetch existing questions from DB ---
    let existingQuestions: PracticeQuestion[] = [];
    if (!forceGenerate) {
      existingQuestions = await prisma.question.findMany({
        where: { knowledgeNodeId, icapLevel },
        take: count,
        orderBy: { createdAt: 'desc' },
      });
    }

    let questions = existingQuestions;

    // --- if insufficient, generate via LLM ---
    if (existingQuestions.length < count) {
      const needed = forceGenerate ? count : count - existingQuestions.length;
      const questionTypeDesc = pickQuestionTypeForIcap(icapLevel);

      try {
        const llmResult = await generateQuestions(
          knowledgeNode.title,
          buildPracticeContext(knowledgeNode),
          knowledgeNode.subject?.name || '通用',
          questionTypeDesc,
          icapLevel,
          needed,
        );

        const generated = ((llmResult.questions || []) as GeneratedQuestion[]).slice(0, needed);

        // Persist generated questions
        const savedQuestions = await Promise.all(
          generated.map((q) =>
            prisma.question.create({
              data: {
                knowledgeNodeId,
                questionType: q.questionType || questionTypeDesc || 'multiple_choice',
                icapLevel,
                stem: q.stem || '',
                options: q.options ?? undefined,
                answer: q.answer || '',
                explanation: q.explanation || '',
                difficulty: q.difficulty ?? 3,
                cognitiveLoad: q.cognitiveLoad ?? 3,
              },
            }),
          ),
        );

        questions = forceGenerate ? savedQuestions : [...existingQuestions, ...savedQuestions];
      } catch (llmError: unknown) {
        console.error('[practice GET] LLM generation failed:', getErrorMessage(llmError));

        if (existingQuestions.length === 0) {
          return NextResponse.json(
            {
              error: 'Question generation failed and no cached questions are available.',
              detail: getErrorMessage(llmError),
            },
            { status: 503 },
          );
        }

        // Return whatever cached questions we have
        questions = existingQuestions;
      }
    }

    return NextResponse.json({
      questions: questions.slice(0, count),
      knowledgeNode: {
        id: knowledgeNode.id,
        title: knowledgeNode.title,
        summary: knowledgeNode.summary,
      },
      icapLevel,
      total: questions.length,
    });
  } catch (error: unknown) {
    console.error('[practice GET]', error);
    const message = getErrorMessage(error, 'Internal server error');
    return NextResponse.json(
      { error: message },
      { status: message === 'Authentication required' ? 401 : 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/practice
//
// Two modes:
//   1. { action: "generate", ... }   — force-generate questions via LLM & save
//   2. { questionId, userAnswer, ... } — submit a practice answer
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as PracticeRequestBody;

    // --- Mode 1: generate ---
    if (body.action === 'generate') {
      return handleGenerateQuestion(body);
    }

    // --- Mode 2: submit answer ---
    return handleSubmitAnswer(body, await resolveUserIdFromRequest(req));
  } catch (error: unknown) {
    console.error('[practice POST]', error);
    const message = getErrorMessage(error, 'Internal server error');
    return NextResponse.json(
      { error: message },
      { status: message === 'Authentication required' ? 401 : 500 },
    );
  }
}

async function handlePracticeRecommendations(uid: string) {
  const logs = await prisma.reviewLog.findMany({
    where: {
      userId: uid,
      knowledgeNodeId: { not: null },
      quality: { lt: 3 },
    },
    include: {
      knowledgeNode: {
        select: {
          id: true,
          title: true,
          masteryLevel: true,
          subject: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 12,
  });

  const seen = new Set<string>();
  const recommendations = logs
    .filter((log) => log.knowledgeNode && !seen.has(log.knowledgeNode.id))
    .map((log) => {
      seen.add(log.knowledgeNode!.id);
      return {
        id: `review_low_quality_${log.knowledgeNode!.id}`,
        type: 'review_low_quality',
        nodeId: log.knowledgeNode!.id,
        title: log.knowledgeNode!.title,
        masteryLevel: log.knowledgeNode!.masteryLevel,
        subjectName: log.knowledgeNode!.subject?.name ?? null,
        quality: log.quality,
        createdAt: log.createdAt,
        targetUrl: `/practice?nodeId=${encodeURIComponent(log.knowledgeNode!.id)}&icapLevel=Active`,
      };
    });

  return NextResponse.json({ recommendations });
}

async function handlePracticeHistory(uid: string) {
  const logs = await prisma.reviewLog.findMany({
    where: {
      userId: uid,
      action: { in: ['solved', 'mistake'] },
    },
    include: {
      knowledgeNode: {
        select: {
          id: true,
          title: true,
          subject: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 12,
  });

  return NextResponse.json({
    history: logs.map((log) => ({
      id: log.id,
      nodeId: log.knowledgeNodeId,
      nodeTitle: log.knowledgeNode?.title ?? '未知知识点',
      subjectName: log.knowledgeNode?.subject?.name ?? null,
      action: log.action,
      quality: log.quality,
      masteryBefore: log.masteryBefore,
      masteryAfter: log.masteryAfter,
      durationSeconds: log.durationSeconds,
      createdAt: log.createdAt,
    })),
  });
}

// ---------------------------------------------------------------------------
// POST sub-handlers
// ---------------------------------------------------------------------------

async function handleGenerateQuestion(body: PracticeRequestBody) {
  const knowledgeNodeId = typeof body.knowledgeNodeId === 'string' ? body.knowledgeNodeId : '';
  const icapLevelRaw = typeof body.icapLevel === 'string' ? body.icapLevel : 'Active';
  const count = typeof body.count === 'number' ? body.count : Number(body.count ?? 3);

  if (!knowledgeNodeId) {
    return NextResponse.json({ error: 'knowledgeNodeId is required' }, { status: 400 });
  }

  const icapLevel = resolveIcapLevel(icapLevelRaw);
  if (!icapLevel) {
    return NextResponse.json(
      { error: `Invalid icapLevel "${icapLevelRaw}"` },
      { status: 400 },
    );
  }

  const knowledgeNode = await prisma.knowledgeNode.findUnique({
    where: { id: knowledgeNodeId },
    select: {
      id: true,
      title: true,
      summary: true,
      representationType: true,
      subject: { select: { name: true } },
      outgoingEdges: {
        where: { relationType: 'schema_member' },
        select: {
          to: {
            select: {
              title: true,
              summary: true,
            },
          },
        },
      },
    },
  });

  if (!knowledgeNode) {
    return NextResponse.json({ error: 'KnowledgeNode not found' }, { status: 404 });
  }

  const questionTypeDesc = pickQuestionTypeForIcap(icapLevel);
  const safeCount = Math.min(Math.max(1, count), 10);

  const llmResult = await generateQuestions(
    knowledgeNode.title,
    buildPracticeContext(knowledgeNode),
    knowledgeNode.subject?.name || '通用',
    questionTypeDesc,
    icapLevel,
    safeCount,
  );

  const generated = ((llmResult.questions || []) as GeneratedQuestion[]).slice(0, safeCount);

  if (generated.length === 0) {
    return NextResponse.json(
      { error: 'LLM returned zero questions; check model availability.' },
      { status: 500 },
    );
  }

  const savedQuestions = await Promise.all(
    generated.map((q) =>
      prisma.question.create({
        data: {
          knowledgeNodeId,
          questionType: q.questionType || questionTypeDesc || 'multiple_choice',
          icapLevel,
          stem: q.stem || '',
          options: q.options ?? undefined,
          answer: q.answer || '',
          explanation: q.explanation || '',
          difficulty: q.difficulty ?? 3,
          cognitiveLoad: q.cognitiveLoad ?? 3,
        },
      }),
    ),
  );

  return NextResponse.json({
    questions: savedQuestions,
    knowledgeNode: { id: knowledgeNode.id, title: knowledgeNode.title },
    icapLevel,
    generated: true,
  });
}

async function handleSubmitAnswer(body: PracticeRequestBody, uid: string) {
  const questionId = typeof body.questionId === 'string' ? body.questionId : '';
  const { userAnswer } = body;
  const durationSeconds = typeof body.durationSeconds === 'number' ? body.durationSeconds : null;
  const selfQuality = typeof body.selfQuality === 'number' ? body.selfQuality : null;

  // --- validation ---
  if (!questionId) {
    return NextResponse.json({ error: 'questionId is required' }, { status: 400 });
  }
  if (userAnswer === undefined || userAnswer === null) {
    return NextResponse.json({ error: 'userAnswer is required' }, { status: 400 });
  }

  const answerStr = String(userAnswer);
  if (answerStr.trim() === '') {
    return NextResponse.json({ error: 'userAnswer must not be empty' }, { status: 400 });
  }

  // --- fetch question and its knowledge node ---
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: {
      knowledgeNode: {
        select: {
          id: true,
          title: true,
          masteryLevel: true,
          repetitions: true,
          easeFactor: true,
          intervalDays: true,
          lastReviewAt: true,
          subject: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!question) {
    return NextResponse.json({ error: 'Question not found' }, { status: 404 });
  }

  const node = question.knowledgeNode;
  if (!node) {
    return NextResponse.json({ error: 'Associated KnowledgeNode not found' }, { status: 500 });
  }

  const progress = await getOrCreateUserKnowledgeProgress(uid, node.id, prisma);

  // --- compare answer ---
  const grade = await gradePracticeAnswer({
    question,
    userAnswer: answerStr,
    selfQuality,
  });
  const { isCorrect, quality } = grade;

  // --- SM-2 scheduling ---
  const sm2Result = sm2(quality, {
    repetitions: progress.repetitions,
    easeFactor: progress.easeFactor,
    intervalDays: progress.intervalDays,
    lastReviewAt: progress.lastReviewAt,
  });

  // --- atomic transaction: SM-2 progress + ReviewLog must advance together ---
  // If the request fails mid-way, the user shouldn't end up with
  // an advanced mastery but no audit row (or vice versa) — the
  // analytics dashboard reads ReviewLog to compute averages, so
  // partial writes corrupt the 30-day stats.
  await prisma.$transaction(async (tx) => {
    await updateUserKnowledgeProgress(uid, node.id, sm2Result.state, tx as unknown as typeof prisma);
    await tx.reviewLog.create({
      data: {
        userId: uid,
        knowledgeNodeId: node.id,
        action: isCorrect ? 'solved' : 'mistake',
        quality,
        masteryBefore: progress.masteryLevel,
        masteryAfter: sm2Result.state.masteryLevel,
        easeFactorBefore: sm2Result.log.easeFactorBefore,
        easeFactorAfter: sm2Result.log.easeFactorAfter,
        intervalBefore: sm2Result.log.intervalBefore,
        intervalAfter: sm2Result.log.intervalAfter,
        repetitions: sm2Result.log.repetitionsAfter,
        forgetRisk: sm2Result.log.forgetRisk,
        durationSeconds: durationSeconds || null,
      },
    });
  });

  // --- if wrong, also record in Mistake (错题本) so the user can review it later ---
  if (!isCorrect) {
    try {
      const subjectName = node.subject?.name || '通用';
      const analysis = await analyzeMistake(
        subjectName,
        question.stem,
        answerStr,
        question.answer,
      );
      await prisma.mistake.create({
        data: {
          userId: uid,
          knowledgeNodeId: node.id,
          subjectId: node.subject?.id ?? null,
          // 带选项的完整题目，错题本才能看到原题的 A/B/C/D 选项内容
          questionText: formatFullQuestion(question.stem, question.options),
          wrongAnswer: answerStr,
          correctAnswer: question.answer,
          mistakeType: analysis?.mistakeType || 'conceptual',
          analysis: analysis?.analysis || '',
          // FSRS initial state — the row is now FSRS-scheduled
          // instead of SM-2-scheduled. The first review uses the
          // canonical FSRS beginner curve (stability=1, next in
          // 1 day).
          state: 'new',
          stability: 1,
          difficulty: 5,
          reps: 0,
          lapses: 0,
          lastReviewAt: null,
          nextReviewAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          history: [],
        },
      });
    } catch (mistakeError) {
      // Mistake 录入失败不应阻塞练习评分主流程；只记录警告
      console.warn(
        '[practice POST] Failed to record mistake:',
        getErrorMessage(mistakeError),
      );
    }
  }

  // --- build feedback ---
  const correctDisplay = question.answer;
  const explanation = question.explanation || null;

  const feedback = grade.feedback || (isCorrect
    ? '回答正确！继续保持。'
    : explanation || `正确答案是: ${correctDisplay}`);

  const scoreValue = quality !== undefined ? Math.round(quality * 20) : null;

  return NextResponse.json({
    isCorrect,
    quality,
    score: scoreValue,
    feedback,
    correctAnswer: correctDisplay,
    explanation,
    gradingSource: grade.source,
    userAnswer: answerStr,
    masteryChange: {
      before: progress.masteryLevel,
      after: sm2Result.state.masteryLevel,
      delta: sm2Result.state.masteryLevel - progress.masteryLevel,
    },
    nextReviewAt: sm2Result.state.nextReviewAt,
    sm2State: {
      repetitions: sm2Result.state.repetitions,
      easeFactor: sm2Result.state.easeFactor,
      intervalDays: sm2Result.state.intervalDays,
      forgetRisk: sm2Result.state.forgetRisk,
      masteryLevel: sm2Result.state.masteryLevel,
    },
  });
}
