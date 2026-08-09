// ---------------------------------------------------------------------------
// 3D 思维导图（知识星空）— 确定性力导向布局（纯 TS，不依赖 three）
//
// 设计要点：
// - 同一批节点每次打开都得到相同的布局（种子随机，便于孩子形成空间记忆）
// - 章节是一团"星座"：章节锚点按黄金角螺旋排开，章节内节点受锚点引力聚拢
// - 知识关系边是弹簧：同章节边短、跨章节边长，让"知识网络"自然成形
// ---------------------------------------------------------------------------

export interface GalaxyLayoutNode {
  id: string;
  chapterKey: string;
  degree: number;
}

export interface GalaxyLayoutEdge {
  fromId: string;
  toId: string;
  sameChapter: boolean;
}

export interface GalaxyAnchor {
  key: string;
  x: number;
  y: number;
  z: number;
  /** 星座覆盖半径（画底盘光圈用） */
  radius: number;
}

export interface GalaxyLayoutResult {
  positions: Map<string, [number, number, number]>;
  anchors: GalaxyAnchor[];
  /** 布局包围半径（用于相机初始取景） */
  sceneRadius: number;
}

/** mulberry32 — 稳定可复现的伪随机数 */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function computeGalaxyLayout(
  nodes: GalaxyLayoutNode[],
  edges: GalaxyLayoutEdge[],
): GalaxyLayoutResult {
  const n = nodes.length;
  const positions = new Map<string, [number, number, number]>();
  if (n === 0) return { positions, anchors: [], sceneRadius: 6 };

  // ---- 1. 章节分组 -------------------------------------------------------
  const byChapter = new Map<string, GalaxyLayoutNode[]>();
  for (const node of nodes) {
    const list = byChapter.get(node.chapterKey);
    if (list) list.push(node);
    else byChapter.set(node.chapterKey, [node]);
  }
  const groupKeys = Array.from(byChapter.keys()).sort();
  const groups = groupKeys.map((key) => ({
    key,
    members: byChapter.get(key)!,
    radius: 1.8 + 1.5 * Math.sqrt(byChapter.get(key)!.length),
  }));
  const maxClusterR = groups.reduce((m, g) => Math.max(m, g.radius), 2);

  // ---- 2. 章节锚点（黄金角螺旋，铺开成星座群） --------------------------
  const anchors: GalaxyAnchor[] = [];
  const anchorByKey = new Map<string, GalaxyAnchor>();
  const spacing = maxClusterR * 2.4;
  groups.forEach((g, i) => {
    let x = 0;
    let z = 0;
    if (groups.length > 1) {
      const r = spacing * Math.sqrt(i + 0.6);
      const theta = i * 2.399963; // 黄金角
      x = Math.cos(theta) * r;
      z = Math.sin(theta) * r;
    }
    const anchor: GalaxyAnchor = { key: g.key, x, y: 0, z, radius: g.radius };
    anchors.push(anchor);
    anchorByKey.set(g.key, anchor);
  });

  // ---- 3. 初始位置（锚点周围的圆盘，种子由节点 id 决定） -----------------
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  const pz = new Float64Array(n);
  const vx = new Float64Array(n);
  const vy = new Float64Array(n);
  const vz = new Float64Array(n);
  const anchorX = new Float64Array(n);
  const anchorZ = new Float64Array(n);

  nodes.forEach((node, i) => {
    const anchor = anchorByKey.get(node.chapterKey)!;
    const rand = mulberry32(hashString(node.id));
    const angle = rand() * Math.PI * 2;
    const dist = Math.sqrt(rand()) * anchor.radius * 0.85;
    px[i] = anchor.x + Math.cos(angle) * dist;
    pz[i] = anchor.z + Math.sin(angle) * dist;
    py[i] = (rand() - 0.5) * 2.4;
    anchorX[i] = anchor.x;
    anchorZ[i] = anchor.z;
  });

  // ---- 4. 力导向迭代 ------------------------------------------------------
  const indexById = new Map<string, number>();
  nodes.forEach((node, i) => indexById.set(node.id, i));
  const springs = edges
    .map((e) => ({
      a: indexById.get(e.fromId),
      b: indexById.get(e.toId),
      ideal: e.sameChapter ? 2.6 : maxClusterR * 1.1 + 3.2,
    }))
    .filter((s): s is { a: number; b: number; ideal: number } => s.a !== undefined && s.b !== undefined && s.a !== s.b);

  const ticks = n <= 60 ? 240 : n <= 200 ? 190 : n <= 500 ? 140 : 100;
  const REPULSION = 1.5;
  const SPRING_K = 0.024;
  const GRAVITY_K = 0.02;
  const DAMPING = 0.82;
  const MAX_STEP = 0.65;

  for (let tick = 0; tick < ticks; tick++) {
    // 斥力（O(n²)，初始化时一次性跑完）
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = px[i] - px[j];
        let dy = py[i] - py[j];
        let dz = pz[i] - pz[j];
        const d2 = Math.max(dx * dx + dy * dy + dz * dz, 0.05);
        const d = Math.sqrt(d2);
        const f = Math.min(REPULSION / d2, 2.4) / d;
        dx *= f;
        dy *= f;
        dz *= f;
        vx[i] += dx; vy[i] += dy; vz[i] += dz;
        vx[j] -= dx; vy[j] -= dy; vz[j] -= dz;
      }
    }
    // 弹簧（知识关系边）
    for (const s of springs) {
      const dx = px[s.b] - px[s.a];
      const dy = py[s.b] - py[s.a];
      const dz = pz[s.b] - pz[s.a];
      const d = Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz), 0.05);
      const f = (d - s.ideal) * SPRING_K / d;
      const fx = dx * f;
      const fy = dy * f;
      const fz = dz * f;
      vx[s.a] += fx; vy[s.a] += fy; vz[s.a] += fz;
      vx[s.b] -= fx; vy[s.b] -= fy; vz[s.b] -= fz;
    }
    // 章节锚点引力 + 轻微压扁（保留一点纵深，转动时有层次）
    for (let i = 0; i < n; i++) {
      vx[i] += (anchorX[i] - px[i]) * GRAVITY_K;
      vz[i] += (anchorZ[i] - pz[i]) * GRAVITY_K;
      vy[i] += -py[i] * 0.012;
    }
    // 积分
    for (let i = 0; i < n; i++) {
      const step = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i] + vz[i] * vz[i]);
      const cap = step > MAX_STEP ? MAX_STEP / step : 1;
      px[i] += vx[i] * cap;
      py[i] += vy[i] * cap;
      pz[i] += vz[i] * cap;
      vx[i] *= DAMPING;
      vy[i] *= DAMPING;
      vz[i] *= DAMPING;
    }
  }

  // ---- 5. 汇总 ------------------------------------------------------------
  let maxDist = 4;
  nodes.forEach((node, i) => {
    positions.set(node.id, [px[i], py[i], pz[i]]);
    const d = Math.sqrt(px[i] * px[i] + py[i] * py[i] + pz[i] * pz[i]);
    if (d > maxDist) maxDist = d;
  });

  return { positions, anchors, sceneRadius: maxDist + maxClusterR * 0.6 };
}
