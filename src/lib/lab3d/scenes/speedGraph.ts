// ---------------------------------------------------------------------------
// 物理 · 匀速直线运动与图像：左边小车沿直道跑，右边坐标系实时描点
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, disposeObject, makeLabel, std } from '../three-utils';

type GraphMode = 'st' | 'vt';

const T_MAX = 12; // 演示时长（秒）
const S_MAX = 36; // 路程满量程（米）：v=3 时 12 秒跑完
const V_MAX = 3.4; // v-t 图纵轴上限
const ROAD_X0 = -6.2; // 直道起点
const ROAD_W = 6; // 直道世界长度 = 36 米
const OX = 0.5; // 图像原点（世界坐标）
const OY = 0.8;
const TW = 4.6; // 横轴宽度
const SH = 3.1; // 纵轴高度
const MAX_SAMPLES = 260;

interface Sample {
  t: number;
  s: number;
  v: number;
}

type LabelOpts = Parameters<typeof makeLabel>[1];

export const speedGraphScene: Scene3DDefinition = {
  id: 'phys-speed-graph',
  title: '匀速运动与图像',
  subject: '物理',
  grade: '8上',
  icon: '📈',
  tagline: 's-t 图像的斜率就是速度，v-t 图像的面积就是路程',
  keywords: ['速度', '匀速直线运动', '路程', 's-t图像', 'v-t图像', '平均速度'],
  camera: { position: [-0.2, 3.4, 11], target: [-0.2, 1.9, 0] },
  controls: [
    { kind: 'slider', id: 'v', label: '速度 v', min: 0.5, max: 3, step: 0.1, defaultValue: 1.5, unit: 'm/s' },
    {
      kind: 'select',
      id: 'graph',
      label: '图像',
      options: [
        { value: 'st', label: 's-t 图像' },
        { value: 'vt', label: 'v-t 图像' },
      ],
      defaultValue: 'st',
    },
    { kind: 'button', id: 'replay', label: '↺ 重新演示' },
  ],
  steps: [
    {
      title: '速度',
      text: '速度表示物体运动的快慢：v 等于 s 除以 t，也就是路程除以时间，单位是米每秒。拖动速度滑块，再点“重新演示”，看小车跑得快慢有什么变化。',
    },
    {
      title: '匀速直线运动',
      text: '快慢不变、沿直线的运动叫匀速直线运动，它是最简单的机械运动：任意相等的时间里，通过的路程都相等。看小车每经过一个里程碑用的时间都一样。',
    },
    {
      title: 's-t 图像',
      text: '路程-时间图像是一条过原点的直线，直线的倾斜程度就是速度：坡度越陡，速度越大。把速度调大再演示一遍，直线明显变陡了。',
    },
    {
      title: 'v-t 图像',
      text: '速度-时间图像里，匀速运动是一条水平直线。注意阴影部分：高是速度、宽是时间，面积正好是 v 乘 t，等于这段时间通过的路程。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 16);
    const root = new THREE.Group();
    ctx.scene.add(root);

    let v = 1.5;
    let mode: GraphMode = 'st';
    let simT = 0;
    let simS = 0;
    let running = true;
    let lastPush = -1;
    const samples: Sample[] = [];

    // ---- 左侧直道与里程碑 ----
    const road = new THREE.Mesh(new THREE.BoxGeometry(ROAD_W + 0.6, 0.07, 1.1), std('#64748b'));
    road.position.set(ROAD_X0 + ROAD_W / 2, 0.035, 0);
    root.add(road);
    const postGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.55, 8);
    const postMat = std('#f59e0b');
    for (let i = 0; i <= 6; i++) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(ROAD_X0 + i, 0.28, 0.62);
      root.add(post);
    }
    const postLabel = makeLabel('里程碑：每格 6 米', { fontSize: 30, scale: 0.65, color: '#92400e' });
    postLabel.position.set(ROAD_X0 + ROAD_W / 2, 1.0, 0.7);
    root.add(postLabel);
    const startLabel = makeLabel('0 米', { fontSize: 28, scale: 0.6 });
    startLabel.position.set(ROAD_X0, 0.6, 0.75);
    root.add(startLabel);
    const endLabel = makeLabel('36 米', { fontSize: 28, scale: 0.6 });
    endLabel.position.set(ROAD_X0 + ROAD_W, 0.6, 0.75);
    root.add(endLabel);

    // 小车
    const car = new THREE.Group();
    const carBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.22, 0.4),
      std('#ef4444', { emissive: '#b91c1c', emissiveIntensity: 0.25 }),
    );
    carBody.position.y = 0.26;
    const carCabin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.34), std('#e2e8f0'));
    carCabin.position.y = 0.44;
    car.add(carBody, carCabin);
    root.add(car);

    // ---- 右侧站立坐标系 ----
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(TW + 0.7, SH + 0.9),
      std('#f8fafc', { transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }),
    );
    panel.position.set(OX + TW / 2, OY + SH / 2, -0.08);
    root.add(panel);
    const grid = new THREE.GridHelper(4.6, 6, 0x94a3b8, 0xcbd5e1);
    grid.rotation.x = Math.PI / 2;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.4;
    grid.position.set(OX + TW / 2, OY + SH / 2, -0.04);
    root.add(grid);
    const mkAxis = (pts: THREE.Vector3[], color: string) =>
      new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color }));
    root.add(
      mkAxis([new THREE.Vector3(OX, OY, 0), new THREE.Vector3(OX + TW + 0.35, OY, 0)], '#dc2626'),
      mkAxis([new THREE.Vector3(OX, OY, 0), new THREE.Vector3(OX, OY + SH + 0.35, 0)], '#16a34a'),
    );
    const tLabel = makeLabel('t（秒）', { fontSize: 30, scale: 0.65, color: '#b91c1c' });
    tLabel.position.set(OX + TW + 0.42, OY - 0.28, 0);
    root.add(tLabel);
    const sAxisLabel = makeLabel('s（米）', { fontSize: 30, scale: 0.65, color: '#15803d' });
    sAxisLabel.position.set(OX - 0.28, OY + SH + 0.38, 0);
    root.add(sAxisLabel);
    const vAxisLabel = makeLabel('v（米每秒）', { fontSize: 30, scale: 0.65, color: '#15803d' });
    vAxisLabel.position.copy(sAxisLabel.position);
    root.add(vAxisLabel);

    // 描点线、面积填充、动点
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_SAMPLES * 3), 3));
    const trace = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: '#ea580c' }));
    root.add(trace);
    const FILL_VERTS = (MAX_SAMPLES - 1) * 6;
    const fillGeo = new THREE.BufferGeometry();
    fillGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FILL_VERTS * 3), 3));
    const fill = new THREE.Mesh(
      fillGeo,
      new THREE.MeshBasicMaterial({ color: '#f59e0b', transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
    );
    root.add(fill);
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 12, 10),
      std('#ea580c', { emissive: '#c2410c', emissiveIntensity: 0.6 }),
    );
    root.add(dot);

    // 数值与注释标签
    const STATUS_OPTS: LabelOpts = { fontSize: 36, scale: 0.9, color: '#0f172a' };
    const NOTE_OPTS: LabelOpts = { fontSize: 30, scale: 0.72, color: '#b45309' };
    const statusLabel = makeLabel('', STATUS_OPTS);
    statusLabel.position.set(OX + TW / 2, OY + SH + 0.9, 0);
    root.add(statusLabel);
    const noteLabel = makeLabel('', NOTE_OPTS);
    noteLabel.position.set(OX + TW / 2, OY - 0.5, 0);
    root.add(noteLabel);

    const setText = (sprite: THREE.Sprite, text: string, opts: LabelOpts) => {
      sprite.material.map?.dispose();
      sprite.material.dispose();
      const nl = makeLabel(text, opts);
      sprite.material = nl.material;
      sprite.scale.copy(nl.scale);
    };

    const mapX = (t: number) => OX + (t / T_MAX) * TW;
    const mapY = (sm: Sample) =>
      mode === 'st'
        ? OY + (Math.min(sm.s, S_MAX) / S_MAX) * SH
        : OY + (Math.min(sm.v, V_MAX) / V_MAX) * SH;

    const redraw = () => {
      const posAttr = lineGeo.getAttribute('position') as THREE.BufferAttribute;
      const n = samples.length;
      for (let i = 0; i < n; i++) {
        posAttr.setXYZ(i, mapX(samples[i].t), mapY(samples[i]), 0.02);
      }
      posAttr.needsUpdate = true;
      lineGeo.setDrawRange(0, n);
      // v-t 模式的“线下面积”填充
      const fillAttr = fillGeo.getAttribute('position') as THREE.BufferAttribute;
      if (mode === 'vt' && n >= 2) {
        let k = 0;
        for (let i = 0; i < n - 1; i++) {
          const a = samples[i];
          const b = samples[i + 1];
          const x0 = mapX(a.t);
          const x1 = mapX(b.t);
          const y0 = mapY(a);
          const y1 = mapY(b);
          fillAttr.setXYZ(k++, x0, OY, 0.01);
          fillAttr.setXYZ(k++, x1, OY, 0.01);
          fillAttr.setXYZ(k++, x0, y0, 0.01);
          fillAttr.setXYZ(k++, x1, OY, 0.01);
          fillAttr.setXYZ(k++, x1, y1, 0.01);
          fillAttr.setXYZ(k++, x0, y0, 0.01);
        }
        fillGeo.setDrawRange(0, (n - 1) * 6);
        fillAttr.needsUpdate = true;
      } else {
        fillGeo.setDrawRange(0, 0);
      }
      fill.visible = mode === 'vt';
      if (n > 0) {
        const last = samples[n - 1];
        dot.position.set(mapX(last.t), mapY(last), 0.05);
      } else {
        dot.position.set(mapX(0), mode === 'st' ? OY : OY + (v / V_MAX) * SH, 0.05);
      }
    };

    let lastStatusKey = '';
    const refreshText = () => {
      const key = `${simT.toFixed(1)}|${simS.toFixed(1)}|${v.toFixed(1)}|${mode}`;
      if (key === lastStatusKey) return;
      lastStatusKey = key;
      setText(statusLabel, `t = ${simT.toFixed(1)} 秒    s = ${simS.toFixed(1)} 米    v = ${v.toFixed(1)} 米每秒`, STATUS_OPTS);
      setText(
        noteLabel,
        mode === 'st' ? 's-t 图像：斜率 = 速度 v（越陡越快）' : 'v-t 图像：阴影面积 = v × t = 路程 s',
        NOTE_OPTS,
      );
    };

    const applyMode = () => {
      sAxisLabel.visible = mode === 'st';
      vAxisLabel.visible = mode === 'vt';
    };

    const restart = () => {
      simT = 0;
      simS = 0;
      samples.length = 0;
      lastPush = -1;
      running = true;
      lastStatusKey = '';
      redraw();
      refreshText();
    };

    applyMode();
    restart();

    return {
      setStep(i) {
        // 第 3、4 步分别对应 s-t、v-t 图像，自动切到对应模式重新演示
        if (i === 2 && mode !== 'st') {
          mode = 'st';
          applyMode();
          restart();
        } else if (i === 3 && mode !== 'vt') {
          mode = 'vt';
          applyMode();
          restart();
        }
      },
      setParam(id, value) {
        if (id === 'v') {
          v = Number(value);
          refreshText();
        }
        if (id === 'graph') {
          mode = String(value) as GraphMode;
          applyMode();
          restart();
        }
        if (id === 'replay') restart();
      },
      update(dt, elapsed) {
        if (running) {
          simT += dt;
          simS += v * dt;
          if (simT >= T_MAX) {
            simT = T_MAX;
            running = false;
          }
          if (samples.length === 0 || simT - lastPush >= 0.05) {
            samples.push({ t: simT, s: simS, v });
            lastPush = simT;
          }
          redraw();
          refreshText();
        }
        car.position.x = ROAD_X0 + (Math.min(simS, S_MAX) / S_MAX) * ROAD_W;
        car.position.y = Math.abs(Math.sin(elapsed * 8)) * 0.015;
        dot.scale.setScalar(1 + Math.sin(elapsed * 4) * 0.15);
      },
      dispose() {
        ctx.scene.remove(root);
        disposeObject(root);
      },
    };
  },
};
