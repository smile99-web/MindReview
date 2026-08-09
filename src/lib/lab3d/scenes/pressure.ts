// ---------------------------------------------------------------------------
// 物理 · 压强：海绵凹陷实验，p = F ÷ S，增大/减小压强的方法
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, disposeObject, makeLabel, std } from '../three-utils';

type AreaMode = 'legs' | 'top';

const SPONGE_TOP = 0.8;
const S_LEGS = 0.05; // 桌腿朝下受力面积 m²
const S_TOP = 0.5; // 桌面朝下受力面积 m²
const LEG_X = 0.62;
const LEG_Z = 0.45;

export const pressureScene: Scene3DDefinition = {
  id: 'phys-pressure',
  title: '压强',
  subject: '物理',
  grade: '8下',
  icon: '🔻',
  tagline: '同样的压力，受力面积越小压强越大——钉子尖与滑雪板',
  keywords: ['压强', '压力', '受力面积', '压强公式', '增大压强', '减小压强'],
  camera: { position: [4.5, 3.6, 6.5], target: [0, 1, 0] },
  controls: [
    { kind: 'slider', id: 'f', label: '压力（砝码个数）', min: 5, max: 20, step: 5, defaultValue: 10, unit: 'N' },
    {
      kind: 'select',
      id: 'area',
      label: '摆放方式',
      options: [
        { value: 'legs', label: '桌腿朝下（小面积）' },
        { value: 'top', label: '桌面朝下（大面积）' },
      ],
      defaultValue: 'legs',
    },
  ],
  steps: [
    {
      title: '压力的效果',
      text: '把小桌压在海绵上，海绵被压出了凹陷。海绵凹陷的程度，反映了压力作用的效果：凹陷越深，效果越明显。用这种看得见的凹陷来表示看不见的作用效果，是研究压强常用的转换法。',
    },
    {
      title: '压强公式',
      text: '压强表示压力的作用效果：p 等于 F 除以 S。F 是压力，S 是受力面积。压力越大、受力面积越小，压强就越大。拖动滑块加砝码，再切换摆放方式，看凹陷怎么变化。',
    },
    {
      title: '增大压强',
      text: '要增大压强，可以增大压力，或者减小受力面积。钉子尖、刀刃、啄木鸟的喙，都是把受力面积做得特别小，用不大的力就能产生很大的压强。',
    },
    {
      title: '减小压强',
      text: '要减小压强，就增大受力面积：书包的宽背带、滑雪板、坦克的履带，都是把压力分散到更大的面积上。切换到"桌面朝下"试试，同样的砝码，海绵几乎不陷了。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 12);
    const root = new THREE.Group();
    ctx.scene.add(root);

    let step = 0;
    let force = 10;
    let area: AreaMode = 'legs';

    // 海绵（顶面顶点可下沉）
    const spongeGeo = new THREE.BoxGeometry(3.2, 0.8, 2.4, 14, 1, 10);
    const sponge = new THREE.Mesh(spongeGeo, std('#fcd34d'));
    sponge.position.y = SPONGE_TOP / 2;
    root.add(sponge);
    const posAttr = spongeGeo.getAttribute('position') as THREE.BufferAttribute;
    const basePos = new Float32Array(posAttr.array as Float32Array);
    const spongeLabel = makeLabel('海绵', { fontSize: 36, scale: 0.8 });
    spongeLabel.position.set(-2.2, 0.45, 1.3);
    root.add(spongeLabel);

    // 受力面积指示（红色接触区域）
    const legPatches: THREE.Mesh[] = [];
    const patchMat = std('#ef4444', { transparent: true, opacity: 0.55 });
    for (const sx of [-LEG_X, LEG_X]) {
      for (const sz of [-LEG_Z, LEG_Z]) {
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 14), patchMat);
        disc.position.set(sx, SPONGE_TOP + 0.02, sz);
        root.add(disc);
        legPatches.push(disc);
      }
    }
    const topPatch = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.03, 1.2), patchMat);
    topPatch.position.set(0, SPONGE_TOP + 0.02, 0);
    topPatch.visible = false;
    root.add(topPatch);

    // 小桌（局部原点：四条腿底端所在平面中心）
    const tableCore = new THREE.Group();
    for (const sx of [-LEG_X, LEG_X]) {
      for (const sz of [-LEG_Z, LEG_Z]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.55, 10), std('#78350f'));
        leg.position.set(sx, 0.275, sz);
        tableCore.add(leg);
      }
    }
    const tableTopBoard = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 1.1), std('#a16207'));
    tableTopBoard.position.y = 0.61;
    tableCore.add(tableTopBoard);
    root.add(tableCore);

    // 砝码（最多 4 个，每个 5N）
    const weights: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const w = new THREE.Mesh(
        new THREE.CylinderGeometry(0.17, 0.19, 0.12, 16),
        std('#334155', { metalness: 0.5, roughness: 0.35 }),
      );
      root.add(w);
      weights.push(w);
    }
    weights.forEach((w, i) => {
      w.visible = i < Math.round(force / 5);
    });
    const weightLabel = makeLabel('砝码', { fontSize: 34, scale: 0.75 });
    root.add(weightLabel);

    // 信息牌 + 步骤提示
    const info = makeLabel('', { fontSize: 40, scale: 1, color: '#0f766e' });
    info.position.set(0, 3.3, 0);
    root.add(info);
    let lastInfo = '';
    const setInfo = (text: string) => {
      if (text === lastInfo) return;
      lastInfo = text;
      info.material.map?.dispose();
      info.material.dispose();
      const nl = makeLabel(text, { fontSize: 40, scale: 1, color: '#0f766e' });
      info.material = nl.material;
      info.scale.copy(nl.scale);
    };
    const hints = [
      '凹陷越深 → 压力作用效果越明显',
      'p = F ÷ S：压力和面积两个因素',
      '增大压强：钉子尖、刀刃、啄木鸟的喙',
      '减小压强：宽背带、滑雪板、坦克履带',
    ].map((t) => {
      const lab = makeLabel(t, { fontSize: 34, scale: 0.85, color: '#7c3aed' });
      lab.position.set(0, 2.75, 0);
      lab.visible = false;
      root.add(lab);
      return lab;
    });

    const pressure = () => force / (area === 'legs' ? S_LEGS : S_TOP);
    const depthTarget = () => Math.min(pressure() * 0.0012, 0.45);
    let depthCur = 0;

    const refreshInfo = () => {
      const s = area === 'legs' ? S_LEGS : S_TOP;
      setInfo(`p = F ÷ S = ${force}N ÷ ${s}m² = ${pressure().toFixed(0)}Pa`);
    };
    refreshInfo();

    // 凹陷：只修改海绵顶面顶点
    const applyDent = (depth: number) => {
      for (let i = 0; i < posAttr.count; i++) {
        const bx = basePos[i * 3];
        const by = basePos[i * 3 + 1];
        const bz = basePos[i * 3 + 2];
        let y = by;
        if (by > 0.39 && depth > 0.0005) {
          let d = 0;
          if (area === 'legs') {
            for (const sx of [-LEG_X, LEG_X]) {
              for (const sz of [-LEG_Z, LEG_Z]) {
                const r2 = (bx - sx) * (bx - sx) + (bz - sz) * (bz - sz);
                d = Math.max(d, depth * Math.exp(-r2 / 0.09));
              }
            }
          } else {
            const qx = THREE.MathUtils.clamp((Math.abs(bx) - 0.7) / 0.35, 0, 1);
            const qz = THREE.MathUtils.clamp((Math.abs(bz) - 0.45) / 0.35, 0, 1);
            d = depth * (1 - qx) * (1 - qz);
          }
          y = by - d;
        }
        posAttr.setY(i, y);
      }
      posAttr.needsUpdate = true;
      spongeGeo.computeVertexNormals();
    };

    const applyArea = () => {
      const isLegs = area === 'legs';
      tableCore.rotation.x = isLegs ? 0 : Math.PI;
      legPatches.forEach((d) => {
        d.visible = isLegs;
      });
      topPatch.visible = !isLegs;
      refreshInfo();
    };
    applyArea();

    const applyStep = () => {
      hints.forEach((h, i) => {
        h.visible = i === step;
      });
    };
    applyStep();

    return {
      setStep(i) {
        step = i;
        applyStep();
      },
      setParam(id, value) {
        if (id === 'f') {
          force = Number(value);
          const n = Math.round(force / 5);
          weights.forEach((w, i) => {
            w.visible = i < n;
          });
          refreshInfo();
        }
        if (id === 'area') {
          area = String(value) as AreaMode;
          applyArea();
        }
      },
      update(dt) {
        // 凹陷深度平滑过渡
        const target = depthTarget();
        if (Math.abs(depthCur - target) > 0.0004) {
          depthCur = THREE.MathUtils.damp(depthCur, target, 6, dt);
          applyDent(depthCur);
        }
        // 小桌随凹陷下沉
        const sink = depthCur * 0.8;
        const baseY = area === 'legs' ? SPONGE_TOP : SPONGE_TOP + 0.67;
        tableCore.position.y = baseY - sink;
        weights.forEach((w, i) => {
          const wy = area === 'legs' ? 1.53 + i * 0.13 : 0.98 + i * 0.13;
          w.position.set(0, wy - sink, 0);
        });
        weightLabel.position.set(0.75, (area === 'legs' ? 1.7 : 1.15) - sink, 0);
      },
      dispose() {
        ctx.scene.remove(root);
        disposeObject(root);
      },
    };
  },
};
