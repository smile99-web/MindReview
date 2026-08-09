// ---------------------------------------------------------------------------
// 物理 · 电动机与发电机：通电线圈在磁场中受力转动；反向摇动又能发电
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, cylinderBetween, damp, disposeObject, makeArrow, makeLabel, std } from '../three-utils';

type Mode = 'motor' | 'generator';

const CY = 1.9; // 线圈中心高度
const A = 0.8; // 线圈半宽（x）
const C = 0.55; // 线圈半深（z）

export const motorScene: Scene3DDefinition = {
  id: 'phys-motor',
  title: '电动机与发电机',
  subject: '物理',
  grade: '9全',
  icon: '⚙️',
  tagline: '通电线圈在磁场中受力转动；摇一摇又能发电',
  keywords: ['电动机', '发电机', '电磁感应', '线圈', '换向器', '磁场对电流的作用', '电生磁'],
  camera: { position: [4.6, 3.6, 7.6], target: [0, 1.9, 0.3] },
  controls: [
    {
      kind: 'select',
      id: 'mode',
      label: '模式',
      options: [
        { value: 'motor', label: '电动机' },
        { value: 'generator', label: '发电机' },
      ],
      defaultValue: 'motor',
    },
    { kind: 'button', id: 'act', label: '⚡ 通电（电动机）/ 🔄 摇动（发电机）' },
  ],
  steps: [
    {
      title: '磁场对电流的力',
      text: '通电导线放在磁场里，会受到力的作用。力的方向跟电流方向、磁场方向都有关：电流方向或磁场方向反过来，受力方向也跟着反。看线圈的 ab、cd 两边：电流方向相反，受力也相反，线圈就转了起来。',
    },
    {
      title: '换向器',
      text: '线圈转到平衡位置时受力为零，靠惯性冲过去；这一瞬间，两个半铜环刚好交换接触的电刷，电流方向自动翻转，受力方向也跟着翻转。换向器让线圈能持续朝一个方向转动。',
    },
    {
      title: '电动机',
      text: '电动机就是这样工作的：通电线圈在磁场中受力而转动，把电能转化为机械能。点通电按钮看看。电风扇、洗衣机、电动车里面，都有电动机。',
    },
    {
      title: '发电机',
      text: '反过来，摇动手柄让线圈转动，线圈切割磁感线，闭合电路里就产生了电流，灯泡发光——这叫电磁感应。发电机把机械能转化为电能。注意灯泡一亮一暗：每转过半圈，电流方向就改变一次。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 14);
    const root = new THREE.Group();
    ctx.scene.add(root);
    let step = 0;
    let mode: Mode = 'motor';
    let acting = false; // 通电 / 摇动
    let omega = 0;
    let phi = 0.4;
    let flipT = 0;
    let lastSign = 1;

    interface LabelOpts {
      fontSize?: number;
      color?: string;
      bg?: string;
      scale?: number;
    }
    const mkLabel = (parent: THREE.Object3D, text: string, opts: LabelOpts, pos: [number, number, number]) => {
      const s = makeLabel(text, opts);
      s.position.set(pos[0], pos[1], pos[2]);
      parent.add(s);
      return s;
    };
    const dynLabel = (text: string, opts: LabelOpts, pos: [number, number, number]) => {
      const sprite = mkLabel(root, text, opts, pos);
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

    // ---- 蹄形磁铁（上 N 下 S + 背部磁轭） -------------------------------------
    const nPole = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 1.4), std('#dc2626'));
    nPole.position.set(0, 3.05, 0);
    const sPole = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 1.4), std('#2563eb'));
    sPole.position.set(0, 0.75, 0);
    const yoke = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.8, 0.22), std('#94a3b8', { metalness: 0.4 }));
    yoke.position.set(0, 1.9, -0.85);
    root.add(nPole, sPole, yoke);
    mkLabel(root, 'N', { fontSize: 44, scale: 1.0, color: '#b91c1c' }, [-1.25, 3.05, 0]);
    mkLabel(root, 'S', { fontSize: 44, scale: 1.0, color: '#1d4ed8' }, [-1.25, 0.75, 0]);
    // 磁感线方向（N → S，竖直向下）
    for (const x of [-0.45, 0.45]) {
      const arr = makeArrow('#8b9dc3', { radius: 0.03, headRadius: 0.09, headLength: 0.22 });
      arr.set(new THREE.Vector3(x, 2.7, -0.68), new THREE.Vector3(x, 1.15, -0.68));
      root.add(arr.group);
    }

    // ---- 线圈（绕 z 轴转动，局部在 xz 平面内） ---------------------------------
    const coil = new THREE.Group();
    coil.position.set(0, CY, 0);
    root.add(coil);
    const coilMat = std('#b0653a', { metalness: 0.6, roughness: 0.35 });
    const mkEdge = (alongZ: boolean, x: number, z: number, len: number) => {
      const e = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, len, 10), coilMat);
      if (alongZ) e.rotation.x = Math.PI / 2;
      else e.rotation.z = Math.PI / 2;
      e.position.set(x, 0, z);
      coil.add(e);
    };
    mkEdge(true, -A, 0, C * 2); // ab 边
    mkEdge(true, A, 0, C * 2); // cd 边
    mkEdge(false, 0, -C, A * 2);
    mkEdge(false, 0, C, A * 2);
    mkLabel(coil, 'ab', { fontSize: 32, scale: 0.7, color: '#b91c1c' }, [-A, 0.22, 0]);
    mkLabel(coil, 'cd', { fontSize: 32, scale: 0.7, color: '#1d4ed8' }, [A, 0.22, 0]);
    // 电流方向箭头（ab 红、cd 蓝，随电流方向翻转）
    const curAB = makeArrow('#ef4444', { radius: 0.035, headRadius: 0.1, headLength: 0.24 });
    const curCD = makeArrow('#3b82f6', { radius: 0.035, headRadius: 0.1, headLength: 0.24 });
    coil.add(curAB.group, curCD.group);
    // 线圈引线（通向换向器）
    for (const lx of [-0.16, 0.16]) {
      const lead = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.62, 8), coilMat);
      lead.rotation.x = Math.PI / 2;
      lead.position.set(lx, 0, C + 0.28);
      coil.add(lead);
    }

    // ---- 轴、换向器、电刷 --------------------------------------------------------
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 2.7, 10), std('#57534e', { metalness: 0.7 }));
    axle.rotation.x = Math.PI / 2;
    axle.position.set(0, CY, 0.55);
    root.add(axle);
    const commMat = std('#d97706', { metalness: 0.6, roughness: 0.3, emissive: '#f59e0b', emissiveIntensity: 0 });
    const comm = new THREE.Group();
    comm.position.set(0, CY, 1.3);
    const halfA = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.22, 16, 1, true, 0, Math.PI), commMat);
    halfA.rotation.x = Math.PI / 2;
    const halfB = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.22, 16, 1, true, Math.PI, Math.PI), commMat);
    halfB.rotation.x = Math.PI / 2;
    comm.add(halfA, halfB);
    root.add(comm);
    for (const bx of [-0.27, 0.27]) {
      const brush = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.24), std('#334155', { metalness: 0.5 }));
      brush.position.set(bx, CY, 1.3);
      root.add(brush);
    }
    mkLabel(root, '换向器（两个半铜环）', { fontSize: 32, scale: 0.78, color: '#b45309' }, [1.35, CY + 0.55, 1.35]);
    mkLabel(root, '电刷', { fontSize: 30, scale: 0.7 }, [-0.95, CY + 0.4, 1.35]);

    // ---- 平衡位置参考线 -----------------------------------------------------------
    const balLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1.5, CY, 0), new THREE.Vector3(1.5, CY, 0)]),
      new THREE.LineDashedMaterial({ color: '#94a3b8', dashSize: 0.14, gapSize: 0.1 }),
    );
    balLine.computeLineDistances();
    root.add(balLine);
    mkLabel(root, '平衡位置', { fontSize: 30, scale: 0.7, color: '#64748b' }, [2.0, CY, 0]);

    // ---- 电源（电动机）/ 灯泡（发电机） ---------------------------------------------
    const wireMat = std('#d97706', { metalness: 0.55, roughness: 0.35 });
    const batGroup = new THREE.Group();
    const bat = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.65, 0.75), std('#dc2626'));
    bat.position.set(-2.6, 0.55, 1.6);
    batGroup.add(bat);
    batGroup.add(cylinderBetween(new THREE.Vector3(-0.27, CY, 1.3), new THREE.Vector3(-2.3, 0.92, 1.6), 0.035, wireMat));
    batGroup.add(cylinderBetween(new THREE.Vector3(0.27, CY, 1.3), new THREE.Vector3(-2.9, 0.92, 1.6), 0.035, wireMat));
    mkLabel(batGroup, '电源', { fontSize: 34, scale: 0.8 }, [-2.6, 0.5, 2.35]);
    root.add(batGroup);

    const bulbGroup = new THREE.Group();
    const bulbMat = std('#fef3c7', { emissive: '#f59e0b', emissiveIntensity: 0 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 18, 14), bulbMat);
    bulb.position.set(2.6, 1.7, 1.6);
    bulbGroup.add(bulb);
    const bulbBase = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.24, 10), std('#78716c'));
    bulbBase.position.set(2.6, 1.32, 1.6);
    bulbGroup.add(bulbBase);
    bulbGroup.add(cylinderBetween(new THREE.Vector3(-0.27, CY, 1.3), new THREE.Vector3(2.45, 1.45, 1.6), 0.035, wireMat));
    bulbGroup.add(cylinderBetween(new THREE.Vector3(0.27, CY, 1.3), new THREE.Vector3(2.75, 1.45, 1.6), 0.035, wireMat));
    mkLabel(bulbGroup, '小灯泡', { fontSize: 34, scale: 0.8 }, [2.6, 2.35, 1.6]);
    root.add(bulbGroup);

    // ---- 受力箭头（世界系，两侧交替） ----------------------------------------------
    const forceL = makeArrow('#16a34a', { radius: 0.05, headRadius: 0.14, headLength: 0.3 });
    const forceR = makeArrow('#16a34a', { radius: 0.05, headRadius: 0.14, headLength: 0.3 });
    root.add(forceL.group, forceR.group);
    mkLabel(root, 'F', { fontSize: 36, scale: 0.8, color: '#15803d' }, [-1.75, CY + 0.35, 0]);

    // ---- 顶部状态与提示 --------------------------------------------------------------
    const setMode = dynLabel('电动机：电能 → 机械能', { fontSize: 42, scale: 1.05, color: '#1d4ed8' }, [0, 4.15, 0]);
    const setHint = dynLabel('点按钮通电，线圈受力转动', { fontSize: 34, scale: 0.85, color: '#64748b' }, [0, 3.6, 0]);
    const flipHint = mkLabel(root, '平衡位置：换向器交换电刷，电流方向翻转！', { fontSize: 34, scale: 0.88, color: '#b91c1c' }, [0, 3.0, 2.0]);
    flipHint.visible = false;

    const refreshMode = () => {
      batGroup.visible = mode === 'motor';
      bulbGroup.visible = mode === 'generator';
      setMode(mode === 'motor' ? '电动机：电能 → 机械能' : '发电机：机械能 → 电能（电磁感应）');
      setHint(mode === 'motor' ? '点按钮通电，线圈受力转动' : '点按钮摇动线圈，切割磁感线发电');
      acting = false;
    };
    refreshMode();

    const v1 = new THREE.Vector3();
    const v2 = new THREE.Vector3();

    return {
      setStep(i) {
        step = i;
        // 步骤联动：前三步看电动机，最后一步看发电机
        const want: Mode = step >= 3 ? 'generator' : 'motor';
        if (want !== mode) {
          mode = want;
          refreshMode();
        }
      },
      setParam(id, value) {
        if (id === 'mode') {
          mode = String(value) as Mode;
          refreshMode();
        }
        if (id === 'act') acting = !acting;
      },
      update(dt, elapsed) {
        omega = damp(omega, acting ? 2.2 : 0, 1.5, dt);
        phi += omega * dt;
        coil.rotation.z = phi;
        comm.rotation.z = phi;

        const sign = Math.sin(phi) >= 0 ? 1 : -1;
        if (sign !== lastSign) {
          lastSign = sign;
          if (mode === 'motor' && acting) flipT = 0.8;
        }
        flipT = Math.max(0, flipT - dt);
        flipHint.visible = flipT > 0 && step === 1;
        commMat.emissiveIntensity = damp(commMat.emissiveIntensity, flipT > 0 ? 1.2 : step === 1 ? 0.35 : 0, 8, dt);

        // 电流方向箭头（ab/cd 两边方向相反，随换向翻转）
        const showCurrent = acting && Math.abs(omega) > 0.3;
        curAB.group.visible = showCurrent;
        curCD.group.visible = showCurrent;
        if (showCurrent) {
          curAB.set(v1.set(-A, 0, -0.32 * sign), v2.set(-A, 0, 0.32 * sign));
          curCD.set(v1.set(A, 0, 0.32 * sign), v2.set(A, 0, -0.32 * sign));
        }
        // 受力箭头（沿 ±x，作用在 ab/cd 边上；发电机模式不显示）
        const showForce = mode === 'motor' && acting && Math.abs(Math.sin(phi)) > 0.12;
        forceL.group.visible = showForce;
        forceR.group.visible = showForce;
        if (showForce) {
          const ex = A * Math.cos(phi);
          const ey = A * Math.sin(phi);
          forceL.set(v1.set(-ex * 1.18, CY - ey * 1.18, 0), v2.set(-ex * 1.18 - 0.55 * sign, CY - ey * 1.18, 0));
          forceR.set(v1.set(ex * 1.18, CY + ey * 1.18, 0), v2.set(ex * 1.18 + 0.55 * sign, CY + ey * 1.18, 0));
        }
        // 发电机：灯泡亮度 ∝ |感应电流| = |ω·sinφ|
        if (mode === 'generator') {
          const g = Math.abs(Math.sin(phi)) * Math.min(Math.abs(omega) / 2.2, 1);
          bulbMat.emissiveIntensity = damp(bulbMat.emissiveIntensity, g * 1.8, 8, dt);
        } else {
          bulbMat.emissiveIntensity = 0;
        }
        // 换向器高亮呼吸（step1 强调）
        if (step === 1 && !acting) {
          commMat.emissiveIntensity = 0.35 + 0.25 * Math.sin(elapsed * 4);
        }
      },
      dispose() {
        ctx.scene.remove(root);
        disposeObject(root);
      },
    };
  },
};
