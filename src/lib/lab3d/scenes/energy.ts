// ---------------------------------------------------------------------------
// 物理 · 动能与势能的转化：波浪轨道小球 + 实时能量条 + 机械能守恒
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, disposeObject, makeLabel, std } from '../three-utils';

const X0 = -4;
const X1 = 4;
const N = 160;
const G_EFF = 4.0;
const BAR_MAX = 2.4;

/** 轨道高度曲线：左高右低的波浪形 */
function trackY(x: number): number {
  const t = (x - X0) / (X1 - X0);
  return 0.45 + 1.9 * (1 - t) + 1.1 * t * (1 - t) * Math.sin(t * Math.PI * 5);
}

export const energyScene: Scene3DDefinition = {
  id: 'phys-energy',
  title: '动能势能转化',
  subject: '物理',
  grade: '8下',
  icon: '🎢',
  tagline: '小球滚下波浪轨道：势能和动能此消彼长',
  keywords: ['动能', '势能', '重力势能', '机械能', '能量转化', '机械能守恒'],
  camera: { position: [1, 4.2, 10.5], target: [0.8, 1.2, 0] },
  controls: [
    { kind: 'slider', id: 'h', label: '释放高度', min: 0.3, max: 1, step: 0.05, defaultValue: 0.8 },
    {
      kind: 'select',
      id: 'friction',
      label: '摩擦',
      options: [
        { value: 'off', label: '无摩擦' },
        { value: 'on', label: '有摩擦' },
      ],
      defaultValue: 'off',
    },
    { kind: 'button', id: 'release', label: '▶ 释放小球' },
  ],
  steps: [
    {
      title: '动能',
      text: '运动的物体具有动能。动能和质量、速度有关：质量越大、速度越大，动能就越大。点"释放小球"，看它在波浪轨道上滚下来，越滚越快。',
    },
    {
      title: '重力势能',
      text: '被举高的物体具有重力势能，和质量、高度有关：位置越高，势能越大。拖动"释放高度"滑块，把小球放得更高，它就储存了更多的势能。',
    },
    {
      title: '相互转化',
      text: '看右边的能量条：小球下落时，绿色的势能条变短，橙色的动能条变长——势能正在转化为动能；爬坡时正好反过来。两种能量此消彼长。',
    },
    {
      title: '机械能守恒',
      text: '没有摩擦时，势能加动能的总量保持不变，这就是机械能守恒——小球每次都能回到原来的高度。打开摩擦试试：总量越来越少，变成了红色的内能，小球最终停在最低处。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 16);
    const root = new THREE.Group();
    ctx.scene.add(root);

    let step = 0;
    let hFrac = 0.8;
    let friction = false;
    let running = false;

    // 采样轨道：x 均匀网格 + 累计弧长
    const xs: number[] = [];
    const ys: number[] = [];
    const cumS: number[] = [0];
    for (let i = 0; i <= N; i++) {
      const x = X0 + ((X1 - X0) * i) / N;
      xs.push(x);
      ys.push(trackY(x));
      if (i > 0) cumS.push(cumS[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]));
    }
    const L = cumS[N];
    const posAtS = (s: number): { x: number; y: number } => {
      const sc = THREE.MathUtils.clamp(s, 0, L);
      let lo = 0;
      let hi = N;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (cumS[mid] <= sc) lo = mid;
        else hi = mid;
      }
      const f = (sc - cumS[lo]) / Math.max(cumS[lo + 1] - cumS[lo], 1e-6);
      return { x: xs[lo] + (xs[lo + 1] - xs[lo]) * f, y: ys[lo] + (ys[lo + 1] - ys[lo]) * f };
    };
    const slopeAt = (x: number): number => {
      const e = 0.02;
      return (trackY(x + e) - trackY(x - e)) / (2 * e);
    };

    // 轨道管道 + 支柱
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= N; i++) pts.push(new THREE.Vector3(xs[i], ys[i], 0));
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.06, 8), std('#64748b'));
    root.add(tube);
    for (const px of [-3, -1, 1, 3]) {
      const py = trackY(px);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, py, 8), std('#94a3b8'));
      post.position.set(px, py / 2, 0);
      root.add(post);
    }

    // 小球 + 释放点旗
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 16, 12),
      std('#f59e0b', { emissive: '#b45309', emissiveIntensity: 0.3 }),
    );
    root.add(ball);
    const flag = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 10), std('#dc2626'));
    root.add(flag);

    // 能量条面板（右侧）
    const PANEL_X = 5.4;
    const mkBar = (dx: number, color: string, name: string) => {
      const geo = new THREE.BoxGeometry(0.5, 1, 0.3);
      geo.translate(0, 0.5, 0); // 从底部向上生长
      const bar = new THREE.Mesh(geo, std(color));
      bar.position.set(PANEL_X + dx, 0, 0);
      bar.scale.y = 0.001;
      root.add(bar);
      const lab = makeLabel(name, { fontSize: 32, scale: 0.7 });
      lab.position.set(PANEL_X + dx, -0.35, 0);
      root.add(lab);
      return bar;
    };
    const peBar = mkBar(-0.7, '#16a34a', '势能');
    const keBar = mkBar(0, '#f59e0b', '动能');
    const inBar = mkBar(0.7, '#dc2626', '内能');
    // 机械能守恒虚线
    const totalGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(PANEL_X - 1.05, BAR_MAX, 0),
      new THREE.Vector3(PANEL_X + 1.05, BAR_MAX, 0),
    ]);
    const totalLine = new THREE.Line(
      totalGeo,
      new THREE.LineDashedMaterial({ color: '#475569', dashSize: 0.12, gapSize: 0.08 }),
    );
    totalLine.computeLineDistances();
    root.add(totalLine);
    const totalLabel = makeLabel('机械能总量', { fontSize: 30, scale: 0.68, color: '#475569' });
    totalLabel.position.set(PANEL_X, BAR_MAX + 0.3, 0);
    root.add(totalLabel);

    // 速度标签 + 步骤提示
    const vLabel = makeLabel('', { fontSize: 32, scale: 0.75, color: '#b45309' });
    root.add(vLabel);
    let lastV = '';
    const setVLabel = (text: string) => {
      if (text === lastV) return;
      lastV = text;
      vLabel.material.map?.dispose();
      vLabel.material.dispose();
      const nl = makeLabel(text, { fontSize: 32, scale: 0.75, color: '#b45309' });
      vLabel.material = nl.material;
      vLabel.scale.copy(nl.scale);
    };
    const hints = [
      '动能：与质量、速度有关',
      '重力势能：与质量、高度有关',
      '下落：势能 → 动能；上升：动能 → 势能',
      '无摩擦：机械能守恒；有摩擦：转化为内能',
    ].map((t) => {
      const lab = makeLabel(t, { fontSize: 34, scale: 0.85, color: '#7c3aed' });
      lab.position.set(0.8, 3.6, 0);
      lab.visible = false;
      root.add(lab);
      return lab;
    });

    // 运动状态
    let s = 0;
    let v = 0;
    let yRelease = 0;
    let releaseS = 0;

    const release = () => {
      yRelease = hFrac * trackY(X0);
      // 从左端起找到第一个高度不超过释放高度的点
      let idx = 0;
      for (let i = 0; i <= N; i++) {
        if (ys[i] <= yRelease) {
          idx = i;
          break;
        }
      }
      s = cumS[idx];
      releaseS = s;
      v = 0;
      running = true;
    };

    const applyStep = () => {
      hints.forEach((h, i) => {
        h.visible = i === step;
      });
      if (step <= 2 && !running) release();
    };
    release();
    applyStep();

    return {
      setStep(i) {
        step = i;
        applyStep();
      },
      setParam(id, value) {
        if (id === 'h') {
          hFrac = Number(value);
          release();
        }
        if (id === 'friction') {
          friction = String(value) === 'on';
          release();
        }
        if (id === 'release') release();
      },
      update(dt) {
        if (running) {
          const { x } = posAtS(s);
          const slope = slopeAt(x);
          const sinT = slope / Math.sqrt(1 + slope * slope);
          let a = -G_EFF * sinT;
          if (friction) a -= 0.55 * Math.sign(v);
          v += a * dt;
          s += v * dt;
          if (s <= 0) {
            s = 0;
            v = Math.abs(v) * 0.75;
          } else if (s >= L) {
            s = L;
            v = -Math.abs(v) * 0.75;
          }
          if (friction && Math.abs(v) < 0.06 && Math.abs(a) < 0.56) {
            v = 0; // 摩擦力足以停住
          }
        }
        const { x, y } = posAtS(s);
        ball.position.set(x, y + 0.22, 0);
        ball.rotation.z -= (v * dt) / 0.17;
        const rp = posAtS(releaseS);
        flag.position.set(rp.x, rp.y + 0.45, 0);
        setVLabel(`v = ${(Math.abs(v) * 1.4).toFixed(1)} m/s`);
        vLabel.position.set(x + 0.7, y + 0.65, 0);

        // 能量条：E0 = g·h_release
        const E0 = G_EFF * Math.max(yRelease, 0.1);
        const pe = G_EFF * y;
        const ke = 0.5 * v * v;
        const inner = Math.max(E0 - pe - ke, 0);
        peBar.scale.y = Math.max((pe / E0) * BAR_MAX, 0.001);
        keBar.scale.y = Math.max((ke / E0) * BAR_MAX, 0.001);
        inBar.scale.y = Math.max((inner / E0) * BAR_MAX, 0.001);
        totalLine.visible = !friction;
        totalLabel.visible = !friction;
      },
      dispose() {
        ctx.scene.remove(root);
        disposeObject(root);
      },
    };
  },
};
