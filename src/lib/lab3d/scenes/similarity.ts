// ---------------------------------------------------------------------------
// 数学 · 相似三角形：A 字型缩放演示 + 影子测高应用
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, cylinderBetween, disposeObject, makeLabel, std } from '../three-utils';

const A = new THREE.Vector2(0, 4.3);
const B = new THREE.Vector2(-2.6, 0.6);
const C = new THREE.Vector2(2.6, 0.6);

function fanGeo(r: number, a1: number, sweep: number): THREE.ShapeGeometry {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0);
  sh.absarc(0, 0, r, a1, a1 + sweep, false);
  sh.lineTo(0, 0);
  return new THREE.ShapeGeometry(sh, 20);
}

/** 三角形平面填充 */
function triGeo(p: THREE.Vector2, q: THREE.Vector2, r: THREE.Vector2): THREE.ShapeGeometry {
  const sh = new THREE.Shape();
  sh.moveTo(p.x, p.y);
  sh.lineTo(q.x, q.y);
  sh.lineTo(r.x, r.y);
  sh.closePath();
  return new THREE.ShapeGeometry(sh);
}

export const similarityScene: Scene3DDefinition = {
  id: 'math-similarity',
  title: '相似三角形',
  subject: '数学',
  grade: '9下',
  icon: '🔺',
  tagline: '形状相同、大小不同：对应角相等，对应边成比例',
  keywords: ['相似', '相似三角形', '相似比', '对应边成比例', '位似', '平行线分线段'],
  camera: { position: [0, 2.8, 10.2], target: [0, 2.4, 0] },
  controls: [
    { kind: 'slider', id: 'k', label: '相似比 k', min: 0.4, max: 2, step: 0.1, defaultValue: 1.5 },
    { kind: 'button', id: 'grow', label: '▶ 缩放动画' },
  ],
  steps: [
    {
      title: '什么是相似',
      text: '对应角相等、对应边成比例的两个三角形叫做相似三角形。相似只要求形状相同，大小可以不同。看这两个共顶点的三角形：绿色的弧线标出对应角相等，对应边的比值始终不变。',
    },
    {
      title: '相似比',
      text: '相似三角形对应边的比叫做相似比，记作 k。拖动滑块改变 k：k 大于一就放大，小于一就缩小。注意相似比有顺序：大三角形与小三角形的比，和小三角形与大三角形的比，互为倒数。',
    },
    {
      title: 'A 字型',
      text: '平行于三角形一边的直线截其他两边，所得的三角形与原三角形相似。看：DE 平行于 BC，两个三角形共用一个顶角，其余角也对应相等，对应边自然成比例。这个 A 字形是相似里最常见的基本图。',
    },
    {
      title: '影子测高',
      text: '相似有什么用？同一时刻，阳光平行，物高与影长成正比。量出旗杆的影长，再量出同学的身高和影长，就能算出旗杆的高度。古人测量金字塔，用的就是这个办法。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 14);
    let step = 0;
    let k = 1.5;
    let animating = false;
    let animT = 0;
    let animFrom = 1.5;
    let lastKText = '';

    const mainGroup = new THREE.Group();
    ctx.scene.add(mainGroup);

    const setBar = (bar: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, r: number) => {
      const t = cylinderBetween(a, b, r, bar.material as THREE.Material);
      bar.geometry.dispose();
      bar.geometry = t.geometry;
      bar.position.copy(t.position);
      bar.quaternion.copy(t.quaternion);
    };
    const v3 = (v: THREE.Vector2, z = 0) => new THREE.Vector3(v.x, v.y, z);

    // ---- 大三角形 ABC ----
    const bigFill = new THREE.Mesh(triGeo(A, B, C), std('#60a5fa', { transparent: true, opacity: 0.25, side: THREE.DoubleSide }));
    mainGroup.add(bigFill);
    const bigMat = std('#1d4ed8');
    const bigBars = [0, 1, 2].map(() => new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 10), bigMat));
    bigBars.forEach((b) => mainGroup.add(b));
    setBar(bigBars[0], v3(A), v3(B), 0.05);
    setBar(bigBars[1], v3(B), v3(C), 0.05);
    setBar(bigBars[2], v3(C), v3(A), 0.05);
    const labA = makeLabel('A', { fontSize: 44, scale: 0.9, color: '#1e3a8a' });
    labA.position.set(A.x, A.y + 0.5, 0.1);
    const labB = makeLabel('B', { fontSize: 44, scale: 0.9, color: '#1e3a8a' });
    labB.position.set(B.x - 0.42, B.y - 0.1, 0.1);
    const labC = makeLabel('C', { fontSize: 44, scale: 0.9, color: '#1e3a8a' });
    labC.position.set(C.x + 0.42, C.y - 0.1, 0.1);
    mainGroup.add(labA, labB, labC);

    // 平行记号（BC、DE 上同向小箭头）
    const mkParallelMark = () => {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 10), std('#0f172a'));
      cone.rotation.z = -Math.PI / 2; // 指向 +x
      return cone;
    };
    const markBC = mkParallelMark();
    markBC.position.set((B.x + C.x) / 2, (B.y + C.y) / 2, 0.1);
    mainGroup.add(markBC);

    // B 处对应角弧线（∠ABC）
    const angBA = Math.atan2(A.y - B.y, A.x - B.x);
    const arcB = new THREE.Mesh(fanGeo(0.55, 0, angBA), std('#16a34a', { side: THREE.DoubleSide }));
    arcB.position.set(B.x, B.y, 0.06);
    mainGroup.add(arcB);
    const arcNote = makeLabel('∠ADE = ∠ABC（对应角相等）', { fontSize: 36, scale: 0.85, color: '#15803d' });
    arcNote.position.set(-0.2, 0.05, 0.1);
    mainGroup.add(arcNote);

    // ---- 小三角形 ADE（随 k 从 A 缩放，整体前移避免共面闪面）----
    const smallGroup = new THREE.Group();
    smallGroup.position.z = 0.09;
    mainGroup.add(smallGroup);
    const smallFill = new THREE.Mesh(triGeo(A, B, C), std('#fb923c', { transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
    smallGroup.add(smallFill);
    const smallMat = std('#ea580c');
    const smallBars = [0, 1, 2].map(() => new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 10), smallMat));
    smallBars.forEach((b) => smallGroup.add(b));
    const labD = makeLabel('D', { fontSize: 44, scale: 0.9, color: '#9a3412' });
    const labE = makeLabel('E', { fontSize: 44, scale: 0.9, color: '#9a3412' });
    smallGroup.add(labD, labE);
    const markDE = mkParallelMark();
    smallGroup.add(markDE);
    const arcD = new THREE.Mesh(fanGeo(0.45, 0, angBA), std('#16a34a', { side: THREE.DoubleSide }));
    smallGroup.add(arcD);

    // 比例标签
    const ratioLabel = makeLabel('', { fontSize: 42, scale: 1, color: '#0f766e' });
    ratioLabel.position.set(0, 5.4, 0);
    mainGroup.add(ratioLabel);

    const replaceLabel = (sp: THREE.Sprite, text: string, color: string) => {
      const nl = makeLabel(text, { fontSize: 42, scale: 1, color });
      sp.material.map?.dispose();
      sp.material.dispose();
      sp.material = nl.material;
      sp.scale.copy(nl.scale);
    };

    const layout = () => {
      const D = new THREE.Vector2().lerpVectors(A, B, k);
      const E = new THREE.Vector2().lerpVectors(A, C, k);
      smallFill.geometry.dispose();
      smallFill.geometry = triGeo(A, D, E);
      setBar(smallBars[0], v3(A), v3(D), 0.05);
      setBar(smallBars[1], v3(D), v3(E), 0.05);
      setBar(smallBars[2], v3(E), v3(A), 0.05);
      labD.position.set(D.x - 0.42, D.y + 0.12, 0.1);
      labE.position.set(E.x + 0.42, E.y + 0.12, 0.1);
      markDE.position.set((D.x + E.x) / 2, (D.y + E.y) / 2, 0.1);
      arcD.position.set(D.x, D.y, 0.06);
      const kt = k.toFixed(1);
      if (kt !== lastKText) {
        lastKText = kt;
        replaceLabel(ratioLabel, `AD/AB = AE/AC = DE/BC = ${kt}`, '#0f766e');
      }
    };
    layout();

    // ---- 步骤四：影子测高 ----
    const appGroup = new THREE.Group();
    appGroup.visible = false;
    ctx.scene.add(appGroup);
    {
      const ground = new THREE.Mesh(new THREE.BoxGeometry(9, 0.05, 0.05), std('#334155'));
      ground.position.set(0, 0.55, 0);
      appGroup.add(ground);
      // 旗杆：高 3.4，影长 3
      const poleMat = std('#78716c');
      const pole = cylinderBetween(new THREE.Vector3(-2.2, 0.55, 0), new THREE.Vector3(-2.2, 3.95, 0), 0.06, poleMat);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), std('#dc2626'));
      knob.position.set(-2.2, 3.95, 0);
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.32, 0.03), std('#ef4444'));
      flag.position.set(-1.9, 3.72, 0);
      const poleShadow = new THREE.Mesh(new THREE.BoxGeometry(3, 0.04, 0.3), std('#94a3b8'));
      poleShadow.position.set(-0.7, 0.53, 0);
      const poleRay = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-2.2, 3.95, 0.1), new THREE.Vector3(0.8, 0.55, 0.1)]),
        new THREE.LineDashedMaterial({ color: '#f59e0b', dashSize: 0.2, gapSize: 0.13 }),
      );
      poleRay.computeLineDistances();
      const poleTri = new THREE.Mesh(
        triGeo(new THREE.Vector2(-2.2, 0.55), new THREE.Vector2(-2.2, 3.95), new THREE.Vector2(0.8, 0.55)),
        std('#fbbf24', { transparent: true, opacity: 0.18, side: THREE.DoubleSide }),
      );
      poleTri.position.z = 0.03;
      appGroup.add(pole, knob, flag, poleShadow, poleRay, poleTri);
      // 同学：高 1.7，影长 1.5
      const body = cylinderBetween(new THREE.Vector3(2.6, 0.55, 0), new THREE.Vector3(2.6, 2.0, 0), 0.1, std('#2563eb'));
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), std('#fcd34d'));
      head.position.set(2.6, 2.17, 0);
      const kidShadow = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.04, 0.3), std('#94a3b8'));
      kidShadow.position.set(3.35, 0.53, 0);
      const kidRay = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(2.6, 2.25, 0.1), new THREE.Vector3(4.1, 0.55, 0.1)]),
        new THREE.LineDashedMaterial({ color: '#f59e0b', dashSize: 0.2, gapSize: 0.13 }),
      );
      kidRay.computeLineDistances();
      const kidTri = new THREE.Mesh(
        triGeo(new THREE.Vector2(2.6, 0.55), new THREE.Vector2(2.6, 2.25), new THREE.Vector2(4.1, 0.55)),
        std('#4ade80', { transparent: true, opacity: 0.2, side: THREE.DoubleSide }),
      );
      kidTri.position.z = 0.03;
      appGroup.add(body, head, kidShadow, kidRay, kidTri);
      // 太阳
      const sun = new THREE.Mesh(
        new THREE.SphereGeometry(0.34, 16, 12),
        std('#fbbf24', { emissive: '#f59e0b', emissiveIntensity: 0.9 }),
      );
      sun.position.set(4.4, 4.7, 0);
      appGroup.add(sun);
      // 标签
      const labels: [string, number, number, string][] = [
        ['旗杆 3.4', -3.35, 2.3, '#44403c'],
        ['影长 3', -0.7, 0.13, '#44403c'],
        ['同学 1.7', 3.8, 1.5, '#1d4ed8'],
        ['影长 1.5', 3.35, 0.13, '#44403c'],
        ['太阳', 4.4, 5.35, '#b45309'],
        ['同一时刻：物高 ÷ 影长 相等', 0.1, 5.0, '#0f766e'],
        ['旗杆高 = 3 × 1.7 ÷ 1.5', 0.1, 4.35, '#0f766e'],
      ];
      labels.forEach(([t, x, y, c]) => {
        const l = makeLabel(t, { fontSize: 38, scale: 0.9, color: c });
        l.position.set(x, y, 0.1);
        appGroup.add(l);
      });
    }

    const applyStep = () => {
      mainGroup.visible = step < 3;
      appGroup.visible = step === 3;
    };
    applyStep();

    return {
      setStep(i) {
        step = i;
        applyStep();
      },
      setParam(id, value) {
        if (id === 'k') {
          k = THREE.MathUtils.clamp(Number(value), 0.4, 2);
          animating = false;
          layout();
        } else if (id === 'grow') {
          animating = true;
          animT = 0;
          animFrom = k;
        }
      },
      update(dt) {
        if (animating) {
          animT += dt / 6;
          const p = Math.min(animT, 1);
          const smooth = (x: number) => x * x * (3 - 2 * x);
          if (p < 0.4) k = THREE.MathUtils.lerp(animFrom, 2, smooth(p / 0.4));
          else if (p < 0.8) k = THREE.MathUtils.lerp(2, 0.4, smooth((p - 0.4) / 0.4));
          else k = THREE.MathUtils.lerp(0.4, animFrom, smooth((p - 0.8) / 0.2));
          if (animT >= 1) animating = false;
          layout();
        }
      },
      dispose() {
        ctx.scene.remove(mainGroup, appGroup);
        disposeObject(mainGroup);
        disposeObject(appGroup);
      },
    };
  },
};
