import { llmCall } from '@/lib/llm-client';
import { parseAiJson } from '@/lib/ai-service';

// ========== TYPES ==========

export interface SocraticDialogueParams {
  studentMessage: string;
  knowledgeNodeTitle: string;
  knowledgeNodeSummary: string;
  subject: string;
  history: Array<{ role: string; content: string }>;
  userId: string;
}

export interface SocraticDialogueResult {
  tutorReply: string;
  questions: string[];
  insights: string[];
  suggestedAction: 'continue' | 'move_on' | 'review_basics' | 'challenge' | 'summarize';
  understandingLevel: 'confused' | 'superficial' | 'developing' | 'proficient' | 'mastered';
}

export interface AssessIcapLevelResult {
  recommendedLevel: 'Passive' | 'Active' | 'Constructive' | 'Interactive';
  reasoning: string;
  prerequisiteGaps: string[];
}

export interface DetectCognitiveGapsResult {
  hasGaps: boolean;
  gaps: Array<{
    category: 'missing_concept' | 'superficial_understanding' | 'inability_to_transfer' | 'misconception';
    description: string;
    suggestion: string;
  }>;
  overallAssessment: string;
}

type CognitiveGap = DetectCognitiveGapsResult['gaps'][number];
type SuggestedAction = SocraticDialogueResult['suggestedAction'];
type UnderstandingLevel = SocraticDialogueResult['understandingLevel'];
type IcapLevel = AssessIcapLevelResult['recommendedLevel'];

const COGNITIVE_GAP_CATEGORIES: CognitiveGap['category'][] = [
  'missing_concept',
  'superficial_understanding',
  'inability_to_transfer',
  'misconception',
];
const SUGGESTED_ACTIONS: SuggestedAction[] = ['continue', 'move_on', 'review_basics', 'challenge', 'summarize'];
const UNDERSTANDING_LEVELS: UnderstandingLevel[] = [
  'confused',
  'superficial',
  'developing',
  'proficient',
  'mastered',
];
const ICAP_LEVELS: IcapLevel[] = ['Passive', 'Active', 'Constructive', 'Interactive'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function parseJsonObject(raw: string): Record<string, unknown> {
  // 与 llm-client 统一走 parseAiJson：截断/非法 JSON 抛带分类的
  // AiServiceError（parse），不再是裸 SyntaxError
  const parsed = parseAiJson<unknown>(raw, 'ai-tutor');
  return isRecord(parsed) ? parsed : {};
}

function isCognitiveGapCategory(value: unknown): value is CognitiveGap['category'] {
  return typeof value === 'string' && COGNITIVE_GAP_CATEGORIES.includes(value as CognitiveGap['category']);
}

function toCognitiveGap(value: unknown): CognitiveGap {
  const gap = isRecord(value) ? value : {};
  return {
    category: isCognitiveGapCategory(gap.category)
      ? gap.category
      : 'superficial_understanding',
    description: asString(gap.description),
    suggestion: asString(gap.suggestion),
  };
}

function normalizeSocraticDialogueResult(value: unknown): SocraticDialogueResult {
  const result = isRecord(value) ? value : {};
  const suggestedAction = asString(result.suggestedAction);
  const understandingLevel = asString(result.understandingLevel);
  return {
    tutorReply: asString(result.tutorReply, 'Can you say more about your understanding?'),
    questions: asStringArray(result.questions),
    insights: asStringArray(result.insights),
    suggestedAction: SUGGESTED_ACTIONS.includes(suggestedAction as SuggestedAction)
      ? (suggestedAction as SuggestedAction)
      : 'continue',
    understandingLevel: UNDERSTANDING_LEVELS.includes(understandingLevel as UnderstandingLevel)
      ? (understandingLevel as UnderstandingLevel)
      : 'superficial',
  };
}

function normalizeAssessIcapLevelResult(value: unknown): AssessIcapLevelResult {
  const result = isRecord(value) ? value : {};
  const recommendedLevel = asString(result.recommendedLevel);
  return {
    recommendedLevel: ICAP_LEVELS.includes(recommendedLevel as IcapLevel)
      ? (recommendedLevel as IcapLevel)
      : 'Active',
    reasoning: asString(result.reasoning, 'Icap level was selected from mastery and prerequisite performance.'),
    prerequisiteGaps: asStringArray(result.prerequisiteGaps),
  };
}

function normalizeCognitiveGapsResult(value: unknown): DetectCognitiveGapsResult {
  const result = isRecord(value) ? value : {};
  return {
    hasGaps: typeof result.hasGaps === 'boolean' ? result.hasGaps : true,
    gaps: Array.isArray(result.gaps) ? result.gaps.map(toCognitiveGap) : [],
    overallAssessment: asString(result.overallAssessment, 'Unable to complete the assessment.'),
  };
}

// ========== SOCRATIC DIALOGUE ==========

const SOCRATIC_SYSTEM_PROMPT = `You are a Socratic tutor for middle-school learners.
Do not directly give final answers. Guide the student with questions, cognitive conflict, and short feedback.

Return strict JSON:
{
  "tutorReply": "natural reply to the student, preferably Chinese",
  "questions": ["follow-up question 1", "follow-up question 2"],
  "insights": ["brief observation about the student's understanding"],
  "suggestedAction": "continue | move_on | review_basics | challenge | summarize",
  "understandingLevel": "confused | superficial | developing | proficient | mastered"
}`;

export async function socraticDialogue(
  params: SocraticDialogueParams,
): Promise<SocraticDialogueResult> {
  const { studentMessage, knowledgeNodeTitle, knowledgeNodeSummary, subject, history } = params;
  const conversationContext = history.length > 0
    ? history.map((m) => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content}`).join('\n\n')
    : '(no prior history)';

  const userPrompt = `Current knowledge node:
Title: ${knowledgeNodeTitle}
Summary: ${knowledgeNodeSummary}
Subject: ${subject}

Conversation history:
${conversationContext}

Student message:
${studentMessage}`;

  const result = await llmCall({
    messages: [
      { role: 'system', content: SOCRATIC_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    maxTokens: 2048,
    jsonMode: true,
  });

  return normalizeSocraticDialogueResult(parseJsonObject(result));
}

// ========== ICAP LEVEL ASSESSMENT ==========

const ICAP_ASSESS_SYSTEM_PROMPT = `You are a learning assessment expert using the ICAP framework.
Choose the best starting level from Passive, Active, Constructive, Interactive based on the node,
mastery level, and prior question performance.

Return strict JSON:
{
  "recommendedLevel": "Passive | Active | Constructive | Interactive",
  "reasoning": "short reasoning, preferably Chinese",
  "prerequisiteGaps": ["missing prerequisite if any"]
}`;

export async function assessIcapLevel(
  nodeTitle: string,
  nodeSummary: string,
  masteryLevel: number,
  priorQuestions: Array<{ stem: string; answer: string; isCorrect: boolean }>,
): Promise<AssessIcapLevelResult> {
  const correctCount = priorQuestions.filter((q) => q.isCorrect).length;
  const totalCount = priorQuestions.length;
  const accuracy = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : null;

  const questionsSummary =
    totalCount > 0
      ? priorQuestions
          .map(
            (q, i) =>
              `${i + 1}. Question: ${q.stem}\n   Correct answer: ${q.answer}\n   Student correct: ${q.isCorrect ? 'yes' : 'no'}`,
          )
          .join('\n')
      : '(No prerequisite question history)';

  const userPrompt = `Knowledge node:
Title: ${nodeTitle}
Summary: ${nodeSummary}

Student data:
Mastery: ${masteryLevel}/100
Prior accuracy: ${accuracy !== null ? `${accuracy}% (${correctCount}/${totalCount})` : 'no data'}

Prior questions:
${questionsSummary}`;

  const result = await llmCall({
    messages: [
      { role: 'system', content: ICAP_ASSESS_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    maxTokens: 1024,
    jsonMode: true,
  });

  return normalizeAssessIcapLevelResult(parseJsonObject(result));
}

// ========== COGNITIVE GAP DETECTION ==========

const GAP_DETECTION_SYSTEM_PROMPT = `You are a cognitive diagnosis expert.
Identify missing concepts, superficial understanding, inability to transfer, or misconceptions.

Return strict JSON:
{
  "hasGaps": true,
  "gaps": [
    {
      "category": "missing_concept | superficial_understanding | inability_to_transfer | misconception",
      "description": "specific gap description, preferably Chinese",
      "suggestion": "actionable improvement suggestion, preferably Chinese"
    }
  ],
  "overallAssessment": "overall assessment, preferably Chinese"
}`;

export async function detectCognitiveGaps(
  studentExplanation: string,
  nodeTitle: string,
  nodeSummary: string,
): Promise<DetectCognitiveGapsResult> {
  const userPrompt = `Knowledge node:
Title: ${nodeTitle}
Reference summary: ${nodeSummary}

Student explanation:
${studentExplanation}`;

  const result = await llmCall({
    messages: [
      { role: 'system', content: GAP_DETECTION_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    maxTokens: 2048,
    jsonMode: true,
  });

  return normalizeCognitiveGapsResult(parseJsonObject(result));
}
