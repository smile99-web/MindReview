// ---------------------------------------------------------------------------
// 数学 · 等式性质与解方程：用天平演示 3x + 2 = 8 的求解过程
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, disposeObject, makeLabel, std } from '../three-utils';

const BEAM_Y = 2.75;
const PAN_X = 2.4; // 托盘到支点距离
// 各变形阶段物品数量：3x+2=8 → 3x=6 → x=2 → 检验
const STAGE_BOX = [3, 3, 1, 1];
const STAGE_LW = [2, 0, 0, 0];
const STAGE_RW = [8, 6, 2, 2];
const EQ_TEXT = [
  '3x + 2 = 8',
  '两边同时减去 2 → 3x = 6',
  '两边同时除以 3 → x = 2',
  '检验：3 × 2 + 2 = 8 ✓ 成立',
];
const LEFT_TEXT = ['3x + 2', '3x', 'x', 'x = 2'];
const RIGHT_TEXT = ['8', '6', '2', '2'];

interface Item {
  obj: THREE.Object3D;
  home: THREE.Vector3;
  counts: number[];
  index: number;
}

export const equationBalanceScene: Scene3DDefinition = {
  id: 'math-equation-balance',
  title: '等式性质与解方程',
  subject: '数学',
  grade: '7上',
  icon: '⚖️',
  tagline: '用天平称出 x 的值——等式两边同加同减、同乘同除',
  keywords: ['方程', '一元一次方程', '等式性质', '解方程', '移项', '未知数', '天平'],
  camera: { position: [0, 3.6, 9.5], target: [0, 2.2, 0] },
  controls: [
    { kind: 'button', id: 'next', label: '⏭ 进行一步变形' },
    { kind: 'button', id: 'reset', label: '↺ 重置' },
  ],
  steps: [
    {
      title: '方程是天平',
      text: '方程就像一架天平：等号左边放三个 x 盒子和两个一克砝码，右边放八个一克砝码，两边一样重，天平平平的。盒子里装的数 x 是未知数，把它称出来，就是解方程。',
    },
    {
      title: '同加同减',
      text: '等式性质一：等式两边同时加上或减去同一个数，等式仍然成立。看，两边各拿走两个一克砝码，左边剩三个 x，右边剩六个一，天平依然平衡。点「进行一步变形」试试。',
    },
    {
      title: '同乘同除',
      text: '等式性质二：等式两边同时乘同一个数，或者除以同一个不为零的数，等式仍然成立。两边同时除以三：左边留下一个 x，右边留下两个一，所以 x 等于二。',
    },
    {
      title: '检验',
      text: '解完一定要检验：把 x 等于二代回原方程，左边是三乘二加二，正好等于八，和右边一样，说明 x 等于二真的是方程的解。盒子打开啦，里面装的就是二。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 14);
    let stage = 0;
    let wobble = 0;

    const root = new THREE.Group();
    ctx.scene.add(root);

    // 底座与立柱
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.95, 0.28, 20), std('#475569'));
    base.position.y = 0.14;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, BEAM_Y - 0.3, 12), std('#64748b'));
    pillar.position.y = (BEAM_Y - 0.3) / 2 + 0.28;
    const knob = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 12), std('#f59e0b'));
    knob.position.y = BEAM_Y + 0.2;
    root.add(base, pillar, knob);

    // 横梁
    const beam = new THREE.Group();
    beam.position.y = BEAM_Y;
    root.add(beam);
    const rod = new THREE.Mesh(new THREE.BoxGeometry(PAN_X * 2 + 0.9, 0.12, 0.24), std('#a16207'));
    beam.add(rod);
    const pivotMark = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), std('#dc2626'));
    beam.add(pivotMark);

    const items: Item[] = [];
    const mkPan = (side: 1 | -1) => {
      const panGroup = new THREE.Group();
      panGroup.position.set(side * PAN_X, 0, 0);
      beam.add(panGroup);
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8), std('#475569'));
      rope.position.y = -0.45;
      panGroup.add(rope);
      const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.78, 0.09, 20), std('#94a3b8', { metalness: 0.3 }));
      pan.position.y = -0.95;
      panGroup.add(pan);
      return panGroup;
    };
    const leftPan = mkPan(-1);
    const rightPan = mkPan(1);

    const PAN_TOP = -0.9; // 盘面局部高度
    // x 盒子（左盘）
    const boxGroups: THREE.Group[] = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.52, 0.52, 0.52),
        std('#3b82f6', { emissive: '#1d4ed8', emissiveIntensity: 0.25 }),
      );
      g.add(box);
      const lab = makeLabel('x', { fontSize: 40, scale: 0.8, color: '#1d4ed8' });
      lab.position.set(0, 0.52, 0);
      g.add(lab);
      const home = new THREE.Vector3((i - 1) * 0.62, PAN_TOP + 0.26, i === 1 ? 0.1 : 0);
      g.position.copy(home);
      leftPan.add(g);
      boxGroups.push(g);
      items.push({ obj: g, home, counts: STAGE_BOX, index: i });
    }
    // 盒盖（第一只盒子）+ 盒中金球（检验时弹出）
    const lidGroup = new THREE.Group();
    lidGroup.position.set(0, 0.27, -0.26);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.06, 0.54), std('#60a5fa'));
    lid.position.set(0, 0.02, 0.26);
    lidGroup.add(lid);
    boxGroups[0].add(lidGroup);
    const goldBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 18, 14),
      std('#fbbf24', { emissive: '#d97706', emissiveIntensity: 0.6 }),
    );
    goldBall.scale.setScalar(0.001);
    boxGroups[0].add(goldBall);

    // 砝码（左 2 右 8）
    const weightGeo = new THREE.CylinderGeometry(0.16, 0.19, 0.3, 12);
    const weightMat = std('#f59e0b', { metalness: 0.35, roughness: 0.4 });
    const mkWeight = (parent: THREE.Group, home: THREE.Vector3, counts: number[], index: number) => {
      const m = new THREE.Mesh(weightGeo, weightMat);
      m.position.copy(home);
      parent.add(m);
      items.push({ obj: m, home, counts, index });
    };
    mkWeight(leftPan, new THREE.Vector3(-0.33, PAN_TOP + 0.15, 0.55), STAGE_LW, 0);
    mkWeight(leftPan, new THREE.Vector3(0.33, PAN_TOP + 0.15, 0.55), STAGE_LW, 1);
    for (let i = 0; i < 8; i++) {
      const col = i % 4;
      const row = Math.floor(i / 4);
      mkWeight(
        rightPan,
        new THREE.Vector3((col - 1.5) * 0.4, PAN_TOP + 0.15, row === 0 ? 0.32 : -0.32),
        STAGE_RW,
        i,
      );
    }

    // 托盘标签与等式牌
    const leftTag = makeLabel('', { fontSize: 38, scale: 0.9, color: '#1d4ed8' });
    leftTag.position.set(0, 0.55, 0);
    leftPan.add(leftTag);
    const rightTag = makeLabel('', { fontSize: 38, scale: 0.9, color: '#b45309' });
    rightTag.position.set(0, 0.55, 0);
    rightPan.add(rightTag);
    const eqLabel = makeLabel('', { fontSize: 46, scale: 1.15, color: '#0f172a' });
    eqLabel.position.set(0, 4.5, 0);
    root.add(eqLabel);

    const setText = (
      sprite: THREE.Sprite,
      text: string,
      opts: { fontSize?: number; color?: string; scale?: number } = {},
    ) => {
      sprite.material.map?.dispose();
      sprite.material.dispose();
      const nl = makeLabel(text, opts);
      sprite.material = nl.material;
      sprite.scale.copy(nl.scale);
    };

    const applyStage = (s: number) => {
      if (s !== stage) wobble = 1;
      stage = s;
      setText(eqLabel, EQ_TEXT[stage], {
        fontSize: 46,
        scale: 1.15,
        color: stage === 3 ? '#15803d' : '#0f172a',
      });
      setText(leftTag, LEFT_TEXT[stage], { fontSize: 38, scale: 0.9, color: '#1d4ed8' });
      setText(rightTag, RIGHT_TEXT[stage], { fontSize: 38, scale: 0.9, color: '#b45309' });
    };
    applyStage(0);
    wobble = 0;

    return {
      setStep(i) {
        applyStage(THREE.MathUtils.clamp(i, 0, 3));
      },
      setParam(id) {
        if (id === 'next') applyStage(Math.min(stage + 1, 3));
        if (id === 'reset') applyStage(0);
      },
      update(dt, elapsed) {
        // 横梁轻微晃动后恢复水平（全程保持平衡）
        wobble = THREE.MathUtils.damp(wobble, 0, 1.6, dt);
        beam.rotation.z = 0.05 * wobble * Math.sin(elapsed * 7);
        leftPan.rotation.z = -beam.rotation.z;
        rightPan.rotation.z = -beam.rotation.z;

        // 物品飞入飞出
        for (const it of items) {
          const visible = it.index < it.counts[stage];
          const target = visible ? it.home : it.home.clone().add(new THREE.Vector3(0, 2.0, 0.4));
          it.obj.position.x = THREE.MathUtils.damp(it.obj.position.x, target.x, 5, dt);
          it.obj.position.y = THREE.MathUtils.damp(it.obj.position.y, target.y, 5, dt);
          it.obj.position.z = THREE.MathUtils.damp(it.obj.position.z, target.z, 5, dt);
          const s = THREE.MathUtils.damp(it.obj.scale.x, visible ? 1 : 0.001, 6, dt);
          it.obj.scale.setScalar(s);
          it.obj.visible = s > 0.02;
        }

        // 盒盖与金球（阶段三：x = 2 揭晓）
        const open = stage === 3;
        lidGroup.rotation.x = THREE.MathUtils.damp(lidGroup.rotation.x, open ? -2.1 : 0, 4, dt);
        const ballTarget = open ? 1 : 0.001;
        goldBall.scale.setScalar(THREE.MathUtils.damp(goldBall.scale.x, ballTarget, 4, dt));
        goldBall.position.y = THREE.MathUtils.damp(goldBall.position.y, open ? 0.85 : 0, 4, dt);
        if (open) goldBall.position.y += Math.sin(elapsed * 3) * 0.05;
      },
      dispose() {
        ctx.scene.remove(root);
        disposeObject(root);
      },
    };
  },
};
