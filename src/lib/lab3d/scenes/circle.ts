// ---------------------------------------------------------------------------
// 数学 · 圆心角与圆周角：同弧所对圆周角是圆心角的一半 + 垂径定理
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, cylinderBetween, disposeObject, makeLabel, std } from '../three-utils';

type Theorem = 'inscribed' | 'chord';
const R = 3; // 圆半径
const DEG = Math.PI / 180;

export const circleScene: Scene3DDefinition = {
  id: 'math-circle',
  title: '圆心角与圆周角',
  subject: '数学',
  grade: '9上',
  icon: '⭕',
  tagline: '同弧所对的圆周角，恰好是圆心角的一半',
  keywords: ['圆', '圆心', '半径', '直径', '弦', '弧', '圆心角', '圆周角', '垂径定理', '切线'],
  camera: { position: [0, 2.8, 9.5], target: [0, 2.3, 0] },
  controls: [
    { kind: 'slider', id: 'p', label: '拖动点 P', min: 0, max: 1, step: 0.01, defaultValue: 0.5 },
    {
      kind: 'select',
      id: 'theorem',
      label: '定理',
      options: [
        { value: 'inscribed', label: '圆周角定理' },
        { value: 'chord', label: '垂径定理' },
      ],
      defaultValue: 'inscribed',
    },
  ],
  steps: [
    {
      title: '圆的基本元素',
      text: '圆心 O 确定圆的位置，半径确定圆的大小。连接圆上两点的线段叫弦，比如 AB；圆上两点之间的部分叫弧。直径是经过圆心的最长的弦，长度是半径的两倍。',
    },
    {
      title: '圆心角',
      text: '顶点在圆心的角叫圆心角，比如角 AOB。橙色弧线标出了它对着的那段弧 AB。这段弧固定不动，圆心角也就固定，是一百二十度。',
    },
    {
      title: '圆周角定理',
      text: '顶点在圆上、两边都和圆相交的角叫圆周角。拖动点 P 在优弧上滑一滑：不管 P 停在哪，绿色的角 APB 始终是角 AOB 的一半，六十度。同弧所对的圆周角，等于圆心角的一半。',
    },
    {
      title: '垂径定理',
      text: '把定理切换成垂径定理：直径 CD 垂直于弦 AB，垂足是 M。可以看到 AM 等于 MB，弧 AC 等于弧 BC——垂直于弦的直径，平分这条弦，并且平分弦所对的两条弧。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 14);
    let theorem: Theorem = 'inscribed';
    let p = 0.5;
    let step = 0;

    const group = new THREE.Group();
    group.position.y = 2.3;
    ctx.scene.add(group);

    const polar = (deg: number, r = R) =>
      new THREE.Vector3(Math.cos(deg * DEG) * r, Math.sin(deg * DEG) * r, 0);

    /** 圆弧粗管（角度制） */
    const arcTube = (r: number, a0: number, a1: number, color: string, tubeR = 0.05) => {
      const pts: THREE.Vector3[] = [];
      const n = 40;
      for (let i = 0; i <= n; i++) pts.push(polar(a0 + ((a1 - a0) * i) / n, r));
      return new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, tubeR, 8, false),
        std(color, { emissive: color, emissiveIntensity: 0.4 }),
      );
    };

    // 大圆（粗管闭环）
    const circlePts: THREE.Vector3[] = [];
    for (let i = 0; i < 64; i++) circlePts.push(polar((360 * i) / 64));
    const circleMesh = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(circlePts, true), 160, 0.045, 8, true),
      std('#334155'),
    );
    group.add(circleMesh);

    // 圆心 O
    const centerMark = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 12, 10),
      std('#0f172a', { emissive: '#334155', emissiveIntensity: 0.5 }),
    );
    group.add(centerMark);
    const oLabel = makeLabel('O', { fontSize: 38, scale: 0.8, color: '#0f172a', bg: '' });
    oLabel.position.set(0.28, 0.28, 0);
    group.add(oLabel);

    // ---------------- 圆周角定理模式 ----------------
    const inscribedGroup = new THREE.Group();
    group.add(inscribedGroup);

    const A = polar(210);
    const B = polar(330);
    // 弧 AB 高亮（劣弧）
    inscribedGroup.add(arcTube(R, 210, 330, '#f97316', 0.09));
    // 半径 OA、OB
    const radiusMat = std('#f59e0b', { emissive: '#d97706', emissiveIntensity: 0.4 });
    inscribedGroup.add(cylinderBetween(new THREE.Vector3(0, 0, 0), A, 0.04, radiusMat));
    inscribedGroup.add(cylinderBetween(new THREE.Vector3(0, 0, 0), B, 0.04, radiusMat));
    // A、B 点与标签
    const ptMat = std('#0f172a');
    const mkPt = (pos: THREE.Vector3, name: string, offset: [number, number]) => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), ptMat);
      s.position.copy(pos);
      inscribedGroup.add(s);
      const l = makeLabel(name, { fontSize: 38, scale: 0.8, color: '#0f172a', bg: '' });
      l.position.set(pos.x + offset[0], pos.y + offset[1], 0);
      inscribedGroup.add(l);
    };
    mkPt(A, 'A', [-0.4, -0.35]);
    mkPt(B, 'B', [0.4, -0.35]);

    // 基本元素标签（step 0）
    const elemLabels: THREE.Sprite[] = [];
    const mkElem = (text: string, pos: THREE.Vector3, color: string) => {
      const l = makeLabel(text, { fontSize: 32, scale: 0.75, color });
      l.position.copy(pos);
      inscribedGroup.add(l);
      elemLabels.push(l);
    };
    mkElem('半径', A.clone().multiplyScalar(0.55).add(new THREE.Vector3(-0.5, 0.25, 0)), '#b45309');
    mkElem('弦 AB', new THREE.Vector3(0, -1.85, 0), '#475569');
    mkElem('弧 AB', new THREE.Vector3(0, -3.45, 0), '#ea580c');

    // 弦 AB（灰）
    inscribedGroup.add(
      cylinderBetween(A, B, 0.03, std('#94a3b8')),
    );

    // 圆心角弧线 + 度数
    inscribedGroup.add(arcTube(0.85, 210, 330, '#f97316', 0.05));
    const centralLabel = makeLabel('圆心角 ∠AOB = 120°', { fontSize: 34, scale: 0.8, color: '#ea580c' });
    centralLabel.position.set(0, -2.1, 0);
    inscribedGroup.add(centralLabel);

    // 动点 P 与弦 PA、PB
    const pMark = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 14, 10),
      std('#16a34a', { emissive: '#15803d', emissiveIntensity: 0.8 }),
    );
    inscribedGroup.add(pMark);
    const pLabel = makeLabel('P', { fontSize: 38, scale: 0.8, color: '#15803d', bg: '' });
    inscribedGroup.add(pLabel);
    const chordMat = std('#22c55e', { emissive: '#16a34a', emissiveIntensity: 0.35 });
    const paChord = cylinderBetween(A, polar(90), 0.035, chordMat);
    const pbChord = cylinderBetween(B, polar(90), 0.035, chordMat);
    inscribedGroup.add(paChord, pbChord);
    // 圆周角弧线（随 P 重建）
    let inscArc: THREE.Mesh | null = null;
    const inscArcMat = std('#16a34a', { emissive: '#15803d', emissiveIntensity: 0.45 });
    const inscLabel = makeLabel('', { fontSize: 34, scale: 0.8, color: '#15803d' });
    inscribedGroup.add(inscLabel);

    // 第 4 步提示
    const hintLabel = makeLabel('👆 把「定理」切成垂径定理继续', {
      fontSize: 32,
      scale: 0.8,
      color: '#7c3aed',
    });
    hintLabel.position.set(0, 3.6, 0);
    inscribedGroup.add(hintLabel);

    /** P 的角度：沿优弧从 B(330°) 经顶部到 A(210°+360°) */
    const pAngle = () => 335 + p * 230;

    const rebuildP = () => {
      const P = polar(pAngle());
      pMark.position.copy(P);
      pLabel.position.set(P.x * 1.14, P.y * 1.14, 0);
      // 弦 PA、PB：替换几何体
      const na = cylinderBetween(A, P, 0.035, chordMat);
      paChord.geometry.dispose();
      paChord.geometry = na.geometry;
      paChord.position.copy(na.position);
      paChord.quaternion.copy(na.quaternion);
      const nb = cylinderBetween(B, P, 0.035, chordMat);
      pbChord.geometry.dispose();
      pbChord.geometry = nb.geometry;
      pbChord.position.copy(nb.position);
      pbChord.quaternion.copy(nb.quaternion);
      // 圆周角弧线
      const angA = Math.atan2(A.y - P.y, A.x - P.x);
      const angB = Math.atan2(B.y - P.y, B.x - P.x);
      let sweep = angB - angA;
      while (sweep > Math.PI) sweep -= 2 * Math.PI;
      while (sweep < -Math.PI) sweep += 2 * Math.PI;
      const pts: THREE.Vector3[] = [];
      const n = 24;
      for (let i = 0; i <= n; i++) {
        const t = angA + (sweep * i) / n;
        pts.push(new THREE.Vector3(P.x + Math.cos(t) * 0.7, P.y + Math.sin(t) * 0.7, 0));
      }
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.05, 8, false);
      if (inscArc) {
        inscArc.geometry.dispose();
        inscArc.geometry = geo;
      } else {
        inscArc = new THREE.Mesh(geo, inscArcMat);
        inscribedGroup.add(inscArc);
      }
      // 度数标签：沿角平分线方向外移
      const deg = Math.abs(sweep) / DEG;
      const mid = new THREE.Vector3()
        .addVectors(A.clone().sub(P).normalize(), B.clone().sub(P).normalize())
        .normalize();
      inscLabel.position.copy(P).addScaledVector(mid, 1.55);
      inscLabel.material.map?.dispose();
      inscLabel.material.dispose();
      const nl = makeLabel(`圆周角 ∠APB = ${deg.toFixed(0)}°`, {
        fontSize: 34,
        scale: 0.8,
        color: '#15803d',
      });
      inscLabel.material = nl.material;
      inscLabel.scale.copy(nl.scale);
    };
    rebuildP();

    // ---------------- 垂径定理模式 ----------------
    const chordGroup = new THREE.Group();
    group.add(chordGroup);
    {
      const cA = polar(200);
      const cB = polar(340);
      const C = polar(270);
      const D = polar(90);
      const M = new THREE.Vector3(0, -R * Math.cos(70 * DEG), 0);
      // 弦 AB
      chordGroup.add(cylinderBetween(cA, cB, 0.045, std('#3b82f6', { emissive: '#2563eb', emissiveIntensity: 0.35 })));
      // 直径 CD（垂直于 AB）
      chordGroup.add(cylinderBetween(C, D, 0.045, std('#16a34a', { emissive: '#15803d', emissiveIntensity: 0.35 })));
      // 弧 AC、弧 BC（等弧高亮）
      chordGroup.add(arcTube(R, 200, 270, '#8b5cf6', 0.09));
      chordGroup.add(arcTube(R, 270, 340, '#8b5cf6', 0.09));
      // 点与标签
      const mkC = (pos: THREE.Vector3, name: string, offset: [number, number], color = '#0f172a') => {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), std(color));
        s.position.copy(pos);
        chordGroup.add(s);
        const l = makeLabel(name, { fontSize: 36, scale: 0.8, color, bg: '' });
        l.position.set(pos.x + offset[0], pos.y + offset[1], 0);
        chordGroup.add(l);
      };
      mkC(cA, 'A', [-0.4, -0.3]);
      mkC(cB, 'B', [0.4, -0.3]);
      mkC(C, 'C', [0.35, -0.35], '#15803d');
      mkC(D, 'D', [0.35, 0.35], '#15803d');
      mkC(M, 'M', [0.35, 0.1], '#b91c1c');
      // 垂足 M 红点 + 直角标记
      const mDot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), std('#dc2626', { emissive: '#b91c1c', emissiveIntensity: 0.7 }));
      mDot.position.copy(M);
      chordGroup.add(mDot);
      const sqMat = std('#dc2626');
      const sq1 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.05), sqMat);
      sq1.position.set(M.x + 0.14, M.y + 0.22, 0);
      const sq2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.28, 0.05), sqMat);
      sq2.position.set(M.x + 0.26, M.y + 0.1, 0);
      chordGroup.add(sq1, sq2);
      // AM、MB 等长标记（小横杠）
      const tickMat = std('#7c3aed', { emissive: '#6d28d9', emissiveIntensity: 0.5 });
      const midAM = cA.clone().lerp(M, 0.5);
      const midMB = M.clone().lerp(cB, 0.5);
      const tick1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.06), tickMat);
      tick1.position.set(midAM.x, midAM.y, 0);
      const tick2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.06), tickMat);
      tick2.position.set(midMB.x, midMB.y, 0);
      chordGroup.add(tick1, tick2);
      const eqLabel = makeLabel('AM = MB', { fontSize: 34, scale: 0.8, color: '#7c3aed' });
      eqLabel.position.set(0, -2.0, 0);
      chordGroup.add(eqLabel);
      const arcEqLabel = makeLabel('弧 AC = 弧 BC', { fontSize: 34, scale: 0.8, color: '#7c3aed' });
      arcEqLabel.position.set(0, -3.6, 0);
      chordGroup.add(arcEqLabel);
      const diaLabel = makeLabel('直径 CD ⊥ 弦 AB', { fontSize: 34, scale: 0.8, color: '#15803d' });
      diaLabel.position.set(0, 3.6, 0);
      chordGroup.add(diaLabel);
    }
    chordGroup.visible = false;

    const applyState = () => {
      inscribedGroup.visible = theorem === 'inscribed';
      chordGroup.visible = theorem === 'chord';
      elemLabels.forEach((l) => {
        l.visible = step === 0;
      });
      centralLabel.visible = step >= 1;
      hintLabel.visible = theorem === 'inscribed' && step === 3;
    };
    applyState();

    return {
      setStep(i) {
        step = i;
        applyState();
      },
      setParam(id, value) {
        if (id === 'p') {
          p = Number(value);
          rebuildP();
        }
        if (id === 'theorem') {
          theorem = String(value) as Theorem;
          applyState();
        }
      },
      update(dt, elapsed) {
        pMark.scale.setScalar(1 + Math.sin(elapsed * 3) * 0.18);
        centerMark.scale.setScalar(1 + Math.sin(elapsed * 2) * 0.1);
      },
      dispose() {
        ctx.scene.remove(group);
        disposeObject(group);
      },
    };
  },
};
