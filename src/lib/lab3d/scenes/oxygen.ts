// ---------------------------------------------------------------------------
// 化学 · 氧气的性质与制取：加热高锰酸钾 / 带火星木条复燃 / 铁丝燃烧 / 硫燃烧
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, cylinderBetween, damp, disposeObject, makeLabel, std } from '../three-utils';

const GLASS = (op = 0.26) =>
  std('#dbeafe', { transparent: true, opacity: op, side: THREE.DoubleSide, roughness: 0.15 });

interface Demo {
  group: THREE.Group;
  trigger(): void;
  update(dt: number, elapsed: number): void;
}

const v3 = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);

/** 通用小火花/气泡粒子池（共享材质，用缩放与显隐做淡出） */
interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number; // 0..1
  grow: number;
  maxY: number;
}
function makePool(
  parent: THREE.Group,
  count: number,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
): Particle[] {
  const pool: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    parent.add(mesh);
    pool.push({ mesh, vel: new THREE.Vector3(), life: 1, grow: 0, maxY: 99 });
  }
  return pool;
}
function spawn(pool: Particle[], pos: THREE.Vector3, vel: THREE.Vector3, scale: number, grow = 0, maxY = 99) {
  const p = pool.find((x) => x.life >= 1);
  if (!p) return;
  p.life = 0;
  p.grow = grow;
  p.maxY = maxY;
  p.mesh.visible = true;
  p.mesh.position.copy(pos);
  p.mesh.scale.setScalar(scale);
  p.vel.copy(vel);
}
function stepPool(pool: Particle[], dt: number, gravity: number, fadeRate: number) {
  pool.forEach((p) => {
    if (p.life >= 1) return;
    p.life += dt * fadeRate;
    p.vel.y -= gravity * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    if (p.grow > 0) p.mesh.scale.multiplyScalar(1 + p.grow * dt);
    else p.mesh.scale.multiplyScalar(Math.max(1 - dt * 1.2, 0.01));
    if (p.mesh.position.y > p.maxY) p.life = 1;
    if (p.life >= 1) p.mesh.visible = false;
  });
}

/** 玻璃集气瓶（正放：开口向上） */
function uprightJar(g: THREE.Group, r: number, h: number, y: number) {
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 26, 1, true), GLASS());
  wall.position.y = y + h / 2;
  g.add(wall);
  const bottom = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.05, 26), GLASS(0.4));
  bottom.position.y = y + 0.025;
  g.add(bottom);
}

export const oxygenScene: Scene3DDefinition = {
  id: 'chem-oxygen',
  title: '氧气的性质与制取',
  subject: '化学',
  grade: '9上',
  icon: '🫧',
  tagline: '加热高锰酸钾制氧气；带火星的木条复燃',
  keywords: ['氧气', '制取', '高锰酸钾', '过氧化氢', '催化剂', '助燃', '复燃', '排水法', '二氧化锰'],
  camera: { position: [5.5, 4, 9], target: [-0.3, 1.7, 0] },
  controls: [
    {
      kind: 'select',
      id: 'demo',
      label: '演示',
      options: [
        { value: 'make', label: '加热高锰酸钾制取' },
        { value: 'splint', label: '带火星木条复燃' },
        { value: 'iron', label: '铁丝在氧气中燃烧' },
        { value: 'sulfur', label: '硫在氧气中燃烧' },
      ],
      defaultValue: 'make',
    },
    { kind: 'button', id: 'go', label: '▶ 开始实验' },
  ],
  steps: [
    {
      title: '加热制取氧气',
      text: '实验室里可以加热高锰酸钾制氧气：紫黑色的固体受热分解，放出氧气。气泡顺着导管进入倒扣在水中的集气瓶，把瓶里的水慢慢排出去——这叫排水法，因为氧气不易溶于水。试管口要略向下倾斜，防止冷凝水倒流炸裂试管。',
    },
    {
      title: '氧气的检验',
      text: '怎么证明瓶里收集到的是氧气？把带火星的木条伸进去——看，木条轰地一下复燃，烧得又亮又旺！氧气能支持燃烧，别的气体很少有这样的本领，所以木条复燃就是氧气的"身份证"。',
    },
    {
      title: '化学性质活泼',
      text: '氧气的化学性质比较活泼。铁丝在空气里只能烧红，在氧气里却剧烈燃烧、火星四射，生成黑色的四氧化三铁，瓶底要留点水防止炸裂；硫在氧气中燃烧发出明亮的蓝紫色火焰，生成有刺激性气味的二氧化硫。',
    },
    {
      title: '催化剂',
      text: '还有一种更省事的方法：往过氧化氢溶液里加入二氧化锰，气泡立刻变多。二氧化锰加快了反应速率，反应前后自己的质量和化学性质都不变——这样的物质叫催化剂，起催化作用。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 14);
    const root = new THREE.Group();
    ctx.scene.add(root);
    let step = 0;
    let active = 'make';

    // ================= 演示一：加热高锰酸钾 + 排水法 =================
    const makeDemo = ((): Demo => {
      const g = new THREE.Group();
      root.add(g);
      // 铁架台
      const standRod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3, 8), std('#64748b'));
      standRod.position.set(-0.6, 1.5, -0.3);
      g.add(standRod);
      const standBase = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.5), std('#475569'));
      standBase.position.set(-0.6, 0.04, -0.3);
      g.add(standBase);
      // 试管（口略向下倾斜）
      const tube = new THREE.Group();
      tube.position.set(-2, 2.2, 0);
      tube.rotation.z = -0.21;
      g.add(tube);
      const tubeWall = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 2.2, 20, 1, true), GLASS());
      tubeWall.rotation.z = Math.PI / 2;
      tube.add(tubeWall);
      const tubeBottom = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 10), GLASS());
      tubeBottom.position.x = -1.1;
      tube.add(tubeBottom);
      const powder = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 0.7, 14),
        std('#3b0764', { emissive: '#2e1065', emissiveIntensity: 0.3 }),
      );
      powder.rotation.z = Math.PI / 2;
      powder.position.set(-0.75, -0.04, 0);
      tube.add(powder);
      const powderLabel = makeLabel('高锰酸钾（紫黑色）', { fontSize: 32, scale: 0.75, color: '#6d28d9' });
      powderLabel.position.set(-3.1, 3.15, 0);
      g.add(powderLabel);
      // 酒精灯 + 火焰
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.55, 16), GLASS(0.45));
      lamp.position.set(-2.85, 1.35, 0);
      g.add(lamp);
      const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.18, 8), std('#78350f'));
      wick.position.set(-2.85, 1.7, 0);
      g.add(wick);
      const lampFlame = new THREE.Mesh(
        new THREE.ConeGeometry(0.14, 0.5, 12),
        std('#f97316', { emissive: '#ea580c', emissiveIntensity: 1.3, transparent: true, opacity: 0.92 }),
      );
      lampFlame.position.set(-2.85, 1.95, 0);
      g.add(lampFlame);
      // 导管
      const tubeMat = std('#94a3b8');
      g.add(cylinderBetween(v3(-0.85, 1.97), v3(-0.2, 2), 0.05, tubeMat));
      g.add(cylinderBetween(v3(-0.2, 2), v3(0.55, 0.95), 0.05, tubeMat));
      g.add(cylinderBetween(v3(0.55, 0.95), v3(1.5, 0.4), 0.05, tubeMat));
      // 水槽
      const troughW = 2.2;
      const troughWall = new THREE.Mesh(new THREE.BoxGeometry(troughW, 0.8, 1.6), GLASS(0.22));
      troughWall.position.set(1.7, 0.4, 0);
      g.add(troughWall);
      const troughWater = new THREE.Mesh(
        new THREE.BoxGeometry(troughW - 0.1, 0.5, 1.5),
        std('#38bdf8', { transparent: true, opacity: 0.45, roughness: 0.2 }),
      );
      troughWater.position.set(1.7, 0.31, 0);
      g.add(troughWater);
      // 倒扣集气瓶（口在 0.35，顶在 2.05）
      const botR = 0.5;
      const botTop = 2.05;
      const botWall = new THREE.Mesh(new THREE.CylinderGeometry(botR, botR, 1.7, 24, 1, true), GLASS());
      botWall.position.set(1.55, 1.2, 0);
      g.add(botWall);
      const botCap = new THREE.Mesh(new THREE.CylinderGeometry(botR, botR, 0.05, 24), GLASS(0.4));
      botCap.position.set(1.55, botTop + 0.025, 0);
      g.add(botCap);
      // 瓶内水（随收集下降）与气体（淡青）
      const botWater = new THREE.Mesh(
        new THREE.CylinderGeometry(botR - 0.05, botR - 0.05, 1, 20),
        std('#38bdf8', { transparent: true, opacity: 0.5, roughness: 0.2 }),
      );
      g.add(botWater);
      const botGas = new THREE.Mesh(
        new THREE.CylinderGeometry(botR - 0.05, botR - 0.05, 1, 20),
        std('#e0f2fe', { transparent: true, opacity: 0.35, roughness: 0.2 }),
      );
      g.add(botGas);
      const collectLabel = makeLabel('排水法收集氧气', { fontSize: 36, scale: 0.85, color: '#0369a1' });
      collectLabel.position.set(1.7, 2.75, 0);
      g.add(collectLabel);
      const title = makeLabel('加热高锰酸钾制氧气', { fontSize: 42, scale: 1 });
      title.position.set(-0.9, 4, 0);
      g.add(title);
      // 催化剂提示（第 4 步显示）
      const catalystLabel = makeLabel('二氧化锰能加快过氧化氢分解——催化剂', {
        fontSize: 36,
        scale: 0.9,
        color: '#b45309',
      });
      catalystLabel.position.set(-0.9, 3.4, 0);
      catalystLabel.visible = false;
      g.add(catalystLabel);
      // 气泡池
      const bubbleGeo = new THREE.SphereGeometry(0.06, 8, 6);
      const bubbleMat = std('#f0f9ff', { transparent: true, opacity: 0.8, roughness: 0.1 });
      const bubbles = makePool(g, 24, bubbleGeo, bubbleMat);
      let progress = 0; // 0..1 收集进度
      let target = 0;
      let bubbleTimer = 0;
      return {
        group: g,
        trigger() {
          progress = 0;
          target = 1;
          catalystLabel.visible = step >= 3;
        },
        update(dt, elapsed) {
          progress = damp(progress, target, 0.35, dt);
          const level = 2.0 - progress * 1.1; // 瓶内水面从 2.0 降到 0.9
          const wh = Math.max(level - 0.35, 0.02);
          botWater.scale.y = wh;
          botWater.position.set(1.55, 0.35 + wh / 2, 0);
          const gh = Math.max(botTop - level, 0.02);
          botGas.scale.y = gh;
          botGas.position.set(1.55, level + gh / 2, 0);
          lampFlame.scale.setScalar(1 + Math.sin(elapsed * 15) * 0.12);
          if (target > 0 && progress < 0.99) {
            bubbleTimer += dt;
            if (bubbleTimer > 0.12) {
              bubbleTimer = 0;
              spawn(
                bubbles,
                v3(1.5 + (Math.random() - 0.5) * 0.15, 0.42),
                v3((Math.random() - 0.5) * 0.15, 0.9 + Math.random() * 0.4),
                0.6 + Math.random() * 0.6,
                0,
                level - 0.06,
              );
            }
          }
          stepPool(bubbles, dt, -0.3, 0.5);
        },
      };
    })();

    // ================= 演示二：带火星的木条复燃 =================
    const splintDemo = ((): Demo => {
      const g = new THREE.Group();
      root.add(g);
      uprightJar(g, 0.55, 1.9, 0);
      const gasTint = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 1.8, 20),
        std('#e0f2fe', { transparent: true, opacity: 0.3, roughness: 0.2 }),
      );
      gasTint.position.y = 0.95;
      g.add(gasTint);
      const jarLabel = makeLabel('集气瓶：氧气', { fontSize: 38, scale: 0.9, color: '#0369a1' });
      jarLabel.position.set(0, 2.5, 0);
      g.add(jarLabel);
      // 木条（斜持）+ 火星头
      const splint = new THREE.Group();
      splint.position.set(0.1, 3.1, 0);
      splint.rotation.z = 0.35;
      g.add(splint);
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.7, 8), std('#a16207'));
      splint.add(stick);
      const ember = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 12, 10),
        std('#ef4444', { emissive: '#dc2626', emissiveIntensity: 1.4 }),
      );
      ember.position.y = -0.9;
      splint.add(ember);
      const emberLabel = makeLabel('带火星的木条', { fontSize: 34, scale: 0.8, color: '#b45309' });
      emberLabel.position.set(0.9, 4, 0);
      g.add(emberLabel);
      // 复燃火焰
      const burst = new THREE.Mesh(
        new THREE.ConeGeometry(0.35, 1.1, 14),
        std('#fbbf24', { emissive: '#f59e0b', emissiveIntensity: 1.6, transparent: true, opacity: 0.95 }),
      );
      burst.visible = false;
      g.add(burst);
      const rekindleLabel = makeLabel('木条复燃！是氧气', { fontSize: 42, scale: 1, color: '#b91c1c' });
      rekindleLabel.position.set(0, 3.5, 0);
      rekindleLabel.visible = false;
      g.add(rekindleLabel);
      let t = -1; // 时间线；-1 待机
      return {
        group: g,
        trigger() {
          t = 0;
          burst.visible = false;
          rekindleLabel.visible = false;
        },
        update(dt, elapsed) {
          // 火星头始终微微脉动
          const em = ember.material as THREE.MeshStandardMaterial;
          em.emissiveIntensity = 1.1 + Math.sin(elapsed * 9) * 0.4;
          if (t < 0) return;
          t += dt;
          // 0~1.2s 伸入瓶中
          const inT = THREE.MathUtils.clamp(t / 1.2, 0, 1);
          const outT = t > 4 ? THREE.MathUtils.clamp((t - 4) / 1, 0, 1) : 0;
          splint.position.y = 3.1 - inT * 1.15 + outT * 1.15;
          // 1.2s 复燃爆燃
          if (t > 1.2 && t < 4) {
            burst.visible = true;
            const tip = new THREE.Vector3(0, -0.9, 0).applyEuler(splint.rotation).add(splint.position);
            burst.position.copy(tip).y += 0.4;
            const s = damp(burst.scale.x, 1, 6, dt);
            burst.scale.set(s, s * (1 + Math.sin(elapsed * 21) * 0.12), s);
            rekindleLabel.visible = true;
          } else {
            if (burst.visible) burst.scale.multiplyScalar(Math.max(1 - dt * 4, 0.01));
            if (burst.scale.x < 0.05) burst.visible = false;
            rekindleLabel.visible = false;
          }
          if (t > 5.2) t = -1;
        },
      };
    })();

    // ================= 演示三：铁丝燃烧 =================
    const ironDemo = ((): Demo => {
      const g = new THREE.Group();
      root.add(g);
      uprightJar(g, 0.6, 2.2, 0);
      const water = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.55, 0.25, 20),
        std('#38bdf8', { transparent: true, opacity: 0.5, roughness: 0.2 }),
      );
      water.position.y = 0.16;
      g.add(water);
      const waterLabel = makeLabel('瓶底留少量水，防炸裂', { fontSize: 32, scale: 0.75, color: '#0369a1' });
      waterLabel.position.set(1.9, 0.35, 0);
      g.add(waterLabel);
      // 铁丝
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 8), std('#9ca3af', { metalness: 0.6, roughness: 0.35 }));
      wire.position.set(0, 2.6, 0);
      g.add(wire);
      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 10, 8),
        std('#f59e0b', { emissive: '#d97706', emissiveIntensity: 0 }),
      );
      tip.position.set(0, 1.7, 0);
      g.add(tip);
      const wireLabel = makeLabel('铁丝（绕成螺旋）', { fontSize: 34, scale: 0.8 });
      wireLabel.position.set(0, 3.85, 0);
      g.add(wireLabel);
      const sparkLabel = makeLabel('火星四射，生成黑色固体', { fontSize: 40, scale: 0.95, color: '#b45309' });
      sparkLabel.position.set(0, 3.3, 0);
      sparkLabel.visible = false;
      g.add(sparkLabel);
      // 火星粒子（金色）与四氧化三铁颗粒（黑色）
      const sparkGeo = new THREE.SphereGeometry(0.05, 6, 5);
      const sparkMat = std('#fde047', { emissive: '#facc15', emissiveIntensity: 1.8 });
      const sparks = makePool(g, 48, sparkGeo, sparkMat);
      const feGeo = new THREE.SphereGeometry(0.06, 8, 6);
      const feMat = std('#1c1917');
      const fes = makePool(g, 14, feGeo, feMat);
      let t = -1;
      let sparkTimer = 0;
      return {
        group: g,
        trigger() {
          t = 0;
          sparkLabel.visible = false;
          fes.forEach((f) => {
            f.life = 1;
            f.mesh.visible = false;
          });
        },
        update(dt, elapsed) {
          if (t < 0) return;
          t += dt;
          const glow = THREE.MathUtils.clamp(t / 1, 0, 1) * THREE.MathUtils.clamp((5.5 - t) / 1, 0, 1);
          const tm = tip.material as THREE.MeshStandardMaterial;
          tm.emissiveIntensity = glow * (1.6 + Math.sin(elapsed * 13) * 0.4);
          if (t > 1 && t < 4.2) {
            sparkLabel.visible = true;
            sparkTimer += dt;
            if (sparkTimer > 0.05) {
              sparkTimer = 0;
              const a = Math.random() * Math.PI * 2;
              spawn(
                sparks,
                v3(0, 1.7),
                v3(Math.cos(a) * (0.8 + Math.random()), -0.5 - Math.random() * 0.8, Math.sin(a) * (0.8 + Math.random())),
                0.7 + Math.random() * 0.6,
              );
            }
            if (Math.random() < dt * 6) {
              spawn(fes, v3((Math.random() - 0.5) * 0.3, 1.6), v3(0, -0.4), 0.9, 0, 0.35);
            }
          } else {
            sparkLabel.visible = false;
          }
          stepPool(sparks, dt, 2.2, 1.4);
          stepPool(fes, dt, 2.5, 0.06);
          if (t > 6.5) t = -1;
        },
      };
    })();

    // ================= 演示四：硫燃烧 =================
    const sulfurDemo = ((): Demo => {
      const g = new THREE.Group();
      root.add(g);
      uprightJar(g, 0.6, 2.2, 0);
      // 燃烧匙
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.2, 8), std('#78716c'));
      rod.rotation.z = Math.PI / 2 - 0.5;
      rod.position.set(1.05, 2.35, 0);
      g.add(rod);
      const cup = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std('#57534e'));
      cup.position.set(0, 1.75, 0);
      g.add(cup);
      const sulfur = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), std('#facc15'));
      sulfur.scale.y = 0.55;
      sulfur.position.set(0, 1.78, 0);
      g.add(sulfur);
      const sLabel = makeLabel('硫（黄色）', { fontSize: 34, scale: 0.78, color: '#a16207' });
      sLabel.position.set(1.5, 1.35, 0);
      g.add(sLabel);
      // 蓝紫色火焰
      const flame = new THREE.Group();
      flame.position.set(0, 2, 0);
      flame.visible = false;
      g.add(flame);
      const fOut = new THREE.Mesh(
        new THREE.ConeGeometry(0.3, 0.85, 14),
        std('#8b5cf6', { emissive: '#7c3aed', emissiveIntensity: 1.5, transparent: true, opacity: 0.85 }),
      );
      flame.add(fOut);
      const fIn = new THREE.Mesh(
        new THREE.ConeGeometry(0.15, 0.5, 12),
        std('#c4b5fd', { emissive: '#a78bfa', emissiveIntensity: 1.8, transparent: true, opacity: 0.9 }),
      );
      fIn.position.y = -0.08;
      flame.add(fIn);
      const note = makeLabel('蓝紫色火焰，生成刺激性气味气体', { fontSize: 38, scale: 0.9, color: '#6d28d9' });
      note.position.set(0, 3.4, 0);
      note.visible = false;
      g.add(note);
      let t = -1;
      return {
        group: g,
        trigger() {
          t = 0;
        },
        update(dt, elapsed) {
          if (t < 0) return;
          t += dt;
          if (t > 0.3 && t < 5) {
            flame.visible = true;
            note.visible = true;
            const s = damp(flame.scale.x, 1, 5, dt);
            flame.scale.set(s * (1 + Math.sin(elapsed * 19) * 0.1), s * (1 + Math.sin(elapsed * 23) * 0.14), s);
          } else if (t >= 5) {
            note.visible = false;
            flame.scale.multiplyScalar(Math.max(1 - dt * 3, 0.01));
            if (flame.scale.x < 0.05) {
              flame.visible = false;
              t = -1;
            }
          }
        },
      };
    })();

    const demos: Record<string, Demo> = {
      make: makeDemo,
      splint: splintDemo,
      iron: ironDemo,
      sulfur: sulfurDemo,
    };
    const show = (key: string) => {
      active = key;
      Object.entries(demos).forEach(([k, d]) => (d.group.visible = k === key));
    };
    show('make');

    return {
      setStep(i) {
        step = i;
        if (i === 0) show('make');
        if (i === 1) show('splint');
        if (i === 2) show('iron');
        if (i === 3) show('make');
        demos[active].trigger();
      },
      setParam(id, value) {
        if (id === 'demo') show(String(value));
        if (id === 'go') demos[active].trigger();
      },
      update(dt, elapsed) {
        Object.values(demos).forEach((d) => {
          if (d.group.visible) d.update(dt, elapsed);
        });
      },
      dispose() {
        ctx.scene.remove(root);
        disposeObject(root);
      },
    };
  },
};
