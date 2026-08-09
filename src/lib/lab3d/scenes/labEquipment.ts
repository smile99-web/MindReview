// ---------------------------------------------------------------------------
// 化学 · 常见仪器与基本操作：试管/烧杯/酒精灯/量筒/胶头滴管的正确用法
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, cylinderBetween, disposeObject, makeLabel, std } from '../three-utils';

type ToolKey = 'tube' | 'beaker' | 'alcohol' | 'cylinder' | 'dropper';
const TOOL_X: Record<ToolKey, number> = { tube: -4, beaker: -2, alcohol: 0, cylinder: 2, dropper: 4 };
const TOOL_USAGE: Record<ToolKey, string> = {
  tube: '试管：少量试剂的反应容器，可直接加热',
  beaker: '烧杯：配制溶液、较多量反应容器',
  alcohol: '酒精灯：实验室常用的加热热源',
  cylinder: '量筒：量取一定体积的液体',
  dropper: '胶头滴管：吸取和滴加少量液体',
};
const BENCH_Y = 1.0; // 台面高度
const WATER_COOL = new THREE.Color('#93c5fd');
const WATER_WARM = new THREE.Color('#fca5a5');

/** 0→1 平滑过渡 */
const s01 = (v: number) => {
  const k = THREE.MathUtils.clamp(v, 0, 1);
  return k * k * (3 - 2 * k);
};

export const labEquipmentScene: Scene3DDefinition = {
  id: 'chem-lab',
  title: '常见仪器与基本操作',
  subject: '化学',
  grade: '9上',
  icon: '🥼',
  tagline: '试管、烧杯、酒精灯、量筒、滴管——实验室主角的正确用法',
  keywords: ['实验仪器', '试管', '烧杯', '酒精灯', '量筒', '胶头滴管', '加热', '实验操作', '仪器'],
  camera: { position: [6, 4.8, 9.5], target: [0, 1.9, 0] },
  controls: [
    {
      kind: 'select',
      id: 'tool',
      label: '仪器',
      options: [
        { value: 'tube', label: '试管' },
        { value: 'beaker', label: '烧杯' },
        { value: 'alcohol', label: '酒精灯' },
        { value: 'cylinder', label: '量筒' },
        { value: 'dropper', label: '胶头滴管' },
      ],
      defaultValue: 'alcohol',
    },
    { kind: 'button', id: 'demo', label: '▶ 演示正确操作' },
  ],
  steps: [
    {
      title: '认识五件仪器',
      text: '实验台上这五位是化学实验室的主角：试管、烧杯、酒精灯、量筒和胶头滴管。试管做少量试剂的反应，烧杯用来配制溶液，酒精灯负责加热，量筒量取液体体积，滴管吸取和滴加少量液体。',
    },
    {
      title: '酒精灯的使用',
      text: '酒精灯的火焰分三层，外焰温度最高，加热要用外焰。熄灭时绝对不能用嘴吹！正确做法是用灯帽盖灭；盖灭之后提起来，再盖一次，防止灯帽里面气压变小，下次拔不开。',
    },
    {
      title: '给试管加热',
      text: '给试管里的液体加热有三条铁律：液体体积不超过试管容积的三分之一，防止沸腾时喷溅伤人；试管倾斜约四十五度，受热更均匀；管口千万不能对着自己或别人。',
    },
    {
      title: '量筒与滴管',
      text: '量筒读数时，视线要与凹液面的最低处保持水平；俯视会读大，仰视会读小，记住"俯大仰小"。胶头滴管滴加时要竖直悬空在管口正上方，不能伸进试管，也不能碰到管壁，用完及时洗净。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 14);
    let step = 0;
    let tool: ToolKey = 'alcohol';
    let demoT = -1; // 演示计时（<0 未开始）

    const group = new THREE.Group();
    ctx.scene.add(group);
    const glassMat = std('#dbeafe', {
      transparent: true,
      opacity: 0.26,
      side: THREE.DoubleSide,
      roughness: 0.12,
      metalness: 0,
    });

    // ---------------- 实验台 ----------------
    const bench = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.3, 3), std('#d6d3d1', { roughness: 0.85 }));
    bench.position.set(0, BENCH_Y - 0.15, 0);
    group.add(bench);
    [-4.8, 4.8].forEach((x) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, BENCH_Y - 0.3, 2.6), std('#a8a29e', { roughness: 0.85 }));
      leg.position.set(x, (BENCH_Y - 0.3) / 2, 0);
      group.add(leg);
    });

    // 选中光环
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.72, 0.05, 8, 40),
      std('#2dd4bf', { emissive: '#0d9488', emissiveIntensity: 0.8 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(TOOL_X.alcohol, BENCH_Y + 0.03, 0);
    group.add(ring);

    // ---------------- 试管（可倾斜演示） ----------------
    const tubePivot = new THREE.Group();
    tubePivot.position.set(TOOL_X.tube, BENCH_Y + 0.12, 0);
    group.add(tubePivot);
    const tubeMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.5, 20), glassMat);
    tubeMesh.position.y = 0.75;
    tubePivot.add(tubeMesh);
    const tubeBottom = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      glassMat,
    );
    tubePivot.add(tubeBottom);
    const tubeLiqGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.5, 16);
    tubeLiqGeo.translate(0, 0.25, 0);
    const tubeLiq = new THREE.Mesh(tubeLiqGeo, std('#93c5fd', { transparent: true, opacity: 0.65 }));
    tubeLiq.position.y = 0.08;
    tubePivot.add(tubeLiq);
    const tubeRack = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.7), std('#a8a29e'));
    tubeRack.position.set(TOOL_X.tube, BENCH_Y + 0.05, 0);
    group.add(tubeRack);

    // ---------------- 烧杯（垫陶土网加热） ----------------
    const beakerMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.1, 24), glassMat);
    beakerMesh.position.set(TOOL_X.beaker, BENCH_Y + 0.55, 0);
    group.add(beakerMesh);
    const beakWaterMat = std('#93c5fd', { transparent: true, opacity: 0.5 });
    const beakWater = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.7, 24), beakWaterMat);
    beakWater.position.set(TOOL_X.beaker, BENCH_Y + 0.4, 0);
    group.add(beakWater);
    const gauze = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.04, 1.3), std('#78716c', { roughness: 0.9 }));
    gauze.position.set(TOOL_X.beaker, BENCH_Y + 0.02, 0);
    gauze.visible = false;
    group.add(gauze);
    const beakFlameMat = std('#fb923c', { emissive: '#ea580c', emissiveIntensity: 1.1, transparent: true, opacity: 0.9 });
    const beakFlameGeo = new THREE.ConeGeometry(0.13, 0.36, 10);
    beakFlameGeo.translate(0, 0.18, 0);
    const beakFlame = new THREE.Mesh(beakFlameGeo, beakFlameMat);
    beakFlame.position.set(TOOL_X.beaker, BENCH_Y - 0.36, 0);
    beakFlame.visible = false;
    group.add(beakFlame);

    // ---------------- 酒精灯 ----------------
    const lampBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.42, 0.55, 22),
      std('#fbbf24', { transparent: true, opacity: 0.55, roughness: 0.2 }),
    );
    lampBody.position.set(TOOL_X.alcohol, BENCH_Y + 0.28, 0);
    group.add(lampBody);
    const lampNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.14, 14), std('#a8a29e', { metalness: 0.6 }));
    lampNeck.position.set(TOOL_X.alcohol, BENCH_Y + 0.6, 0);
    group.add(lampNeck);
    const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.2, 8), std('#44403c'));
    wick.position.set(TOOL_X.alcohol, BENCH_Y + 0.74, 0);
    group.add(wick);
    const flameGeo = new THREE.ConeGeometry(0.15, 0.5, 14);
    flameGeo.translate(0, 0.25, 0);
    const lampFlameMat = std('#fb923c', { emissive: '#ea580c', emissiveIntensity: 1.3, transparent: true, opacity: 0.92 });
    const lampFlame = new THREE.Mesh(flameGeo, lampFlameMat);
    lampFlame.position.set(TOOL_X.alcohol, BENCH_Y + 0.8, 0);
    lampFlame.scale.setScalar(0.001);
    group.add(lampFlame);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.17, 0.2, 14),
      std('#94a3b8', { metalness: 0.7, roughness: 0.35 }),
    );
    const CAP_REST = new THREE.Vector3(TOOL_X.alcohol + 0.68, BENCH_Y + 0.1, 0);
    const CAP_TOP = new THREE.Vector3(TOOL_X.alcohol, BENCH_Y + 0.86, 0);
    cap.position.copy(CAP_REST);
    group.add(cap);

    // ---------------- 量筒 + 读数视线 ----------------
    const cylMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.9, 20), glassMat);
    cylMesh.position.set(TOOL_X.cylinder, BENCH_Y + 0.95, 0);
    group.add(cylMesh);
    const cylBase = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.08, 20), glassMat);
    cylBase.position.set(TOOL_X.cylinder, BENCH_Y + 0.04, 0);
    group.add(cylBase);
    const cylLiq = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.17, 1.0, 18),
      std('#60a5fa', { transparent: true, opacity: 0.6 }),
    );
    cylLiq.position.set(TOOL_X.cylinder, BENCH_Y + 0.5, 0);
    group.add(cylLiq);
    const meniscus = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.17, 0.03, 18),
      std('#1d4ed8', { transparent: true, opacity: 0.85 }),
    );
    meniscus.position.set(TOOL_X.cylinder, BENCH_Y + 1.0, 0);
    group.add(meniscus);
    const lineMatOk = std('#16a34a', { emissive: '#16a34a', emissiveIntensity: 0.5 });
    const lineMatBad = std('#dc2626', { emissive: '#dc2626', emissiveIntensity: 0.5 });
    const eyeZ = 0.95;
    const okLine = cylinderBetween(
      new THREE.Vector3(0.2, BENCH_Y + 1.0, eyeZ),
      new THREE.Vector3(TOOL_X.cylinder - 0.1, BENCH_Y + 1.0, 0.35),
      0.022,
      lineMatOk,
    );
    const highLine = cylinderBetween(
      new THREE.Vector3(0.2, BENCH_Y + 1.55, eyeZ),
      new THREE.Vector3(TOOL_X.cylinder - 0.1, BENCH_Y + 1.14, 0.35),
      0.022,
      lineMatBad,
    );
    const lowLine = cylinderBetween(
      new THREE.Vector3(0.2, BENCH_Y + 0.45, eyeZ),
      new THREE.Vector3(TOOL_X.cylinder - 0.1, BENCH_Y + 0.86, 0.35),
      0.022,
      lineMatBad,
    );
    [okLine, highLine, lowLine].forEach((l) => {
      l.visible = false;
      group.add(l);
    });
    const eyeGeo = new THREE.SphereGeometry(0.09, 10, 8);
    const eyeMat = std('#0f172a');
    const eyes: THREE.Mesh[] = [];
    [
      [0.2, BENCH_Y + 1.0],
      [0.2, BENCH_Y + 1.55],
      [0.2, BENCH_Y + 0.45],
    ].forEach(([x, y]) => {
      const e = new THREE.Mesh(eyeGeo, eyeMat);
      e.position.set(x, y, eyeZ);
      e.visible = false;
      group.add(e);
      eyes.push(e);
    });

    // ---------------- 胶头滴管 + 小试管 ----------------
    const smallTube = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.9, 16), glassMat);
    smallTube.position.set(TOOL_X.dropper, BENCH_Y + 0.45, 0);
    group.add(smallTube);
    const smallLiq = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.3, 14),
      std('#93c5fd', { transparent: true, opacity: 0.6 }),
    );
    smallLiq.position.set(TOOL_X.dropper, BENCH_Y + 0.18, 0);
    group.add(smallLiq);
    const dropperGroup = new THREE.Group();
    const dpTube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.025, 0.9, 10),
      std('#e2e8f0', { transparent: true, opacity: 0.6 }),
    );
    dropperGroup.add(dpTube);
    const dpBulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), std('#dc2626', { roughness: 0.4 }));
    dpBulb.position.y = 0.55;
    dropperGroup.add(dpBulb);
    dropperGroup.position.set(TOOL_X.dropper, BENCH_Y + 1.9, 0);
    group.add(dropperGroup);
    const droplet = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 8, 6),
      std('#60a5fa', { emissive: '#2563eb', emissiveIntensity: 0.4 }),
    );
    droplet.visible = false;
    group.add(droplet);

    // ---------------- 标签（全部预建） ----------------
    const usageLabels: Record<ToolKey, THREE.Sprite> = {} as Record<ToolKey, THREE.Sprite>;
    (Object.keys(TOOL_USAGE) as ToolKey[]).forEach((k) => {
      const s = makeLabel(TOOL_USAGE[k], { fontSize: 32, scale: 0.78, color: '#334155' });
      s.position.set(TOOL_X[k], 3.75, 0);
      s.visible = false;
      group.add(s);
      usageLabels[k] = s;
    });
    // 演示提示
    const warnLabel = makeLabel('⚠ 严禁用嘴吹灭！', { fontSize: 40, scale: 1.0, color: '#b91c1c' });
    warnLabel.position.set(TOOL_X.alcohol, 4.45, 0);
    warnLabel.visible = false;
    group.add(warnLabel);
    const flameLabel = makeLabel('外焰温度最高，用外焰加热', { fontSize: 32, scale: 0.78, color: '#c2410c' });
    flameLabel.position.set(TOOL_X.alcohol + 1.2, 2.4, 0);
    flameLabel.visible = false;
    group.add(flameLabel);
    const capLabel = makeLabel('灯帽盖灭，提起再盖一次', { fontSize: 32, scale: 0.78, color: '#0f766e' });
    capLabel.position.set(TOOL_X.alcohol, 3.2, 0);
    capLabel.visible = false;
    group.add(capLabel);
    const tubeRule = makeLabel('液体≤1/3 · 倾斜45° · 管口不对人', { fontSize: 32, scale: 0.8, color: '#b45309' });
    tubeRule.position.set(TOOL_X.tube, 4.45, 0);
    tubeRule.visible = false;
    group.add(tubeRule);
    const menisLabel = makeLabel('视线对准凹液面最低处', { fontSize: 30, scale: 0.75, color: '#15803d' });
    menisLabel.position.set(TOOL_X.cylinder - 1.1, 2.35, 0.4);
    menisLabel.visible = false;
    group.add(menisLabel);
    const highLabel = makeLabel('俯视：读数偏大', { fontSize: 30, scale: 0.75, color: '#b91c1c' });
    highLabel.position.set(TOOL_X.cylinder - 1.5, 3.1, 0.4);
    highLabel.visible = false;
    group.add(highLabel);
    const lowLabel = makeLabel('仰视：读数偏小', { fontSize: 30, scale: 0.75, color: '#b91c1c' });
    lowLabel.position.set(TOOL_X.cylinder - 1.5, 1.35, 0.4);
    lowLabel.visible = false;
    group.add(lowLabel);
    const dropRule = makeLabel('竖直悬空 · 不伸入 · 不碰壁', { fontSize: 32, scale: 0.8, color: '#0f766e' });
    dropRule.position.set(TOOL_X.dropper, 4.45, 0);
    dropRule.visible = false;
    group.add(dropRule);
    const beakRule = makeLabel('加热时垫陶土网，受热均匀', { fontSize: 32, scale: 0.8, color: '#c2410c' });
    beakRule.position.set(TOOL_X.beaker, 4.45, 0);
    beakRule.visible = false;
    group.add(beakRule);

    // ---------------- 状态刷新 ----------------
    const resetDemoProps = () => {
      lampFlame.scale.setScalar(0.001);
      cap.position.copy(CAP_REST);
      tubePivot.rotation.z = 0;
      tubeLiq.rotation.z = 0;
      gauze.visible = false;
      beakFlame.visible = false;
      okLine.visible = false;
      highLine.visible = false;
      lowLine.visible = false;
      eyes.forEach((e) => (e.visible = false));
      droplet.visible = false;
      dropperGroup.position.y = BENCH_Y + 1.9;
      beakWaterMat.color.copy(WATER_COOL);
      flameLabel.visible = false;
      capLabel.visible = false;
      menisLabel.visible = false;
      highLabel.visible = false;
      lowLabel.visible = false;
    };
    const refreshLabels = () => {
      (Object.keys(usageLabels) as ToolKey[]).forEach((k) => {
        usageLabels[k].visible = step === 0 ? true : k === tool;
      });
      warnLabel.visible = tool === 'alcohol';
      tubeRule.visible = tool === 'tube' && demoT >= 0;
      dropRule.visible = tool === 'dropper' && demoT >= 0;
      beakRule.visible = tool === 'beaker' && demoT >= 0;
      ring.position.x = TOOL_X[tool];
    };
    const selectTool = (k: ToolKey, autoDemo: boolean) => {
      tool = k;
      demoT = autoDemo ? 0 : -1;
      resetDemoProps();
      refreshLabels();
    };
    refreshLabels();

    return {
      setStep(i) {
        step = i;
        if (i === 1) selectTool('alcohol', true);
        else if (i === 2) selectTool('tube', true);
        else if (i === 3) selectTool('cylinder', true);
        else {
          demoT = -1;
          resetDemoProps();
        }
        refreshLabels();
      },
      setParam(id, value) {
        if (id === 'tool' && String(value) in TOOL_X) selectTool(String(value) as ToolKey, false);
        if (id === 'demo') {
          resetDemoProps();
          demoT = 0;
        }
        refreshLabels();
      },
      update(dt, elapsed) {
        if (demoT >= 0) demoT += dt;
        const t = demoT;
        ring.material.emissiveIntensity = 0.5 + Math.sin(elapsed * 3) * 0.3;

        // —— 酒精灯演示：点燃外焰 → 灯帽盖灭 → 提起再盖 ——
        if (tool === 'alcohol' && t >= 0) {
          const grow = s01(t / 0.6);
          const die = 1 - s01((t - 3.1) / 0.5);
          const flicker = 1 + Math.sin(elapsed * 11) * 0.1;
          lampFlame.scale.set(Math.max(0.001, grow * die), Math.max(0.001, grow * die * flicker), Math.max(0.001, grow * die));
          flameLabel.visible = t > 0.6 && t < 3.1;
          capLabel.visible = t >= 3.1;
          // 灯帽移动：2.4-3.1 盖上；3.9-4.3 提起；4.3-4.8 再盖
          if (t < 2.4) cap.position.copy(CAP_REST);
          else if (t < 3.1) cap.position.lerpVectors(CAP_REST, CAP_TOP, s01((t - 2.4) / 0.7));
          else if (t < 3.9) cap.position.copy(CAP_TOP);
          else if (t < 4.3) cap.position.copy(CAP_TOP).y += s01((t - 3.9) / 0.4) * 0.3;
          else if (t < 4.8) cap.position.copy(CAP_TOP).y += (1 - s01((t - 4.3) / 0.5)) * 0.3;
          else cap.position.copy(CAP_TOP);
          warnLabel.visible = Math.sin(elapsed * 6) > -0.85; // 红色警示轻微闪烁
        }

        // —— 试管演示：45° 倾斜，液面保持水平 ——
        if (tool === 'tube' && t >= 0) {
          const tilt = s01((t - 0.3) / 1.1) * (Math.PI / 4);
          tubePivot.rotation.z = -tilt;
          tubeLiq.rotation.z = tilt;
        }

        // —— 量筒演示：三条视线对比 ——
        if (tool === 'cylinder' && t >= 0) {
          okLine.visible = t > 0.4;
          eyes[0].visible = t > 0.4;
          menisLabel.visible = t > 0.4;
          highLine.visible = t > 1.8;
          eyes[1].visible = t > 1.8;
          highLabel.visible = t > 1.8;
          lowLine.visible = t > 2.8;
          eyes[2].visible = t > 2.8;
          lowLabel.visible = t > 2.8;
        }

        // —— 滴管演示：竖直悬空滴加 ——
        if (tool === 'dropper' && t >= 0) {
          dropperGroup.position.y = BENCH_Y + 1.9 + Math.sin(elapsed * 2) * 0.03;
          const ct = t % 1.5;
          droplet.visible = ct < 1.05;
          if (droplet.visible) {
            droplet.position.set(TOOL_X.dropper, BENCH_Y + 1.45 + (1 - ct / 1.05) * 1.0, 0);
          }
        }

        // —— 烧杯演示：垫陶土网加热 ——
        if (tool === 'beaker' && t >= 0) {
          gauze.visible = true;
          beakFlame.visible = t > 0.4;
          if (beakFlame.visible) {
            beakFlame.scale.set(1 + Math.sin(elapsed * 9) * 0.12, 1 + Math.sin(elapsed * 12) * 0.2, 1);
          }
          beakWaterMat.color.lerpColors(WATER_COOL, WATER_WARM, s01((t - 0.4) / 3) * 0.5);
        }
      },
      dispose() {
        ctx.scene.remove(group);
        disposeObject(group);
      },
    };
  },
};
