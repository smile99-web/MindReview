// ---------------------------------------------------------------------------
// 化学 · 元素周期表：前 20 号格子墙 + 选中元素的迷你玻尔模型 + 周期/族规律
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, damp, disposeObject, makeLabel, std } from '../three-utils';

interface ElSpec {
  z: number;
  sym: string;
  name: string;
  row: number;
  col: number;
}
// 1~20 号：按真实主族列排布（第 1 周期 H 与 He 分居两端）
const ELEMENTS: ElSpec[] = [
  { z: 1, sym: 'H', name: '氢', row: 0, col: 0 },
  { z: 2, sym: 'He', name: '氦', row: 0, col: 7 },
  { z: 3, sym: 'Li', name: '锂', row: 1, col: 0 },
  { z: 4, sym: 'Be', name: '铍', row: 1, col: 1 },
  { z: 5, sym: 'B', name: '硼', row: 1, col: 2 },
  { z: 6, sym: 'C', name: '碳', row: 1, col: 3 },
  { z: 7, sym: 'N', name: '氮', row: 1, col: 4 },
  { z: 8, sym: 'O', name: '氧', row: 1, col: 5 },
  { z: 9, sym: 'F', name: '氟', row: 1, col: 6 },
  { z: 10, sym: 'Ne', name: '氖', row: 1, col: 7 },
  { z: 11, sym: 'Na', name: '钠', row: 2, col: 0 },
  { z: 12, sym: 'Mg', name: '镁', row: 2, col: 1 },
  { z: 13, sym: 'Al', name: '铝', row: 2, col: 2 },
  { z: 14, sym: 'Si', name: '硅', row: 2, col: 3 },
  { z: 15, sym: 'P', name: '磷', row: 2, col: 4 },
  { z: 16, sym: 'S', name: '硫', row: 2, col: 5 },
  { z: 17, sym: 'Cl', name: '氯', row: 2, col: 6 },
  { z: 18, sym: 'Ar', name: '氩', row: 2, col: 7 },
  { z: 19, sym: 'K', name: '钾', row: 3, col: 0 },
  { z: 20, sym: 'Ca', name: '钙', row: 3, col: 1 },
];
// 可选元素的电子层排布
const SHELLS: Record<string, number[]> = {
  H: [1],
  He: [2],
  C: [2, 4],
  N: [2, 5],
  O: [2, 6],
  Na: [2, 8, 1],
  Mg: [2, 8, 2],
  Cl: [2, 8, 7],
  Ca: [2, 8, 8],
};
const SHELL_R = [0.42, 0.68, 0.94, 1.2];
const CELL = 0.95;
const GRID_X0 = -0.8; // 格子墙整体左移，右侧留给原子模型
const GRID_Y0 = 4.2; // 第一行高度

interface Cell {
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  spec: ElSpec;
  glowTarget: number;
}
interface MiniAtom {
  group: THREE.Group;
  electrons: { mesh: THREE.Mesh; shell: number; phase: number }[];
}

export const periodicScene: Scene3DDefinition = {
  id: 'chem-periodic',
  title: '元素周期表',
  subject: '化学',
  grade: '9上',
  icon: '🧬',
  tagline: '横行叫周期、纵列叫族——排布规律藏在原子结构里',
  keywords: ['元素周期表', '元素', '周期', '族', '原子序数', '元素符号', '门捷列夫'],
  camera: { position: [5, 4.8, 10], target: [0.2, 2.6, 0] },
  controls: [
    {
      kind: 'select',
      id: 'el',
      label: '元素',
      options: [
        { value: 'H', label: '氢 H' },
        { value: 'He', label: '氦 He' },
        { value: 'C', label: '碳 C' },
        { value: 'N', label: '氮 N' },
        { value: 'O', label: '氧 O' },
        { value: 'Na', label: '钠 Na' },
        { value: 'Mg', label: '镁 Mg' },
        { value: 'Cl', label: '氯 Cl' },
        { value: 'Ca', label: '钙 Ca' },
      ],
      defaultValue: 'O',
    },
  ],
  steps: [
    {
      title: '门捷列夫',
      text: '一百多年前，俄国化学家门捷列夫把当时已知的元素按规律排成一张表，还大胆预言了几种未知元素，后来都应验了。这就是元素周期表。现在表中的元素按原子序数，也就是核电荷数，从小到大排列。',
    },
    {
      title: '原子序数',
      text: '每个格子里的数字是原子序数。记住这个等式：原子序数等于质子数，也等于核外电子数。比如氧是 8 号，它的原子核里就有 8 个质子，核外有 8 个电子。看右边的原子模型，数一数是不是。',
    },
    {
      title: '周期与族',
      text: '排布藏着规律：横着看，同一周期的元素电子层数相同；竖着看，同一族的元素最外层电子数相同，所以性质很像，比如锂、钠、钾都活泼得要保存在煤油里。点亮的橙色一行是周期，蓝绿色一列是族。',
    },
    {
      title: '背下前 20 号',
      text: '前二十号元素要按顺序背下来：氢氦锂铍硼，碳氮氧氟氖，钠镁铝硅磷，硫氯氩钾钙。五个一组，多读几遍就顺口了。看格子依次点亮的顺序，跟着默念一遍吧。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 14);
    let step = 0;
    let selSym = 'O';
    let waveT = 0; // 第 4 步依次点亮计时

    const group = new THREE.Group();
    ctx.scene.add(group);

    // ---------------- 格子墙 ----------------
    const cellGeo = new THREE.BoxGeometry(0.82, 0.82, 0.1);
    const cells: Cell[] = [];
    ELEMENTS.forEach((spec) => {
      const mat = std('#e2e8f0', { emissive: '#f59e0b', emissiveIntensity: 0 });
      const mesh = new THREE.Mesh(cellGeo, mat);
      mesh.position.set(GRID_X0 + (spec.col - 3.5) * CELL, GRID_Y0 - spec.row * CELL, -1.0);
      group.add(mesh);
      const lab = makeLabel(`${spec.z} ${spec.sym} ${spec.name}`, { fontSize: 40, scale: 0.58, color: '#1e293b' });
      lab.position.set(mesh.position.x, mesh.position.y, -0.88);
      group.add(lab);
      cells.push({ mesh, mat, spec, glowTarget: 0 });
    });
    const tableTitle = makeLabel('元素周期表（前 20 号元素）', { fontSize: 40, scale: 1.0 });
    tableTitle.position.set(GRID_X0, 5.4, -1.0);
    group.add(tableTitle);

    // ---------------- 迷你玻尔模型（9 个可选项全部预建，切换显隐） ----------------
    const nucleusMat = std('#ef4444', { emissive: '#b91c1c', emissiveIntensity: 0.35 });
    const ringMat = std('#cbd5e1', { transparent: true, opacity: 0.8 });
    const eGeo = new THREE.SphereGeometry(0.06, 10, 8);
    const eMat = std('#38bdf8', { emissive: '#0284c7', emissiveIntensity: 0.7 });
    const eOuterMat = std('#f59e0b', { emissive: '#d97706', emissiveIntensity: 0.7 });
    const minis: Record<string, MiniAtom> = {};
    Object.entries(SHELLS).forEach(([sym, shells]) => {
      const spec = ELEMENTS.find((e) => e.sym === sym)!;
      const g = new THREE.Group();
      const nucleus = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 12), nucleusMat);
      g.add(nucleus);
      const electrons: MiniAtom['electrons'] = [];
      shells.forEach((count, si) => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(SHELL_R[si], 0.012, 8, 48), ringMat);
        ring.rotation.x = Math.PI / 2;
        g.add(ring);
        const isOuter = si === shells.length - 1;
        for (let k = 0; k < count; k++) {
          const e = new THREE.Mesh(eGeo, isOuter ? eOuterMat : eMat);
          g.add(e);
          electrons.push({ mesh: e, shell: si, phase: (k / count) * Math.PI * 2 });
        }
      });
      const nameLab = makeLabel(`${spec.name} ${spec.sym}`, { fontSize: 42, scale: 0.9 });
      nameLab.position.set(0, 1.75, 0);
      g.add(nameLab);
      const infoLab = makeLabel(`原子序数 ${spec.z}：${spec.z} 个质子 · ${spec.z} 个电子`, {
        fontSize: 32,
        scale: 0.72,
        color: '#b45309',
      });
      infoLab.position.set(0, -1.6, 0);
      g.add(infoLab);
      const outerLab = makeLabel(`电子层数 ${shells.length} · 最外层 ${shells[shells.length - 1]} 个电子`, {
        fontSize: 32,
        scale: 0.72,
        color: '#0f766e',
      });
      outerLab.position.set(0, -2.05, 0);
      g.add(outerLab);
      g.position.set(4.1, 2.4, 0.6);
      g.visible = false;
      group.add(g);
      minis[sym] = { group: g, electrons };
    });

    // ---------------- 规律说明标签 ----------------
    const periodLab = makeLabel('同一周期（行）：电子层数相同', { fontSize: 34, scale: 0.85, color: '#c2410c' });
    periodLab.position.set(GRID_X0, 0.35, -0.8);
    periodLab.visible = false;
    group.add(periodLab);
    const groupLab = makeLabel('同一族（列）：最外层电子数相同，性质相似', { fontSize: 34, scale: 0.85, color: '#0f766e' });
    groupLab.position.set(GRID_X0, -0.2, -0.8);
    groupLab.visible = false;
    group.add(groupLab);
    const waveLab = makeLabel('按原子序数依次点亮，跟着默念', { fontSize: 34, scale: 0.85, color: '#a16207' });
    waveLab.position.set(GRID_X0, 0.35, -0.8);
    waveLab.visible = false;
    group.add(waveLab);

    // ---------------- 高亮逻辑 ----------------
    const applyGlow = () => {
      const sel = ELEMENTS.find((e) => e.sym === selSym)!;
      cells.forEach((c) => {
        let glow = 0;
        if (c.spec.sym === selSym) glow = 0.75;
        if (step === 2) {
          if (c.spec.row === sel.row && c.spec.sym !== selSym) {
            c.mat.emissive.set('#fb923c');
            glow = Math.max(glow, 0.45);
          } else if (c.spec.col === sel.col && c.spec.sym !== selSym) {
            c.mat.emissive.set('#2dd4bf');
            glow = Math.max(glow, 0.45);
          } else if (c.spec.sym === selSym) {
            c.mat.emissive.set('#f59e0b');
          }
        } else {
          c.mat.emissive.set('#f59e0b');
        }
        c.glowTarget = glow;
      });
      periodLab.visible = step === 2;
      groupLab.visible = step === 2;
      waveLab.visible = step >= 3;
      Object.entries(minis).forEach(([sym, m]) => (m.group.visible = sym === selSym));
    };
    applyGlow();

    return {
      setStep(i) {
        step = i;
        waveT = 0;
        applyGlow();
      },
      setParam(id, value) {
        if (id === 'el' && SHELLS[String(value)]) {
          selSym = String(value);
          applyGlow();
        }
      },
      update(dt, elapsed) {
        // 电子绕核
        const cur = minis[selSym];
        if (cur && cur.group.visible) {
          cur.electrons.forEach((e) => {
            const r = SHELL_R[e.shell];
            const a = e.phase + elapsed * (1.4 - e.shell * 0.25);
            e.mesh.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
          });
          cur.group.rotation.y = Math.sin(elapsed * 0.4) * 0.25;
        }
        // 格子高亮平滑过渡；第 4 步按原子序数波浪式点亮
        if (step >= 3) waveT += dt;
        const waveIdx = Math.floor(waveT * 2.2);
        cells.forEach((c) => {
          let target = c.glowTarget;
          if (step >= 3) {
            target = c.spec.z - 1 === waveIdx % 26 && waveIdx % 26 < 20 ? 0.9 : c.spec.sym === selSym ? 0.3 : 0.04;
            c.mat.emissive.set(c.spec.z - 1 === waveIdx % 26 ? '#facc15' : '#f59e0b');
          }
          c.mat.emissiveIntensity = damp(c.mat.emissiveIntensity, target, 8, dt);
        });
      },
      dispose() {
        ctx.scene.remove(group);
        disposeObject(group);
      },
    };
  },
};
