// ---------------------------------------------------------------------------
// 数学 · 三角形的内角和：撕角拼平角实验 + 三边关系演示
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, cylinderBetween, disposeObject, makeLabel, std } from '../three-utils';

const DEPTH = 0.16; // 三角形厚度
const SECTOR_R = 0.55; // 角扇形半径
const FRONT = DEPTH / 2 + 0.006; // 扇形贴片所在 z

const VA = new THREE.Vector2(-2.2, 0.1);
const VB = new THREE.Vector2(2.2, 0.1);
const vcOf = (shape: number) => new THREE.Vector2(THREE.MathUtils.lerp(-1.7, 1.7, shape), 2.6);

/** 扇形面片：从 a1 逆时针扫 sweep 弧度 */
function fanGeo(r: number, a1: number, sweep: number): THREE.ShapeGeometry {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0);
  sh.absarc(0, 0, r, a1, a1 + sweep, false);
  sh.lineTo(0, 0);
  return new THREE.ShapeGeometry(sh, 20);
}

/** 顶点 v 处由 v→p1、v→p2 张成的内角（start, sweep，sweep ∈ (0, π)） */
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

export const triangleScene: Scene3DDefinition = {
  id: 'math-triangle',
  title: '三角形的内角和',
  subject: '数学',
  grade: '8上',
  icon: '🔺',
  tagline: '把三个角撕下来拼一拼：正好拼成一个平角',
  keywords: ['三角形', '内角和', '三角形内角和', '外角', '三边关系', '多边形'],
  camera: { position: [0, 2.7, 9.2], target: [0, 2.3, 0] },
  controls: [
    { kind: 'slider', id: 'shape', label: '改变形状', min: 0, max: 1, step: 0.01, defaultValue: 0.3 },
    { kind: 'button', id: 'tear', label: '✂️ 撕角拼合' },
  ],
  steps: [
    {
      title: '三角形的三要素',
      text: '三角形有三个顶点、三条边和三个内角。拖动滑块改变顶点的位置，不管形状怎么变，它始终是由三条线段首尾相连围成的图形。认准顶点、边、角这三要素，是研究三角形的第一步。',
    },
    {
      title: '撕角拼合实验',
      text: '点击撕角按钮，把三个内角撕下来，平移拼到一起。看到了吗？三个角严丝合缝地拼成一个平角，也就是一百八十度。换别的形状再撕一次，结果还是一样——三角形内角和永远是一百八十度。',
    },
    {
      title: '平角的秘密',
      text: '为什么一定是一百八十度？过顶点作底边的平行线：内错角相等，左边这个角等于左下角的角，右边这个角等于右下角的角，再加上顶角本身，三个角正好拼成一个平角。证明就完成了。',
    },
    {
      title: '三边关系',
      text: '三根小棒能围成三角形吗？拖动滑块改变红棒的长度：只要两条短边之和大于第三边，小棒就能首尾相接；否则怎么摆弄都够不着。记住：三角形任意两边之和大于第三边。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 12);
    let step = 0;
    let shape = 0.3;
    let tearOn = false;
    let tearT = 0;

    const triGroup = new THREE.Group();
    ctx.scene.add(triGroup);

    // 三角形本体（挤出厚度）+ 描边
    const triMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(), std('#fde68a'));
    const edges = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: '#78350f' }),
    );
    triGroup.add(triMesh, edges);

    // 三个内角扇形（随撕角动画飞出的主体）
    interface Sector {
      group: THREE.Group;
      fan: THREE.Mesh;
      home: THREE.Vector3;
      targetRot: number;
    }
    const sectorCols = ['#f87171', '#4ade80', '#60a5fa'];
    const sectorNames = ['∠A', '∠B', '∠C'];
    const sectors: Sector[] = sectorCols.map((col, i) => {
      const group = new THREE.Group();
      const fan = new THREE.Mesh(fanGeo(SECTOR_R, 0, 1), std(col, { side: THREE.DoubleSide }));
      const lab = makeLabel(sectorNames[i], { fontSize: 40, scale: 0.85 });
      group.add(fan, lab);
      triGroup.add(group);
      return { group, fan, home: new THREE.Vector3(), targetRot: 0 };
    });

    // 顶点标签
    const vertexLabels = ['A', 'B', 'C'].map((t, i) => {
      const l = makeLabel(t, { fontSize: 44, scale: 0.9, color: sectorCols[i] });
      triGroup.add(l);
      return l;
    });
    // 边标签（仅步骤一显示）
    const sideLabels = ['a', 'b', 'c'].map((t) => {
      const l = makeLabel(`边 ${t}`, { fontSize: 36, scale: 0.8, color: '#475569' });
      triGroup.add(l);
      return l;
    });

    // 拼合目标：平角基准线 + 标签
    const ASM = new THREE.Vector3(0, 4.35, FRONT);
    const baseline = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.045, 0.045), std('#334155'));
    baseline.position.set(0, ASM.y, FRONT - 0.01);
    const asmLabel = makeLabel('三个角拼成一个平角 = 180°', { fontSize: 42, scale: 1, color: '#0f766e' });
    asmLabel.position.set(0, 5.2, FRONT);
    triGroup.add(baseline, asmLabel);

    // 步骤三：过 C 作 AB 的平行线 + 内错角弧线
    const paraGroup = new THREE.Group();
    triGroup.add(paraGroup);
    const paraLineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-3.2, 0, 0),
      new THREE.Vector3(3.2, 0, 0),
    ]);
    const paraLine = new THREE.Line(
      paraLineGeo,
      new THREE.LineDashedMaterial({ color: '#7c3aed', dashSize: 0.22, gapSize: 0.14 }),
    );
    paraLine.computeLineDistances();
    paraGroup.add(paraLine);
    const arcA = new THREE.Mesh(fanGeo(0.42, Math.PI, 1), std(sectorCols[0], { side: THREE.DoubleSide }));
    const arcB = new THREE.Mesh(fanGeo(0.42, 0, 1), std(sectorCols[1], { side: THREE.DoubleSide }));
    paraGroup.add(arcA, arcB);
    const paraLabel = makeLabel('过 C 作 AB 的平行线：内错角相等', {
      fontSize: 36,
      scale: 0.9,
      color: '#7c3aed',
    });
    paraLabel.position.set(0, 0.55, 0);
    paraGroup.add(paraLabel);

    // ---------------- 步骤四：三根小棒 ----------------
    const stickGroup = new THREE.Group();
    ctx.scene.add(stickGroup);
    const stickA = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 10), std('#2563eb'));
    const stickB = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 10), std('#16a34a'));
    const stickC = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 10), std('#dc2626'));
    const hingeL = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), std('#0f172a'));
    const hingeR = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), std('#0f172a'));
    stickGroup.add(stickA, stickB, stickC, hingeL, hingeR);
    const gapLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({ color: '#dc2626', dashSize: 0.16, gapSize: 0.12 }),
    );
    const gapLabel = makeLabel('够不着！', { fontSize: 40, scale: 0.9, color: '#dc2626' });
    stickGroup.add(gapLine, gapLabel);
    const labA = makeLabel('a = 1.2', { fontSize: 36, scale: 0.8, color: '#2563eb' });
    const labB = makeLabel('b = 1.6', { fontSize: 36, scale: 0.8, color: '#16a34a' });
    const labC = makeLabel('c = 1.8', { fontSize: 36, scale: 0.8, color: '#dc2626' });
    stickGroup.add(labA, labB, labC);
    const ruleLabel = makeLabel('a + b > c 才能围成三角形', { fontSize: 42, scale: 1, color: '#0f766e' });
    ruleLabel.position.set(0, 3.6, 0);
    stickGroup.add(ruleLabel);
    const statusLabel = makeLabel('', { fontSize: 40, scale: 0.95 });
    statusLabel.position.set(0, 2.95, 0);
    stickGroup.add(statusLabel);

    const replaceLabel = (sp: THREE.Sprite, text: string, color: string) => {
      const nl = makeLabel(text, { fontSize: 40, scale: 0.95, color });
      sp.material.map?.dispose();
      sp.material.dispose();
      sp.material = nl.material;
      sp.scale.copy(nl.scale);
    };

    const setBar = (bar: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) => {
      const t = cylinderBetween(a, b, 0.07, bar.material as THREE.Material);
      bar.geometry.dispose();
      bar.geometry = t.geometry;
      bar.position.copy(t.position);
      bar.quaternion.copy(t.quaternion);
    };

    const layoutSticks = () => {
      const a = 1.2;
      const b = 1.6;
      const c = 1.0 + shape * 2.6; // 红棒随形状滑块变长
      const y = 1.15;
      const L = new THREE.Vector3(-c / 2, y, 0);
      const R = new THREE.Vector3(c / 2, y, 0);
      setBar(stickC, L, R);
      hingeL.position.copy(L);
      hingeR.position.copy(R);
      const valid = a + b > c + 0.001 && c > Math.abs(a - b) + 0.001;
      let Ta: THREE.Vector3;
      let Tb: THREE.Vector3;
      if (valid) {
        const cosT = THREE.MathUtils.clamp((a * a + c * c - b * b) / (2 * a * c), -1, 1);
        const ang = Math.acos(cosT);
        Ta = new THREE.Vector3(L.x + a * Math.cos(ang), y + a * Math.sin(ang), 0);
        Tb = Ta.clone();
      } else {
        // 张到最大也够不着：留一道缺口
        Ta = new THREE.Vector3(L.x + a * Math.cos(0.96), y + a * Math.sin(0.96), 0);
        Tb = new THREE.Vector3(R.x + b * Math.cos(Math.PI - 0.96), y + b * Math.sin(0.96), 0);
      }
      setBar(stickA, L, Ta);
      setBar(stickB, R, Tb);
      gapLine.visible = !valid;
      gapLabel.visible = !valid;
      if (!valid) {
        gapLine.geometry.dispose();
        gapLine.geometry = new THREE.BufferGeometry().setFromPoints([Ta, Tb]);
        gapLine.computeLineDistances();
        gapLabel.position.copy(Ta).lerp(Tb, 0.5).add(new THREE.Vector3(0, 0.45, 0));
      }
      labA.position.copy(L).lerp(Ta, 0.55).add(new THREE.Vector3(-0.35, 0.2, 0));
      labB.position.copy(R).lerp(Tb, 0.55).add(new THREE.Vector3(0.35, 0.2, 0));
      labC.position.set(0, y - 0.42, 0);
      replaceLabel(labC, `c = ${c.toFixed(1)}`, '#dc2626');
      replaceLabel(
        statusLabel,
        valid ? `a + b = 2.8 > c = ${c.toFixed(1)} ✅ 能围成` : `a + b = 2.8 ≤ c = ${c.toFixed(1)} ❌ 围不成`,
        valid ? '#15803d' : '#b91c1c',
      );
    };

    /** 按当前 shape 重建三角形、扇形与标注 */
    const rebuild = () => {
      const VC = vcOf(shape);
      const sh = new THREE.Shape();
      sh.moveTo(VA.x, VA.y);
      sh.lineTo(VB.x, VB.y);
      sh.lineTo(VC.x, VC.y);
      sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: DEPTH, bevelEnabled: false });
      g.translate(0, 0, -DEPTH / 2);
      triMesh.geometry.dispose();
      triMesh.geometry = g;
      edges.geometry.dispose();
      edges.geometry = new THREE.EdgesGeometry(g);

      // 三个内角扇形
      const verts = [VA, VB, VC];
      const nbrs: [THREE.Vector2, THREE.Vector2][] = [
        [VB, VC],
        [VA, VC],
        [VA, VB],
      ];
      const angles = verts.map((v, i) => vertexAngle(v, nbrs[i][0], nbrs[i][1]));
      // 拼合到平角：从 π 开始依次排布
      const S = [Math.PI, Math.PI - angles[0].sweep, Math.PI - angles[0].sweep - angles[1].sweep];
      sectors.forEach((s, i) => {
        const { start, sweep } = angles[i];
        s.fan.geometry.dispose();
        s.fan.geometry = fanGeo(SECTOR_R, start, sweep);
        s.home.set(verts[i].x, verts[i].y, FRONT);
        s.targetRot = S[i] - start;
        const bis = start + sweep / 2;
        s.group.children[1].position.set(
          Math.cos(bis) * (SECTOR_R + 0.36),
          Math.sin(bis) * (SECTOR_R + 0.36),
          0.02,
        );
      });

      // 顶点标签：沿离心方向外移
      const centroid = new THREE.Vector2().add(VA).add(VB).add(VC).multiplyScalar(1 / 3);
      verts.forEach((v, i) => {
        const out = new THREE.Vector2().subVectors(v, centroid).normalize();
        vertexLabels[i].position.set(v.x + out.x * 0.48, v.y + out.y * 0.48, FRONT + 0.05);
      });

      // 边标签：中点沿外法线外移
      const edgeDefs: [THREE.Vector2, THREE.Vector2, THREE.Vector2][] = [
        [VB, VC, VA],
        [VA, VC, VB],
        [VA, VB, VC],
      ];
      edgeDefs.forEach(([p, q, opp], i) => {
        const mid = new THREE.Vector2().addVectors(p, q).multiplyScalar(0.5);
        const d = new THREE.Vector2().subVectors(q, p);
        const n = new THREE.Vector2(-d.y, d.x).normalize();
        if (n.dot(new THREE.Vector2().subVectors(opp, mid)) > 0) n.negate();
        sideLabels[i].position.set(mid.x + n.x * 0.45, mid.y + n.y * 0.45, FRONT + 0.05);
      });

      // 过 C 的平行线与内错角弧线
      paraGroup.position.set(VC.x, VC.y, 0.03);
      const dirCA = Math.atan2(VA.y - VC.y, VA.x - VC.x); // ∈ (-π, 0)
      const dirCB = Math.atan2(VB.y - VC.y, VB.x - VC.x);
      arcA.geometry.dispose();
      arcA.geometry = fanGeo(0.42, Math.PI, dirCA + Math.PI); // 左：从水平向左到 CA
      arcB.geometry.dispose();
      arcB.geometry = fanGeo(0.42, dirCB, -dirCB); // 右：从 CB 到水平向右

      layoutSticks();
    };
    rebuild();

    const applyStep = () => {
      const inSticks = step === 3;
      triGroup.visible = !inSticks;
      stickGroup.visible = inSticks;
      sideLabels.forEach((l) => {
        l.visible = step === 0;
      });
      paraGroup.visible = step === 2;
      // 步骤二自动撕角；离开即归位
      tearOn = step === 1;
    };
    applyStep();

    return {
      setStep(i) {
        step = i;
        applyStep();
      },
      setParam(id, value) {
        if (id === 'shape') {
          shape = Number(value);
          rebuild();
        } else if (id === 'tear') {
          tearOn = !tearOn;
        }
      },
      update(dt) {
        tearT = THREE.MathUtils.damp(tearT, tearOn ? 1 : 0, 3.2, dt);
        const e = tearT * tearT * (3 - 2 * tearT); // smoothstep，让飞行更柔
        sectors.forEach((s) => {
          s.group.position.lerpVectors(s.home, ASM, e);
          s.group.position.z += Math.sin(e * Math.PI) * 0.35; // 飞行时微微抬起
          s.group.rotation.z = s.targetRot * e;
        });
        const asmVisible = e > 0.35;
        baseline.visible = asmVisible;
        asmLabel.visible = asmVisible;
      },
      dispose() {
        ctx.scene.remove(triGroup, stickGroup);
        disposeObject(triGroup);
        disposeObject(stickGroup);
      },
    };
  },
};
