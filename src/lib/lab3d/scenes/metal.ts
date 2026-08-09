// ---------------------------------------------------------------------------
// 化学 · 金属活动性顺序：镁锌铁铜与稀盐酸反应对比 + 铁置换铜（湿法炼铜）
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, damp, disposeObject, makeLabel, std } from '../three-utils';

const TUBE_X = [-2.7, -0.9, 0.9, 2.7];
const TUBE_R = 0.32;
const TUBE_H = 1.7;
const LIQ_H = 1.05;
// 气泡速率（个/秒）：镁剧烈、锌较快、铁缓慢、铜不反应
const RATES = [13, 6.5, 2.2, 0];
const METAL_NAMES = ['镁条', '锌粒', '铁丝', '铜片'];
// 活动性顺序表（初中段）
const SERIES = ['钾', '钙', '钠', '镁', '铝', '锌', '铁', '锡', '铅', '氢', '铜', '汞', '银', '铂', '金'];
const ACTIVE_IDX = [3, 5, 6, 10]; // 镁 锌 铁 铜 高亮
const H_IDX = 9;

interface Bubble {
  mesh: THREE.Mesh;
  speed: number;
  active: boolean;
}
interface Tube {
  liquid: THREE.Mesh;
  metalTop: THREE.Vector3;
  bubbles: Bubble[];
  acc: number;
  rate: number;
}

export const metalScene: Scene3DDefinition = {
  id: 'chem-metal',
  title: '金属活动性顺序',
  subject: '化学',
  grade: '9下',
  icon: '🥇',
  tagline: '镁锌铁铜分别放进稀盐酸，气泡剧烈程度大不一样',
  keywords: ['金属', '活动性顺序', '置换反应', '镁', '锌', '铁', '铜', '金属与酸', '氢气', '湿法炼铜'],
  camera: { position: [7, 5, 9], target: [0, 1.6, 0] },
  controls: [
    { kind: 'button', id: 'acid', label: '🧪 加入稀盐酸' },
    {
      kind: 'select',
      id: 'demo',
      label: '演示',
      options: [
        { value: 'acid', label: '金属与酸' },
        { value: 'displace', label: '铁置换铜' },
      ],
      defaultValue: 'acid',
    },
  ],
  steps: [
    {
      title: '对比实验',
      text: '四支试管里分别放着镁条、锌粒、铁丝和铜片。加入等量的稀盐酸后仔细看：镁反应最剧烈，气泡又多又快；锌比较快；铁只有少量气泡慢慢冒出；铜片安安静静，没有任何变化。',
    },
    {
      title: '活动性顺序',
      text: '科学家按金属的活泼程度排出金属活动性顺序。排在氢前面的金属，能把酸里的氢置换出来，产生氢气；排在氢后面的铜就不行，所以铜片上没有气泡。',
    },
    {
      title: '越靠前越活泼',
      text: '位置越靠前，金属越活泼，反应也越剧烈，所以镁比锌快、锌比铁快、铁比铜强。记住这一段：钾钙钠镁铝，锌铁锡铅，氢，铜汞银铂金。氢是分界线。',
    },
    {
      title: '湿法炼铜',
      text: '活泼金属还能把不活泼金属从它的盐溶液里置换出来。看：铁钉放进蓝色的硫酸铜溶液，表面慢慢裹上一层红色的铜，溶液渐渐变成浅绿色。古人说"曾青得铁则化为铜"，就是这个道理。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 14);
    let step = 0;
    let mode: 'acid' | 'displace' = 'acid';
    let acidTarget = 0;
    let acidAmount = 0;
    let displaceProgress = 0;

    // ============================= 演示一：金属与酸 =============================
    const acidGroup = new THREE.Group();
    ctx.scene.add(acidGroup);

    const glassMat = std('#dbeafe', {
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      roughness: 0.12,
      metalness: 0,
    });
    // 试管架：底座 + 横杆
    const rackMat = std('#a8a29e', { roughness: 0.8 });
    const rackBase = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.14, 1.0), rackMat);
    rackBase.position.set(0, 0.07, 0);
    acidGroup.add(rackBase);
    const rackBar = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.09, 0.5), rackMat);
    rackBar.position.set(0, TUBE_H - 0.25, -0.15);
    acidGroup.add(rackBar);
    [-3.6, 3.6].forEach((x) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, TUBE_H - 0.3, 10), rackMat);
      post.position.set(x, (TUBE_H - 0.3) / 2 + 0.1, -0.15);
      acidGroup.add(post);
    });

    const liquidGeo = new THREE.CylinderGeometry(TUBE_R - 0.06, TUBE_R - 0.06, LIQ_H, 18);
    liquidGeo.translate(0, LIQ_H / 2, 0); // 从底部向上生长
    const bubbleGeo = new THREE.SphereGeometry(0.05, 8, 6);
    const bubbleMat = std('#f0f9ff', { transparent: true, opacity: 0.8, emissive: '#bae6fd', emissiveIntensity: 0.5 });

    const tubes: Tube[] = [];
    TUBE_X.forEach((x, i) => {
      // 玻璃试管
      const tubeMesh = new THREE.Mesh(new THREE.CylinderGeometry(TUBE_R, TUBE_R, TUBE_H, 20), glassMat);
      tubeMesh.position.set(x, TUBE_H / 2 + 0.14, 0);
      acidGroup.add(tubeMesh);
      const bottom = new THREE.Mesh(new THREE.SphereGeometry(TUBE_R, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), glassMat);
      bottom.position.set(x, 0.14, 0);
      acidGroup.add(bottom);

      // 金属样品
      const metalMat = std(i === 3 ? '#c2703e' : i === 0 ? '#e2e8f0' : i === 1 ? '#94a3b8' : '#57534e', {
        metalness: 0.75,
        roughness: 0.3,
      });
      let metalTop = new THREE.Vector3(x, 0.9, 0);
      if (i === 0) {
        // 镁条：银白色长条
        const mg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.04), metalMat);
        mg.position.set(x, 0.75, 0);
        mg.rotation.z = 0.16;
        acidGroup.add(mg);
        metalTop = new THREE.Vector3(x, 0.85, 0);
      } else if (i === 1) {
        // 锌粒：几颗小圆粒
        for (let k = 0; k < 4; k++) {
          const zn = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), metalMat);
          zn.position.set(x + (k % 2 === 0 ? -0.08 : 0.08), 0.24 + Math.floor(k / 2) * 0.12, (k % 2 === 0 ? 0.05 : -0.05));
          acidGroup.add(zn);
        }
        metalTop = new THREE.Vector3(x, 0.45, 0);
      } else if (i === 2) {
        // 铁丝：细长圆柱
        const fe = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.15, 8), metalMat);
        fe.position.set(x, 0.75, 0);
        fe.rotation.z = -0.14;
        acidGroup.add(fe);
        metalTop = new THREE.Vector3(x, 0.8, 0);
      } else {
        // 铜片：橙红色薄片
        const cu = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.85, 0.04), metalMat);
        cu.position.set(x, 0.62, 0);
        cu.rotation.z = 0.1;
        acidGroup.add(cu);
        metalTop = new THREE.Vector3(x, 0.7, 0);
      }

      // 液体（稀盐酸，加入后从底部升起）
      const liquid = new THREE.Mesh(
        liquidGeo,
        std('#fef9c3', { transparent: true, opacity: 0.6, roughness: 0.15 }),
      );
      liquid.position.set(x, 0.2, 0);
      liquid.scale.y = 0.001;
      liquid.visible = false;
      acidGroup.add(liquid);

      // 名称标签
      const nameLabel = makeLabel(METAL_NAMES[i], { fontSize: 40, scale: 0.9 });
      nameLabel.position.set(x, TUBE_H + 0.75, 0);
      acidGroup.add(nameLabel);

      // 气泡池
      const bubbles: Bubble[] = [];
      for (let b = 0; b < 26; b++) {
        const m = new THREE.Mesh(bubbleGeo, bubbleMat);
        m.visible = false;
        acidGroup.add(m);
        bubbles.push({ mesh: m, speed: 0.8 + Math.random() * 0.6, active: false });
      }
      tubes.push({ liquid, metalTop, bubbles, acc: 0, rate: RATES[i] });
    });

    // 铜"不反应"标签
    const noReactLabel = makeLabel('不反应', { fontSize: 36, scale: 0.85, color: '#b91c1c' });
    noReactLabel.position.set(TUBE_X[3], TUBE_H + 1.35, 0);
    noReactLabel.visible = false;
    acidGroup.add(noReactLabel);
    const h2Label = makeLabel('气泡是氢气', { fontSize: 34, scale: 0.8, color: '#0369a1' });
    h2Label.position.set(TUBE_X[0], TUBE_H + 1.35, 0);
    h2Label.visible = false;
    acidGroup.add(h2Label);

    // 活动性顺序表（格子条）
    const strip = new THREE.Group();
    const stripBoxes: THREE.Mesh[] = [];
    SERIES.forEach((name, i) => {
      const isH = i === H_IDX;
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.52, 0.52, 0.08),
        std(isH ? '#c4b5fd' : '#e2e8f0', { emissive: '#000000', emissiveIntensity: 0 }),
      );
      box.position.set((i - (SERIES.length - 1) / 2) * 0.62, 0, 0);
      strip.add(box);
      stripBoxes.push(box);
      const lab = makeLabel(name, { fontSize: 38, scale: 0.62, color: isH ? '#6d28d9' : '#334155' });
      lab.position.set((i - (SERIES.length - 1) / 2) * 0.62, 0.62, 0);
      strip.add(lab);
    });
    const stripTitle = makeLabel('金属活动性顺序（氢是分界线）', { fontSize: 36, scale: 0.9, color: '#0f766e' });
    stripTitle.position.set(0, 1.25, 0);
    strip.add(stripTitle);
    strip.position.set(0, 4.1, -0.5);
    strip.visible = false;
    acidGroup.add(strip);

    // ============================= 演示二：铁置换铜 =============================
    const displaceGroup = new THREE.Group();
    displaceGroup.visible = false;
    ctx.scene.add(displaceGroup);

    // 烧杯
    const beaker = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 1.9, 24), glassMat);
    beaker.position.set(0, 0.95, 0);
    displaceGroup.add(beaker);
    // 硫酸铜溶液（蓝色，逐渐变浅绿）
    const cuBlue = new THREE.Color('#2563eb');
    const feGreen = new THREE.Color('#86efac');
    const solMat = std('#2563eb', { transparent: true, opacity: 0.62, roughness: 0.15 });
    const solGeo = new THREE.CylinderGeometry(0.86, 0.86, 1.3, 24);
    const solution = new THREE.Mesh(solGeo, solMat);
    solution.position.set(0, 0.72, 0);
    displaceGroup.add(solution);
    // 铁钉（斜插进溶液）
    const nailGroup = new THREE.Group();
    const nailMat = std('#78716c', { metalness: 0.7, roughness: 0.35 });
    const nailBody = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.4, 14), nailMat);
    nailGroup.add(nailBody);
    const nailHead = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 14), nailMat);
    nailHead.position.y = 1.24;
    nailGroup.add(nailHead);
    const nailTip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.25, 14), nailMat);
    nailTip.position.y = -1.3;
    nailTip.rotation.x = Math.PI;
    nailGroup.add(nailTip);
    // 铜层（裹住浸入部分，随反应进度变厚变实）
    const coatMat = std('#c2703e', { metalness: 0.75, roughness: 0.35, transparent: true, opacity: 0 });
    const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 1.5, 14), coatMat);
    coat.position.y = -0.55;
    coat.scale.set(0.6, 0.05, 0.6);
    nailGroup.add(coat);
    nailGroup.position.set(0.25, 1.85, 0);
    nailGroup.rotation.z = 0.35;
    displaceGroup.add(nailGroup);

    const cuSolLabel = makeLabel('硫酸铜溶液（蓝色）', { fontSize: 38, scale: 0.9, color: '#1d4ed8' });
    cuSolLabel.position.set(0, 2.6, -0.6);
    displaceGroup.add(cuSolLabel);
    const feSolLabel = makeLabel('溶液变浅绿色：生成了硫酸亚铁', { fontSize: 36, scale: 0.9, color: '#15803d' });
    feSolLabel.position.set(0, 2.6, -0.6);
    feSolLabel.visible = false;
    displaceGroup.add(feSolLabel);
    const nailLabel = makeLabel('铁钉', { fontSize: 38, scale: 0.85 });
    nailLabel.position.set(1.3, 3.1, 0);
    displaceGroup.add(nailLabel);
    const copperLabel = makeLabel('析出红色的铜', { fontSize: 36, scale: 0.85, color: '#b45309' });
    copperLabel.position.set(-1.4, 1.2, 0);
    copperLabel.visible = false;
    displaceGroup.add(copperLabel);
    const poemLabel = makeLabel('曾青得铁则化为铜', { fontSize: 40, scale: 1.0, color: '#7c2d12' });
    poemLabel.position.set(0, 3.9, 0);
    displaceGroup.add(poemLabel);

    // ============================= 状态控制 =============================
    const applyStep = () => {
      strip.visible = mode === 'acid' && step >= 1;
      // 步骤高亮：第3步起高亮 镁/锌/铁/氢/铜，第4步强调铁与铜
      stripBoxes.forEach((box, i) => {
        const m = box.material as THREE.MeshStandardMaterial;
        if (step >= 1 && i === H_IDX) {
          m.emissive.set('#7c3aed');
          m.emissiveIntensity = 0.5;
        } else if (step >= 2 && ACTIVE_IDX.includes(i)) {
          m.emissive.set('#f59e0b');
          m.emissiveIntensity = 0.55;
        } else {
          m.emissiveIntensity = 0;
        }
      });
    };

    const setMode = (m: 'acid' | 'displace') => {
      mode = m;
      acidGroup.visible = m === 'acid';
      displaceGroup.visible = m === 'displace';
      if (m === 'displace') displaceProgress = 0; // 重新演示析出过程
      applyStep();
    };

    applyStep();

    return {
      setStep(i) {
        step = i;
        if (i >= 3) setMode('displace');
        else {
          setMode('acid');
          acidTarget = 1; // 讲解步骤自动加酸，保证现象可见
        }
        applyStep();
      },
      setParam(id, value) {
        if (id === 'acid') acidTarget = acidTarget > 0.5 ? 0 : 1;
        if (id === 'demo') setMode(String(value) === 'displace' ? 'displace' : 'acid');
      },
      update(dt, elapsed) {
        acidAmount = damp(acidAmount, acidTarget, 3, dt);
        // 液体升降
        tubes.forEach((t) => {
          t.liquid.visible = acidAmount > 0.02;
          t.liquid.scale.y = Math.max(acidAmount, 0.001);
        });
        noReactLabel.visible = mode === 'acid' && acidAmount > 0.6;
        h2Label.visible = mode === 'acid' && acidAmount > 0.6;
        // 气泡生成与上升
        const surfaceY = 0.2 + LIQ_H * acidAmount;
        tubes.forEach((t) => {
          if (mode === 'acid' && acidAmount > 0.55 && t.rate > 0) {
            t.acc += t.rate * dt;
            while (t.acc >= 1) {
              t.acc -= 1;
              const free = t.bubbles.find((b) => !b.active);
              if (free) {
                free.active = true;
                free.mesh.visible = true;
                free.mesh.position.set(
                  t.metalTop.x + (Math.random() - 0.5) * 0.24,
                  0.35 + Math.random() * 0.3,
                  t.metalTop.z + (Math.random() - 0.5) * 0.24,
                );
              }
            }
          }
          t.bubbles.forEach((b) => {
            if (!b.active) return;
            b.mesh.position.y += b.speed * dt;
            b.mesh.position.x += Math.sin(elapsed * 6 + b.mesh.position.y * 8) * 0.12 * dt;
            if (b.mesh.position.y > surfaceY - 0.06) {
              b.active = false;
              b.mesh.visible = false;
            }
          });
        });
        // 铁置换铜进度
        if (mode === 'displace' && displaceProgress < 1) {
          displaceProgress = Math.min(1, displaceProgress + dt / 9);
        }
        const p = displaceProgress;
        coat.scale.set(0.6 + p * 0.55, 0.05 + p * 0.95, 0.6 + p * 0.55);
        coatMat.opacity = p * 0.95;
        solMat.color.lerpColors(cuBlue, feGreen, p);
        copperLabel.visible = mode === 'displace' && p > 0.25;
        cuSolLabel.visible = p < 0.5;
        feSolLabel.visible = p >= 0.5;
        // 轻微呼吸感
        nailGroup.rotation.z = 0.35 + Math.sin(elapsed * 0.8) * 0.01;
      },
      dispose() {
        ctx.scene.remove(acidGroup);
        ctx.scene.remove(displaceGroup);
        disposeObject(acidGroup);
        disposeObject(displaceGroup);
      },
    };
  },
};
