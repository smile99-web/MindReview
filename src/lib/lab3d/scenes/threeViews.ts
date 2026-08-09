// ---------------------------------------------------------------------------
// 数学 · 三视图：立体组合体的主视图、左视图、俯视图
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, disposeObject, makeLabel, std } from '../three-utils';

// 组合体：三个小正方体摆成 L 形（下层两个并排，左边再叠一个）
const CUBES: [number, number, number][] = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
];
const U = 0.9; // 小方块边长

/** 在投影面上画 2D 方格（薄板），cells 为 [col,row] */
function makeViewGrid(cells: [number, number][], color: string): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(U * 0.92, U * 0.92, 0.05);
  const mat = std(color, { transparent: true, opacity: 0.92 });
  cells.forEach(([c, r]) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(c * U, r * U, 0);
    g.add(m);
  });
  return g;
}

export const threeViewsScene: Scene3DDefinition = {
  id: 'math-three-views',
  title: '三视图',
  subject: '数学',
  icon: '👁️',
  tagline: '同一个积木，从正面、左面、上面看各是什么样？',
  keywords: ['三视图', '主视图', '俯视图', '左视图', '视图', '投影', '观察物体', '从不同方向看'],
  camera: { position: [6, 5, 8], target: [0, 1, 0] },
  steps: [
    {
      title: '什么是三视图',
      text: '同一个立体图形，从不同方向观察，看到的平面图形可能不同。工程师用三个方向的视图来完整描述一个零件：从正面看叫主视图，从左面看叫左视图，从上面看叫俯视图。',
    },
    {
      title: '主视图',
      text: '正对着物体看：下层两个正方形，左上角再叠一个，是一个 L 形。注意左边高右边矮——因为左边有两个方块叠起来。',
    },
    {
      title: '左视图与俯视图',
      text: '从左面看：前后两个位置，左边高——还是 L 形吗？转一转看一看。从上面往下看：只能看到两个正方形并排。画三视图要记住：主俯长对正，主左高平齐，俯左宽相等。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 12);
    const group = new THREE.Group();
    ctx.scene.add(group);

    // 立体组合
    const cubeGeo = new THREE.BoxGeometry(U, U, U);
    const cubeMat = std('#60a5fa');
    const cubeEdge = new THREE.LineSegments(
      new THREE.EdgesGeometry(cubeGeo),
      new THREE.LineBasicMaterial({ color: '#1e3a8a' }),
    );
    CUBES.forEach(([x, y, z]) => {
      const m = new THREE.Mesh(cubeGeo, cubeMat);
      m.position.set(x * U, y * U + U / 2 + 0.02, z * U);
      group.add(m);
      const e = cubeEdge.clone();
      e.position.copy(m.position);
      group.add(e);
    });

    // 三个投影面 + 视图
    const panelMat = std('#f8fafc', { transparent: true, opacity: 0.25, side: THREE.DoubleSide });
    // 主视图（竖立在后方，朝 +z）：cells 用 x(列),y(行)
    const frontPanel = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), panelMat);
    frontPanel.position.set(0.45, 1.35, -2.2);
    group.add(frontPanel);
    const frontView = makeViewGrid(
      [
        [0, 0],
        [1, 0],
        [0, 1],
      ],
      '#f59e0b',
    );
    frontView.position.set(0, 0.5 + 0.02, -2.15);
    group.add(frontView);

    // 左视图（竖立在右侧，朝 -x 方向看过去放在 x 大的一侧展示）：
    const sidePanel = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), panelMat);
    sidePanel.rotation.y = -Math.PI / 2;
    sidePanel.position.set(3.1, 1.35, 0.45);
    group.add(sidePanel);
    const sideView = makeViewGrid(
      [
        [0, 0],
        [0, 1],
      ],
      '#34d399',
    );
    sideView.rotation.y = -Math.PI / 2;
    sideView.position.set(3.05, 0.5 + 0.02, 0.9);
    group.add(sideView);

    // 俯视图（平放在地面）
    const topPanel = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), panelMat);
    topPanel.rotation.x = -Math.PI / 2;
    topPanel.position.set(0.45, 0.015, 2.6);
    group.add(topPanel);
    const topView = makeViewGrid(
      [
        [0, 0],
        [1, 0],
      ],
      '#a78bfa',
    );
    topView.rotation.x = -Math.PI / 2;
    topView.position.set(0, 0.03, 2.15 + 0.45);
    group.add(topView);

    const mkTag = (text: string, pos: [number, number, number], color: string) => {
      const t = makeLabel(text, { fontSize: 38, scale: 0.9, color });
      t.position.set(...pos);
      group.add(t);
      return t;
    };
    mkTag('主视图', [0.45, 3.0, -2.15], '#b45309');
    mkTag('左视图', [3.05, 3.0, 0.45], '#047857');
    mkTag('俯视图', [0.45, 0.35, 4.4], '#6d28d9');

    // 对齐辅助线（step>=2）
    const alignMat = new THREE.LineDashedMaterial({ color: '#94a3b8', dashSize: 0.12, gapSize: 0.09 });
    const mkAlign = (pts: THREE.Vector3[]) => {
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), alignMat);
      l.computeLineDistances();
      l.visible = false;
      group.add(l);
      return l;
    };
    const align1 = mkAlign([new THREE.Vector3(0, 2, -2.2), new THREE.Vector3(0, 2, 4.6)]); // 主-俯 长对正
    const align2 = mkAlign([new THREE.Vector3(0.45, 2.4, -2.2), new THREE.Vector3(3.05, 2.4, 0.45)]); // 主-左 高平齐
    const alignTip = mkTag('长对正 · 高平齐 · 宽相等', [1.6, 3.9, 1.2], '#0f766e');
    alignTip.visible = false;

    // 相机机位
    const camHome = { pos: new THREE.Vector3(6, 5, 8), tgt: new THREE.Vector3(0, 1, 0) };
    const camFront = { pos: new THREE.Vector3(0.45, 1.4, 7.5), tgt: new THREE.Vector3(0.45, 1.2, -2.2) };
    const camSide = { pos: new THREE.Vector3(8.5, 1.6, 0.45), tgt: new THREE.Vector3(3.05, 1.2, 0.45) };
    const camTop = { pos: new THREE.Vector3(0.45, 9.5, 0.6), tgt: new THREE.Vector3(0.45, 0, 0.7) };
    let camTargetPos = camHome.pos.clone();
    let camTargetTgt = camHome.tgt.clone();

    return {
      setStep(i) {
        align1.visible = align2.visible = i >= 2;
        alignTip.visible = i >= 2;
        if (i === 0) {
          camTargetPos = camHome.pos.clone();
          camTargetTgt = camHome.tgt.clone();
        } else if (i === 1) {
          camTargetPos = camFront.pos.clone();
          camTargetTgt = camFront.tgt.clone();
        } else {
          // 第3步环视：先左侧后俯视，由 update 交替
          camTargetPos = camSide.pos.clone();
          camTargetTgt = camSide.tgt.clone();
        }
      },
      update(dt, elapsed) {
        if (ctx.controls) {
          ctx.controls.target.lerp(camTargetTgt, 1 - Math.exp(-3 * dt));
        }
        ctx.camera.position.lerp(camTargetPos, 1 - Math.exp(-3 * dt));
        // 第3步在左视/俯视两个机位间缓慢往返
        const stepGuess = alignTip.visible;
        if (stepGuess && ctx.controls) {
          const k = (Math.sin(elapsed * 0.35) + 1) / 2; // 0..1
          camTargetPos.lerpVectors(camSide.pos, camTop.pos, k);
          camTargetTgt.lerpVectors(camSide.tgt, camTop.tgt, k);
        }
      },
      dispose() {
        ctx.scene.remove(group);
        disposeObject(group);
      },
    };
  },
};
