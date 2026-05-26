import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateQuestions } from '@/lib/llm-client';
import { sm2 } from '@/lib/sm2';

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

// ---------------------------------------------------------------------------
// GET /api/practice
// Query: ?knowledgeNodeId=xxx&icapLevel=Active&count=3&forceGenerate=false
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
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
        subject: { select: { name: true } },
      },
    });

    if (!knowledgeNode) {
      return NextResponse.json({ error: 'KnowledgeNode not found' }, { status: 404 });
    }

    // --- fetch existing questions from DB ---
    let existingQuestions: any[] = [];
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
          knowledgeNode.summary || '',
          knowledgeNode.subject?.name || '通用',
          questionTypeDesc,
          icapLevel,
          needed,
        );

        const generated = (llmResult.questions || []).slice(0, needed);

        // Persist generated questions
        const savedQuestions = await Promise.all(
          generated.map((q: any) =>
            prisma.question.create({
              data: {
                knowledgeNodeId,
                questionType: q.questionType || questionTypeDesc || 'multiple_choice',
                icapLevel,
                stem: q.stem || '',
                options: q.options || null,
                answer: q.answer || '',
                explanation: q.explanation || '',
                difficulty: q.difficulty ?? 3,
                cognitiveLoad: q.cognitiveLoad ?? 3,
              },
            }),
          ),
        );

        questions = forceGenerate ? savedQuestions : [...existingQuestions, ...savedQuestions];
      } catch (llmError: any) {
        console.error('[practice GET] LLM generation failed:', llmError.message);

        if (existingQuestions.length === 0) {
          return NextResponse.json(
            {
              error: 'Question generation failed and no cached questions are available.',
              detail: llmError.message,
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
  } catch (error: any) {
    console.error('[practice GET]', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
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
    const body = await req.json();

    // --- Mode 1: generate ---
    if (body.action === 'generate') {
      return handleGenerateQuestion(body);
    }

    // --- Mode 2: submit answer ---
    return handleSubmitAnswer(body);
  } catch (error: any) {
    console.error('[practice POST]', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST sub-handlers
// ---------------------------------------------------------------------------

async function handleGenerateQuestion(body: any) {
  const { knowledgeNodeId, icapLevel: icapLevelRaw = 'Active', count = 3 } = body;

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
      subject: { select: { name: true } },
    },
  });

  if (!knowledgeNode) {
    return NextResponse.json({ error: 'KnowledgeNode not found' }, { status: 404 });
  }

  const questionTypeDesc = pickQuestionTypeForIcap(icapLevel);
  const safeCount = Math.min(Math.max(1, count), 10);

  const llmResult = await generateQuestions(
    knowledgeNode.title,
    knowledgeNode.summary || '',
    knowledgeNode.subject?.name || '通用',
    questionTypeDesc,
    icapLevel,
    safeCount,
  );

  const generated = (llmResult.questions || []).slice(0, safeCount);

  if (generated.length === 0) {
    return NextResponse.json(
      { error: 'LLM returned zero questions; check model availability.' },
      { status: 500 },
    );
  }

  const savedQuestions = await Promise.all(
    generated.map((q: any) =>
      prisma.question.create({
        data: {
          knowledgeNodeId,
          questionType: q.questionType || questionTypeDesc || 'multiple_choice',
          icapLevel,
          stem: q.stem || '',
          options: q.options || null,
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

async function handleSubmitAnswer(body: any) {
  const { questionId, userAnswer, userId, durationSeconds, selfQuality } = body;

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

  // --- compare answer ---
  const { isCorrect } = compareAnswer(answerStr, question.answer, question.questionType);
  const quality = qualityFromCorrectness(isCorrect, selfQuality);

  // --- resolve user ---
  let uid = userId || 'default-user';
  if (uid === 'default-user') {
    const defaultUser = await prisma.user.findFirst({ select: { id: true } });
    if (defaultUser) uid = defaultUser.id;
  }

  // --- SM-2 scheduling ---
  const sm2Result = sm2(quality, {
    repetitions: node.repetitions,
    easeFactor: node.easeFactor,
    intervalDays: node.intervalDays,
    lastReviewAt: node.lastReviewAt,
  });

  // --- update knowledge node ---
  await prisma.knowledgeNode.update({
    where: { id: node.id },
    data: {
      repetitions: sm2Result.state.repetitions,
      easeFactor: sm2Result.state.easeFactor,
      intervalDays: sm2Result.state.intervalDays,
      nextReviewAt: sm2Result.state.nextReviewAt,
      lastReviewAt: sm2Result.state.lastReviewAt,
      forgetRisk: sm2Result.state.forgetRisk,
      masteryLevel: sm2Result.state.masteryLevel,
    },
  });

  // --- create ReviewLog ---
  await prisma.reviewLog.create({
    data: {
      userId: uid,
      knowledgeNodeId: node.id,
      action: isCorrect ? 'solved' : 'mistake',
      quality,
      masteryBefore: node.masteryLevel,
      masteryAfter: sm2Result.state.masteryLevel,
      easeFactorBefore: sm2Result.log.easeFactorBefore,
      easeFactorAfter: sm2Result.log.easeFactorAfter,
      intervalBefore: sm2Result.log.intervalBefore,
      intervalAfter: sm2Result.log.intervalAfter,
      repetitions: sm2Result.log.repetitions,
      forgetRisk: sm2Result.log.forgetRisk,
      durationSeconds: durationSeconds || null,
    },
  });

  // --- build feedback ---
  const correctDisplay = question.answer;
  const explanation = question.explanation || null;

  const feedback = isCorrect
    ? '回答正确！继续保持。'
    : explanation || `正确答案是: ${correctDisplay}`;

  const scoreValue = quality !== undefined ? Math.round(quality * 20) : null;

  return NextResponse.json({
    isCorrect,
    quality,
    score: scoreValue,
    feedback,
    correctAnswer: correctDisplay,
    explanation,
    userAnswer: answerStr,
    masteryChange: {
      before: node.masteryLevel,
      after: sm2Result.state.masteryLevel,
      delta: sm2Result.state.masteryLevel - node.masteryLevel,
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
