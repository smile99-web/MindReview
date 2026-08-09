// ---------------------------------------------------------------------------
// 物理 · 杠杆平衡：支点、力臂与平衡条件 F1·L1 = F2·L2
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, cylinderBetween, makeLabel, std } from '../three-utils';

export const leverScene: Scene3DDefinition = {
  id: 'phys-lever',
  title: '杠杆的平衡条件',
  subject: '物理',
  icon: '⚖️',
  tagline: '调节力和力臂，亲眼看到杠杆平衡或倾倒——F₁L₁ = F₂L₂',
  keywords: ['杠杆', '支点', '力臂', '动力', '阻力', '杠杆平衡', '简单机械', '滑轮', '机械'],
  camera: { position: [6, 4, 9], target: [0, 1.2, 0] },
  controls: [
    { kind: 'slider', id: 'f1', label: '动力 F₁', min: 5, max: 30, step: 1, defaultValue: 10, unit: 'N' },
    { kind: 'slider', id: 'l1', label: '动力臂 L₁', min: 1, max: 4, step: 0.5, defaultValue: 2, unit: 'm' },
    { kind: 'slider', id: 'l2', label: '阻力臂 L₂', min: 1, max: 4, step: 0.5, defaultValue: 2, unit: 'm' },
  ],
  steps: [
    {
      title: '杠杆五要素',
      text: '能绕固定点转动的硬棒就是杠杆。绿色三角是支点，动力让杠杆转动，阻力阻碍转动。支点到动力作用线的距离叫动力臂，到阻力作用线的距离叫阻力臂。',
    },
    {
      title: '力臂的概念',
      text: '注意：力臂不是支点到力的作用点的距离，而是支点到力的作用线的垂直距离。图中蓝色虚线标出了两条力的作用线，红色箭头才是真正的力臂。',
    },
    {
      title: '平衡条件',
      text: '动手调一调滑块：当动力乘动力臂等于阻力乘阻力臂时，杠杆水平平衡。阻力是10牛：阻力臂4米时，动力臂1米就要用40牛；动力臂越长越省力，这就是撬棍的原理。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 12);
    let step = 0;
    let f1 = 10;
    let l1 = 2;
    let l2 = 2;
    const F2 = 10; // 阻力固定 10N（挂一个重物）

    const pivotY = 1.6;

    // 支点（三棱柱）
    const fulcrum = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1, 3), std('#16a34a'));
    fulcrum.rotation.x = Math.PI / 2;
    fulcrum.rotation.y = Math.PI;
    fulcrum.position.set(0, pivotY - 0.75, 0);
    ctx.scene.add(fulcrum);
    const fulcrumLabel = makeLabel('支点 O', { fontSize: 40, scale: 0.9, color: '#15803d' });
    fulcrumLabel.position.set(0, pivotY - 1.6, 0);
    ctx.scene.add(fulcrumLabel);

    // 杠杆组（绕支点旋转）
    const beam = new THREE.Group();
    beam.position.set(0, pivotY, 0);
    ctx.scene.add(beam);
    const rod = new THREE.Mesh(new THREE.BoxGeometry(10, 0.14, 0.3), std('#a16207'));
    beam.add(rod);
    // 刻度线
    for (let x = -4; x <= 4; x++) {
      if (x === 0) continue;
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.36), std('#451a03'));
      tick.position.x = x;
      beam.add(tick);
    }

    // 动力装置（左侧：向下压的力，用活塞箭头表示）
    const f1Group = new THREE.Group();
    const f1Arrow = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 14), std('#dc2626'));
    f1Arrow.rotation.x = Math.PI;
    const f1Shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 10), std('#dc2626'));
    f1Group.add(f1Arrow, f1Shaft);
    f1Arrow.position.y = -1.35;
    f1Shaft.position.y = -0.65;
    const f1Label = makeLabel('动力 F₁', { fontSize: 38, scale: 0.85, color: '#b91c1c' });
    f1Label.position.y = -2.1;
    f1Group.add(f1Label);
    beam.add(f1Group);

    // 阻力装置（右侧：悬挂重物）
    const f2Group = new THREE.Group();
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 8), std('#64748b'));
    rope.position.y = -0.4;
    f2Group.add(rope);
    const weight = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), std('#334155', { metalness: 0.4 }));
    weight.position.y = -1.15;
    f2Group.add(weight);
    const f2Label = makeLabel('阻力 F₂ = 10N', { fontSize: 38, scale: 0.85 });
    f2Label.position.y = -2.0;
    f2Group.add(f2Label);
    beam.add(f2Group);

    // 力臂标注（随支点到作用点的红色彩带 + 标签）
    const armMat = std('#ef4444', { emissive: '#b91c1c', emissiveIntensity: 0.4 });
    const l1Arm = cylinderBetween(new THREE.Vector3(0, 0.35, 0), new THREE.Vector3(-l1, 0.35, 0), 0.04, armMat);
    const l2Arm = cylinderBetween(new THREE.Vector3(0, 0.35, 0), new THREE.Vector3(l2, 0.35, 0), 0.04, armMat);
    beam.add(l1Arm, l2Arm);
    const l1Label = makeLabel('L₁', { fontSize: 40, scale: 0.9, color: '#b91c1c' });
    const l2Label = makeLabel('L₂', { fontSize: 40, scale: 0.9, color: '#b91c1c' });
    beam.add(l1Label, l2Label);

    // 平衡状态牌
    const status = makeLabel('', { fontSize: 44, scale: 1.05 });
    status.position.set(0, pivotY + 2.2, 0);
    ctx.scene.add(status);

    // 力的作用线虚线（step>=1 显示）
    const dashMat = new THREE.LineDashedMaterial({ color: '#3b82f6', dashSize: 0.18, gapSize: 0.12 });
    const mkLine = (x: number) => {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, -3.2, 0),
        new THREE.Vector3(x, 2.6, 0),
      ]);
      const line = new THREE.Line(geo, dashMat);
      line.computeLineDistances();
      line.visible = false;
      return line;
    };
    const forceLine1 = mkLine(-l1);
    const forceLine2 = mkLine(l2);
    beam.add(forceLine1, forceLine2);

    const rebuildArms = () => {
      // 力臂杆：原地替换几何体（不摘除 l1Arm/l2Arm，避免丢引用）
      const a1 = cylinderBetween(new THREE.Vector3(0, 0.32, 0), new THREE.Vector3(-l1, 0.32, 0), 0.04, armMat);
      const a2 = cylinderBetween(new THREE.Vector3(0, 0.32, 0), new THREE.Vector3(l2, 0.32, 0), 0.04, armMat);
      l1Arm.geometry.dispose();
      l2Arm.geometry.dispose();
      l1Arm.geometry = a1.geometry;
      l1Arm.position.copy(a1.position);
      l1Arm.quaternion.copy(a1.quaternion);
      l2Arm.geometry = a2.geometry;
      l2Arm.position.copy(a2.position);
      l2Arm.quaternion.copy(a2.quaternion);
      l1Label.position.set(-l1 / 2, 0.62, 0);
      l2Label.position.set(l2 / 2, 0.62, 0);
      f1Group.position.x = -l1;
      f2Group.position.x = l2;
      forceLine1.position.x = 0;
      forceLine1.geometry.dispose();
      forceLine1.geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-l1, -3.2, 0),
        new THREE.Vector3(-l1, 2.6, 0),
      ]);
      forceLine1.computeLineDistances();
      forceLine2.geometry.dispose();
      forceLine2.geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(l2, -3.2, 0),
        new THREE.Vector3(l2, 2.6, 0),
      ]);
      forceLine2.computeLineDistances();
      // 状态牌
      const t1 = f1 * l1;
      const t2 = F2 * l2;
      const balanced = Math.abs(t1 - t2) < 0.001;
      const text = balanced
        ? `✅ 平衡！F₁L₁ = F₂L₂ = ${t1.toFixed(0)}`
        : t1 > t2
          ? `F₁L₁=${t1.toFixed(0)} > F₂L₂=${t2.toFixed(0)}，向左倾`
          : `F₁L₁=${t1.toFixed(0)} < F₂L₂=${t2.toFixed(0)}，向右倾`;
      status.material.map?.dispose();
      status.material.dispose();
      const nl = makeLabel(text, {
        fontSize: 40,
        scale: 1.0,
        color: balanced ? '#15803d' : '#b45309',
      });
      status.material = nl.material;
      status.scale.copy(nl.scale);
    };
    rebuildArms();

    const applyStep = () => {
      const showLines = step >= 1;
      forceLine1.visible = showLines;
      forceLine2.visible = showLines;
    };

    return {
      setStep(i) {
        step = i;
        applyStep();
      },
      setParam(id, value) {
        if (id === 'f1') f1 = Number(value);
        if (id === 'l1') l1 = Number(value);
        if (id === 'l2') l2 = Number(value);
        rebuildArms();
      },
      update(dt) {
        // 力矩差决定倾斜角（限幅 ±13°）
        const torque = F2 * l2 - f1 * l1;
        const target = THREE.MathUtils.clamp(torque * 0.03, -0.23, 0.23);
        beam.rotation.z = THREE.MathUtils.damp(beam.rotation.z, target, 4, dt);
      },
      dispose() {
        ctx.scene.remove(fulcrum, fulcrumLabel, beam, status);
      },
    };
  },
};
