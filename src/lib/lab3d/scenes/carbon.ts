// ---------------------------------------------------------------------------
// 化学 · 碳和碳的氧化物：倾倒 CO2 灭蜡烛 / 石灰水变浑浊 / 金刚石与石墨
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, cylinderBetween, damp, disposeObject, makeLabel, std } from '../three-utils';

const GLASS = (op = 0.26) =>
  std('#dbeafe', { transparent: true, opacity: op, side: THREE.DoubleSide, roughness: 0.15 });

interface Demo {
  group: THREE.Group;
  trigger(): void;
  update(dt: number, elapsed: number): void;
}

const v3 = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);

export const carbonScene: Scene3DDefinition = {
  id: 'chem-carbon',
  title: '碳和碳的氧化物',
  subject: '化学',
  grade: '9上',
  icon: '🕯️',
  tagline: '把二氧化碳倒进烧杯，蜡烛由下而上依次熄灭',
  keywords: ['二氧化碳', '一氧化碳', '石灰水', '灭火', '温室效应', '金刚石', '石墨', '碳单质'],
  camera: { position: [5.5, 4, 9.5], target: [-0.3, 1.5, 0] },
  controls: [
    {
      kind: 'select',
      id: 'demo',
      label: '实验',
      options: [
        { value: 'pour', label: '倾倒二氧化碳灭火' },
        { value: 'limewater', label: '通入澄清石灰水' },
        { value: 'allotrope', label: '金刚石与石墨' },
      ],
      defaultValue: 'pour',
    },
    { kind: 'button', id: 'go', label: '▶ 开始' },
  ],
  steps: [
    {
      title: '二氧化碳灭火',
      text: '集气瓶里是二氧化碳。把它沿着烧杯壁慢慢倒进去——看，下面的蜡烛先灭，上面的蜡烛后灭！这说明二氧化碳密度比空气大，会沉在底部慢慢"涨"上来；它自己不燃烧，也不支持燃烧，所以能用来灭火。',
    },
    {
      title: '石灰水检验',
      text: '把气体通入澄清的石灰水，石灰水慢慢变浑浊了——那是反应生成的白色碳酸钙小颗粒。"澄清石灰水变浑浊"，就是检验二氧化碳的招牌现象。',
    },
    {
      title: '一氧化碳有毒',
      text: '碳在氧气不足时燃烧，会生成一氧化碳。它无色、无味，却有剧毒：它会抢在氧气前面与血红蛋白结合，让人体缺氧，这就是煤气中毒。冬天用煤炉取暖，一定要开窗通风、装好烟囱。',
    },
    {
      title: '金刚石与石墨',
      text: '金刚石和石墨都是由碳原子组成的，性质却天差地别：金刚石里碳原子搭成立体的正四面体骨架，是天然存在的最硬物质；石墨是一层层的六边形网，层与层之间容易滑动，所以柔软，能做铅笔芯和电极。原子排列方式不同，性质就不同。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 14);
    const root = new THREE.Group();
    ctx.scene.add(root);
    let step = 0;
    let active = 'pour';

    // ================= 演示一：倾倒 CO2 灭蜡烛 =================
    const pourDemo = ((): Demo => {
      const g = new THREE.Group();
      root.add(g);
      const BX = -0.3; // 烧杯中心
      // 烧杯
      const beaker = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.05, 2.6, 30, 1, true), GLASS());
      beaker.position.set(BX, 1.3, 0);
      g.add(beaker);
      const beakerBottom = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.06, 30), GLASS(0.4));
      beakerBottom.position.set(BX, 0.03, 0);
      g.add(beakerBottom);
      // 阶梯 + 蜡烛两支
      const mkCandle = (x: number, z: number, stepH: number) => {
        const stepBox = new THREE.Mesh(new THREE.BoxGeometry(0.7, stepH, 0.7), std('#a8a29e'));
        stepBox.position.set(x, stepH / 2, z);
        g.add(stepBox);
        const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.45, 12), std('#fef3c7'));
        wax.position.set(x, stepH + 0.225, z);
        g.add(wax);
        const flame = new THREE.Mesh(
          new THREE.ConeGeometry(0.09, 0.3, 10),
          std('#fb923c', { emissive: '#f97316', emissiveIntensity: 1.5, transparent: true, opacity: 0.95 }),
        );
        flame.position.set(x, stepH + 0.62, z);
        g.add(flame);
        return flame;
      };
      const flameLow = mkCandle(BX - 0.55, 0.35, 0.5);
      const flameHigh = mkCandle(BX + 0.45, -0.35, 1.1);
      // CO2 液位（半透明淡蓝）
      const co2 = new THREE.Mesh(
        new THREE.CylinderGeometry(1.0, 0.95, 1, 26),
        std('#bae6fd', { transparent: true, opacity: 0.4, roughness: 0.2 }),
      );
      co2.position.set(BX, 0.03, 0);
      co2.scale.y = 0.01;
      g.add(co2);
      // 集气瓶（倾倒）+ 气流
      const bottle = new THREE.Group();
      bottle.position.set(BX - 2.3, 2.5, 0);
      g.add(bottle);
      const bWall = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.3, 20, 1, true), GLASS());
      bottle.add(bWall);
      const bGas = new THREE.Mesh(
        new THREE.CylinderGeometry(0.38, 0.38, 1.2, 18),
        std('#bae6fd', { transparent: true, opacity: 0.45, roughness: 0.2 }),
      );
      bottle.add(bGas);
      const bLabel = makeLabel('二氧化碳', { fontSize: 36, scale: 0.85, color: '#0369a1' });
      bLabel.position.set(BX - 2.3, 3.6, 0);
      g.add(bLabel);
      const streamMat = std('#bae6fd', { transparent: true, opacity: 0, roughness: 0.2 });
      const stream1 = cylinderBetween(v3(BX - 1.75, 1.95), v3(BX - 1.15, 1.5), 0.09, streamMat);
      const stream2 = cylinderBetween(v3(BX - 1.15, 1.5), v3(BX - 0.85, 0.4), 0.09, streamMat);
      g.add(stream1, stream2);
      // 现象标签
      const title = makeLabel('倾倒二氧化碳灭火', { fontSize: 42, scale: 1 });
      title.position.set(BX, 4.3, 0);
      g.add(title);
      const lowLabel = makeLabel('下层蜡烛先灭', { fontSize: 38, scale: 0.9, color: '#b45309' });
      lowLabel.position.set(BX - 0.6, 3.6, 0);
      lowLabel.visible = false;
      g.add(lowLabel);
      const highLabel = makeLabel('上层蜡烛后灭', { fontSize: 38, scale: 0.9, color: '#b91c1c' });
      highLabel.position.set(BX + 0.4, 3.95, 0);
      highLabel.visible = false;
      g.add(highLabel);
      let t = -1;
      let lowOut = false;
      let highOut = false;
      return {
        group: g,
        trigger() {
          t = 0;
          lowOut = false;
          highOut = false;
          flameLow.visible = true;
          flameHigh.visible = true;
          lowLabel.visible = false;
          highLabel.visible = false;
        },
        update(dt, elapsed) {
          // 烛光抖动
          [flameLow, flameHigh].forEach((f) => {
            if (f.visible) f.scale.setScalar(1 + Math.sin(elapsed * 17 + f.position.x * 5) * 0.12);
          });
          if (t < 0) return;
          t += dt;
          // 0~1s 集气瓶倾斜；1~5s 注入；5s 后回正
          const tiltIn = THREE.MathUtils.clamp(t / 1, 0, 1);
          const tiltOut = t > 5 ? THREE.MathUtils.clamp((t - 5) / 1, 0, 1) : 0;
          bottle.rotation.z = (tiltIn - tiltOut) * 0.85;
          const pouring = t > 1 && t < 5;
          streamMat.opacity = damp(streamMat.opacity, pouring ? 0.55 : 0, 5, dt);
          const level = THREE.MathUtils.clamp((t - 1) / 4, 0, 1) * 1.9;
          co2.scale.y = Math.max(level, 0.01);
          co2.position.y = 0.03 + level / 2;
          const lowY = 0.5 + 0.62;
          const highY = 1.1 + 0.62;
          if (!lowOut && level + 0.03 > lowY) {
            lowOut = true;
            lowLabel.visible = true;
          }
          if (!highOut && level + 0.03 > highY) {
            highOut = true;
            highLabel.visible = true;
          }
          if (lowOut && flameLow.visible) {
            flameLow.scale.multiplyScalar(Math.max(1 - dt * 4, 0.01));
            if (flameLow.scale.x < 0.06) flameLow.visible = false;
          }
          if (highOut && flameHigh.visible) {
            flameHigh.scale.multiplyScalar(Math.max(1 - dt * 4, 0.01));
            if (flameHigh.scale.x < 0.06) flameHigh.visible = false;
          }
          if (t > 7) t = -1;
        },
      };
    })();

    // ================= 演示二：澄清石灰水变浑浊 =================
    const limewaterDemo = ((): Demo => {
      const g = new THREE.Group();
      root.add(g);
      // 铁架台
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 8), std('#64748b'));
      rod.position.set(-0.9, 1.3, -0.25);
      g.add(rod);
      const standBase = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.45), std('#475569'));
      standBase.position.set(-0.9, 0.04, -0.25);
      g.add(standBase);
      // 试管
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 1.8, 20, 1, true), GLASS());
      tube.position.set(0, 1.15, 0);
      g.add(tube);
      const tubeBottom = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), GLASS());
      tubeBottom.position.set(0, 0.25, 0);
      g.add(tubeBottom);
      // 石灰水（清 → 浊）
      const liquidMat = std('#f8fafc', { transparent: true, opacity: 0.3, roughness: 0.15 });
      const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.85, 18), liquidMat);
      liquid.position.set(0, 0.72, 0);
      g.add(liquid);
      // 导气管
      const tubeMat = std('#94a3b8');
      g.add(cylinderBetween(v3(1.1, 2.3), v3(0.12, 2.05), 0.045, tubeMat));
      g.add(cylinderBetween(v3(0.12, 2.05), v3(0.05, 0.5), 0.045, tubeMat));
      // 气泡池
      const bubbleGeo = new THREE.SphereGeometry(0.05, 8, 6);
      const bubbleMat = std('#f0f9ff', { transparent: true, opacity: 0.85 });
      const bubbles: { mesh: THREE.Mesh; life: number }[] = [];
      for (let i = 0; i < 14; i++) {
        const m = new THREE.Mesh(bubbleGeo, bubbleMat);
        m.visible = false;
        g.add(m);
        bubbles.push({ mesh: m, life: 1 });
      }
      // 碳酸钙白色微粒（逐渐显现并悬浮）
      const caco3Geo = new THREE.SphereGeometry(0.028, 6, 5);
      const caco3Mat = std('#e7e5e4', { transparent: true, opacity: 0.95 });
      const particles: { mesh: THREE.Mesh; phase: number }[] = [];
      let seed = 13;
      const srnd = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };
      for (let i = 0; i < 42; i++) {
        const m = new THREE.Mesh(caco3Geo, caco3Mat);
        const a = srnd() * Math.PI * 2;
        const r = srnd() * 0.24;
        m.position.set(Math.cos(a) * r, 0.35 + srnd() * 0.7, Math.sin(a) * r);
        m.visible = false;
        g.add(m);
        particles.push({ mesh: m, phase: srnd() * Math.PI * 2 });
      }
      const title = makeLabel('二氧化碳通入澄清石灰水', { fontSize: 42, scale: 1 });
      title.position.set(0, 3.5, 0);
      g.add(title);
      const note = makeLabel('变浑浊：生成碳酸钙', { fontSize: 40, scale: 0.95, color: '#b45309' });
      note.position.set(0, 2.85, 0);
      note.visible = false;
      g.add(note);
      let turbid = 0;
      let target = 0;
      let bubbleTimer = 0;
      return {
        group: g,
        trigger() {
          turbid = 0;
          target = 1;
          note.visible = false;
        },
        update(dt, elapsed) {
          turbid = damp(turbid, target, 0.5, dt);
          liquidMat.opacity = 0.3 + turbid * 0.55;
          liquidMat.color.set(turbid > 0.4 ? '#e7e5e4' : '#f8fafc');
          note.visible = turbid > 0.45;
          const showN = Math.floor(turbid * particles.length);
          particles.forEach((p, i) => {
            p.mesh.visible = i < showN;
            if (p.mesh.visible) {
              p.mesh.position.y += Math.sin(elapsed * 1.5 + p.phase) * dt * 0.05;
            }
          });
          if (target > 0 && turbid < 0.98) {
            bubbleTimer += dt;
            if (bubbleTimer > 0.15) {
              bubbleTimer = 0;
              const b = bubbles.find((x) => x.life >= 1);
              if (b) {
                b.life = 0;
                b.mesh.visible = true;
                b.mesh.position.set(0.05, 0.5, 0);
                b.mesh.scale.setScalar(0.7 + Math.random() * 0.5);
              }
            }
          }
          bubbles.forEach((b) => {
            if (b.life >= 1) return;
            b.life += dt * 0.8;
            b.mesh.position.y += dt * 0.9;
            if (b.mesh.position.y > 1.1 || b.life >= 1) {
              b.life = 1;
              b.mesh.visible = false;
            }
          });
        },
      };
    })();

    // ================= 演示三：金刚石与石墨 =================
    const allotropeDemo = ((): Demo => {
      const g = new THREE.Group();
      root.add(g);
      const cGeoD = new THREE.SphereGeometry(0.16, 14, 10);
      const cMatD = std('#475569');
      const bondMatD = std('#94a3b8');
      // ---- 金刚石碎片：中心 + 4 近邻 + 6 次外层 ----
      const diamond = new THREE.Group();
      diamond.position.set(-1.7, 1.7, 0);
      g.add(diamond);
      const tet = [
        v3(1, 1, 1),
        v3(1, -1, -1),
        v3(-1, 1, -1),
        v3(-1, -1, 1),
      ].map((d) => d.normalize());
      const dPts: THREE.Vector3[] = [v3(0, 0, 0)];
      tet.forEach((d) => dPts.push(d.clone().multiplyScalar(0.55)));
      for (let i = 0; i < 4; i++)
        for (let j = i + 1; j < 4; j++) {
          dPts.push(tet[i].clone().add(tet[j]).multiplyScalar(0.55));
        }
      dPts.forEach((p) => {
        const m = new THREE.Mesh(cGeoD, cMatD);
        m.position.copy(p);
        diamond.add(m);
      });
      tet.forEach((d) => {
        diamond.add(cylinderBetween(v3(0, 0, 0), d.clone().multiplyScalar(0.55), 0.05, bondMatD));
      });
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++) {
          if (i === j) continue;
          const end = tet[i].clone().add(tet[j]).multiplyScalar(0.55);
          diamond.add(cylinderBetween(tet[i].clone().multiplyScalar(0.55), end, 0.05, bondMatD));
        }
      // ---- 石墨：三层六边形网 ----
      const graphite = new THREE.Group();
      graphite.position.set(1.8, 1.7, 0);
      g.add(graphite);
      const r = 0.42;
      const centers: [number, number][] = [
        [0, 0],
        [1.5 * r, Math.sqrt(3) * 0.5 * r],
        [1.5 * r, -Math.sqrt(3) * 0.5 * r],
        [0, Math.sqrt(3) * r],
        [0, -Math.sqrt(3) * r],
      ];
      const cGeoG = new THREE.SphereGeometry(0.11, 12, 8);
      const cMatG = std('#334155');
      const bondMatG = std('#64748b');
      [-0.55, 0, 0.55].forEach((ly, li) => {
        const layer = new THREE.Group();
        layer.position.y = ly;
        if (li === 1) layer.position.x = 0.2;
        graphite.add(layer);
        const verts = new Map<string, THREE.Vector3>();
        centers.forEach(([cx, cz]) => {
          for (let k = 0; k < 6; k++) {
            const a = (k * Math.PI) / 3;
            const vx = cx + Math.cos(a) * r;
            const vz = cz + Math.sin(a) * r;
            const key = `${vx.toFixed(2)},${vz.toFixed(2)}`;
            if (!verts.has(key)) verts.set(key, v3(vx, 0, vz));
          }
        });
        const list = [...verts.values()];
        list.forEach((p) => {
          const m = new THREE.Mesh(cGeoG, cMatG);
          m.position.copy(p);
          layer.add(m);
        });
        for (let i = 0; i < list.length; i++)
          for (let j = i + 1; j < list.length; j++) {
            if (Math.abs(list[i].distanceTo(list[j]) - r) < 0.05) {
              layer.add(cylinderBetween(list[i], list[j], 0.035, bondMatG));
            }
          }
      });
      // 标签
      const dLabel = makeLabel('金刚石：正四面体骨架 → 坚硬', { fontSize: 36, scale: 0.85 });
      dLabel.position.set(-1.7, 3.3, 0);
      g.add(dLabel);
      const gLabel = makeLabel('石墨：层状结构 → 柔软导电', { fontSize: 36, scale: 0.85 });
      gLabel.position.set(1.8, 3.3, 0);
      g.add(gLabel);
      const title = makeLabel('同是碳原子，排列不同、性质不同', { fontSize: 42, scale: 1, color: '#b45309' });
      title.position.set(0, 4.2, 0);
      g.add(title);
      return {
        group: g,
        trigger() {},
        update(dt) {
          diamond.rotation.y += dt * 0.35;
          graphite.rotation.y += dt * 0.3;
        },
      };
    })();

    // ---- 一氧化碳警示（第 3 步）----
    const coLabel = makeLabel('一氧化碳：无色无味、剧毒，注意通风！', {
      fontSize: 40,
      scale: 0.95,
      color: '#b91c1c',
    });
    coLabel.position.set(-0.3, 4.9, 0);
    coLabel.visible = false;
    root.add(coLabel);

    const demos: Record<string, Demo> = {
      pour: pourDemo,
      limewater: limewaterDemo,
      allotrope: allotropeDemo,
    };
    const show = (key: string) => {
      active = key;
      Object.entries(demos).forEach(([k, d]) => (d.group.visible = k === key));
    };
    show('pour');

    return {
      setStep(i) {
        step = i;
        coLabel.visible = step === 2;
        if (i === 0) show('pour');
        if (i === 1) show('limewater');
        if (i === 2) show('pour');
        if (i === 3) show('allotrope');
        demos[active].trigger();
      },
      setParam(id, value) {
        if (id === 'demo') show(String(value));
        if (id === 'go') demos[active].trigger();
      },
      update(dt, elapsed) {
        Object.values(demos).forEach((d) => {
          if (d.group.visible) d.update(dt, elapsed);
        });
      },
      dispose() {
        ctx.scene.remove(root);
        disposeObject(root);
      },
    };
  },
};
