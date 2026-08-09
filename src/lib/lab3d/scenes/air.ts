// ---------------------------------------------------------------------------
// 化学 · 空气的成分：红磷燃烧测定氧气含量（水面上升约 1/5）+ 成分堆叠条
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, damp, disposeObject, makeLabel, std } from '../three-utils';

const GLASS = () =>
  std('#dbeafe', { transparent: true, opacity: 0.28, side: THREE.DoubleSide, roughness: 0.15 });

const TROUGH = { x: -1.6, w: 3.6, h: 1.0, d: 2.2 };
const WATER_Y = 0.72; // 水槽水面高度
const JAR_R = 0.85;
const JAR_RIM_Y = 0.25; // 钟罩口（浸在水下）
const GAS_TOP = 3.9; // 罩内气体空间顶
const GAS_H = GAS_TOP - WATER_Y; // 气体空间总高（五等分）
const FIFTH_Y = WATER_Y + GAS_H / 5; // 1/5 刻度高度

interface Smoke {
  mesh: THREE.Mesh;
  life: number; // 0..1，1 为消散
  speed: number;
  drift: number;
}

export const airScene: Scene3DDefinition = {
  id: 'chem-air',
  title: '空气的成分',
  subject: '化学',
  grade: '9上',
  icon: '🌬️',
  tagline: '红磷燃烧实验：氧气约占空气体积的五分之一',
  keywords: ['空气', '氧气', '氮气', '稀有气体', '体积分数', '红磷', '测定氧气含量', '混合物'],
  camera: { position: [5.5, 4.5, 9.5], target: [0.4, 2, 0] },
  controls: [
    { kind: 'button', id: 'burn', label: '🔥 点燃红磷' },
    { kind: 'button', id: 'reset', label: '↺ 重置' },
  ],
  steps: [
    {
      title: '空气是混合物',
      text: '空气看起来空空荡荡，其实是由多种气体混合而成的混合物。两百多年前，法国化学家拉瓦锡第一个用实验定量研究了空气的成分。今天我们用经典的红磷燃烧实验，测一测空气里氧气到底占多少。',
    },
    {
      title: '红磷燃烧',
      text: '钟罩里的燃烧匙上放着红磷。点燃它：红磷剧烈燃烧，发出黄光，产生大量白烟——那是五氧化二磷固体小颗粒。注意，红磷只消耗空气中的氧气，生成的固体几乎不占体积。',
    },
    {
      title: '水面上升了',
      text: '火焰熄灭、装置冷却以后，看：钟罩里的水面慢慢上升了，停在五等分的第一道刻度。因为氧气被消耗，罩内气压变小，外面的大气压就把水压了进来。上升的水的体积，就是被消耗的氧气的体积。',
    },
    {
      title: '空气的组成',
      text: '结论：氧气约占空气体积的五分之一，其余主要是氮气，约占五分之四。精确测定：氮气约百分之七十八，氧气约百分之二十一，稀有气体等加起来约百分之一。氧气供给呼吸、支持燃烧，氮气常用作保护气。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 14);
    const root = new THREE.Group();
    ctx.scene.add(root);
    let step = 0;
    // 阶段：idle → burning → cooling（水面上升）→ done
    let phase: 'idle' | 'burning' | 'cooling' | 'done' = 'idle';
    let burnT = 0;
    let waterIn = 0; // 罩内进水比例 0..1（1 = 升到 1/5）
    let waterTarget = 0;

    // ---- 水槽 ----
    const trough = new THREE.Group();
    trough.position.x = TROUGH.x;
    root.add(trough);
    const wallMat = GLASS();
    const mkWall = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      m.position.set(x, y, z);
      trough.add(m);
    };
    mkWall(TROUGH.w, 0.08, TROUGH.d, 0, 0.04, 0); // 底
    mkWall(TROUGH.w, TROUGH.h, 0.06, 0, TROUGH.h / 2, TROUGH.d / 2);
    mkWall(TROUGH.w, TROUGH.h, 0.06, 0, TROUGH.h / 2, -TROUGH.d / 2);
    mkWall(0.06, TROUGH.h, TROUGH.d, TROUGH.w / 2, TROUGH.h / 2, 0);
    mkWall(0.06, TROUGH.h, TROUGH.d, -TROUGH.w / 2, TROUGH.h / 2, 0);
    const troughWater = new THREE.Mesh(
      new THREE.BoxGeometry(TROUGH.w - 0.15, WATER_Y, TROUGH.d - 0.15),
      std('#38bdf8', { transparent: true, opacity: 0.45, roughness: 0.2 }),
    );
    troughWater.position.y = WATER_Y / 2 + 0.06;
    trough.add(troughWater);

    // ---- 钟罩（玻璃筒 + 半球顶）----
    const jar = new THREE.Group();
    jar.position.x = TROUGH.x;
    root.add(jar);
    const jarWall = new THREE.Mesh(
      new THREE.CylinderGeometry(JAR_R, JAR_R, GAS_TOP - JAR_RIM_Y, 28, 1, true),
      GLASS(),
    );
    jarWall.position.y = JAR_RIM_Y + (GAS_TOP - JAR_RIM_Y) / 2;
    jar.add(jarWall);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(JAR_R, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      GLASS(),
    );
    dome.position.y = GAS_TOP;
    jar.add(dome);

    // 五等分刻度环 + 数字标签
    const tickMat = std('#64748b');
    const tickHiMat = std('#f59e0b', { emissive: '#b45309', emissiveIntensity: 0.5 });
    const ticks: THREE.Mesh[] = [];
    for (let i = 1; i <= 4; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(JAR_R + 0.015, 0.018, 8, 40), tickMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = WATER_Y + (GAS_H / 5) * i;
      jar.add(ring);
      ticks.push(ring);
    }
    const fifthLabel = makeLabel('1/5 刻度', { fontSize: 36, scale: 0.8, color: '#b45309' });
    fifthLabel.position.set(TROUGH.x + JAR_R + 1.15, FIFTH_Y + 0.15, 0);
    fifthLabel.visible = false;
    root.add(fifthLabel);

    // 罩内上升的水（随进水比例拉伸）
    const innerWater = new THREE.Mesh(
      new THREE.CylinderGeometry(JAR_R - 0.06, JAR_R - 0.06, 1, 24),
      std('#0ea5e9', { transparent: true, opacity: 0.55, roughness: 0.2 }),
    );
    innerWater.position.set(TROUGH.x, WATER_Y + 0.005, 0);
    innerWater.scale.y = 0.01;
    root.add(innerWater);

    // ---- 燃烧匙 + 红磷 ----
    const spoon = new THREE.Group();
    spoon.position.set(TROUGH.x, 1.15, 0);
    root.add(spoon);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.4, 8), std('#78716c'));
    rod.rotation.z = Math.PI / 2;
    rod.position.x = 1.2;
    spoon.add(rod);
    const cup = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std('#57534e'));
    spoon.add(cup);
    const phosphorus = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 14, 10),
      std('#dc2626', { emissive: '#7f1d1d', emissiveIntensity: 0.2 }),
    );
    phosphorus.scale.y = 0.6;
    phosphorus.position.y = 0.05;
    spoon.add(phosphorus);
    const pLabel = makeLabel('红磷', { fontSize: 36, scale: 0.75, color: '#b91c1c' });
    pLabel.position.set(TROUGH.x - 0.05, 0.55, 0.85);
    root.add(pLabel);

    // ---- 火焰（双层锥）----
    const flame = new THREE.Group();
    flame.position.set(TROUGH.x, 1.45, 0);
    flame.visible = false;
    root.add(flame);
    const flameOut = new THREE.Mesh(
      new THREE.ConeGeometry(0.24, 0.7, 14),
      std('#f97316', { emissive: '#ea580c', emissiveIntensity: 1.2, transparent: true, opacity: 0.9 }),
    );
    flame.add(flameOut);
    const flameIn = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.42, 12),
      std('#fde047', { emissive: '#facc15', emissiveIntensity: 1.6, transparent: true, opacity: 0.95 }),
    );
    flameIn.position.y = -0.06;
    flame.add(flameIn);

    // ---- 白烟粒子池 ----
    const smokeGeo = new THREE.SphereGeometry(0.09, 8, 6);
    const smokes: Smoke[] = [];
    for (let i = 0; i < 36; i++) {
      const mesh = new THREE.Mesh(
        smokeGeo,
        std('#f8fafc', { transparent: true, opacity: 0, roughness: 0.9 }),
      );
      mesh.visible = false;
      root.add(mesh);
      smokes.push({ mesh, life: 1, speed: 0.5 + (i % 5) * 0.08, drift: (i % 7) * 0.9 });
    }
    let smokeTimer = 0;

    // ---- 右侧成分堆叠条 ----
    const bar = new THREE.Group();
    bar.position.set(3.4, 0, 0);
    root.add(bar);
    const BAR_H = 3.4;
    const mkSeg = (frac: number, y0: number, color: string, emissive: string) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, BAR_H * frac, 0.9),
        std(color, { emissive, emissiveIntensity: 0.15 }),
      );
      m.position.y = y0 + (BAR_H * frac) / 2;
      bar.add(m);
      return m;
    };
    const segN = mkSeg(0.78, 0, '#3b82f6', '#1d4ed8');
    const segO = mkSeg(0.21, BAR_H * 0.78, '#ef4444', '#b91c1c');
    const segX = mkSeg(0.01, BAR_H * 0.99, '#94a3b8', '#475569');
    const lbN = makeLabel('氮气 约78%', { fontSize: 36, scale: 0.85, color: '#1d4ed8' });
    lbN.position.set(1.35, BAR_H * 0.39, 0);
    bar.add(lbN);
    const lbO = makeLabel('氧气 约21%', { fontSize: 36, scale: 0.85, color: '#b91c1c' });
    lbO.position.set(1.35, BAR_H * 0.885, 0);
    bar.add(lbO);
    const lbX = makeLabel('其他 约1%', { fontSize: 32, scale: 0.72, color: '#475569' });
    lbX.position.set(1.25, BAR_H * 0.995 + 0.35, 0);
    bar.add(lbX);
    const barTitle = makeLabel('空气的成分（按体积）', { fontSize: 38, scale: 0.9 });
    barTitle.position.set(0.4, BAR_H + 0.75, 0);
    bar.add(barTitle);

    const mainLabel = makeLabel('测定空气中氧气的含量', { fontSize: 42, scale: 1 });
    mainLabel.position.set(TROUGH.x, GAS_TOP + 1.15, 0);
    root.add(mainLabel);
    const resultLabel = makeLabel('氧气约占空气体积的 1/5', { fontSize: 40, scale: 0.95, color: '#b45309' });
    resultLabel.position.set(TROUGH.x, GAS_TOP + 0.55, 0);
    resultLabel.visible = false;
    root.add(resultLabel);

    const ignite = () => {
      if (phase === 'idle') {
        phase = 'burning';
        burnT = 0;
        flame.visible = true;
      }
    };
    const reset = () => {
      phase = 'idle';
      burnT = 0;
      waterTarget = 0;
      flame.visible = false;
      smokes.forEach((s) => {
        s.life = 1;
        s.mesh.visible = false;
      });
      applyStep();
    };
    const applyStep = () => {
      const rising = phase === 'cooling' || phase === 'done' || step >= 2;
      fifthLabel.visible = step >= 2;
      resultLabel.visible = step >= 3;
      // 1/5 刻度环高亮
      ticks[0].material = step >= 2 ? tickHiMat : tickMat;
      if (step >= 3 && phase === 'idle') {
        // 直接跳到结果状态（学生快进步骤时）
        phase = 'done';
        waterTarget = 1;
      }
      if (rising && phase === 'idle') waterTarget = 1;
    };
    applyStep();

    return {
      setStep(i) {
        step = i;
        if (i === 1 && phase === 'idle') ignite();
        if (i >= 2 && phase === 'burning') {
          phase = 'cooling';
          flame.visible = false;
        }
        if (i >= 2 && phase === 'idle') waterTarget = 1;
        applyStep();
      },
      setParam(id) {
        if (id === 'burn') ignite();
        if (id === 'reset') reset();
      },
      update(dt, elapsed) {
        // 燃烧计时：4.5 秒后熄灭进入冷却
        if (phase === 'burning') {
          burnT += dt;
          if (burnT > 4.5) {
            phase = 'cooling';
            flame.visible = false;
          }
        }
        if (phase === 'cooling') {
          waterTarget = 1;
          if (waterIn > 0.98) phase = 'done';
        }
        // 火焰抖动
        if (flame.visible) {
          const f = 1 + Math.sin(elapsed * 17) * 0.12 + Math.sin(elapsed * 29 + 1) * 0.08;
          flame.scale.set(f, 1 + Math.sin(elapsed * 23) * 0.15, f);
        }
        // 白烟：燃烧时持续生成，向上升腾变淡
        if (phase === 'burning') {
          smokeTimer += dt;
          if (smokeTimer > 0.09) {
            smokeTimer = 0;
            const s = smokes.find((x) => x.life >= 1);
            if (s) {
              s.life = 0;
              s.mesh.visible = true;
              s.mesh.position.set(
                TROUGH.x + (Math.random() - 0.5) * 0.3,
                1.5,
                (Math.random() - 0.5) * 0.3,
              );
              s.mesh.scale.setScalar(0.6 + Math.random() * 0.5);
            }
          }
        }
        smokes.forEach((s) => {
          if (s.life >= 1) return;
          s.life += dt * 0.35;
          s.mesh.position.y += dt * s.speed;
          s.mesh.position.x += Math.sin(elapsed * 1.5 + s.drift) * dt * 0.15;
          const top = GAS_TOP - 0.25;
          if (s.mesh.position.y > top) s.mesh.position.y = top;
          const m = s.mesh.material as THREE.MeshStandardMaterial;
          m.opacity = Math.max(0, 0.75 * (1 - s.life));
          s.mesh.scale.multiplyScalar(1 + dt * 0.35);
          if (s.life >= 1) s.mesh.visible = false;
        });
        // 罩内水面上升
        waterIn = damp(waterIn, waterTarget, 0.9, dt);
        const h = Math.max(waterIn * (FIFTH_Y - WATER_Y), 0.01);
        innerWater.scale.y = h;
        innerWater.position.y = WATER_Y + h / 2;
        // 步骤 3 氧气段脉冲高亮
        const oMat = segO.material as THREE.MeshStandardMaterial;
        oMat.emissiveIntensity = step >= 3 ? 0.4 + Math.sin(elapsed * 4) * 0.25 : 0.15;
        const nMat = segN.material as THREE.MeshStandardMaterial;
        nMat.emissiveIntensity = step >= 3 ? 0.3 : 0.15;
        const xMat = segX.material as THREE.MeshStandardMaterial;
        xMat.emissiveIntensity = step >= 3 ? 0.3 : 0.15;
      },
      dispose() {
        ctx.scene.remove(root);
        disposeObject(root);
      },
    };
  },
};
