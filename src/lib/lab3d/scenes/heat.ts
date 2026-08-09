// ---------------------------------------------------------------------------
// 物理 · 内能与比热容：相同的酒精灯加热水和沙子，对比升温快慢与微观热运动
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, damp, disposeObject, makeArrow, makeLabel, std } from '../three-utils';

const T0 = 25; // 初温 ℃
const T_MAX_W = 100;
const T_MAX_S = 160;
const RATE_W = 2.0; // 水升温速度 ℃/s
const RATE_S = 9.0; // 沙子升温速度 ℃/s（比热容小得多）
const GRAPH_T = 44; // 曲线时间窗口 s
const MAX_PTS = 200;

interface LabelOpts {
  fontSize?: number;
  color?: string;
  bg?: string;
  scale?: number;
}

export const heatScene: Scene3DDefinition = {
  id: 'phys-heat',
  title: '内能与比热容',
  subject: '物理',
  grade: '9全',
  icon: '🔥',
  tagline: '同样的火加热水和沙子，为什么沙子升温快得多？',
  keywords: ['内能', '比热容', '热传递', '做功', '温度', '热量', '分子动能'],
  camera: { position: [6, 4.2, 9.2], target: [0.9, 1.6, 0.2] },
  controls: [
    { kind: 'button', id: 'heat', label: '🔥 加热 / 停止' },
    { kind: 'button', id: 'reset', label: '↺ 重置' },
  ],
  steps: [
    {
      title: '内能是什么',
      text: '一切物体内部的分子都在不停地做无规则运动。分子动能和分子势能的总和，叫做物体的内能。看右下角的小视图：温度越高，分子运动越剧烈。一切物体，不管冷热，都有内能。',
    },
    {
      title: '做功与热传递',
      text: '改变内能有两种方式。酒精灯加热是热传递：热量从火焰传给烧杯，再传给水和沙子。反复弯折铁丝会发热、钻木能取火，那是做功。做功和热传递对改变内能是等效的。点加热按钮试试。',
    },
    {
      title: '比热容',
      text: '同样的火加热同样的时间，吸收的热量差不多，为什么沙子烫得多？因为水的比热容比沙子大得多。比热容小的沙子，吸收同样的热量，温度升得快。看右边两条曲线，斜率差别一目了然。',
    },
    {
      title: '比热容的应用',
      text: '水的比热容大，所以暖气里用水循环供热，汽车发动机用水箱来散热；海边昼夜温差比沙漠小，也是水的功劳。相同质量的水和沙子降低同样的温度，水能放出更多的热量。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 14);
    const root = new THREE.Group();
    ctx.scene.add(root);
    let step = 0;
    let heating = false;
    let tempW = T0;
    let tempS = T0;
    let graphT = 0;
    let sampleTimer = 0;
    let count = 0;

    // 动态文字标签（文字变化时重建贴图）
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

    // ---- 烧杯 + 酒精灯 + 温度计 --------------------------------------------
    interface Beaker {
      thermo: THREE.Mesh;
      flame: THREE.Mesh;
      setTemp: (t: string) => void;
    }
    const mkBeaker = (x: number, liquidColor: string, name: string, labelColor: string): Beaker => {
      const g = new THREE.Group();
      g.position.set(x, 0, 0.6);
      root.add(g);
      // 石棉网台
      const slab = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.07, 1.25), std('#94a3b8'));
      slab.position.y = 0.7;
      g.add(slab);
      for (const [lx, lz] of [[-0.5, -0.5], [0.5, -0.5], [0, 0.55]] as const) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 8), std('#64748b'));
        leg.position.set(lx, 0.35, lz);
        g.add(leg);
      }
      // 玻璃烧杯
      const glass = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.5, 1.3, 24, 1, true),
        std('#e0f2fe', { transparent: true, opacity: 0.28, side: THREE.DoubleSide, roughness: 0.15 }),
      );
      glass.position.y = 1.38;
      g.add(glass);
      const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), std('#e0f2fe', { transparent: true, opacity: 0.35 }));
      bottom.rotation.x = -Math.PI / 2;
      bottom.position.y = 0.74;
      g.add(bottom);
      // 液体（水或沙子）
      const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.45, 0.92, 20), std(liquidColor, { transparent: true, opacity: 0.85 }));
      liquid.position.y = 1.22;
      g.add(liquid);
      // 酒精灯
      const lampBody = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.24, 0.3, 16),
        std('#bae6fd', { transparent: true, opacity: 0.5, roughness: 0.15 }),
      );
      lampBody.position.set(0, 0.15, 0);
      g.add(lampBody);
      const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8), std('#78350f'));
      wick.position.set(0, 0.34, 0);
      g.add(wick);
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.13, 0.42, 12),
        std('#fb923c', { emissive: '#ea580c', emissiveIntensity: 1.4, transparent: true, opacity: 0.9 }),
      );
      flame.position.set(0, 0.56, 0);
      flame.visible = false;
      g.add(flame);
      // 温度计
      const tube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 1.35, 10),
        std('#f1f5f9', { transparent: true, opacity: 0.45, roughness: 0.15 }),
      );
      tube.position.set(0.26, 1.55, 0.1);
      g.add(tube);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), std('#dc2626', { emissive: '#b91c1c', emissiveIntensity: 0.4 }));
      bulb.position.set(0.26, 0.92, 0.1);
      g.add(bulb);
      const thermo = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 1.15, 8), std('#ef4444', { emissive: '#dc2626', emissiveIntensity: 0.5 }));
      thermo.position.set(0.26, 1.0, 0.1);
      g.add(thermo);
      // 名称与温度标签
      const nameLabel = makeLabel(name, { fontSize: 42, scale: 1.0, color: labelColor });
      nameLabel.position.set(0, 1.15, 1.25);
      g.add(nameLabel);
      const setTemp = dynLabel(`${name} ${T0}℃`, { fontSize: 38, scale: 0.9, color: labelColor }, new THREE.Vector3(x + 0.26, 2.55, 0.7));
      return { thermo, flame, setTemp };
    };
    const water = mkBeaker(-2.2, '#38bdf8', '水', '#0369a1');
    const sand = mkBeaker(0.2, '#d9a44a', '沙子', '#92400e');

    const sameLabel = makeLabel('相同的酒精灯，同时加热', { fontSize: 34, scale: 0.8 });
    sameLabel.position.set(-1, 0.42, 2.1);
    root.add(sameLabel);

    // ---- 升温曲线面板 -------------------------------------------------------
    const panel = new THREE.Group();
    panel.position.set(3.55, 2.3, -0.35);
    root.add(panel);
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 2.6), std('#f8fafc', { transparent: true, opacity: 0.92, roughness: 0.9 }));
    panel.add(bg);
    const frame = new THREE.LineSegments(
      new THREE.EdgesGeometry(bg.geometry),
      new THREE.LineBasicMaterial({ color: '#94a3b8' }),
    );
    frame.position.z = 0.005;
    panel.add(frame);
    // 温度网格线（T = 60 / 100 / 140）
    const gridMat = new THREE.LineBasicMaterial({ color: '#e2e8f0' });
    for (const t of [60, 100, 140]) {
      const y = -1.0 + ((t - 20) / 140) * 2.05;
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1.7, y, 0.01), new THREE.Vector3(1.7, y, 0.01)]),
        gridMat,
      );
      panel.add(line);
    }
    const gx = (t: number) => -1.7 + (t / GRAPH_T) * 3.4;
    const gy = (T: number) => -1.0 + ((T - 20) / 140) * 2.05;
    const mkCurve = (color: string) => {
      const pos = new Float32Array(MAX_PTS * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setDrawRange(0, 0);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
      panel.add(line);
      return { pos, geo };
    };
    const curveW = mkCurve('#0284c7');
    const curveS = mkCurve('#d97706');
    const headGeo = new THREE.SphereGeometry(0.05, 10, 8);
    const headW = new THREE.Mesh(headGeo, std('#0284c7', { emissive: '#0284c7', emissiveIntensity: 0.6 }));
    const headS = new THREE.Mesh(headGeo, std('#d97706', { emissive: '#d97706', emissiveIntensity: 0.6 }));
    panel.add(headW, headS);

    const titleL = makeLabel('升温曲线对比', { fontSize: 38, scale: 0.9 });
    titleL.position.set(0, 1.58, 0.1);
    panel.add(titleL);
    const legW = makeLabel('—— 水', { fontSize: 32, scale: 0.7, color: '#0284c7' });
    legW.position.set(-1.25, 1.32, 0.1);
    panel.add(legW);
    const legS = makeLabel('—— 沙子', { fontSize: 32, scale: 0.7, color: '#d97706' });
    legS.position.set(0.1, 1.32, 0.1);
    panel.add(legS);
    const axisY = makeLabel('温度 ℃', { fontSize: 30, scale: 0.65, color: '#64748b' });
    axisY.position.set(-2.2, 1.0, 0.1);
    panel.add(axisY);
    const axisX = makeLabel('时间 →', { fontSize: 30, scale: 0.65, color: '#64748b' });
    axisX.position.set(1.5, -1.35, 0.1);
    panel.add(axisX);

    const slopeLabel = makeLabel('沙子曲线陡得多 → 升温快得多', { fontSize: 34, scale: 0.85, color: '#b45309' });
    slopeLabel.position.set(3.3, 4.15, -0.2);
    slopeLabel.visible = false;
    root.add(slopeLabel);

    const applyLabel = makeLabel('水的比热容大 → 暖气用水、汽车水箱、海边温差小', { fontSize: 34, scale: 0.85, color: '#0369a1' });
    applyLabel.position.set(0.6, 4.3, 0.4);
    applyLabel.visible = false;
    root.add(applyLabel);

    // ---- 热传递箭头（step1） ------------------------------------------------
    const heatGroup = new THREE.Group();
    root.add(heatGroup);
    for (const x of [-2.2, 0.2]) {
      const arr = makeArrow('#f97316', { radius: 0.05, headRadius: 0.14, headLength: 0.3 });
      arr.set(new THREE.Vector3(x, 0.55, 1.15), new THREE.Vector3(x, 1.55, 0.85));
      heatGroup.add(arr.group);
    }
    const htLabel = makeLabel('热传递：火焰 → 烧杯 → 水/沙子', { fontSize: 34, scale: 0.85, color: '#c2410c' });
    htLabel.position.set(-1, 2.1, 1.5);
    heatGroup.add(htLabel);
    heatGroup.visible = false;

    // ---- 微观小视图（step0） ------------------------------------------------
    const micro = new THREE.Group();
    micro.position.set(-1, 1.3, 3.1);
    root.add(micro);
    const mBox = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.7, 1.05, 1.05)),
      new THREE.LineBasicMaterial({ color: '#64748b' }),
    );
    micro.add(mBox);
    const mLabel = makeLabel('微观：分子热运动', { fontSize: 32, scale: 0.75 });
    mLabel.position.set(0, 0.85, 0);
    micro.add(mLabel);
    const mGeo = new THREE.SphereGeometry(0.07, 8, 6);
    const mMat = std('#ef4444', { emissive: '#b91c1c', emissiveIntensity: 0.4 });
    const mParts: { mesh: THREE.Mesh; vel: THREE.Vector3 }[] = [];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(mGeo, mMat);
      m.position.set((Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8);
      micro.add(m);
      mParts.push({
        mesh: m,
        vel: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
      });
    }
    micro.visible = true;

    const setThermo = (mesh: THREE.Mesh, T: number) => {
      const frac = THREE.MathUtils.clamp((T - 20) / 140, 0.02, 1);
      mesh.scale.y = frac;
      mesh.position.y = 0.98 + (frac * 1.15) / 2;
    };

    const pushPoint = () => {
      const i3 = count * 3;
      curveW.pos[i3] = gx(graphT);
      curveW.pos[i3 + 1] = gy(tempW);
      curveW.pos[i3 + 2] = 0.04;
      curveS.pos[i3] = gx(graphT);
      curveS.pos[i3 + 1] = gy(tempS);
      curveS.pos[i3 + 2] = 0.04;
      curveW.geo.attributes.position.needsUpdate = true;
      curveS.geo.attributes.position.needsUpdate = true;
      count += 1;
      curveW.geo.setDrawRange(0, count);
      curveS.geo.setDrawRange(0, count);
    };

    const applyStep = () => {
      micro.visible = step === 0;
      heatGroup.visible = step === 1;
      slopeLabel.visible = step === 2;
      applyLabel.visible = step === 3;
    };
    applyStep();

    return {
      setStep(i) {
        step = i;
        applyStep();
      },
      setParam(id) {
        if (id === 'heat') heating = !heating;
        if (id === 'reset') {
          heating = false;
          tempW = T0;
          tempS = T0;
          graphT = 0;
          sampleTimer = 0;
          count = 0;
          curveW.geo.setDrawRange(0, 0);
          curveS.geo.setDrawRange(0, 0);
        }
      },
      update(dt, elapsed) {
        if (heating) {
          tempW = Math.min(T_MAX_W, tempW + RATE_W * dt);
          tempS = Math.min(T_MAX_S, tempS + RATE_S * dt);
        }
        if (graphT < GRAPH_T) {
          graphT += dt;
          sampleTimer += dt;
          if (sampleTimer >= GRAPH_T / MAX_PTS && count < MAX_PTS) {
            sampleTimer = 0;
            pushPoint();
          }
        }
        // 火焰闪烁
        for (const b of [water, sand]) {
          b.flame.visible = heating;
          if (heating) {
            const s = 1 + 0.15 * Math.sin(elapsed * 17 + b.flame.position.x);
            b.flame.scale.set(s, 1 + 0.25 * Math.sin(elapsed * 13 + b.flame.position.z), s);
          }
        }
        setThermo(water.thermo, tempW);
        setThermo(sand.thermo, tempS);
        water.setTemp(`水 ${Math.round(tempW)}℃`);
        sand.setTemp(`沙子 ${Math.round(tempS)}℃`);
        // 曲线头圆点
        headW.position.set(gx(Math.min(graphT, GRAPH_T)), gy(tempW), 0.06);
        headS.position.set(gx(Math.min(graphT, GRAPH_T)), gy(tempS), 0.06);
        // 热传递箭头脉动
        if (heatGroup.visible) {
          const s = 1 + 0.08 * Math.sin(elapsed * 5);
          heatGroup.scale.set(s, s, s);
        }
        // 微观粒子：平均温度越高，运动越剧烈
        if (micro.visible) {
          const norm = ((tempW + tempS) / 2 - T0) / 135;
          const speed = 0.5 + norm * 2.4;
          for (const p of mParts) {
            p.mesh.position.addScaledVector(p.vel, speed * dt);
            const q = p.mesh.position;
            if (Math.abs(q.x) > 0.78) p.vel.x *= -1;
            if (Math.abs(q.y) > 0.45) p.vel.y *= -1;
            if (Math.abs(q.z) > 0.45) p.vel.z *= -1;
            q.x = THREE.MathUtils.clamp(q.x, -0.78, 0.78);
            q.y = THREE.MathUtils.clamp(q.y, -0.45, 0.45);
            q.z = THREE.MathUtils.clamp(q.z, -0.45, 0.45);
          }
          mMat.emissiveIntensity = 0.3 + norm * 0.9;
        }
        // 标签呼吸提示加热状态
        sameLabel.material.opacity = damp(sameLabel.material.opacity, heating ? 1 : 0.55, 6, dt);
      },
      dispose() {
        ctx.scene.remove(root);
        disposeObject(root);
      },
    };
  },
};
