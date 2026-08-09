// ---------------------------------------------------------------------------
// 化学 · 原子结构：玻尔模型，电子分层排布与最外层电子
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, disposeObject, makeLabel, std } from '../three-utils';

interface ElementSpec {
  name: string;
  symbol: string;
  protons: number;
  neutrons: number;
  shells: number[]; // 各层电子数
  note: string;
}
const ELEMENTS: Record<string, ElementSpec> = {
  H: { name: '氢', symbol: 'H', protons: 1, neutrons: 0, shells: [1], note: '最轻的原子' },
  C: { name: '碳', symbol: 'C', protons: 6, neutrons: 6, shells: [2, 4], note: '最外层4个电子，易形成共价键' },
  O: { name: '氧', symbol: 'O', protons: 8, neutrons: 8, shells: [2, 6], note: '最外层6个电子，易得2个电子' },
  Na: { name: '钠', symbol: 'Na', protons: 11, neutrons: 12, shells: [2, 8, 1], note: '最外层1个电子，易失去形成Na⁺' },
  Cl: { name: '氯', symbol: 'Cl', protons: 17, neutrons: 18, shells: [2, 8, 7], note: '最外层7个电子，易得到1个电子' },
};

const SHELL_R = [1.3, 2.0, 2.7];

function buildAtom(spec: ElementSpec): {
  group: THREE.Group;
  electrons: { mesh: THREE.Mesh; shell: number; phase: number; speed: number }[];
  highlights: THREE.Mesh[];
  outerLabel: THREE.Sprite;
} {
  const group = new THREE.Group();
  const electrons: { mesh: THREE.Mesh; shell: number; phase: number; speed: number }[] = [];
  const highlights: THREE.Mesh[] = [];

  // 原子核：质子(红)+中子(灰)挤成小球团
  const nucleus = new THREE.Group();
  const pGeo = new THREE.SphereGeometry(0.16, 12, 10);
  const pMat = std('#ef4444');
  const nMat = std('#94a3b8');
  const total = spec.protons + spec.neutrons;
  const clusterR = 0.18 * Math.cbrt(Math.max(total, 1));
  for (let i = 0; i < total; i++) {
    const isP = i < spec.protons;
    const m = new THREE.Mesh(pGeo, isP ? pMat : nMat);
    // 费波那契球分布压扁成核团
    const t = (i + 0.5) / total;
    const phi = Math.acos(1 - 2 * t);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const r = clusterR * Math.cbrt((i % 7) / 7 + 0.15);
    m.position.set(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi) * 0.8,
      r * Math.sin(phi) * Math.sin(theta),
    );
    nucleus.add(m);
  }
  group.add(nucleus);
  const nuLabel = makeLabel(`原子核(${spec.protons}质子+${spec.neutrons}中子)`, {
    fontSize: 34,
    scale: 0.75,
    color: '#b91c1c',
  });
  nuLabel.position.set(0, -0.75, 0);
  group.add(nuLabel);

  // 电子层（圆环轨道）
  spec.shells.forEach((count, si) => {
    const r = SHELL_R[si];
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.015, 8, 80),
      std('#cbd5e1', { transparent: true, opacity: 0.85 }),
    );
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    const sLabel = makeLabel(`第${['一', '二', '三'][si]}层`, { fontSize: 30, scale: 0.65 });
    sLabel.position.set(r + 0.65, 0.05, 0);
    group.add(sLabel);
    // 电子
    const eGeo = new THREE.SphereGeometry(0.13, 14, 10);
    const isOuter = si === spec.shells.length - 1;
    const eMat = std(isOuter ? '#f59e0b' : '#38bdf8', {
      emissive: isOuter ? '#d97706' : '#0284c7',
      emissiveIntensity: 0.6,
    });
    for (let k = 0; k < count; k++) {
      const e = new THREE.Mesh(eGeo, eMat);
      group.add(e);
      electrons.push({
        mesh: e,
        shell: si,
        phase: (k / count) * Math.PI * 2,
        speed: 1.1 - si * 0.28,
      });
      if (isOuter) highlights.push(e);
    }
  });

  const title = makeLabel(`${spec.name}原子 ${spec.symbol}`, { fontSize: 46, scale: 1.05 });
  title.position.set(0, 3.5, 0);
  group.add(title);
  const outerLabel = makeLabel(`最外层${spec.shells[spec.shells.length - 1]}个电子：${spec.note}`, {
    fontSize: 34,
    scale: 0.8,
    color: '#b45309',
  });
  outerLabel.position.set(0, -1.4, 0);
  outerLabel.visible = false;
  group.add(outerLabel);

  return { group, electrons, highlights, outerLabel };
}

export const atomScene: Scene3DDefinition = {
  id: 'chem-atom',
  title: '原子结构模型',
  subject: '化学',
  icon: '⚛️',
  tagline: '质子、中子与分层排布的电子，理解最外层电子决定化学性质',
  keywords: ['原子', '原子核', '质子', '中子', '电子', '电子层', '核外电子', '最外层电子', '原子结构', '离子'],
  camera: { position: [4, 3, 7], target: [0, 0.4, 0] },
  controls: [
    {
      kind: 'select',
      id: 'element',
      label: '元素',
      options: [
        { value: 'H', label: '氢 H' },
        { value: 'C', label: '碳 C' },
        { value: 'O', label: '氧 O' },
        { value: 'Na', label: '钠 Na' },
        { value: 'Cl', label: '氯 Cl' },
      ],
      defaultValue: 'O',
    },
  ],
  steps: [
    {
      title: '原子的构成',
      text: '原子由中心的原子核和核外电子构成。原子核很小却集中了几乎全部质量，由红色的质子和灰色的中子组成。质子带正电，中子不带电，电子带负电。',
    },
    {
      title: '电子分层排布',
      text: '电子在核外按能量高低分层运动：第一层最多排2个，第二层最多排8个，第三层最多排18个，排满内层再排外层。注意看不同元素的电子层数不同。',
    },
    {
      title: '最外层电子',
      text: '橙色的最外层电子决定化学性质：钠最外层只有1个电子，容易失去变成钠离子；氯最外层7个电子，容易再抢1个；达到8个电子就是稳定结构。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 12);
    let current: ReturnType<typeof buildAtom> | null = null;
    let step = 0;
    let elapsed = 0;

    const applyStep = () => {
      if (!current) return;
      const showOuter = step >= 2;
      current.outerLabel.visible = showOuter;
      current.highlights.forEach((m) => m.scale.setScalar(showOuter ? 1.6 : 1));
    };
    const mount = (key: string) => {
      if (current) {
        ctx.scene.remove(current.group);
        disposeObject(current.group);
      }
      current = buildAtom(ELEMENTS[key] ?? ELEMENTS.O);
      ctx.scene.add(current.group);
      applyStep();
    };
    mount('O');

    return {
      setStep(i) {
        step = i;
        applyStep();
      },
      setParam(id, value) {
        if (id === 'element') mount(String(value));
      },
      update(dt) {
        elapsed += dt;
        if (!current) return;
        current.electrons.forEach((e) => {
          const r = SHELL_R[e.shell];
          const a = e.phase + elapsed * e.speed;
          e.mesh.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
        });
        current.group.rotation.y += dt * 0.15;
      },
      dispose() {
        if (current) {
          ctx.scene.remove(current.group);
          disposeObject(current.group);
          current = null;
        }
      },
    };
  },
};
