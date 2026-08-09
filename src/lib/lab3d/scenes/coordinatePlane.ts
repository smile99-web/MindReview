// ---------------------------------------------------------------------------
// 数学 · 平面直角坐标系：象限、坐标与点的平移
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, disposeObject, makeLabel, std } from '../three-utils';

const GRID = 12; // 网格范围 ±6
const MAX_TRAIL = 240;
const MOVE_DUR = 2.6; // 平移动画秒数

const fmt = (n: number) => String(Number(n.toFixed(1))).replace('-', '−');

export const coordinatePlaneScene: Scene3DDefinition = {
  id: 'math-coordinate',
  title: '平面直角坐标系',
  subject: '数学',
  grade: '7下',
  icon: '🎯',
  tagline: '给平面上的每个点一个"地址"：象限、坐标与平移',
  keywords: ['平面直角坐标系', '坐标', '象限', '横坐标', '纵坐标', '原点', '平移', '点的坐标'],
  camera: { position: [0.6, 4.0, 12], target: [0, 2.0, 0] },
  controls: [
    { kind: 'slider', id: 'x', label: '横坐标 x', min: -4, max: 4, step: 1, defaultValue: 2 },
    { kind: 'slider', id: 'y', label: '纵坐标 y', min: -3, max: 3, step: 1, defaultValue: 3 },
    { kind: 'button', id: 'move', label: '➡️ 平移 (+2, −3)' },
  ],
  steps: [
    {
      title: '认识坐标系',
      text: '把两条数轴垂直放在一起，就组成了平面直角坐标系。横的叫 x 轴，竖的叫 y 轴，它们的交点叫原点 O。有了它，平面上的每一个点都能用一个数对唯一地表示出来。',
    },
    {
      title: '用数对定位',
      text: '看蓝色的点 P：先沿 x 轴方向数出横坐标，再沿 y 轴方向数出纵坐标，顺序不能颠倒。数对二逗三和三逗二是两个不同的点。灰色虚线是 P 到两条坐标轴的投影，拖动滑块试试。',
    },
    {
      title: '四个象限',
      text: '两条坐标轴把平面分成四块，从右上开始，逆时针依次是第一、第二、第三、第四象限。符号有规律：第一象限正正，第二象限负正，第三象限负负，第四象限正负。坐标轴上的点不属于任何象限。',
    },
    {
      title: '点的平移',
      text: '点平移时坐标怎么变？向右移，横坐标加；向左移，横坐标减；向上移，纵坐标加；向下移，纵坐标减。按一下平移按钮，看 P 先向右走两格、再向下走三格，橙色轨迹和坐标都跟着变。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 14);
    let step = 0;
    let x = 2;
    let y = 3;
    let dispX = 2;
    let dispY = 3;
    let lastCoordText = '';
    // 平移动画状态
    let animT = -1; // <0 表示未在动画
    let fromX = 0;
    let fromY = 0;
    let restPos: { x: number; y: number } | null = null; // 动画结束后的停留位置

    const group = new THREE.Group();
    group.position.y = 1.8;
    ctx.scene.add(group);

    // 竖直网格
    const grid = new THREE.GridHelper(GRID, GRID, 0x94a3b8, 0xcbd5e1);
    grid.rotation.x = Math.PI / 2;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.55;
    group.add(grid);

    // 坐标轴 + 端部箭头
    const xAxis = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-5.6, 0, 0), new THREE.Vector3(5.6, 0, 0)]),
      new THREE.LineBasicMaterial({ color: '#dc2626' }),
    );
    const yAxis = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -5.6, 0), new THREE.Vector3(0, 5.6, 0)]),
      new THREE.LineBasicMaterial({ color: '#16a34a' }),
    );
    group.add(xAxis, yAxis);
    const xHead = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.36, 12), std('#dc2626'));
    xHead.rotation.z = -Math.PI / 2;
    xHead.position.set(5.75, 0, 0);
    const yHead = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.36, 12), std('#16a34a'));
    yHead.position.set(0, 5.75, 0);
    group.add(xHead, yHead);
    const xTag = makeLabel('x 轴', { fontSize: 36, scale: 0.8, color: '#b91c1c' });
    xTag.position.set(5.2, 0.45, 0);
    const yTag = makeLabel('y 轴', { fontSize: 36, scale: 0.8, color: '#15803d' });
    yTag.position.set(0.7, 5.35, 0);
    const oTag = makeLabel('O', { fontSize: 38, scale: 0.85 });
    oTag.position.set(-0.4, -0.42, 0);
    group.add(xTag, yTag, oTag);

    // 轴上刻度与数字
    const tickMat = std('#64748b');
    for (let i = -5; i <= 5; i++) {
      if (i === 0) continue;
      const tx = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.16, 0.045), tickMat);
      tx.position.set(i, 0, 0);
      const ty = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.045, 0.045), tickMat);
      ty.position.set(0, i, 0);
      group.add(tx, ty);
      const nx = makeLabel(String(i), { fontSize: 28, scale: 0.58, color: '#64748b' });
      nx.position.set(i, -0.36, 0);
      const ny = makeLabel(String(i), { fontSize: 28, scale: 0.58, color: '#64748b' });
      ny.position.set(-0.38, i, 0);
      group.add(nx, ny);
    }

    // 象限标签
    const quadLabels: THREE.Sprite[] = [];
    const quadBaseScales: THREE.Vector3[] = [];
    const quadData: [string, number, number][] = [
      ['第一象限 (+,+)', 3.1, 2.7],
      ['第二象限 (−,+)', -3.1, 2.7],
      ['第三象限 (−,−)', -3.1, -2.7],
      ['第四象限 (+,−)', 3.1, -2.7],
    ];
    for (const [text, qx, qy] of quadData) {
      const lab = makeLabel(text, { fontSize: 32, scale: 0.78, color: '#7c3aed' });
      lab.position.set(qx, qy, 0);
      group.add(lab);
      quadLabels.push(lab);
      quadBaseScales.push(lab.scale.clone());
    }

    // 动点 P
    const pointP = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 20, 16),
      std('#2563eb', { emissive: '#1d4ed8', emissiveIntensity: 0.55 }),
    );
    group.add(pointP);
    const pLabel = makeLabel('', { fontSize: 40, scale: 0.95, color: '#1d4ed8' });
    group.add(pLabel);

    // 投影虚线与垂足
    const dashMat = new THREE.LineDashedMaterial({ color: '#64748b', dashSize: 0.16, gapSize: 0.12 });
    const projX = new THREE.Line(new THREE.BufferGeometry(), dashMat);
    const projY = new THREE.Line(new THREE.BufferGeometry(), dashMat.clone());
    group.add(projX, projY);
    const footX = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), std('#dc2626'));
    const footY = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), std('#16a34a'));
    group.add(footX, footY);

    // 平移轨迹（橙色，动态追加）
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_TRAIL * 3), 3));
    trailGeo.setDrawRange(0, 0);
    const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: '#f97316' }));
    group.add(trail);
    let trailCount = 0;

    // 步骤四提示
    const hintLabel = makeLabel('点击「➡️ 平移 (+2, −3)」按钮', { fontSize: 36, scale: 0.9, color: '#c2410c' });
    hintLabel.position.set(0, 4.9, 0);
    group.add(hintLabel);

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

    const clearTrail = () => {
      trailCount = 0;
      trailGeo.setDrawRange(0, 0);
    };
    let lastPX = NaN;
    let lastPY = NaN;
    const pushTrail = (px: number, py: number) => {
      if (trailCount >= MAX_TRAIL) return;
      const attr = trailGeo.getAttribute('position') as THREE.BufferAttribute;
      attr.setXYZ(trailCount, px, py, 0.02);
      attr.needsUpdate = true;
      trailCount++;
      trailGeo.setDrawRange(0, trailCount);
    };

    return {
      setStep(i) {
        step = i;
      },
      setParam(id, value) {
        if (id === 'x' || id === 'y') {
          if (id === 'x') x = Number(value);
          else y = Number(value);
          animT = -1;
          restPos = null;
          clearTrail();
        }
        if (id === 'move' && animT < 0) {
          fromX = restPos ? restPos.x : x;
          fromY = restPos ? restPos.y : y;
          restPos = null;
          clearTrail();
          pushTrail(fromX, fromY);
          animT = 0;
        }
      },
      update(dt, elapsed) {
        // 平移动画：L 形路径（先右 2，再下 3）
        if (animT >= 0) {
          animT += dt / MOVE_DUR;
          const t1 = THREE.MathUtils.clamp(animT / 0.5, 0, 1);
          const t2 = THREE.MathUtils.clamp((animT - 0.5) / 0.5, 0, 1);
          const e1 = t1 * t1 * (3 - 2 * t1);
          const e2 = t2 * t2 * (3 - 2 * t2);
          dispX = fromX + 2 * e1;
          dispY = fromY - 3 * e2;
          pushTrail(dispX, dispY);
          if (animT >= 1) {
            animT = -1;
            restPos = { x: fromX + 2, y: fromY - 3 };
          }
        } else {
          const tx = restPos ? restPos.x : x;
          const ty = restPos ? restPos.y : y;
          dispX = THREE.MathUtils.damp(dispX, tx, 8, dt);
          dispY = THREE.MathUtils.damp(dispY, ty, 8, dt);
        }

        // 点 P 与坐标标签
        pointP.position.set(dispX, dispY, 0);
        pointP.scale.setScalar(1 + Math.sin(elapsed * 3) * 0.1);
        pLabel.position.set(dispX + 0.9, dispY + 0.5, 0);
        const coordText = `P (${fmt(dispX)}, ${fmt(dispY)})`;
        if (coordText !== lastCoordText) {
          lastCoordText = coordText;
          setText(pLabel, coordText, { fontSize: 40, scale: 0.95, color: '#1d4ed8' });
        }

        // 投影虚线（步骤二起显示）
        const showProj = step >= 1;
        projX.visible = showProj;
        projY.visible = showProj;
        footX.visible = showProj;
        footY.visible = showProj;
        if (showProj && (dispX !== lastPX || dispY !== lastPY)) {
          lastPX = dispX;
          lastPY = dispY;
          projX.geometry.dispose();
          projX.geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(dispX, dispY, 0),
            new THREE.Vector3(dispX, 0, 0),
          ]);
          projX.computeLineDistances();
          projY.geometry.dispose();
          projY.geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(dispX, dispY, 0),
            new THREE.Vector3(0, dispY, 0),
          ]);
          projY.computeLineDistances();
          footX.position.set(dispX, 0, 0);
          footY.position.set(0, dispY, 0);
        }

        // 步骤三：象限标签脉冲
        const quadPulse = step === 2 ? 1 + Math.sin(elapsed * 4) * 0.12 : 1;
        quadLabels.forEach((lab, idx) => {
          const bs = quadBaseScales[idx];
          lab.scale.set(bs.x * quadPulse, bs.y * quadPulse, 1);
        });

        // 步骤四提示
        hintLabel.visible = step === 3 && animT < 0 && restPos === null;
      },
      dispose() {
        ctx.scene.remove(group);
        disposeObject(group);
      },
    };
  },
};
