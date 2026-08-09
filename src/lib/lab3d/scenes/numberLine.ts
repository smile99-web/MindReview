// ---------------------------------------------------------------------------
// 数学 · 数轴与绝对值：相反数、绝对值、不等式解集的动态演示
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, cylinderBetween, disposeObject, makeArrow, makeLabel, std } from '../three-utils';

type Mode = 'opposite' | 'abs' | 'ineq';

const LINE_Y = 1.7; // 数轴离地面高度
const X_MIN = -6;
const X_MAX = 6;
const ARC_N = 40; // 对称弧线分段数

/** 数字显示：负号用全角，避免视觉上过小 */
const fmt = (n: number) => String(n).replace('-', '−');

export const numberLineScene: Scene3DDefinition = {
  id: 'math-number-line',
  title: '数轴与绝对值',
  subject: '数学',
  grade: '7上',
  icon: '📏',
  tagline: '在会动的数轴上认识相反数、绝对值和不等式解集',
  keywords: ['数轴', '有理数', '相反数', '绝对值', '正数', '负数', '原点', '不等式', '解集', '实数'],
  camera: { position: [0, 4.2, 9.5], target: [0, 1.5, 0] },
  controls: [
    { kind: 'slider', id: 'a', label: '点A的位置 a', min: -5, max: 5, step: 0.5, defaultValue: 3 },
    {
      kind: 'select',
      id: 'mode',
      label: '演示',
      options: [
        { value: 'opposite', label: '相反数' },
        { value: 'abs', label: '绝对值' },
        { value: 'ineq', label: '不等式解集' },
      ],
      defaultValue: 'opposite',
    },
  ],
  steps: [
    {
      title: '数轴三要素',
      text: '数轴有三个要素：红点是原点，表示零；箭头指向右边，是正方向；相邻两个刻度的间隔是单位长度。每一个有理数，都能在数轴上找到自己唯一的家。拖动滑块，让蓝色的点 A 走一走吧。',
    },
    {
      title: '相反数',
      text: '把点 A 关于原点翻折到另一边，绿色的 A撇 就是 a 的相反数。它们到原点的距离相等，一左一右。三和负三互为相反数，加起来等于零。特别地，零的相反数还是零。',
    },
    {
      title: '绝对值',
      text: '点 A 到原点的距离，叫做 a 的绝对值。距离不分方向，所以绝对值永远不是负数：三的绝对值是三，负三的绝对值也是三。看这一对橙色箭头，从左量到右、从右量到左，长度都一样。',
    },
    {
      title: '不等式解集',
      text: '数轴还能画出不等式的解集。比如 x 加一大于 a，也就是 x 大于 a 减一：在 a 减一的位置画空心圈，表示这个数不包含在内；再向右画一条红线，线上所有的数都是解。如果是大于等于，空心圈就要换成实心点。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 14);
    let a = 3;
    let mode: Mode = 'opposite';
    let step = 0;
    let dispA = 3; // 平滑显示位置

    const root = new THREE.Group();
    ctx.scene.add(root);

    // 数轴主线 + 正方向箭头
    const line = cylinderBetween(
      new THREE.Vector3(X_MIN - 0.7, LINE_Y, 0),
      new THREE.Vector3(X_MAX + 0.6, LINE_Y, 0),
      0.045,
      std('#334155'),
    );
    root.add(line);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.45, 14), std('#334155'));
    head.position.set(X_MAX + 0.85, LINE_Y, 0);
    head.rotation.z = -Math.PI / 2;
    root.add(head);

    // 刻度与数字
    const tickMat = std('#475569');
    for (let i = X_MIN; i <= X_MAX; i++) {
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.26, 0.05), tickMat);
      tick.position.set(i, LINE_Y, 0);
      root.add(tick);
      if (i !== 0) {
        const num = makeLabel(String(i), { fontSize: 34, scale: 0.68, color: '#475569' });
        num.position.set(i, LINE_Y - 0.5, 0);
        root.add(num);
      }
    }

    // 原点 O（红色）
    const origin = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 18, 14),
      std('#dc2626', { emissive: '#b91c1c', emissiveIntensity: 0.5 }),
    );
    origin.position.set(0, LINE_Y, 0);
    root.add(origin);
    const oLabel = makeLabel('O', { fontSize: 40, scale: 0.85, color: '#b91c1c' });
    oLabel.position.set(0, LINE_Y - 0.5, 0);
    root.add(oLabel);

    // 步骤一：三要素标注
    const originTag = makeLabel('原点', { fontSize: 36, scale: 0.8, color: '#b91c1c' });
    originTag.position.set(-0.9, LINE_Y + 0.7, 0);
    const dirTag = makeLabel('正方向', { fontSize: 36, scale: 0.8, color: '#334155' });
    dirTag.position.set(X_MAX + 0.1, LINE_Y + 0.6, 0);
    const unitTag = makeLabel('单位长度', { fontSize: 36, scale: 0.8, color: '#0369a1' });
    unitTag.position.set(0.5, LINE_Y + 1.0, 0);
    const unitArrow = makeArrow('#0ea5e9', { radius: 0.03, headRadius: 0.09, headLength: 0.22 });
    unitArrow.set(new THREE.Vector3(0, LINE_Y + 0.55, 0), new THREE.Vector3(1, LINE_Y + 0.55, 0));
    root.add(originTag, dirTag, unitTag, unitArrow.group);

    // 动点 A（蓝）与相反数点 A'（绿）
    const pointA = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 20, 16),
      std('#2563eb', { emissive: '#1d4ed8', emissiveIntensity: 0.5 }),
    );
    const pointA2 = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 20, 16),
      std('#16a34a', { emissive: '#15803d', emissiveIntensity: 0.5 }),
    );
    root.add(pointA, pointA2);
    const aLabel = makeLabel('', { fontSize: 36, scale: 0.8, color: '#1d4ed8' });
    const a2Label = makeLabel('', { fontSize: 36, scale: 0.8, color: '#15803d' });
    root.add(aLabel, a2Label);

    // 关于原点的对称弧线（紫色）
    const arcGeo = new THREE.BufferGeometry();
    arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARC_N * 3), 3));
    const arc = new THREE.Line(arcGeo, new THREE.LineBasicMaterial({ color: '#9333ea' }));
    root.add(arc);

    // 绝对值：双向箭头 + 标签
    const absArrow1 = makeArrow('#f59e0b', { radius: 0.035, headRadius: 0.1, headLength: 0.24 });
    const absArrow2 = makeArrow('#f59e0b', { radius: 0.035, headRadius: 0.1, headLength: 0.24 });
    root.add(absArrow1.group, absArrow2.group);
    const absLabel = makeLabel('', { fontSize: 40, scale: 0.95, color: '#b45309' });
    root.add(absLabel);

    // 不等式解集：空心圈 + 红色粗线 + 端部箭头
    const redMat = std('#dc2626', { emissive: '#b91c1c', emissiveIntensity: 0.45 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.045, 10, 26), redMat);
    const solLine = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 1, 10), redMat);
    const solHead = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.42, 12), redMat);
    solHead.rotation.z = -Math.PI / 2;
    root.add(ring, solLine, solHead);
    const ineqLabel = makeLabel('', { fontSize: 36, scale: 0.85, color: '#b91c1c' });
    root.add(ineqLabel);

    const setText = (
      sprite: THREE.Sprite,
      text: string,
      opts: { fontSize?: number; color?: string; scale?: number } = {},
    ) => {
      sprite.material.map?.dispose();
      sprite.material.dispose();
      const nl = makeLabel(text, opts);
      sprite.material = nl.material;
      sprite.scale.copy(nl.scale);
    };

    const setRod = (m: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3) => {
      const dir = new THREE.Vector3().subVectors(to, from);
      const len = dir.length();
      m.scale.y = len;
      m.position.copy(from).addScaledVector(dir, 0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    };

    const rebuildLabels = () => {
      setText(aLabel, `A (a = ${fmt(a)})`, { fontSize: 36, scale: 0.8, color: '#1d4ed8' });
      setText(a2Label, `A' (−a = ${fmt(-a)})`, { fontSize: 36, scale: 0.8, color: '#15803d' });
      setText(absLabel, `|a| = ${fmt(Math.abs(a))}`, { fontSize: 40, scale: 0.95, color: '#b45309' });
      setText(ineqLabel, `x > a−1，即 x > ${fmt(a - 1)}`, { fontSize: 36, scale: 0.85, color: '#b91c1c' });
    };
    rebuildLabels();

    return {
      setStep(i) {
        step = i;
        if (i === 1) mode = 'opposite';
        if (i === 2) mode = 'abs';
        if (i === 3) mode = 'ineq';
      },
      setParam(id, value) {
        if (id === 'a') a = Number(value);
        if (id === 'mode') mode = String(value) as Mode;
        rebuildLabels();
      },
      update(dt, elapsed) {
        dispA = THREE.MathUtils.damp(dispA, a, 8, dt);
        const x = dispA;
        const r = Math.abs(x);

        // 点 A 与其标签
        pointA.position.set(x, LINE_Y, 0);
        aLabel.position.set(x, LINE_Y + 0.55, 0);
        pointA.scale.setScalar(1 + Math.sin(elapsed * 3) * 0.12);

        // 相反数：镜像点 + 对称弧
        const showOpp = mode === 'opposite';
        pointA2.visible = showOpp;
        a2Label.visible = showOpp;
        pointA2.position.set(-x, LINE_Y, 0);
        a2Label.position.set(-x, LINE_Y + 0.55, 0);
        arc.visible = showOpp && r > 0.01;
        if (arc.visible) {
          const attr = arcGeo.getAttribute('position') as THREE.BufferAttribute;
          for (let i = 0; i < ARC_N; i++) {
            const s = i / (ARC_N - 1);
            attr.setXYZ(i, x * Math.cos(Math.PI * s), LINE_Y + 0.1 + (r * 0.5 + 0.35) * Math.sin(Math.PI * s), 0);
          }
          attr.needsUpdate = true;
        }

        // 绝对值：双向箭头
        const showAbs = mode === 'abs' && r > 0.01;
        absArrow1.group.visible = showAbs;
        absArrow2.group.visible = showAbs;
        if (showAbs) {
          absArrow1.set(new THREE.Vector3(0, LINE_Y + 0.32, 0), new THREE.Vector3(x, LINE_Y + 0.32, 0));
          absArrow2.set(new THREE.Vector3(x, LINE_Y + 0.62, 0), new THREE.Vector3(0, LINE_Y + 0.62, 0));
        }
        absLabel.visible = mode === 'abs';
        absLabel.position.set(x / 2, LINE_Y + 1.1, 0);

        // 不等式解集
        const showIneq = mode === 'ineq';
        const c = x - 1;
        ring.visible = showIneq;
        solLine.visible = showIneq;
        solHead.visible = showIneq;
        ineqLabel.visible = showIneq;
        if (showIneq) {
          ring.position.set(c, LINE_Y, 0);
          setRod(solLine, new THREE.Vector3(c, LINE_Y, 0), new THREE.Vector3(X_MAX + 0.4, LINE_Y, 0));
          solHead.position.set(X_MAX + 0.62, LINE_Y, 0);
          ineqLabel.position.set(Math.min(c + 1.9, 3.6), LINE_Y + 0.65, 0);
        }

        // 步骤一：三要素标注显隐 + 原点脉冲
        const overview = step === 0;
        originTag.visible = overview;
        dirTag.visible = overview;
        unitTag.visible = overview;
        unitArrow.group.visible = overview;
        origin.scale.setScalar(overview ? 1 + Math.sin(elapsed * 4) * 0.2 : 1);
      },
      dispose() {
        ctx.scene.remove(root);
        disposeObject(root);
      },
    };
  },
};
