// ---------------------------------------------------------------------------
// 数学 · 旋转与中心对称：旋转三要素、对应点性质、180° 特例
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, cylinderBetween, disposeObject, makeLabel, std } from '../three-utils';

type CenterKind = 'vertex' | 'inside' | 'outside';

const DEPTH = 0.14;
const FRONT = DEPTH / 2 + 0.05;

const A = new THREE.Vector2(-2.2, 0.6);
const B = new THREE.Vector2(2.2, 0.6);
const C = new THREE.Vector2(0.9, 2.9);
const CENTROID = new THREE.Vector2(
  (A.x + B.x + C.x) / 3,
  (A.y + B.y + C.y) / 3,
);
const CENTERS: Record<CenterKind, THREE.Vector2> = {
  vertex: A.clone(),
  inside: CENTROID.clone(),
  outside: new THREE.Vector2(3.3, 3.3),
};

function fanGeo(r: number, a1: number, sweep: number): THREE.ShapeGeometry {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0);
  sh.absarc(0, 0, r, a1, a1 + sweep, false);
  sh.lineTo(0, 0);
  return new THREE.ShapeGeometry(sh, 24);
}

export const rotationScene: Scene3DDefinition = {
  id: 'math-rotation',
  title: '旋转与中心对称',
  subject: '数学',
  grade: '9上',
  icon: '🌀',
  tagline: '绕定点转动一个角度——旋转三要素与中心对称',
  keywords: ['旋转', '旋转中心', '旋转角', '中心对称', '中心对称图形', '旋转对称'],
  camera: { position: [0.3, 2.5, 9.6], target: [0.2, 1.7, 0] },
  controls: [
    { kind: 'slider', id: 'angle', label: '旋转角', min: 0, max: 360, step: 1, defaultValue: 0, unit: '°' },
    {
      kind: 'select',
      id: 'center',
      label: '旋转中心',
      options: [
        { value: 'vertex', label: '在顶点' },
        { value: 'inside', label: '在内部' },
        { value: 'outside', label: '在外部' },
      ],
      defaultValue: 'inside',
    },
    { kind: 'button', id: 'spin', label: '🔄 转一周' },
  ],
  steps: [
    {
      title: '旋转三要素',
      text: '把一个图形绕着一个定点转动一个角度，这样的运动叫做旋转。这个定点叫旋转中心，转动的角叫旋转角，再加上旋转方向，合称旋转三要素。拖动滑块，看半透明的影子绕着红点转动，切换旋转中心再试试。',
    },
    {
      title: '对应点等距',
      text: '旋转不改变图形的形状和大小。盯住对应点 C 和 C 撇：它们到旋转中心的距离始终相等，所以点的轨迹是以 O 为圆心的一段圆弧。旋转前后的两个图形一定全等。',
    },
    {
      title: '旋转角',
      text: '连接一对对应点和旋转中心，这两条连线的夹角就等于旋转角。不管选哪一对对应点，夹角都一样大。所以度量旋转角的方法很简单：找一对对应点，量它们与中心连线的夹角。',
    },
    {
      title: '中心对称',
      text: '把旋转角拖到一百八十度：这时的旋转有个专门的名字，叫中心对称。如果一个图形绕某点旋转一百八十度后能与自身重合，比如平行四边形，它就是中心对称图形，那个点就是对称中心。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 12);
    let step = 0;
    let angle = 0; // 角度制
    let center: CenterKind = 'inside';
    let spinning = false;
    let spinT = 0;
    let lastKey = '';

    // 原三角形
    const triGroup = new THREE.Group();
    const sh = new THREE.Shape();
    sh.moveTo(A.x, A.y);
    sh.lineTo(B.x, B.y);
    sh.lineTo(C.x, C.y);
    sh.closePath();
    const triGeo = new THREE.ExtrudeGeometry(sh, { depth: DEPTH, bevelEnabled: false });
    triGeo.translate(0, 0, -DEPTH / 2);
    const triMesh = new THREE.Mesh(triGeo, std('#93c5fd'));
    const triEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(triGeo),
      new THREE.LineBasicMaterial({ color: '#1e3a8a' }),
    );
    triGroup.add(triMesh, triEdges);
    const names: [string, THREE.Vector2][] = [
      ['A', A],
      ['B', B],
      ['C', C],
    ];
    names.forEach(([t, v]) => {
      const out = new THREE.Vector2().subVectors(v, CENTROID).normalize();
      const l = makeLabel(t, { fontSize: 44, scale: 0.9, color: '#1e3a8a' });
      l.position.set(v.x + out.x * 0.46, v.y + out.y * 0.46, FRONT + 0.08);
      triGroup.add(l);
    });
    ctx.scene.add(triGroup);

    // 旋转副本（绕 O 转 θ）
    const ghostGroup = new THREE.Group();
    const ghostMat = std('#fb923c', { transparent: true, opacity: 0.5, emissive: '#ea580c', emissiveIntensity: 0.15 });
    const ghostMesh = new THREE.Mesh(triGeo, ghostMat);
    const ghostEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(triGeo),
      new THREE.LineBasicMaterial({ color: '#9a3412' }),
    );
    ghostGroup.add(ghostMesh, ghostEdges);
    const cPrimeLabel = makeLabel("C'", { fontSize: 44, scale: 0.9, color: '#9a3412' });
    ghostGroup.add(cPrimeLabel);
    ctx.scene.add(ghostGroup);

    // 旋转中心 O
    const oMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 16, 12),
      std('#dc2626', { emissive: '#dc2626', emissiveIntensity: 0.5 }),
    );
    const oLabel = makeLabel('O', { fontSize: 44, scale: 0.9, color: '#dc2626' });
    ctx.scene.add(oMesh, oLabel);

    // 对应点距离（OC、OC'）+ 轨迹圆弧 + 旋转角扇面
    const distGroup = new THREE.Group();
    const ocBar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 8), std('#16a34a'));
    const ocpBar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 8), std('#16a34a'));
    const distLabel = makeLabel("OC = OC'", { fontSize: 38, scale: 0.9, color: '#15803d' });
    distGroup.add(ocBar, ocpBar, distLabel);
    ctx.scene.add(distGroup);

    const arcLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({ color: '#7c3aed', dashSize: 0.16, gapSize: 0.11 }),
    );
    ctx.scene.add(arcLine);

    const angleGroup = new THREE.Group();
    const angleFan = new THREE.Mesh(fanGeo(0.5, 0, 0.5), std('#c4b5fd', { side: THREE.DoubleSide, transparent: true, opacity: 0.75 }));
    const angleLabel = makeLabel("∠COC' = 旋转角", { fontSize: 36, scale: 0.85, color: '#7c3aed' });
    angleGroup.add(angleFan, angleLabel);
    ctx.scene.add(angleGroup);

    // 顶部读数与中心对称提示
    const degLabel = makeLabel('', { fontSize: 42, scale: 1 });
    degLabel.position.set(0.2, 4.6, 0);
    ctx.scene.add(degLabel);
    const csLabel = makeLabel('旋转 180° —— 中心对称！', { fontSize: 44, scale: 1.05, color: '#dc2626' });
    csLabel.position.set(0.2, 3.95, 0);
    ctx.scene.add(csLabel);
    const hintLabel = makeLabel('把旋转角拖到 180° 试试', { fontSize: 38, scale: 0.9, color: '#b45309' });
    hintLabel.position.set(0.2, 3.95, 0);
    ctx.scene.add(hintLabel);

    const replaceLabel = (sp: THREE.Sprite, text: string, color: string, fontSize = 42, scale = 1) => {
      const nl = makeLabel(text, { fontSize, scale, color });
      sp.material.map?.dispose();
      sp.material.dispose();
      sp.material = nl.material;
      sp.scale.copy(nl.scale);
    };

    const setBar = (bar: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) => {
      const t = cylinderBetween(a, b, 0.035, bar.material as THREE.Material);
      bar.geometry.dispose();
      bar.geometry = t.geometry;
      bar.position.copy(t.position);
      bar.quaternion.copy(t.quaternion);
    };

    /** 依据 angle / center 重排所有动态元素 */
    const layout = () => {
      const O = CENTERS[center];
      const th = (angle * Math.PI) / 180;
      const O3 = new THREE.Vector3(O.x, O.y, 0);
      oMesh.position.copy(O3);
      oLabel.position.set(O.x + 0.34, O.y - 0.3, FRONT + 0.1);

      // 副本：组在 O，网格反向偏移，旋转组即绕 O 转
      ghostGroup.position.copy(O3);
      ghostGroup.rotation.z = th;
      ghostMesh.position.set(-O.x, -O.y, 0);
      ghostEdges.position.copy(ghostMesh.position);
      // C' 标签随副本走：局部坐标 = 未旋转时的相对位置
      const outC = new THREE.Vector2().subVectors(C, CENTROID).normalize();
      cPrimeLabel.position.set(C.x - O.x + outC.x * 0.5, C.y - O.y + outC.y * 0.5, FRONT + 0.08);

      // 对应点 C 与其像 C'
      const phi0 = Math.atan2(C.y - O.y, C.x - O.x);
      const r = Math.hypot(C.x - O.x, C.y - O.y);
      const Cp = new THREE.Vector3(O.x + r * Math.cos(phi0 + th), O.y + r * Math.sin(phi0 + th), 0);
      setBar(ocBar, new THREE.Vector3(O.x, O.y, FRONT), new THREE.Vector3(C.x, C.y, FRONT));
      setBar(ocpBar, new THREE.Vector3(O.x, O.y, FRONT), new THREE.Vector3(Cp.x, Cp.y, FRONT));
      distLabel.position.copy(Cp).add(new THREE.Vector3(0.55, 0.42, FRONT));

      // 轨迹圆弧
      arcLine.visible = angle > 2;
      if (arcLine.visible) {
        const n = Math.max(6, Math.ceil((angle / 360) * 72));
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= n; i++) {
          const p = phi0 + (th * i) / n;
          pts.push(new THREE.Vector3(O.x + r * Math.cos(p), O.y + r * Math.sin(p), FRONT));
        }
        arcLine.geometry.dispose();
        arcLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
        arcLine.computeLineDistances();
      }

      // 旋转角扇面
      angleFan.visible = angle > 2;
      if (angleFan.visible) {
        angleFan.geometry.dispose();
        angleFan.geometry = fanGeo(0.5, phi0, th);
        angleFan.position.copy(O3).setZ(FRONT + 0.02);
        const bis = phi0 + th / 2;
        angleLabel.position.set(O.x + Math.cos(bis) * 1.05, O.y + Math.sin(bis) * 1.05, FRONT + 0.06);
      }
    };
    layout();

    const applyStep = () => {
      distGroup.visible = step >= 1;
      angleGroup.visible = step >= 2;
    };
    applyStep();

    let lastDeg = -1;

    return {
      setStep(i) {
        step = i;
        applyStep();
      },
      setParam(id, value) {
        if (id === 'angle') {
          angle = THREE.MathUtils.clamp(Number(value), 0, 360);
          spinning = false;
          layout();
        } else if (id === 'center') {
          center = String(value) as CenterKind;
          layout();
        } else if (id === 'spin') {
          spinning = true;
          spinT = 0;
          angle = 0;
        }
      },
      update(dt, elapsed) {
        if (spinning) {
          spinT += dt / 3;
          const p = Math.min(spinT, 1);
          const e = p * p * (3 - 2 * p);
          angle = 360 * e;
          if (spinT >= 1) {
            spinning = false;
            angle = 0;
          }
        }
        const key = `${angle.toFixed(3)}|${center}`;
        if (key !== lastKey) {
          lastKey = key;
          layout();
        }
        const deg = Math.round(angle);
        if (deg !== lastDeg) {
          lastDeg = deg;
          replaceLabel(degLabel, `旋转角 = ${deg}°`, '#0f172a');
        }
        const at180 = deg === 180;
        csLabel.visible = at180;
        hintLabel.visible = step === 3 && !at180;
        ghostMat.emissiveIntensity = at180 ? 0.55 + 0.3 * Math.sin(elapsed * 10) : 0.15;
        oMesh.scale.setScalar(1 + 0.12 * Math.sin(elapsed * 3));
      },
      dispose() {
        ctx.scene.remove(
          triGroup,
          ghostGroup,
          oMesh,
          oLabel,
          distGroup,
          arcLine,
          angleGroup,
          degLabel,
          csLabel,
          hintLabel,
        );
        disposeObject(triGroup);
        disposeObject(ghostGroup);
        disposeObject(oMesh);
        disposeObject(oLabel);
        disposeObject(distGroup);
        disposeObject(arcLine);
        disposeObject(angleGroup);
        disposeObject(degLabel);
        disposeObject(csLabel);
        disposeObject(hintLabel);
      },
    };
  },
};
