// ---------------------------------------------------------------------------
// 物理 · 并联电路与电功率：两条支路互不干扰，灯泡亮度看实际功率
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, cylinderBetween, damp, disposeObject, makeLabel, std } from '../three-utils';

const Y = 1.2;
const R_BULB = 6; // 支路电阻默认值 Ω（滑块 r1/r2 的初始值）
const N_E = 20; // 每条支路回路的电子数

const V = (x: number, z: number) => new THREE.Vector3(x, Y, z);

/** 折线路径：按弧长参数取点 */
function mkPath(pts: THREE.Vector3[]) {
  const segs: { a: THREE.Vector3; b: THREE.Vector3; len: number }[] = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const len = pts[i].distanceTo(pts[i + 1]);
    segs.push({ a: pts[i], b: pts[i + 1], len });
    total += len;
  }
  const at = (t: number, out: THREE.Vector3) => {
    let d = (((t % 1) + 1) % 1) * total;
    for (const s of segs) {
      if (d <= s.len) return out.copy(s.a).lerp(s.b, d / s.len);
      d -= s.len;
    }
    return out.copy(segs[segs.length - 1].b);
  };
  return { total, at };
}

export const circuitParallelScene: Scene3DDefinition = {
  id: 'phys-circuit-parallel',
  title: '并联电路与电功率',
  subject: '物理',
  grade: '9全',
  icon: '💡',
  tagline: '并联各走各的路互不干扰；灯泡有多亮，看实际功率',
  keywords: ['并联', '串联', '支路', '干路', '电功率', '额定功率', '实际功率', '亮度'],
  camera: { position: [5.5, 4.5, 8], target: [-0.3, 1.2, 0] },
  controls: [
    { kind: 'button', id: 's1', label: '🔘 开关 S1（支路1）' },
    { kind: 'button', id: 's2', label: '🔘 开关 S2（支路2）' },
    { kind: 'slider', id: 'u', label: '电压 U', min: 3, max: 12, step: 0.5, defaultValue: 6, unit: 'V' },
    { kind: 'slider', id: 'r1', label: '支路1 电阻 R1', min: 2, max: 20, step: 1, defaultValue: 6, unit: 'Ω' },
    { kind: 'slider', id: 'r2', label: '支路2 电阻 R2', min: 2, max: 20, step: 1, defaultValue: 6, unit: 'Ω' },
  ],
  steps: [
    {
      title: '并联的结构',
      text: '从电源出来，电流在分叉口分成两条支路：每条支路各有一个灯泡和一个开关，最后又汇合流回电源。这种把用电器并列接在两点之间的连接方式，叫做并联。',
    },
    {
      title: '支路互不影响',
      text: '点按钮断开开关 S1 试试：支路一的灯灭了，支路二的灯亮度完全不变。并联电路里各支路独立工作、互不影响——家里的灯和电视能各自开关，就是这个道理。',
    },
    {
      title: '干路与支路电流',
      text: '看电子流：干路上的电子到了分叉口一分为二，干路电流等于各支路电流之和：I 等于 I1 加 I2。两条支路的电阻相同时，电流正好平分，各走一半。',
    },
    {
      title: '电功率与亮度',
      text: '灯泡的亮度由实际功率决定：P 等于 U 乘以 I，也等于 U 平方除以 R。拖动电压滑块，电压加倍，功率变四倍，灯明显更亮。灯泡上标的是额定功率，电压达到额定值时才能实现。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 14);
    const root = new THREE.Group();
    ctx.scene.add(root);
    let step = 0;
    let s1 = true;
    let s2 = true;
    let voltage = 6;
    let r1 = R_BULB;
    let r2 = R_BULB;
    let flow1 = 0;
    let flow2 = 0;

    interface LabelOpts {
      fontSize?: number;
      color?: string;
      bg?: string;
      scale?: number;
    }
    const dynLabel = (text: string, opts: LabelOpts, pos: THREE.Vector3) => {
      const sprite = makeLabel(text, opts);
      sprite.position.copy(pos);
      root.add(sprite);
      let last = text;
      return (t: string) => {
        if (t === last) return;
        last = t;
        sprite.material.map?.dispose();
        sprite.material.dispose();
        const nl = makeLabel(t, opts);
        sprite.material = nl.material;
        sprite.scale.copy(nl.scale);
      };
    };
    const staticLabel = (text: string, opts: LabelOpts, pos: [number, number, number]) => {
      const s = makeLabel(text, opts);
      s.position.set(pos[0], pos[1], pos[2]);
      root.add(s);
      return s;
    };

    // ---- 导线（顶轨 / 底轨 / 支路 / 电源两侧） --------------------------------
    const wireMat = std('#d97706', { metalness: 0.55, roughness: 0.35 });
    const rail: [THREE.Vector3, THREE.Vector3][] = [
      [V(-3.6, 0.9), V(-3.6, 1.6)],
      [V(-3.6, 1.6), V(2.6, 1.6)], // 顶轨（干路）
      [V(-3.6, -1.6), V(2.6, -1.6)], // 底轨（干路）
      [V(-3.6, -0.9), V(-3.6, -1.6)],
      [V(1.2, 1.6), V(1.2, -1.6)], // 支路1
      [V(2.6, 1.6), V(2.6, -1.6)], // 支路2
    ];
    for (const [a, b] of rail) root.add(cylinderBetween(a, b, 0.045, wireMat));

    // 分叉口标记
    for (const x of [1.2, 2.6]) {
      const j = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), std('#b45309'));
      j.position.copy(V(x, 1.6));
      root.add(j);
    }

    // ---- 电源（左侧，轴向 z） -------------------------------------------------
    const battery = new THREE.Group();
    const batBody = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.5, 24), std('#dc2626'));
    batBody.rotation.x = Math.PI / 2;
    battery.add(batBody);
    const batTip = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.22, 12), std('#94a3b8', { metalness: 0.7 }));
    batTip.rotation.x = Math.PI / 2;
    batTip.position.z = 0.86;
    battery.add(batTip);
    battery.position.set(-3.6, Y, 0);
    root.add(battery);
    staticLabel('＋', { fontSize: 40, scale: 0.85, color: '#b91c1c' }, [-3.6, Y + 0.62, 0.95]);
    staticLabel('－', { fontSize: 40, scale: 0.85 }, [-3.6, Y + 0.62, -0.95]);
    staticLabel('电源', { fontSize: 40, scale: 0.95 }, [-3.6, Y - 0.85, 0]);

    // ---- 灯泡 -----------------------------------------------------------------
    const mkBulb = (x: number, z: number) => {
      const g = new THREE.Group();
      const mat = std('#fef3c7', { emissive: '#f59e0b', emissiveIntensity: 0 });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.4, 20, 16), mat);
      g.add(bulb);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.28, 12), std('#78716c'));
      base.position.y = -0.48;
      g.add(base);
      g.position.set(x, Y, z);
      root.add(g);
      return { mat, bulb };
    };
    const bulb1 = mkBulb(1.2, 0.55);
    const bulb2 = mkBulb(2.6, 0.55);
    const setP1 = dynLabel('L1：P = 6.0W', { fontSize: 34, scale: 0.8, color: '#b45309' }, new THREE.Vector3(1.2, Y + 1.0, 0.55));
    const setP2 = dynLabel('L2：P = 6.0W', { fontSize: 34, scale: 0.8, color: '#b45309' }, new THREE.Vector3(2.6, Y + 1.0, 0.55));

    // ---- 开关（支路上，刀片沿 z） ---------------------------------------------
    const mkSwitch = (x: number, z: number) => {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 1.1), std('#475569'));
      g.add(base);
      const pivot = new THREE.Group();
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.95), std('#f59e0b', { metalness: 0.6, roughness: 0.3 }));
      blade.position.z = 0.42;
      pivot.add(blade);
      pivot.position.set(0, 0.1, -0.42);
      g.add(pivot);
      g.position.set(x, Y, z);
      root.add(g);
      return pivot;
    };
    const sw1 = mkSwitch(1.2, -0.75);
    const sw2 = mkSwitch(2.6, -0.75);
    staticLabel('S1', { fontSize: 38, scale: 0.85 }, [0.45, Y + 0.35, -0.75]);
    staticLabel('S2', { fontSize: 38, scale: 0.85 }, [3.35, Y + 0.35, -0.75]);

    // ---- 电子流 ---------------------------------------------------------------
    const loop1 = mkPath([V(-3.6, 0.9), V(-3.6, 1.6), V(1.2, 1.6), V(1.2, -1.6), V(-3.6, -1.6), V(-3.6, -0.9), V(-3.6, 0.9)]);
    const loop2 = mkPath([V(-3.6, 0.9), V(-3.6, 1.6), V(2.6, 1.6), V(2.6, -1.6), V(-3.6, -1.6), V(-3.6, -0.9), V(-3.6, 0.9)]);
    const eGeo = new THREE.SphereGeometry(0.09, 10, 8);
    const eMat = std('#38bdf8', { emissive: '#0284c7', emissiveIntensity: 0.8 });
    const es1: THREE.Mesh[] = [];
    const es2: THREE.Mesh[] = [];
    for (let i = 0; i < N_E; i++) {
      const a = new THREE.Mesh(eGeo, eMat);
      const b = new THREE.Mesh(eGeo, eMat);
      root.add(a, b);
      es1.push(a);
      es2.push(b);
    }

    // ---- 信息与步骤标注 ---------------------------------------------------------
    const setInfo = dynLabel('', { fontSize: 34, scale: 0.85, color: '#0f766e' }, new THREE.Vector3(-0.5, 3.55, 0));
    const junctionLabel = staticLabel('干路电流 I = I1 + I2', { fontSize: 36, scale: 0.9, color: '#1d4ed8' }, [-1.2, Y + 0.75, 1.7]);
    const formulaLabel = staticLabel('P = U×I = U²/R，亮度看实际功率', { fontSize: 36, scale: 0.9, color: '#b45309' }, [-0.5, 4.3, 0]);
    const hintLabel = staticLabel('断开 S1：L1 灭，L2 亮度不变！', { fontSize: 36, scale: 0.9, color: '#b91c1c' }, [-0.5, 4.3, 0]);

    const refresh = () => {
      const i1 = s1 ? voltage / r1 : 0;
      const i2 = s2 ? voltage / r2 : 0;
      setInfo(`U = ${voltage}V，I1 = ${i1.toFixed(1)}A，I2 = ${i2.toFixed(1)}A，I总 = ${(i1 + i2).toFixed(1)}A`);
      setP1(`L1：P = ${(voltage * i1).toFixed(1)}W`);
      setP2(`L2：P = ${(voltage * i2).toFixed(1)}W`);
    };
    refresh();

    const applyStep = () => {
      junctionLabel.visible = step === 2;
      formulaLabel.visible = step === 3;
      hintLabel.visible = step === 1;
    };
    applyStep();

    const tmp = new THREE.Vector3();

    return {
      setStep(i) {
        step = i;
        applyStep();
      },
      setParam(id, value) {
        if (id === 's1') s1 = !s1;
        if (id === 's2') s2 = !s2;
        if (id === 'u') voltage = Number(value);
        if (id === 'r1') r1 = Number(value);
        if (id === 'r2') r2 = Number(value);
        refresh();
      },
      getReadouts() {
        const i1 = s1 ? voltage / r1 : 0;
        const i2 = s2 ? voltage / r2 : 0;
        return [
          { label: 'I₁ 支路1', value: `${i1.toFixed(2)} A` },
          { label: 'I₂ 支路2', value: `${i2.toFixed(2)} A` },
          { label: 'I 干路', value: `${(i1 + i2).toFixed(2)} A` },
        ];
      },
      update(dt) {
        // 开关刀片动画
        sw1.rotation.x = damp(sw1.rotation.x, s1 ? 0 : -0.55, 8, dt);
        sw2.rotation.x = damp(sw2.rotation.x, s2 ? 0 : -0.55, 8, dt);
        // 电子流速 ∝ 各支路电流；支路断开则该回路电子停住
        const i1 = s1 ? voltage / r1 : 0;
        const i2 = s2 ? voltage / r2 : 0;
        flow1 += (dt * i1 * 0.5) / loop1.total;
        flow2 += (dt * i2 * 0.5) / loop2.total;
        for (let k = 0; k < N_E; k++) {
          loop1.at(k / N_E + flow1, tmp);
          es1[k].position.copy(tmp);
          loop2.at(k / N_E + flow2, tmp);
          es2[k].position.copy(tmp);
        }
        // 亮度 ∝ 实际功率 P = U²/R（以默认电阻 6Ω、最大电压 12V 的功率为亮度基准）
        const pMax = (12 * 12) / R_BULB;
        const g1 = s1 ? ((voltage * voltage) / r1 / pMax) * 1.8 : 0;
        const g2 = s2 ? ((voltage * voltage) / r2 / pMax) * 1.8 : 0;
        bulb1.mat.emissiveIntensity = damp(bulb1.mat.emissiveIntensity, g1, 6, dt);
        bulb2.mat.emissiveIntensity = damp(bulb2.mat.emissiveIntensity, g2, 6, dt);
        bulb1.bulb.scale.setScalar(1 + bulb1.mat.emissiveIntensity * 0.1);
        bulb2.bulb.scale.setScalar(1 + bulb2.mat.emissiveIntensity * 0.1);
      },
      dispose() {
        ctx.scene.remove(root);
        disposeObject(root);
      },
    };
  },
};
