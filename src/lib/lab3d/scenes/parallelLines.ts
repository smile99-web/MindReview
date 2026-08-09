// ---------------------------------------------------------------------------
// 数学 · 平行线的判定与性质：三线八角，同位角/内错角/同旁内角
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, cylinderBetween, disposeObject, makeLabel, std } from '../three-utils';

type Pair = 'corresponding' | 'alternate' | 'consecutive';

const HALF = 4.4; // 水平线半长
const GAP = 1.35; // 两水平线到中心距离
const SECTOR_R = 0.78;
const LINE_COL = '#1e40af';
const TRANS_COL = '#dc2626';
const PAIR_COLORS: Record<Pair, string> = {
  corresponding: '#2563eb',
  alternate: '#f97316',
  consecutive: '#22c55e',
};
// 每个交点的四个扇形名字（∠1~∠4 上交点，∠5~∠8 下交点）
const SEC_NAMES = ['∠1', '∠2', '∠3', '∠4', '∠5', '∠6', '∠7', '∠8'];
// 高亮角对：[上交点扇形号, 下交点扇形号]
const PAIR_SECTORS: Record<Pair, [number, number]> = {
  corresponding: [0, 4], // ∠1 与 ∠5（同位角）
  alternate: [2, 4], // ∠3 与 ∠5（内错角）
  consecutive: [3, 4], // ∠4 与 ∠5（同旁内角）
};

export const parallelLinesScene: Scene3DDefinition = {
  id: 'math-parallel',
  title: '平行线判定与性质',
  subject: '数学',
  grade: '7下',
  icon: '🛤️',
  tagline: '转动截线，看同位角、内错角、同旁内角的关系',
  keywords: ['平行线', '同位角', '内错角', '同旁内角', '平行线的判定', '平行线的性质', '截线'],
  camera: { position: [0, 3.6, 10], target: [0, 2.3, 0] },
  controls: [
    { kind: 'slider', id: 'theta', label: '截线角度', min: 30, max: 150, step: 1, defaultValue: 70, unit: '°' },
    {
      kind: 'select',
      id: 'pair',
      label: '高亮角对',
      options: [
        { value: 'corresponding', label: '同位角' },
        { value: 'alternate', label: '内错角' },
        { value: 'consecutive', label: '同旁内角' },
      ],
      defaultValue: 'corresponding',
    },
    { kind: 'button', id: 'toggle', label: '🔀 平行/不平行' },
  ],
  steps: [
    {
      title: '三线八角',
      text: '两条直线被第三条直线所截，一共形成八个角，叫做三线八角。这条斜穿的红色直线叫截线。先看看八个角分别在什么位置：上面交点是角一到角四，下面交点是角五到角八。',
    },
    {
      title: '同位角',
      text: '位置相同的一对角叫同位角，比如角一和角五，都在两条线的右上方。当同位角相等时，两条直线平行，这是判定平行最常用的方法。点一下切换按钮：线一歪，同位角立刻就不相等了。',
    },
    {
      title: '内错角与同旁内角',
      text: '夹在两条线之间、左右错开的一对角叫内错角，比如角三和角五，平行时它们相等。夹在两线之间、排在同一侧的一对角叫同旁内角，比如角四和角五，平行时它们互补，加起来是一百八十度。',
    },
    {
      title: '性质与判定互逆',
      text: '由角相等推出线平行，叫做判定；由线平行推出角相等，叫做性质。判定和性质是一对互逆的定理，条件和结论正好对调。做题时先想清楚：是已知角推平行，还是已知平行推角。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 14);
    let step = 0;
    let theta = 70;
    let dispTheta = 70;
    let pair: Pair = 'corresponding';
    let parallel = true;
    let dispBeta = 0; // 不平行时 l₂ 的倾斜角（度）
    let lastKey = '';

    const group = new THREE.Group();
    group.position.y = 2.4;
    ctx.scene.add(group);

    const setRod = (m: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3) => {
      const dir = new THREE.Vector3().subVectors(to, from);
      const len = dir.length();
      m.scale.y = len;
      m.position.copy(from).addScaledVector(dir, 0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    };

    // 两条水平线（l₁ 固定，l₂ 可倾斜）+ 截线
    const l1 = cylinderBetween(new THREE.Vector3(-HALF, GAP, 0), new THREE.Vector3(HALF, GAP, 0), 0.05, std(LINE_COL));
    const l2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 10), std(LINE_COL));
    const trans = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 1, 10),
      std(TRANS_COL, { emissive: '#b91c1c', emissiveIntensity: 0.3 }),
    );
    group.add(l1, l2, trans);
    const l1Tag = makeLabel('l₁', { fontSize: 36, scale: 0.8, color: LINE_COL });
    l1Tag.position.set(HALF + 0.4, GAP + 0.15, 0);
    const l2Tag = makeLabel('l₂', { fontSize: 36, scale: 0.8, color: LINE_COL });
    const tTag = makeLabel('截线 t', { fontSize: 34, scale: 0.78, color: TRANS_COL });
    group.add(l1Tag, l2Tag, tTag);

    // 两个交点
    const p1Mark = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), std('#0f172a'));
    const p2Mark = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), std('#0f172a'));
    group.add(p1Mark, p2Mark);

    // 八个扇形角区
    const sectors: THREE.Mesh[] = [];
    const sectorMats: THREE.MeshStandardMaterial[] = [];
    for (let k = 0; k < 8; k++) {
      const mat = std('#94a3b8', { transparent: true, opacity: 0.22, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(SECTOR_R, 20, 0, 1), mat);
      mesh.position.z = 0.02;
      group.add(mesh);
      sectors.push(mesh);
      sectorMats.push(mat);
    }
    // 步骤一的八角编号标签
    const idxLabels: THREE.Sprite[] = [];
    for (let k = 0; k < 8; k++) {
      const lab = makeLabel(SEC_NAMES[k], { fontSize: 30, scale: 0.68, color: '#475569' });
      lab.position.z = 0.12;
      group.add(lab);
      idxLabels.push(lab);
    }
    // 高亮角对的度数标签（两个）
    const degLabel1 = makeLabel('', { fontSize: 36, scale: 0.85 });
    const degLabel2 = makeLabel('', { fontSize: 36, scale: 0.85 });
    degLabel1.position.z = 0.15;
    degLabel2.position.z = 0.15;
    group.add(degLabel1, degLabel2);

    // 顶部结论牌
    const infoLabel = makeLabel('', { fontSize: 40, scale: 1.0 });
    infoLabel.position.set(0, 5.6, 0);
    ctx.scene.add(infoLabel);

    const setText = (
      sprite: THREE.Sprite,
      text: string,
      opts: { fontSize?: number; color?: string; scale?: number } = {},
    ) => {
      sprite.material.map?.dispose();
      sprite.material.dispose();
      const nl = makeLabel(text, opts);
      sprite.material = nl.material;
      sprite.scale.copy(nl.scale);
    };

    const rebuild = () => {
      const deg = Math.round(dispTheta);
      const beta = Math.round(dispBeta);
      const key = `${deg}|${beta}|${pair}|${step}|${parallel}`;
      if (key === lastKey) return;
      lastKey = key;
      const th = THREE.MathUtils.degToRad(deg);
      const be = THREE.MathUtils.degToRad(beta);
      const u = new THREE.Vector3(Math.cos(th), Math.sin(th), 0); // 截线方向
      const v = new THREE.Vector3(Math.cos(be), Math.sin(be), 0); // l₂ 方向

      // 交点：P1 在 y=GAP 上，P2 在过 (0,-GAP) 方向 v 的线上
      const s1 = GAP / Math.sin(th);
      const P1 = u.clone().multiplyScalar(s1);
      const s2 = -GAP / (Math.sin(th) - Math.cos(th) * Math.tan(be));
      const P2 = u.clone().multiplyScalar(s2);
      p1Mark.position.copy(P1);
      p2Mark.position.copy(P2);

      // 线位置
      setRod(l2, new THREE.Vector3(0, -GAP, 0).addScaledVector(v, -HALF), new THREE.Vector3(0, -GAP, 0).addScaledVector(v, HALF));
      setRod(trans, u.clone().multiplyScalar(-4.7), u.clone().multiplyScalar(4.7));
      l2Tag.position.set(v.x * (HALF + 0.4), -GAP + v.y * (HALF + 0.4), 0);
      tTag.position.set(u.x * 4.9, u.y * 4.9, 0);

      // 扇形角度区间（世界角）：P1 用 0 基准，P2 用 β 基准
      const mkRanges = (base: number): [number, number][] => [
        [base, th],
        [th, Math.PI + base - th],
        [Math.PI + base, th],
        [Math.PI + base + th, Math.PI - th],
      ];
      const r1 = mkRanges(0);
      const r2 = mkRanges(be);
      for (let k = 0; k < 8; k++) {
        const isTop = k < 4;
        const rg = isTop ? r1[k] : r2[k - 4];
        const P = isTop ? P1 : P2;
        sectors[k].geometry.dispose();
        sectors[k].geometry = new THREE.CircleGeometry(SECTOR_R, 20, rg[0], rg[1]);
        sectors[k].position.set(P.x, P.y, 0.02);
        const mid = rg[0] + rg[1] / 2;
        idxLabels[k].position.set(P.x + Math.cos(mid) * 1.25, P.y + Math.sin(mid) * 1.25, 0.12);
      }

      // 度数：P1 处为 θ / 180−θ；P2 处为 θ−β / 180−θ+β
      const degs1 = [deg, 180 - deg, deg, 180 - deg];
      const degs2 = [deg - beta, 180 - deg + beta, deg - beta, 180 - deg + beta];
      const allDegs = [...degs1, ...degs2];
      const [ha, hb] = PAIR_SECTORS[pair];
      const hot = new Set([ha, hb]);
      const col = PAIR_COLORS[pair];
      for (let k = 0; k < 8; k++) {
        const isHot = step >= 1 && hot.has(k);
        sectors[k].visible = step === 0 || isHot;
        sectorMats[k].color.set(isHot ? col : '#94a3b8');
        sectorMats[k].opacity = isHot ? 0.55 : 0.22;
        idxLabels[k].visible = step === 0;
      }
      // 度数标签贴在高亮角旁
      const labPos = (k: number) => {
        const isTop = k < 4;
        const rg = isTop ? r1[k] : r2[k - 4];
        const P = isTop ? P1 : P2;
        const mid = rg[0] + rg[1] / 2;
        return new THREE.Vector3(P.x + Math.cos(mid) * 1.55, P.y + Math.sin(mid) * 1.55, 0.15);
      };
      const showDeg = step >= 1;
      degLabel1.visible = showDeg;
      degLabel2.visible = showDeg;
      if (showDeg) {
        degLabel1.position.copy(labPos(ha));
        degLabel2.position.copy(labPos(hb));
        setText(degLabel1, `${SEC_NAMES[ha]} = ${allDegs[ha]}°`, { fontSize: 36, scale: 0.85, color: col });
        setText(degLabel2, `${SEC_NAMES[hb]} = ${allDegs[hb]}°`, { fontSize: 36, scale: 0.85, color: col });
      }

      // 结论牌
      if (step === 0) {
        setText(infoLabel, '两条直线被截线所截，形成八个角', { fontSize: 40, scale: 1.0, color: '#0f172a' });
      } else if (pair === 'consecutive') {
        const sum = allDegs[ha] + allDegs[hb];
        setText(
          infoLabel,
          parallel
            ? `同旁内角：${allDegs[ha]}° + ${allDegs[hb]}° = ${sum}°，互补 ✓`
            : `同旁内角：${allDegs[ha]}° + ${allDegs[hb]}° = ${sum}°，不互补 ✗`,
          { fontSize: 40, scale: 1.0, color: parallel ? '#15803d' : '#b45309' },
        );
      } else {
        const name = pair === 'corresponding' ? '同位角' : '内错角';
        setText(
          infoLabel,
          parallel
            ? `${name}：${allDegs[ha]}° = ${allDegs[hb]}°，相等 ✓`
            : `${name}：${allDegs[ha]}° ≠ ${allDegs[hb]}°，不平行 ✗`,
          { fontSize: 40, scale: 1.0, color: parallel ? '#15803d' : '#b45309' },
        );
      }
    };

    return {
      setStep(i) {
        step = i;
        if (i === 1) pair = 'corresponding';
        if (i === 2) pair = 'alternate';
        if (i === 3) pair = 'consecutive';
        rebuild();
      },
      setParam(id, value) {
        if (id === 'theta') theta = Number(value);
        if (id === 'pair') pair = String(value) as Pair;
        if (id === 'toggle') parallel = !parallel;
        rebuild();
      },
      update(dt, elapsed) {
        dispTheta = THREE.MathUtils.damp(dispTheta, theta, 5, dt);
        dispBeta = THREE.MathUtils.damp(dispBeta, parallel ? 0 : 8, 3.5, dt);
        rebuild();
        // 高亮角对脉冲
        if (step >= 1) {
          const [ha, hb] = PAIR_SECTORS[pair];
          const glow = 0.55 + 0.2 * Math.sin(elapsed * 4);
          sectorMats[ha].opacity = glow;
          sectorMats[hb].opacity = glow;
        }
      },
      dispose() {
        ctx.scene.remove(group, infoLabel);
        disposeObject(group);
        disposeObject(infoLabel);
      },
    };
  },
};
