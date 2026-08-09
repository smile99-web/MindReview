// ---------------------------------------------------------------------------
// 数学 · 相交线与角：对顶角相等、邻补角互补、垂直特例
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, cylinderBetween, disposeObject, makeLabel, std } from '../three-utils';

const R = 1.15; // 扇形弧半径
const LINE_LEN = 4.3; // 直线半长
const SECTOR_COLORS = ['#3b82f6', '#f97316', '#22c55e', '#a855f7']; // ∠1 ∠2 ∠3 ∠4

export const anglesScene: Scene3DDefinition = {
  id: 'math-angles',
  title: '相交线与角',
  subject: '数学',
  grade: '7下',
  icon: '📐',
  tagline: '两条直线相交：对顶角相等，邻补角互补',
  keywords: ['角', '相交线', '对顶角', '邻补角', '补角', '角平分线', '垂直', '垂线'],
  camera: { position: [0, 3.4, 9.5], target: [0, 2.2, 0] },
  controls: [
    { kind: 'slider', id: 'theta', label: '夹角 θ', min: 20, max: 160, step: 1, defaultValue: 60, unit: '°' },
    { kind: 'button', id: 'bisector', label: '📏 角平分线' },
  ],
  steps: [
    {
      title: '相交成四角',
      text: '两条直线相交于点 O，一下子形成四个角，我们给它们编上号：角一、角二、角三、角四。拖动滑块改变夹角，看看四个角跟着怎么变。',
    },
    {
      title: '对顶角相等',
      text: '角一和角三位置相对，叫做对顶角；角二和角四也是一对对顶角。不管你怎么转动直线，对顶角总是相等。道理是：角一加角二是一百八十度，角三加角二也是一百八十度，所以角一一定等于角三。',
    },
    {
      title: '邻补角互补',
      text: '角一和角二有一条公共边，另外两边互为反向延长线，这样的两个角叫邻补角。邻补角的度数加起来永远是一百八十度，也就是互为补角。知道其中一个，用一百八十度一减就得到另一个。',
    },
    {
      title: '垂直',
      text: '当夹角正好是九十度时，两条直线互相垂直，四个角都是直角，交点处会画上一个小方块做记号。垂直是相交的特殊情况。墙角、十字路口、黑板的相邻两边，都是垂直的例子。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 14);
    let step = 0;
    let theta = 60; // 目标夹角
    let dispTheta = 60; // 平滑显示夹角
    let lastDeg = -1; // 上次重建时的整数度数
    let bisectorOn = false;

    const group = new THREE.Group();
    group.position.y = 2.3;
    ctx.scene.add(group);

    // 两条相交直线（line1 固定水平，line2 随 θ 转动）
    const line1 = cylinderBetween(
      new THREE.Vector3(-LINE_LEN, 0, 0),
      new THREE.Vector3(LINE_LEN, 0, 0),
      0.05,
      std('#334155'),
    );
    group.add(line1);
    const line2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 10), std('#7c3aed'));
    group.add(line2);

    const setRod = (m: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3) => {
      const dir = new THREE.Vector3().subVectors(to, from);
      const len = dir.length();
      m.scale.y = len;
      m.position.copy(from).addScaledVector(dir, 0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    };

    // 交点 O
    const oPoint = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), std('#0f172a'));
    group.add(oPoint);
    const oLabel = makeLabel('O', { fontSize: 40, scale: 0.85 });
    oLabel.position.set(-0.38, -0.42, 0);
    group.add(oLabel);

    // 四个扇形角区 + 度数标签
    const sectors: THREE.Mesh[] = [];
    const sectorMats: THREE.MeshStandardMaterial[] = [];
    const degLabels: THREE.Sprite[] = [];
    for (let k = 0; k < 4; k++) {
      const mat = std(SECTOR_COLORS[k], {
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        emissive: SECTOR_COLORS[k],
        emissiveIntensity: 0.25,
      });
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(R, 24, 0, 1), mat);
      mesh.position.z = 0.02 + k * 0.004;
      group.add(mesh);
      sectors.push(mesh);
      sectorMats.push(mat);
      const lab = makeLabel('', { fontSize: 34, scale: 0.78, color: SECTOR_COLORS[k] });
      lab.position.z = 0.15;
      group.add(lab);
      degLabels.push(lab);
    }

    // 直角符号（步骤四，θ=90° 时显示）
    const rightMark = new THREE.Group();
    const markMat = std('#dc2626', { emissive: '#b91c1c', emissiveIntensity: 0.4 });
    const d = 0.4;
    const t = 0.06;
    const legH = new THREE.Mesh(new THREE.BoxGeometry(d, t, t), markMat);
    legH.position.set(d / 2, d, 0.06);
    const legV = new THREE.Mesh(new THREE.BoxGeometry(t, d, t), markMat);
    legV.position.set(d, d / 2, 0.06);
    rightMark.add(legH, legV);
    rightMark.visible = false;
    group.add(rightMark);

    // 角平分线（虚线，按钮切换）
    const bisector = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({ color: '#db2777', dashSize: 0.22, gapSize: 0.14 }),
    );
    bisector.visible = false;
    group.add(bisector);
    const bisectorLabel = makeLabel('角平分线', { fontSize: 32, scale: 0.75, color: '#be185d' });
    bisectorLabel.visible = false;
    group.add(bisectorLabel);

    // 顶部结论牌
    const infoLabel = makeLabel('', { fontSize: 40, scale: 1.0, color: '#0f172a' });
    infoLabel.position.set(0, 4.0, 0);
    ctx.scene.add(infoLabel);

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

    // 按当前显示角度重建扇形、标签、直线、平分线
    const rebuild = () => {
      const deg = Math.round(dispTheta);
      if (deg === lastDeg) return;
      lastDeg = deg;
      const th = THREE.MathUtils.degToRad(deg);

      // line2 方向
      const u = new THREE.Vector3(Math.cos(th), Math.sin(th), 0);
      setRod(line2, u.clone().multiplyScalar(-LINE_LEN), u.clone().multiplyScalar(LINE_LEN));

      // 四个扇形：∠1:[0,θ] ∠2:[θ,π] ∠3:[π,π+θ] ∠4:[π+θ,2π]
      const ranges: [number, number][] = [
        [0, th],
        [th, Math.PI - th],
        [Math.PI, th],
        [Math.PI + th, Math.PI - th],
      ];
      const degs = [deg, 180 - deg, deg, 180 - deg];
      for (let k = 0; k < 4; k++) {
        sectors[k].geometry.dispose();
        sectors[k].geometry = new THREE.CircleGeometry(R, 24, ranges[k][0], ranges[k][1]);
        const mid = ranges[k][0] + ranges[k][1] / 2;
        degLabels[k].position.set(Math.cos(mid) * (R + 0.62), Math.sin(mid) * (R + 0.62), 0.15);
        setText(degLabels[k], `∠${k + 1} = ${degs[k]}°`, { fontSize: 34, scale: 0.78, color: SECTOR_COLORS[k] });
      }

      // 角平分线（∠1 与 ∠3 的平分线，方向 θ/2）
      if (bisectorOn) {
        const bu = new THREE.Vector3(Math.cos(th / 2), Math.sin(th / 2), 0);
        bisector.geometry.dispose();
        bisector.geometry = new THREE.BufferGeometry().setFromPoints([
          bu.clone().multiplyScalar(-4.1),
          bu.clone().multiplyScalar(4.1),
        ]);
        bisector.computeLineDistances();
        bisectorLabel.position.set(bu.x * 4.35, bu.y * 4.35, 0);
      }

      // 结论牌
      if (step === 1) {
        setText(infoLabel, `对顶角：∠1 = ∠3 = ${deg}°，∠2 = ∠4 = ${180 - deg}°`, { fontSize: 40, scale: 1.0, color: '#1d4ed8' });
      } else if (step === 2) {
        setText(infoLabel, `邻补角：∠1 + ∠2 = ${deg}° + ${180 - deg}° = 180°`, { fontSize: 40, scale: 1.0, color: '#c2410c' });
      } else if (step === 3) {
        setText(infoLabel, 'θ = 90°：两条直线互相垂直', { fontSize: 40, scale: 1.0, color: '#b91c1c' });
      } else {
        setText(infoLabel, '两条直线相交于点 O，形成四个角', { fontSize: 40, scale: 1.0, color: '#0f172a' });
      }
    };

    return {
      setStep(i) {
        step = i;
        if (i === 3) theta = 90; // 平滑过渡到垂直特例
        lastDeg = -1; // 强制重建结论牌
        rebuild();
      },
      setParam(id, value) {
        if (id === 'theta') theta = Number(value);
        if (id === 'bisector') {
          bisectorOn = !bisectorOn;
          bisector.visible = bisectorOn;
          bisectorLabel.visible = bisectorOn;
          lastDeg = -1;
          rebuild();
        }
      },
      update(dt, elapsed) {
        dispTheta = THREE.MathUtils.damp(dispTheta, theta, 5, dt);
        rebuild();
        rightMark.visible = step === 3 && Math.round(dispTheta) === 90;
        // 高亮脉冲：步骤二对顶角（∠1∠3），步骤三邻补角（∠1∠2）
        for (let k = 0; k < 4; k++) {
          const hot =
            (step === 1 && (k === 0 || k === 2)) ||
            (step === 2 && (k === 0 || k === 1));
          sectorMats[k].opacity = hot ? 0.5 + 0.22 * Math.sin(elapsed * 4) : 0.3;
        }
      },
      dispose() {
        ctx.scene.remove(group, infoLabel);
        disposeObject(group);
        disposeObject(infoLabel);
      },
    };
  },
};
