// ---------------------------------------------------------------------------
// 数学 · 平行四边形：变形演示性质 + 对角线互相平分 + 特殊成员
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, cylinderBetween, disposeObject, makeLabel, std } from '../three-utils';

type Family = 'normal' | 'rect' | 'rhombus' | 'square';

const DEPTH = 0.08;
const FRONT = DEPTH / 2 + 0.05;
const Y0 = 0.5;

function fanGeo(r: number, a1: number, sweep: number): THREE.ShapeGeometry {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0);
  sh.absarc(0, 0, r, a1, a1 + sweep, false);
  sh.lineTo(0, 0);
  return new THREE.ShapeGeometry(sh, 20);
}

function vertexAngle(v: THREE.Vector2, p1: THREE.Vector2, p2: THREE.Vector2) {
  let a1 = Math.atan2(p1.y - v.y, p1.x - v.x);
  const a2 = Math.atan2(p2.y - v.y, p2.x - v.x);
  let da = a2 - a1;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da <= -Math.PI) da += Math.PI * 2;
  if (da < 0) {
    a1 = a2;
    da = -da;
  }
  return { start: a1, sweep: da };
}

/** 各形态的目标参数（w 底宽、h 高、dx 上边平移量） */
function targetOf(family: Family, skew: number) {
  switch (family) {
    case 'rect':
      return { w: 4, h: 2.6, dx: 0 };
    case 'rhombus': {
      const s = 3.4;
      const rad = (65 * Math.PI) / 180;
      return { w: s, h: s * Math.sin(rad), dx: s * Math.cos(rad) };
    }
    case 'square':
      return { w: 3, h: 3, dx: 0 };
    default:
      return { w: 4, h: 2.5, dx: 1.9 * skew };
  }
}

export const parallelogramScene: Scene3DDefinition = {
  id: 'math-parallelogram',
  title: '平行四边形',
  subject: '数学',
  grade: '8下',
  icon: '🔷',
  tagline: '对边相等、对角相等、对角线互相平分——拉一拉就明白',
  keywords: ['平行四边形', '矩形', '菱形', '正方形', '对角线', '对边', '对角'],
  camera: { position: [0.5, 2.4, 9.6], target: [0.2, 1.9, 0] },
  controls: [
    { kind: 'slider', id: 'skew', label: '倾斜度', min: 0, max: 1, step: 0.01, defaultValue: 0.5 },
    {
      kind: 'select',
      id: 'family',
      label: '特殊成员',
      options: [
        { value: 'normal', label: '一般' },
        { value: 'rect', label: '矩形' },
        { value: 'rhombus', label: '菱形' },
        { value: 'square', label: '正方形' },
      ],
      defaultValue: 'normal',
    },
  ],
  steps: [
    {
      title: '什么是平行四边形',
      text: '两组对边分别平行的四边形叫做平行四边形。拖动倾斜度滑块，图形被慢慢拉斜，但两组对边始终分别平行——只要平行这个条件还在，它就还是平行四边形。顶点上标出了它的记法。',
    },
    {
      title: '对边与对角',
      text: '平行四边形的两组对边分别相等，两组对角也分别相等。看标记：相同数量的刻度线表示对边相等，相同颜色的弧线表示对角相等。来回拉动滑块验证：不管怎么变形，这个规律都成立。',
    },
    {
      title: '对角线互相平分',
      text: '连接两条对角线，它们交于一点 O。神奇的是：O 恰好是两条对角线共同的中点——AO 等于 OC，BO 等于 OD，这叫做对角线互相平分。这条性质在证明题里出场率极高。',
    },
    {
      title: '特殊成员',
      text: '矩形、菱形、正方形都是特殊的平行四边形。矩形四个角都是直角；菱形四条边都相等；正方形两者兼备。切换选择器看看：它们只是平行四边形加上额外条件后的样子。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 12);
    let step = 0;
    let skew = 0.5;
    let family: Family = 'normal';
    const cur = { w: 4, h: 2.5, dx: 0.95 };

    const root = new THREE.Group();
    ctx.scene.add(root);

    // 面片 + 四条边
    const face = new THREE.Mesh(
      new THREE.ExtrudeGeometry(),
      std('#93c5fd', { transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
    );
    root.add(face);
    const barMat = std('#334155');
    const edgeBars = [0, 1, 2, 3].map(() => new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 10), barMat));
    edgeBars.forEach((b) => root.add(b));

    // 等长刻度（最多 6 个）
    const tickPool = [0, 1, 2, 3, 4, 5].map(() => {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.06), std('#dc2626'));
      t.visible = false;
      root.add(t);
      return t;
    });

    // 对角弧线（A、C 绿；B、D 紫）
    const arcMeshes = ['#16a34a', '#9333ea', '#16a34a', '#9333ea'].map((c) => {
      const m = new THREE.Mesh(fanGeo(0.5, 0, 1), std(c, { side: THREE.DoubleSide }));
      m.visible = false;
      root.add(m);
      return m;
    });

    // 顶点标签
    const vLabels = ['A', 'B', 'C', 'D'].map((t) => {
      const l = makeLabel(t, { fontSize: 44, scale: 0.9, color: '#1e293b' });
      root.add(l);
      return l;
    });

    // 对角线（两段异色，显示“互相平分”）+ 交点 O
    const diagGroup = new THREE.Group();
    const diagMat1 = std('#f59e0b', { emissive: '#f59e0b', emissiveIntensity: 0.35 });
    const diagMat2 = std('#0ea5e9', { emissive: '#0ea5e9', emissiveIntensity: 0.35 });
    const diagBars = [
      new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 8), diagMat1),
      new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 8), diagMat1),
      new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 8), diagMat2),
      new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 8), diagMat2),
    ];
    const oMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 14, 10),
      std('#ef4444', { emissive: '#ef4444', emissiveIntensity: 0.5 }),
    );
    const oLabel = makeLabel('O', { fontSize: 42, scale: 0.9, color: '#ef4444' });
    const diagLabel = makeLabel('AO = OC，BO = OD（互相平分）', { fontSize: 38, scale: 0.9, color: '#b45309' });
    diagLabel.position.set(0.2, 4.35, 0);
    diagGroup.add(...diagBars, oMesh, oLabel, diagLabel);
    diagGroup.visible = false;
    root.add(diagGroup);

    // 直角符号（矩形 / 正方形）：每角两根小棒
    const cornerGroup = new THREE.Group();
    const cornerMat = std('#dc2626');
    const cornerBars: THREE.Mesh[] = [];
    for (let i = 0; i < 8; i++) {
      const horiz = i % 2 === 0;
      const m = new THREE.Mesh(new THREE.BoxGeometry(horiz ? 0.3 : 0.05, horiz ? 0.05 : 0.3, 0.05), cornerMat);
      cornerBars.push(m);
      cornerGroup.add(m);
    }
    cornerGroup.visible = false;
    root.add(cornerGroup);

    // 特殊成员性质标签
    const familyLabel = makeLabel('', { fontSize: 42, scale: 1 });
    familyLabel.position.set(0.2, 5.0, 0);
    familyLabel.visible = false;
    root.add(familyLabel);

    const replaceLabel = (sp: THREE.Sprite, text: string, color: string) => {
      const nl = makeLabel(text, { fontSize: 42, scale: 1, color });
      sp.material.map?.dispose();
      sp.material.dispose();
      sp.material = nl.material;
      sp.scale.copy(nl.scale);
    };

    const setBar = (bar: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, r: number) => {
      const t = cylinderBetween(a, b, r, bar.material as THREE.Material);
      bar.geometry.dispose();
      bar.geometry = t.geometry;
      bar.position.copy(t.position);
      bar.quaternion.copy(t.quaternion);
    };

    /** 依据 cur 参数重排全部几何 */
    const layout = () => {
      const { w, h, dx } = cur;
      const A = new THREE.Vector2(-w / 2 - dx / 2, Y0);
      const B = new THREE.Vector2(w / 2 - dx / 2, Y0);
      const C = new THREE.Vector2(w / 2 + dx / 2, Y0 + h);
      const D = new THREE.Vector2(-w / 2 + dx / 2, Y0 + h);
      const vs = [A, B, C, D];

      // 面片
      const sh = new THREE.Shape();
      sh.moveTo(A.x, A.y);
      sh.lineTo(B.x, B.y);
      sh.lineTo(C.x, C.y);
      sh.lineTo(D.x, D.y);
      sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: DEPTH, bevelEnabled: false });
      g.translate(0, 0, -DEPTH / 2);
      face.geometry.dispose();
      face.geometry = g;

      // 边
      const v3 = (v: THREE.Vector2) => new THREE.Vector3(v.x, v.y, 0);
      setBar(edgeBars[0], v3(A), v3(B), 0.07);
      setBar(edgeBars[1], v3(B), v3(C), 0.07);
      setBar(edgeBars[2], v3(C), v3(D), 0.07);
      setBar(edgeBars[3], v3(D), v3(A), 0.07);

      // 刻度
      const allEqual = family === 'rhombus' || family === 'square';
      const tickDefs: { x: number; y: number; ang: number; color: string }[] = [];
      const sides: [THREE.Vector2, THREE.Vector2][] = [
        [A, B],
        [B, C],
        [C, D],
        [D, A],
      ];
      sides.forEach(([p, q], si) => {
        const ang = Math.atan2(q.y - p.y, q.x - p.x);
        const mx = (p.x + q.x) / 2;
        const my = (p.y + q.y) / 2;
        if (allEqual) {
          tickDefs.push({ x: mx, y: my, ang, color: '#7c3aed' });
        } else if (si % 2 === 0) {
          tickDefs.push({ x: mx, y: my, ang, color: '#dc2626' });
        } else {
          for (const off of [-0.13, 0.13]) {
            tickDefs.push({ x: mx + Math.cos(ang) * off, y: my + Math.sin(ang) * off, ang, color: '#2563eb' });
          }
        }
      });
      tickPool.forEach((t, i) => {
        const d = tickDefs[i];
        t.visible = step >= 1 && !!d;
        if (d) {
          t.position.set(d.x, d.y, FRONT);
          t.rotation.z = d.ang;
          (t.material as THREE.MeshStandardMaterial).color.set(d.color);
        }
      });

      // 对角弧线
      const arcArgs: [THREE.Vector2, THREE.Vector2, THREE.Vector2][] = [
        [A, B, D],
        [B, A, C],
        [C, B, D],
        [D, A, C],
      ];
      arcMeshes.forEach((m, i) => {
        m.visible = step >= 1;
        const [v, p, q] = arcArgs[i];
        const { start, sweep } = vertexAngle(v, p, q);
        m.geometry.dispose();
        m.geometry = fanGeo(0.5, start, sweep);
        m.position.set(v.x, v.y, FRONT);
      });

      // 顶点标签
      const oc = new THREE.Vector2(0, Y0 + h / 2);
      vs.forEach((v, i) => {
        const out = new THREE.Vector2().subVectors(v, oc).normalize();
        vLabels[i].position.set(v.x + out.x * 0.42, v.y + out.y * 0.42, FRONT + 0.05);
      });

      // 对角线（A-O-C 一色、B-O-D 一色）
      const O = new THREE.Vector3(0, Y0 + h / 2, 0);
      setBar(diagBars[0], v3(A), O, 0.04);
      setBar(diagBars[1], O, v3(C), 0.04);
      setBar(diagBars[2], v3(B), O, 0.04);
      setBar(diagBars[3], O, v3(D), 0.04);
      oMesh.position.copy(O);
      oLabel.position.set(O.x + 0.36, O.y + 0.3, FRONT + 0.05);

      // 直角符号（仅轴对齐形态：矩形、正方形）
      const showCorner = family === 'rect' || family === 'square';
      cornerGroup.visible = showCorner;
      if (showCorner) {
        const corners: [THREE.Vector2, number, number][] = [
          [A, 1, 1],
          [B, -1, 1],
          [C, -1, -1],
          [D, 1, -1],
        ];
        corners.forEach(([v, sx, sy], ci) => {
          cornerBars[ci * 2].position.set(v.x + sx * 0.175, v.y + sy * 0.025, FRONT);
          cornerBars[ci * 2 + 1].position.set(v.x + sx * 0.025, v.y + sy * 0.175, FRONT);
        });
      }
    };
    layout();

    const refreshFamilyLabel = () => {
      if (family === 'normal') {
        familyLabel.visible = false;
        return;
      }
      familyLabel.visible = true;
      const text =
        family === 'rect'
          ? '矩形：四个角都是直角'
          : family === 'rhombus'
            ? '菱形：四条边都相等'
            : '正方形：四边相等 + 四个直角';
      replaceLabel(familyLabel, text, '#0f766e');
    };

    const applyStep = () => {
      diagGroup.visible = step >= 2;
      layout(); // 刻度/弧线可见性依赖 step
    };
    applyStep();

    return {
      setStep(i) {
        step = i;
        applyStep();
      },
      setParam(id, value) {
        if (id === 'skew') skew = Number(value);
        else if (id === 'family') {
          family = String(value) as Family;
          refreshFamilyLabel();
        }
        layout();
      },
      update(dt, elapsed) {
        const t = targetOf(family, skew);
        const pw = cur.w;
        const ph = cur.h;
        const pd = cur.dx;
        cur.w = THREE.MathUtils.damp(cur.w, t.w, 5, dt);
        cur.h = THREE.MathUtils.damp(cur.h, t.h, 5, dt);
        cur.dx = THREE.MathUtils.damp(cur.dx, t.dx, 5, dt);
        if (Math.abs(cur.w - pw) + Math.abs(cur.h - ph) + Math.abs(cur.dx - pd) > 1e-4) layout();
        oMesh.scale.setScalar(1 + 0.2 * Math.sin(elapsed * 4));
      },
      dispose() {
        ctx.scene.remove(root);
        disposeObject(root);
      },
    };
  },
};
