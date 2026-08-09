// ---------------------------------------------------------------------------
// 物理 · 电阻的影响因素：材料、长度、横截面积如何决定电阻（附滑动变阻器）
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, cylinderBetween, damp, disposeObject, makeLabel, std } from '../three-utils';

const Y = 1.2;
const U_SRC = 3; // 电源电压 V
const UP = new THREE.Vector3(0, 1, 0);

const MATS: Record<string, { name: string; rho: number; color: string; note: string }> = {
  copper: { name: '铜', rho: 0.017, color: '#b0653a', note: 'ρ 小' },
  iron: { name: '铁', rho: 0.1, color: '#9aa5b1', note: 'ρ 中' },
  nichrome: { name: '镍铬合金', rho: 1.0, color: '#7d7468', note: 'ρ 大' },
};

export const resistanceScene: Scene3DDefinition = {
  id: 'phys-resistance',
  title: '电阻的影响因素',
  subject: '物理',
  grade: '9全',
  icon: '🧵',
  tagline: '导体越长、越细，电阻越大——电阻是导体本身的性质',
  keywords: ['电阻', '导体', '横截面积', '长度', '材料', '欧姆', '滑动变阻器', '镍铬'],
  camera: { position: [4.6, 4.2, 9.2], target: [0.8, 1.4, 0] },
  controls: [
    { kind: 'slider', id: 'len', label: '长度 L', min: 1, max: 4, step: 0.5, defaultValue: 2 },
    { kind: 'slider', id: 'dia', label: '横截面积 S', min: 0.5, max: 2, step: 0.25, defaultValue: 1 },
    {
      kind: 'select',
      id: 'mat',
      label: '材料',
      options: [
        { value: 'copper', label: '铜（ρ 小）' },
        { value: 'iron', label: '铁（ρ 中）' },
        { value: 'nichrome', label: '镍铬合金（ρ 大）' },
      ],
      defaultValue: 'nichrome',
    },
  ],
  steps: [
    {
      title: '电阻是什么',
      text: '导体对电流的阻碍作用叫电阻，用 R 表示，单位是欧姆。看电路：同一节电池，接上不同的导体，电流表的示数差别很大——有的导体电流好走，有的难走。',
    },
    {
      title: '越长电阻越大',
      text: '拖动长度滑块：导线越长，电流表示数越小，说明电阻越大。可以想象成走走廊：走廊越长，穿过去越费劲。材料和粗细相同时，导体的电阻跟长度成正比。',
    },
    {
      title: '粗细与材料',
      text: '再调横截面积：导线越细，电阻越大，就像走廊越窄越难走。换材料试试：同样规格，镍铬合金的电阻是铜的几十倍。电阻大小由材料、长度、横截面积决定：R 等于 ρ 乘以 L 除以 S，它是导体本身的性质。',
    },
    {
      title: '滑动变阻器',
      text: '右边是滑动变阻器：滑片在金属杆上移动，接入电路的电阻丝长度就改变，电阻跟着改变——亮起来的那一段就是接入部分。它能连续调节电流，调光台灯、音量旋钮里都有它。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 14);
    const root = new THREE.Group();
    ctx.scene.add(root);
    let step = 0;
    let len = 2;
    let dia = 1;
    let matKey: string = 'nichrome';
    let needleTarget = 0.5;

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
      return {
        set(t: string) {
          if (t === last) return;
          last = t;
          sprite.material.map?.dispose();
          sprite.material.dispose();
          const nl = makeLabel(t, opts);
          sprite.material = nl.material;
          sprite.scale.copy(nl.scale);
        },
        sprite,
      };
    };
    const staticLabel = (text: string, opts: LabelOpts, pos: [number, number, number]) => {
      const s = makeLabel(text, opts);
      s.position.set(pos[0], pos[1], pos[2]);
      root.add(s);
      return s;
    };

    // 可变距圆柱（单位几何体，每次 span 重定位）
    const spanGeo = new THREE.CylinderGeometry(1, 1, 1, 14);
    const span = (mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, r: number) => {
      const dir = new THREE.Vector3().subVectors(b, a);
      const l = Math.max(dir.length(), 0.001);
      mesh.scale.set(r, l, r);
      mesh.position.copy(a).addScaledVector(dir, 0.5);
      mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
    };

    // ---- 电源 -----------------------------------------------------------------
    const battery = new THREE.Group();
    const batBody = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.5, 24), std('#dc2626'));
    batBody.rotation.x = Math.PI / 2;
    battery.add(batBody);
    const batTip = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.22, 12), std('#94a3b8', { metalness: 0.7 }));
    batTip.rotation.x = Math.PI / 2;
    batTip.position.z = 0.86;
    battery.add(batTip);
    battery.position.set(-3.4, Y, 0);
    root.add(battery);
    staticLabel('电源 3V', { fontSize: 38, scale: 0.9 }, [-3.4, Y - 0.85, 0]);

    // ---- 固定导线 ---------------------------------------------------------------
    const wireMat = std('#d97706', { metalness: 0.55, roughness: 0.35 });
    const w = (ax: number, az: number, bx: number, bz: number) =>
      root.add(cylinderBetween(new THREE.Vector3(ax, Y, az), new THREE.Vector3(bx, Y, bz), 0.045, wireMat));
    w(-3.4, 0.86, -3.4, 1.3);
    w(-3.4, 1.3, -1.6, 1.3); // 接到电阻丝左端
    w(2.8, 1.3, 2.8, -1.3);
    w(2.8, -1.3, 0.3, -1.3);
    w(-0.3, -1.3, -3.4, -1.3);
    w(-3.4, -1.3, -3.4, -0.86);

    // ---- 被测电阻丝（动态长度/粗细/材料） ----------------------------------------
    const wireMesh = new THREE.Mesh(spanGeo, std('#7d7468', { metalness: 0.5, roughness: 0.4 }));
    root.add(wireMesh);
    const segB = new THREE.Mesh(spanGeo, wireMat); // 电阻丝右端到右上角的连线
    root.add(segB);

    // ---- 电流表 ------------------------------------------------------------------
    const meter = new THREE.Group();
    meter.position.set(0, Y, -1.3);
    root.add(meter);
    for (const px of [-0.25, 0.25]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.35, 8), std('#57534e', { metalness: 0.6 }));
      post.position.set(px, 0.17, 0);
      meter.add(post);
    }
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.14, 28), std('#f8fafc', { roughness: 0.85 }));
    dial.rotation.x = Math.PI / 2;
    dial.position.y = 0.75;
    meter.add(dial);
    const dialRim = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.04, 8, 28), std('#475569'));
    dialRim.position.set(0, 0.75, 0.08);
    meter.add(dialRim);
    for (let k = 0; k < 5; k++) {
      const a = -0.8 + k * 0.4;
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.1, 0.02), std('#334155'));
      tick.position.set(Math.sin(a) * 0.45, 0.75 + Math.cos(a) * 0.45, 0.085);
      tick.rotation.z = -a;
      meter.add(tick);
    }
    const needleG = new THREE.Group();
    const needle = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.46, 0.02), std('#dc2626', { emissive: '#b91c1c', emissiveIntensity: 0.4 }));
    needle.position.y = 0.21;
    needleG.add(needle);
    needleG.position.set(0, 0.75, 0.09);
    meter.add(needleG);
    staticLabel('电流表 A', { fontSize: 34, scale: 0.8 }, [0, Y - 0.55, -1.3]);

    // ---- 公式与数值标签 ------------------------------------------------------------
    staticLabel('R = ρ·L/S', { fontSize: 44, scale: 1.05, color: '#1d4ed8' }, [0.4, 3.9, 0.2]);
    const rLabel = dynLabel('', { fontSize: 38, scale: 0.95, color: '#0f766e' }, new THREE.Vector3(0.4, 3.3, 0.2));
    const iLabel = dynLabel('', { fontSize: 38, scale: 0.95, color: '#b45309' }, new THREE.Vector3(0.4, 2.75, 0.2));
    const matLabel = dynLabel('', { fontSize: 34, scale: 0.85, color: '#44403c' }, new THREE.Vector3(0, Y + 0.55, 1.3));

    // ---- 滑动变阻器演示（step3） ------------------------------------------------------
    const rheo = new THREE.Group();
    root.add(rheo);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 1.9, 16), std('#e7e5e4', { roughness: 0.8 }));
    tube.rotation.z = Math.PI / 2;
    tube.position.set(4.5, 1.3, 0.2);
    rheo.add(tube);
    const TURNS = 12;
    const turnGeo = new THREE.TorusGeometry(0.29, 0.05, 8, 20);
    const turnOn = std('#f59e0b', { emissive: '#d97706', emissiveIntensity: 0.7, metalness: 0.5 });
    const turnOff = std('#8a8f98', { metalness: 0.5 });
    const turns: THREE.Mesh[] = [];
    for (let i = 0; i < TURNS; i++) {
      const t = new THREE.Mesh(turnGeo, turnOff);
      t.rotation.y = Math.PI / 2;
      t.position.set(3.72 + i * 0.143, 1.3, 0.2);
      rheo.add(t);
      turns.push(t);
    }
    const rodBar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.3, 10), std('#cbd5e1', { metalness: 0.7 }));
    rodBar.rotation.z = Math.PI / 2;
    rodBar.position.set(4.5, 2.0, 0.2);
    rheo.add(rodBar);
    for (const px of [3.35, 5.65]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.15, 8), std('#64748b'));
      post.position.set(px, 0.95, 0.2);
      rheo.add(post);
    }
    const sliderBlock = new THREE.Group();
    const sBlock = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.22), std('#334155', { metalness: 0.5 }));
    sliderBlock.add(sBlock);
    const finger = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.06), std('#334155', { metalness: 0.5 }));
    finger.position.y = -0.3;
    sliderBlock.add(finger);
    sliderBlock.position.set(4.5, 2.1, 0.2);
    rheo.add(sliderBlock);
    const rheoTitle = makeLabel('滑动变阻器：接入部分（亮）随滑片改变', { fontSize: 34, scale: 0.85, color: '#b45309' });
    rheoTitle.position.set(4.5, 2.75, 0.2);
    rheo.add(rheoTitle);
    const sliderTag = makeLabel('滑片', { fontSize: 30, scale: 0.7 });
    sliderTag.position.set(4.5, 2.45, 0.55);
    rheo.add(sliderTag);
    rheo.visible = false;

    const refresh = () => {
      const m = MATS[matKey] ?? MATS.nichrome;
      const R = (m.rho * len) / dia; // 相对值
      const I = U_SRC / R;
      needleTarget = I / (I + 2.5);
      // 电阻丝本体
      const a = new THREE.Vector3(-1.6, Y, 1.3);
      const b = new THREE.Vector3(-1.6 + len, Y, 1.3);
      span(wireMesh, a, b, 0.08 * dia);
      (wireMesh.material as THREE.MeshStandardMaterial).color.set(m.color);
      span(segB, b, new THREE.Vector3(2.8, Y, 1.3), 0.045);
      matLabel.set(`${m.name}丝（${m.note}）`);
      matLabel.sprite.position.set(-1.6 + len / 2, Y + 0.55, 1.3);
      rLabel.set(`R = ρL/S = ${R >= 10 ? R.toFixed(1) : R.toFixed(2)}（相对值）`);
      iLabel.set(`I = U/R = ${I >= 99 ? I.toFixed(0) : I.toFixed(1)} A`);
    };
    refresh();

    const applyStep = () => {
      rheo.visible = step === 3;
    };
    applyStep();

    return {
      setStep(i) {
        step = i;
        applyStep();
      },
      setParam(id, value) {
        if (id === 'len') len = Number(value);
        if (id === 'dia') dia = Number(value);
        if (id === 'mat') matKey = String(value);
        refresh();
      },
      update(dt, elapsed) {
        // 电流表指针
        const targetAngle = 0.9 - needleTarget * 1.8;
        needleG.rotation.z = damp(needleG.rotation.z, targetAngle, 6, dt);
        // 滑动变阻器：滑片往返，左侧为接入部分（高亮）
        if (rheo.visible) {
          const sx = 4.5 + Math.sin(elapsed * 0.7) * 0.78;
          sliderBlock.position.x = damp(sliderBlock.position.x, sx, 8, dt);
          sliderTag.position.x = sliderBlock.position.x;
          for (const t of turns) t.material = t.position.x <= sliderBlock.position.x ? turnOn : turnOff;
        }
      },
      dispose() {
        ctx.scene.remove(root);
        disposeObject(root);
      },
    };
  },
};
