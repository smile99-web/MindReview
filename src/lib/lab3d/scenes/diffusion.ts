// ---------------------------------------------------------------------------
// 化学 · 分子热运动与扩散：隔板抽走后两种气体逐渐混合，温度越高越快
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, makeLabel, std } from '../three-utils';

const BOX = { x: 7, y: 3.4, z: 3 };
const N_EACH = 42;

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
}

export const diffusionScene: Scene3DDefinition = {
  id: 'chem-diffusion',
  title: '分子热运动与扩散',
  subject: '化学',
  icon: '🌫️',
  tagline: '抽走隔板看两种气体自发混合——分子在不停地做无规则运动',
  keywords: ['分子运动', '扩散', '热运动', '温度', '分子动理论', '微粒', '无规则运动'],
  camera: { position: [6.5, 4.5, 8.5], target: [0, 1.4, 0] },
  controls: [
    {
      kind: 'slider',
      id: 'temp',
      label: '温度',
      min: 0,
      max: 100,
      step: 1,
      defaultValue: 30,
      unit: '℃',
    },
    { kind: 'button', id: 'reset', label: '↺ 重新隔开' },
  ],
  steps: [
    {
      title: '分子在不停运动',
      text: '盒子左边是红色气体，右边是蓝色气体，中间隔着挡板。仔细看，每一个分子都在不停地做无规则运动，这就是分子的热运动。',
    },
    {
      title: '扩散现象',
      text: '抽走挡板！两种不同的分子由于不停地运动，会逐渐进入对方占据的空间，最后均匀混合。这种自发混合的现象叫做扩散。扩散说明分子在运动，分子之间还有间隙。',
    },
    {
      title: '温度的影响',
      text: '拖动温度滑块试试：温度越高，分子运动越剧烈，扩散也就越快。所以热水里糖化得快，腌咸菜则要很久才入味。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 14);
    let step = 0;
    let tempK = 0.55; // 速度系数（随温度滑块变化）
    const particles: Particle[] = [];

    // 容器（线框盒 + 半透明地板）
    const boxGeo = new THREE.BoxGeometry(BOX.x, BOX.y, BOX.z);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(boxGeo),
      new THREE.LineBasicMaterial({ color: '#64748b' }),
    );
    edges.position.y = BOX.y / 2;
    ctx.scene.add(edges);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(BOX.x, BOX.z),
      std('#e0f2fe', { transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.01;
    ctx.scene.add(floor);

    // 中间隔板
    const divider = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, BOX.y, BOX.z),
      std('#f59e0b', { transparent: true, opacity: 0.85 }),
    );
    divider.position.y = BOX.y / 2;
    ctx.scene.add(divider);

    const label = makeLabel('红、蓝两种气体分子', { fontSize: 40, scale: 0.95 });
    label.position.set(0, BOX.y + 0.8, 0);
    ctx.scene.add(label);

    // 粒子
    const pGeo = new THREE.SphereGeometry(0.11, 10, 8);
    const redMat = std('#ef4444', { emissive: '#991b1b', emissiveIntensity: 0.3 });
    const blueMat = std('#3b82f6', { emissive: '#1e40af', emissiveIntensity: 0.3 });
    const seedRand = (() => {
      let s = 42;
      return () => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
      };
    })();
    for (let i = 0; i < N_EACH * 2; i++) {
      const isRed = i < N_EACH;
      const mesh = new THREE.Mesh(pGeo, isRed ? redMat : blueMat);
      ctx.scene.add(mesh);
      particles.push({ mesh, vel: new THREE.Vector3() });
    }

    const scatter = (withDivider: boolean) => {
      particles.forEach((p, i) => {
        const isRed = i < N_EACH;
        const xr = withDivider ? (isRed ? [-BOX.x / 2 + 0.3, -0.3] : [0.3, BOX.x / 2 - 0.3]) : [-BOX.x / 2 + 0.3, BOX.x / 2 - 0.3];
        p.mesh.position.set(
          xr[0] + seedRand() * (xr[1] - xr[0]),
          0.3 + seedRand() * (BOX.y - 0.6),
          -BOX.z / 2 + 0.3 + seedRand() * (BOX.z - 0.6),
        );
        p.vel.set(seedRand() - 0.5, seedRand() - 0.5, seedRand() - 0.5).normalize();
      });
    };
    scatter(true);

    return {
      setStep(i) {
        step = i;
        divider.visible = step === 0;
        // 进入第 2 步时抽走挡板：保持粒子当前位置，自然混合；
        // 回到第 1 步时重新分隔两侧，便于重复演示。
        if (step === 0) scatter(true);
      },
      setParam(id, value) {
        if (id === 'temp') tempK = 0.25 + (Number(value) / 100) * 1.1;
        if (id === 'reset') scatter(true);
      },
      update(dt) {
        const speed = 2.2 * tempK;
        particles.forEach((p) => {
          p.mesh.position.addScaledVector(p.vel, speed * dt);
          const pos = p.mesh.position;
          const r = 0.11;
          // 挡板存在时按所在侧限制活动范围
          let lo = -BOX.x / 2 + r;
          let hi = BOX.x / 2 - r;
          if (divider.visible) {
            if (pos.x < 0) hi = -0.04 - r;
            else lo = 0.04 + r;
          }
          if (pos.x < lo || pos.x > hi) {
            p.vel.x *= -1;
            pos.x = THREE.MathUtils.clamp(pos.x, lo, hi);
          }
          if (pos.y < r || pos.y > BOX.y - r) {
            p.vel.y *= -1;
            pos.y = THREE.MathUtils.clamp(pos.y, r, BOX.y - r);
          }
          if (pos.z < -BOX.z / 2 + r || pos.z > BOX.z / 2 - r) {
            p.vel.z *= -1;
            pos.z = THREE.MathUtils.clamp(pos.z, -BOX.z / 2 + r, BOX.z / 2 - r);
          }
        });
      },
      dispose() {
        particles.forEach((p) => ctx.scene.remove(p.mesh));
        pGeo.dispose();
        redMat.dispose();
        blueMat.dispose();
        ctx.scene.remove(edges);
        ctx.scene.remove(floor);
        ctx.scene.remove(divider);
        ctx.scene.remove(label);
      },
    };
  },
};
