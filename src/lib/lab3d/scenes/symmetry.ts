// ---------------------------------------------------------------------------
// 数学 · 轴对称：对折实验 + 对应点连线被对称轴垂直平分
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, cylinderBetween, disposeObject, makeLabel, std } from '../three-utils';

type ShapeKind = 'butterfly' | 'triangle' | 'leaf';

const DEPTH = 0.1;
const FRONT = DEPTH / 2 + 0.02;

interface ShapeDef {
  pts: [number, number][]; // 左半边轮廓（x ≤ 0，首尾在轴上）
  color: string;
  corr: [number, number]; // 一对对应点（左侧）
  deco?: (g: THREE.Group, m: 1 | -1) => void; // 左右半各自的装饰（m 镜像系数）
  axisExtra?: (g: THREE.Group) => void; // 对称轴上的装饰（身体、主叶脉等）
}

const SHAPES: Record<ShapeKind, ShapeDef> = {
  butterfly: {
    pts: [
      [0, 2.9],
      [-0.9, 3.3],
      [-1.9, 3.1],
      [-2.3, 2.4],
      [-1.5, 1.9],
      [-2.1, 1.2],
      [-1.8, 0.5],
      [-0.8, 0.4],
      [0, 1.0],
    ],
    color: '#f472b6',
    corr: [-2.3, 2.4],
    deco: (g, m) => {
      const d1 = new THREE.Mesh(new THREE.CircleGeometry(0.17, 20), std('#fdf4ff'));
      d1.position.set(m * 1.35, 2.55, FRONT + 0.01);
      const d2 = new THREE.Mesh(new THREE.CircleGeometry(0.13, 20), std('#fdf4ff'));
      d2.position.set(m * 1.15, 1.05, FRONT + 0.01);
      g.add(d1, d2);
    },
    axisExtra: (g) => {
      const bodyMat = std('#7c2d12');
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 2.1, 12), bodyMat);
      body.position.set(0, 1.9, 0);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 10), bodyMat);
      head.position.set(0, 3.05, 0);
      const ant1 = cylinderBetween(new THREE.Vector3(0, 3.15, 0), new THREE.Vector3(0.32, 3.62, 0), 0.028, bodyMat);
      const ant2 = cylinderBetween(new THREE.Vector3(0, 3.15, 0), new THREE.Vector3(-0.32, 3.62, 0), 0.028, bodyMat);
      g.add(body, head, ant1, ant2);
    },
  },
  triangle: {
    pts: [
      [0, 0.7],
      [0, 3.1],
      [-1.7, 0.7],
    ],
    color: '#60a5fa',
    corr: [-1.7, 0.7],
  },
  leaf: {
    pts: [
      [0, 0.6],
      [-0.8, 0.95],
      [-1.4, 1.6],
      [-1.55, 2.3],
      [-0.95, 2.95],
      [0, 3.4],
    ],
    color: '#4ade80',
    corr: [-1.55, 2.3],
    deco: (g, m) => {
      const veinMat = std('#166534');
      const v1 = cylinderBetween(new THREE.Vector3(0, 1.3, FRONT), new THREE.Vector3(m * 0.72, 1.85, FRONT), 0.022, veinMat);
      const v2 = cylinderBetween(new THREE.Vector3(0, 2.15, FRONT), new THREE.Vector3(m * 0.92, 2.65, FRONT), 0.022, veinMat);
      g.add(v1, v2);
    },
    axisExtra: (g) => {
      const vein = cylinderBetween(new THREE.Vector3(0, 0.68, FRONT), new THREE.Vector3(0, 3.32, FRONT), 0.032, std('#166534'));
      g.add(vein);
    },
  },
};

export const symmetryScene: Scene3DDefinition = {
  id: 'math-symmetry',
  title: '轴对称',
  subject: '数学',
  grade: '8上',
  icon: '🦋',
  tagline: '沿对称轴对折后两边完全重合——对称轴垂直平分对应点连线',
  keywords: ['轴对称', '对称轴', '对称图形', '对折', '垂直平分线', '等腰三角形'],
  camera: { position: [0, 2.3, 8.8], target: [0, 1.9, 0] },
  controls: [
    {
      kind: 'select',
      id: 'shape',
      label: '图形',
      options: [
        { value: 'butterfly', label: '蝴蝶' },
        { value: 'triangle', label: '等腰三角形' },
        { value: 'leaf', label: '树叶形' },
      ],
      defaultValue: 'butterfly',
    },
    { kind: 'button', id: 'fold', label: '📄 对折 / 展开' },
  ],
  steps: [
    {
      title: '轴对称图形',
      text: '如果一个图形沿着一条直线对折后，直线两旁的部分能够完全重合，这个图形就是轴对称图形，这条直线叫做对称轴。切换选择器看一看：蝴蝶、等腰三角形、树叶，都有这个本领。',
    },
    {
      title: '对折验证',
      text: '点击对折按钮，右半边绕对称轴翻折过来，和左半边严丝合缝地重合，再点一次展开。能完全重合，才说明它真的是轴对称图形——对折是最直接的验证方法。',
    },
    {
      title: '垂直平分',
      text: '展开后盯住这对蓝色对应点：它们的连线被对称轴垂直平分——连线与对称轴成直角，而且两个点到对称轴的距离相等。这是轴对称最重要的一条性质，作对称点全靠它。',
    },
    {
      title: '等腰三角形',
      text: '等腰三角形是标准的轴对称图形：顶角的平分线就是它的对称轴。沿它对折，两条腰重合，两个底角也重合，所以等腰三角形的两个底角相等。轴对称是很多几何性质的根源。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 12);
    let step = 0;
    let shape: ShapeKind = 'butterfly';
    let foldOn = false;
    let foldT = 0;
    let prevFold = 0;
    let flashT = 0;

    // 对称轴（竖直虚线）+ 标签
    const axisGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -0.15, 0),
      new THREE.Vector3(0, 3.95, 0),
    ]);
    const axisLine = new THREE.Line(
      axisGeo,
      new THREE.LineDashedMaterial({ color: '#0f172a', dashSize: 0.2, gapSize: 0.13 }),
    );
    axisLine.computeLineDistances();
    ctx.scene.add(axisLine);
    const axisLabel = makeLabel('对称轴', { fontSize: 40, scale: 0.9 });
    axisLabel.position.set(0.95, 3.95, 0);
    ctx.scene.add(axisLabel);

    const topLabel = makeLabel('', { fontSize: 42, scale: 1 });
    topLabel.position.set(0, 4.5, 0);
    ctx.scene.add(topLabel);

    let leftGroup = new THREE.Group();
    let rightGroup = new THREE.Group();
    let axisExtra = new THREE.Group();
    let connector = new THREE.Group();
    let leftMat = std('#f472b6');
    let rightMat = std('#f472b6');

    /** 左半轮廓挤出片；mirror=true 时镜像为右半 */
    const halfMesh = (def: ShapeDef, mirror: boolean, mat: THREE.Material): THREE.Mesh => {
      const sh = new THREE.Shape();
      def.pts.forEach(([x, y], i) => {
        const xx = mirror ? -x : x;
        if (i === 0) sh.moveTo(xx, y);
        else sh.lineTo(xx, y);
      });
      sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: DEPTH, bevelEnabled: false });
      g.translate(0, 0, -DEPTH / 2);
      return new THREE.Mesh(g, mat);
    };

    /** 对应点连线 + 直角符号 + 中点标记（步骤三用） */
    const buildConnector = (p: [number, number]): THREE.Group => {
      const g = new THREE.Group();
      const blue = '#2563eb';
      const L = new THREE.Vector3(p[0], p[1], FRONT + 0.06);
      const R = new THREE.Vector3(-p[0], p[1], FRONT + 0.06);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([L, R]),
        new THREE.LineDashedMaterial({ color: blue, dashSize: 0.18, gapSize: 0.12 }),
      );
      line.computeLineDistances();
      g.add(line);
      const dotMat = std(blue, { emissive: blue, emissiveIntensity: 0.4 });
      const dotL = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), dotMat);
      dotL.position.copy(L);
      const dotR = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), dotMat);
      dotR.position.copy(R);
      const mid = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), std('#1d4ed8'));
      mid.position.set(0, p[1], FRONT + 0.06);
      g.add(dotL, dotR, mid);
      // 直角符号（轴与连线的交点处的小 L）
      const cornerMat = std(blue);
      const hBox = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.035, 0.035), cornerMat);
      hBox.position.set(0.13, p[1] + 0.018, FRONT + 0.06);
      const vBox = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.22, 0.035), cornerMat);
      vBox.position.set(0.018, p[1] + 0.13, FRONT + 0.06);
      g.add(hBox, vBox);
      const lab = makeLabel('垂直平分', { fontSize: 38, scale: 0.9, color: blue });
      lab.position.set(1.05, p[1] + 0.5, FRONT + 0.06);
      g.add(lab);
      return g;
    };

    const rebuildShape = () => {
      ctx.scene.remove(leftGroup, rightGroup, axisExtra, connector);
      disposeObject(leftGroup);
      disposeObject(rightGroup);
      disposeObject(axisExtra);
      disposeObject(connector);
      const def = SHAPES[shape];
      leftMat = std(def.color, { emissive: def.color, emissiveIntensity: 0 });
      rightMat = std(def.color, { emissive: def.color, emissiveIntensity: 0 });
      leftGroup = new THREE.Group();
      rightGroup = new THREE.Group();
      leftGroup.add(halfMesh(def, false, leftMat));
      rightGroup.add(halfMesh(def, true, rightMat));
      def.deco?.(leftGroup, 1);
      def.deco?.(rightGroup, -1);
      axisExtra = new THREE.Group();
      def.axisExtra?.(axisExtra);
      connector = buildConnector(def.corr);
      connector.visible = false;
      ctx.scene.add(leftGroup, rightGroup, axisExtra, connector);
    };
    rebuildShape();

    const replaceLabel = (sp: THREE.Sprite, text: string, color: string) => {
      const nl = makeLabel(text, { fontSize: 42, scale: 1, color });
      sp.material.map?.dispose();
      sp.material.dispose();
      sp.material = nl.material;
      sp.scale.copy(nl.scale);
    };

    const applyStep = () => {
      foldOn = step === 1;
      if (step === 3 && shape !== 'triangle') {
        shape = 'triangle';
        rebuildShape();
      }
      const texts = [
        ['轴对称图形：对折后两边重合', '#0f172a'],
        ['对折验证：右半边翻折过来', '#7c3aed'],
        ['对称轴垂直平分对应点连线', '#2563eb'],
        ['等腰三角形：顶角平分线即对称轴', '#0f766e'],
      ] as const;
      replaceLabel(topLabel, texts[step][0], texts[step][1]);
    };
    applyStep();

    return {
      setStep(i) {
        step = i;
        applyStep();
      },
      setParam(id, value) {
        if (id === 'shape') {
          shape = String(value) as ShapeKind;
          rebuildShape();
        } else if (id === 'fold') {
          foldOn = !foldOn;
        }
      },
      update(dt, elapsed) {
        foldT = THREE.MathUtils.damp(foldT, foldOn ? 1 : 0, 3.2, dt);
        const e = foldT * foldT * (3 - 2 * foldT);
        rightGroup.rotation.y = e * Math.PI; // 绕对称轴翻折 180°
        if (prevFold <= 0.97 && foldT > 0.97) flashT = 1;
        prevFold = foldT;
        flashT = Math.max(0, flashT - dt * 1.4);
        const pulse = flashT * (0.5 + 0.5 * Math.sin(elapsed * 20));
        leftMat.emissiveIntensity = pulse;
        rightMat.emissiveIntensity = pulse;
        connector.visible = step === 2 && foldT < 0.05;
      },
      dispose() {
        ctx.scene.remove(leftGroup, rightGroup, axisExtra, connector, axisLine, axisLabel, topLabel);
        disposeObject(leftGroup);
        disposeObject(rightGroup);
        disposeObject(axisExtra);
        disposeObject(connector);
        disposeObject(axisLine);
        disposeObject(axisLabel);
        disposeObject(topLabel);
      },
    };
  },
};
