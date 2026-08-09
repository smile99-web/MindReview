// ---------------------------------------------------------------------------
// 物理 · 家庭电路与安全用电：进户线 → 电能表 → 总开关 → 保险丝 → 用电器
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, cylinderBetween, damp, disposeObject, makeLabel, std } from '../three-utils';

const Z = -1.05; // 墙面走线深度
const FUSE_LIMIT = 5; // 保险丝限额 A

const P = (x: number, y: number) => new THREE.Vector3(x, y, Z);

export const homeCircuitScene: Scene3DDefinition = {
  id: 'phys-home-circuit',
  title: '家庭电路与安全用电',
  subject: '物理',
  grade: '9全',
  icon: '🏠',
  tagline: '火线零线地线怎么接？保险丝为什么会熔断？',
  keywords: ['家庭电路', '火线', '零线', '地线', '保险丝', '空气开关', '安全用电', '插座', '短路'],
  camera: { position: [5.2, 3.6, 8.8], target: [0, 2.2, -0.6] },
  controls: [
    { kind: 'button', id: 'overload', label: '🔌 插入大功率电器（过载）' },
    { kind: 'button', id: 'lamp', label: '💡 开灯 / 关灯' },
  ],
  steps: [
    {
      title: '家庭电路的组成',
      text: '家庭电路按这个顺序连接：进户线先进电能表，再经过总开关，然后是保险装置，最后才分到各个用电器。电能表记录用了多少电，总开关控制全屋通断，保险丝在电流过大时自动熔断，保护电路。',
    },
    {
      title: '火线零线地线',
      text: '进户线里，红色是火线，带着二百二十伏电压；蓝色是零线；黄绿双色是地线。用测电笔能辨别火线：氖管发光的就是火线。三孔插座的接法口诀：左零、右火、上接地，地线把金属外壳的电导走，防止触电。',
    },
    {
      title: '开关接在火线上',
      text: '看吊灯：开关串在火线上。这样断开开关时，灯泡完全脱离火线，人站在凳子上换灯泡也安全。如果开关错接在零线上，灯虽然灭了，灯头仍然带电，非常危险。',
    },
    {
      title: '电流过大的原因',
      text: '电路中电流过大有两个原因：一是用电器总功率过大，二是短路。点按钮插入大功率电器试试：电流飙升，保险丝发红、熔断，切断全屋电路。安全用电原则：不接触低压带电体，不靠近高压带电体。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 14);
    const root = new THREE.Group();
    ctx.scene.add(root);
    let step = 0;
    let lampOn = false;
    let state: 'ok' | 'overload' | 'blown' = 'ok';
    let fuseHeat = 0;
    let meterSpin = 0;

    interface LabelOpts {
      fontSize?: number;
      color?: string;
      bg?: string;
      scale?: number;
    }
    const mkLabel = (text: string, opts: LabelOpts, pos: [number, number, number]) => {
      const s = makeLabel(text, opts);
      s.position.set(pos[0], pos[1], pos[2]);
      root.add(s);
      return s;
    };
    const dynLabel = (text: string, opts: LabelOpts, pos: [number, number, number]) => {
      const sprite = mkLabel(text, opts, pos);
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

    // ---- 墙面 + 吊顶 -------------------------------------------------------------
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(9.4, 4.9), std('#faf3e3', { roughness: 0.95 }));
    wall.position.set(0, 2.45, -1.2);
    root.add(wall);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 1.0), std('#e7e0d0'));
    beam.position.set(3.3, 4.24, -0.8);
    root.add(beam);

    // ---- 三色导线 ------------------------------------------------------------------
    const liveMat = std('#dc2626', { emissive: '#b91c1c', emissiveIntensity: 0.15 });
    const neutMat = std('#2563eb', { emissive: '#1d4ed8', emissiveIntensity: 0.15 });
    const gndMat = std('#84cc16', { emissive: '#4d7c0f', emissiveIntensity: 0.15 });
    const wire = (a: THREE.Vector3, b: THREE.Vector3, m: THREE.Material, r = 0.03) =>
      root.add(cylinderBetween(a, b, r, m));
    // 火线（红）
    wire(P(-4.6, 3.55), P(-3.05, 3.55), liveMat);
    wire(P(-2.05, 3.55), P(-1.5, 3.55), liveMat);
    wire(P(-0.8, 3.55), P(0.05, 3.55), liveMat);
    wire(P(0.65, 3.55), P(2.0, 3.55), liveMat);
    wire(P(2.7, 3.55), P(2.85, 3.55), liveMat);
    wire(P(2.85, 3.55), P(2.85, 4.05), liveMat);
    wire(P(2.85, 4.05), P(3.3, 4.05), liveMat);
    wire(P(1.7, 3.55), P(1.7, 1.95), liveMat); // 插座火线
    // 零线（蓝）
    wire(P(-4.6, 3.35), P(-3.05, 3.35), neutMat);
    wire(P(-2.05, 3.35), P(1.2, 3.35), neutMat);
    wire(P(1.2, 3.35), P(1.2, 1.95), neutMat); // 插座零线
    wire(P(1.2, 3.35), P(3.55, 3.35), neutMat);
    wire(P(3.55, 3.35), P(3.55, 4.05), neutMat);
    wire(P(3.55, 4.05), P(3.5, 4.05), neutMat);
    // 地线（黄绿）
    wire(P(-4.6, 3.15), P(1.45, 3.15), gndMat);
    wire(P(1.45, 3.15), P(1.45, 1.95), gndMat); // 插座地线
    // 分叉点
    for (const [x, y, m] of [[1.7, 3.55, liveMat], [1.2, 3.35, neutMat], [1.45, 3.15, gndMat]] as const) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), m);
      dot.position.copy(P(x, y));
      root.add(dot);
    }

    // ---- 电能表 ---------------------------------------------------------------------
    const meterBox = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.05, 0.28), std('#e2e8f0', { roughness: 0.6 }));
    meterBox.position.set(-2.55, 3.35, -0.95);
    root.add(meterBox);
    const meterWin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.04), std('#f8fafc', { roughness: 0.3 }));
    meterWin.position.set(-2.55, 3.42, -0.79);
    root.add(meterWin);
    const meterDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 20), std('#94a3b8', { metalness: 0.6 }));
    meterDisc.rotation.x = Math.PI / 2;
    meterDisc.position.set(-2.55, 3.08, -0.79);
    root.add(meterDisc);
    const discMark = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.04), std('#dc2626'));
    discMark.position.set(0, 0.08, 0);
    meterDisc.add(discMark);
    mkLabel('电能表', { fontSize: 32, scale: 0.75 }, [-2.55, 2.62, -0.9]);

    // ---- 总开关 ---------------------------------------------------------------------
    const mainBox = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.25), std('#cbd5e1', { roughness: 0.6 }));
    mainBox.position.set(-1.15, 3.35, -0.95);
    root.add(mainBox);
    const mainLever = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.08), std('#334155'));
    mainLever.position.set(-1.15, 3.35, -0.78);
    root.add(mainLever);
    mkLabel('总开关', { fontSize: 32, scale: 0.75 }, [-1.15, 2.62, -0.9]);

    // ---- 保险丝 ----------------------------------------------------------------------
    const fuseBase = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.32, 0.1), std('#e2e8f0'));
    fuseBase.position.set(0.35, 3.55, -0.98);
    root.add(fuseBase);
    for (const px of [0.08, 0.62]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 8), std('#57534e', { metalness: 0.7 }));
      post.rotation.x = Math.PI / 2;
      post.position.set(px, 3.55, -0.9);
      root.add(post);
    }
    const fuseMat = std('#e5e7eb', { metalness: 0.8, roughness: 0.25, emissive: '#dc2626', emissiveIntensity: 0 });
    const fuseWire = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.54, 8), fuseMat);
    fuseWire.rotation.z = Math.PI / 2;
    fuseWire.position.set(0.35, 3.55, -0.85);
    root.add(fuseWire);
    // 熔断后的两截断头
    const stubA = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.2, 8), fuseMat);
    stubA.position.set(0.14, 3.59, -0.85);
    stubA.rotation.z = Math.PI / 2 - 0.7;
    const stubB = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.2, 8), fuseMat);
    stubB.position.set(0.56, 3.59, -0.85);
    stubB.rotation.z = Math.PI / 2 + 0.7;
    stubA.visible = false;
    stubB.visible = false;
    root.add(stubA, stubB);
    mkLabel('保险丝', { fontSize: 32, scale: 0.75, color: '#b45309' }, [0.35, 2.98, -0.85]);

    // ---- 吊灯（开关串在火线上） ---------------------------------------------------------
    // 灯开关（火线上的两个 stub + 可转刀片）
    wire(P(2.0, 3.55), P(2.22, 3.55), liveMat);
    wire(P(2.48, 3.55), P(2.7, 3.55), liveMat);
    const lampSwBase = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.3, 0.1), std('#e2e8f0'));
    lampSwBase.position.set(2.35, 3.55, -1.0);
    root.add(lampSwBase);
    const lampBlade = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.05), std('#f59e0b', { metalness: 0.6 }));
    lampBlade.position.x = 0.15;
    const lampSwPivot = new THREE.Group();
    lampSwPivot.add(lampBlade);
    lampSwPivot.position.set(2.22, 3.55, -0.86);
    root.add(lampSwPivot);
    const swRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.03, 8, 28),
      std('#f97316', { emissive: '#ea580c', emissiveIntensity: 0.8 }),
    );
    swRing.position.set(2.35, 3.55, -0.84);
    root.add(swRing);
    mkLabel('开关接在火线上', { fontSize: 30, scale: 0.72, color: '#c2410c' }, [2.35, 3.08, -0.85]);
    // 灯座 + 灯线 + 灯罩 + 灯泡
    const holder = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.18), std('#d6d3d1'));
    holder.position.set(3.4, 4.08, -1.0);
    root.add(holder);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8), std('#78716c'));
    cord.position.set(3.4, 3.85, -1.0);
    root.add(cord);
    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.38, 0.26, 18, 1, true),
      std('#fbbf24', { transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    shade.position.set(3.4, 3.68, -1.0);
    root.add(shade);
    const bulbMat = std('#fef3c7', { emissive: '#facc15', emissiveIntensity: 0 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), bulbMat);
    bulb.position.set(3.4, 3.5, -1.0);
    root.add(bulb);
    mkLabel('吊灯', { fontSize: 32, scale: 0.75 }, [3.4, 3.02, -0.85]);

    // ---- 三孔插座 -----------------------------------------------------------------------
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.82, 0.1), std('#f8fafc', { roughness: 0.5 }));
    plate.position.set(1.45, 1.55, -1.0);
    root.add(plate);
    const holeMat = std('#1e293b');
    const holeL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.15, 0.05), holeMat); // 左零
    holeL.position.set(1.32, 1.5, -0.94);
    const holeR = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.15, 0.05), holeMat); // 右火
    holeR.position.set(1.58, 1.5, -0.94);
    const holeT = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.07, 0.05), holeMat); // 上接地
    holeT.position.set(1.45, 1.72, -0.94);
    root.add(holeL, holeR, holeT);
    mkLabel('三孔插座', { fontSize: 30, scale: 0.72 }, [1.45, 2.25, -0.9]);
    mkLabel('左零 右火 上接地', { fontSize: 32, scale: 0.78, color: '#1d4ed8' }, [2.6, 1.5, -0.8]);

    // ---- 大功率用电器（过载插入） ------------------------------------------------------------
    const heater = new THREE.Group();
    const heaterBody = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.6, 0.5), std('#ea580c', { emissive: '#c2410c', emissiveIntensity: 0.2 }));
    heaterBody.position.set(1.45, 0.85, -0.42);
    heater.add(heaterBody);
    const grill = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.36, 0.03), std('#7c2d12', { emissive: '#f97316', emissiveIntensity: 0 }));
    grill.position.set(1.45, 0.85, -0.16);
    heater.add(grill);
    heater.add(cylinderBetween(new THREE.Vector3(1.45, 1.18, -0.42), new THREE.Vector3(1.5, 1.28, -0.95), 0.025, neutMat));
    mkLabel('大功率用电器', { fontSize: 30, scale: 0.72, color: '#c2410c' }, [1.45, 0.35, -0.3]);
    heater.visible = false;
    root.add(heater);

    // ---- 线路标签 ---------------------------------------------------------------------------
    mkLabel('火线', { fontSize: 30, scale: 0.68, color: '#b91c1c' }, [-4.35, 3.72, -0.9]);
    mkLabel('零线', { fontSize: 30, scale: 0.68, color: '#1d4ed8' }, [-4.35, 3.35, -0.9]);
    mkLabel('地线', { fontSize: 30, scale: 0.68, color: '#4d7c0f' }, [-4.35, 3.0, -0.9]);
    mkLabel('进户线', { fontSize: 30, scale: 0.68 }, [-4.35, 2.62, -0.9]);

    // ---- 状态与步骤标签 ------------------------------------------------------------------------
    const setCurrent = dynLabel('干路电流 I ≈ 0 A', { fontSize: 34, scale: 0.85, color: '#0f766e' }, [0.55, 2.55, -0.85]);
    const stateSpritePos: [number, number, number] = [0.2, 4.62, -0.6];
    const stateSprite = mkLabel('供电正常', { fontSize: 40, scale: 1.0, color: '#15803d' }, stateSpritePos);
    let stateLast = '供电正常';
    const setState = (t: string, color: string) => {
      if (t === stateLast) return;
      stateLast = t;
      stateSprite.material.map?.dispose();
      stateSprite.material.dispose();
      const nl = makeLabel(t, { fontSize: 40, scale: 1.0, color });
      stateSprite.material = nl.material;
      stateSprite.scale.copy(nl.scale);
    };
    const orderHint = mkLabel('进户线 → 电能表 → 总开关 → 保险丝 → 用电器', { fontSize: 34, scale: 0.88, color: '#1d4ed8' }, [0.2, 4.1, -0.85]);
    const penHint = mkLabel('测电笔：氖管发光的是火线', { fontSize: 34, scale: 0.88, color: '#1d4ed8' }, [0.2, 4.1, -0.85]);
    const dangerHint = mkLabel('过载或短路 → 电流过大 → 保险丝熔断保护', { fontSize: 34, scale: 0.88, color: '#b91c1c' }, [0.2, 4.1, -0.85]);

    const current = () => (state === 'blown' ? 0 : (lampOn ? 0.2 : 0) + (state !== 'ok' ? 6.8 : 0));

    const applyStep = () => {
      orderHint.visible = step === 0;
      penHint.visible = step === 1;
      dangerHint.visible = step === 3;
    };
    applyStep();

    return {
      setStep(i) {
        step = i;
        applyStep();
      },
      setParam(id) {
        if (id === 'lamp' && state !== 'blown') lampOn = !lampOn;
        if (id === 'overload') {
          if (state === 'ok') {
            state = 'overload';
            heater.visible = true;
          } else {
            // 拔掉电器；若已熔断则同时更换新保险丝
            state = 'ok';
            heater.visible = false;
            fuseHeat = 0;
            fuseWire.visible = true;
            stubA.visible = false;
            stubB.visible = false;
            fuseMat.emissiveIntensity = 0;
          }
        }
      },
      update(dt, elapsed) {
        const I = current();
        // 保险丝发热与熔断
        if (state === 'overload') {
          fuseHeat += dt / 1.6;
          if (fuseHeat >= 1) {
            state = 'blown';
            fuseWire.visible = false;
            stubA.visible = true;
            stubB.visible = true;
          }
        } else if (state === 'ok') {
          fuseHeat = Math.max(0, fuseHeat - dt / 2);
        }
        fuseMat.emissiveIntensity = state === 'blown' ? 0 : fuseHeat * 2;
        // 状态文案
        if (state === 'blown') setState('✖ 保险丝熔断，全屋断电——需更换新保险丝', '#b91c1c');
        else if (state === 'overload') setState('⚠ 电流过大！保险丝发热发红……', '#b45309');
        else setState('供电正常', '#15803d');
        setCurrent(`干路电流 I ≈ ${I.toFixed(1)} A（保险丝限额 ${FUSE_LIMIT}A）`);
        // 灯与电器
        const powered = state !== 'blown';
        const glowTarget = powered && lampOn ? 1.6 : 0;
        bulbMat.emissiveIntensity = damp(bulbMat.emissiveIntensity, glowTarget, 8, dt);
        const grillTarget = powered && state === 'overload' ? 1.2 : 0;
        (grill.material as THREE.MeshStandardMaterial).emissiveIntensity = damp(
          (grill.material as THREE.MeshStandardMaterial).emissiveIntensity,
          grillTarget,
          6,
          dt,
        );
        // 灯开关刀片
        lampSwPivot.rotation.z = damp(lampSwPivot.rotation.z, lampOn && powered ? 0 : 0.7, 8, dt);
        // 电能表转盘 ∝ 电流
        meterSpin += dt * I * 1.5;
        meterDisc.rotation.z = meterSpin;
        // 火线开关高亮环（step2 强调）
        swRing.visible = step === 2 || lampOn;
        if (swRing.visible) {
          const s = 1 + 0.06 * Math.sin(elapsed * 4);
          swRing.scale.set(s, s, s);
        }
      },
      dispose() {
        ctx.scene.remove(root);
        disposeObject(root);
      },
    };
  },
};
