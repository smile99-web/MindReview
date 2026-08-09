// ---------------------------------------------------------------------------
// 化学 · 质量守恒与化学方程式：分子拆散、原子重组，原子计数逐项核对
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, cylinderBetween, disposeObject, makeLabel, std } from '../three-utils';

const EL_COLOR: Record<string, string> = {
  H: '#f1f5f9',
  O: '#ef4444',
  C: '#475569',
  Cl: '#4ade80',
};
const EL_R: Record<string, number> = { H: 0.22, O: 0.32, C: 0.36, Cl: 0.36 };

type P3 = [number, number, number];
interface RxnSpec {
  equation: string;
  atoms: { el: string; home: P3; goal: P3 }[];
  bondsA: [number, number][];
  bondsB: [number, number][];
  counts: { el: string; n: number }[];
}

// CH4 + 2O2 → CO2 + 2H2O（原子：0=C, 1~4=H, 5~8=O）
const TET: P3[] = [
  [0.44, 0.44, 0.44],
  [0.44, -0.44, -0.44],
  [-0.44, 0.44, -0.44],
  [-0.44, -0.44, 0.44],
];
const CH4: RxnSpec = {
  equation: 'CH₄ + 2O₂ → CO₂ + 2H₂O',
  atoms: [
    { el: 'C', home: [-2.7, 1.7, 0], goal: [2.5, 2.0, 0] },
    ...TET.map((d, i) => ({
      el: 'H',
      home: [-2.7 + d[0], 1.7 + d[1], d[2]] as P3,
      goal: ([[1.1, 1.35, 0.9], [1.9, 1.35, 0.9], [2.9, 1.35, -0.8], [3.7, 1.35, -0.8]] as P3[])[i],
    })),
    { el: 'O', home: [-1.55, 2.45, 0.6], goal: [1.8, 2.0, 0] },
    { el: 'O', home: [-1.0, 2.45, 0.6], goal: [3.2, 2.0, 0] },
    { el: 'O', home: [-1.5, 0.9, -0.9], goal: [1.5, 0.95, 0.9] },
    { el: 'O', home: [-0.95, 0.9, -0.9], goal: [3.3, 0.95, -0.8] },
  ],
  bondsA: [
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
    [5, 6],
    [7, 8],
  ],
  bondsB: [
    [0, 5],
    [0, 6],
    [7, 1],
    [7, 2],
    [8, 3],
    [8, 4],
  ],
  counts: [
    { el: 'C', n: 1 },
    { el: 'H', n: 4 },
    { el: 'O', n: 4 },
  ],
};

// H2 + Cl2 → 2HCl（原子：0,1=H  2,3=Cl）
const H2CL2: RxnSpec = {
  equation: 'H₂ + Cl₂ → 2HCl',
  atoms: [
    { el: 'H', home: [-2.85, 1.9, 0], goal: [1.7, 1.9, 0] },
    { el: 'H', home: [-2.35, 1.9, 0], goal: [2.9, 1.5, 0.5] },
    { el: 'Cl', home: [-1.8, 1.6, 0.4], goal: [2.35, 1.9, 0] },
    { el: 'Cl', home: [-1.2, 1.6, 0.4], goal: [3.55, 1.5, 0.5] },
  ],
  bondsA: [
    [0, 1],
    [2, 3],
  ],
  bondsB: [
    [0, 2],
    [1, 3],
  ],
  counts: [
    { el: 'H', n: 2 },
    { el: 'Cl', n: 2 },
  ],
};

interface RxnView {
  group: THREE.Group;
  atoms: THREE.Mesh[];
  bondMatA: THREE.MeshStandardMaterial;
  bondMatB: THREE.MeshStandardMaterial;
  pending: THREE.Sprite[];
  done: THREE.Sprite[];
  spec: RxnSpec;
}

export const equationScene: Scene3DDefinition = {
  id: 'chem-equation',
  title: '质量守恒与化学方程式',
  subject: '化学',
  grade: '9上',
  icon: '⚗️',
  tagline: '反应前后原子的种类和数目不变——配平就是在数原子',
  keywords: ['化学方程式', '质量守恒', '配平', '反应物', '生成物', '原子重新组合', '系数'],
  camera: { position: [6, 4.5, 10], target: [0, 1.7, 0] },
  controls: [
    { kind: 'button', id: 'react', label: '▶ 播放反应动画' },
    {
      kind: 'select',
      id: 'reaction',
      label: '反应',
      options: [
        { value: 'ch4', label: '甲烷燃烧 CH₄+2O₂→CO₂+2H₂O' },
        { value: 'h2cl2', label: '氢气在氯气中燃烧 H₂+Cl₂→2HCl' },
      ],
      defaultValue: 'ch4',
    },
  ],
  steps: [
    {
      title: '质量守恒定律',
      text: '把化学反应放在密闭容器里称一称：反应前多重，反应后还是多重，天平纹丝不动。这就是质量守恒定律——参加化学反应的各物质的质量总和，等于反应后生成的各物质的质量总和。',
    },
    {
      title: '微观解释',
      text: '为什么会守恒？因为化学变化的实质，是分子拆成原子、原子重新组合成新分子。原子是化学变化中的最小粒子：反应前后，原子的种类不变、数目不变、质量也不变，只是换了一种排列方式。',
    },
    {
      title: '化学方程式',
      text: '用化学式把这个过程记下来，就是化学方程式：左边写反应物，右边写生成物，箭头上方注明反应条件。点"播放反应动画"，亲眼看分子振动、拆散成原子，再重新组合成生成物分子。',
    },
    {
      title: '配平',
      text: '写方程式的最后一步是配平：在化学式前面加系数，让箭头两边每种原子的个数相等。看下面的计数牌——碳、氢、氧左右全都相等，方程式才成立。注意，系数只能加在化学式前面，不能改动化学式里的小数字。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 14);
    const root = new THREE.Group();
    ctx.scene.add(root);
    let step = 0;
    let active = 'ch4';
    let reactT = -1; // 反应动画时间线

    // ---- 背景天平（全程水平）----
    const balance = new THREE.Group();
    balance.position.set(0, 0, -3.4);
    root.add(balance);
    const balMat = std('#b45309', { emissive: '#92400e', emissiveIntensity: 0.15 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, 0.9), balMat);
    base.position.y = 0.09;
    balance.add(base);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.3, 10), balMat);
    column.position.y = 1.3;
    balance.add(column);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.1, 0.1), balMat);
    beam.position.y = 2.5;
    balance.add(beam);
    const pointer = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.5, 8), balMat);
    pointer.position.y = 2.15;
    pointer.rotation.x = Math.PI;
    balance.add(pointer);
    [-2.7, 2.7].forEach((x) => {
      const string = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.7, 6), balMat);
      string.position.set(x, 2.1, 0);
      balance.add(string);
      const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.5, 0.08, 18), balMat);
      pan.position.set(x, 1.72, 0);
      balance.add(pan);
    });
    const balLabel = makeLabel('密闭容器中反应——天平始终平衡', { fontSize: 38, scale: 0.9, color: '#b45309' });
    balLabel.position.set(0, 3.3, 0);
    balance.add(balLabel);

    // ---- 区域标签 ----
    const reactLabel = makeLabel('反应物', { fontSize: 40, scale: 0.95 });
    reactLabel.position.set(-2.4, 0.35, 1.3);
    root.add(reactLabel);
    const prodLabel = makeLabel('生成物', { fontSize: 40, scale: 0.95, color: '#15803d' });
    prodLabel.position.set(2.6, 0.35, 1.3);
    root.add(prodLabel);

    // ---- 构建一套反应视图 ----
    const buildRxn = (spec: RxnSpec): RxnView => {
      const g = new THREE.Group();
      root.add(g);
      const atoms: THREE.Mesh[] = [];
      spec.atoms.forEach((a) => {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(EL_R[a.el], 18, 14),
          std(EL_COLOR[a.el]),
        );
        mesh.position.set(...a.home);
        g.add(mesh);
        atoms.push(mesh);
      });
      const bondMatA = std('#94a3b8', { transparent: true, opacity: 1 });
      const bondMatB = std('#94a3b8', { transparent: true, opacity: 0 });
      spec.bondsA.forEach(([i, j]) => {
        g.add(
          cylinderBetween(
            new THREE.Vector3(...spec.atoms[i].home),
            new THREE.Vector3(...spec.atoms[j].home),
            0.07,
            bondMatA,
          ),
        );
      });
      spec.bondsB.forEach(([i, j]) => {
        g.add(
          cylinderBetween(
            new THREE.Vector3(...spec.atoms[i].goal),
            new THREE.Vector3(...spec.atoms[j].goal),
            0.07,
            bondMatB,
          ),
        );
      });
      const eq = makeLabel(spec.equation, { fontSize: 46, scale: 1.1 });
      eq.position.set(0, 4.3, 0);
      g.add(eq);
      // 原子计数牌（待核对 / 已核对 两张切换）
      const pending: THREE.Sprite[] = [];
      const done: THREE.Sprite[] = [];
      spec.counts.forEach((c, k) => {
        const x = -1.6 + k * 1.6;
        const p = makeLabel(`${c.el}：${c.n} 对 ${c.n}`, { fontSize: 40, scale: 0.9, color: '#64748b' });
        p.position.set(x, 0.55, 2.2);
        g.add(p);
        pending.push(p);
        const d = makeLabel(`${c.el}：${c.n} = ${c.n} ✓`, { fontSize: 40, scale: 0.9, color: '#15803d' });
        d.position.set(x, 0.55, 2.2);
        d.visible = false;
        g.add(d);
        done.push(d);
      });
      return { group: g, atoms, bondMatA, bondMatB, pending, done, spec };
    };
    const views: Record<string, RxnView> = { ch4: buildRxn(CH4), h2cl2: buildRxn(H2CL2) };
    const show = (key: string) => {
      active = key;
      Object.entries(views).forEach(([k, vw]) => (vw.group.visible = k === key));
      reactT = -1;
      reset_view(views[active]);
    };
    const reset_view = (vw: RxnView) => {
      vw.atoms.forEach((a, i) => a.position.set(...vw.spec.atoms[i].home));
      vw.bondMatA.opacity = 1;
      vw.bondMatB.opacity = 0;
      vw.pending.forEach((p) => (p.visible = true));
      vw.done.forEach((d) => (d.visible = false));
    };
    show('ch4');

    const finishAll = (vw: RxnView) => {
      reactT = 6;
      vw.atoms.forEach((a, i) => a.position.set(...vw.spec.atoms[i].goal));
      vw.bondMatA.opacity = 0;
      vw.bondMatB.opacity = 1;
      vw.pending.forEach((p) => (p.visible = false));
      vw.done.forEach((d) => (d.visible = true));
    };

    return {
      setStep(i) {
        step = i;
        const vw = views[active];
        if (i === 2 && reactT < 0) reactT = 0;
        if (i >= 3) finishAll(vw);
      },
      setParam(id, value) {
        if (id === 'react') {
          reset_view(views[active]);
          reactT = 0;
        }
        if (id === 'reaction') show(String(value));
      },
      update(dt, elapsed) {
        // 天平高亮脉冲（第 1 步）
        balMat.emissiveIntensity = step === 0 ? 0.3 + Math.sin(elapsed * 4) * 0.2 : 0.15;
        const vw = views[active];
        if (reactT < 0) return;
        reactT += dt;
        // 0~0.9s 振动散架；0.9~2.6s 原子迁移；2.6~3.4s 新键生成；之后逐项核对
        let mix = 0;
        if (reactT < 0.9) mix = 0;
        else if (reactT < 2.6) {
          const k = (reactT - 0.9) / 1.7;
          mix = k * k * (3 - 2 * k);
        } else mix = 1;
        const vib = reactT < 0.9 ? (reactT / 0.9) * 0.07 : 0;
        vw.atoms.forEach((a, i) => {
          const h = vw.spec.atoms[i].home;
          const gpos = vw.spec.atoms[i].goal;
          a.position.set(
            h[0] + (gpos[0] - h[0]) * mix + Math.sin(elapsed * 32 + i * 2.1) * vib,
            h[1] + (gpos[1] - h[1]) * mix + Math.cos(elapsed * 28 + i * 1.7) * vib,
            h[2] + (gpos[2] - h[2]) * mix + Math.sin(elapsed * 25 + i * 2.9) * vib,
          );
        });
        vw.bondMatA.opacity = THREE.MathUtils.clamp(1 - reactT / 0.9, 0, 1);
        vw.bondMatB.opacity = THREE.MathUtils.clamp((reactT - 2.6) / 0.8, 0, 1);
        // 3.4s 起逐项打勾
        vw.done.forEach((d, k) => {
          const on = reactT > 3.4 + k * 0.55;
          d.visible = on;
          vw.pending[k].visible = !on;
        });
      },
      dispose() {
        ctx.scene.remove(root);
        disposeObject(root);
      },
    };
  },
};
