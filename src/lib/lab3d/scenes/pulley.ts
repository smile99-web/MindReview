// ---------------------------------------------------------------------------
// 物理 · 滑轮与滑轮组：定滑轮不省力、动滑轮省一半、滑轮组看绳子段数 n
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, disposeObject, makeArrow, makeLabel, std } from '../three-utils';

type SetupKey = 'fixed' | 'movable' | 'group';

const BEAM_Y = 3.55;
const G_N = 12; // 物重 12N
const LIFT_H = 0.7; // 提升高度
const SETUPS: Record<SetupKey, { n: number; name: string }> = {
  fixed: { n: 1, name: '定滑轮' },
  movable: { n: 2, name: '动滑轮' },
  group: { n: 3, name: '滑轮组' },
};

export const pulleyScene: Scene3DDefinition = {
  id: 'phys-pulley',
  title: '滑轮与滑轮组',
  subject: '物理',
  grade: '8下',
  icon: '🪢',
  tagline: '定滑轮不省力、动滑轮省一半——滑轮组看绳子段数 n',
  keywords: ['滑轮', '定滑轮', '动滑轮', '滑轮组', '省力', '机械效率', '绳子段数'],
  camera: { position: [3.6, 3.2, 7.8], target: [0, 1.9, 0] },
  controls: [
    {
      kind: 'select',
      id: 'setup',
      label: '装置',
      options: [
        { value: 'fixed', label: '定滑轮' },
        { value: 'movable', label: '一个动滑轮' },
        { value: 'group', label: '滑轮组 n=3' },
      ],
      defaultValue: 'movable',
    },
    { kind: 'button', id: 'lift', label: '⬆️ 匀速提升' },
  ],
  steps: [
    {
      title: '定滑轮',
      text: '定滑轮的轴固定不动。它不省力，拉力等于物重，但能改变力的方向：向下拉绳子，物体向上升。升旗时就用到它。本质上，它是一个等臂杠杆。',
    },
    {
      title: '动滑轮',
      text: '动滑轮随物体一起移动。它能省一半的力：F 等于 G 除以二。但省了力就要费距离：手拉绳子移动的距离，是物体上升高度的两倍。',
    },
    {
      title: '滑轮组',
      text: '把定滑轮和动滑轮组合成滑轮组：F 等于 G 除以 n，n 是吊着动滑轮的绳子段数。数一数高亮的几段绳子：三段承重，拉力就是物重的三分之一。',
    },
    {
      title: '省力费距离',
      text: '省力必然费距离：s 等于 n 乘 h，任何机械都不省功。实际使用中，还要克服摩擦和动滑轮自重做额外功，所以机械效率总小于百分之百。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 12);
    const root = new THREE.Group();
    ctx.scene.add(root);

    let step = 0;
    let setup: SetupKey = 'movable';
    let liftDir: 1 | -1 = 1; // 1 提升 / -1 放下
    let liftT = 0; // 0 底部 … 1 顶部
    let moving = false;

    // 支架：横梁 + 立柱
    const beam = new THREE.Mesh(new THREE.BoxGeometry(4, 0.16, 0.4), std('#475569'));
    beam.position.set(0, BEAM_Y + 0.08, 0);
    root.add(beam);
    for (const sx of [-1.9, 1.9]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, BEAM_Y, 10), std('#64748b'));
      post.position.set(sx, BEAM_Y / 2, 0);
      root.add(post);
    }

    // 滑轮（圆盘 + 凹槽轮缘）
    const mkWheel = (r: number) => {
      const g = new THREE.Group();
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.08, 10, 24), std('#b45309'));
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.3, r * 0.3, 0.14, 12), std('#78350f'));
      hub.rotation.x = Math.PI / 2;
      g.add(rim, hub);
      root.add(g);
      return g;
    };
    const wheelF = mkWheel(0.3); // 定滑轮
    const wheelM = mkWheel(0.3); // 动滑轮
    wheelF.position.set(0, 3.25, 0);

    // 锚钩（动滑轮装置的绳子固定端）
    const anchor = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.12), std('#334155'));
    anchor.position.set(-0.3, BEAM_Y - 0.09, 0);
    root.add(anchor);

    // 重物 + 手
    const load = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.72, 0.72), std('#dc2626'));
    root.add(load);
    const loadHook = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.35, 8), std('#7f1d1d'));
    root.add(loadHook);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), std('#fbbf24'));
    root.add(hand);

    // 绳子段（最多 3 段竖直绳）
    const ropeMat = std('#475569');
    const ropeHotMat = std('#0ea5e9', { emissive: '#0284c7', emissiveIntensity: 0.6 });
    const mkSeg = () => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 8), ropeMat);
      root.add(m);
      return m;
    };
    const segs = [mkSeg(), mkSeg(), mkSeg()];
    const UP = new THREE.Vector3(0, 1, 0);
    const tmpDir = new THREE.Vector3();
    const setSeg = (m: THREE.Mesh, ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
      const dx = bx - ax;
      const dy = by - ay;
      const dz = bz - az;
      const len = Math.max(Math.hypot(dx, dy, dz), 0.001);
      m.scale.y = len;
      m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
      m.quaternion.setFromUnitVectors(UP, tmpDir.set(dx / len, dy / len, dz / len));
    };

    // 承重段编号（step2 显示）
    const countLabels = ['1', '2', '3'].map((t) => {
      const lab = makeLabel(t, { fontSize: 40, scale: 0.85, color: '#0369a1' });
      lab.visible = false;
      root.add(lab);
      return lab;
    });

    // 力箭头
    const gArrow = makeArrow('#dc2626');
    const fArrow = makeArrow('#f59e0b');
    root.add(gArrow.group, fArrow.group);
    const gLab = makeLabel(`G = ${G_N}N`, { fontSize: 36, scale: 0.8, color: '#b91c1c' });
    root.add(gLab);
    const fLab = makeLabel('', { fontSize: 36, scale: 0.8, color: '#b45309' });
    root.add(fLab);

    // 距离对比标尺（右侧）
    const mkRuler = (dx: number, color: string, name: string) => {
      const geo = new THREE.BoxGeometry(0.32, 1, 0.2);
      geo.translate(0, 0.5, 0);
      const bar = new THREE.Mesh(geo, std(color));
      bar.position.set(2.6 + dx, 0, 0);
      bar.scale.y = 0.001;
      root.add(bar);
      const lab = makeLabel(name, { fontSize: 30, scale: 0.68 });
      lab.position.set(2.6 + dx, -0.32, 0);
      root.add(lab);
      return bar;
    };
    const sBar = mkRuler(-0.3, '#f59e0b', '手拉距离 s');
    const hBar = mkRuler(0.5, '#16a34a', '上升高度 h');

    // 信息牌 + 步骤提示
    const info = makeLabel('', { fontSize: 40, scale: 1, color: '#0f766e' });
    info.position.set(0, 4.35, 0);
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
      '定滑轮：不省力，改变力的方向',
      '动滑轮：省一半力，费一倍距离',
      '滑轮组：F = G ÷ n，数承重绳子段数',
      '省力必费距离：s = n × h，机械不省功',
    ].map((t) => {
      const lab = makeLabel(t, { fontSize: 34, scale: 0.85, color: '#7c3aed' });
      lab.position.set(0, 4.85, 0);
      lab.visible = false;
      root.add(lab);
      return lab;
    });

    const refreshInfo = () => {
      const n = SETUPS[setup].n;
      setInfo(`${SETUPS[setup].name}：F = G ÷ ${n} = ${(G_N / n).toFixed(0)}N，s = ${n}h`);
      fLab.material.map?.dispose();
      fLab.material.dispose();
      const nl = makeLabel(`F = ${(G_N / n).toFixed(0)}N`, { fontSize: 36, scale: 0.8, color: '#b45309' });
      fLab.material = nl.material;
      fLab.scale.copy(nl.scale);
    };

    const applySetup = () => {
      wheelF.visible = setup !== 'movable';
      wheelM.visible = setup !== 'fixed';
      anchor.visible = setup === 'movable';
      liftT = 0;
      liftDir = 1;
      moving = false;
      refreshInfo();
    };

    const applyStep = () => {
      hints.forEach((h, i) => {
        h.visible = i === step;
      });
      if (step === 0) setup = 'fixed';
      else if (step === 1) setup = 'movable';
      else if (step === 2) setup = 'group';
      applySetup();
    };
    applySetup();
    applyStep();

    const tmpFrom = new THREE.Vector3();
    const tmpTo = new THREE.Vector3();

    return {
      setStep(i) {
        step = i;
        applyStep();
      },
      setParam(id, value) {
        if (id === 'setup') {
          setup = String(value) as SetupKey;
          applySetup();
        }
        if (id === 'lift' && !moving) {
          moving = true;
        }
      },
      update(dt) {
        const n = SETUPS[setup].n;
        if (moving) {
          liftT += liftDir * dt * 0.45;
          if (liftT >= 1) {
            liftT = 1;
            liftDir = -1;
            moving = false;
          } else if (liftT <= 0) {
            liftT = 0;
            liftDir = 1;
            moving = false;
          }
        }
        const rise = liftT * LIFT_H; // 重物上升
        const pulled = rise * n; // 手拉距离
        const loadY = 0.65 + rise;

        // 各装置的绳路与动滑轮位置
        if (setup === 'fixed') {
          const handY = 1.8 - pulled;
          setSeg(segs[0], -0.3, loadY + 0.55, 0, -0.3, 3.25, 0);
          setSeg(segs[1], 0.3, 3.25, 0, 0.3, handY, 0);
          segs[2].visible = false;
          load.position.set(-0.3, loadY, 0);
          hand.position.set(0.3, handY, 0);
        } else if (setup === 'movable') {
          const yM = 1.5 + rise;
          const freeY = 2.7 + pulled;
          wheelM.position.set(0, yM, 0);
          setSeg(segs[0], -0.3, BEAM_Y - 0.18, 0, -0.3, yM, 0);
          setSeg(segs[1], 0.3, yM, 0, 0.3, freeY, 0);
          segs[2].visible = false;
          load.position.set(0, yM - 0.85, 0);
          hand.position.set(0.3, freeY, 0);
        } else {
          const yM = 1.3 + rise;
          const freeY = 2.5 + pulled;
          wheelM.position.set(0, yM, 0);
          setSeg(segs[0], -0.3, yM + 0.5, 0.16, -0.3, 3.25, 0.16); // 固定在动滑轮框上的绳端
          setSeg(segs[1], 0.3, 3.25, 0, 0.3, yM, 0);
          setSeg(segs[2], -0.3, yM, -0.14, -0.3, freeY, -0.14);
          segs[2].visible = true;
          load.position.set(0, yM - 0.85, 0);
          hand.position.set(-0.3, freeY, -0.14);
        }
        loadHook.position.set(load.position.x, load.position.y + 0.53, 0);
        wheelF.rotation.z -= (pulled * dt * 3) / 0.3;
        wheelM.rotation.z -= (pulled * dt * 3) / 0.3;

        // 承重段高亮 + 编号（step2 计数）
        segs.forEach((seg, i) => {
          const active = seg.visible && i < n;
          seg.material = active ? ropeHotMat : ropeMat;
          const lab = countLabels[i];
          lab.visible = step === 2 && seg.visible && i < n;
          if (lab.visible) lab.position.set(seg.position.x + 0.35, seg.position.y, seg.position.z);
        });

        // 力箭头：G 向下，F 沿拉绳方向
        gArrow.set(
          tmpFrom.set(load.position.x - 0.6, load.position.y + 0.2, 0),
          tmpTo.set(load.position.x - 0.6, load.position.y - 1.1, 0),
        );
        gLab.position.set(load.position.x - 1.1, load.position.y - 0.7, 0);
        const fLen = 0.25 + (G_N / n) * 0.08;
        if (setup === 'fixed') {
          fArrow.set(tmpFrom.set(0.3, hand.position.y + fLen, 0), tmpTo.set(0.3, hand.position.y, 0));
          fLab.position.set(0.75, hand.position.y + fLen + 0.2, 0);
        } else {
          const fx = setup === 'group' ? -0.3 : 0.3;
          const fz = setup === 'group' ? -0.14 : 0;
          fArrow.set(tmpFrom.set(fx, hand.position.y - fLen, fz), tmpTo.set(fx, hand.position.y, fz));
          fLab.position.set(fx + 0.55, hand.position.y + 0.35, fz);
        }

        // 距离标尺：s = n·h
        sBar.scale.y = Math.max((pulled / (LIFT_H * 3)) * 1.8, 0.001);
        hBar.scale.y = Math.max((rise / (LIFT_H * 3)) * 1.8, 0.001);
      },
      dispose() {
        ctx.scene.remove(root);
        disposeObject(root);
      },
    };
  },
};
