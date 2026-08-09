// ---------------------------------------------------------------------------
// 物理 · 物态变化：给冰持续加热——熔化与沸腾时吸热但温度保持不变
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, disposeObject, makeLabel, std } from '../three-utils';

type Phase = 'ice' | 'melting' | 'water' | 'boiling';

const T_MAX = 40; // 图横轴（秒）
const GX = 0.7; // 图原点
const GY = 0.9;
const GW = 4.5; // 横轴宽
const GH = 2.9; // 纵轴高
const T_LO = -20;
const T_HI = 130;
const MAX_SAMPLES = 480;

const STEP_HINTS = [
  '点“加热”：冰 → 水 → 水蒸气',
  '平台期：熔化时吸热但温度不变',
  '沸腾：液体内部和表面同时剧烈汽化',
  '凝固、液化都放热；出汗降温是蒸发吸热',
];

interface Sample {
  t: number;
  temp: number;
}

interface Floater {
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  speed: number;
}

type LabelOpts = Parameters<typeof makeLabel>[1];

export const statesScene: Scene3DDefinition = {
  id: 'phys-states',
  title: '物态变化',
  subject: '物理',
  grade: '8上',
  icon: '🌡️',
  tagline: '冰化成水、水烧成气：熔化和沸腾时温度保持不变',
  keywords: ['熔化', '凝固', '汽化', '液化', '升华', '凝华', '熔点', '沸点', '物态变化', '晶体'],
  camera: { position: [0.5, 3.6, 10.5], target: [0.2, 1.8, 0] },
  controls: [
    { kind: 'button', id: 'heat', label: '🔥 加热 / 停止' },
    { kind: 'button', id: 'reset', label: '↺ 重置' },
  ],
  steps: [
    {
      title: '三态与变化',
      text: '物质有固、液、气三种状态。冰变水叫熔化，水变冰叫凝固；水变水蒸气叫汽化，反过来叫液化；冰直接变气叫升华，气直接变冰叫凝华。点“加热”，给烧杯里的冰块持续加热。',
    },
    {
      title: '熔化与熔点',
      text: '冰吸热升温到零摄氏度后开始熔化。注意曲线上的蓝色平台：冰在熔化过程中继续吸热，温度却保持零摄氏度不变，这个温度叫熔点。冰、海波、金属都是这样的晶体。',
    },
    {
      title: '沸腾与沸点',
      text: '全部化成水后继续加热，水温升到一百摄氏度就沸腾了：液体内部和表面同时剧烈汽化，气泡翻滚上升。沸腾时继续吸热，温度同样保持不变，这个温度叫沸点。',
    },
    {
      title: '凝固与液化',
      text: '反过来看，凝固和液化都要放热。生活里处处是物态变化：出汗后觉得凉快，是汗水蒸发吸热；冰箱靠制冷剂在内部汽化吸热、外部液化放热，把热量搬出去。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 16);
    const root = new THREE.Group();
    ctx.scene.add(root);

    let heating = false;
    let simT = 0;
    let temp = -10;
    let melt = 0;
    let phase: Phase = 'ice';
    let lastPush = -1;
    let step = 0;
    const samples: Sample[] = [];

    // ---- 烧杯（放在支架上，下方加热） ----
    const stand = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 1.8), std('#78716c'));
    stand.position.set(-2.4, 0.5, 0);
    root.add(stand);
    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 0.95, 2.1, 26, 1, true),
      std('#93c5fd', { transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    );
    glass.position.set(-2.4, 0.56 + 1.05, 0);
    root.add(glass);
    const glassBottom = new THREE.Mesh(
      new THREE.CircleGeometry(0.95, 26),
      std('#93c5fd', { transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
    );
    glassBottom.rotation.x = -Math.PI / 2;
    glassBottom.position.set(-2.4, 0.57, 0);
    root.add(glassBottom);

    // 火焰
    const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.18, 16), std('#44403c'));
    burner.position.set(-2.4, 0.09, 0);
    root.add(burner);
    const flameOuter = new THREE.Mesh(
      new THREE.ConeGeometry(0.32, 0.62, 14),
      std('#f97316', { emissive: '#ea580c', emissiveIntensity: 0.9, transparent: true, opacity: 0.85 }),
    );
    flameOuter.position.set(-2.4, 0.44, 0);
    root.add(flameOuter);
    const flameInner = new THREE.Mesh(
      new THREE.ConeGeometry(0.15, 0.38, 12),
      std('#fde047', { emissive: '#facc15', emissiveIntensity: 1.0 }),
    );
    flameInner.position.set(-2.4, 0.38, 0);
    root.add(flameInner);

    // 冰块与水
    const iceMat = std('#bae6fd', { emissive: '#7dd3fc', emissiveIntensity: 0.25 });
    const iceCubes: THREE.Mesh[] = [];
    const iceOffsets: [number, number, number][] = [
      [-0.35, 0.88, 0.2],
      [0.3, 0.9, -0.15],
      [-0.02, 1.28, 0.05],
    ];
    for (const [ix, iy, iz] of iceOffsets) {
      const cube = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), iceMat);
      cube.position.set(-2.4 + ix, iy, iz);
      cube.rotation.set(ix * 2, iz * 3, iy);
      root.add(cube);
      iceCubes.push(cube);
    }
    const waterMat = std('#7dd3fc', { transparent: true, opacity: 0.75, depthWrite: false });
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.86, 1, 24), waterMat);
    root.add(water);

    // 气泡与蒸汽粒子
    const bubbles: Floater[] = [];
    for (let i = 0; i < 12; i++) {
      const mat = std('#e0f2fe', { transparent: true, opacity: 0.85, emissive: '#bae6fd', emissiveIntensity: 0.4 });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.05 + Math.random() * 0.045, 8, 6), mat);
      mesh.visible = false;
      root.add(mesh);
      bubbles.push({ mesh, mat, speed: 0.8 + Math.random() * 0.7 });
    }
    const steams: Floater[] = [];
    for (let i = 0; i < 10; i++) {
      const mat = std('#f8fafc', { transparent: true, opacity: 0.5, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.07 + Math.random() * 0.05, 8, 6), mat);
      mesh.visible = false;
      root.add(mesh);
      steams.push({ mesh, mat, speed: 0.6 + Math.random() * 0.5 });
    }

    // ---- 右侧温度-时间图像 ----
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(GW + 0.7, GH + 0.9),
      std('#f8fafc', { transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }),
    );
    panel.position.set(GX + GW / 2, GY + GH / 2, -0.08);
    root.add(panel);
    const mapT = (t: number) => GX + (t / T_MAX) * GW;
    const mapTemp = (tt: number) => GY + ((tt - T_LO) / (T_HI - T_LO)) * GH;
    const mkAxis = (pts: THREE.Vector3[], color: string) =>
      new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color }));
    root.add(
      mkAxis([new THREE.Vector3(GX, GY, 0), new THREE.Vector3(GX + GW + 0.35, GY, 0)], '#dc2626'),
      mkAxis([new THREE.Vector3(GX, GY, 0), new THREE.Vector3(GX, GY + GH + 0.35, 0)], '#16a34a'),
    );
    const tAxisLabel = makeLabel('t（秒）', { fontSize: 28, scale: 0.62, color: '#b91c1c' });
    tAxisLabel.position.set(GX + GW + 0.4, GY - 0.26, 0);
    root.add(tAxisLabel);
    const tempAxisLabel = makeLabel('温度（°C）', { fontSize: 28, scale: 0.62, color: '#15803d' });
    tempAxisLabel.position.set(GX + 0.4, GY + GH + 0.4, 0);
    root.add(tempAxisLabel);

    // 平台高亮带（0°C 熔化、100°C 沸腾）
    const band0Mat = new THREE.MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false });
    const band0 = new THREE.Mesh(new THREE.PlaneGeometry(GW, 0.24), band0Mat);
    band0.position.set(GX + GW / 2, mapTemp(0), 0.01);
    root.add(band0);
    const band100Mat = new THREE.MeshBasicMaterial({ color: '#f97316', transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false });
    const band100 = new THREE.Mesh(new THREE.PlaneGeometry(GW, 0.24), band100Mat);
    band100.position.set(GX + GW / 2, mapTemp(100), 0.01);
    root.add(band100);
    const band0Label = makeLabel('0°C 熔化平台：吸热但温度不变', { fontSize: 28, scale: 0.68, color: '#0369a1' });
    band0Label.position.set(GX + GW / 2, mapTemp(0) + 0.4, 0);
    root.add(band0Label);
    const band100Label = makeLabel('100°C 沸腾平台：吸热但温度不变', { fontSize: 28, scale: 0.68, color: '#c2410c' });
    band100Label.position.set(GX + GW / 2, mapTemp(100) + 0.4, 0);
    root.add(band100Label);

    // 温度曲线
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_SAMPLES * 3), 3));
    const trace = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: '#dc2626' }));
    root.add(trace);
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 12, 10),
      std('#dc2626', { emissive: '#b91c1c', emissiveIntensity: 0.6 }),
    );
    root.add(dot);

    // 状态与步骤标签
    const STATE_OPTS: LabelOpts = { fontSize: 36, scale: 0.9, color: '#0f172a' };
    const HINT_OPTS: LabelOpts = { fontSize: 30, scale: 0.75, color: '#475569' };
    const stateLabel = makeLabel('', STATE_OPTS);
    stateLabel.position.set(-2.4, 3.25, 0);
    root.add(stateLabel);
    const hintLabel = makeLabel('', HINT_OPTS);
    hintLabel.position.set(0.4, 4.4, 0);
    root.add(hintLabel);

    const setText = (sprite: THREE.Sprite, text: string, opts: LabelOpts) => {
      sprite.material.map?.dispose();
      sprite.material.dispose();
      const nl = makeLabel(text, opts);
      sprite.material = nl.material;
      sprite.scale.copy(nl.scale);
    };

    let lastStateKey = '';
    const refreshState = () => {
      const key = `${phase}|${temp.toFixed(0)}|${heating}`;
      if (key === lastStateKey) return;
      lastStateKey = key;
      const paused = heating ? '' : '（已停止加热）';
      const text =
        phase === 'ice'
          ? `固态：冰 ${temp.toFixed(0)}°C${paused}`
          : phase === 'melting'
            ? `熔化中：冰水混合，0°C 不变${paused}`
            : phase === 'water'
              ? `液态：水升温中 ${temp.toFixed(0)}°C${paused}`
              : `沸腾中：100°C 不变，剧烈汽化${paused}`;
      setText(stateLabel, text, STATE_OPTS);
    };
    const refreshHint = () => setText(hintLabel, STEP_HINTS[step], HINT_OPTS);

    const redraw = () => {
      const attr = lineGeo.getAttribute('position') as THREE.BufferAttribute;
      const n = Math.min(samples.length, MAX_SAMPLES);
      for (let i = 0; i < n; i++) {
        attr.setXYZ(i, mapT(samples[i].t), mapTemp(samples[i].temp), 0.02);
      }
      attr.needsUpdate = true;
      lineGeo.setDrawRange(0, n);
      if (n > 0) {
        const last = samples[n - 1];
        dot.position.set(mapT(last.t), mapTemp(last.temp), 0.04);
      } else {
        dot.position.set(mapT(0), mapTemp(-10), 0.04);
      }
    };

    const resetSim = () => {
      heating = false;
      simT = 0;
      temp = -10;
      melt = 0;
      phase = 'ice';
      samples.length = 0;
      lastPush = -1;
      lastStateKey = '';
      redraw();
      refreshState();
    };

    refreshState();
    refreshHint();
    redraw();

    const coldColor = new THREE.Color('#7dd3fc');
    const hotColor = new THREE.Color('#fb923c');

    return {
      setStep(i) {
        step = i;
        refreshHint();
      },
      setParam(id) {
        if (id === 'heat') {
          heating = !heating;
          refreshState();
        }
        if (id === 'reset') resetSim();
      },
      update(dt, elapsed) {
        if (heating && simT < T_MAX) {
          simT += dt;
          if (phase === 'ice') {
            temp += 4 * dt;
            if (temp >= 0) {
              temp = 0;
              phase = 'melting';
            }
          } else if (phase === 'melting') {
            melt += dt / 8;
            if (melt >= 1) {
              melt = 1;
              phase = 'water';
            }
          } else if (phase === 'water') {
            temp += 4.5 * dt;
            if (temp >= 100) {
              temp = 100;
              phase = 'boiling';
            }
          }
          if (samples.length === 0 || simT - lastPush >= 0.09) {
            samples.push({ t: simT, temp });
            lastPush = simT;
          }
          redraw();
          refreshState();
        }
        // 火焰
        flameOuter.visible = heating;
        flameInner.visible = heating;
        if (heating) {
          const f = 1 + Math.sin(elapsed * 17) * 0.12 + Math.sin(elapsed * 29) * 0.06;
          flameOuter.scale.set(f, 1 + Math.sin(elapsed * 23) * 0.15, f);
          flameInner.scale.setScalar(1 + Math.sin(elapsed * 31) * 0.1);
        }
        // 冰块逐渐融化
        const iceScale = Math.max(0.02, 1 - melt);
        const showIce = phase === 'ice' || phase === 'melting';
        for (const cube of iceCubes) {
          cube.visible = showIce;
          cube.scale.setScalar(iceScale);
        }
        // 水面与颜色（越热越偏橙）
        const waterH = phase === 'ice' ? 0.02 : 0.12 + melt * 0.55;
        water.scale.y = waterH;
        water.position.set(-2.4, 0.57 + waterH / 2, 0);
        waterMat.color.lerpColors(coldColor, hotColor, THREE.MathUtils.clamp(temp / 100, 0, 1));
        const waterTop = 0.57 + waterH;
        // 沸腾气泡
        const boiling = phase === 'boiling';
        for (const b of bubbles) {
          b.mesh.visible = boiling;
          if (!boiling) continue;
          b.mesh.position.y += b.speed * dt;
          if (b.mesh.position.y > waterTop - 0.08 || b.mesh.position.y < 0.5) {
            const ang = Math.random() * Math.PI * 2;
            const rad = Math.random() * 0.6;
            b.mesh.position.set(-2.4 + Math.cos(ang) * rad, 0.62, Math.sin(ang) * rad);
          }
        }
        // 杯口水蒸气
        for (const s of steams) {
          s.mesh.visible = boiling;
          if (!boiling) continue;
          s.mesh.position.y += s.speed * dt;
          s.mat.opacity = THREE.MathUtils.clamp(0.55 - (s.mesh.position.y - 2.7) * 0.35, 0, 0.55);
          if (s.mesh.position.y > 4.1 || s.mesh.position.y < 2.5) {
            const ang = Math.random() * Math.PI * 2;
            const rad = Math.random() * 0.5;
            s.mesh.position.set(-2.4 + Math.cos(ang) * rad, 2.72, Math.sin(ang) * rad);
          }
        }
        // 平台高亮：到达对应阶段或讲到对应步骤时点亮
        const active0 = phase === 'melting' || step === 1;
        const active100 = phase === 'boiling' || step === 2;
        band0Mat.opacity = active0 ? 0.45 : 0.15;
        band100Mat.opacity = active100 ? 0.45 : 0.15;
        band0Label.visible = active0;
        band100Label.visible = active100;
      },
      dispose() {
        ctx.scene.remove(root);
        disposeObject(root);
      },
    };
  },
};
