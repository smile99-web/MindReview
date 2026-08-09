// ---------------------------------------------------------------------------
// 化学 · 分子球棍模型：H2O / CO2 / CH4 / NH3，键角与孤对电子
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, cylinderBetween, disposeObject, makeLabel, std } from '../three-utils';

const ELEMENT_COLOR: Record<string, string> = {
  H: '#f1f5f9',
  O: '#ef4444',
  C: '#475569',
  N: '#3b82f6',
};
const ELEMENT_R: Record<string, number> = { H: 0.3, O: 0.48, C: 0.42, N: 0.45 };

interface AtomSpec {
  el: string;
  pos: [number, number, number];
}
interface AngleArc {
  center: number;
  a: number;
  b: number;
  text: string;
}
interface MolSpec {
  name: string;
  formula: string;
  atoms: AtomSpec[];
  bonds: [number, number][];
  lonePairs?: [number, number, number][];
  arcs?: AngleArc[];
}

const S = 1.35;
const MOLECULES: Record<string, MolSpec> = {
  H2O: {
    name: '水',
    formula: 'H₂O',
    atoms: [
      { el: 'O', pos: [0, -0.3, 0] },
      { el: 'H', pos: [1.186 * S * 0.75, -0.3 + 0.918 * S * 0.75, 0] },
      { el: 'H', pos: [-1.186 * S * 0.75, -0.3 + 0.918 * S * 0.75, 0] },
    ],
    bonds: [
      [0, 1],
      [0, 2],
    ],
    lonePairs: [
      [0, -0.95, 0.45],
      [0, -0.95, -0.45],
    ],
    arcs: [{ center: 0, a: 1, b: 2, text: '104.5°' }],
  },
  CO2: {
    name: '二氧化碳',
    formula: 'CO₂',
    atoms: [
      { el: 'C', pos: [0, 0.4, 0] },
      { el: 'O', pos: [1.6, 0.4, 0] },
      { el: 'O', pos: [-1.6, 0.4, 0] },
    ],
    bonds: [
      [0, 1],
      [0, 2],
    ],
    arcs: [{ center: 0, a: 1, b: 2, text: '180°' }],
  },
  CH4: {
    name: '甲烷',
    formula: 'CH₄',
    // 正四面体四个顶点：(1,1,1) (1,-1,-1) (-1,1,-1) (-1,-1,1)，整体抬高 0.4
    atoms: [
      { el: 'C', pos: [0, 0.4, 0] },
      { el: 'H', pos: [1.05, 1.45, 1.05] },
      { el: 'H', pos: [1.05, -0.65, -1.05] },
      { el: 'H', pos: [-1.05, 1.45, -1.05] },
      { el: 'H', pos: [-1.05, -0.65, 1.05] },
    ],
    bonds: [
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
    ],
    arcs: [{ center: 0, a: 1, b: 2, text: '109.5°' }],
  },
  NH3: {
    name: '氨',
    formula: 'NH₃',
    atoms: [
      { el: 'N', pos: [0, 0.75, 0] },
      { el: 'H', pos: [1.25, 0.25, 0] },
      { el: 'H', pos: [-0.625, 0.25, 1.083] },
      { el: 'H', pos: [-0.625, 0.25, -1.083] },
    ],
    bonds: [
      [0, 1],
      [0, 2],
      [0, 3],
    ],
    lonePairs: [[0, 1.55, 0]],
    arcs: [{ center: 0, a: 1, b: 2, text: '107°' }],
  },
};

/** 键角弧线：在两条键张成的平面内画圆弧 */
function makeAngleArc(center: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, r: number): THREE.Line {
  const va = a.clone().sub(center).normalize();
  const vb = b.clone().sub(center).normalize();
  const pts: THREE.Vector3[] = [];
  const q = new THREE.Quaternion().setFromUnitVectors(va, vb);
  for (let i = 0; i <= 24; i++) {
    const p = va.clone().applyQuaternion(new THREE.Quaternion().slerp(q, i / 24));
    pts.push(center.clone().addScaledVector(p, r));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#f59e0b' }));
}

function buildMolecule(spec: MolSpec): {
  group: THREE.Group;
  arcs: THREE.Object3D[];
  lonePairs: THREE.Object3D[];
} {
  const group = new THREE.Group();
  const arcs: THREE.Object3D[] = [];
  const lonePairs: THREE.Object3D[] = [];
  const bondMat = std('#94a3b8');
  const atomGeo = new THREE.SphereGeometry(1, 24, 18);

  spec.atoms.forEach((atom) => {
    const mesh = new THREE.Mesh(atomGeo, std(ELEMENT_COLOR[atom.el]));
    mesh.scale.setScalar(ELEMENT_R[atom.el]);
    mesh.position.set(...atom.pos);
    group.add(mesh);
    const label = makeLabel(atom.el, { fontSize: 40, scale: 0.8 });
    label.position.set(atom.pos[0], atom.pos[1] + ELEMENT_R[atom.el] + 0.42, atom.pos[2]);
    group.add(label);
  });

  spec.bonds.forEach(([i, j]) => {
    const a = new THREE.Vector3(...spec.atoms[i].pos);
    const b = new THREE.Vector3(...spec.atoms[j].pos);
    group.add(cylinderBetween(a, b, 0.09, bondMat));
  });

  (spec.lonePairs ?? []).forEach((p) => {
    const lp = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 18, 14),
      std('#a78bfa', { transparent: true, opacity: 0.75, emissive: '#7c3aed', emissiveIntensity: 0.25 }),
    );
    lp.position.set(...p);
    lp.visible = false;
    group.add(lp);
    lonePairs.push(lp);
    const label = makeLabel('孤对电子', { fontSize: 34, scale: 0.7, color: '#6d28d9' });
    label.position.set(p[0], p[1] + 0.5, p[2]);
    label.visible = false;
    group.add(label);
    lonePairs.push(label);
  });

  (spec.arcs ?? []).forEach((arc) => {
    const c = new THREE.Vector3(...spec.atoms[arc.center].pos);
    const a = new THREE.Vector3(...spec.atoms[arc.a].pos);
    const b = new THREE.Vector3(...spec.atoms[arc.b].pos);
    const line = makeAngleArc(c, a, b, 0.85);
    line.visible = false;
    group.add(line);
    arcs.push(line);
    const mid = new THREE.Vector3()
      .addVectors(a.clone().sub(c).normalize(), b.clone().sub(c).normalize())
      .normalize();
    const label = makeLabel(arc.text, { fontSize: 38, scale: 0.85, color: '#b45309' });
    label.position.copy(c).addScaledVector(mid, 1.35);
    label.visible = false;
    group.add(label);
    arcs.push(label);
  });

  const title = makeLabel(`${spec.name} ${spec.formula}`, { fontSize: 46, scale: 1.05 });
  title.position.set(0, 2.6, 0);
  group.add(title);
  return { group, arcs, lonePairs };
}

export const moleculeScene: Scene3DDefinition = {
  id: 'chem-molecule',
  title: '分子的空间结构',
  subject: '化学',
  icon: '🧪',
  tagline: '水、二氧化碳、甲烷、氨的球棍模型，认识键角与孤对电子',
  keywords: ['分子', '原子', '共价键', '化学键', '键角', '分子结构', '水', '甲烷', '二氧化碳', '氨', '孤对电子'],
  camera: { position: [4.5, 3.5, 6], target: [0, 0.8, 0] },
  controls: [
    {
      kind: 'select',
      id: 'mol',
      label: '分子',
      options: [
        { value: 'H2O', label: '水 H₂O' },
        { value: 'CO2', label: '二氧化碳 CO₂' },
        { value: 'CH4', label: '甲烷 CH₄' },
        { value: 'NH3', label: '氨 NH₃' },
      ],
      defaultValue: 'H2O',
    },
  ],
  steps: [
    {
      title: '球棍模型',
      text: '每种颜色的小球代表一种原子：白色是氢，红色是氧，深色是碳，蓝色是氮。小球之间的短棍代表共价键。拖动可以旋转，滚动可以缩放，还可以切换不同的分子观察。',
    },
    {
      title: '键角',
      text: '相邻两条共价键之间的夹角叫做键角。水分子约一百零四点五度，氨分子约一百零七度，甲烷是正四面体一百零九点五度，二氧化碳是直线形一百八十度。',
    },
    {
      title: '孤对电子',
      text: '氧原子和氮原子上还有没参与成键的电子对，叫孤对电子，就是紫色的部分。它们对成键电子对有排斥作用，把键角"挤"小了，所以水和氨的键角都小于一百零九点五度。',
    },
    {
      title: '空间构型决定性质',
      text: '分子的形状决定性质：水分子两端一端正电一端负电，是极性分子，所以能溶解食盐等许多物质；二氧化碳对称直线，正负电中心重合，是非极性分子。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 10);
    let current: ReturnType<typeof buildMolecule> | null = null;
    let step = 0;

    const mount = (key: string) => {
      if (current) {
        ctx.scene.remove(current.group);
        disposeObject(current.group);
      }
      current = buildMolecule(MOLECULES[key] ?? MOLECULES.H2O);
      ctx.scene.add(current.group);
      applyStep();
    };
    const applyStep = () => {
      if (!current) return;
      current.arcs.forEach((o) => (o.visible = step >= 1));
      current.lonePairs.forEach((o) => (o.visible = step >= 2));
    };
    mount('H2O');

    return {
      setStep(i) {
        step = i;
        applyStep();
      },
      setParam(id, value) {
        if (id === 'mol') mount(String(value));
      },
      update(dt) {
        if (current) current.group.rotation.y += dt * (step >= 3 ? 0.7 : 0.35);
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
