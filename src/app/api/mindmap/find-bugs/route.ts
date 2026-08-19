import crypto from 'crypto';
import { getErrorMessage } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { RELATION_LABELS, type RelationType } from '@/types';

/**
 * POST /api/mindmap/find-bugs — 图谱找茬（纠错式概念图任务）
 *
 * 学习科学依据：纠错式概念图（给学生一张含错误的图让其改错）在阅读理解
 * 和摘要两项指标上都优于看图和挖空（Chang, Sung & Chen, 2002）。这里把
 * 章节局部关系网注入扰动（错关系类型/方向反转/多余边），让学生逐条裁决。
 *
 * action=create: { chapterId, bugCount? } → { nodes, edges, bugCount, token }
 * action=grade:  { token, answers: [{edgeId, verdict, correctedRelationType?}] } → 评分与揭晓
 *
 * 答案不落库：token 用 HMAC 签名（含过期时间），学生改不了 payload。
 * verdict: 'ok' | 'wrongType' | 'flipped' | 'spurious'
 */

type BugKind = 'wrongType' | 'flipped' | 'spurious';

interface BugRecord {
  edgeId: string;
  kind: BugKind;
  // wrongType：正确的关系类型
  correctRelationType?: string;
  // flipped：正确的方向
  correctFromId?: string;
  correctToId?: string;
}

interface TokenPayload {
  bugs: BugRecord[];
  exp: number;
}

// 学生可判别的关系类型（schema_member 是系统内部边，不参与游戏）
const PLAYABLE_TYPES: RelationType[] = [
  'contains', 'prerequisite', 'cause', 'compare', 'formula', 'experiment', 'mistake', 'questionType',
];

const TASK_NODE_LIMIT = 14;
const TOKEN_TTL_SECONDS = 30 * 60;

// --- 答案令牌签名（复用 JWT_SECRET_KEY，与 server-auth 同源的轻量 HMAC） ---

function getSecret(): string {
  // 生产 fail-closed，与 server-auth.ts 一致；否则公开 dev secret 可伪造答案 token
  if (process.env.JWT_SECRET_KEY) return process.env.JWT_SECRET_KEY;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET_KEY environment variable is required in production');
  }
  return 'mindreview-dev-secret-change-me';
}

function base64UrlEncode(data: Buffer | string): string {
  const buf = typeof data === 'string' ? Buffer.from(data) : data;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function signPayload(payload: TokenPayload): string {
  const body = base64UrlEncode(JSON.stringify(payload));
  const sig = base64UrlEncode(crypto.createHmac('sha256', getSecret()).update(`findbugs.${body}`).digest());
  return `${body}.${sig}`;
}

function verifyToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const expected = crypto.createHmac('sha256', getSecret()).update(`findbugs.${parts[0]}`).digest();
  const actual = base64UrlDecode(parts[1]);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(parts[0]).toString('utf8')) as TokenPayload;
    if (!Array.isArray(payload.bugs) || typeof payload.exp !== 'number') return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickDifferentType(current: string): RelationType {
  const candidates = PLAYABLE_TYPES.filter((t) => t !== current);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export async function POST(req: NextRequest) {
  try {
    await resolveUserIdFromRequest(req);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: '请求体必须是 JSON 对象' }, { status: 400 });
    }
    const action = typeof body.action === 'string' ? body.action : '';

    if (action === 'create') return await createTask(body);
    if (action === 'grade') return await gradeTask(body);
    return NextResponse.json({ error: 'action 必须是 create 或 grade' }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

async function createTask(body: { chapterId?: unknown; bugCount?: unknown }) {
  const chapterId = typeof body.chapterId === 'string' ? body.chapterId.trim() : '';
  if (!chapterId) {
    return NextResponse.json({ error: 'chapterId 必填' }, { status: 400 });
  }
  const requestedBugs = typeof body.bugCount === 'number' && body.bugCount >= 1 ? Math.floor(body.bugCount) : 3;

  const nodes = await prisma.knowledgeNode.findMany({
    where: {
      chapterId,
      OR: [{ representationType: null }, { representationType: { not: 'schema' } }],
    },
    select: { id: true, title: true },
    orderBy: { createdAt: 'asc' },
    take: TASK_NODE_LIMIT,
  });
  const nodeIds = new Set(nodes.map((n) => n.id));

  const edges = await prisma.knowledgeEdge.findMany({
    where: {
      fromId: { in: [...nodeIds] },
      toId: { in: [...nodeIds] },
      relationType: { not: 'schema_member' },
    },
    select: { id: true, fromId: true, toId: true, relationType: true },
  });

  if (edges.length < 5) {
    return NextResponse.json({ error: '这个章节的关系太少（少于5条），换一章试试' }, { status: 400 });
  }

  const bugCount = Math.max(1, Math.min(requestedBugs, Math.floor(edges.length / 2)));
  const bugEdges = shuffle(edges).slice(0, bugCount);

  const bugs: BugRecord[] = [];
  const displayEdges: Array<{ id: string; fromId: string; toId: string; relationType: string }> = [];
  const bugEdgeIds = new Set(bugEdges.map((e) => e.id));

  // 40% 概率把其中一个 bug 换成"多余边"（如果找得到无连接的节点对）
  const useSpurious = Math.random() < 0.4;
  let spuriousDone = false;

  for (let i = 0; i < bugEdges.length; i += 1) {
    const edge = bugEdges[i];

    if (useSpurious && !spuriousDone && i === bugEdges.length - 1) {
      // 把最后一个 bug 改为多余边：找一对双向都无边、也不在其他 bug 里的节点
      const cleanEdges = edges.filter((e) => !bugEdgeIds.has(e.id));
      const connected = new Set<string>();
      for (const e of edges) {
        connected.add(`${e.fromId}|${e.toId}`);
        connected.add(`${e.toId}|${e.fromId}`);
      }
      const candidates: Array<[string, string]> = [];
      const nodeIdList = [...nodeIds];
      for (const a of nodeIdList) {
        for (const b of nodeIdList) {
          if (a !== b && !connected.has(`${a}|${b}`)) candidates.push([a, b]);
        }
      }
      if (candidates.length > 0 && cleanEdges.length >= 2) {
        const [fromId, toId] = candidates[Math.floor(Math.random() * candidates.length)];
        const fakeId = `spur_${edge.id}`;
        bugs.push({ edgeId: fakeId, kind: 'spurious' });
        displayEdges.push({ id: fakeId, fromId, toId, relationType: pickDifferentType('schema_member') });
        // 被替换掉的原始 bug 边退回为干净边
        cleanEdges.push(edge);
        spuriousDone = true;
        // 其余干净边稍后统一加入
        for (const c of cleanEdges) {
          if (!displayEdges.some((d) => d.id === c.id)) displayEdges.push(c);
        }
        continue;
      }
    }

    const kind: BugKind = Math.random() < 0.5 ? 'wrongType' : 'flipped';
    if (kind === 'wrongType') {
      const wrongType = pickDifferentType(edge.relationType);
      bugs.push({ edgeId: edge.id, kind, correctRelationType: edge.relationType });
      displayEdges.push({ id: edge.id, fromId: edge.fromId, toId: edge.toId, relationType: wrongType });
    } else {
      bugs.push({ edgeId: edge.id, kind, correctFromId: edge.fromId, correctToId: edge.toId });
      displayEdges.push({ id: edge.id, fromId: edge.toId, toId: edge.fromId, relationType: edge.relationType });
    }
  }

  // 没被动过的边原样加入
  for (const e of edges) {
    if (!bugEdgeIds.has(e.id) && !displayEdges.some((d) => d.id === e.id)) {
      displayEdges.push(e);
    }
  }

  const token = signPayload({
    bugs,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  });

  return NextResponse.json({
    nodes: nodes.map((n) => ({ id: n.id, title: n.title })),
    edges: shuffle(displayEdges),
    bugCount: bugs.length,
    edgeCount: displayEdges.length,
    token,
  });
}

interface GradeAnswer {
  edgeId?: unknown;
  verdict?: unknown;
  correctedRelationType?: unknown;
}

async function gradeTask(body: { token?: unknown; answers?: unknown }) {
  const token = typeof body.token === 'string' ? body.token : '';
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    return NextResponse.json({ error: '任务已过期或无效，请重新开始一局' }, { status: 400 });
  }

  const answers: GradeAnswer[] = Array.isArray(body.answers) ? body.answers : [];
  const answerByEdgeId = new Map<string, { verdict: string; correctedRelationType: string }>();
  for (const a of answers) {
    if (typeof a?.edgeId !== 'string') continue;
    answerByEdgeId.set(a.edgeId, {
      verdict: typeof a.verdict === 'string' ? a.verdict : 'ok',
      correctedRelationType: typeof a.correctedRelationType === 'string' ? a.correctedRelationType : '',
    });
  }

  // 揭晓需要节点标题
  const endpointIds = new Set<string>();
  for (const bug of payload.bugs) {
    if (bug.correctFromId) endpointIds.add(bug.correctFromId);
    if (bug.correctToId) endpointIds.add(bug.correctToId);
  }
  const titleRows = endpointIds.size
    ? await prisma.knowledgeNode.findMany({ where: { id: { in: [...endpointIds] } }, select: { id: true, title: true } })
    : [];
  const titleById = new Map(titleRows.map((r) => [r.id, r.title]));

  const bugEdgeIds = new Set(payload.bugs.map((b) => b.edgeId));
  let score = 0;
  const details = payload.bugs.map((bug) => {
    const answer = answerByEdgeId.get(bug.edgeId);
    const verdict = answer?.verdict ?? 'ok';
    const found = verdict !== 'ok';
    let exact = false;
    let explanation = '';

    if (bug.kind === 'wrongType') {
      exact = found && verdict === 'wrongType' && answer?.correctedRelationType === bug.correctRelationType;
      const correctLabel = RELATION_LABELS[(bug.correctRelationType ?? 'prerequisite') as RelationType] ?? bug.correctRelationType;
      explanation = `关系类型被改过，正确的是「${correctLabel}」`;
    } else if (bug.kind === 'flipped') {
      exact = found && verdict === 'flipped';
      const fromTitle = titleById.get(bug.correctFromId ?? '') ?? '?';
      const toTitle = titleById.get(bug.correctToId ?? '') ?? '?';
      explanation = `方向被反转了，正确方向是「${fromTitle} → ${toTitle}」`;
    } else {
      exact = found && verdict === 'spurious';
      explanation = '这条边本来就不存在，两个知识点之间没有这种直接关系';
    }

    if (found) score += exact ? 2 : 1;

    return { edgeId: bug.edgeId, kind: bug.kind, found, exact, explanation };
  });

  // 误报：把干净边标记为有错，每条扣 1 分
  let falsePositives = 0;
  for (const [edgeId, answer] of answerByEdgeId) {
    if (answer.verdict !== 'ok' && !bugEdgeIds.has(edgeId)) falsePositives += 1;
  }
  score = Math.max(0, score - falsePositives);

  const maxScore = payload.bugs.length * 2;
  return NextResponse.json({
    score,
    maxScore,
    falsePositives,
    foundAll: details.every((d) => d.found),
    details,
  });
}
