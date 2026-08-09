// ---------------------------------------------------------------------------
// 化学 · 燃烧的条件：铜片白磷/红磷 + 水中白磷通氧——三条件缺一不可
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, cylinderBetween, damp, disposeObject, makeLabel, std } from '../three-utils';

const GLASS = (op = 0.26) =>
  std('#dbeafe', { transparent: true, opacity: op, side: THREE.DoubleSide, roughness: 0.15 });

interface Puff {
  mesh: THREE.Mesh;
  life: number;
  speed: number;
}

export const combustionScene: Scene3DDefinition = {
  id: 'chem-combustion',
  title: '燃烧的条件',
  subject: '化学',
  grade: '9上',
  icon: '🔥',
  tagline: '可燃物、氧气、温度达到着火点——三个条件缺一不可',
  keywords: ['燃烧', '着火点', '可燃物', '氧气', '灭火', '白磷', '红磷', '自燃'],
  camera: { position: [5.5, 4.5, 10], target: [0.2, 1.7, 0] },
  controls: [
    { kind: 'button', id: 'heat', label: '🔥 加热到 80℃' },
    { kind: 'button', id: 'oxygen', label: '💨 向水中通氧气' },
    { kind: 'button', id: 'reset', label: '↺ 重置' },
  ],
  steps: [
    {
      title: '什么是燃烧',
      text: '燃烧是发光、放热的剧烈氧化反应。铜片左边放白磷、右边放红磷，热水底还有一块白磷——它们都是可燃物。到底谁烧得起来？点"加热"，仔细对比三处的现象。',
    },
    {
      title: '温度到着火点',
      text: '热水把铜片加热到八十摄氏度：白磷的着火点只有四十度，温度够了，轰地烧起来，冒出大量白烟；红磷的着火点是二百四十度，温度远远不够，纹丝不动。这说明：温度必须达到可燃物的着火点。',
    },
    {
      title: '必须与氧气接触',
      text: '水下的白磷，温度早就超过四十度了，为什么不着？因为它被水包围，接触不到氧气。现在往水里通氧气——看，白磷在水下烧起来了！所以燃烧还必须与氧气接触。三个条件，缺一不可。',
    },
    {
      title: '灭火原理',
      text: '三个条件凑齐才能燃烧，反过来，灭火只要破坏任意一条：清除可燃物、隔绝氧气、或者降温到着火点以下。盖上锅盖灭油锅火是隔绝氧气，用水浇灭是降温，森林大火打隔离带是清除可燃物。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 14);
    const root = new THREE.Group();
    ctx.scene.add(root);
    let step = 0;
    let heated = false;
    let o2 = false;
    let heatT = -1; // 加热后的计时
    let copperBurn = false; // 铜片白磷已点燃
    let uwBurn = false; // 水下白磷已点燃
    let covered = false; // 第 4 步隔绝空气

    // ---- 烧杯 + 热水 ----
    const beaker = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.55, 1.8, 32, 1, true), GLASS());
    beaker.position.set(0, 0.9, 0);
    root.add(beaker);
    const beakerBottom = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, 0.06, 32), GLASS(0.4));
    beakerBottom.position.set(0, 0.03, 0);
    root.add(beakerBottom);
    const waterMat = std('#38bdf8', { transparent: true, opacity: 0.45, roughness: 0.2 });
    const water = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.45, 1.1, 28), waterMat);
    water.position.set(0, 0.62, 0);
    root.add(water);
    const hotLabel = makeLabel('热水 80℃', { fontSize: 36, scale: 0.85, color: '#b45309' });
    hotLabel.position.set(-1.9, 0.8, 0.6);
    hotLabel.visible = false;
    root.add(hotLabel);

    // ---- 铜片 + 白磷 / 红磷 ----
    const plateMat = std('#c2703e', { metalness: 0.5, roughness: 0.4, emissive: '#7c2d12', emissiveIntensity: 0 });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.07, 0.95), plateMat);
    plate.position.set(0, 1.85, 0);
    root.add(plate);
    const plateLabel = makeLabel('铜片（导热）', { fontSize: 34, scale: 0.78 });
    plateLabel.position.set(0, 2.6, -0.7);
    root.add(plateLabel);
    const pWhite = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), std('#fef9c3'));
    pWhite.scale.y = 0.6;
    pWhite.position.set(-1.2, 1.95, 0);
    root.add(pWhite);
    const pWhiteLabel = makeLabel('白磷 着火点40℃', { fontSize: 32, scale: 0.75, color: '#a16207' });
    pWhiteLabel.position.set(-1.2, 2.65, 0.5);
    root.add(pWhiteLabel);
    const pRed = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), std('#b91c1c'));
    pRed.scale.y = 0.6;
    pRed.position.set(1.2, 1.95, 0);
    root.add(pRed);
    const pRedLabel = makeLabel('红磷 着火点240℃：温度没到，不着', { fontSize: 32, scale: 0.75, color: '#b91c1c' });
    pRedLabel.position.set(1.35, 2.65, 0.5);
    pRedLabel.visible = false;
    root.add(pRedLabel);
    // 水中白磷
    const pWater = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), std('#fef9c3'));
    pWater.scale.y = 0.6;
    pWater.position.set(0.15, 0.22, 0.45);
    root.add(pWater);
    const pWaterLabel = makeLabel('水中白磷：没有氧气，不着', { fontSize: 32, scale: 0.75, color: '#0369a1' });
    pWaterLabel.position.set(0.15, 0.75, 1.15);
    pWaterLabel.visible = false;
    root.add(pWaterLabel);

    // ---- 铜片白磷火焰 + 白烟 ----
    const flame = new THREE.Group();
    flame.position.set(-1.2, 2.25, 0);
    flame.visible = false;
    root.add(flame);
    const fOut = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.65, 12),
      std('#f97316', { emissive: '#ea580c', emissiveIntensity: 1.4, transparent: true, opacity: 0.92 }),
    );
    flame.add(fOut);
    const fIn = new THREE.Mesh(
      new THREE.ConeGeometry(0.11, 0.38, 10),
      std('#fde047', { emissive: '#facc15', emissiveIntensity: 1.7, transparent: true, opacity: 0.95 }),
    );
    fIn.position.y = -0.05;
    flame.add(fIn);
    const smokeGeo = new THREE.SphereGeometry(0.08, 8, 6);
    const smokeMat = std('#f8fafc', { transparent: true, opacity: 0.7, roughness: 0.9 });
    const smokes: Puff[] = [];
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(smokeGeo, smokeMat);
      m.visible = false;
      root.add(m);
      smokes.push({ mesh: m, life: 1, speed: 0.6 + (i % 5) * 0.1 });
    }
    let smokeTimer = 0;

    // ---- 通氧管 + 水下气泡 ----
    const tubeMat = std('#94a3b8');
    root.add(cylinderBetween(new THREE.Vector3(2.5, 2.6, 0.9), new THREE.Vector3(1.2, 1.3, 0.7), 0.05, tubeMat));
    root.add(cylinderBetween(new THREE.Vector3(1.2, 1.3, 0.7), new THREE.Vector3(0.2, 0.4, 0.45), 0.05, tubeMat));
    const o2TubeLabel = makeLabel('通入氧气', { fontSize: 34, scale: 0.8, color: '#0369a1' });
    o2TubeLabel.position.set(2.6, 3, 0.9);
    o2TubeLabel.visible = false;
    root.add(o2TubeLabel);
    const bubbleGeo = new THREE.SphereGeometry(0.06, 8, 6);
    const bubbleMat = std('#e0f2fe', { transparent: true, opacity: 0.85 });
    const bubbles: Puff[] = [];
    for (let i = 0; i < 22; i++) {
      const m = new THREE.Mesh(bubbleGeo, bubbleMat);
      m.visible = false;
      root.add(m);
      bubbles.push({ mesh: m, life: 1, speed: 0.8 + (i % 4) * 0.12 });
    }
    let bubbleTimer = 0;
    // 水下燃烧火光
    const uwFlame = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 14, 10),
      std('#fdba74', { emissive: '#f97316', emissiveIntensity: 2, transparent: true, opacity: 0.9 }),
    );
    uwFlame.position.set(0.15, 0.4, 0.45);
    uwFlame.visible = false;
    root.add(uwFlame);
    const uwLabel = makeLabel('水下燃烧！三条件凑齐了', { fontSize: 40, scale: 0.95, color: '#b91c1c' });
    uwLabel.position.set(0.15, 1.45, 1.1);
    uwLabel.visible = false;
    root.add(uwLabel);

    // ---- 蒸汽 ----
    const steams: Puff[] = [];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(smokeGeo, smokeMat);
      m.visible = false;
      root.add(m);
      steams.push({ mesh: m, life: 1, speed: 0.35 + (i % 3) * 0.08 });
    }
    let steamTimer = 0;

    // ---- 三条件清单（灰 → 绿✓）----
    const items: { pending: THREE.Sprite; done: THREE.Sprite }[] = [];
    ['① 可燃物', '② 与氧气接触', '③ 温度达到着火点'].forEach((txt, k) => {
      const pending = makeLabel(txt, { fontSize: 38, scale: 0.88, color: '#64748b' });
      pending.position.set(3.3, 3.1 - k * 0.62, 0);
      root.add(pending);
      const done = makeLabel(`${txt} ✓`, { fontSize: 38, scale: 0.88, color: '#15803d' });
      done.position.set(3.3, 3.1 - k * 0.62, 0);
      done.visible = false;
      root.add(done);
      items.push({ pending, done });
    });
    const checklistTitle = makeLabel('燃烧三条件', { fontSize: 40, scale: 0.95 });
    checklistTitle.position.set(3.3, 3.85, 0);
    root.add(checklistTitle);

    // ---- 第 4 步：隔绝空气灭火 ----
    const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.8, 20, 1, true), GLASS(0.35));
    cover.position.set(-1.2, 3.4, 0);
    cover.visible = false;
    root.add(cover);
    const coverLabel = makeLabel('罩住：隔绝氧气，火灭', { fontSize: 38, scale: 0.9, color: '#b45309' });
    coverLabel.position.set(-1.2, 3.6, 0.8);
    coverLabel.visible = false;
    root.add(coverLabel);
    const methodLabel = makeLabel('灭火：清可燃物 / 隔氧气 / 降温', { fontSize: 40, scale: 0.95, color: '#1d4ed8' });
    methodLabel.position.set(0, 4.4, 0);
    methodLabel.visible = false;
    root.add(methodLabel);

    const title = makeLabel('燃烧的条件（对比实验）', { fontSize: 42, scale: 1 });
    title.position.set(0, 5.1, 0);
    root.add(title);

    const reset = () => {
      heated = false;
      o2 = false;
      heatT = -1;
      copperBurn = false;
      uwBurn = false;
      covered = false;
      flame.visible = false;
      uwFlame.visible = false;
      cover.visible = false;
      smokes.forEach((s) => {
        s.life = 1;
        s.mesh.visible = false;
      });
      bubbles.forEach((b) => {
        b.life = 1;
        b.mesh.visible = false;
      });
      steams.forEach((s) => {
        s.life = 1;
        s.mesh.visible = false;
      });
      applyState();
    };
    const applyState = () => {
      hotLabel.visible = heated;
      pRedLabel.visible = heated && !copperBurn;
      pWaterLabel.visible = heated && !uwBurn;
      o2TubeLabel.visible = o2;
      uwLabel.visible = uwBurn;
      items[0].done.visible = copperBurn;
      items[0].pending.visible = !copperBurn;
      items[2].done.visible = copperBurn;
      items[2].pending.visible = !copperBurn;
      items[1].done.visible = uwBurn;
      items[1].pending.visible = !uwBurn;
      coverLabel.visible = covered;
      methodLabel.visible = step >= 3;
    };
    applyState();

    const heat = () => {
      if (!heated) {
        heated = true;
        heatT = 0;
        applyState();
      }
    };
    const oxygen = () => {
      if (!o2) {
        o2 = true;
        if (heated) uwBurn = true;
        applyState();
      }
    };

    return {
      setStep(i) {
        step = i;
        if (i === 1) heat();
        if (i === 2) {
          heat();
          oxygen();
        }
        if (i >= 3) {
          covered = true;
          cover.visible = true;
          uwBurn = false;
        } else {
          covered = false;
          cover.visible = false;
        }
        applyState();
      },
      setParam(id) {
        if (id === 'heat') heat();
        if (id === 'oxygen') oxygen();
        if (id === 'reset') reset();
      },
      update(dt, elapsed) {
        // 加热计时：1.2 秒后铜片白磷点燃
        if (heatT >= 0) {
          heatT += dt;
          plateMat.emissiveIntensity = Math.min(heatT * 0.4, 0.5);
          if (heatT > 1.2 && !copperBurn) {
            copperBurn = true;
            flame.visible = true;
            applyState();
          }
        }
        // 铜片火焰 + 白烟
        if (flame.visible) {
          if (covered) {
            // 被罩住：缺氧熄灭
            flame.scale.multiplyScalar(Math.max(1 - dt * 2.5, 0.01));
            if (flame.scale.x < 0.06) flame.visible = false;
          } else {
            const f = 1 + Math.sin(elapsed * 17) * 0.12 + Math.sin(elapsed * 27) * 0.07;
            flame.scale.set(f, 1 + Math.sin(elapsed * 23) * 0.15, f);
            smokeTimer += dt;
            if (smokeTimer > 0.1) {
              smokeTimer = 0;
              const s = smokes.find((x) => x.life >= 1);
              if (s) {
                s.life = 0;
                s.mesh.visible = true;
                s.mesh.position.set(-1.2 + (Math.random() - 0.5) * 0.25, 2.55, (Math.random() - 0.5) * 0.25);
                s.mesh.scale.setScalar(0.7 + Math.random() * 0.5);
              }
            }
          }
        }
        smokes.forEach((s) => {
          if (s.life >= 1) return;
          s.life += dt * 0.4;
          s.mesh.position.y += dt * s.speed;
          s.mesh.scale.multiplyScalar(1 + dt * 0.3);
          if (s.life >= 1) s.mesh.visible = false;
        });
        // 罩子下降动画
        if (cover.visible) {
          cover.position.y = damp(cover.position.y, 2.3, 2.2, dt);
        }
        // 蒸汽
        if (heated) {
          steamTimer += dt;
          if (steamTimer > 0.25) {
            steamTimer = 0;
            const s = steams.find((x) => x.life >= 1);
            if (s) {
              s.life = 0;
              s.mesh.visible = true;
              s.mesh.position.set((Math.random() - 0.5) * 2.4, 1.2, (Math.random() - 0.5) * 1.8 + 0.6);
              s.mesh.scale.setScalar(0.5 + Math.random() * 0.4);
            }
          }
        }
        steams.forEach((s) => {
          if (s.life >= 1) return;
          s.life += dt * 0.5;
          s.mesh.position.y += dt * s.speed;
          if (s.mesh.position.y > 1.8 || s.life >= 1) {
            s.life = 1;
            s.mesh.visible = false;
          }
        });
        // 通氧气泡
        if (o2) {
          bubbleTimer += dt;
          if (bubbleTimer > 0.13) {
            bubbleTimer = 0;
            const b = bubbles.find((x) => x.life >= 1);
            if (b) {
              b.life = 0;
              b.mesh.visible = true;
              b.mesh.position.set(0.2 + (Math.random() - 0.5) * 0.2, 0.42, 0.45 + (Math.random() - 0.5) * 0.2);
              b.mesh.scale.setScalar(0.6 + Math.random() * (uwBurn ? 1.3 : 0.6));
            }
          }
        }
        bubbles.forEach((b) => {
          if (b.life >= 1) return;
          b.life += dt * 0.55;
          b.mesh.position.y += dt * b.speed;
          if (b.mesh.position.y > 1.15 || b.life >= 1) {
            b.life = 1;
            b.mesh.visible = false;
          }
        });
        // 水下燃烧火光
        if (uwBurn && !covered) {
          uwFlame.visible = true;
          const f = 1 + Math.sin(elapsed * 15) * 0.15 + Math.sin(elapsed * 26) * 0.08;
          uwFlame.scale.setScalar(f);
        } else {
          uwFlame.visible = false;
        }
      },
      dispose() {
        ctx.scene.remove(root);
        disposeObject(root);
      },
    };
  },
};
