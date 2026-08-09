// ---------------------------------------------------------------------------
// 物理 · 光的反射与折射：激光射向水面，演示反射定律、折射定律与全反射
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, makeLabel, std } from '../three-utils';

const N_AIR = 1.0;
const N_WATER = 1.33;
const WATER_Y = 1.4; // 水面高度
const HIT = new THREE.Vector3(0, WATER_Y, 0);

export const lightScene: Scene3DDefinition = {
  id: 'phys-light',
  title: '光的反射与折射',
  subject: '物理',
  icon: '🔦',
  tagline: '激光射入水中：反射角等于入射角，折射光线偏向法线',
  keywords: ['光', '反射', '折射', '入射角', '反射角', '折射角', '法线', '全反射', '光的传播', '透镜'],
  camera: { position: [5.5, 4, 8], target: [0, 1.2, 0] },
  controls: [
    { kind: 'slider', id: 'angle', label: '入射角', min: 5, max: 85, step: 1, defaultValue: 35, unit: '°' },
  ],
  steps: [
    {
      title: '光的反射',
      text: '红色激光从空气射到水面，一部分被反射回空气，这就是绿色光线。反射光线和入射光线分居法线两侧，反射角总是等于入射角，这就是光的反射定律。',
    },
    {
      title: '光的折射',
      text: '另一部分光钻进水里继续传播，但是方向偏折了，这就是橙色光线。光从空气斜射入水中时，折射角小于入射角，光线向法线偏折。所以筷子插进水里看起来像折断了。',
    },
    {
      title: '全反射',
      text: '现在把光源移到水下向上照射。当入射角超过约四十九度的临界角时，光不再折射出水面，而是全部被反射回水中，这叫全反射。光纤就是利用全反射把光信号传到千里之外。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 12);
    let step = 0;
    let angleDeg = 35;

    // 水体（半透明蓝色盒子）
    const water = new THREE.Mesh(
      new THREE.BoxGeometry(9, WATER_Y, 5),
      std('#7dd3fc', { transparent: true, opacity: 0.3, roughness: 0.1 }),
    );
    water.position.y = WATER_Y / 2;
    ctx.scene.add(water);
    const waterLabel = makeLabel('水', { fontSize: 40, scale: 0.9, color: '#0369a1', bg: 'rgba(255,255,255,0.6)' });
    waterLabel.position.set(-4, 0.5, 0);
    ctx.scene.add(waterLabel);
    const airLabel = makeLabel('空气', { fontSize: 40, scale: 0.9, color: '#475569', bg: 'rgba(255,255,255,0.6)' });
    airLabel.position.set(-4, 3.4, 0);
    ctx.scene.add(airLabel);

    // 法线（竖直虚线）
    const normal = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, WATER_Y - 1.8, 0),
        new THREE.Vector3(0, WATER_Y + 2.6, 0),
      ]),
      new THREE.LineDashedMaterial({ color: '#64748b', dashSize: 0.15, gapSize: 0.1 }),
    );
    normal.computeLineDistances();
    ctx.scene.add(normal);
    const normalLabel = makeLabel('法线', { fontSize: 34, scale: 0.75 });
    normalLabel.position.set(0.75, WATER_Y + 2.6, 0);
    ctx.scene.add(normalLabel);

    // 光源
    const source = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 16, 12),
      std('#f8fafc', { emissive: '#dc2626', emissiveIntensity: 1.2 }),
    );
    ctx.scene.add(source);
    const sourceLabel = makeLabel('激光源', { fontSize: 34, scale: 0.75, color: '#b91c1c' });
    ctx.scene.add(sourceLabel);

    // 光线（细圆柱）：入射红、反射绿、折射橙
    const mkRay = (color: string) => {
      const ray = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 8), std(color, { emissive: color, emissiveIntensity: 0.9 }));
      ctx.scene.add(ray);
      return ray;
    };
    const incident = mkRay('#ef4444');
    const reflected = mkRay('#22c55e');
    const refracted = mkRay('#f97316');

    const angleLabel = makeLabel('', { fontSize: 36, scale: 0.85, color: '#1d4ed8' });
    angleLabel.position.set(0, WATER_Y + 3.6, 0);
    ctx.scene.add(angleLabel);

    const setRay = (ray: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3) => {
      const dir = new THREE.Vector3().subVectors(to, from);
      const len = dir.length();
      ray.scale.y = len;
      ray.position.copy(from).addScaledVector(dir, 0.5);
      ray.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    };

    let lastText = '';
    const setInfo = (text: string) => {
      if (text === lastText) return;
      lastText = text;
      angleLabel.material.map?.dispose();
      angleLabel.material.dispose();
      const nl = makeLabel(text, { fontSize: 36, scale: 0.85, color: '#1d4ed8' });
      angleLabel.material = nl.material;
      angleLabel.scale.copy(nl.scale);
    };

    const L = 3.2; // 光线显示长度

    return {
      setStep(i) {
        step = i;
      },
      setParam(id, value) {
        if (id === 'angle') angleDeg = Number(value);
      },
      update() {
        const theta = THREE.MathUtils.degToRad(angleDeg);
        const underwater = step >= 2;
        const n1 = underwater ? N_WATER : N_AIR;
        const n2 = underwater ? N_AIR : N_WATER;

        // 入射光线：从左上（或左下）射向 HIT
        const inDir = underwater
          ? new THREE.Vector3(Math.sin(theta), Math.cos(theta), 0) // 向上
          : new THREE.Vector3(Math.sin(theta), -Math.cos(theta), 0); // 向下
        const from = HIT.clone().addScaledVector(inDir, -L);
        setRay(incident, from, HIT);
        source.position.copy(from);
        sourceLabel.position.copy(from).add(new THREE.Vector3(-0.6, underwater ? -0.5 : 0.5, 0));

        // 反射光线（永远存在）
        const outDir = new THREE.Vector3(inDir.x, -inDir.y, 0).normalize();
        setRay(reflected, HIT, HIT.clone().addScaledVector(outDir, L));

        // 折射：斯涅尔定律 n1 sinθ1 = n2 sinθ2
        const sinT = (n1 / n2) * Math.sin(theta);
        if (sinT > 1) {
          refracted.visible = false;
          setInfo(`入射角 ${angleDeg}° 超过临界角 → 全反射！`);
        } else {
          refracted.visible = true;
          const theta2 = Math.asin(sinT);
          const refrDir = underwater
            ? new THREE.Vector3(Math.sin(theta2), Math.cos(theta2), 0)
            : new THREE.Vector3(Math.sin(theta2), -Math.cos(theta2), 0);
          setRay(refracted, HIT, HIT.clone().addScaledVector(refrDir, L));
          setInfo(
            underwater
              ? `入射角 ${angleDeg}° → 折射角 ${Math.round(THREE.MathUtils.radToDeg(theta2))}°（远离法线）`
              : `入射角 ${angleDeg}° → 折射角 ${Math.round(THREE.MathUtils.radToDeg(theta2))}°（靠近法线）`,
          );
        }
      },
      dispose() {
        ctx.scene.remove(water, waterLabel, airLabel, normal, normalLabel, source, sourceLabel, incident, reflected, refracted, angleLabel);
      },
    };
  },
};
