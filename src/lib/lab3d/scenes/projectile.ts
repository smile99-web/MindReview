// ---------------------------------------------------------------------------
// 物理 · 抛体运动：斜抛轨迹与速度分解（水平匀速 + 竖直匀变速）
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, makeLabel, std } from '../three-utils';

const G = 9.8;
const WORLD = 0.45; // 世界缩放：1m → 0.45 单位

export const projectileScene: Scene3DDefinition = {
  id: 'phys-projectile',
  title: '抛体运动',
  subject: '物理',
  icon: '🏀',
  tagline: '发射小球看抛物线：水平方向匀速、竖直方向自由落体的叠加',
  keywords: ['抛体运动', '平抛', '斜抛', '抛物线', '自由落体', '重力', '加速度', '运动合成', '运动的分解', '曲线运动'],
  camera: { position: [8, 5.5, 11], target: [2.5, 1.5, 0] },
  controls: [
    { kind: 'slider', id: 'angle', label: '发射角', min: 15, max: 75, step: 5, defaultValue: 45, unit: '°' },
    { kind: 'slider', id: 'speed', label: '初速度', min: 4, max: 12, step: 0.5, defaultValue: 8, unit: 'm/s' },
    { kind: 'button', id: 'fire', label: '🚀 发射' },
  ],
  steps: [
    {
      title: '抛体运动',
      text: '把物体以一定初速度抛出，只在重力作用下的运动叫抛体运动。点"发射"，小球会划出一条抛物线。灰色虚线是理论轨迹，小球严格沿着它飞行。',
    },
    {
      title: '水平方向：匀速',
      text: '把斜抛运动分解到水平和竖直两个方向观察。绿色箭头是水平分速度：水平方向不受力，所以它的大小从头到尾保持不变——每秒前进的水平距离都相等。',
    },
    {
      title: '竖直方向：匀变速',
      text: '红色箭头是竖直分速度：它先向上、越来越小，到最高点变成零，然后向下越来越大。这是重力加速度在起作用，和自由落体遵循同样的规律。',
    },
    {
      title: '射程与发射角',
      text: '用同样的初速度改变发射角试试：四十五度时射程最远；大于或小于四十五度，射程都会变近。两个互余的发射角，比如三十度和六十度，射程一样远。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 16);
    let step = 0;
    let angleDeg = 45;
    let speed = 8;
    let flying = false;
    let t = 0;

    // 发射架
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.25, 16), std('#475569'));
    base.position.y = 0.12;
    ctx.scene.add(base);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 1.1, 12), std('#78716c'));
    ctx.scene.add(barrel);
    const barrelLabel = makeLabel('发射器', { fontSize: 34, scale: 0.75 });
    barrelLabel.position.set(-0.4, 1.4, 0);
    ctx.scene.add(barrelLabel);

    // 小球
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 18, 14),
      std('#f59e0b', { emissive: '#b45309', emissiveIntensity: 0.3 }),
    );
    ctx.scene.add(ball);

    // 理论轨迹虚线
    const TRAJ_N = 60;
    const trajGeo = new THREE.BufferGeometry();
    trajGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAJ_N * 3), 3));
    const traj = new THREE.Line(
      trajGeo,
      new THREE.LineDashedMaterial({ color: '#94a3b8', dashSize: 0.16, gapSize: 0.12 }),
    );
    ctx.scene.add(traj);

    // 已飞行轨迹（实线）
    const flownGeo = new THREE.BufferGeometry();
    flownGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAJ_N * 3), 3));
    const flown = new THREE.Line(flownGeo, new THREE.LineBasicMaterial({ color: '#f59e0b' }));
    ctx.scene.add(flown);

    // 速度分量箭头
    const mkArrow = (color: string) => {
      const g = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 8), std(color, { emissive: color, emissiveIntensity: 0.6 }));
      shaft.position.y = 0.5;
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.28, 10), std(color, { emissive: color, emissiveIntensity: 0.6 }));
      head.position.y = 1.1;
      g.add(shaft, head);
      ctx.scene.add(g);
      return g;
    };
    const vxArrow = mkArrow('#22c55e');
    const vyArrow = mkArrow('#ef4444');
    const vxLabel = makeLabel('vₓ 水平分速度（不变）', { fontSize: 32, scale: 0.75, color: '#15803d' });
    vxLabel.visible = false;
    ctx.scene.add(vxLabel);
    const vyLabel = makeLabel('v_y 竖直分速度（先减后增）', { fontSize: 32, scale: 0.75, color: '#b91c1c' });
    vyLabel.visible = false;
    ctx.scene.add(vyLabel);

    const infoLabel = makeLabel('', { fontSize: 38, scale: 0.95, color: '#0f766e' });
    infoLabel.position.set(3, 5.2, 0);
    ctx.scene.add(infoLabel);

    // 运动学
    const v0 = () => new THREE.Vector2(
      Math.cos(THREE.MathUtils.degToRad(angleDeg)) * speed,
      Math.sin(THREE.MathUtils.degToRad(angleDeg)) * speed,
    );
    const posAt = (tt: number) => {
      const v = v0();
      return new THREE.Vector3(v.x * tt * WORLD, (v.y * tt - 0.5 * G * tt * tt) * WORLD + 0.25, 0);
    };
    const flightTime = () => (2 * v0().y) / G;

    const rebuildTrajectory = () => {
      const T = flightTime();
      const attr = trajGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < TRAJ_N; i++) {
        const p = posAt((i / (TRAJ_N - 1)) * T);
        attr.setXYZ(i, p.x, Math.max(p.y, 0.01), p.z);
      }
      attr.needsUpdate = true;
      traj.computeLineDistances();
      // 发射架角度
      const a = THREE.MathUtils.degToRad(angleDeg);
      barrel.position.set(Math.cos(a) * 0.4, 0.25 + Math.sin(a) * 0.4, 0);
      barrel.rotation.z = a - Math.PI / 2;
      if (!flying) {
        ball.position.copy(posAt(0));
        const attr2 = flownGeo.getAttribute('position') as THREE.BufferAttribute;
        attr2.setXYZ(0, ball.position.x, ball.position.y, 0);
        flownGeo.setDrawRange(0, 1);
        attr2.needsUpdate = true;
      }
      const text = `v₀=${speed}m/s  θ=${angleDeg}°  射程≈${(v0().x * flightTime()).toFixed(1)}m`;
      infoLabel.material.map?.dispose();
      infoLabel.material.dispose();
      const nl = makeLabel(text, { fontSize: 38, scale: 0.95, color: '#0f766e' });
      infoLabel.material = nl.material;
      infoLabel.scale.copy(nl.scale);
    };
    rebuildTrajectory();

    const applyStep = () => {
      vxLabel.visible = step >= 1;
      vyLabel.visible = step >= 2;
    };

    return {
      setStep(i) {
        step = i;
        applyStep();
      },
      setParam(id, value) {
        if (id === 'angle') angleDeg = Number(value);
        if (id === 'speed') speed = Number(value);
        if (id === 'fire') {
          flying = true;
          t = 0;
        }
        if (id !== 'fire') rebuildTrajectory();
      },
      update(dt) {
        if (flying) {
          t += dt;
          const p = posAt(t);
          if (p.y <= 0.01 && t > 0.1) {
            flying = false;
            ball.position.copy(posAt(flightTime()));
            ball.position.y = 0.22;
          } else {
            ball.position.copy(p);
          }
          // 已飞轨迹
          const attr = flownGeo.getAttribute('position') as THREE.BufferAttribute;
          const n = Math.min(Math.floor((t / flightTime()) * TRAJ_N) + 1, TRAJ_N);
          for (let i = 0; i < n; i++) {
            const q = posAt((i / (TRAJ_N - 1)) * Math.min(t, flightTime()));
            attr.setXYZ(i, q.x, Math.max(q.y, 0.02), q.z);
          }
          flownGeo.setDrawRange(0, n);
          attr.needsUpdate = true;
        }
        // 速度分量箭头贴着小球
        const v = v0();
        const vy = flying ? v.y - G * t : v.y;
        const vxLen = v.x * 0.12;
        const vyLen = Math.abs(vy) * 0.12;
        const show = step >= 1 || flying;
        vxArrow.visible = show;
        vyArrow.visible = show;
        vxArrow.position.copy(ball.position);
        vxArrow.scale.set(1, Math.max(vxLen, 0.001), 1);
        vxArrow.rotation.z = -Math.PI / 2; // 指向 +x
        vyArrow.position.copy(ball.position);
        vyArrow.scale.set(1, Math.max(vyLen, 0.001), 1);
        vyArrow.rotation.z = vy >= 0 ? 0 : Math.PI;
        vxLabel.position.copy(ball.position).add(new THREE.Vector3(1.6, -0.5, 0));
        vyLabel.position.copy(ball.position).add(new THREE.Vector3(-1.2, 1.2, 0));
      },
      dispose() {
        ctx.scene.remove(base, barrel, barrelLabel, ball, traj, flown, vxArrow, vyArrow, vxLabel, vyLabel, infoLabel);
        trajGeo.dispose();
        flownGeo.dispose();
      },
    };
  },
};
