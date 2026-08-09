// ---------------------------------------------------------------------------
// 物理 · 热机的四个冲程：活塞、连杆、曲轴与气门的联动，四冲程自动循环
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, damp, disposeObject, makeLabel, std } from '../three-utils';

const CRANK_Y = 1.1; // 曲轴中心高度
const R = 0.45; // 曲柄半径
const ROD_L = 1.4; // 连杆长度
const HEAD_BOTTOM = 4.15; // 缸盖下表面

const STROKE_NAMES = [
  '① 吸气冲程（活塞下行）',
  '② 压缩冲程（活塞上行）',
  '③ 做功冲程（活塞下行）',
  '④ 排气冲程（活塞上行）',
];
const STROKE_ENERGY = [
  '进气门打开，吸入汽油与空气的混合气',
  '两气门关闭，压缩气体：机械能 → 内能',
  '火花塞点火，燃气推活塞：内能 → 机械能',
  '排气门打开，排出燃烧后的废气',
];
const STROKE_COLORS = ['#38bdf8', '#fb923c', '#ef4444', '#9ca3af'];

const fract = (v: number) => v - Math.floor(v);

export const engineScene: Scene3DDefinition = {
  id: 'phys-engine',
  title: '热机的四个冲程',
  subject: '物理',
  grade: '9全',
  icon: '🚙',
  tagline: '吸气、压缩、做功、排气——汽油机一个循环曲轴转两圈',
  keywords: ['热机', '汽油机', '冲程', '内燃机', '压缩冲程', '做功冲程', '火花塞', '柴油机'],
  camera: { position: [5.2, 4, 8.2], target: [0, 2.6, 0] },
  controls: [
    { kind: 'button', id: 'run', label: '▶ 运行 / 暂停' },
    { kind: 'slider', id: 'rpm', label: '转速', min: 0.3, max: 2, step: 0.1, defaultValue: 0.8 },
  ],
  steps: [
    {
      title: '热机原理',
      text: '热机是把内能转化为机械能的机器。汽车里的汽油机最常见：汽油在汽缸里燃烧，高温高压的燃气推动活塞，再通过连杆带动曲轴转动。点运行按钮，看看它是怎么工作的。',
    },
    {
      title: '吸气与压缩',
      text: '吸气冲程：进气门打开，活塞向下，把汽油和空气的混合气吸进汽缸。压缩冲程：两个气门都关闭，活塞向上压缩混合气，对气体做功，机械能转化为内能，气体温度升高，颜色变红。',
    },
    {
      title: '做功冲程',
      text: '压缩末尾，火花塞打出电火花，混合气猛烈燃烧，燃气膨胀把活塞猛推下去——内能转化为机械能。四个冲程里只有这一个冲程提供动力，其余三个靠飞轮的惯性完成。',
    },
    {
      title: '排气与循环',
      text: '排气冲程：排气门打开，活塞向上，把废气赶出汽缸。一个工作循环有四个冲程，曲轴转两圈，只对外做一次功。柴油机没有火花塞，靠压缩把空气烧得很热，再喷入柴油自燃。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 14);
    const root = new THREE.Group();
    ctx.scene.add(root);
    let step = 0;
    let running = false;
    let rpm = 0.8;
    let theta = 0.6; // 曲轴转角
    let stroke = -1;
    let flashT = 0;

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

    // ---- 汽缸体 -------------------------------------------------------------
    const block = new THREE.Mesh(
      new THREE.CylinderGeometry(0.88, 0.88, 2.3, 28, 1, true),
      std('#cbd5e1', { transparent: true, opacity: 0.22, side: THREE.DoubleSide, roughness: 0.2 }),
    );
    block.position.set(0, 3.28, 0);
    root.add(block);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.28, 1.95), std('#94a3b8', { metalness: 0.4 }));
    head.position.set(0, 4.32, 0);
    root.add(head);
    const crankCase = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.0, 2.0), std('#a8b3c2', { metalness: 0.3 }));
    crankCase.position.set(0, 0.6, 0);
    root.add(crankCase);

    // ---- 活塞 ---------------------------------------------------------------
    const piston = new THREE.Group();
    const pistonBody = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.5, 24), std('#d6d3d1', { metalness: 0.6, roughness: 0.3 }));
    piston.add(pistonBody);
    const pistonRing = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.03, 8, 28), std('#57534e', { metalness: 0.7 }));
    pistonRing.rotation.x = Math.PI / 2;
    pistonRing.position.y = 0.18;
    piston.add(pistonRing);
    root.add(piston);

    // ---- 曲轴 + 连杆 + 飞轮 ---------------------------------------------------
    const crank = new THREE.Group();
    crank.position.set(0, CRANK_Y, 0);
    root.add(crank);
    const web = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.18), std('#78716c', { metalness: 0.6 }));
    web.position.y = 0.22;
    crank.add(web);
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.34, 10), std('#44403c', { metalness: 0.7 }));
    pin.rotation.x = Math.PI / 2;
    pin.position.y = R;
    crank.add(pin);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.2), std('#78716c', { metalness: 0.6 }));
    counter.position.y = -0.32;
    crank.add(counter);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.7, 12), std('#57534e', { metalness: 0.7 }));
    shaft.rotation.x = Math.PI / 2;
    crank.add(shaft);
    const flywheel = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 0.12, 28), std('#a16207', { metalness: 0.5 }));
    flywheel.rotation.x = Math.PI / 2;
    flywheel.position.z = -0.75;
    crank.add(flywheel);
    const flyMark = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.14), std('#fef08a'));
    flyMark.position.set(0, 0.55, -0.75);
    crank.add(flyMark);

    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 10), std('#78716c', { metalness: 0.6 }));
    root.add(rod);
    const setRod = (a: THREE.Vector3, b: THREE.Vector3) => {
      const dir = new THREE.Vector3().subVectors(b, a);
      const len = Math.max(dir.length(), 0.001);
      rod.scale.y = len;
      rod.position.copy(a).addScaledVector(dir, 0.5);
      rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    };

    // ---- 气门 + 火花塞 --------------------------------------------------------
    const mkValve = (x: number) => {
      const g = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.55, 8), std('#57534e', { metalness: 0.7 }));
      stem.position.y = 0.3;
      g.add(stem);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 16), std('#b45309', { metalness: 0.6 }));
      g.add(disc);
      g.position.set(x, HEAD_BOTTOM + 0.03, 0);
      root.add(g);
      return g;
    };
    const intakeValve = mkValve(-0.38);
    const exhaustValve = mkValve(0.38);

    const plug = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 10), std('#f8fafc', { roughness: 0.3 }));
    plug.position.set(0, 4.55, 0);
    root.add(plug);
    const plugTip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 8), std('#57534e', { metalness: 0.7 }));
    plugTip.position.set(0, 4.28, 0);
    root.add(plugTip);
    const spark = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 10, 8),
      std('#fef08a', { emissive: '#facc15', emissiveIntensity: 2.2 }),
    );
    spark.position.set(0, 4.12, 0);
    spark.visible = false;
    root.add(spark);
    const flashBall = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      std('#fb923c', { emissive: '#ea580c', emissiveIntensity: 1.2, transparent: true, opacity: 0 }),
    );
    root.add(flashBall);

    // ---- 缸内气体粒子 ---------------------------------------------------------
    const GAS_N = 20;
    const gasGeo = new THREE.SphereGeometry(0.075, 8, 6);
    const gasMat = std('#38bdf8', { emissive: '#38bdf8', emissiveIntensity: 0.4 });
    const gasSeeds: THREE.Vector3[] = [];
    const gasMeshes: THREE.Mesh[] = [];
    for (let i = 0; i < GAS_N; i++) {
      const m = new THREE.Mesh(gasGeo, gasMat);
      root.add(m);
      gasSeeds.push(new THREE.Vector3(Math.random(), Math.random(), Math.random()));
      gasMeshes.push(m);
    }

    // 进/排气流粒子
    const STREAM_N = 6;
    const inMat = std('#7dd3fc', { emissive: '#0284c7', emissiveIntensity: 0.6 });
    const outMat = std('#d1d5db', { emissive: '#6b7280', emissiveIntensity: 0.4 });
    const inStream: THREE.Mesh[] = [];
    const outStream: THREE.Mesh[] = [];
    for (let i = 0; i < STREAM_N; i++) {
      const a = new THREE.Mesh(gasGeo, inMat);
      const b = new THREE.Mesh(gasGeo, outMat);
      root.add(a, b);
      inStream.push(a);
      outStream.push(b);
    }

    // ---- 曲轴转角指示盘 -------------------------------------------------------
    const dial = new THREE.Group();
    dial.position.set(2.4, 1.35, 1.05);
    root.add(dial);
    const dialFace = new THREE.Mesh(new THREE.CircleGeometry(0.55, 28), std('#f8fafc', { roughness: 0.9 }));
    dial.add(dialFace);
    const dialRing = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.RingGeometry(0.53, 0.56, 28)),
      new THREE.LineBasicMaterial({ color: '#64748b' }),
    );
    dial.add(dialRing);
    for (let k = 0; k < 4; k++) {
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.02), std('#334155'));
      const a = (k * Math.PI) / 2;
      tick.position.set(Math.sin(a) * 0.47, Math.cos(a) * 0.47, 0.01);
      tick.rotation.z = -a;
      dial.add(tick);
    }
    const needleG = new THREE.Group();
    const needle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.44, 0.03), std('#dc2626', { emissive: '#b91c1c', emissiveIntensity: 0.4 }));
    needle.position.y = 0.22;
    needleG.add(needle);
    needleG.position.z = 0.02;
    dial.add(needleG);

    // ---- 标签 -----------------------------------------------------------------
    const setStroke = dynLabel(STROKE_NAMES[0], { fontSize: 46, scale: 1.1, color: '#1d4ed8' }, new THREE.Vector3(0, 5.65, 0));
    const setEnergy = dynLabel(STROKE_ENERGY[0], { fontSize: 36, scale: 0.9, color: '#b45309' }, new THREE.Vector3(0, 5.05, 0));
    staticLabel('汽缸', { fontSize: 34, scale: 0.8 }, [-1.7, 3.4, 0]);
    staticLabel('活塞', { fontSize: 34, scale: 0.8 }, [-1.7, 2.45, 0]);
    staticLabel('连杆', { fontSize: 34, scale: 0.8 }, [1.15, 1.85, 0.4]);
    staticLabel('曲轴 + 飞轮', { fontSize: 34, scale: 0.8 }, [0, 0.15, 0.9]);
    staticLabel('火花塞', { fontSize: 32, scale: 0.75, color: '#b45309' }, [0, 4.6, 1.1]);
    staticLabel('进气门', { fontSize: 32, scale: 0.75, color: '#0284c7' }, [-1.45, 4.35, 0]);
    staticLabel('排气门', { fontSize: 32, scale: 0.75, color: '#6b7280' }, [1.45, 4.35, 0]);
    staticLabel('曲轴转角', { fontSize: 32, scale: 0.75 }, [2.4, 0.5, 1.05]);

    const hint1 = makeLabel('两气门关闭，压缩气体做功，温度升高', { fontSize: 34, scale: 0.85, color: '#c2410c' });
    hint1.position.set(0, 3.5, 1.9);
    const hint2 = makeLabel('唯一提供动力的冲程！', { fontSize: 38, scale: 0.95, color: '#b91c1c' });
    hint2.position.set(0, 3.5, 1.9);
    const hint3 = makeLabel('一个循环：四个冲程、曲轴转两圈、做一次功', { fontSize: 34, scale: 0.85, color: '#15803d' });
    hint3.position.set(0, 3.5, 1.9);
    root.add(hint1, hint2, hint3);

    const applyStep = () => {
      hint1.visible = step === 1;
      hint2.visible = step === 2;
      hint3.visible = step === 3;
    };
    applyStep();

    const pinPos = new THREE.Vector3();
    const pistonPin = new THREE.Vector3();

    return {
      setStep(i) {
        step = i;
        applyStep();
      },
      setParam(id, value) {
        if (id === 'run') running = !running;
        if (id === 'rpm') rpm = Number(value);
      },
      update(dt, elapsed) {
        if (running) theta += dt * Math.PI * rpm;
        const cycle = ((theta % (Math.PI * 4)) + Math.PI * 4) % (Math.PI * 4);
        const newStroke = Math.floor(cycle / Math.PI);
        if (newStroke !== stroke) {
          stroke = newStroke;
          setStroke(STROKE_NAMES[stroke]);
          setEnergy(STROKE_ENERGY[stroke]);
          gasMat.color.set(STROKE_COLORS[stroke]);
          gasMat.emissive.set(STROKE_COLORS[stroke]);
          if (stroke === 2) flashT = 0.45;
        }
        gasMat.emissiveIntensity = damp(gasMat.emissiveIntensity, stroke === 2 ? 1.1 : 0.4, 6, dt);

        // 曲柄连杆机构（精确运动学）
        crank.rotation.z = -theta;
        const sx = R * Math.sin(theta);
        const pistonY = CRANK_Y + R * Math.cos(theta) + Math.sqrt(Math.max(ROD_L * ROD_L - sx * sx, 0.01));
        piston.position.set(0, pistonY, 0);
        pinPos.set(sx, CRANK_Y + R * Math.cos(theta), 0);
        pistonPin.set(0, pistonY - 0.1, 0);
        setRod(pinPos, pistonPin);
        needleG.rotation.z = -(theta % (Math.PI * 2));

        // 气门开闭
        const inOpen = stroke === 0;
        const outOpen = stroke === 3;
        intakeValve.position.y = damp(intakeValve.position.y, HEAD_BOTTOM + 0.03 - (inOpen ? 0.22 : 0), 10, dt);
        exhaustValve.position.y = damp(exhaustValve.position.y, HEAD_BOTTOM + 0.03 - (outOpen ? 0.22 : 0), 10, dt);

        // 火花与爆炸闪光
        flashT = Math.max(0, flashT - dt);
        spark.visible = flashT > 0;
        if (spark.visible) spark.scale.setScalar(1 + flashT * 4);
        const pistonTop = pistonY + 0.25;
        const chamberH = Math.max(HEAD_BOTTOM - pistonTop - 0.08, 0.15);
        flashBall.material.opacity = flashT * 0.55;
        flashBall.position.set(0, pistonTop + chamberH / 2, 0);
        flashBall.scale.set(0.8, chamberH / 2, 0.8);

        // 缸内气体粒子
        const jiggle = stroke === 1 ? 0.5 : stroke === 2 ? 1.4 : 0.25;
        for (let i = 0; i < GAS_N; i++) {
          const s = gasSeeds[i];
          const m = gasMeshes[i];
          const fy = fract(s.z + elapsed * (0.12 + jiggle * 0.35));
          m.position.set(
            (s.x - 0.5) * 1.25 + 0.05 * Math.sin(elapsed * 3 + i),
            pistonTop + 0.05 + fy * chamberH,
            (s.y - 0.5) * 1.25,
          );
        }
        // 进气流（蓝色流入）/ 排气流（灰色排出）
        for (let i = 0; i < STREAM_N; i++) {
          const t = fract(elapsed * 0.8 + i / STREAM_N);
          const mi = inStream[i];
          mi.visible = inOpen;
          if (inOpen) {
            mi.position.set(-0.38 + 0.18 * Math.sin(i * 7), 4.6 - t * (4.6 - pistonTop - 0.2), 0.12 * Math.cos(i * 9));
          }
          const mo = outStream[i];
          mo.visible = outOpen;
          if (outOpen) {
            mo.position.set(0.38 + 0.12 * Math.sin(i * 5), pistonTop + 0.3 + t * (4.85 - pistonTop - 0.3), 0.1 * Math.cos(i * 6));
          }
        }
      },
      dispose() {
        ctx.scene.remove(root);
        disposeObject(root);
      },
    };
  },
};
