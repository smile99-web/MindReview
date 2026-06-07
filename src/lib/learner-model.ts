// ---------------------------------------------------------------------------
// Learner Profile Model
//
// Aggregates data from existing DB tables (KnowledgeNode, ReviewLog, MistakeLog)
// to build a cognitive profile for each learner. No new DB tables required.
// ---------------------------------------------------------------------------

import type { PrismaClient } from '@prisma/client';
import { loadProgressByNodeId } from '@/lib/user-knowledge-progress';

type ReviewDelta = { masteryBefore: number | null; masteryAfter: number | null };
type SessionDuration = { durationSeconds: number | null };
type MistakeAggregate = { knowledgeNodeId: string | null };
type PriorKnowledgeNode = { id: string; title: string; masteryLevel: number };
type MasteryOverlayNode = { id: string; masteryLevel: number };

async function withUserMastery<T extends MasteryOverlayNode>(
  userId: string,
  nodes: T[],
  prisma: PrismaClient,
): Promise<T[]> {
  const progressByNodeId = await loadProgressByNodeId(
    userId,
    nodes.map((node) => node.id),
    prisma,
  );

  return nodes.map((node) => ({
    ...node,
    masteryLevel: progressByNodeId.get(node.id)?.masteryLevel ?? node.masteryLevel,
  }));
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface LearnerProfile {
  cognitivePreferences: CognitivePreferences;
  strengthAreas: string[];
  weaknessAreas: string[];
  learningVelocity: number;
  mistakePatterns: MistakePatterns;
  attentionProfile: AttentionProfile;
  knowledgeGraphStats: KnowledgeGraphStats;
  icapDistribution: Record<string, number>;
  masteryDistribution: { low: number; medium: number; high: number };
  recommendedNextSteps: string[];
}

export interface CognitivePreferences {
  preferredIcapLevel: string;
  optimalBatchSize: number;
  optimalDifficulty: number;
  prefersVisual: boolean;
  prefersTextual: boolean;
  prefersInteractive: boolean;
}

export interface MistakePatterns {
  conceptual: number;
  calculation: number;
  careless: number;
  application: number;
}

export interface AttentionProfile {
  avgSessionMinutes: number;
  optimalSessionMinutes: number;
  breakFrequency: number;
  totalSessions: number;
}

export interface KnowledgeGraphStats {
  totalNodes: number;
  masteredNodes: number;
  averageMastery: number;
  schemaCount: number;
}

// ── Core Builder ───────────────────────────────────────────────────────────

export async function buildLearnerProfile(
  userId: string,
  prisma: PrismaClient,
): Promise<LearnerProfile> {
  const [
    // Knowledge nodes aggregated
    allKnowledgeNodes,
    userProgressRows,
    icapCounts,
    representationCounts,
    schemaCount,

    // Review logs
    reviewLogs,
    sessionDurations,
    reviewedToday,

    // Mistake logs
    mistakeCounts,
    subjectMistakeCounts,
  ] = await Promise.all([
    prisma.knowledgeNode.findMany({
      select: {
        id: true,
        masteryLevel: true,
        difficulty: true,
        subject: { select: { name: true } },
      },
    }),
    prisma.userKnowledgeProgress.findMany({
      where: { userId },
      select: {
        knowledgeNodeId: true,
        masteryLevel: true,
      },
    }),
    prisma.knowledgeNode.groupBy({
      by: ['icapLevel'],
      _count: { id: true },
    }),
    prisma.knowledgeNode.groupBy({
      by: ['representationType'],
      _count: { id: true },
      where: { representationType: { not: null } },
    }),
    prisma.knowledgeEdge.count(),

    // ReviewLog data – last 50 sessions for velocity
    prisma.reviewLog.findMany({
      where: { userId },
      select: {
        masteryBefore: true,
        masteryAfter: true,
        durationSeconds: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),

    // Session durations for attention profile
    prisma.reviewLog.findMany({
      where: {
        userId,
        durationSeconds: { not: null },
      },
      select: { durationSeconds: true },
      take: 200,
    }),

    // Reviewed today count (freshness)
    prisma.reviewLog.count({
      where: {
        userId,
        action: { in: ['reviewed', 'solved', 'mastered'] },
        createdAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
    }),

    // MistakeLog type distribution
    prisma.mistakeLog.groupBy({
      by: ['mistakeType'],
      _count: { id: true },
      where: { userId },
    }),

    // Subject-level mistake counts (for weakness detection)
    prisma.mistakeLog.findMany({
      where: { userId },
      select: {
        knowledgeNode: {
          select: { subject: { select: { name: true } } },
        },
      },
      take: 500,
    }),
  ]);

  // ── Knowledge Graph Stats ──────────────────────────────────────────────
  const progressMasteryByNodeId = new Map(
    userProgressRows.map((row) => [row.knowledgeNodeId, row.masteryLevel]),
  );
  const masteryNodes = allKnowledgeNodes.map((node) => ({
    ...node,
    masteryLevel: progressMasteryByNodeId.get(node.id) ?? node.masteryLevel,
  }));
  const totalNodes = masteryNodes.length;
  const averageMastery =
    totalNodes > 0
      ? Math.round(masteryNodes.reduce((sum, node) => sum + node.masteryLevel, 0) / totalNodes)
      : 0;
  const lowMastery = masteryNodes.filter((node) => node.masteryLevel < 34).length;
  const mediumMastery = masteryNodes.filter((node) => node.masteryLevel >= 34 && node.masteryLevel < 67).length;
  const highMastery = masteryNodes.filter((node) => node.masteryLevel >= 67).length;
  const masteredNodes = highMastery + mediumMastery;

  // ── ICAP Distribution ──────────────────────────────────────────────────
  const icapDistribution: Record<string, number> = {};
  let dominantIcap = 'Active';
  let dominantIcapCount = 0;
  for (const row of icapCounts) {
    icapDistribution[row.icapLevel] = row._count.id;
    if (row._count.id > dominantIcapCount) {
      dominantIcap = row.icapLevel;
      dominantIcapCount = row._count.id;
    }
  }

  // ── Representation Preferences ─────────────────────────────────────────
  let visualCount = 0;
  let textualCount = 0;
  let interactiveCount = 0;
  for (const row of representationCounts) {
    const rt = row.representationType ?? '';
    const c = row._count.id;
    if (['image', 'diagram', 'mindmap', 'timeline', 'force', 'reaction', 'formula'].includes(rt)) {
      visualCount += c;
    } else if (['text', 'step', 'template', 'keyword', 'viewpoint', 'causal'].includes(rt)) {
      textualCount += c;
    } else if (['experiment', 'concept', 'questionType'].includes(rt)) {
      interactiveCount += c;
    }
  }

  // ── Subject Strength / Weakness ────────────────────────────────────────
  const subjectMistakeCount: Record<string, number> = {};
  for (const ml of subjectMistakeCounts) {
    const name = ml.knowledgeNode?.subject?.name;
    if (name) {
      subjectMistakeCount[name] = (subjectMistakeCount[name] || 0) + 1;
    }
  }

  const strengthAreas: string[] = [];
  const weaknessAreas: string[] = [];
  const masteryBySubject = new Map<string, number[]>();
  for (const node of masteryNodes) {
    const subjectName = node.subject?.name;
    if (!subjectName) continue;
    const values = masteryBySubject.get(subjectName) ?? [];
    values.push(node.masteryLevel);
    masteryBySubject.set(subjectName, values);
  }

  for (const [subjectName, values] of masteryBySubject) {
    if (values.length === 0) continue;
    const avgM = values.reduce((sum, mastery) => sum + mastery, 0) / values.length;
    const mistakeRatio = (subjectMistakeCount[subjectName] || 0) / values.length;
    if (avgM > 75) {
      strengthAreas.push(subjectName);
    }
    if (avgM < 40 || mistakeRatio > 0.5) {
      weaknessAreas.push(subjectName);
    }
  }

  // ── Learning Velocity ──────────────────────────────────────────────────
  const sessionsWithDelta = reviewLogs.filter(
    (r: ReviewDelta) =>
      r.masteryBefore !== null &&
      r.masteryAfter !== null &&
      r.masteryAfter - r.masteryBefore !== 0,
  );
  const learningVelocity =
    sessionsWithDelta.length > 0
      ? Math.round(
          (sessionsWithDelta.reduce((sum: number, r: ReviewDelta) => sum + ((r.masteryAfter ?? 0) - (r.masteryBefore ?? 0)), 0) /
            sessionsWithDelta.length) *
            100,
        ) / 100
      : 0;

  // ── Mistake Patterns ───────────────────────────────────────────────────
  const mistakePatterns: MistakePatterns = { conceptual: 0, calculation: 0, careless: 0, application: 0 };
  for (const row of mistakeCounts) {
    const type = row.mistakeType as keyof MistakePatterns;
    if (type in mistakePatterns) {
      mistakePatterns[type] = row._count.id;
    }
  }

  // ── Attention Profile ──────────────────────────────────────────────────
  const durations = sessionDurations
    .map((d: SessionDuration) => d.durationSeconds)
    .filter((d: number | null): d is number => d !== null && d > 0);
  const avgSessionSeconds =
    durations.length > 0 ? durations.reduce((a: number, b: number) => a + b, 0) / durations.length : 0;
  const avgSessionMinutes = Math.round(avgSessionSeconds / 60);
  // Optimal is capped between 15-45 minutes
  const optimalSessionMinutes = Math.max(15, Math.min(45, Math.round(avgSessionMinutes * 1.15)));
  // Break every ~25 min
  const breakFrequency = avgSessionMinutes > 30 ? 2 : 1;

  // ── Cognitive Preferences ──────────────────────────────────────────────
  // Optimal difficulty: slightly above current mastery, clamped to 1-5
  const optimalDifficulty = Math.min(5, Math.max(1, Math.round((averageMastery / 100) * 5 + 0.5)));

  const cognitivePreferences: CognitivePreferences = {
    preferredIcapLevel: dominantIcap,
    optimalBatchSize: optimalSessionMinutes >= 30 ? (averageMastery > 60 ? 10 : 8) : (averageMastery > 60 ? 8 : 5),
    optimalDifficulty,
    prefersVisual: visualCount > textualCount,
    prefersTextual: textualCount >= visualCount,
    prefersInteractive: interactiveCount > Math.max(visualCount, textualCount) / 2,
  };

  // ── Recommended Next Steps ─────────────────────────────────────────────
  const recommendedNextSteps: string[] = [];
  if (weaknessAreas.length > 0) {
    recommendedNextSteps.push(`重点突破弱项: ${weaknessAreas.join('、')}`);
  }
  if (mistakePatterns.conceptual > mistakePatterns.calculation + mistakePatterns.careless) {
    recommendedNextSteps.push('建议加强概念理解，使用构建学习模式');
  }
  if (mistakePatterns.careless > 3) {
    recommendedNextSteps.push('粗心错误较多，建议减慢速度，增加自检步骤');
  }
  if (cognitivePreferences.prefersVisual) {
    recommendedNextSteps.push('尝试使用思维导图或图表辅助学习');
  }
  if (learningVelocity < 5 && sessionsWithDelta.length > 5) {
    recommendedNextSteps.push('学习速度偏慢，考虑降低难度或增加复习频率');
  }
  if (recommendedNextSteps.length === 0) {
    recommendedNextSteps.push('学习状态良好，保持当前节奏继续巩固');
  }

  return {
    cognitivePreferences,
    strengthAreas,
    weaknessAreas,
    learningVelocity,
    mistakePatterns,
    attentionProfile: {
      avgSessionMinutes,
      optimalSessionMinutes,
      breakFrequency,
      totalSessions: reviewedToday,
    },
    knowledgeGraphStats: {
      totalNodes,
      masteredNodes,
      averageMastery,
      schemaCount,
    },
    icapDistribution,
    masteryDistribution: { low: lowMastery, medium: mediumMastery, high: highMastery },
    recommendedNextSteps,
  };
}

// ── Actionable Steps ───────────────────────────────────────────────────────

export interface ActionableStep {
  id: string;
  type: 'review_weakness' | 'build_schema' | 'practice_icap' | 'start_path' | 'fix_mistakes';
  title: string;
  description: string;
  targetUrl: string;
  priority: number;
  nodeId?: string;
  subjectId?: string;
}

/**
 * Generate concrete, clickable action steps from a learner profile.
 * Queries the DB for low-mastery nodes, high-mistake nodes, and schema gaps,
 * then returns prioritized recommendations with target URLs.
 */
export async function generateActionableSteps(
  userId: string,
  profile: LearnerProfile,
  prisma: PrismaClient,
): Promise<ActionableStep[]> {
  const steps: ActionableStep[] = [];

  // ── 1. Review weakness areas: find low-mastery nodes ──────────────────
  if (profile.weaknessAreas.length > 0) {
    const weakSubjects = await prisma.subject.findMany({
      where: { name: { in: profile.weaknessAreas } },
      select: { id: true, name: true },
    });

    for (const subj of weakSubjects) {
      const candidateNodes = await prisma.knowledgeNode.findMany({
        where: { subjectId: subj.id },
        select: { id: true, title: true, masteryLevel: true },
        orderBy: { createdAt: 'asc' },
        take: 80,
      });
      const lowNodes = (await withUserMastery(userId, candidateNodes, prisma))
        .filter((node) => node.masteryLevel < 40)
        .sort((a, b) => a.masteryLevel - b.masteryLevel)
        .slice(0, 2);

      for (const node of lowNodes) {
        steps.push({
          id: `review_weakness_${node.id}`,
          type: 'review_weakness',
          title: `复习 "${node.title}"`,
          description: `${subj.name} 弱项，当前掌握度 ${node.masteryLevel}%`,
          targetUrl: `/review?nodeId=${node.id}`,
          priority: 1,
          nodeId: node.id,
          subjectId: subj.id,
        });
      }
    }
  }

  // ── 2. Fix mistakes: nodes with the most mistake logs for this user ──
  const mistakeAgg = await prisma.mistakeLog.groupBy({
    by: ['knowledgeNodeId'],
    _count: { id: true },
    where: { userId, knowledgeNodeId: { not: null } },
    orderBy: { _count: { id: 'desc' } },
    take: 5,
  });

  if (mistakeAgg.length > 0) {
    const nodeIds = mistakeAgg.map((m: MistakeAggregate) => m.knowledgeNodeId!).filter(Boolean);
    const mistakeNodes = await prisma.knowledgeNode.findMany({
      where: { id: { in: nodeIds } },
      select: { id: true, title: true, masteryLevel: true, subjectId: true, subject: { select: { name: true } } },
    });
    const nodes = await withUserMastery(userId, mistakeNodes, prisma);

    for (const node of nodes) {
      steps.push({
        id: `fix_mistakes_${node.id}`,
        type: 'fix_mistakes',
        title: `纠错 "${node.title}"`,
        description: '该知识点错误记录较多，建议针对性练习',
        targetUrl: `/review?nodeId=${node.id}&mode=standard`,
        priority: 2,
        nodeId: node.id,
        subjectId: node.subjectId,
      });
    }
  }

  // ── 3. Build schema: recommend mindmap for weakest subject ────────────
  if (profile.weaknessAreas.length > 0) {
    const weakSubj = await prisma.subject.findFirst({
      where: { name: { in: profile.weaknessAreas } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    if (weakSubj) {
      steps.push({
        id: `build_schema_${weakSubj.id}`,
        type: 'build_schema',
        title: `构建 "${weakSubj.name}" 知识框架`,
        description: '弱项学科需要先建立知识结构，使用思维导图梳理脉络',
        targetUrl: `/mindmap?subjectId=${weakSubj.id}`,
        priority: 1,
        subjectId: weakSubj.id,
      });
    }
  }

  // ── 4. Practice ICAP: lowest mastery nodes to exercise ─────────────────
  const lowMasteryCandidates = await prisma.knowledgeNode.findMany({
    select: {
      id: true, title: true, subjectId: true, icapLevel: true, masteryLevel: true,
      subject: { select: { name: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: 120,
  });
  const lowMasteryNodes = (await withUserMastery(userId, lowMasteryCandidates, prisma))
    .filter((node) => node.masteryLevel < 40)
    .sort((a, b) => a.masteryLevel - b.masteryLevel)
    .slice(0, 3);

  for (const node of lowMasteryNodes) {
    steps.push({
      id: `practice_icap_${node.id}`,
      type: 'practice_icap',
      title: `练习 "${node.title}"`,
      description: `低掌握度节点，从 ${node.icapLevel} 层级开始练习`,
      targetUrl: `/practice?nodeId=${node.id}&icapLevel=${node.icapLevel}`,
      priority: 3,
      nodeId: node.id,
      subjectId: node.subjectId,
    });
  }

  // ── 5. Start path: few mastered nodes → begin systematic learning ─────
  if (profile.knowledgeGraphStats.masteredNodes < profile.knowledgeGraphStats.totalNodes * 0.3) {
    const whereClause = profile.strengthAreas.length > 0
      ? { name: { in: profile.strengthAreas } }
      : {};
    const strengthSubj = await prisma.subject.findFirst({
      where: whereClause,
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    if (strengthSubj) {
      steps.push({
        id: `start_path_${strengthSubj.id}`,
        type: 'start_path',
        title: `开始 "${strengthSubj.name}" 学习路径`,
        description: '掌握率较低，建议从优势学科开始系统学习',
        targetUrl: `/subjects/${strengthSubj.id}`,
        priority: 4,
        subjectId: strengthSubj.id,
      });
    }
  }

  // Deduplicate (same type + same node/subject) and sort by priority
  const seen = new Set<string>();
  return steps
    .filter((s) => {
      const key = `${s.type}__${s.nodeId ?? ''}__${s.subjectId ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 8);
}

// ── Settings Recommender ──────────────────────────────────────────────────

export interface RecommendedSettings {
  suggestedMode: string;
  suggestedBatchSize: number;
  suggestedIcapStart: string;
  suggestedDifficulty: number;
}

export function recommendOptimalSettings(profile: LearnerProfile): RecommendedSettings {
  const { cognitivePreferences, attentionProfile, knowledgeGraphStats } = profile;

  // Mode selection based on average mastery
  let suggestedMode: string;
  if (knowledgeGraphStats.averageMastery > 75) {
    suggestedMode = 'challenge';
  } else if (knowledgeGraphStats.averageMastery > 40) {
    suggestedMode = 'standard';
  } else {
    suggestedMode = 'basic';
  }

  // Batch size based on attention profile
  let suggestedBatchSize: number;
  if (attentionProfile.avgSessionMinutes >= 30) {
    suggestedBatchSize = knowledgeGraphStats.averageMastery > 60 ? 10 : 8;
  } else {
    suggestedBatchSize = knowledgeGraphStats.averageMastery > 60 ? 8 : 5;
  }

  // ICAP start level based on preferred level and average mastery
  let suggestedIcapStart: string;
  if (cognitivePreferences.preferredIcapLevel === 'Interactive' && knowledgeGraphStats.averageMastery > 60) {
    suggestedIcapStart = 'Interactive';
  } else if (cognitivePreferences.preferredIcapLevel === 'Constructive' || knowledgeGraphStats.averageMastery > 40) {
    suggestedIcapStart = 'Constructive';
  } else if (knowledgeGraphStats.averageMastery > 20) {
    suggestedIcapStart = 'Active';
  } else {
    suggestedIcapStart = 'Passive';
  }

  const suggestedDifficulty = cognitivePreferences.optimalDifficulty;

  return {
    suggestedMode,
    suggestedBatchSize,
    suggestedIcapStart,
    suggestedDifficulty,
  };
}

// ── Onboarding Diagnostic ──────────────────────────────────────────────────

export interface OnboardingDiagnosticResult {
  score: number;                        // 0-100
  level: 'beginner' | 'intermediate' | 'advanced';
  strengths: string[];                  // 诊断中表现良好的概念/领域
  gaps: string[];                       // 诊断中暴露的知识缺口
  questionCount: number;
  recommendedStartingPoint: string;     // 建议从哪个章节/知识点开始
}

/**
 * 新用户预备知识快速诊断
 *
 * 当用户没有任何复习历史时，生成10道快速诊断题覆盖年级前置概念，
 * 评估其实际预备知识水平，避免从零开始浪费学习时间。
 *
 * @param userId - 用户ID
 * @param grade - 年级 (如 "初一", "初二")
 * @param subjectId - 学科ID
 * @param prisma - PrismaClient 实例
 */
export async function runOnboardingDiagnostic(
  userId: string,
  grade: string,
  subjectId: string,
  prisma: PrismaClient,
): Promise<OnboardingDiagnosticResult> {
  // 1. 获取该学科下所有知识点（按难度排序，优先提供基础概念）
  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { id: true, name: true },
  });

  if (!subject) {
    throw new Error(`Subject not found: ${subjectId}`);
  }

  // 2. 获取该年级的前置/基础知识点作为诊断候选
  const rawKnowledgeNodes = await prisma.knowledgeNode.findMany({
    where: {
      subjectId,
    },
    select: {
      id: true,
      title: true,
      summary: true,
      difficulty: true,
      prerequisites: true,
      keywords: true,
      masteryLevel: true,
    },
    orderBy: { difficulty: 'asc' },
    take: 30,
  });
  const knowledgeNodes = await withUserMastery(userId, rawKnowledgeNodes, prisma);

  if (knowledgeNodes.length === 0) {
    // 没有知识点则跳过诊断
    return {
      score: 0,
      level: 'beginner',
      strengths: [],
      gaps: [],
      questionCount: 0,
      recommendedStartingPoint: '',
    };
  }

  // 3. 生成 10 道诊断题 — 覆盖不同难度层级
  const diagnosticQuestions: DiagnosticQuestion[] = [];
  const selectedNodes: typeof knowledgeNodes = [];

  // 按难度分层抽样：低难度4题 + 中难度3题 + 高难度3题
  const easyNodes = knowledgeNodes.filter(n => n.difficulty <= 2);
  const midNodes = knowledgeNodes.filter(n => n.difficulty === 3);
  const hardNodes = knowledgeNodes.filter(n => n.difficulty >= 4);

  function pickRandom<T>(arr: T[], count: number): T[] {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  const picked = [
    ...pickRandom(easyNodes, Math.min(4, easyNodes.length)),
    ...pickRandom(midNodes, Math.min(3, midNodes.length)),
    ...pickRandom(hardNodes, Math.min(3, hardNodes.length)),
  ];

  // Pad to 10 if not enough
  const remaining = 10 - picked.length;
  if (remaining > 0) {
    const unpicked = knowledgeNodes.filter(n => !picked.some(p => p.id === n.id));
    picked.push(...pickRandom(unpicked, remaining));
  }

  // Build diagnostic questions from picked nodes
  for (const node of picked.slice(0, 10)) {
    diagnosticQuestions.push({
      nodeId: node.id,
      concept: node.title,
      difficulty: node.difficulty,
      question: generateDiagnosticQuestionText(node),
      passingMastery: node.difficulty <= 2 ? 30 : node.difficulty === 3 ? 50 : 65,
    });
    selectedNodes.push(node);
  }

  // 4. 基于已有掌握度计算结果（以现有 masteryLevel 作为"答题得分"的近似）
  //    在实际应用中，这些题应作为交互式问答；此处基于已存储的数据做近似评估
  let totalScore = 0;
  const strengths: string[] = [];
  const gaps: string[] = [];

  for (let i = 0; i < diagnosticQuestions.length; i++) {
    const q = diagnosticQuestions[i];
    const node = selectedNodes.find(n => n.id === q.nodeId);
    const mastery = node?.masteryLevel ?? 0;

    // 模拟诊断：masteryLevel 作为该题得分近似
    const questionScore = Math.min(100, Math.max(0, mastery));
    totalScore += questionScore;

    if (questionScore >= q.passingMastery) {
      strengths.push(q.concept);
    } else {
      gaps.push(q.concept);
    }
  }

  const avgScore = diagnosticQuestions.length > 0
    ? Math.round(totalScore / diagnosticQuestions.length)
    : 0;

  // 5. 评定等级
  let level: OnboardingDiagnosticResult['level'];
  if (avgScore >= 70) level = 'advanced';
  else if (avgScore >= 40) level = 'intermediate';
  else level = 'beginner';

  // 6. 推荐起点 — 从 gaps 中找最低难度节点
  const gapNodes = selectedNodes.filter(n => gaps.includes(n.title));
  const recommendedStart = gapNodes.length > 0
    ? gapNodes.sort((a, b) => a.difficulty - b.difficulty)[0]
    : selectedNodes[0];

  const recommendedStartingPoint = recommendedStart
    ? recommendedStart.title
    : '';

  // 7. 将诊断结果存入 ReviewLog（标记为 diagnostic 类型）
  await prisma.reviewLog.create({
    data: {
      userId,
      knowledgeNodeId: selectedNodes[0]?.id ?? 'unknown',
      action: 'diagnostic',
      masteryBefore: null,
      masteryAfter: avgScore,
      durationSeconds: null,
      quality: Math.round(avgScore / 20),  // 将 0-100 得分映射到 0-5 质量分
    },
  });

  return {
    score: avgScore,
    level,
    strengths,
    gaps,
    questionCount: diagnosticQuestions.length,
    recommendedStartingPoint,
  };
}

// ── Internal helpers ────────────────────────────────────────────────────────

interface DiagnosticQuestion {
  nodeId: string;
  concept: string;
  difficulty: number;
  question: string;
  passingMastery: number;
}

function generateDiagnosticQuestionText(node: {
  title: string;
  summary: string | null;
  difficulty: number;
  keywords: string[];
}): string {
  const keywordHint = node.keywords.length > 0
    ? node.keywords.slice(0, 3).join('、')
    : '';
  if (node.difficulty <= 2) {
    return `基础概念：请解释「${node.title}」的基本含义${keywordHint ? `（关键词: ${keywordHint}）` : ''}`;
  }
  if (node.difficulty === 3) {
    return `中等难度：请说明「${node.title}」的核心原理和应用场景`;
  }
  return `进阶挑战：「${node.title}」— 请推导或论证其关键结论`;
}

// ── Prior Knowledge Assessment ────────────────────────────────────────────

export interface PriorKnowledgeResult {
  hasPriorKnowledge: boolean;
  estimatedLevel: string;
  recommendedStartNode: string | null;
  existingMasteryNodes: { id: string; title: string; masteryLevel: number }[];
}

export async function assessPriorKnowledge(
  userId: string,
  subjectId: string,
  prisma: PrismaClient,
): Promise<PriorKnowledgeResult> {
  // Find all reviewed nodes in this subject
  const reviewedNodes = await prisma.knowledgeNode.findMany({
    where: {
      subjectId,
      reviewLogs: { some: { userId } },
    },
    select: {
      id: true,
      title: true,
      masteryLevel: true,
    },
    take: 20,
  });
  const nodesWithMastery = (await withUserMastery(userId, reviewedNodes, prisma))
    .sort((a, b) => b.masteryLevel - a.masteryLevel);

  const hasPriorKnowledge = nodesWithMastery.length > 0;

  let estimatedLevel = 'beginner';
  if (nodesWithMastery.length > 0) {
    const avg = nodesWithMastery.reduce((s: number, n: PriorKnowledgeNode) => s + n.masteryLevel, 0) / nodesWithMastery.length;
    if (avg > 75) estimatedLevel = 'advanced';
    else if (avg > 40) estimatedLevel = 'intermediate';
    else estimatedLevel = 'beginner';
  }

  // Recommended start: the lowest-mastery node among those already touched
  const lowestNode = nodesWithMastery.length > 0
    ? nodesWithMastery.reduce((min: PriorKnowledgeNode, n: PriorKnowledgeNode) => (n.masteryLevel < min.masteryLevel ? n : min))
    : null;

  return {
    hasPriorKnowledge,
    estimatedLevel,
    recommendedStartNode: lowestNode?.id ?? null,
    existingMasteryNodes: nodesWithMastery,
  };
}
