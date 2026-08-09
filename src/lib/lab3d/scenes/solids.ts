// ---------------------------------------------------------------------------
// 数学 · 立体几何：常见几何体、正方体展开图、表面积与体积
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, disposeObject, makeLabel, std } from '../three-utils';

type SolidKind = 'cube' | 'cylinder' | 'cone' | 'sphere' | 'prism';

const SOLID_INFO: Record<SolidKind, { name: string; surface: string; volume: string; feature: string }> = {
  cube: { name: '正方体', surface: 'S = 6a²', volume: 'V = a³', feature: '6个面都是相同的正方形，12条棱一样长' },
  cylinder: { name: '圆柱', surface: 'S = 2πr² + 2πrh', volume: 'V = πr²h', feature: '上下两个圆面 + 一个曲面，侧面展开是长方形' },
  cone: { name: '圆锥', surface: 'S = πr² + πrl', volume: 'V = ⅓πr²h', feature: '体积恰好是等底等高圆柱的三分之一' },
  sphere: { name: '球', surface: 'S = 4πr²', volume: 'V = ⁴⁄₃πr³', feature: '球面上每一点到球心的距离都相等' },
  prism: { name: '三棱柱', surface: 'S = 2×底面积 + 侧面积', volume: 'V = 底面积 × 高', feature: '上下底面是全等的三角形，侧面是长方形' },
};

/** 正方体展开动画：前 face 固定，其余五个面绕公共棱旋转打开 */
function buildCubeNet(): { group: THREE.Group; faces: { pivot: THREE.Group; dir: number }[] } {
  const group = new THREE.Group();
  const faces: { pivot: THREE.Group; dir: number }[] = [];
  const A = 1.6; // 边长
  const faceGeo = new THREE.BoxGeometry(A, A, 0.06);
  const colors = ['#f87171', '#fb923c', '#facc15', '#4ade80', '#38bdf8', '#a78bfa'];
  // 底面固定；前后左右四个面沿底面四条棱铰接；顶面铰接在"后"面上
  const base = new THREE.Mesh(faceGeo, std(colors[0]));
  base.position.y = 0.03;
  group.add(base);

  const mkSide = (edgeX: number, edgeZ: number, rotY: number, color: string, parent: THREE.Object3D, lift: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(edgeX, 0.03, edgeZ);
    pivot.rotation.y = rotY;
    parent.add(pivot);
    const face = new THREE.Mesh(faceGeo, std(color));
    face.position.set(A / 2, lift, 0);
    pivot.add(face);
    return pivot;
  };
  // 四个侧面：pivot 在底面边缘，dir=1 表示向外打开
  faces.push({ pivot: mkSide(A / 2, 0, 0, colors[1], group, A / 2), dir: 1 }); // 右
  faces.push({ pivot: mkSide(-A / 2, 0, Math.PI, colors[2], group, A / 2), dir: 1 }); // 左
  faces.push({ pivot: mkSide(0, A / 2, -Math.PI / 2, colors[3], group, A / 2), dir: 1 }); // 前
  const back = mkSide(0, -A / 2, Math.PI / 2, colors[4], group, A / 2);
  faces.push({ pivot: back, dir: 1 }); // 后
  // 顶面：铰接在后面的外缘
  const topPivot = new THREE.Group();
  topPivot.position.set(A, 0, 0); // 相对 back pivot 的局部坐标：back 面外侧边缘
  back.add(topPivot);
  const topFace = new THREE.Mesh(faceGeo, std(colors[5]));
  topFace.position.set(A / 2, 0, 0);
  topPivot.add(topFace);
  faces.push({ pivot: topPivot, dir: -1 });
  return { group, faces };
}

function buildSolid(kind: SolidKind): { group: THREE.Group; net?: ReturnType<typeof buildCubeNet> } {
  if (kind === 'cube') {
    const net = buildCubeNet();
    net.group.position.y = 0.9;
    return { group: net.group, net };
  }
  const group = new THREE.Group();
  let mesh: THREE.Mesh;
  switch (kind) {
    case 'cylinder':
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2, 36), std('#38bdf8'));
      break;
    case 'cone':
      mesh = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.2, 36), std('#4ade80'));
      break;
    case 'sphere':
      mesh = new THREE.Mesh(new THREE.SphereGeometry(1.25, 36, 24), std('#a78bfa'));
      break;
    case 'prism':
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 2, 3), std('#fb923c'));
      break;
  }
  mesh.position.y = 1.6;
  group.add(mesh);
  // 线框（step>=2 显示由调用方控制透明度）
  const wire = new THREE.Mesh(mesh.geometry, std('#0f172a', { wireframe: true, transparent: true, opacity: 0 }));
  wire.position.copy(mesh.position);
  wire.scale.setScalar(1.002);
  group.add(wire);
  return { group };
}

export const solidsScene: Scene3DDefinition = {
  id: 'math-solids',
  title: '立体几何图形',
  subject: '数学',
  icon: '📦',
  tagline: '正方体展开图动画 + 圆柱、圆锥、球、棱柱的表面积与体积',
  keywords: ['立体几何', '正方体', '长方体', '圆柱', '圆锥', '球', '棱柱', '表面积', '体积', '展开图', '几何体'],
  camera: { position: [5, 4, 7], target: [0, 1.4, 0] },
  controls: [
    {
      kind: 'select',
      id: 'solid',
      label: '几何体',
      options: [
        { value: 'cube', label: '正方体' },
        { value: 'cylinder', label: '圆柱' },
        { value: 'cone', label: '圆锥' },
        { value: 'sphere', label: '球' },
        { value: 'prism', label: '三棱柱' },
      ],
      defaultValue: 'cube',
    },
  ],
  steps: [
    {
      title: '认识几何体',
      text: '生活中的包装盒、水杯、冰激凌、足球，抽象出来就是这些几何体。切换选择器看一看：正方体、圆柱、圆锥、球和三棱柱，它们各有什么特征？',
    },
    {
      title: '展开图',
      text: '把正方体沿着棱剪开铺平，就得到它的展开图：六个正方形连成一片。沿折痕折回去又能围成正方体。正方体的展开图一共有十一种不同的样子。',
    },
    {
      title: '表面积与体积',
      text: '表面积是所有面的面积之和，体积是所占空间的大小。正方体：S等于6a²，V等于a³；圆柱：V等于πr²h；圆锥的体积最特别——恰好是等底等高圆柱的三分之一。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 10);
    let kind: SolidKind = 'cube';
    let step = 0;
    let current: ReturnType<typeof buildSolid> | null = null;
    let openT = 0; // 展开程度 0=合拢 1=摊开
    let labels: THREE.Object3D[] = [];

    const clearLabels = () => {
      labels.forEach((l) => {
        ctx.scene.remove(l);
        disposeObject(l);
      });
      labels = [];
    };
    const addLabels = () => {
      clearLabels();
      const info = SOLID_INFO[kind];
      const name = makeLabel(info.name, { fontSize: 46, scale: 1.05 });
      name.position.set(0, 3.6, 0);
      ctx.scene.add(name);
      labels.push(name);
      if (step >= 2) {
        const feat = makeLabel(info.feature, { fontSize: 32, scale: 0.8, color: '#475569' });
        feat.position.set(0, -0.35, 0);
        ctx.scene.add(feat);
        labels.push(feat);
        const formula = makeLabel(`${info.surface}    ${info.volume}`, { fontSize: 38, scale: 0.95, color: '#0f766e' });
        formula.position.set(0, 4.35, 0);
        ctx.scene.add(formula);
        labels.push(formula);
      }
    };
    const mount = () => {
      if (current) {
        ctx.scene.remove(current.group);
        disposeObject(current.group);
      }
      current = buildSolid(kind);
      ctx.scene.add(current.group);
      addLabels();
    };
    mount();

    return {
      setStep(i) {
        step = i;
        addLabels();
      },
      setParam(id, value) {
        if (id === 'solid') {
          kind = String(value) as SolidKind;
          mount();
        }
      },
      update(dt) {
        if (!current) return;
        current.group.rotation.y += dt * 0.4;
        const target = step >= 1 && kind === 'cube' ? 1 : 0;
        openT = THREE.MathUtils.damp(openT, target, 3, dt);
        if (current.net) {
          // 侧面绕棱向下旋转 90°，顶面再多折 90°
          current.net.faces.forEach((f) => {
            f.pivot.rotation.z = -openT * (Math.PI / 2) * f.dir;
          });
        }
        // 非正方体 step2 显示线框
        const wire = current.group.children[1] as THREE.Mesh | undefined;
        if (wire && wire.material) {
          (wire.material as THREE.MeshStandardMaterial).opacity = step >= 2 ? 0.5 : 0;
        }
      },
      dispose() {
        clearLabels();
        if (current) {
          ctx.scene.remove(current.group);
          disposeObject(current.group);
          current = null;
        }
      },
    };
  },
};
