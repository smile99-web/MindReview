// ---------------------------------------------------------------------------
// 数学 · 全等三角形：SSS / SAS / ASA 判定 + 翻折平移重合动画
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, cylinderBetween, disposeObject, makeLabel, std } from '../three-utils';

type Crit = 'sss' | 'sas' | 'asa';

const DEPTH = 0.14;
const FRONT = DEPTH / 2 + 0.05;

const A = new THREE.Vector2(-1.9, 0.4);
const B = new THREE.Vector2(1.9, 0.4);
const C = new THREE.Vector2(0.7, 2.7);

function fanGeo(r: number, a1: number, sweep: number): THREE.ShapeGeometry {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0);
  sh.absarc(0, 0, r, a1, a1 + sweep, false);
  sh.lineTo(0, 0);
  return new THREE.ShapeGeometry(sh, 20);
}

/** 顶点 v 处由 v→p1、v→p2 张成的角 */
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

export const congruenceScene: Scene3DDefinition = {
  id: 'math-congruence',
  title: '全等三角形',
  subject: '数学',
  grade: '8上',
  icon: '📐',
  tagline: '经过翻折、平移、旋转后能够完全重合的两个三角形',
  keywords: ['全等三角形', '全等', 'SSS', 'SAS', 'ASA', 'AAS', '对应边', '对应角'],
  camera: { position: [0.6, 2.4, 9.4], target: [0.4, 1.6, 0] },
  controls: [
    {
      kind: 'select',
      id: 'crit',
      label: '判定方法',
      options: [
        { value: 'sss', label: '边边边 SSS' },
        { value: 'sas', label: '边角边 SAS' },
        { value: 'asa', label: '角边角 ASA' },
      ],
      defaultValue: 'sss',
    },
    { kind: 'button', id: 'merge', label: '▶ 播放重合动画' },
  ],
  steps: [
    {
      title: '什么是全等',
      text: '能够完全重合的两个图形叫做全等形。两个三角形全等时，互相重合的顶点叫对应顶点，重合的边叫对应边，重合的角叫对应角。点击播放按钮，看灰色三角形经过旋转和平移，与彩色三角形完全重合。',
    },
    {
      title: '边边边',
      text: '三边对应相等的两个三角形全等，简称边边边。看刻度线：相同数量的刻度表示对应边相等。三根木条的长度一旦定下来，三角形的形状和大小就唯一确定了，所以三边定，全等定。',
    },
    {
      title: '边角边',
      text: '两边和它们的夹角对应相等的两个三角形全等，简称边角边。注意这个夹字：相等的角必须是两条已知边夹住的那个角。如果相等的是其中一条边正对着的角，就不能保证全等了。',
    },
    {
      title: '角边角与角角边',
      text: '两角和它们的夹边对应相等，叫角边角；两角和其中一角的对边对应相等，叫角角边，两者都能判定全等。但要特别记住：边边角不在判定方法之列，它可能拼出两个不同的三角形。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 12);
    let step = 0;
    let crit: Crit = 'sss';
    let showAnnot = false;
    let merged = false;
    let mergeT = 0;
    let prevMerge = 0;
    let flashT = 0;

    // 目标三角形（彩色半透明）
    const sh = new THREE.Shape();
    sh.moveTo(A.x, A.y);
    sh.lineTo(B.x, B.y);
    sh.lineTo(C.x, C.y);
    sh.closePath();
    const triGeo = new THREE.ExtrudeGeometry(sh, { depth: DEPTH, bevelEnabled: false });
    triGeo.translate(0, 0, -DEPTH / 2);
    const targetMat = std('#38bdf8', { transparent: true, opacity: 0.6, emissive: '#0ea5e9', emissiveIntensity: 0.15 });
    const target = new THREE.Mesh(triGeo, targetMat);
    const targetEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(triGeo),
      new THREE.LineBasicMaterial({ color: '#075985' }),
    );
    ctx.scene.add(target, targetEdges);

    // 移动三角形（灰色线框 + 半透明面）
    const mover = new THREE.Group();
    const moverHome = new THREE.Vector3(3.7, 0.8, 1.8);
    const moverHomeQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, 0.5, 0.85));
    const moverDst = new THREE.Vector3(0, 0, 0.012);
    const moverDstQ = new THREE.Quaternion();
    const moverMesh = new THREE.Mesh(triGeo, std('#94a3b8', { transparent: true, opacity: 0.35 }));
    const moverWire = new THREE.Mesh(triGeo, std('#475569', { wireframe: true }));
    mover.add(moverMesh, moverWire);
    mover.position.copy(moverHome);
    mover.quaternion.copy(moverHomeQ);
    ctx.scene.add(mover);

    // 顶点标签
    const centroid = new THREE.Vector2().add(A).add(B).add(C).multiplyScalar(1 / 3);
    const verts = [A, B, C];
    const names = ['A', 'B', 'C'];
    const targetLabels: THREE.Sprite[] = [];
    verts.forEach((v, i) => {
      const out = new THREE.Vector2().subVectors(v, centroid).normalize();
      const l = makeLabel(names[i], { fontSize: 44, scale: 0.9, color: '#075985' });
      l.position.set(v.x + out.x * 0.46, v.y + out.y * 0.46, FRONT + 0.1);
      ctx.scene.add(l);
      targetLabels.push(l);
      const l2 = makeLabel(`${names[i]}'`, { fontSize: 44, scale: 0.9, color: '#475569' });
      l2.position.copy(l.position);
      mover.add(l2);
    });

    // 判定标注（目标、移动三角形各一份，重合时恰好叠在一起）
    const buildAnnot = (c: Crit): THREE.Group => {
      const g = new THREE.Group();
      const tickGeo = new THREE.BoxGeometry(0.06, 0.3, 0.06);
      const addTicks = (p: THREE.Vector2, q: THREE.Vector2, n: number, color: string) => {
        const ang = Math.atan2(q.y - p.y, q.x - p.x);
        for (let k = 0; k < n; k++) {
          const t = new THREE.Mesh(tickGeo, std(color));
          const off = (k - (n - 1) / 2) * 0.18;
          t.position.set((p.x + q.x) / 2 + Math.cos(ang) * off, (p.y + q.y) / 2 + Math.sin(ang) * off, FRONT);
          t.rotation.z = ang;
          g.add(t);
        }
      };
      const addBar = (p: THREE.Vector2, q: THREE.Vector2, color: string) => {
        g.add(
          cylinderBetween(
            new THREE.Vector3(p.x, p.y, FRONT),
            new THREE.Vector3(q.x, q.y, FRONT),
            0.055,
            std(color, { emissive: color, emissiveIntensity: 0.45 }),
          ),
        );
      };
      const addArc = (v: THREE.Vector2, p: THREE.Vector2, q: THREE.Vector2, color: string, label?: string) => {
        const { start, sweep } = vertexAngle(v, p, q);
        const arc = new THREE.Mesh(fanGeo(0.55, start, sweep), std(color, { side: THREE.DoubleSide }));
        arc.position.set(v.x, v.y, FRONT + 0.02);
        g.add(arc);
        if (label) {
          const bis = start + sweep / 2;
          const l = makeLabel(label, { fontSize: 36, scale: 0.85, color });
          l.position.set(v.x + Math.cos(bis) * 1.05, v.y + Math.sin(bis) * 1.05, FRONT + 0.06);
          g.add(l);
        }
      };
      if (c === 'sss') {
        addTicks(A, B, 1, '#ef4444');
        addTicks(B, C, 2, '#22c55e');
        addTicks(C, A, 3, '#3b82f6');
      } else if (c === 'sas') {
        addBar(A, B, '#f97316');
        addBar(A, C, '#f97316');
        addArc(A, B, C, '#e11d48', '夹角');
      } else {
        addArc(A, B, C, '#8b5cf6');
        addArc(B, C, A, '#8b5cf6');
        addBar(A, B, '#0d9488');
        const mid = new THREE.Vector2().addVectors(A, B).multiplyScalar(0.5);
        const l = makeLabel('夹边', { fontSize: 36, scale: 0.85, color: '#0d9488' });
        l.position.set(mid.x, mid.y - 0.42, FRONT + 0.06);
        g.add(l);
      }
      return g;
    };
    let annotT = buildAnnot(crit);
    let annotM = buildAnnot(crit);
    ctx.scene.add(annotT);
    mover.add(annotM);

    // 顶部说明 + 重合提示
    const topLabel = makeLabel('', { fontSize: 42, scale: 1 });
    topLabel.position.set(0.4, 4.3, 0);
    ctx.scene.add(topLabel);
    const mergedLabel = makeLabel('完全重合！', { fontSize: 46, scale: 1.05, color: '#15803d' });
    mergedLabel.position.set(0.4, 3.6, 0);
    mergedLabel.visible = false;
    ctx.scene.add(mergedLabel);

    const replaceLabel = (sp: THREE.Sprite, text: string, color: string) => {
      const nl = makeLabel(text, { fontSize: 42, scale: 1, color });
      sp.material.map?.dispose();
      sp.material.dispose();
      sp.material = nl.material;
      sp.scale.copy(nl.scale);
    };

    const rebuildAnnot = () => {
      ctx.scene.remove(annotT);
      mover.remove(annotM);
      disposeObject(annotT);
      disposeObject(annotM);
      annotT = buildAnnot(crit);
      annotM = buildAnnot(crit);
      ctx.scene.add(annotT);
      mover.add(annotM);
      annotT.visible = showAnnot;
      annotM.visible = showAnnot;
    };

    const applyStep = () => {
      if (step >= 1) {
        crit = (['sss', 'sas', 'asa'] as Crit[])[step - 1];
        showAnnot = true;
        rebuildAnnot();
      } else {
        showAnnot = false;
        annotT.visible = false;
        annotM.visible = false;
      }
      const topText =
        step === 0
          ? '能够完全重合 ⇔ 全等'
          : crit === 'sss'
            ? 'SSS：三边对应相等'
            : crit === 'sas'
              ? 'SAS：两边及其夹角'
              : step === 3
                ? 'ASA / AAS；SSA 不能保证全等'
                : 'ASA：两角及其夹边';
      replaceLabel(topLabel, topText, step === 0 ? '#0f172a' : '#7c3aed');
    };
    applyStep();

    return {
      setStep(i) {
        step = i;
        applyStep();
      },
      setParam(id, value) {
        if (id === 'crit') {
          crit = String(value) as Crit;
          showAnnot = true;
          rebuildAnnot();
          replaceLabel(
            topLabel,
            crit === 'sss' ? 'SSS：三边对应相等' : crit === 'sas' ? 'SAS：两边及其夹角' : 'ASA：两角及其夹边',
            '#7c3aed',
          );
        } else if (id === 'merge') {
          merged = !merged;
        }
      },
      update(dt, elapsed) {
        mergeT = THREE.MathUtils.damp(mergeT, merged ? 1 : 0, 2.8, dt);
        const e = mergeT * mergeT * (3 - 2 * mergeT);
        mover.position.lerpVectors(moverHome, moverDst, e);
        mover.position.y += Math.sin(elapsed * 1.3) * 0.09 * (1 - e); // 未重合时轻轻浮动
        mover.quaternion.slerpQuaternions(moverHomeQ, moverDstQ, e);
        if (prevMerge <= 0.98 && mergeT > 0.98) flashT = 1;
        prevMerge = mergeT;
        flashT = Math.max(0, flashT - dt * 1.4);
        targetMat.emissiveIntensity = 0.15 + flashT * (0.6 + 0.4 * Math.sin(elapsed * 20));
        mergedLabel.visible = mergeT > 0.95;
      },
      dispose() {
        ctx.scene.remove(target, targetEdges, mover, annotT, topLabel, mergedLabel);
        targetLabels.forEach((l) => {
          ctx.scene.remove(l);
          disposeObject(l);
        });
        disposeObject(target);
        disposeObject(targetEdges);
        disposeObject(mover);
        disposeObject(annotT);
        disposeObject(topLabel);
        disposeObject(mergedLabel);
      },
    };
  },
};
