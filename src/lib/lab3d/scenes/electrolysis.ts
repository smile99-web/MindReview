// ---------------------------------------------------------------------------
// 化学 · 电解水：正氧负氢、氢二氧一；微观上水分子拆成原子再重组
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, cylinderBetween, damp, disposeObject, makeLabel, std } from '../three-utils';

const GLASS = (op = 0.26) =>
  std('#dbeafe', { transparent: true, opacity: op, side: THREE.DoubleSide, roughness: 0.15 });

const TROUGH = { x: -1.5, w: 3.6, h: 0.9, d: 1.8 };
const WATER_Y = 0.62;
const TUBE_R = 0.42;
const TUBE_MOUTH = 0.35;
const TUBE_TOP = 2.95;
const H2_X = TROUGH.x - 0.8; // 负极（氢气）
const O2_X = TROUGH.x + 0.8; // 正极（氧气）
const GAS_MAX_H2 = 2.2;
const GAS_MAX_O2 = 1.1;

interface Bubble {
  mesh: THREE.Mesh;
  life: number;
  maxY: number;
}

export const electrolysisScene: Scene3DDefinition = {
  id: 'chem-electrolysis',
  title: '电解水',
  subject: '化学',
  grade: '9上',
  icon: '⚡',
  tagline: '正氧负氢、氢二氧一——水是由氢元素和氧元素组成的',
  keywords: ['电解水', '氢气', '氧气', '水的组成', '电极', '正极', '负极', '电解'],
  camera: { position: [4.5, 4.5, 10.5], target: [0.2, 1.9, 0] },
  controls: [
    { kind: 'button', id: 'power', label: '⚡ 通电 / 断电' },
    { kind: 'button', id: 'test', label: '🔍 检验气体' },
  ],
  steps: [
    {
      title: '装置与现象',
      text: '这是电解水装置：两根玻璃管倒扣在装水的水槽里，管口的电极连接直流电源——红色是正极，蓝色是负极。通电以后仔细看，两个电极上都在冒气泡，气体聚集在玻璃管顶端，把管里的水面慢慢往下压。',
    },
    {
      title: '体积比二比一',
      text: '对照刻度看：负极那根管里的气体，体积差不多是正极管的两倍。记住口诀——正氧负氢，氢二氧一：正极产生氧气，负极产生氢气，氢气和氧气的体积比是二比一。',
    },
    {
      title: '气体检验',
      text: '怎么验证这两种气体？点"检验气体"：把负极管的气体点燃，它安静地燃烧，火焰呈淡蓝色——是氢气；把带火星的木条伸到正极管口，木条复燃——是氧气。能燃烧的是氢气，能助燃的是氧气。',
    },
    {
      title: '水的组成',
      text: '微观上发生了什么？通电时，每个水分子拆成两个氢原子和一个氧原子，然后原子重新组合：每两个氢原子结成一个氢分子，每两个氧原子结成一个氧分子。所以结论：水是由氢元素和氧元素组成的。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 14);
    const root = new THREE.Group();
    ctx.scene.add(root);
    let step = 0;
    let powerOn = true;
    let gasH2 = 0;
    let gasO2 = 0;
    let testT = -1; // 检验时间线

    // ---- 水槽 ----
    const troughWall = new THREE.Mesh(new THREE.BoxGeometry(TROUGH.w, TROUGH.h, TROUGH.d), GLASS(0.22));
    troughWall.position.set(TROUGH.x, TROUGH.h / 2, 0);
    root.add(troughWall);
    const troughWater = new THREE.Mesh(
      new THREE.BoxGeometry(TROUGH.w - 0.1, WATER_Y - 0.05, TROUGH.d - 0.1),
      std('#38bdf8', { transparent: true, opacity: 0.45, roughness: 0.2 }),
    );
    troughWater.position.set(TROUGH.x, (WATER_Y - 0.05) / 2 + 0.03, 0);
    root.add(troughWater);

    // ---- 两根玻璃管（倒扣）+ 活塞 ----
    interface Tube {
      x: number;
      water: THREE.Mesh;
      gas: THREE.Mesh;
      bubbles: Bubble[];
      timer: number;
      rate: number;
    }
    const tubes: Tube[] = [];
    const bubbleGeo = new THREE.SphereGeometry(0.055, 8, 6);
    const bubbleMat = std('#f0f9ff', { transparent: true, opacity: 0.85, roughness: 0.1 });
    [H2_X, O2_X].forEach((x, idx) => {
      const wall = new THREE.Mesh(
        new THREE.CylinderGeometry(TUBE_R, TUBE_R, TUBE_TOP - TUBE_MOUTH, 22, 1, true),
        GLASS(),
      );
      wall.position.set(x, (TUBE_TOP + TUBE_MOUTH) / 2, 0);
      root.add(wall);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(TUBE_R, TUBE_R, 0.05, 22), GLASS(0.4));
      cap.position.set(x, TUBE_TOP + 0.025, 0);
      root.add(cap);
      const cock = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 10), std('#78716c'));
      cock.position.set(x, TUBE_TOP + 0.2, 0);
      root.add(cock);
      // 刻度环
      for (let i = 1; i <= 4; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(TUBE_R + 0.012, 0.014, 6, 30), std('#64748b'));
        ring.rotation.x = Math.PI / 2;
        ring.position.set(x, TUBE_MOUTH + ((TUBE_TOP - TUBE_MOUTH) / 5) * i, 0);
        root.add(ring);
      }
      const water = new THREE.Mesh(
        new THREE.CylinderGeometry(TUBE_R - 0.04, TUBE_R - 0.04, 1, 18),
        std('#38bdf8', { transparent: true, opacity: 0.5, roughness: 0.2 }),
      );
      root.add(water);
      const gas = new THREE.Mesh(
        new THREE.CylinderGeometry(TUBE_R - 0.04, TUBE_R - 0.04, 1, 18),
        std(idx === 0 ? '#bfdbfe' : '#fecaca', { transparent: true, opacity: 0.35, roughness: 0.2 }),
      );
      root.add(gas);
      const bubbles: Bubble[] = [];
      for (let i = 0; i < 18; i++) {
        const mesh = new THREE.Mesh(bubbleGeo, bubbleMat);
        mesh.visible = false;
        root.add(mesh);
        bubbles.push({ mesh, life: 1, maxY: 2 });
      }
      tubes.push({ x, water, gas, bubbles, timer: idx * 0.06, rate: idx === 0 ? 0.14 : 0.07 });
    });

    // ---- 电极 ----
    const elecH = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.3), std('#9ca3af', { metalness: 0.6, roughness: 0.35 }));
    elecH.position.set(H2_X, 0.32, 0);
    root.add(elecH);
    const elecO = elecH.clone();
    elecO.position.set(O2_X, 0.32, 0);
    root.add(elecO);

    // ---- 电源 + 导线 ----
    const battery = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.7), std('#334155'));
    battery.position.set(TROUGH.x, 0.4, 2.1);
    root.add(battery);
    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 10, 8),
      std('#4ade80', { emissive: '#22c55e', emissiveIntensity: 1.5 }),
    );
    led.position.set(TROUGH.x, 0.85, 2.1);
    root.add(led);
    const plusLabel = makeLabel('+ 正极', { fontSize: 36, scale: 0.8, color: '#dc2626' });
    plusLabel.position.set(TROUGH.x + 0.45, 1.25, 2.1);
    root.add(plusLabel);
    const minusLabel = makeLabel('− 负极', { fontSize: 36, scale: 0.8, color: '#2563eb' });
    minusLabel.position.set(TROUGH.x - 0.45, 1.25, 2.1);
    root.add(minusLabel);
    const wireRed = std('#dc2626');
    const wireBlue = std('#2563eb');
    root.add(cylinderBetween(new THREE.Vector3(O2_X - 0.2, 0.6, 1.85), new THREE.Vector3(O2_X, 0.38, 0.25), 0.035, wireRed));
    root.add(cylinderBetween(new THREE.Vector3(H2_X + 0.2, 0.6, 1.85), new THREE.Vector3(H2_X, 0.38, 0.25), 0.035, wireBlue));
    const dcLabel = makeLabel('直流电源', { fontSize: 34, scale: 0.8 });
    dcLabel.position.set(TROUGH.x, 0.35, 2.75);
    root.add(dcLabel);

    // ---- 管顶标签 ----
    const h2Label = makeLabel('负极：氢气（多）', { fontSize: 36, scale: 0.85, color: '#1d4ed8' });
    h2Label.position.set(H2_X, TUBE_TOP + 0.85, 0);
    root.add(h2Label);
    const o2Label = makeLabel('正极：氧气（少）', { fontSize: 36, scale: 0.85, color: '#b91c1c' });
    o2Label.position.set(O2_X, TUBE_TOP + 0.85, 0);
    root.add(o2Label);
    const ratioLabel = makeLabel('体积比 氢气 : 氧气 = 2 : 1', { fontSize: 42, scale: 1, color: '#b45309' });
    ratioLabel.position.set(TROUGH.x, TUBE_TOP + 1.6, 0);
    ratioLabel.visible = false;
    root.add(ratioLabel);

    // ---- 检验道具：淡蓝火焰（左管口）+ 复燃木条（右管口）----
    const h2Flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.75, 14),
      std('#93c5fd', { emissive: '#60a5fa', emissiveIntensity: 1.6, transparent: true, opacity: 0.9 }),
    );
    h2Flame.position.set(H2_X, TUBE_TOP + 0.75, 0);
    h2Flame.visible = false;
    root.add(h2Flame);
    const h2TestLabel = makeLabel('氢气燃烧：淡蓝色火焰', { fontSize: 38, scale: 0.9, color: '#1d4ed8' });
    h2TestLabel.position.set(H2_X - 0.3, TUBE_TOP + 1.7, 0);
    h2TestLabel.visible = false;
    root.add(h2TestLabel);
    const splint = new THREE.Group();
    splint.position.set(O2_X, TUBE_TOP + 0.9, 0);
    splint.visible = false;
    root.add(splint);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8), std('#a16207'));
    stick.rotation.z = 0.4;
    splint.add(stick);
    const ember = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 10, 8),
      std('#ef4444', { emissive: '#dc2626', emissiveIntensity: 1.4 }),
    );
    ember.position.set(0.22, -0.58, 0);
    splint.add(ember);
    const o2Burst = new THREE.Mesh(
      new THREE.ConeGeometry(0.26, 0.85, 14),
      std('#fbbf24', { emissive: '#f59e0b', emissiveIntensity: 1.7, transparent: true, opacity: 0.95 }),
    );
    o2Burst.position.set(O2_X + 0.2, TUBE_TOP + 0.75, 0);
    o2Burst.visible = false;
    root.add(o2Burst);
    const o2TestLabel = makeLabel('木条复燃：是氧气', { fontSize: 38, scale: 0.9, color: '#b91c1c' });
    o2TestLabel.position.set(O2_X + 0.4, TUBE_TOP + 1.7, 0);
    o2TestLabel.visible = false;
    root.add(o2TestLabel);

    // ---- 微观动画组（第 4 步）----
    const micro = new THREE.Group();
    micro.position.set(3.1, 2.1, 0);
    micro.visible = false;
    root.add(micro);
    const oGeo = new THREE.SphereGeometry(0.3, 18, 14);
    const hGeo = new THREE.SphereGeometry(0.21, 14, 10);
    const oMat = std('#ef4444');
    const hMat = std('#f1f5f9');
    // 起始（两个水分子）与终点（氢氢分子 + 氧分子）
    const home: [number, number][] = [
      [-0.85, 0.25], // O0
      [0.85, 0.25], // O1
      [-1.3, 0.7], // H0
      [-0.4, 0.7], // H1
      [0.4, 0.7], // H2
      [1.3, 0.7], // H3
    ];
    const goal: [number, number][] = [
      [-0.3, -0.85], // O0 → O2 分子
      [0.3, -0.85], // O1
      [-1.25, 1.15], // H0 → H2 分子甲
      [-0.75, 1.15], // H1
      [0.75, 1.15], // H2 → H2 分子乙
      [1.25, 1.15], // H3
    ];
    const atoms: THREE.Mesh[] = [];
    home.forEach((p, i) => {
      const mesh = new THREE.Mesh(i < 2 ? oGeo : hGeo, i < 2 ? oMat : hMat);
      mesh.position.set(p[0], p[1], 0);
      micro.add(mesh);
      atoms.push(mesh);
    });
    const bondMatA = std('#94a3b8', { transparent: true, opacity: 1 });
    const bondMatB = std('#94a3b8', { transparent: true, opacity: 0 });
    const mkBond = (a: [number, number], b: [number, number], mat: THREE.Material) => {
      const m = cylinderBetween(new THREE.Vector3(a[0], a[1], 0), new THREE.Vector3(b[0], b[1], 0), 0.06, mat);
      micro.add(m);
      return m;
    };
    // 反应物 4 条 O-H 键
    mkBond(home[0], home[2], bondMatA);
    mkBond(home[0], home[3], bondMatA);
    mkBond(home[1], home[4], bondMatA);
    mkBond(home[1], home[5], bondMatA);
    // 生成物 3 条键
    mkBond(goal[0], goal[1], bondMatB);
    mkBond(goal[2], goal[3], bondMatB);
    mkBond(goal[4], goal[5], bondMatB);
    const microLabelA = makeLabel('两个水分子', { fontSize: 38, scale: 0.9 });
    microLabelA.position.set(0, 2.1, 0);
    micro.add(microLabelA);
    const microLabelB = makeLabel('两个氢分子 + 一个氧分子', { fontSize: 38, scale: 0.9, color: '#b45309' });
    microLabelB.position.set(0, 2.1, 0);
    microLabelB.visible = false;
    micro.add(microLabelB);
    let microT = 0;

    const applyStep = () => {
      ratioLabel.visible = step >= 1 && step < 3;
      micro.visible = step >= 3;
      if (step >= 3) microT = 0;
    };
    applyStep();

    return {
      setStep(i) {
        step = i;
        applyStep();
      },
      setParam(id) {
        if (id === 'power') powerOn = !powerOn;
        if (id === 'test' && testT < 0) testT = 0;
      },
      update(dt, elapsed) {
        // 气体积累
        if (powerOn) {
          gasH2 = Math.min(gasH2 + dt * 0.14, GAS_MAX_H2);
          gasO2 = Math.min(gasO2 + dt * 0.07, GAS_MAX_O2);
        }
        const ledMat = led.material as THREE.MeshStandardMaterial;
        ledMat.emissiveIntensity = powerOn ? 1.2 + Math.sin(elapsed * 6) * 0.4 : 0;
        // 每根管的水位 / 气泡
        tubes.forEach((tb, idx) => {
          const gasAmt = idx === 0 ? gasH2 : gasO2;
          const level = TUBE_TOP - 0.05 - gasAmt;
          const wh = Math.max(level - TUBE_MOUTH, 0.02);
          tb.water.scale.y = wh;
          tb.water.position.set(tb.x, TUBE_MOUTH + wh / 2, 0);
          const gh = Math.max(TUBE_TOP - 0.05 - level, 0.02);
          tb.gas.scale.y = gh;
          tb.gas.position.set(tb.x, level + gh / 2, 0);
          if (powerOn && gasAmt < (idx === 0 ? GAS_MAX_H2 : GAS_MAX_O2)) {
            tb.timer += dt;
            if (tb.timer > 0.14) {
              tb.timer = 0;
              const b = tb.bubbles.find((x) => x.life >= 1);
              if (b) {
                b.life = 0;
                b.maxY = level - 0.08;
                b.mesh.visible = true;
                b.mesh.position.set(tb.x + (Math.random() - 0.5) * 0.3, 0.42, (Math.random() - 0.5) * 0.3);
                b.mesh.scale.setScalar(0.6 + Math.random() * 0.7);
              }
            }
          }
          tb.bubbles.forEach((b) => {
            if (b.life >= 1) return;
            b.life += dt * 0.6;
            b.mesh.position.y += dt * 1.1;
            if (b.mesh.position.y > b.maxY || b.life >= 1) {
              b.life = 1;
              b.mesh.visible = false;
            }
          });
        });
        // 检验时间线：0-2.5s 氢气点燃；2.5-5.5s 氧气复燃
        if (testT >= 0) {
          testT += dt;
          const gasFrac = Math.min(gasH2 / GAS_MAX_H2 + 0.35, 1);
          if (testT < 2.5) {
            h2Flame.visible = true;
            h2TestLabel.visible = true;
            const s = damp(h2Flame.scale.x, gasFrac, 5, dt);
            h2Flame.scale.set(s, s * (1 + Math.sin(elapsed * 18) * 0.12), s);
          } else {
            h2Flame.visible = false;
            h2TestLabel.visible = false;
          }
          if (testT > 2.5 && testT < 5.5) {
            splint.visible = true;
            splint.position.y = TUBE_TOP + 0.9 - Math.min((testT - 2.5) * 0.5, 0.35);
            o2Burst.visible = testT > 3.1;
            o2TestLabel.visible = testT > 3.1;
            if (o2Burst.visible) {
              const s = damp(o2Burst.scale.x, gasFrac, 6, dt);
              o2Burst.scale.set(s, s * (1 + Math.sin(elapsed * 21) * 0.12), s);
            }
          } else {
            splint.visible = false;
            o2Burst.visible = false;
            o2TestLabel.visible = false;
          }
          if (testT > 5.8) testT = -1;
        }
        // 微观循环动画（7 秒一个循环）
        if (micro.visible) {
          microT += dt;
          const p = (microT % 7) / 7;
          let mix = 0;
          if (p < 0.25) mix = 0;
          else if (p < 0.65) {
            const k = (p - 0.25) / 0.4;
            mix = k * k * (3 - 2 * k);
          } else mix = 1;
          const vib = p < 0.25 ? (p / 0.25) * 0.06 : 0;
          atoms.forEach((a, i) => {
            const x = home[i][0] + (goal[i][0] - home[i][0]) * mix;
            const y = home[i][1] + (goal[i][1] - home[i][1]) * mix;
            a.position.set(
              x + Math.sin(elapsed * 30 + i * 2) * vib,
              y + Math.cos(elapsed * 26 + i * 3) * vib,
              0,
            );
          });
          bondMatA.opacity = THREE.MathUtils.clamp(1 - p / 0.25, 0, 1);
          bondMatB.opacity = THREE.MathUtils.clamp((p - 0.65) / 0.2, 0, 1);
          microLabelA.visible = p < 0.55;
          microLabelB.visible = p >= 0.55;
          micro.rotation.y = Math.sin(elapsed * 0.4) * 0.25;
        }
      },
      dispose() {
        ctx.scene.remove(root);
        disposeObject(root);
      },
    };
  },
};
