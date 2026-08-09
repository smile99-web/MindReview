// ---------------------------------------------------------------------------
// 数学 · 一次函数与反比例函数：k、b 怎样改变直线，双曲线长什么样
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, disposeObject, makeLabel, std } from '../three-utils';

type FnKind = 'prop' | 'linear' | 'inverse';
const N_PTS = 80;
const Y_CLIP = 4.3;

/** 数字显示：去掉多余的 .0 */
const fmt = (n: number) => {
  const s = n.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
};

export const functionsJhsScene: Scene3DDefinition = {
  id: 'math-functions-jhs',
  title: '一次函数与反比例函数',
  subject: '数学',
  grade: '8下',
  icon: '📉',
  tagline: 'k 和 b 怎样改变直线？反比例函数的双曲线长什么样？',
  keywords: ['一次函数', '正比例函数', '反比例函数', '双曲线', '斜率', '截距', '比例系数'],
  camera: { position: [0.5, 3.2, 9.5], target: [0, 1.6, 0] },
  controls: [
    {
      kind: 'select',
      id: 'kind',
      label: '函数类型',
      options: [
        { value: 'prop', label: '正比例 y=kx' },
        { value: 'linear', label: '一次 y=kx+b' },
        { value: 'inverse', label: '反比例 y=k÷x' },
      ],
      defaultValue: 'linear',
    },
    { kind: 'slider', id: 'k', label: 'k', min: -3, max: 3, step: 0.5, defaultValue: 1 },
    { kind: 'slider', id: 'b', label: 'b', min: -3, max: 3, step: 0.5, defaultValue: 1 },
  ],
  steps: [
    {
      title: '正比例函数',
      text: '正比例函数 y 等于 kx 的图像，是一条经过原点的直线。把函数类型切成正比例，再拖动 k 试试：k 控制直线的倾斜程度，k 的绝对值越大，直线越陡。灰色细线是 y 等于 x，可以当参照。',
    },
    {
      title: 'k 决定增减性',
      text: 'k 大于零时，直线从左往右上升，经过第一、三象限，y 随 x 增大而增大；k 小于零时直线下降，经过第二、四象限，y 随 x 增大而减小。把 k 从正拖到负，能看到直线绕原点翻转。',
    },
    {
      title: 'b 是截距',
      text: '一次函数 y 等于 kx 加 b，b 是直线与 y 轴交点的纵坐标，叫做截距。拖动 b：直线整体上下平移，倾斜程度不变。蓝色小点标出的就是直线与 y 轴的交点，它的纵坐标正好是 b。',
    },
    {
      title: '反比例函数',
      text: '反比例函数 y 等于 k 除以 x 的图像是双曲线，由左右两支组成，x 不能等于零。k 大于零时，两支分别在第一、三象限；k 小于零时在第二、四象限。x 越接近零，曲线越贴近 y 轴。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 14);
    let kind: FnKind = 'linear';
    let k = 1;
    let b = 1;
    let step = 0;

    const group = new THREE.Group();
    group.position.y = 1.8;
    ctx.scene.add(group);

    // 竖直坐标平面：网格 + 坐标轴
    const grid = new THREE.GridHelper(8, 8, 0x94a3b8, 0xcbd5e1);
    grid.rotation.x = Math.PI / 2;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.55;
    group.add(grid);
    const xAxis = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-4.4, 0, 0), new THREE.Vector3(4.4, 0, 0)]),
      new THREE.LineBasicMaterial({ color: '#dc2626' }),
    );
    const yAxis = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -4.4, 0), new THREE.Vector3(0, 4.4, 0)]),
      new THREE.LineBasicMaterial({ color: '#16a34a' }),
    );
    group.add(xAxis, yAxis);
    const xLabel = makeLabel('x', { fontSize: 40, scale: 0.85, color: '#b91c1c' });
    xLabel.position.set(4.7, 0.25, 0);
    group.add(xLabel);
    const yLabel = makeLabel('y', { fontSize: 40, scale: 0.85, color: '#15803d' });
    yLabel.position.set(0.3, 4.7, 0);
    group.add(yLabel);

    // 灰色参考线 y = x
    const refLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-4, -4, 0), new THREE.Vector3(4, 4, 0)]),
      new THREE.LineBasicMaterial({ color: '#cbd5e1' }),
    );
    group.add(refLine);
    const refLabel = makeLabel('y = x', { fontSize: 30, scale: 0.7, color: '#94a3b8', bg: '' });
    refLabel.position.set(-3.55, -3.3, 0);
    group.add(refLabel);

    // 函数图像粗管（反比例时两支）
    const tubeMat = std('#f97316', { emissive: '#ea580c', emissiveIntensity: 0.35 });
    let tubes: THREE.Mesh[] = [];

    // 原点标记（正比例必过原点）
    const originMark = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 14, 10),
      std('#f59e0b', { emissive: '#d97706', emissiveIntensity: 0.7 }),
    );
    group.add(originMark);
    const originLabel = makeLabel('过原点 (0, 0)', { fontSize: 32, scale: 0.75, color: '#b45309' });
    originLabel.position.set(1.15, -0.45, 0);
    group.add(originLabel);

    // y 轴截距标记（一次函数 step>=2）
    const interceptMark = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 14, 10),
      std('#2563eb', { emissive: '#1d4ed8', emissiveIntensity: 0.7 }),
    );
    group.add(interceptMark);
    const interceptLabel = makeLabel('', { fontSize: 32, scale: 0.75, color: '#1d4ed8' });
    group.add(interceptLabel);

    // 提示牌（第 4 步但还没切到反比例时）
    const hintLabel = makeLabel('👆 把函数类型切成「反比例」，看双曲线', {
      fontSize: 32,
      scale: 0.8,
      color: '#7c3aed',
    });
    hintLabel.position.set(0, -3.6, 0);
    group.add(hintLabel);

    // 公式牌 + 性质牌
    const formulaLabel = makeLabel('', { fontSize: 44, scale: 1.0, color: '#0f172a' });
    formulaLabel.position.set(0, 4.15, 0);
    group.add(formulaLabel);
    const propLabel = makeLabel('', { fontSize: 32, scale: 0.8, color: '#475569' });
    propLabel.position.set(0, -4.2, 0);
    group.add(propLabel);

    /** 换文字：释放旧 material 再替换（避免泄漏） */
    const setLabel = (sprite: THREE.Sprite, text: string, opts: { fontSize: number; scale: number; color: string }) => {
      sprite.material.map?.dispose();
      sprite.material.dispose();
      const nl = makeLabel(text, opts);
      sprite.material = nl.material;
      sprite.scale.copy(nl.scale);
    };

    const rebuild = () => {
      // 重建曲线管
      tubes.forEach((t) => {
        group.remove(t);
        t.geometry.dispose();
      });
      tubes = [];
      const fn = (x: number) =>
        kind === 'inverse' ? k / x : kind === 'prop' ? k * x : k * x + b;
      const ranges: [number, number][] =
        kind === 'inverse' ? [[-4, -0.25], [0.25, 4]] : [[-4, 4]];
      for (const [lo, hi] of ranges) {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i < N_PTS; i++) {
          const x = lo + ((hi - lo) * i) / (N_PTS - 1);
          pts.push(new THREE.Vector3(x, THREE.MathUtils.clamp(fn(x), -Y_CLIP, Y_CLIP), 0));
        }
        const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 100, 0.05, 8, false);
        const m = new THREE.Mesh(geo, tubeMat);
        group.add(m);
        tubes.push(m);
      }

      // 原点标记：正比例（或 b=0 的一次函数）过原点
      const passOrigin = kind === 'prop' || (kind === 'linear' && b === 0);
      originMark.visible = passOrigin && step === 0;
      originLabel.visible = passOrigin && step === 0;

      // 截距标记
      const showIntercept = kind === 'linear' && step >= 2;
      interceptMark.visible = showIntercept;
      interceptLabel.visible = showIntercept;
      if (showIntercept) {
        const by = THREE.MathUtils.clamp(b, -4, 4);
        interceptMark.position.set(0, by, 0);
        interceptLabel.position.set(1.35, by + 0.4, 0);
        setLabel(interceptLabel, `与 y 轴交于 (0, ${fmt(b)})`, { fontSize: 32, scale: 0.75, color: '#1d4ed8' });
      }

      // 提示牌
      hintLabel.visible = step === 3 && kind !== 'inverse';

      // 公式牌
      const formula =
        kind === 'prop'
          ? `y = ${fmt(k)}x（正比例函数）`
          : kind === 'linear'
            ? `y = ${fmt(k)}x ${b >= 0 ? '+' : '−'} ${fmt(Math.abs(b))}`
            : `y = ${fmt(k)} ÷ x（反比例函数）`;
      setLabel(formulaLabel, formula, { fontSize: 44, scale: 1.0, color: '#0f172a' });

      // 性质牌
      const prop =
        kind === 'inverse'
          ? k > 0
            ? 'k>0：双曲线在第一、三象限，各支 y 随 x 增大而减小'
            : k < 0
              ? 'k<0：双曲线在第二、四象限，各支 y 随 x 增大而增大'
              : 'k=0：不是反比例函数'
          : k > 0
            ? 'k>0：直线上升，y 随 x 增大而增大（一、三象限）'
            : k < 0
              ? 'k<0：直线下降，y 随 x 增大而减小（二、四象限）'
              : 'k=0：退化成一条水平直线';
      setLabel(propLabel, prop, { fontSize: 32, scale: 0.8, color: '#475569' });
    };
    rebuild();

    return {
      setStep(i) {
        step = i;
        rebuild();
      },
      setParam(id, value) {
        if (id === 'kind') kind = String(value) as FnKind;
        if (id === 'k') k = Number(value);
        if (id === 'b') b = Number(value);
        rebuild();
      },
      update(dt, elapsed) {
        group.position.y = 1.8 + Math.sin(elapsed * 0.8) * 0.05;
        const s = 1 + Math.sin(elapsed * 3) * 0.15;
        originMark.scale.setScalar(s);
        interceptMark.scale.setScalar(s);
      },
      dispose() {
        ctx.scene.remove(group);
        disposeObject(group);
      },
    };
  },
};
