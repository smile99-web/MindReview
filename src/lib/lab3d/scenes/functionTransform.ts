// ---------------------------------------------------------------------------
// 数学 · 函数图像变换：y = a·f(x − h) + v，平移与伸缩一目了然
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, disposeObject, makeLabel, std } from '../three-utils';

type FnKind = 'quad' | 'sin' | 'abs';
const FUNCS: Record<FnKind, { name: string; f: (x: number) => number }> = {
  quad: { name: 'y = x²', f: (x) => x * x },
  sin: { name: 'y = sin x', f: (x) => Math.sin(x) },
  abs: { name: 'y = |x|', f: (x) => Math.abs(x) },
};
const X_MIN = -4;
const X_MAX = 4;
const N_PTS = 90;

export const functionScene: Scene3DDefinition = {
  id: 'math-function-transform',
  title: '函数图像的变换',
  subject: '数学',
  icon: '📈',
  tagline: '拖动 a、h、v，看抛物线如何伸缩与平移——图像变换的规律',
  keywords: ['函数', '函数图像', '二次函数', '抛物线', '平移', '对称', '顶点', '正弦函数', '绝对值', '图像变换'],
  camera: { position: [0.5, 3.2, 9], target: [0, 1.6, 0] },
  controls: [
    {
      kind: 'select',
      id: 'fn',
      label: '基本函数',
      options: [
        { value: 'quad', label: 'y = x²' },
        { value: 'sin', label: 'y = sin x' },
        { value: 'abs', label: 'y = |x|' },
      ],
      defaultValue: 'quad',
    },
    { kind: 'slider', id: 'a', label: 'a（伸缩/翻转）', min: -2, max: 2, step: 0.1, defaultValue: 1 },
    { kind: 'slider', id: 'h', label: 'h（左右平移）', min: -3, max: 3, step: 0.1, defaultValue: 0 },
    { kind: 'slider', id: 'v', label: 'v（上下平移）', min: -2, max: 3, step: 0.1, defaultValue: 0 },
  ],
  steps: [
    {
      title: '基本函数图像',
      text: '灰色细线是基本函数 y 等于 f(x) 的图像，彩色粗线是变换后的 y 等于 a 乘 f(x减h) 再加 v。先观察一条干干净净的抛物线 y 等于 x²。',
    },
    {
      title: '平移变换',
      text: '拖动 h 和 v：h 让图像左右移动，注意 x减h 里减号是向右移；v 让图像上下移动，加 v 向上。口诀：左加右减，上加下减。',
    },
    {
      title: '伸缩与翻转',
      text: '拖动 a：a 的绝对值大于 1 图像变陡变窄，小于 1 变平缓变宽；a 变成负数，图像上下翻转，抛物线开口向下。',
    },
    {
      title: '综合变换',
      text: '三个参数一起调：任意抛物线都可以看成 y 等于 x² 经过伸缩和平移得到。顶点的横坐标是 h，纵坐标是 v，所以 y 等于 a(x减h)²加v 又叫顶点式。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 14);
    let fnKind: FnKind = 'quad';
    let a = 1;
    let h = 0;
    let v = 0;
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
    const axisMatX = new THREE.LineBasicMaterial({ color: '#dc2626' });
    const axisMatY = new THREE.LineBasicMaterial({ color: '#16a34a' });
    const xAxis = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-4.4, 0, 0), new THREE.Vector3(4.4, 0, 0)]),
      axisMatX,
    );
    const yAxis = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -4.4, 0), new THREE.Vector3(0, 4.4, 0)]),
      axisMatY,
    );
    group.add(xAxis, yAxis);
    const xLabel = makeLabel('x', { fontSize: 40, scale: 0.85, color: '#b91c1c' });
    xLabel.position.set(4.7, 0.25, 0);
    group.add(xLabel);
    const yLabel = makeLabel('y', { fontSize: 40, scale: 0.85, color: '#15803d' });
    yLabel.position.set(0.3, 4.7, 0);
    group.add(yLabel);

    // 基本函数（灰色细线）
    const baseGeo = new THREE.BufferGeometry();
    baseGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N_PTS * 3), 3));
    const baseLine = new THREE.Line(baseGeo, new THREE.LineBasicMaterial({ color: '#94a3b8' }));
    group.add(baseLine);

    // 变换后函数（彩色粗线：用 TubeGeometry 加粗）
    let tube: THREE.Mesh | null = null;
    const tubeMat = std('#f97316', { emissive: '#ea580c', emissiveIntensity: 0.35 });

    // 顶点标记（quad 且 step>=3）
    const vertexMark = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 14, 10),
      std('#dc2626', { emissive: '#b91c1c', emissiveIntensity: 0.8 }),
    );
    vertexMark.visible = false;
    group.add(vertexMark);
    const vertexLabel = makeLabel('顶点 (h, v)', { fontSize: 34, scale: 0.8, color: '#b91c1c' });
    vertexLabel.visible = false;
    group.add(vertexLabel);

    // 公式牌
    const formulaLabel = makeLabel('', { fontSize: 42, scale: 1.0, color: '#0f172a' });
    formulaLabel.position.set(0, 4.1, 0);
    group.add(formulaLabel);

    const rebuild = () => {
      const base = FUNCS[fnKind].f;
      // 灰线
      const attr = baseGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < N_PTS; i++) {
        const x = X_MIN + ((X_MAX - X_MIN) * i) / (N_PTS - 1);
        attr.setXYZ(i, x, THREE.MathUtils.clamp(base(x), -4.3, 4.3), 0);
      }
      attr.needsUpdate = true;
      // 彩色曲线
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < N_PTS; i++) {
        const x = X_MIN + ((X_MAX - X_MIN) * i) / (N_PTS - 1);
        const y = THREE.MathUtils.clamp(a * base(x - h) + v, -4.3, 4.3);
        pts.push(new THREE.Vector3(x, y, 0));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = new THREE.TubeGeometry(curve, 120, 0.045, 8, false);
      if (tube) {
        tube.geometry.dispose();
        tube.geometry = geo;
      } else {
        tube = new THREE.Mesh(geo, tubeMat);
        group.add(tube);
      }
      // 顶点
      const showVertex = fnKind === 'quad' && step >= 3;
      vertexMark.visible = showVertex;
      vertexLabel.visible = showVertex;
      vertexMark.position.set(h, v, 0);
      vertexLabel.position.set(h + 0.9, v + 0.5, 0);
      // 公式
      const fnName = fnKind === 'quad' ? '(x−h)²' : fnKind === 'sin' ? 'sin(x−h)' : '|x−h|';
      const text = `y = ${a.toFixed(1)}·${fnName} ${v >= 0 ? '+' : '−'} ${Math.abs(v).toFixed(1)}   (h=${h.toFixed(1)})`;
      formulaLabel.material.map?.dispose();
      formulaLabel.material.dispose();
      const nl = makeLabel(text, { fontSize: 42, scale: 1.0, color: '#0f172a' });
      formulaLabel.material = nl.material;
      formulaLabel.scale.copy(nl.scale);
    };
    rebuild();

    return {
      setStep(i) {
        step = i;
        rebuild();
      },
      setParam(id, value) {
        if (id === 'fn') fnKind = String(value) as FnKind;
        if (id === 'a') a = Number(value);
        if (id === 'h') h = Number(value);
        if (id === 'v') v = Number(value);
        rebuild();
      },
      getReadouts() {
        const sgn = (n: number) => (n < 0 ? `− ${Math.abs(n).toFixed(1)}` : `+ ${n.toFixed(1)}`);
        const inner = h < 0 ? `x + ${Math.abs(h).toFixed(1)}` : `x − ${h.toFixed(1)}`;
        const core = fnKind === 'quad' ? `(${inner})²` : fnKind === 'sin' ? `sin(${inner})` : `|${inner}|`;
        const point =
          fnKind === 'sin'
            ? { label: '对称中心', value: `(${h.toFixed(1)}, ${v.toFixed(1)})` }
            : { label: '顶点', value: `(${h.toFixed(1)}, ${v.toFixed(1)})` };
        return [{ label: '当前解析式', value: `y = ${a.toFixed(1)}·${core} ${sgn(v)}` }, point];
      },
      update(dt, elapsed) {
        // 轻微浮动呼吸感
        group.position.y = 1.8 + Math.sin(elapsed * 0.8) * 0.05;
        vertexMark.scale.setScalar(1 + Math.sin(elapsed * 3) * 0.15);
      },
      dispose() {
        ctx.scene.remove(group);
        disposeObject(group);
      },
    };
  },
};
