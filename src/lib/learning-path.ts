/**
 * Learning Path Engine
 *
 * Generates and adapts optimal learning sequences using topological sort on
 * KnowledgeEdge prerequisite chains. Respects difficulty ordering and mastery
 * levels to prioritize weaker nodes.
 */

import type { PrismaClient } from '@prisma/client';
import { resolveUserId } from '@/lib/user-context';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PathStep {
  nodeId: string;
  title: string;
  icapLevel: string;
  estimatedMinutes: number;
  masteryLevel: number;
  difficulty: number;
  summary: string | null;
}

export interface LearningPath {
  pathId: string;
  steps: PathStep[];
  totalSteps: number;
  totalEstimatedMinutes: number;
  subjectId: string;
  createdAt: string;
}

export interface PerformanceEntry {
  nodeId: string;
  accuracy: number; // 0-1
  quality: number;  // SM-2 quality 0-5
}

export interface AdaptedPath {
  adaptedPath: LearningPath;
  changes: PathChange[];
}

export interface PathChange {
  nodeId: string;
  changeType: 'level_up' | 'level_down' | 'insert_remedial' | 'reorder' | 'remove' | 'maintain';
  fromLevel?: string;
  toLevel?: string;
  reason: string;
}

export interface PrerequisiteCheck {
  canAccess: boolean;
  blockedBy: {
    nodeId: string;
    title: string;
    masteryLevel: number;
    requiredLevel: number;
  }[];
}

// ---------------------------------------------------------------------------
// Internal types for graph processing
// ---------------------------------------------------------------------------

interface NodeRecord {
  id: string;
  title: string;
  summary: string | null;
  difficulty: number;
  masteryLevel: number;
  icapLevel: string;
}

interface EdgeRecord {
  fromId: string;
  toId: string;
}

// ---------------------------------------------------------------------------
// ICAP level recommendation based on mastery
// ---------------------------------------------------------------------------

function recommendIcapLevel(masteryLevel: number): string {
  if (masteryLevel < 30) return 'Passive';
  if (masteryLevel < 55) return 'Active';
  if (masteryLevel < 80) return 'Constructive';
  return 'Interactive';
}

// ---------------------------------------------------------------------------
// Estimated study minutes based on difficulty and ICAP level
// ---------------------------------------------------------------------------

function estimateMinutes(difficulty: number, icapLevel: string): number {
  const baseMinutes: Record<string, number> = {
    Passive: 5,
    Active: 8,
    Constructive: 12,
    Interactive: 15,
  };

  const base = baseMinutes[icapLevel] || 8;
  const difficultyMultiplier = 0.6 + difficulty * 0.4; // 1→1.0, 5→2.6
  return Math.round(base * difficultyMultiplier);
}

// ---------------------------------------------------------------------------
// Topological sort with level grouping (Kahn's algorithm)
// ---------------------------------------------------------------------------

interface GraphNode {
  node: NodeRecord;
  indegree: number;
}

/**
 * Perform a topological sort on the DAG, returning nodes grouped by
 * topological level (longest-path distance from any source).
 *
 * Nodes at the same level have no direct prerequisite relationship and
 * are sorted internally by difficulty (asc) then mastery (asc).
 */
function topologicalSortByLevel(
  nodes: NodeRecord[],
  prerequisiteEdges: EdgeRecord[],
): NodeRecord[][] {
  if (nodes.length === 0) return [];

  const nodeMap = new Map<string, GraphNode>();
  const adj = new Map<string, string[]>();

  // Initialize
  for (const node of nodes) {
    nodeMap.set(node.id, { node, indegree: 0 });
    adj.set(node.id, []);
  }

  // Build adjacency and indegree from prerequisite edges
  for (const edge of prerequisiteEdges) {
    // Only count edges where both nodes are in our set
    if (nodeMap.has(edge.fromId) && nodeMap.has(edge.toId)) {
      adj.get(edge.fromId)!.push(edge.toId);
      nodeMap.get(edge.toId)!.indegree++;
    }
  }

  // Kahn's algorithm with level tracking (BFS waves)
  const levels: NodeRecord[][] = [];
  let queue: NodeRecord[] = [];

  // Start with all zero-indegree nodes
  for (const gn of nodeMap.values()) {
    if (gn.indegree === 0) {
      queue.push(gn.node);
    }
  }

  // If no zero-indegree nodes exist but we have nodes, there's a cycle.
  // Fall back to treating all nodes as having no prerequisites.
  if (queue.length === 0 && nodes.length > 0) {
    console.warn(
      '[learning-path] Cycle detected in prerequisite graph. Falling back to unordered sort.',
    );
    const sorted = [...nodes].sort((a, b) => {
      if (a.difficulty !== b.difficulty) return a.difficulty - b.difficulty;
      return a.masteryLevel - b.masteryLevel;
    });
    return [sorted];
  }

  let processed = 0;

  while (queue.length > 0) {
    // Sort current wave: difficulty ascending, then mastery ascending (weaker first)
    const sortedWave = [...queue].sort((a, b) => {
      if (a.difficulty !== b.difficulty) return a.difficulty - b.difficulty;
      return a.masteryLevel - b.masteryLevel;
    });

    levels.push(sortedWave);

    const nextWave: NodeRecord[] = [];

    for (const node of sortedWave) {
      processed++;
      for (const toId of adj.get(node.id) || []) {
        const gn = nodeMap.get(toId);
        if (gn) {
          gn.indegree--;
          if (gn.indegree === 0) {
            nextWave.push(gn.node);
          }
        }
      }
    }

    queue = nextWave;
  }

  // Handle any remaining nodes (part of cycles)
  if (processed < nodes.length) {
    console.warn(
      `[learning-path] ${nodes.length - processed} nodes in cycles, appending to end.`,
    );
    const remaining: NodeRecord[] = [];
    for (const gn of nodeMap.values()) {
      if (gn.indegree > 0) {
        remaining.push(gn.node);
      }
    }
    remaining.sort((a, b) => {
      if (a.difficulty !== b.difficulty) return a.difficulty - b.difficulty;
      return a.masteryLevel - b.masteryLevel;
    });
    levels.push(remaining);
  }

  return levels;
}

// ---------------------------------------------------------------------------
// Core: generatePath
// ---------------------------------------------------------------------------

/**
 * Generate an optimal learning path for a user within a subject.
 *
 * 1. Fetches all knowledge nodes for the subject and their prerequisite edges.
 * 2. Performs topological sort respecting prerequisite order.
 * 3. Within each topological level, sorts by difficulty (ascending) then
 *    mastery level (ascending -- weaker nodes first).
 * 4. Assigns appropriate ICAP levels based on current mastery.
 * 5. Limits to maxSteps (default 20).
 */
export async function generatePath(
  userId: string | null | undefined,
  subjectId: string,
  maxSteps: number = 20,
  prisma: PrismaClient,
): Promise<LearningPath> {
  // --- Resolve user ID ---
  const uid = await resolveUserId(userId);

  // --- Fetch all knowledge nodes for the subject ---
  const dbNodes = await prisma.knowledgeNode.findMany({
    where: { subjectId },
    select: {
      id: true,
      title: true,
      summary: true,
      difficulty: true,
      masteryLevel: true,
      icapLevel: true,
    },
  });

  if (dbNodes.length === 0) {
    return {
      pathId: `path-${uid}-${subjectId}-${Date.now()}`,
      steps: [],
      totalSteps: 0,
      totalEstimatedMinutes: 0,
      subjectId,
      createdAt: new Date().toISOString(),
    };
  }

  // --- Fetch prerequisite edges ---
  const dbEdges = await prisma.knowledgeEdge.findMany({
    where: {
      relationType: 'prerequisite',
      fromId: { in: dbNodes.map((n: NodeRecord) => n.id) },
      toId: { in: dbNodes.map((n: NodeRecord) => n.id) },
    },
    select: {
      fromId: true,
      toId: true,
    },
  });

  // --- Topological sort ---
  const levels = topologicalSortByLevel(dbNodes, dbEdges);

  // --- Flatten and assign ICAP levels ---
  const allSteps: PathStep[] = [];

  for (const level of levels) {
    for (const node of level) {
      const recommendedLevel = recommendIcapLevel(node.masteryLevel);

      allSteps.push({
        nodeId: node.id,
        title: node.title,
        icapLevel: recommendedLevel,
        estimatedMinutes: estimateMinutes(node.difficulty, recommendedLevel),
        masteryLevel: node.masteryLevel,
        difficulty: node.difficulty,
        summary: node.summary,
      });
    }
  }

  // --- Limit to maxSteps ---
  const limitedSteps = allSteps.slice(0, Math.max(1, maxSteps));

  // --- Compute totals ---
  const totalEstimatedMinutes = limitedSteps.reduce(
    (sum, s) => sum + s.estimatedMinutes,
    0,
  );

  return {
    pathId: `path-${uid}-${subjectId}-${Date.now()}`,
    steps: limitedSteps,
    totalSteps: limitedSteps.length,
    totalEstimatedMinutes,
    subjectId,
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Prerequisite gating
// ---------------------------------------------------------------------------

/**
 * Check whether a knowledge node is accessible given its prerequisites.
 *
 * Recursively traverses KnowledgeEdge records (relationType='prerequisite')
 * to find all transitive prerequisites. A node is accessible only if ALL
 * prerequisites have masteryLevel >= requiredLevel (default 60).
 *
 * Returns a PrerequisiteCheck with canAccess flag and the list of blocking
 * prerequisite nodes (if any).
 */
export async function checkPrerequisites(
  knowledgeNodeId: string,
  _userId: string | null | undefined,
  prisma: PrismaClient,
  requiredLevel: number = 60,
): Promise<PrerequisiteCheck> {
  // BFS to find all transitive prerequisites
  const visited = new Set<string>();
  const queue: string[] = [knowledgeNodeId];
  const allPrerequisites: { nodeId: string; title: string; masteryLevel: number }[] = [];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    // Find edges where current node is the target (depends on from-node)
    const edges = await prisma.knowledgeEdge.findMany({
      where: {
        relationType: 'prerequisite',
        toId: currentId,
      },
      select: {
        from: {
          select: { id: true, title: true, masteryLevel: true },
        },
      },
    });

    for (const edge of edges) {
      const fromId = edge.from.id;
      if (!visited.has(fromId)) {
        allPrerequisites.push({
          nodeId: fromId,
          title: edge.from.title,
          masteryLevel: edge.from.masteryLevel,
        });
        queue.push(fromId);
      }
    }
  }

  const blockedBy = allPrerequisites
    .filter(p => p.masteryLevel < requiredLevel)
    .map(p => ({ ...p, requiredLevel }));

  return {
    canAccess: blockedBy.length === 0,
    blockedBy,
  };
}

/**
 * Batch version of checkPrerequisites — takes an array of nodeIds and
 * returns a map of nodeId -> PrerequisiteCheck.
 *
 * Optimised: fetches all prerequisite edges in one query, then computes
 * transitive closure in-memory.
 */
export async function batchCheckPrerequisites(
  nodeIds: string[],
  _userId: string | null | undefined,
  prisma: PrismaClient,
  requiredLevel: number = 60,
): Promise<Record<string, PrerequisiteCheck>> {
  if (nodeIds.length === 0) return {};

  // Fetch all relevant edges in one query (all prerequisite edges)
  const allEdges = await prisma.knowledgeEdge.findMany({
    where: {
      relationType: 'prerequisite',
    },
    select: {
      fromId: true,
      toId: true,
      from: {
        select: { id: true, title: true, masteryLevel: true },
      },
    },
  });

  // Build adjacency map: toId -> [fromNodes]
  const prerequisiteOf = new Map<
    string,
    { nodeId: string; title: string; masteryLevel: number }[]
  >();
  for (const edge of allEdges) {
    if (!prerequisiteOf.has(edge.toId)) {
      prerequisiteOf.set(edge.toId, []);
    }
    prerequisiteOf.get(edge.toId)!.push({
      nodeId: edge.from.id,
      title: edge.from.title,
      masteryLevel: edge.from.masteryLevel,
    });
  }

  // Compute transitive prerequisites for a single node via BFS
  function getTransitivePrerequisites(
    nodeId: string,
  ): { nodeId: string; title: string; masteryLevel: number }[] {
    const visited = new Set<string>();
    const result: { nodeId: string; title: string; masteryLevel: number }[] = [];
    const queue = [nodeId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const prereqs = prerequisiteOf.get(current) || [];
      for (const prereq of prereqs) {
        if (!visited.has(prereq.nodeId)) {
          result.push(prereq);
          queue.push(prereq.nodeId);
        }
      }
    }

    return result;
  }

  // Evaluate each node
  const results: Record<string, PrerequisiteCheck> = {};
  for (const nodeId of nodeIds) {
    const allPrerequisites = getTransitivePrerequisites(nodeId);
    const blockedBy = allPrerequisites
      .filter(p => p.masteryLevel < requiredLevel)
      .map(p => ({ ...p, requiredLevel }));

    results[nodeId] = {
      canAccess: blockedBy.length === 0,
      blockedBy,
    };
  }

  return results;
}

// ---------------------------------------------------------------------------
// Core: adaptPath
// ---------------------------------------------------------------------------

const ICAP_ORDER = ['Passive', 'Active', 'Constructive', 'Interactive'];

/**
 * Adapt an existing learning path based on recent performance data.
 *
 * For each performance entry:
 * - If accuracy < 0.4 AND quality <= 2: decrease ICAP level (regress)
 * - If accuracy < 0.2: insert a remedial prerequisite node if available
 * - If accuracy >= 0.85 AND quality >= 4: increase ICAP level (advance)
 * - Otherwise: maintain current level
 *
 * Returns the adapted path along with a detailed change log.
 */
export async function adaptPath(
  currentPath: LearningPath,
  recentPerformance: PerformanceEntry[],
  prisma?: PrismaClient,
): Promise<AdaptedPath> {
  const changes: PathChange[] = [];
  const adaptedSteps: PathStep[] = [...currentPath.steps.map((s) => ({ ...s }))];

  // Build lookup for performance data
  const perfMap = new Map<string, PerformanceEntry>();
  for (const p of recentPerformance) {
    perfMap.set(p.nodeId, p);
  }

  for (let i = 0; i < adaptedSteps.length; i++) {
    const step = adaptedSteps[i];
    const perf = perfMap.get(step.nodeId);

    if (!perf) {
      // No performance data for this node -- maintain
      changes.push({
        nodeId: step.nodeId,
        changeType: 'maintain',
        fromLevel: step.icapLevel,
        toLevel: step.icapLevel,
        reason: '无该节点的表现数据，保持不变',
      });
      continue;
    }

    const currentIcapIndex = ICAP_ORDER.indexOf(step.icapLevel);

    // --- Regression: very poor performance ---
    if (perf.accuracy < 0.2) {
      const newIndex = Math.max(0, currentIcapIndex - 2);
      const newLevel = ICAP_ORDER[newIndex];
      const oldLevel = step.icapLevel;

      step.icapLevel = newLevel;
      step.estimatedMinutes = estimateMinutes(step.difficulty, newLevel);

      changes.push({
        nodeId: step.nodeId,
        changeType: 'level_down',
        fromLevel: oldLevel,
        toLevel: newLevel,
        reason: `正确率仅${Math.round(perf.accuracy * 100)}%，大幅降低难度`,
      });

      // Try to insert a remedial node (prerequisite) before this one
      if (prisma && i > 0) {
        try {
          const prereqEdges = await prisma.knowledgeEdge.findMany({
            where: {
              relationType: 'prerequisite',
              toId: step.nodeId,
            },
            select: {
              fromId: true,
              from: {
                select: {
                  id: true,
                  title: true,
                  summary: true,
                  difficulty: true,
                  masteryLevel: true,
                },
              },
            },
            take: 1,
          });

          if (prereqEdges.length > 0 && prereqEdges[0].from) {
            const prereq = prereqEdges[0].from;
            const remedialLevel = 'Passive';
            const remedialStep: PathStep = {
              nodeId: prereq.id,
              title: `[补充] ${prereq.title}`,
              icapLevel: remedialLevel,
              estimatedMinutes: estimateMinutes(prereq.difficulty, remedialLevel),
              masteryLevel: prereq.masteryLevel,
              difficulty: prereq.difficulty,
              summary: prereq.summary,
            };

            adaptedSteps.splice(i, 0, remedialStep);
            i++; // Skip the inserted node in iteration

            changes.push({
              nodeId: prereq.id,
              changeType: 'insert_remedial',
              fromLevel: undefined,
              toLevel: remedialLevel,
              reason: `因"${step.title}"表现不佳，插入前置知识点巩固基础`,
            });
          }
        } catch {
          // If the lookup fails, skip remedial insertion
        }
      }

      continue;
    }

    // --- Regression: poor performance ---
    if (perf.accuracy < 0.4 && perf.quality <= 2) {
      const newIndex = Math.max(0, currentIcapIndex - 1);
      const newLevel = ICAP_ORDER[newIndex];
      const oldLevel = step.icapLevel;

      step.icapLevel = newLevel;
      step.estimatedMinutes = estimateMinutes(step.difficulty, newLevel);

      changes.push({
        nodeId: step.nodeId,
        changeType: 'level_down',
        fromLevel: oldLevel,
        toLevel: newLevel,
        reason: `正确率${Math.round(perf.accuracy * 100)}%、质量${perf.quality}，建议降级`,
      });

      continue;
    }

    // --- Advancement: strong performance ---
    if (perf.accuracy >= 0.85 && perf.quality >= 4 && currentIcapIndex < ICAP_ORDER.length - 1) {
      const newIndex = currentIcapIndex + 1;
      const newLevel = ICAP_ORDER[newIndex];
      const oldLevel = step.icapLevel;

      step.icapLevel = newLevel;
      step.estimatedMinutes = estimateMinutes(step.difficulty, newLevel);

      changes.push({
        nodeId: step.nodeId,
        changeType: 'level_up',
        fromLevel: oldLevel,
        toLevel: newLevel,
        reason: `正确率${Math.round(perf.accuracy * 100)}%、质量${perf.quality}，表现优秀，晋级`,
      });

      continue;
    }

    // --- Maintenance ---
    changes.push({
      nodeId: step.nodeId,
      changeType: 'maintain',
      fromLevel: step.icapLevel,
      toLevel: step.icapLevel,
      reason: `正确率${Math.round(perf.accuracy * 100)}%、质量${perf.quality}，表现稳定，维持当前水平`,
    });
  }

  // Recompute totals for adapted path
  const totalEstimatedMinutes = adaptedSteps.reduce(
    (sum, s) => sum + s.estimatedMinutes,
    0,
  );

  const adaptedPath: LearningPath = {
    ...currentPath,
    pathId: `${currentPath.pathId}-adapted-${Date.now()}`,
    steps: adaptedSteps,
    totalSteps: adaptedSteps.length,
    totalEstimatedMinutes,
    createdAt: new Date().toISOString(),
  };

  return { adaptedPath, changes };
}
