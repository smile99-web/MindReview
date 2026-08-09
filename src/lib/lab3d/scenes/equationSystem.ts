// ---------------------------------------------------------------------------
// 数学 · 二元一次方程组：两条直线的交点就是方程组的解
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, disposeObject, makeLabel, std } from '../three-utils';

type SysKey = 's1' | 's2';
interface LineDef {
  m: number; // 斜率
  b: number; // 截距
  text: string;
}
interface SysDef {
  l1: LineDef;
  l2: LineDef;
  sol: { x: number; y: number };
}
const SYSTEMS: Record<SysKey, SysDef> = {
  s1: {
    l1: { m: -1, b: 5, text: 'x + y = 5' },
    l2: { m: 1, b: -1, text: 'x − y = 1' },
    sol: { x: 3, y: 2 },
  },
  s2: {
    l1: { m: -2, b: 8, text: '2x + y = 8' },
    l2: { m: 1, b: -1, text: 'x − y = 1' },
    sol: { x: 3, y: 5 },
  },
};
// 可视窗口（局部坐标）
const X0 = -5.4;
const X1 = 5.4;
const Y0 = -3.4;
const Y1 = 5.6;
const COL1 = '#2563eb';
const COL2 = '#f97316';

/** 直线 y = m x + b 在窗口内的两个端点 */
function clipLine(m: number, b: number): [THREE.Vector3, THREE.Vector3] {
  const pts: THREE.Vector3[] = [];
  const yAt = (x: number) => m * x + b;
  const yA = yAt(X0);
  const yB = yAt(X1);
  if (yA >= Y0 && yA <= Y1) pts.push(new THREE.Vector3(X0, yA, 0));
  if (yB >= Y0 && yB <= Y1) pts.push(new THREE.Vector3(X1, yB, 0));
  if (m !== 0) {
    const xLo = (Y0 - b) / m;
    const xHi = (Y1 - b) / m;
    if (xLo > X0 && xLo < X1) pts.push(new THREE.Vector3(xLo, Y0, 0));
    if (xHi > X0 && xHi < X1) pts.push(new THREE.Vector3(xHi, Y1, 0));
  }
  return [pts[0], pts[1]];
}

export const equationSystemScene: Scene3DDefinition = {
  id: 'math-equation-system',
  title: '二元一次方程组',
  subject: '数学',
  grade: '7下',
  icon: '✖️',
  tagline: '两条直线的交点，就是方程组的解',
  keywords: ['二元一次方程组', '方程组', '代入消元', '加减消元', '交点', '解方程组'],
  camera: { position: [0.8, 4.6, 13], target: [0, 2.6, 0] },
  controls: [
    {
      kind: 'select',
      id: 'sys',
      label: '例题',
      options: [
        { value: 's1', label: 'x+y=5 与 x−y=1' },
        { value: 's2', label: '2x+y=8 与 x−y=1' },
      ],
      defaultValue: 's1',
    },
  ],
  steps: [
    {
      title: '什么是方程组',
      text: '两个二元一次方程合在一起，就是一个二元一次方程组。比如 x 加 y 等于五，x 减 y 等于一。这里的 x 和 y 是同一对未知数，必须同时满足两个条件。每个方程单独看，都有无数组解。',
    },
    {
      title: '解组成一条直线',
      text: '以第一个方程为例：一和四、二和三、三和二……它的解有无数组。把每一组解画成坐标系里的点，这些点正好连成一条直线。看，小球滑到哪里，哪里的坐标就满足这个方程。',
    },
    {
      title: '交点就是解',
      text: '两条直线只有一个交点。这个交点同时在两条线上，所以它的坐标同时满足两个方程——这就是方程组唯一的解。找到交点，就解出了方程组。',
    },
    {
      title: '消元思想',
      text: '代数做法是消元：把两个方程左右两边分别相加，y 正好抵消，一下子就求出 x；再把 x 代回任意一个方程，就得到 y。这叫加减消元。把一个方程变形后代入另一个方程，叫代入消元。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 14);
    let step = 0;
    let sysKey: SysKey = 's1';

    const group = new THREE.Group();
    group.position.y = 2.2;
    ctx.scene.add(group);

    // 竖直网格与坐标轴
    const grid = new THREE.GridHelper(12, 12, 0x94a3b8, 0xcbd5e1);
    grid.rotation.x = Math.PI / 2;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.5;
    group.add(grid);
    const xAxis = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(X0 - 0.3, 0, 0), new THREE.Vector3(X1 + 0.3, 0, 0)]),
      new THREE.LineBasicMaterial({ color: '#dc2626' }),
    );
    const yAxis = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, Y0 - 0.3, 0), new THREE.Vector3(0, Y1 + 0.5, 0)]),
      new THREE.LineBasicMaterial({ color: '#16a34a' }),
    );
    group.add(xAxis, yAxis);
    const xTag = makeLabel('x', { fontSize: 38, scale: 0.85, color: '#b91c1c' });
    xTag.position.set(X1 + 0.55, 0.3, 0);
    const yTag = makeLabel('y', { fontSize: 38, scale: 0.85, color: '#15803d' });
    yTag.position.set(0.35, Y1 + 0.75, 0);
    const oTag = makeLabel('O', { fontSize: 34, scale: 0.75 });
    oTag.position.set(-0.4, -0.4, 0);
    group.add(xTag, yTag, oTag);
    // 轴刻度数字
    const tickMat = std('#64748b');
    for (let i = -5; i <= 5; i++) {
      if (i === 0) continue;
      const tx = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.14, 0.045), tickMat);
      tx.position.set(i, 0, 0);
      const ty = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.045, 0.045), tickMat);
      ty.position.set(0, i, 0);
      group.add(tx, ty);
      const nx = makeLabel(String(i), { fontSize: 26, scale: 0.55, color: '#64748b' });
      nx.position.set(i, -0.34, 0);
      const ny = makeLabel(String(i), { fontSize: 26, scale: 0.55, color: '#64748b' });
      ny.position.set(-0.36, i, 0);
      group.add(nx, ny);
    }

    // 两条彩色粗直线（TubeGeometry）
    const mat1 = std(COL1, { emissive: COL1, emissiveIntensity: 0.35 });
    const mat2 = std(COL2, { emissive: '#ea580c', emissiveIntensity: 0.35 });
    const tube1 = new THREE.Mesh(new THREE.BufferGeometry(), mat1);
    const tube2 = new THREE.Mesh(new THREE.BufferGeometry(), mat2);
    group.add(tube1, tube2);
    const line1Label = makeLabel('', { fontSize: 36, scale: 0.9, color: COL1 });
    const line2Label = makeLabel('', { fontSize: 36, scale: 0.9, color: '#c2410c' });
    group.add(line1Label, line2Label);

    // 交点小球与坐标标签
    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 18, 14),
      std('#dc2626', { emissive: '#b91c1c', emissiveIntensity: 0.7 }),
    );
    group.add(hit);
    const hitLabel = makeLabel('', { fontSize: 42, scale: 1.0, color: '#b91c1c' });
    group.add(hitLabel);

    // 步骤二：沿第一条线滑动的测试点 + 提示
    const probeMat = std('#f8fafc', { emissive: COL1, emissiveIntensity: 0.9 });
    const probe1 = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), probeMat);
    const probe2 = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), probeMat);
    group.add(probe1, probe2);
    const hintLabel = makeLabel('', { fontSize: 34, scale: 0.85, color: COL1 });
    group.add(hintLabel);

    // 顶部说明牌
    const infoLabel = makeLabel('', { fontSize: 42, scale: 1.05, color: '#0f172a' });
    infoLabel.position.set(0, 5.6, 0);
    group.add(infoLabel);

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

    // 直线标签位置：取直线上靠右且不出窗口的点
    const labelPosOn = (l: LineDef, dy: number) => {
      let px = 4.3;
      let py = l.m * px + l.b;
      if (py > Y1 - 0.6) {
        py = Y1 - 0.6;
        px = (py - l.b) / l.m;
      }
      if (py < Y0 + 0.6) {
        py = Y0 + 0.6;
        px = (py - l.b) / l.m;
      }
      return new THREE.Vector3(px + 0.75, py + dy, 0);
    };

    let seg1: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];

    const rebuildSys = () => {
      const def = SYSTEMS[sysKey];
      seg1 = clipLine(def.l1.m, def.l1.b);
      const s2 = clipLine(def.l2.m, def.l2.b);
      tube1.geometry.dispose();
      tube1.geometry = new THREE.TubeGeometry(new THREE.LineCurve3(seg1[0], seg1[1]), 8, 0.055, 8, false);
      tube2.geometry.dispose();
      tube2.geometry = new THREE.TubeGeometry(new THREE.LineCurve3(s2[0], s2[1]), 8, 0.055, 8, false);
      line1Label.position.copy(labelPosOn(def.l1, 0.45));
      line2Label.position.copy(labelPosOn(def.l2, -0.5));
      setText(line1Label, def.l1.text, { fontSize: 36, scale: 0.9, color: COL1 });
      setText(line2Label, def.l2.text, { fontSize: 36, scale: 0.9, color: '#c2410c' });
      hit.position.set(def.sol.x, def.sol.y, 0);
      hitLabel.position.set(def.sol.x + 1.15, def.sol.y + 0.55, 0);
      setText(hitLabel, `(${def.sol.x}, ${def.sol.y})`, { fontSize: 42, scale: 1.0, color: '#b91c1c' });
      setText(hintLabel, `这条线上的每个点都满足 ${def.l1.text}`, { fontSize: 34, scale: 0.85, color: COL1 });
    };

    const rebuildInfo = () => {
      const def = SYSTEMS[sysKey];
      if (step === 0) {
        setText(infoLabel, `${def.l1.text}  与  ${def.l2.text} 联立`, { fontSize: 42, scale: 1.05, color: '#0f172a' });
      } else if (step === 1) {
        setText(infoLabel, `${def.l1.text} 的无数组解 → 一条直线`, { fontSize: 42, scale: 1.05, color: COL1 });
      } else if (step === 2) {
        setText(infoLabel, `交点 (${def.sol.x}, ${def.sol.y}) 同时满足两个方程`, { fontSize: 42, scale: 1.05, color: '#b91c1c' });
      } else {
        setText(infoLabel, `消元求解：x = ${def.sol.x}，y = ${def.sol.y}`, { fontSize: 42, scale: 1.05, color: '#15803d' });
      }
    };

    rebuildSys();
    rebuildInfo();

    return {
      setStep(i) {
        step = i;
        rebuildInfo();
      },
      setParam(id, value) {
        if (id === 'sys') {
          sysKey = String(value) as SysKey;
          rebuildSys();
          rebuildInfo();
        }
      },
      update(_dt, elapsed) {
        // 交点脉动
        const amp = step >= 2 ? 0.28 : 0.12;
        hit.scale.setScalar(1 + Math.abs(Math.sin(elapsed * 3)) * amp);
        // 步骤二：测试点沿第一条线往返滑动
        const showProbes = step === 1;
        probe1.visible = showProbes;
        probe2.visible = showProbes;
        hintLabel.visible = showProbes;
        if (showProbes) {
          const s1v = 0.5 + 0.45 * Math.sin(elapsed * 0.7);
          const s2v = 0.5 + 0.45 * Math.sin(elapsed * 0.7 + Math.PI * 0.7);
          probe1.position.lerpVectors(seg1[0], seg1[1], s1v);
          probe2.position.lerpVectors(seg1[0], seg1[1], s2v);
          hintLabel.position.copy(probe1.position).add(new THREE.Vector3(0.4, 0.75, 0));
        }
      },
      dispose() {
        ctx.scene.remove(group);
        disposeObject(group);
      },
    };
  },
};
