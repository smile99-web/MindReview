// ---------------------------------------------------------------------------
// 化学 · 酸碱与中和反应：石蕊变色、pH 色带、氢离子与氢氧根结合成水（放热）
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, damp, disposeObject, makeLabel, std } from '../three-utils';

type LiquidKey = 'vinegar' | 'soap' | 'salt';
const LIQUIDS: Record<LiquidKey, { name: string; ph: number; result: string; color: string; resultColor: string }> = {
  vinegar: { name: '白醋（酸性）', ph: 3, result: '石蕊变红 → 酸性', color: '#ef4444', resultColor: '#b91c1c' },
  soap: { name: '肥皂水（碱性）', ph: 10, result: '石蕊变蓝 → 碱性', color: '#3b82f6', resultColor: '#1d4ed8' },
  salt: { name: '食盐水（中性）', ph: 7, result: '还是紫色 → 中性', color: '#a855f7', resultColor: '#7e22ce' },
};
const N_PAIR = 6;
const BAND_X0 = -2.94; // pH 色带左端
const BAND_W = 0.42;
const LIQUID_COLORS: Record<LiquidKey, THREE.Color> = {
  vinegar: new THREE.Color(LIQUIDS.vinegar.color),
  soap: new THREE.Color(LIQUIDS.soap.color),
  salt: new THREE.Color(LIQUIDS.salt.color),
};

interface Ion {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
}
interface Pair {
  h: Ion; // 氢离子（红）
  oh: Ion; // 氢氧根（蓝绿）
  water: THREE.Group;
  state: 'drift' | 'merge' | 'done';
  t: number;
  startH: THREE.Vector3;
  startOH: THREE.Vector3;
  mid: THREE.Vector3;
}

export const acidBaseScene: Scene3DDefinition = {
  id: 'chem-acid-base',
  title: '酸碱与中和反应',
  subject: '化学',
  grade: '9下',
  icon: '🧪',
  tagline: '石蕊遇酸变红遇碱变蓝；中和的本质是氢离子遇上氢氧根',
  keywords: ['酸', '碱', '酸碱指示剂', 'pH', '中和反应', '石蕊', '酚酞', '盐酸', '氢氧化钠', '酸碱度'],
  camera: { position: [6.5, 5.5, 10], target: [0, 2.2, 0] },
  controls: [
    {
      kind: 'select',
      id: 'liquid',
      label: '待测液体',
      options: [
        { value: 'vinegar', label: '白醋（酸）' },
        { value: 'soap', label: '肥皂水（碱）' },
        { value: 'salt', label: '食盐水（中性）' },
      ],
      defaultValue: 'vinegar',
    },
    { kind: 'button', id: 'indicator', label: '💧 滴入紫色石蕊' },
    { kind: 'button', id: 'neutralize', label: '⚗️ 演示中和反应' },
  ],
  steps: [
    {
      title: '酸碱指示剂',
      text: '怎么判断一种溶液是酸还是碱？用酸碱指示剂。看试管：滴入紫色石蕊后，酸性溶液让它变红，碱性溶液让它变蓝，中性溶液里它还是紫色。还有一种指示剂叫酚酞，它遇到碱性溶液会变红。换几种液体试试看。',
    },
    {
      title: '酸碱度 pH',
      text: '酸碱的强弱程度用 pH 表示，范围是零到十四。看上面的色带：pH 小于 7 是酸性，越小越酸；等于 7 是中性；大于 7 是碱性，越大碱性越强。白醋大约是 3，肥皂水大约是 10，食盐水正好是 7。',
    },
    {
      title: '中和的本质',
      text: '酸和碱碰到一起会怎样？看右边烧杯里的微观世界：红色小球是氢离子，蓝绿色小球是氢氧根离子。它们两两结合，变成水分子。酸加碱生成盐和水，叫中和反应，本质就是氢离子和氢氧根离子结合成水。',
    },
    {
      title: '中和反应的应用',
      text: '中和反应还会放热，看温度计的红色液柱升上去了。生活中到处用得到：土壤太酸，撒些熟石灰来中和；胃酸过多，吃含氢氧化铝的胃药；被蚊虫叮了涂点弱碱性的肥皂水，也是这个道理。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 14);
    let step = 0;
    let liquidKey: LiquidKey = 'vinegar';
    let dropped = false; // 石蕊是否已滴入
    let dropT = -1; // 滴落动画计时（<0 表示未开始）
    let colorMix = 0; // 0 未变色 → 1 已变色
    let pointerX = BAND_X0 + (3 - 1) * BAND_W;
    let reactionRunning = false;
    let reactionT = 0;
    let tempMix = 0;

    const group = new THREE.Group();
    ctx.scene.add(group);
    const glassMat = std('#dbeafe', {
      transparent: true,
      opacity: 0.26,
      side: THREE.DoubleSide,
      roughness: 0.12,
      metalness: 0,
    });

    // ============================= 左侧：试管 + 石蕊 =============================
    const tubeGroup = new THREE.Group();
    tubeGroup.position.set(-2.4, 0, 0);
    group.add(tubeGroup);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 2.1, 22), glassMat);
    tube.position.y = 1.35;
    tubeGroup.add(tube);
    const tubeBottom = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 22, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      glassMat,
    );
    tubeBottom.position.y = 0.3;
    tubeGroup.add(tubeBottom);
    // 液体（颜色随指示剂变化）
    const liqBase = new THREE.Color('#e2e8f0');
    const liqMat = std('#e2e8f0', { transparent: true, opacity: 0.65, roughness: 0.15 });
    const liq = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 1.35, 20), liqMat);
    liq.position.y = 1.0;
    tubeGroup.add(liq);
    // 胶头滴管 + 下落的石蕊液滴
    const dropper = new THREE.Group();
    const dpBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.03, 0.7, 10),
      std('#e2e8f0', { transparent: true, opacity: 0.6 }),
    );
    dropper.add(dpBody);
    const dpHead = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), std('#7e22ce'));
    dpHead.position.y = 0.45;
    dropper.add(dpHead);
    dropper.position.set(0, 3.1, 0);
    tubeGroup.add(dropper);
    const drop = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), std('#a855f7', { emissive: '#7e22ce', emissiveIntensity: 0.5 }));
    drop.visible = false;
    tubeGroup.add(drop);

    const liqNameLabels: Record<LiquidKey, THREE.Sprite> = {} as Record<LiquidKey, THREE.Sprite>;
    (Object.keys(LIQUIDS) as LiquidKey[]).forEach((k) => {
      const s = makeLabel(LIQUIDS[k].name, { fontSize: 38, scale: 0.9 });
      s.position.set(0, 3.9, 0);
      s.visible = false;
      tubeGroup.add(s);
      liqNameLabels[k] = s;
    });
    const resultLabels: Record<LiquidKey, THREE.Sprite> = {} as Record<LiquidKey, THREE.Sprite>;
    (Object.keys(LIQUIDS) as LiquidKey[]).forEach((k) => {
      const s = makeLabel(LIQUIDS[k].result, { fontSize: 36, scale: 0.85, color: LIQUIDS[k].resultColor });
      s.position.set(0, 0.0 - 0.35, 0.2);
      s.visible = false;
      tubeGroup.add(s);
      resultLabels[k] = s;
    });
    const litmusLabel = makeLabel('💧 紫色石蕊试液', { fontSize: 32, scale: 0.75, color: '#7e22ce' });
    litmusLabel.position.set(1.1, 3.4, 0);
    tubeGroup.add(litmusLabel);

    // ============================= 顶部：pH 色带 =============================
    const bandGroup = new THREE.Group();
    bandGroup.position.set(0.3, 4.6, -0.5);
    group.add(bandGroup);
    for (let i = 0; i < 14; i++) {
      const c = new THREE.Color().setHSL((i / 13) * 0.78, 0.8, 0.55);
      const box = new THREE.Mesh(new THREE.BoxGeometry(BAND_W * 0.94, 0.3, 0.06), std(c.getHex(), { roughness: 0.4 }));
      box.position.set(BAND_X0 + i * BAND_W, 0, 0);
      bandGroup.add(box);
    }
    const ph1 = makeLabel('1', { fontSize: 32, scale: 0.65 });
    ph1.position.set(BAND_X0, -0.5, 0);
    bandGroup.add(ph1);
    const ph7 = makeLabel('7', { fontSize: 32, scale: 0.65 });
    ph7.position.set(BAND_X0 + 6 * BAND_W, -0.5, 0);
    bandGroup.add(ph7);
    const ph14 = makeLabel('14', { fontSize: 32, scale: 0.65 });
    ph14.position.set(BAND_X0 + 13 * BAND_W, -0.5, 0);
    bandGroup.add(ph14);
    const acidSide = makeLabel('← 酸性强', { fontSize: 30, scale: 0.7, color: '#b91c1c' });
    acidSide.position.set(BAND_X0 + 1.2, -0.95, 0);
    bandGroup.add(acidSide);
    const midSide = makeLabel('中性', { fontSize: 30, scale: 0.7, color: '#7e22ce' });
    midSide.position.set(BAND_X0 + 6 * BAND_W, -0.95, 0);
    bandGroup.add(midSide);
    const baseSide = makeLabel('碱性强 →', { fontSize: 30, scale: 0.7, color: '#1d4ed8' });
    baseSide.position.set(BAND_X0 + 11.5 * BAND_W, -0.95, 0);
    bandGroup.add(baseSide);
    const phTitle = makeLabel('pH 色带', { fontSize: 32, scale: 0.75, color: '#334155' });
    phTitle.position.set(BAND_X0 - 1.2, 0, 0);
    bandGroup.add(phTitle);
    // 指针
    const pointer = new THREE.Mesh(
      new THREE.ConeGeometry(0.14, 0.34, 4),
      std('#0f172a', { emissive: '#0f172a', emissiveIntensity: 0.2 }),
    );
    pointer.rotation.x = Math.PI;
    pointer.position.set(pointerX, 0.45, 0);
    bandGroup.add(pointer);

    // ============================= 右侧：中和微观烧杯 =============================
    const microGroup = new THREE.Group();
    microGroup.position.set(2.6, 0, 0);
    group.add(microGroup);
    const beaker = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 1.9, 26), glassMat);
    beaker.position.y = 0.95;
    microGroup.add(beaker);
    const microLiq = new THREE.Mesh(
      new THREE.CylinderGeometry(0.86, 0.86, 1.5, 26),
      std('#bfdbfe', { transparent: true, opacity: 0.4, roughness: 0.15 }),
    );
    microLiq.position.y = 0.85;
    microGroup.add(microLiq);

    const hGeo = new THREE.SphereGeometry(0.11, 12, 10);
    const ohGeo = new THREE.SphereGeometry(0.13, 12, 10);
    const hMat = std('#ef4444', { emissive: '#b91c1c', emissiveIntensity: 0.4 });
    const ohMat = std('#2dd4bf', { emissive: '#0f766e', emissiveIntensity: 0.4 });
    const oMat = std('#f8fafc', { emissive: '#cbd5e1', emissiveIntensity: 0.3 });

    const mkWater = (): THREE.Group => {
      const w = new THREE.Group();
      const o = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), oMat);
      w.add(o);
      const h1 = new THREE.Mesh(hGeo, hMat);
      h1.position.set(-0.13, 0.1, 0);
      const h2 = new THREE.Mesh(hGeo, hMat);
      h2.position.set(0.13, 0.1, 0);
      w.add(h1, h2);
      w.visible = false;
      return w;
    };

    const pairs: Pair[] = [];
    for (let i = 0; i < N_PAIR; i++) {
      const hMesh = new THREE.Mesh(hGeo, hMat);
      const ohMesh = new THREE.Mesh(ohGeo, ohMat);
      const water = mkWater();
      microGroup.add(hMesh, ohMesh, water);
      pairs.push({
        h: { mesh: hMesh, vel: new THREE.Vector3() },
        oh: { mesh: ohMesh, vel: new THREE.Vector3() },
        water,
        state: 'drift',
        t: 0,
        startH: new THREE.Vector3(),
        startOH: new THREE.Vector3(),
        mid: new THREE.Vector3(),
      });
    }
    const scatterIons = () => {
      pairs.forEach((p) => {
        p.state = 'drift';
        p.t = 0;
        p.h.mesh.visible = true;
        p.oh.mesh.visible = true;
        p.water.visible = false;
        const place = (m: THREE.Mesh) =>
          m.position.set((Math.random() - 0.5) * 1.2, 0.35 + Math.random() * 1.1, (Math.random() - 0.5) * 1.2);
        place(p.h.mesh);
        place(p.oh.mesh);
        p.h.vel.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        p.oh.vel.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      });
    };
    scatterIons();

    const hLabel = makeLabel('氢离子（酸）', { fontSize: 30, scale: 0.72, color: '#b91c1c' });
    hLabel.position.set(-1.3, 2.35, 0);
    microGroup.add(hLabel);
    const ohLabel = makeLabel('氢氧根离子（碱）', { fontSize: 30, scale: 0.72, color: '#0f766e' });
    ohLabel.position.set(1.3, 2.35, 0);
    microGroup.add(ohLabel);
    const waterLabel = makeLabel('结合成水分子', { fontSize: 32, scale: 0.78, color: '#0369a1' });
    waterLabel.position.set(0, 2.9, 0);
    waterLabel.visible = false;
    microGroup.add(waterLabel);

    // 温度计
    const thermo = new THREE.Group();
    const thermoTube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 1.5, 10),
      std('#e2e8f0', { transparent: true, opacity: 0.5 }),
    );
    thermoTube.position.y = 0.85;
    thermo.add(thermoTube);
    const thermoColGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.3, 8);
    thermoColGeo.translate(0, 0.65, 0);
    const thermoCol = new THREE.Mesh(thermoColGeo, std('#dc2626', { emissive: '#dc2626', emissiveIntensity: 0.4 }));
    thermoCol.position.y = 0.2;
    thermoCol.scale.y = 0.15;
    thermo.add(thermoCol);
    const thermoBulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), std('#dc2626'));
    thermoBulb.position.y = 0.18;
    thermo.add(thermoBulb);
    thermo.position.set(1.35, 0.1, 0);
    microGroup.add(thermo);
    const heatLabel = makeLabel('反应放热，温度升高', { fontSize: 30, scale: 0.75, color: '#c2410c' });
    heatLabel.position.set(1.35, 2.0, 0);
    heatLabel.visible = false;
    microGroup.add(heatLabel);

    // 应用标签（第 4 步）
    const app1 = makeLabel('✔ 熟石灰改良酸性土壤', { fontSize: 34, scale: 0.85, color: '#15803d' });
    app1.position.set(-0.6, 5.9, 0);
    app1.visible = false;
    group.add(app1);
    const app2 = makeLabel('✔ 胃药里的氢氧化铝', { fontSize: 34, scale: 0.85, color: '#15803d' });
    app2.position.set(-0.6, 6.5, 0);
    app2.visible = false;
    group.add(app2);

    // ============================= 状态刷新 =============================
    const refreshLiquidLabels = () => {
      (Object.keys(LIQUIDS) as LiquidKey[]).forEach((k) => {
        liqNameLabels[k].visible = k === liquidKey;
        resultLabels[k].visible = k === liquidKey && dropped && colorMix > 0.7;
      });
    };
    const startDrop = () => {
      if (dropT >= 0) return;
      dropT = 0;
      dropped = true;
      drop.visible = true;
      drop.position.set(0, 2.7, 0);
    };
    const startReaction = () => {
      scatterIons();
      reactionRunning = true;
      reactionT = 0;
      tempMix = 0;
    };
    refreshLiquidLabels();

    return {
      setStep(i) {
        step = i;
        if (i === 0) startDrop();
        if (i === 2) startReaction();
        app1.visible = i >= 3;
        app2.visible = i >= 3;
        refreshLiquidLabels();
      },
      setParam(id, value) {
        if (id === 'liquid') {
          liquidKey = (String(value) as LiquidKey) in LIQUIDS ? (String(value) as LiquidKey) : 'vinegar';
          dropped = false;
          colorMix = 0;
          dropT = -1;
          drop.visible = false;
        } else if (id === 'indicator') {
          startDrop();
        } else if (id === 'neutralize') {
          startReaction();
        }
        refreshLiquidLabels();
      },
      update(dt, elapsed) {
        // 石蕊滴落 → 液体变色
        if (dropT >= 0) {
          dropT += dt;
          drop.position.y = 2.7 - dropT * 3.2;
          if (drop.position.y <= 1.6) {
            drop.visible = false;
            dropT = -1;
          }
        }
        if (dropped && !drop.visible) colorMix = Math.min(1, colorMix + dt / 1.2);
        liqMat.color.lerpColors(liqBase, LIQUID_COLORS[liquidKey], colorMix * 0.85);
        refreshLiquidLabels();

        // pH 指针平滑移动
        const targetX = BAND_X0 + (LIQUIDS[liquidKey].ph - 1) * BAND_W;
        pointerX = damp(pointerX, targetX, 4, dt);
        pointer.position.x = pointerX;
        pointer.rotation.y = step === 1 ? Math.sin(elapsed * 4) * 0.25 : 0;

        // 离子漂移 / 两两结合成水
        if (reactionRunning) reactionT += dt;
        let doneCount = 0;
        pairs.forEach((p, i) => {
          const drift = (ion: Ion, k: number) => {
            ion.mesh.position.addScaledVector(ion.vel, k * dt);
            const pos = ion.mesh.position;
            if (pos.y < 0.3 || pos.y > 1.55) {
              ion.vel.y *= -1;
              pos.y = THREE.MathUtils.clamp(pos.y, 0.3, 1.55);
            }
            const rr = Math.hypot(pos.x, pos.z);
            if (rr > 0.68) {
              ion.vel.x *= -1;
              ion.vel.z *= -1;
              pos.x *= 0.68 / rr;
              pos.z *= 0.68 / rr;
            }
          };
          if (p.state === 'drift') {
            drift(p.h, 0.5);
            drift(p.oh, 0.5);
            if (reactionRunning && reactionT > i * 0.7) {
              p.state = 'merge';
              p.t = 0;
              p.startH.copy(p.h.mesh.position);
              p.startOH.copy(p.oh.mesh.position);
              p.mid.addVectors(p.startH, p.startOH).multiplyScalar(0.5);
            }
          } else if (p.state === 'merge') {
            p.t += dt;
            const k = Math.min(1, p.t / 0.8);
            p.h.mesh.position.lerpVectors(p.startH, p.mid, k);
            p.oh.mesh.position.lerpVectors(p.startOH, p.mid, k);
            if (k >= 1) {
              p.state = 'done';
              p.h.mesh.visible = false;
              p.oh.mesh.visible = false;
              p.water.visible = true;
              p.water.position.copy(p.mid);
            }
          } else {
            doneCount += 1;
            p.water.position.y += Math.sin(elapsed * 1.5 + i) * 0.0015;
            p.water.rotation.y += dt * 0.6;
          }
        });
        waterLabel.visible = doneCount > 0 && doneCount < N_PAIR;
        if (doneCount >= N_PAIR && reactionRunning) reactionRunning = false;

        // 温度计随反应进度上升
        tempMix = damp(tempMix, doneCount / N_PAIR, 2, dt);
        thermoCol.scale.y = 0.15 + tempMix * 0.85;
        heatLabel.visible = tempMix > 0.5;
      },
      dispose() {
        ctx.scene.remove(group);
        disposeObject(group);
      },
    };
  },
};
