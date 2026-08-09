// ---------------------------------------------------------------------------
// 物理 · 机械运动与参照物：同一辆红车，选地面还是选红车做标准，结论完全不同
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, damp, disposeObject, makeArrow, makeLabel, std } from '../three-utils';

type RefKind = 'ground' | 'car';

const ROAD_LEN = 16;
const CAR_SPEED = 2.4;

const STEP_HINTS = [
  '红车的位置随时间改变 → 机械运动',
  '参照物：判断运动时被选作标准的物体',
  '换个参照物，结论就变了',
  '相对静止：空中加油机、同步卫星',
];

type LabelOpts = Parameters<typeof makeLabel>[1];

export const motionScene: Scene3DDefinition = {
  id: 'phys-motion',
  title: '机械运动与参照物',
  subject: '物理',
  grade: '8上',
  icon: '🚗',
  tagline: '说一个物体在运动还是静止，要看选谁做参照物',
  keywords: ['机械运动', '参照物', '运动', '静止', '相对运动', '位置变化'],
  camera: { position: [5.5, 4.2, 9.5], target: [-0.5, 1, 0] },
  controls: [
    {
      kind: 'select',
      id: 'ref',
      label: '参照物',
      options: [
        { value: 'ground', label: '地面' },
        { value: 'car', label: '行驶的红车' },
      ],
      defaultValue: 'ground',
    },
    { kind: 'button', id: 'go', label: '🚗 启动 / 停车' },
  ],
  steps: [
    {
      title: '机械运动',
      text: '点“启动”让红车跑起来。红车相对于地面的位置在随时间不断变化——物理学里，把一个物体相对于另一个物体位置随时间的变化叫做机械运动，它是自然界最普遍的现象。',
    },
    {
      title: '参照物',
      text: '说红车在运动，其实我们心里已经悄悄选了地面做标准。判断一个物体是运动还是静止时，这个被选作标准的物体就叫参照物。注意看金色圆环：它圈出的就是当前的参照物。',
    },
    {
      title: '运动是相对的',
      text: '把参照物切换成红车试试：明明没动的树和蓝车，看起来都在向后退！坐在行驶的车里看窗外，树在往后跑，就是这个道理。所以说，运动和静止都是相对的。',
    },
    {
      title: '相对静止',
      text: '如果两个物体运动的方向和快慢都相同，它们之间就相对静止。空中加油时，加油机和受油机保持相对静止；地球同步卫星绕地球转，但相对地面一动不动，所以能定点转播信号。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 18);
    const root = new THREE.Group();
    ctx.scene.add(root);

    let ref: RefKind = 'ground';
    let running = false;
    let carX = 0;
    let blend = 0;
    let step = 0;

    // ---- 世界组：路面、树、蓝车（选红车做参照物时整体向后滑） ----
    const world = new THREE.Group();
    root.add(world);

    const road = new THREE.Mesh(new THREE.BoxGeometry(ROAD_LEN + 6, 0.08, 3.2), std('#475569'));
    road.position.y = 0.04;
    world.add(road);
    const dashGeo = new THREE.BoxGeometry(0.55, 0.02, 0.09);
    const dashMat = std('#f8fafc');
    for (let i = 0; i < 12; i++) {
      const d = new THREE.Mesh(dashGeo, dashMat);
      d.position.set(-ROAD_LEN / 2 + (i + 0.5) * (ROAD_LEN / 12), 0.09, 0);
      world.add(d);
    }

    // 树（等间距排列，世界滑动一整圈后视觉无缝）
    const trunkGeo = new THREE.CylinderGeometry(0.09, 0.12, 0.8, 8);
    const trunkMat = std('#92400e');
    const leafGeo = new THREE.SphereGeometry(0.42, 12, 10);
    const leafMat = std('#22c55e', { emissive: '#15803d', emissiveIntensity: 0.15 });
    for (let i = 0; i < 6; i++) {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 0.4;
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.y = 1.05;
      const leaf2 = new THREE.Mesh(leafGeo, leafMat);
      leaf2.scale.setScalar(0.7);
      leaf2.position.y = 1.5;
      tree.add(trunk, leaf, leaf2);
      tree.position.set(-ROAD_LEN / 2 + (i + 0.5) * (ROAD_LEN / 6), 0, -2.6);
      world.add(tree);
    }

    // ---- 小车 ----
    const buildCar = (color: string, emissive: string) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.15, 0.34, 0.62),
        std(color, { emissive, emissiveIntensity: 0.25 }),
      );
      body.position.y = 0.37;
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.3, 0.54), std('#e2e8f0'));
      cabin.position.set(-0.06, 0.68, 0);
      g.add(body, cabin);
      const wheelGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.14, 14);
      const wheelMat = std('#111827');
      for (const px of [-0.38, 0.38]) {
        for (const pz of [-0.32, 0.32]) {
          const w = new THREE.Mesh(wheelGeo, wheelMat);
          w.rotation.x = Math.PI / 2;
          w.position.set(px, 0.15, pz);
          g.add(w);
        }
      }
      return g;
    };
    const carA = buildCar('#ef4444', '#b91c1c');
    root.add(carA);
    const carB = buildCar('#3b82f6', '#1d4ed8');
    carB.position.set(3.2, 0, 0);
    world.add(carB);

    // ---- 标签 ----
    const carALabel = makeLabel('A · 红车', { fontSize: 34, scale: 0.7, color: '#b91c1c' });
    root.add(carALabel);
    const carBLabel = makeLabel('B · 蓝车（停在路边）', { fontSize: 30, scale: 0.65, color: '#1d4ed8' });
    carBLabel.position.set(3.2, 1.4, 0);
    world.add(carBLabel);
    const treeLabel = makeLabel('树（固定在地面）', { fontSize: 30, scale: 0.65, color: '#15803d' });
    treeLabel.position.set(-2.67, 2.35, -2.6);
    world.add(treeLabel);

    const VERDICT_OPTS: LabelOpts = { fontSize: 40, scale: 1.0, color: '#0f766e' };
    const HINT_OPTS: LabelOpts = { fontSize: 32, scale: 0.8, color: '#475569' };
    const verdictLabel = makeLabel('', VERDICT_OPTS);
    verdictLabel.position.set(0, 4.3, 0);
    root.add(verdictLabel);
    const hintLabel = makeLabel('', HINT_OPTS);
    hintLabel.position.set(0, 3.55, 0);
    root.add(hintLabel);

    const setText = (sprite: THREE.Sprite, text: string, opts: LabelOpts) => {
      sprite.material.map?.dispose();
      sprite.material.dispose();
      const nl = makeLabel(text, opts);
      sprite.material = nl.material;
      sprite.scale.copy(nl.scale);
    };
    const refreshVerdict = () => {
      const text = !running
        ? '车还没启动：选谁做参照物，大家都是静止的'
        : ref === 'ground'
          ? '以地面为参照物：红车在运动，蓝车和树静止'
          : '以红车为参照物：树和蓝车在向后退';
      setText(verdictLabel, text, VERDICT_OPTS);
      setText(hintLabel, STEP_HINTS[step], HINT_OPTS);
    };

    // 速度箭头（红车行驶时显示）
    const velArrow = makeArrow('#22c55e', { radius: 0.035, headRadius: 0.1, headLength: 0.26 });
    root.add(velArrow.group);

    // 参照物高亮圆环
    const ringGeo = new THREE.TorusGeometry(0.95, 0.05, 8, 32);
    const ringMat = std('#facc15', { emissive: '#eab308', emissiveIntensity: 0.55 });
    const ringCar = new THREE.Mesh(ringGeo, ringMat);
    ringCar.rotation.x = -Math.PI / 2;
    ringCar.position.y = 0.06;
    carA.add(ringCar);
    const ringGround = new THREE.Mesh(ringGeo, ringMat);
    ringGround.rotation.x = -Math.PI / 2;
    ringGround.position.set(1.33, 0.06, -2.6);
    world.add(ringGround);

    const applyRings = () => {
      ringCar.visible = step >= 1 && ref === 'car';
      ringGround.visible = step >= 1 && ref === 'ground';
    };
    applyRings();
    refreshVerdict();

    return {
      setStep(i) {
        step = i;
        applyRings();
        refreshVerdict();
      },
      setParam(id, value) {
        if (id === 'ref') ref = String(value) as RefKind;
        if (id === 'go') running = !running;
        applyRings();
        refreshVerdict();
      },
      update(dt, elapsed) {
        if (running) carX += CAR_SPEED * dt;
        const offset = carX % ROAD_LEN;
        blend = damp(blend, ref === 'car' ? 1 : 0, 3.2, dt);
        // 地面参照：红车沿路面循环前进；红车参照：红车钉在原地，世界向后滑
        const groundX = -7.5 + offset;
        carA.position.x = THREE.MathUtils.lerp(groundX, -0.8, blend);
        world.position.x = -offset * blend;
        carA.position.y = running ? Math.abs(Math.sin(elapsed * 9)) * 0.02 : 0;
        carALabel.position.set(carA.position.x, 1.4, 0);
        velArrow.group.visible = running;
        if (running) {
          velArrow.set(
            new THREE.Vector3(carA.position.x + 0.15, 1.2, 0),
            new THREE.Vector3(carA.position.x + 1.55, 1.2, 0),
          );
        }
        const pulse = 1 + Math.sin(elapsed * 3) * 0.08;
        ringCar.scale.setScalar(pulse);
        ringGround.scale.setScalar(pulse);
      },
      dispose() {
        ctx.scene.remove(root);
        disposeObject(root);
      },
    };
  },
};
