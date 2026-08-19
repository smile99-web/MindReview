// ---------------------------------------------------------------------------
// 数学 · 二次函数的图像与性质：开口、对称轴、顶点、与 x 轴交点
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, damp, disposeObject, makeLabel, std } from '../three-utils';

const N_PTS = 90;
const Y_CLIP = 4.3;
const X_CLIP = 4.3;

/** 数字显示：去掉多余的 .0 */
const fmt = (n: number) => {
  const s = n.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
};

export const quadraticFunctionScene: Scene3DDefinition = {
  id: 'math-quadratic-function',
  title: '二次函数的图像与性质',
  subject: '数学',
  grade: '9上',
  icon: '🎢',
  tagline: '开口方向、对称轴、顶点、与 x 轴交点——抛物线全解析',
  keywords: ['二次函数', '抛物线', '开口', '对称轴', '顶点', '判别式', '最值'],
  camera: { position: [0.5, 3.2, 9.5], target: [0, 1.6, 0] },
  controls: [
    { kind: 'slider', id: 'a', label: 'a', min: -2, max: 2, step: 0.25, defaultValue: 1 },
    { kind: 'slider', id: 'b', label: 'b', min: -4, max: 4, step: 0.5, defaultValue: 0 },
    { kind: 'slider', id: 'c', label: 'c', min: -3, max: 3, step: 0.5, defaultValue: 0 },
  ],
  steps: [
    {
      title: '开口方向',
      text: '二次函数 y 等于 ax²加bx加c 的图像叫抛物线。a 大于零时开口向上，a 小于零时开口向下；a 的绝对值越大，开口越窄。把 a 从正拖到负，抛物线会平滑地翻转过来。',
    },
    {
      title: '对称轴与顶点',
      text: '抛物线总是左右对称的。对称轴是竖直直线 x 等于负的二 a 分之 b，图中用虚线标出；对称轴与抛物线的交点就是顶点，红色小球标出了它的位置和坐标。',
    },
    {
      title: '与 x 轴交点',
      text: '抛物线与 x 轴的交点，就是方程 ax²加bx加c 等于零的根，用求根公式算。判别式 b 平方减 4ac 大于零有两个交点，等于零只有一个切点，小于零就没有交点。拖动 c 上下平移抛物线试试。',
    },
    {
      title: '最值在顶点',
      text: 'a 大于零时，顶点是最低点，函数在这里取得最小值；a 小于零时，顶点是最高点，取得最大值。最值就是顶点的纵坐标，把解析式配方成顶点式，就能直接读出来。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 14);
    let step = 0;
    // 目标值（滑块）与当前显示值（阻尼过渡，翻转更平滑）
    let ta = 1;
    let tb = 0;
    let tc = 0;
    let ca = 1;
    let cb = 0;
    let cc = 0;

    const group = new THREE.Group();
    group.position.y = 1.8;
    ctx.scene.add(group);

    // 竖直坐标平面
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

    // 抛物线粗管
    const tubeMat = std('#8b5cf6', { emissive: '#7c3aed', emissiveIntensity: 0.35 });
    let tube: THREE.Mesh | null = null;

    // 对称轴（竖直虚线）
    const axisLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -4.3, 0), new THREE.Vector3(0, 4.3, 0)]),
      new THREE.LineDashedMaterial({ color: '#0ea5e9', dashSize: 0.22, gapSize: 0.14 }),
    );
    axisLine.computeLineDistances();
    group.add(axisLine);
    const axisLabel = makeLabel('', { fontSize: 32, scale: 0.75, color: '#0369a1' });
    group.add(axisLabel);

    // 顶点
    const vertexMark = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 14, 10),
      std('#dc2626', { emissive: '#b91c1c', emissiveIntensity: 0.8 }),
    );
    group.add(vertexMark);
    const vertexLabel = makeLabel('', { fontSize: 32, scale: 0.75, color: '#b91c1c' });
    group.add(vertexLabel);
    const extremeLabel = makeLabel('', { fontSize: 32, scale: 0.75, color: '#b91c1c' });
    group.add(extremeLabel);

    // 与 x 轴交点（绿球）
    const rootMat = std('#16a34a', { emissive: '#15803d', emissiveIntensity: 0.8 });
    const root1 = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), rootMat);
    const root2 = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), rootMat);
    group.add(root1, root2);
    const rootsLabel = makeLabel('', { fontSize: 32, scale: 0.75, color: '#15803d' });
    group.add(rootsLabel);
    const noRootLabel = makeLabel('判别式 b²−4ac < 0，与 x 轴没有交点', {
      fontSize: 32,
      scale: 0.8,
      color: '#b45309',
    });
    group.add(noRootLabel);

    // 解析式信息牌
    const formulaLabel = makeLabel('', { fontSize: 44, scale: 1.0, color: '#0f172a' });
    formulaLabel.position.set(0, 4.2, 0);
    group.add(formulaLabel);

    /** 换文字：释放旧 material 再替换 */
    const setLabel = (
      sprite: THREE.Sprite,
      text: string,
      opts: { fontSize: number; scale: number; color: string },
    ) => {
      sprite.material.map?.dispose();
      sprite.material.dispose();
      const nl = makeLabel(text, opts);
      sprite.material = nl.material;
      sprite.scale.copy(nl.scale);
    };

    /** 拼解析式字符串（跳过 0 系数项） */
    const polyStr = () => {
      const parts: string[] = [];
      const push = (coef: number, sym: string) => {
        if (coef === 0) return;
        const sign = coef < 0 ? '− ' : parts.length === 0 ? '' : '+ ';
        parts.push(`${sign}${fmt(Math.abs(coef))}${sym}`);
      };
      push(ca, 'x²');
      push(cb, 'x');
      push(cc, '');
      return parts.length ? parts.join(' ') : '0';
    };

    const rebuild = () => {
      const degenerate = Math.abs(ca) < 0.02;
      // 抛物线管
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < N_PTS; i++) {
        const x = -4 + (8 * i) / (N_PTS - 1);
        const y = ca * x * x + cb * x + cc;
        pts.push(new THREE.Vector3(x, THREE.MathUtils.clamp(y, -Y_CLIP, Y_CLIP), 0));
      }
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.05, 8, false);
      if (tube) {
        tube.geometry.dispose();
        tube.geometry = geo;
      } else {
        tube = new THREE.Mesh(geo, tubeMat);
        group.add(tube);
      }

      // 解析式牌
      setLabel(
        formulaLabel,
        degenerate ? `y = ${polyStr()}（a=0 退化为直线）` : `y = ${polyStr()}`,
        { fontSize: 44, scale: 1.0, color: '#0f172a' },
      );

      // 对称轴与顶点
      const showAxis = !degenerate && step >= 1;
      axisLine.visible = showAxis;
      axisLabel.visible = showAxis;
      vertexMark.visible = !degenerate && step >= 1;
      vertexLabel.visible = !degenerate && step >= 1;
      extremeLabel.visible = !degenerate && step >= 3;
      if (!degenerate) {
        const vx = -cb / (2 * ca);
        const vy = ca * vx * vx + cb * vx + cc;
        const cx = THREE.MathUtils.clamp(vx, -4.2, 4.2);
        const cy = THREE.MathUtils.clamp(vy, -4.2, 4.2);
        axisLine.position.x = cx;
        setLabel(axisLabel, `对称轴 x = ${fmt(vx)}`, { fontSize: 32, scale: 0.75, color: '#0369a1' });
        axisLabel.position.set(cx + 1.3, cy > 0 ? -3.8 : 3.8, 0);
        vertexMark.position.set(cx, cy, 0);
        setLabel(vertexLabel, `顶点 (${fmt(vx)}, ${fmt(vy)})`, {
          fontSize: 32,
          scale: 0.75,
          color: '#b91c1c',
        });
        vertexLabel.position.set(cx + 1.5, cy + (ca > 0 ? 0.55 : -0.55), 0);
        setLabel(extremeLabel, ca > 0 ? `最小值 y = ${fmt(vy)}` : `最大值 y = ${fmt(vy)}`, {
          fontSize: 32,
          scale: 0.75,
          color: '#b91c1c',
        });
        extremeLabel.position.set(cx - 1.5, cy + (ca > 0 ? 0.55 : -0.55), 0);
      }

      // 与 x 轴交点
      const disc = cb * cb - 4 * ca * cc;
      const showRoots = !degenerate && step >= 2 && disc >= 0;
      root1.visible = showRoots;
      root2.visible = showRoots && disc > 0.0001;
      rootsLabel.visible = !degenerate && step >= 2 && disc >= 0;
      noRootLabel.visible = !degenerate && step >= 2 && disc < 0;
      noRootLabel.position.set(0, -3.6, 0);
      if (showRoots) {
        const sq = Math.sqrt(Math.max(disc, 0));
        const r1 = (-cb - sq) / (2 * ca);
        const r2 = (-cb + sq) / (2 * ca);
        root1.position.set(THREE.MathUtils.clamp(r1, -X_CLIP, X_CLIP), 0, 0);
        root2.position.set(THREE.MathUtils.clamp(r2, -X_CLIP, X_CLIP), 0, 0);
        setLabel(
          rootsLabel,
          disc > 0.0001 ? `x₁ = ${fmt(r1)}，x₂ = ${fmt(r2)}` : `x₁ = x₂ = ${fmt(r1)}（相切）`,
          { fontSize: 32, scale: 0.75, color: '#15803d' },
        );
        rootsLabel.position.set(0, 0.55, 0);
      }
    };
    rebuild();

    return {
      setStep(i) {
        step = i;
        rebuild();
      },
      setParam(id, value) {
        if (id === 'a') ta = Number(value);
        if (id === 'b') tb = Number(value);
        if (id === 'c') tc = Number(value);
      },
      getReadouts() {
        if (ta === 0) {
          return [
            { label: '提示', value: 'a=0 退化为一次函数（直线）' },
            { label: '斜率', value: `${tb}` },
          ];
        }
        const vx = -tb / (2 * ta);
        const vy = ta * vx * vx + tb * vx + tc;
        const disc = tb * tb - 4 * ta * tc;
        return [
          { label: '开口方向', value: ta > 0 ? '向上' : '向下' },
          { label: '对称轴', value: `x = ${vx.toFixed(2)}` },
          { label: '顶点坐标', value: `(${vx.toFixed(2)}, ${vy.toFixed(2)})` },
          {
            label: `与x轴交点 (Δ=${disc.toFixed(1)})`,
            value: disc > 0 ? '2个' : disc === 0 ? '1个' : '无',
          },
        ];
      },
      update(dt, elapsed) {
        // 参数阻尼过渡：a 过零时开口平滑翻转
        const pa = ca;
        const pb = cb;
        const pc = cc;
        ca = damp(ca, ta, 8, dt);
        cb = damp(cb, tb, 8, dt);
        cc = damp(cc, tc, 8, dt);
        if (Math.abs(pa - ca) + Math.abs(pb - cb) + Math.abs(pc - cc) > 0.0001) rebuild();
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
