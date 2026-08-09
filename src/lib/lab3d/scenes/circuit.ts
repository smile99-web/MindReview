// ---------------------------------------------------------------------------
// 物理 · 串联电路：电源、开关、灯泡与定向移动的电子，演示欧姆定律
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, cylinderBetween, makeLabel, std } from '../three-utils';

// 矩形回路的四个角（x-z 平面，离地 y=1.2）
const Y = 1.2;
const CORNERS = [
  new THREE.Vector3(-3, Y, -1.6),
  new THREE.Vector3(3, Y, -1.6),
  new THREE.Vector3(3, Y, 1.6),
  new THREE.Vector3(-3, Y, 1.6),
];

/** 沿矩形回路按弧长取点，t ∈ [0,1) */
function loopPoint(t: number, out: THREE.Vector3): THREE.Vector3 {
  const segs = 4;
  const lens: number[] = [];
  let total = 0;
  for (let i = 0; i < segs; i++) {
    const l = CORNERS[i].distanceTo(CORNERS[(i + 1) % segs]);
    lens.push(l);
    total += l;
  }
  let d = ((t % 1) + 1) % 1 * total;
  for (let i = 0; i < segs; i++) {
    if (d <= lens[i]) {
      return out.copy(CORNERS[i]).lerp(CORNERS[(i + 1) % segs], d / lens[i]);
    }
    d -= lens[i];
  }
  return out.copy(CORNERS[0]);
}

export const circuitScene: Scene3DDefinition = {
  id: 'phys-circuit',
  title: '串联电路与电流',
  subject: '物理',
  icon: '🔌',
  tagline: '闭合开关看电子定向移动，电压越大灯泡越亮——欧姆定律',
  keywords: ['电路', '电流', '电压', '电阻', '欧姆定律', '串联', '开关', '电源', '灯泡', '导体'],
  camera: { position: [5.5, 4.5, 7.5], target: [0, 1, 0] },
  controls: [
    { kind: 'button', id: 'switch', label: '🔘 闭合 / 断开开关' },
    { kind: 'slider', id: 'voltage', label: '电压 U', min: 1.5, max: 9, step: 0.5, defaultValue: 3, unit: 'V' },
  ],
  steps: [
    {
      title: '电路的组成',
      text: '一个完整电路要有四部分：电源提供电能，灯泡是用电器，导线负责输送，开关控制通断。红色大圆柱是电源，黄色小球是灯泡。现在开关是断开的，灯泡不亮。',
    },
    {
      title: '电流的形成',
      text: '闭合开关，电路接通！电荷开始定向移动，就形成了电流。蓝色小点表示负电荷的定向移动。规定正电荷移动方向为电流方向：在电源外部，电流从正极流向负极。',
    },
    {
      title: '欧姆定律',
      text: '拖动电压滑块观察：电压越大，电荷流得越快，灯泡越亮。导体中的电流，跟导体两端的电压成正比，跟导体的电阻成反比，这就是欧姆定律：I 等于 U 除以 R。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 12);
    let step = 0;
    let closed = false;
    let voltage = 3;
    let flowT = 0;

    // 导线回路
    const wireMat = std('#d97706', { metalness: 0.55, roughness: 0.35 });
    for (let i = 0; i < 4; i++) {
      ctx.scene.add(cylinderBetween(CORNERS[i], CORNERS[(i + 1) % 4], 0.045, wireMat));
    }

    // 电源（放在左侧边中间）
    const battery = new THREE.Group();
    const batBody = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.5, 24), std('#dc2626'));
    batBody.rotation.z = Math.PI / 2;
    battery.add(batBody);
    const batTip = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.22, 12), std('#94a3b8', { metalness: 0.7 }));
    batTip.rotation.z = Math.PI / 2;
    batTip.position.x = 0.86;
    battery.add(batTip);
    const plusLabel = makeLabel('＋ 正极', { fontSize: 36, scale: 0.8, color: '#b91c1c' });
    plusLabel.position.set(0.9, 0.65, 0);
    battery.add(plusLabel);
    const minusLabel = makeLabel('－ 负极', { fontSize: 36, scale: 0.8 });
    minusLabel.position.set(-0.9, 0.65, 0);
    battery.add(minusLabel);
    const batLabel = makeLabel('电源', { fontSize: 40, scale: 0.95 });
    batLabel.position.set(0, -0.85, 0);
    battery.add(batLabel);
    battery.position.set(0, Y, -1.6);
    ctx.scene.add(battery);

    // 灯泡（右侧边中间）
    const bulbGroup = new THREE.Group();
    const bulbMat = std('#fef3c7', { emissive: '#f59e0b', emissiveIntensity: 0 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 16), bulbMat);
    bulbGroup.add(bulb);
    const bulbBase = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.3, 12), std('#78716c'));
    bulbBase.position.y = -0.5;
    bulbGroup.add(bulbBase);
    const bulbLabel = makeLabel('灯泡', { fontSize: 40, scale: 0.95 });
    bulbLabel.position.set(0, 0.9, 0);
    bulbGroup.add(bulbLabel);
    bulbGroup.position.set(0, Y, 1.6);
    ctx.scene.add(bulbGroup);

    // 开关（底边中间）：底座 + 可旋转闸刀
    const switchGroup = new THREE.Group();
    const swBase = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 0.5), std('#475569'));
    switchGroup.add(swBase);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.08, 0.14), std('#f59e0b', { metalness: 0.6, roughness: 0.3 }));
    blade.position.x = 0.42;
    const bladePivot = new THREE.Group();
    bladePivot.add(blade);
    bladePivot.position.set(-0.42, 0.1, 0);
    switchGroup.add(bladePivot);
    const swLabel = makeLabel('开关（点按钮试试）', { fontSize: 36, scale: 0.85 });
    swLabel.position.set(0, 0.75, 0);
    switchGroup.add(swLabel);
    switchGroup.position.set(3, Y, 0);
    switchGroup.rotation.y = Math.PI / 2;
    ctx.scene.add(switchGroup);

    // 电流方向箭头（静止标注，step>=1 显示）
    const arrowLabel = makeLabel('电流方向：正极 → 用电器 → 负极', { fontSize: 34, scale: 0.85, color: '#1d4ed8' });
    arrowLabel.position.set(0, Y + 1.6, 0);
    arrowLabel.visible = false;
    ctx.scene.add(arrowLabel);

    // 电子（沿回路移动的小球）
    const N_E = 26;
    const eGeo = new THREE.SphereGeometry(0.09, 10, 8);
    const eMat = std('#38bdf8', { emissive: '#0284c7', emissiveIntensity: 0.8 });
    const electrons: THREE.Mesh[] = [];
    for (let i = 0; i < N_E; i++) {
      const m = new THREE.Mesh(eGeo, eMat);
      ctx.scene.add(m);
      electrons.push(m);
    }
    const tmp = new THREE.Vector3();

    const info = makeLabel('U = 3V', { fontSize: 40, scale: 0.95, color: '#0f766e' });
    info.position.set(0, Y - 1.1, 0);
    ctx.scene.add(info);

    const applyStep = () => {
      arrowLabel.visible = step >= 1;
      if (step === 1 && !closed) closed = true; // 第2步自动闭合
    };

    return {
      setStep(i) {
        step = i;
        applyStep();
      },
      setParam(id, value) {
        if (id === 'switch') closed = !closed;
        if (id === 'voltage') {
          voltage = Number(value);
          const speedText = `U = ${voltage}V，I = ${(voltage / 3).toFixed(1)}A`;
          info.material.map?.dispose();
          info.material.dispose();
          const nl = makeLabel(speedText, { fontSize: 40, scale: 0.95, color: '#0f766e' });
          info.material = nl.material;
          info.scale.copy(nl.scale);
        }
      },
      update(dt) {
        // 开关闸刀动画
        const targetAngle = closed ? 0 : -0.55;
        bladePivot.rotation.z = THREE.MathUtils.damp(bladePivot.rotation.z, targetAngle, 8, dt);
        // 电子流动：欧姆定律 I = U/R，R 固定 3Ω
        const current = closed ? voltage / 3 : 0;
        flowT += dt * current * 0.06;
        electrons.forEach((m, i) => {
          loopPoint(i / N_E + flowT, tmp);
          m.position.copy(tmp);
          m.visible = closed || step === 0 ? true : true;
        });
        // 灯泡亮度 ∝ 电流
        const glow = closed ? Math.min(current / 3, 1) : 0;
        bulbMat.emissiveIntensity = THREE.MathUtils.damp(bulbMat.emissiveIntensity, glow * 1.6, 6, dt);
        bulb.scale.setScalar(1 + bulbMat.emissiveIntensity * 0.12);
      },
      dispose() {
        ctx.scene.remove(battery, bulbGroup, switchGroup, arrowLabel, info);
        electrons.forEach((m) => ctx.scene.remove(m));
        eGeo.dispose();
        eMat.dispose();
      },
    };
  },
};
