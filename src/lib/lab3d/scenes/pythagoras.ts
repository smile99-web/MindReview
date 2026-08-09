// ---------------------------------------------------------------------------
// 数学 · 勾股定理：a² + b² = c² 的面积演示（小方块从两直角边正方形飞入斜边正方形）
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, disposeObject, makeLabel, std } from '../three-utils';

interface Tri {
  a: number;
  b: number;
  c: number;
  name: string;
}
const TRIS: Record<string, Tri> = {
  '3-4-5': { a: 3, b: 4, c: 5, name: '3-4-5' },
  '6-8-10': { a: 6, b: 8, c: 10, name: '6-8-10' },
  '5-12-13': { a: 5, b: 12, c: 13, name: '5-12-13' },
};

const TILE = 0.34; // 单位小方块尺寸

interface TilesState {
  mesh: THREE.InstancedMesh;
  src: THREE.Vector3[]; // a²、b² 正方形中的出发位置
  dst: THREE.Vector3[]; // c² 正方形中的目标位置
}

export const pythagorasScene: Scene3DDefinition = {
  id: 'math-pythagoras',
  title: '勾股定理',
  subject: '数学',
  icon: '📐',
  tagline: '直角三角形三边上的正方形：a² + b² 的小方块恰好填满 c²',
  keywords: ['勾股定理', '直角三角形', '斜边', '直角边', '毕达哥拉斯', '平方', '弦图'],
  camera: { position: [0, 8.5, 8.5], target: [0.6, 0, 0.6] },
  controls: [
    {
      kind: 'select',
      id: 'tri',
      label: '直角三角形',
      options: [
        { value: '3-4-5', label: '3 - 4 - 5' },
        { value: '6-8-10', label: '6 - 8 - 10' },
        { value: '5-12-13', label: '5 - 12 - 13' },
      ],
      defaultValue: '3-4-5',
    },
  ],
  steps: [
    {
      title: '直角三角形的三边',
      text: '直角三角形中，两条直角边通常记作 a 和 b，最长的斜边记作 c。中国古代把短的直角边叫"勾"，长的叫"股"，斜边叫"弦"。',
    },
    {
      title: '三边上的正方形',
      text: '分别以三条边为边长向外作正方形。它们的面积分别是 a²、b²、c²。数一数小方块：a 边正方形有 a² 个，b 边有 b² 个，斜边有 c² 个。',
    },
    {
      title: 'a² + b² = c²',
      text: '见证奇迹：让两条直角边上的小方块飞向斜边——它们恰好把斜边上的正方形填满，一个不多一个不少！这就是勾股定理：a²加b²等于c²。3²加4²等于5²，也就是9加16等于25。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 16);
    let step = 0;
    let tri = TRIS['3-4-5'];
    let tiles: TilesState | null = null;
    let statics: THREE.Object3D[] = [];
    let moveT = 0; // 方块迁移进度
    const dummy = new THREE.Object3D();

    const build = () => {
      // 清理旧的
      if (tiles) {
        ctx.scene.remove(tiles.mesh);
        tiles.mesh.geometry.dispose();
        (tiles.mesh.material as THREE.Material).dispose();
        tiles = null;
      }
      statics.forEach((o) => {
        ctx.scene.remove(o);
        disposeObject(o);
      });
      statics = [];
      const { a, b, c } = tri;
      const u = TILE;
      // 直角顶点在原点：a 边沿 +x，b 边沿 +z
      const A = new THREE.Vector3(a * u, 0, 0);
      const B = new THREE.Vector3(0, 0, b * u);

      // 三角形面片
      const triShape = new THREE.Shape();
      triShape.moveTo(0, 0);
      triShape.lineTo(a * u, 0);
      triShape.lineTo(0, b * u);
      triShape.closePath();
      const triMesh = new THREE.Mesh(
        new THREE.ShapeGeometry(triShape),
        std('#fde68a', { side: THREE.DoubleSide }),
      );
      triMesh.rotation.x = -Math.PI / 2;
      triMesh.position.y = 0.02;
      ctx.scene.add(triMesh);
      statics.push(triMesh);
      // 直角标记
      const corner = new THREE.Mesh(new THREE.BoxGeometry(u * 0.5, 0.05, u * 0.5), std('#f59e0b'));
      corner.position.set(u * 0.25, 0.04, u * 0.25);
      ctx.scene.add(corner);
      statics.push(corner);

      // 边标签
      const mkT = (text: string, pos: THREE.Vector3, color = '#1e293b') => {
        const l = makeLabel(text, { fontSize: 40, scale: 0.9, color });
        l.position.copy(pos);
        ctx.scene.add(l);
        statics.push(l);
        return l;
      };
      mkT(`a = ${a}`, new THREE.Vector3((a * u) / 2, 0.35, -0.5), '#b91c1c');
      mkT(`b = ${b}`, new THREE.Vector3(-0.6, 0.35, (b * u) / 2), '#1d4ed8');
      mkT(`c = ${c}`, A.clone().lerp(B, 0.5).add(new THREE.Vector3(0.5, 0.35, 0.5)), '#047857');

      // 三个正方形的外框（线条）
      const mkFrame = (pts: THREE.Vector3[], color: string) => {
        const geo = new THREE.BufferGeometry().setFromPoints([...pts, pts[0]]);
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
        ctx.scene.add(line);
        statics.push(line);
      };
      const y0 = 0.01;
      // a 边正方形（在 -z 侧）
      const aSq = [
        new THREE.Vector3(0, y0, 0),
        new THREE.Vector3(a * u, y0, 0),
        new THREE.Vector3(a * u, y0, -a * u),
        new THREE.Vector3(0, y0, -a * u),
      ];
      mkFrame(aSq, '#b91c1c');
      // b 边正方形（在 -x 侧）
      const bSq = [
        new THREE.Vector3(0, y0, 0),
        new THREE.Vector3(0, y0, b * u),
        new THREE.Vector3(-b * u, y0, b * u),
        new THREE.Vector3(-b * u, y0, 0),
      ];
      mkFrame(bSq, '#1d4ed8');
      // c 边正方形（斜边外侧：远离原点方向）
      const hyp = new THREE.Vector3().subVectors(B, A); // 斜边向量
      const hypLen = hyp.length();
      const outward = new THREE.Vector3(hyp.z, 0, -hyp.x).normalize(); // 垂直于斜边
      // 确保朝外（远离原点）
      const mid = A.clone().lerp(B, 0.5);
      if (outward.dot(mid.clone().negate()) > 0) outward.negate();
      const cSq = [
        A.clone(),
        B.clone(),
        B.clone().addScaledVector(outward, hypLen),
        A.clone().addScaledVector(outward, hypLen),
      ];
      mkFrame(cSq, '#047857');

      // 面积标签
      mkT(`a² = ${a * a}`, new THREE.Vector3((a * u) / 2, 0.3, (-a * u) / 2), '#b91c1c');
      mkT(`b² = ${b * b}`, new THREE.Vector3((-b * u) / 2, 0.3, (b * u) / 2), '#1d4ed8');
      mkT(`c² = ${c * c}`, mid.clone().addScaledVector(outward, hypLen / 2).setY(0.3), '#047857');
      const eq = makeLabel(`${a}² + ${b}² = ${a * a} + ${b * b} = ${a * a + b * b} = ${c}²`, {
        fontSize: 44,
        scale: 1.05,
        color: '#0f766e',
      });
      eq.position.set(mid.x, 1.2 + Math.max(a, b) * u * 0.35, mid.z);
      eq.visible = false;
      ctx.scene.add(eq);
      statics.push(eq);

      // 小方块：a² 个红、b² 个蓝，目标 = c² 个位置
      const count = a * a + b * b;
      const geo = new THREE.BoxGeometry(u * 0.82, 0.08, u * 0.82);
      const mat = std('#f8fafc');
      const mesh = new THREE.InstancedMesh(geo, mat, count);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      ctx.scene.add(mesh);

      const src: THREE.Vector3[] = [];
      const colors: THREE.Color[] = [];
      // a² 红块
      for (let i = 0; i < a; i++)
        for (let j = 0; j < a; j++) {
          src.push(new THREE.Vector3(i * u + u / 2, 0.06, -(j * u + u / 2)));
          colors.push(new THREE.Color('#fca5a5'));
        }
      // b² 蓝块
      for (let i = 0; i < b; i++)
        for (let j = 0; j < b; j++) {
          src.push(new THREE.Vector3(-(i * u + u / 2), 0.06, j * u + u / 2));
          colors.push(new THREE.Color('#93c5fd'));
        }
      colors.forEach((col, i) => mesh.setColorAt(i, col));
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

      // 目标位置：c² 网格，斜边正方形局部坐标
      const dst: THREE.Vector3[] = [];
      const e1 = hyp.clone().normalize().multiplyScalar(u); // 沿斜边
      const e2 = outward.clone().multiplyScalar(u); // 垂直向外
      for (let i = 0; i < c; i++)
        for (let j = 0; j < c; j++) {
          dst.push(
            A.clone()
              .addScaledVector(e1, i + 0.5)
              .addScaledVector(e2, j + 0.5)
              .setY(0.06),
          );
        }
      tiles = { mesh, src, dst };
      layout(0);
    };

    const layout = (p: number) => {
      if (!tiles) return;
      const n = tiles.src.length;
      for (let i = 0; i < n; i++) {
        const s = tiles.src[i];
        const d = tiles.dst[i];
        // 每块错峰飞行
        const local = THREE.MathUtils.clamp(p * 1.6 - (i / n) * 0.6, 0, 1);
        const ease = local * local * (3 - 2 * local);
        dummy.position.lerpVectors(s, d, ease);
        dummy.position.y = 0.06 + Math.sin(ease * Math.PI) * 1.4;
        dummy.updateMatrix();
        tiles.mesh.setMatrixAt(i, dummy.matrix);
      }
      tiles.mesh.instanceMatrix.needsUpdate = true;
    };

    build();

    return {
      setStep(i) {
        step = i;
        // 等式标签
        statics.forEach((o) => {
          if (o instanceof THREE.Sprite && o === statics[statics.length - 1]) o.visible = i >= 2;
        });
      },
      setParam(id, value) {
        if (id === 'tri') {
          tri = TRIS[String(value)] ?? TRIS['3-4-5'];
          moveT = 0;
          build();
          // 重建后按当前步进立即应用
          const eqSprite = statics[statics.length - 1];
          if (eqSprite) eqSprite.visible = step >= 2;
        }
      },
      update(dt) {
        const target = step >= 2 ? 1 : 0;
        const prev = moveT;
        moveT = THREE.MathUtils.damp(moveT, target, 2.4, dt);
        if (Math.abs(prev - moveT) > 0.0005) layout(moveT);
      },
      dispose() {
        if (tiles) {
          ctx.scene.remove(tiles.mesh);
          tiles.mesh.geometry.dispose();
        }
        statics.forEach((o) => {
          ctx.scene.remove(o);
          disposeObject(o);
        });
        statics = [];
        tiles = null;
      },
    };
  },
};
