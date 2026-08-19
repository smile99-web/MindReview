// ---------------------------------------------------------------------------
// 物理 · 浮力与浮沉条件：阿基米德原理（量筒接排开的水）+ 上浮/悬浮/下沉
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, disposeObject, makeArrow, makeLabel, std } from '../three-utils';

type ObjKey = 'wood' | 'ball' | 'iron';

const TANK_X = -0.5;
const TANK_FLOOR = 0.1;
const WATER_Y = 1.95; // 水面（溢水口高度）
const HOLD_Y = 3.1;
const G_EFF = 3.2;
const F_FULL = 1.5; // 全部浸没时的浮力

const OBJS: Record<ObjKey, { name: string; G: number; size: number; color: string; sphere: boolean; note: string }> = {
  wood: { name: '木块', G: 0.9, size: 0.7, color: '#d97706', sphere: false, note: '密度小于水' },
  ball: { name: '悬浮球', G: 1.5, size: 0.8, color: '#f59e0b', sphere: true, note: '密度等于水' },
  iron: { name: '铁块', G: 2.2, size: 0.6, color: '#334155', sphere: false, note: '密度大于水' },
};

export const buoyancyScene: Scene3DDefinition = {
  id: 'phys-buoyancy',
  title: '浮力与浮沉',
  subject: '物理',
  grade: '8下',
  icon: '🛟',
  tagline: 'F 浮等于排开液体的重力：铁块沉底，轮船为什么能浮？',
  keywords: ['浮力', '阿基米德', '排开液体', '漂浮', '悬浮', '沉底', '浮沉条件', '密度比较'],
  camera: { position: [4.2, 3.6, 7.2], target: [0.2, 1.5, 0] },
  controls: [
    {
      kind: 'select',
      id: 'obj',
      label: '物体',
      options: [
        { value: 'wood', label: '木块（上浮）' },
        { value: 'ball', label: '悬浮球（密度等于水）' },
        { value: 'iron', label: '铁块（下沉）' },
      ],
      defaultValue: 'wood',
    },
    { kind: 'slider', id: 'rho', label: '液体密度 ρ液', min: 600, max: 1600, step: 50, defaultValue: 1000, unit: 'kg/m³' },
    { kind: 'button', id: 'drop', label: '🫳 松手' },
  ],
  steps: [
    {
      title: '浮力',
      text: '浸在液体里的物体，会受到液体向上托的力，这就是浮力。用弹簧测力计吊着铁块浸入水中，示数会变小，就是浮力在帮忙。点"松手"，把物体放进水里试试。',
    },
    {
      title: '阿基米德原理',
      text: '阿基米德原理：F 浮等于 G 排，也就是物体排开的那部分液体所受的重力，等于 ρ 液 g V 排。看右边的小量筒：物体浸入多少，排开的水就溢出多少。',
    },
    {
      title: '浮沉条件',
      text: '浮沉由浮力和重力的大小决定：浮力大于重力就上浮，相等就悬浮或漂浮，小于重力就下沉。换种说法：物体密度小于液体密度会上浮，相等则悬浮，大于就下沉。',
    },
    {
      title: '应用',
      text: '钢铁的密度比水大，轮船为什么能浮？做成空心的，排开水的体积大大增加，浮力就够了。潜水艇靠水舱充水、排水改变自身重力，实现下潜和上浮。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 12);
    const root = new THREE.Group();
    ctx.scene.add(root);

    let step = 0;
    let objKey: ObjKey = 'wood';
    let phase: 'held' | 'fall' = 'held';
    let y = HOLD_Y;
    let vy = 0;
    let rho = 1000; // 液体密度 kg/m³（水 = 1000）
    let lastFrac = 0; // 当前浸没体积比例 V排/V

    // 水槽 + 水 + 溢水口
    const glassMat = std('#dbeafe', { transparent: true, opacity: 0.16, depthWrite: false });
    const tank = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 1.8), glassMat);
    tank.position.set(TANK_X, TANK_FLOOR + 1.2, 0);
    root.add(tank);
    const water = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, WATER_Y - TANK_FLOOR, 1.7),
      std('#38bdf8', { transparent: true, opacity: 0.45, depthWrite: false }),
    );
    water.position.set(TANK_X, (TANK_FLOOR + WATER_Y) / 2, 0);
    root.add(water);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 10), glassMat);
    spout.rotation.z = 1.1;
    spout.position.set(TANK_X + 1.55, WATER_Y - 0.1, 0);
    root.add(spout);

    // 量筒（接排开的水）
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 1.5, 18, 1, true), glassMat);
    cyl.position.set(2.3, 0.75, 0);
    root.add(cyl);
    const cylBase = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.08, 18), std('#64748b'));
    cylBase.position.set(2.3, 0.04, 0);
    root.add(cylBase);
    const cylWater = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 1, 14),
      std('#0ea5e9', { transparent: true, opacity: 0.7 }),
    );
    cylWater.position.set(2.3, 0.08, 0);
    cylWater.scale.y = 0.001;
    root.add(cylWater);
    const cylLabel = makeLabel('量筒：接住排开的水', { fontSize: 32, scale: 0.8, color: '#0369a1' });
    cylLabel.position.set(2.3, 1.85, 0);
    root.add(cylLabel);

    // 物体（三种，切换显隐）
    const meshes: Record<ObjKey, THREE.Mesh> = {
      wood: new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), std(OBJS.wood.color)),
      ball: new THREE.Mesh(new THREE.SphereGeometry(0.4, 18, 14), std(OBJS.ball.color)),
      iron: new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.6, 0.6),
        std(OBJS.iron.color, { metalness: 0.6, roughness: 0.3 }),
      ),
    };
    (Object.keys(meshes) as ObjKey[]).forEach((k) => {
      meshes[k].visible = k === objKey;
      root.add(meshes[k]);
    });

    // 排开液体高亮
    const dispBox = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      std('#fde047', { transparent: true, opacity: 0.5, depthWrite: false }),
    );
    dispBox.visible = false;
    root.add(dispBox);

    // 力箭头
    const gArrow = makeArrow('#dc2626');
    const fArrow = makeArrow('#16a34a');
    root.add(gArrow.group, fArrow.group);
    const gLab = makeLabel('G', { fontSize: 38, scale: 0.8, color: '#b91c1c' });
    const fLab = makeLabel('F 浮', { fontSize: 38, scale: 0.8, color: '#15803d' });
    root.add(gLab, fLab);

    // 状态牌 + 步骤提示
    const status = makeLabel('', { fontSize: 40, scale: 1, color: '#0f766e' });
    status.position.set(0.2, 4.0, 0);
    root.add(status);
    let lastStatus = '';
    const setStatus = (text: string, color = '#0f766e') => {
      if (text === lastStatus) return;
      lastStatus = text;
      status.material.map?.dispose();
      status.material.dispose();
      const nl = makeLabel(text, { fontSize: 40, scale: 1, color });
      status.material = nl.material;
      status.scale.copy(nl.scale);
    };
    setStatus('点"松手"把物体放入水中');
    const hints = [
      '浮力：液体向上托的力',
      'F浮 = G排 = ρ液·g·V排',
      '比较 F浮 与 G：决定浮沉',
      '轮船空心增大 V排；潜水艇改变自身重力',
    ].map((t) => {
      const lab = makeLabel(t, { fontSize: 34, scale: 0.85, color: '#7c3aed' });
      lab.position.set(0.2, 4.5, 0);
      lab.visible = false;
      root.add(lab);
      return lab;
    });

    const applyStep = () => {
      hints.forEach((h, i) => {
        h.visible = i === step;
      });
    };
    applyStep();

    const resetObj = () => {
      (Object.keys(meshes) as ObjKey[]).forEach((k) => {
        meshes[k].visible = k === objKey;
      });
      phase = 'held';
      y = HOLD_Y;
      vy = 0;
      setStatus('点"松手"把物体放入水中');
    };

    const tmpFrom = new THREE.Vector3();
    const tmpTo = new THREE.Vector3();

    return {
      setStep(i) {
        step = i;
        applyStep();
      },
      setParam(id, value) {
        if (id === 'obj') {
          objKey = String(value) as ObjKey;
          resetObj();
        }
        if (id === 'rho') {
          rho = Number(value);
        }
        if (id === 'drop' && phase === 'held') {
          phase = 'fall';
          vy = 0;
        }
      },
      getReadouts() {
        const cfg = OBJS[objKey];
        const rhoObj = (cfg.G / F_FULL) * 1000; // kg/m³（水中浸没浮力 F_FULL 反推）
        const submerged = phase === 'fall' && lastFrac > 0.01;
        const fB = F_FULL * (rho / 1000) * (submerged ? lastFrac : 1);
        const state = Math.abs(rhoObj - rho) < 1e-6 ? '悬浮' : rhoObj < rho ? '漂浮' : '下沉';
        return [
          { label: '物体密度', value: `${(rhoObj / 1000).toFixed(2)} g/cm³` },
          { label: submerged ? '浮力 F浮' : '浸没浮力', value: `${fB.toFixed(2)} N` },
          { label: '状态', value: state },
        ];
      },
      update(dt) {
        const cfg = OBJS[objKey];
        const mesh = meshes[objKey];
        const half = cfg.size / 2;
        if (phase === 'fall') {
          const subBottom = y - half;
          const frac = THREE.MathUtils.clamp((WATER_Y - subBottom) / cfg.size, 0, 1);
          const F = F_FULL * (rho / 1000) * frac; // F浮 = ρ液·g·V排，F_FULL 为水（1000）时浸没浮力
          const a = ((F - cfg.G) / cfg.G) * G_EFF;
          vy += a * dt;
          vy *= 1 - Math.min(1.6 * frac * dt + 0.05 * dt, 0.5); // 水阻 + 空气阻
          y += vy * dt;
          if (y - half <= TANK_FLOOR) {
            y = TANK_FLOOR + half;
            vy = 0;
          }
          // 状态判定
          if (frac <= 0.01) setStatus('下落中……');
          else if (vy > 0.12) setStatus('上浮：F浮 > G');
          else if (vy < -0.12 && y - half > TANK_FLOOR + 0.01) setStatus('下沉：G > F浮');
          else if (y - half <= TANK_FLOOR + 0.01) setStatus(`沉底：G 大于最大浮力（${cfg.note}）`, '#b91c1c');
          else if (frac >= 0.99) setStatus(`悬浮：F浮 = G，停在水中（${cfg.note}）`);
          else setStatus(`漂浮：F浮 = G（${cfg.note}）`);
        }
        mesh.position.set(TANK_X, y, 0);
        mesh.rotation.y += (phase === 'fall' ? 0.4 : 0.1) * dt;

        // 排开液体高亮 + 量筒液面
        const frac = THREE.MathUtils.clamp((WATER_Y - (y - half)) / cfg.size, 0, 1);
        lastFrac = frac;
        if (frac > 0.01) {
          const subH = frac * cfg.size;
          dispBox.visible = true;
          dispBox.scale.set(cfg.size, subH, cfg.size);
          dispBox.position.set(TANK_X, y - half + subH / 2, 0);
        } else {
          dispBox.visible = false;
        }
        const cylH = Math.max(frac * 1.15, 0.001);
        cylWater.scale.y = cylH;
        cylWater.position.y = 0.08 + cylH / 2;

        // 力箭头：G 向下（红），F浮 向上（绿）
        const showArrows = phase === 'fall' || step >= 2;
        gArrow.group.visible = showArrows;
        fArrow.group.visible = showArrows && frac > 0.01;
        gLab.visible = showArrows;
        fLab.visible = showArrows && frac > 0.01;
        if (showArrows) {
          const gLen = cfg.G * 0.7;
          gArrow.set(tmpFrom.set(TANK_X - 0.55, y + 0.3, 0), tmpTo.set(TANK_X - 0.55, y + 0.3 - gLen, 0));
          gLab.position.set(TANK_X - 0.95, y + 0.3 - gLen, 0);
          if (frac > 0.01) {
            const fLen = Math.max(F_FULL * (rho / 1000) * frac * 0.7, 0.12);
            fArrow.set(tmpFrom.set(TANK_X + 0.55, y - 0.3, 0), tmpTo.set(TANK_X + 0.55, y - 0.3 + fLen, 0));
            fLab.position.set(TANK_X + 1.05, y - 0.3 + fLen, 0);
          }
        }
      },
      dispose() {
        ctx.scene.remove(root);
        disposeObject(root);
      },
    };
  },
};
