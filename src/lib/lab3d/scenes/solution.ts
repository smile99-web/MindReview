// ---------------------------------------------------------------------------
// 化学 · 溶液与溶解度：加盐溶解、饱和沉底、加热续溶、冷却结晶、质量分数
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, damp, disposeObject, makeLabel, std } from '../three-utils';

const SPOON_G = 5; // 每勺盐（克）
const MAX_SPOONS = 6;
const CAP_COLD = 15; // 20℃ 时 50g 水最多溶 15g（3 勺）
const CAP_HOT = 25; // 60℃ 时最多溶 25g（5 勺）
const BEAKER_R = 0.95;
const INNER_R = 0.78;
const BOTTOM_Y = 0.55; // 烧杯内底（垫高，下方可放酒精灯）
const SURFACE_Y = 1.9;
const N_PARTICLE = 50;
const FRACTIONS: Record<number, string> = {
  0: '溶质质量分数 0%',
  5: '溶质质量分数 ≈ 9%（5÷55）',
  10: '溶质质量分数 ≈ 17%（10÷60）',
  15: '溶质质量分数 ≈ 23%（15÷65）',
  20: '溶质质量分数 ≈ 29%（20÷70）',
  25: '溶质质量分数 ≈ 33%（25÷75）',
};

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
}
interface Grain {
  mesh: THREE.Mesh;
  active: boolean;
}

export const solutionScene: Scene3DDefinition = {
  id: 'chem-solution',
  title: '溶液与溶解度',
  subject: '化学',
  grade: '9下',
  icon: '🥛',
  tagline: '盐加多了就溶不下——饱和溶液、溶解度与结晶',
  keywords: ['溶液', '溶质', '溶剂', '溶解度', '饱和溶液', '不饱和溶液', '结晶', '溶质质量分数'],
  camera: { position: [5.5, 4.5, 7.5], target: [0, 1.5, 0] },
  controls: [
    { kind: 'button', id: 'add', label: '🧂 加一勺盐（可多点几次）' },
    { kind: 'button', id: 'temp', label: '🌡️ 加热 / 冷却' },
    { kind: 'button', id: 'reset', label: '↺ 重置' },
  ],
  steps: [
    {
      title: '什么是溶液',
      text: '烧杯里是清水，点按钮加一勺盐看看：盐粒落进水里，慢慢"消失"了——其实它变成了肉眼看不见的微粒，均匀分散到水中。像这样，一种或几种物质分散到另一种物质里，形成的均一、稳定的混合物，就叫溶液。盐是溶质，水是溶剂。',
    },
    {
      title: '饱和与不饱和',
      text: '继续加盐：一勺、两勺、三勺……咦，再加就溶不掉了，固体沉在杯底。在一定温度下，一定量的溶剂里，不能再继续溶解某种溶质的溶液，叫饱和溶液；还能再溶的，就是不饱和溶液。',
    },
    {
      title: '溶解度与温度',
      text: '多数固体的溶解度随温度升高而增大。点"加热"：杯底的盐又继续溶解了，因为热水能"装"更多盐。再冷却回来，溶不下的盐会重新变成晶体析出来。海水晒盐、冬天捞碱，用的都是这个原理。',
    },
    {
      title: '溶质质量分数',
      text: '溶液浓还是稀，用溶质质量分数表示：溶质质量除以溶液总质量。看状态栏：五十克水里溶了十五克盐，质量分数约是十五除以六十五，约百分之二十三。盐越多、水不变，分数就越大。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 12);
    let step = 0;
    let spoons = 0;
    let hot = false;
    let dissolved = 0; // 显示用（克，平滑）
    let stirT = 0;
    let flashT = 0; // 状态闪现（加热溶解/冷却析晶）
    let flashKind: 'dissolve' | 'crystal' = 'dissolve';
    let crystalAnim = 0; // 结晶生长动画 0..1

    const group = new THREE.Group();
    ctx.scene.add(group);

    // ---------------- 烧杯与水 ----------------
    const glassMat = std('#dbeafe', {
      transparent: true,
      opacity: 0.26,
      side: THREE.DoubleSide,
      roughness: 0.12,
      metalness: 0,
    });
    const beaker = new THREE.Mesh(new THREE.CylinderGeometry(BEAKER_R, BEAKER_R, 1.9, 26), glassMat);
    beaker.position.set(0, BOTTOM_Y + 0.95, 0);
    group.add(beaker);
    const waterCold = new THREE.Color('#93c5fd');
    const waterHot = new THREE.Color('#fca5a5');
    const waterMat = std('#93c5fd', { transparent: true, opacity: 0.5, roughness: 0.15 });
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 1.35, 26), waterMat);
    water.position.set(0, (BOTTOM_Y + SURFACE_Y) / 2 - 0.03, 0);
    group.add(water);

    // 三脚架 + 酒精灯（加热时火焰出现）
    const standMat = std('#57534e', { metalness: 0.6, roughness: 0.4 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(BEAKER_R, 0.045, 8, 32), standMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = BOTTOM_Y - 0.02;
    group.add(ring);
    for (let i = 0; i < 3; i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, BOTTOM_Y, 8), standMat);
      const a = (i / 3) * Math.PI * 2;
      leg.position.set(Math.cos(a) * BEAKER_R * 0.85, BOTTOM_Y / 2 - 0.02, Math.sin(a) * BEAKER_R * 0.85);
      group.add(leg);
    }
    const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.22, 12), std('#a8a29e'));
    burner.position.set(0, 0.11, 0);
    group.add(burner);
    const flameMat = std('#fb923c', { emissive: '#ea580c', emissiveIntensity: 1.2, transparent: true, opacity: 0.9 });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 12), flameMat);
    flame.position.set(0, 0.42, 0);
    flame.visible = false;
    group.add(flame);

    // 搅拌棒（斜插玻璃棒）
    const rodPivot = new THREE.Group();
    const rod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 2.2, 8),
      std('#e2e8f0', { transparent: true, opacity: 0.55, roughness: 0.1 }),
    );
    rod.position.set(0.35, 1.6, 0);
    rod.rotation.z = 0.28;
    rodPivot.add(rod);
    group.add(rodPivot);

    // ---------------- 溶解的微粒 ----------------
    const pGeo = new THREE.SphereGeometry(0.045, 8, 6);
    const pMat = std('#f8fafc', { emissive: '#e2e8f0', emissiveIntensity: 0.4 });
    const particles: Particle[] = [];
    for (let i = 0; i < N_PARTICLE; i++) {
      const m = new THREE.Mesh(pGeo, pMat);
      m.visible = false;
      m.position.set(0, 1, 0);
      group.add(m);
      particles.push({
        mesh: m,
        vel: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
      });
    }

    // ---------------- 下落盐粒 ----------------
    const grainGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
    const grainMat = std('#ffffff', { roughness: 0.9 });
    const grains: Grain[] = [];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(grainGeo, grainMat);
      m.visible = false;
      group.add(m);
      grains.push({ mesh: m, active: false });
    }
    const dropGrains = () => {
      grains.forEach((g, i) => {
        g.active = true;
        g.mesh.visible = true;
        g.mesh.position.set(
          (Math.random() - 0.5) * 0.5,
          3.1 + i * 0.09,
          (Math.random() - 0.5) * 0.5,
        );
      });
    };

    // ---------------- 杯底固体（沉底盐堆） ----------------
    const pileMat = std('#f1f5f9', { roughness: 0.95 });
    const pile = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 10), pileMat);
    pile.scale.set(0.001, 0.001, 0.001);
    pile.position.set(0, BOTTOM_Y + 0.02, 0);
    group.add(pile);

    // 冷却析出的晶体（小立方体簇）
    const crystals: THREE.Mesh[] = [];
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), grainMat);
      const a = (i / 9) * Math.PI * 2;
      const r = 0.15 + (i % 3) * 0.16;
      c.position.set(Math.cos(a) * r, BOTTOM_Y + 0.08 + (i % 2) * 0.1, Math.sin(a) * r);
      c.rotation.set(i, i * 2, 0);
      c.scale.setScalar(0.001);
      group.add(c);
      crystals.push(c);
    }

    // ---------------- 标签（全部预建，按需切换） ----------------
    const titleLabel = makeLabel('一杯食盐水（50 克水）', { fontSize: 38, scale: 0.95 });
    titleLabel.position.set(0, 3.6, 0);
    group.add(titleLabel);

    const satLabel = makeLabel('已饱和：溶不下的沉底了', { fontSize: 36, scale: 0.9, color: '#b91c1c' });
    satLabel.position.set(0, 0.28, 1.4);
    satLabel.visible = false;
    group.add(satLabel);

    // 状态栏三行：已加盐量 / 状态 / 质量分数
    const rowY = [4.35, 4.95, 5.55];
    const addLabels: THREE.Sprite[] = [];
    for (let i = 0; i <= MAX_SPOONS; i++) {
      const s = makeLabel(`已加盐 ${i} 勺（${i * SPOON_G} 克）`, { fontSize: 34, scale: 0.8, color: '#334155' });
      s.position.set(-2.6, rowY[0], 0);
      s.visible = false;
      group.add(s);
      addLabels.push(s);
    }
    const stateDefs: { key: string; text: string; color: string }[] = [
      { key: 'unsat', text: '不饱和：还能继续溶解', color: '#0369a1' },
      { key: 'sat', text: '饱和溶液', color: '#b45309' },
      { key: 'dissolve', text: '加热：溶解度增大，继续溶解', color: '#c2410c' },
      { key: 'crystal', text: '冷却：溶解度减小，析出晶体', color: '#7c3aed' },
    ];
    const stateLabels: Record<string, THREE.Sprite> = {};
    stateDefs.forEach((d) => {
      const s = makeLabel(d.text, { fontSize: 34, scale: 0.8, color: d.color });
      s.position.set(-2.6, rowY[1], 0);
      s.visible = false;
      group.add(s);
      stateLabels[d.key] = s;
    });
    const fracLabels: Record<number, THREE.Sprite> = {};
    const fracBase: THREE.Vector3[] = [];
    Object.entries(FRACTIONS).forEach(([g, text]) => {
      const s = makeLabel(text, { fontSize: 34, scale: 0.8, color: '#0f766e' });
      s.position.set(-2.6, rowY[2], 0);
      s.visible = false;
      group.add(s);
      fracLabels[Number(g)] = s;
      fracBase.push(s.scale.clone());
    });
    const tempCold = makeLabel('🌡️ 20℃', { fontSize: 36, scale: 0.85, color: '#0369a1' });
    tempCold.position.set(1.7, 2.6, 0);
    group.add(tempCold);
    const tempHot = makeLabel('🌡️ 60℃（加热中）', { fontSize: 36, scale: 0.85, color: '#c2410c' });
    tempHot.position.set(1.7, 2.6, 0);
    tempHot.visible = false;
    group.add(tempHot);

    // ---------------- 状态刷新 ----------------
    const capacity = () => (hot ? CAP_HOT : CAP_COLD);
    const refreshLabels = () => {
      const addedG = spoons * SPOON_G;
      const dissolvedTarget = Math.min(addedG, capacity());
      addLabels.forEach((s, i) => (s.visible = i === spoons));
      let stateKey = 'unsat';
      if (flashT > 0) stateKey = flashKind;
      else if (addedG > capacity()) stateKey = 'sat';
      Object.entries(stateLabels).forEach(([k, s]) => (s.visible = k === stateKey && spoons > 0));
      Object.entries(fracLabels).forEach(([g, s]) => (s.visible = Number(g) === dissolvedTarget));
      satLabel.visible = addedG > capacity();
      tempCold.visible = !hot;
      tempHot.visible = hot;
      flame.visible = hot;
    };

    const doReset = () => {
      spoons = 0;
      hot = false;
      flashT = 0;
      crystalAnim = 0;
      crystals.forEach((c) => c.scale.setScalar(0.001));
      refreshLabels();
    };

    refreshLabels();

    return {
      setStep(i) {
        step = i;
        if (i === 0) {
          doReset();
          spoons = 1; // 自动加一勺，演示溶解
          dropGrains();
          stirT = 2;
        } else if (i === 1) {
          doReset();
          spoons = 4; // 超过 20℃ 饱和量，杯底有固体
          dropGrains();
          stirT = 2;
        } else if (i === 2) {
          // 保持足量盐（至少 4 勺），加热后沉底的盐继续溶解
          if (spoons < 4) {
            spoons = 4;
            dropGrains();
          }
          hot = true;
          flashT = 2.5;
          flashKind = 'dissolve';
        } else if (i === 3 && spoons === 0) {
          spoons = 3;
          dropGrains();
        }
        refreshLabels();
      },
      setParam(id) {
        if (id === 'add') {
          if (spoons < MAX_SPOONS) {
            spoons += 1;
            dropGrains();
            stirT = 2;
          }
        } else if (id === 'temp') {
          hot = !hot;
          const addedG = spoons * SPOON_G;
          if (!hot && addedG > CAP_COLD) {
            flashKind = 'crystal';
            flashT = 3;
            crystalAnim = 0; // 重新生长晶体
          } else if (hot && addedG > CAP_COLD) {
            flashKind = 'dissolve';
            flashT = 2.5;
          }
        } else if (id === 'reset') {
          doReset();
        }
        refreshLabels();
      },
      update(dt, elapsed) {
        const addedG = spoons * SPOON_G;
        const target = Math.min(addedG, capacity());
        dissolved = damp(dissolved, target, 1.6, dt);
        stirT = Math.max(0, stirT - dt);
        if (flashT > 0) {
          flashT = Math.max(0, flashT - dt);
          if (flashT === 0) refreshLabels();
        }

        // 溶解微粒数量 ∝ 已溶质量
        const showN = Math.round((dissolved / (MAX_SPOONS * SPOON_G)) * N_PARTICLE);
        const speedK = stirT > 0 ? 2.2 : 0.55;
        particles.forEach((p, i) => {
          p.mesh.visible = i < showN;
          if (!p.mesh.visible) return;
          p.mesh.position.addScaledVector(p.vel, speedK * dt);
          const pos = p.mesh.position;
          if (pos.y < BOTTOM_Y + 0.08 || pos.y > SURFACE_Y - 0.1) {
            p.vel.y *= -1;
            pos.y = THREE.MathUtils.clamp(pos.y, BOTTOM_Y + 0.08, SURFACE_Y - 0.1);
          }
          const rr = Math.hypot(pos.x, pos.z);
          if (rr > INNER_R) {
            p.vel.x *= -1;
            p.vel.z *= -1;
            pos.x *= INNER_R / rr;
            pos.z *= INNER_R / rr;
          }
        });

        // 盐粒下落
        grains.forEach((g) => {
          if (!g.active) return;
          g.mesh.position.y -= 2.6 * dt;
          g.mesh.rotation.x += dt * 3;
          if (g.mesh.position.y < SURFACE_Y) {
            g.active = false;
            g.mesh.visible = false;
          }
        });

        // 沉底盐堆：随未溶固体量变化
        const solid = Math.max(0, addedG - dissolved);
        const pileS = solid > 0.2 ? 0.35 + (solid / 15) * 0.65 : 0.001;
        pile.scale.set(pileS, pileS * 0.32, pileS);

        // 冷却结晶：小立方体逐渐长大
        if (!hot && addedG > CAP_COLD) {
          crystalAnim = Math.min(1, crystalAnim + dt / 2.5);
        } else if (hot) {
          crystalAnim = Math.max(0, crystalAnim - dt / 1.5);
        }
        crystals.forEach((c, i) => {
          const s = Math.max(0.001, crystalAnim * (0.7 + (i % 3) * 0.25));
          c.scale.setScalar(s);
          c.rotation.y += dt * 0.2;
        });

        // 水温颜色与火焰跳动
        waterMat.color.lerpColors(waterCold, waterHot, hot ? 0.55 : 0);
        if (hot) {
          flame.scale.set(1 + Math.sin(elapsed * 9) * 0.12, 1 + Math.sin(elapsed * 12) * 0.18, 1);
        }
        // 搅拌棒转动
        rodPivot.rotation.y += dt * (stirT > 0 ? 4 : 0.15);
        // 第 4 步轻轻脉动质量分数行，吸引注意
        const pulse = step === 3 ? 1 + Math.sin(elapsed * 3) * 0.07 : 1;
        Object.values(fracLabels).forEach((s, i) => {
          const b = fracBase[i];
          s.scale.set(b.x * pulse, b.y * pulse, 1);
        });
      },
      dispose() {
        ctx.scene.remove(group);
        disposeObject(group);
      },
    };
  },
};
