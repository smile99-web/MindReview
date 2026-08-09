// ---------------------------------------------------------------------------
// 物理 · 质量与密度：同体积的木、铝、铁、铜上天平——引出密度 = 质量 ÷ 体积
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, damp, disposeObject, makeLabel, std } from '../three-utils';

type MatKind = 'wood' | 'aluminium' | 'iron' | 'copper';

const MATS: Record<MatKind, { name: string; rho: number; color: string }> = {
  wood: { name: '木块', rho: 0.5, color: '#b07a3f' },
  aluminium: { name: '铝块', rho: 2.7, color: '#cbd5e1' },
  iron: { name: '铁块', rho: 7.9, color: '#4b5563' },
  copper: { name: '铜块', rho: 8.9, color: '#c2713a' },
};
const ORDER: MatKind[] = ['wood', 'aluminium', 'iron', 'copper'];
const BASE_SIDE = 0.5; // 体积倍数 1 时的边长
const WEIGHT_UNIT = 4.5; // 每个砝码对应的质量
const WEIGHT_N = 6;
const TABLE_TOP = 1.08;
const PIVOT = new THREE.Vector3(2.0, 2.6, 0); // 天平横梁支点
const BEAM_HALF = 1.25;
const PAN_DROP = 0.8;

const STEP_HINTS = [
  '天平：测量质量的工具',
  '同体积，不同物质质量差很多',
  '密度是物质的特性，与大小无关',
  '水的密度：1.0×10³ kg/m³',
];

interface Block {
  kind: MatKind;
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  slot: THREE.Vector3;
}

type LabelOpts = Parameters<typeof makeLabel>[1];

export const densityScene: Scene3DDefinition = {
  id: 'phys-density',
  title: '质量与密度',
  subject: '物理',
  grade: '8上',
  icon: '🧱',
  tagline: '同样大小的木块、铁块、铜块，为什么轻重差这么多？',
  keywords: ['质量', '密度', '天平', '体积', '密度公式', '物质特性', '千克'],
  camera: { position: [0.4, 3.6, 9.8], target: [-0.3, 1.6, 0] },
  controls: [
    {
      kind: 'select',
      id: 'mat',
      label: '物质',
      options: [
        { value: 'wood', label: '木块 0.5' },
        { value: 'aluminium', label: '铝块 2.7' },
        { value: 'iron', label: '铁块 7.9' },
        { value: 'copper', label: '铜块 8.9' },
      ],
      defaultValue: 'iron',
    },
    { kind: 'slider', id: 'vol', label: '体积倍数', min: 1, max: 3, step: 0.5, defaultValue: 1 },
  ],
  steps: [
    {
      title: '质量',
      text: '物体所含物质的多少叫质量，单位是千克，实验室里用天平测量。换选一种物质，方块会被放上左盘，右盘的砝码一个个加上去，直到横梁重新水平——砝码总质量就是方块的质量。',
    },
    {
      title: '引出密度',
      text: '四个方块体积完全相同，称出来的质量却差很多：木块最轻，铜块最重。同样体积比质量，说明不同物质“实的程度”不一样——描述这个性质的物理量，就是密度。',
    },
    {
      title: '密度公式',
      text: '密度等于质量除以体积。它是物质的一种特性：铁块无论多大多小，密度都是七点九乘十的三次方千克每立方米，跟它的质量和体积没有关系。',
    },
    {
      title: '水的密度',
      text: '记住一个常用值：水的密度是一点零乘十的三次方千克每立方米，意思是一立方米的水正好一千千克。密度比水小的木头能浮在水面上，铁块铜块则会沉底。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 16);
    const root = new THREE.Group();
    ctx.scene.add(root);

    let selected: MatKind = 'iron';
    let vol = 1;
    let mShown = 0; // 右盘砝码动画中的质量
    let beamAngle = 0;
    let step = 0;

    // ---- 桌子 ----
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.16, 2.0), std('#a16207'));
    tableTop.position.set(-2.4, TABLE_TOP - 0.08, 0);
    root.add(tableTop);
    const legGeo = new THREE.BoxGeometry(0.14, TABLE_TOP - 0.16, 0.14);
    const legMat = std('#78350f');
    for (const lx of [-4.6, -0.2]) {
      for (const lz of [-0.85, 0.85]) {
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set(lx, (TABLE_TOP - 0.16) / 2, lz);
        root.add(leg);
      }
    }

    // ---- 四个物质方块 ----
    const blocks: Block[] = ORDER.map((kind, i) => {
      const info = MATS[kind];
      const mat = std(info.color, { emissive: info.color, emissiveIntensity: 0.06 });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
      root.add(mesh);
      return { kind, mesh, mat, slot: new THREE.Vector3(-4.1 + i * 0.95, TABLE_TOP, 0) };
    });

    // 每块下方的密度标签
    for (const [i, kind] of ORDER.entries()) {
      const info = MATS[kind];
      const l = makeLabel(`${info.name} ${info.rho}`, { fontSize: 30, scale: 0.62, color: '#334155' });
      l.position.set(-4.1 + i * 0.95, TABLE_TOP - 0.45, 1.02);
      root.add(l);
    }
    const unitLabel = makeLabel('密度单位：×10³ kg/m³；体积倍数 1 ≈ 1 升', { fontSize: 26, scale: 0.6, color: '#64748b' });
    unitLabel.position.set(-2.4, TABLE_TOP - 0.75, 1.02);
    root.add(unitLabel);

    // ---- 托盘天平 ----
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.14, 18), std('#57534e'));
    base.position.set(PIVOT.x, 0.07, 0);
    root.add(base);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, PIVOT.y - 0.14, 12), std('#78716c'));
    column.position.set(PIVOT.x, (PIVOT.y + 0.14) / 2, 0);
    root.add(column);
    const beamGroup = new THREE.Group();
    beamGroup.position.copy(PIVOT);
    root.add(beamGroup);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(BEAM_HALF * 2 + 0.2, 0.09, 0.12), std('#b45309'));
    beamGroup.add(beam);
    // 吊盘（左右各一，始终竖直下垂）
    const mkPan = (side: number) => {
      const pan = new THREE.Group();
      pan.position.set(side * BEAM_HALF, 0, 0);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, PAN_DROP, 8), std('#44403c'));
      rod.position.y = -PAN_DROP / 2;
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.08, 18), std('#d6d3d1', { metalness: 0.4 }));
      disc.position.y = -PAN_DROP;
      pan.add(rod, disc);
      beamGroup.add(pan);
      return pan;
    };
    const panL = mkPan(-1);
    const panR = mkPan(1);
    const balanceLabel = makeLabel('托盘天平', { fontSize: 30, scale: 0.65, color: '#44403c' });
    balanceLabel.position.set(PIVOT.x, 0.42, 1.0);
    root.add(balanceLabel);

    // 砝码（右盘上一摞）
    const weightGeo = new THREE.CylinderGeometry(0.12, 0.17, 0.13, 12);
    const weights: THREE.Mesh[] = [];
    for (let i = 0; i < WEIGHT_N; i++) {
      const w = new THREE.Mesh(weightGeo, std('#9ca3af', { metalness: 0.65, roughness: 0.35 }));
      w.visible = false;
      root.add(w);
      weights.push(w);
    }

    // ---- 标签 ----
    const formulaLabel = makeLabel('ρ = m ÷ V（密度 = 质量 ÷ 体积）', { fontSize: 40, scale: 1.0, color: '#0f172a' });
    formulaLabel.position.set(0, 4.65, 0);
    root.add(formulaLabel);
    const MASS_OPTS: LabelOpts = { fontSize: 34, scale: 0.85, color: '#0f766e' };
    const HINT_OPTS: LabelOpts = { fontSize: 30, scale: 0.75, color: '#475569' };
    const massLabel = makeLabel('', MASS_OPTS);
    massLabel.position.set(PIVOT.x, 3.45, 0);
    root.add(massLabel);
    const hintLabel = makeLabel('', HINT_OPTS);
    hintLabel.position.set(0, 4.1, 0);
    root.add(hintLabel);
    const waterLabel = makeLabel('水的密度 = 1.0×10³ kg/m³（1 m³ 的水 = 1000 kg）', {
      fontSize: 30,
      scale: 0.75,
      color: '#0369a1',
    });
    waterLabel.position.set(-2.4, 2.75, 0);
    root.add(waterLabel);

    const setText = (sprite: THREE.Sprite, text: string, opts: LabelOpts) => {
      sprite.material.map?.dispose();
      sprite.material.dispose();
      const nl = makeLabel(text, opts);
      sprite.material = nl.material;
      sprite.scale.copy(nl.scale);
    };
    const mass = () => MATS[selected].rho * vol;
    const refreshMass = () => {
      const info = MATS[selected];
      setText(
        massLabel,
        `${info.name}：m = ρ × V = ${info.rho} × ${vol.toFixed(1)} = ${mass().toFixed(1)} 千克`,
        MASS_OPTS,
      );
    };
    const refreshHint = () => setText(hintLabel, STEP_HINTS[step], HINT_OPTS);
    refreshMass();
    refreshHint();

    return {
      setStep(i) {
        step = i;
        waterLabel.visible = step === 3;
        refreshHint();
      },
      setParam(id, value) {
        if (id === 'mat') selected = String(value) as MatKind;
        if (id === 'vol') vol = Number(value);
        mShown = 0; // 砝码重新一个个加，横梁先倾后平
        refreshMass();
      },
      update(dt, elapsed) {
        const m = mass();
        mShown = damp(mShown, m, 1.8, dt);
        // 横梁倾斜 ∝ 左右质量差，砝码加够后回平
        const target = THREE.MathUtils.clamp((m - mShown) * 0.06, -0.15, 0.15);
        beamAngle = damp(beamAngle, target, 3.5, dt);
        beamGroup.rotation.z = beamAngle;
        panL.rotation.z = -beamAngle;
        panR.rotation.z = -beamAngle;
        // 左右吊盘顶端的世界坐标
        const cos = Math.cos(beamAngle);
        const sin = Math.sin(beamAngle);
        const panLTop = new THREE.Vector3(PIVOT.x - BEAM_HALF * cos, PIVOT.y - BEAM_HALF * sin - PAN_DROP, 0);
        const panRTop = new THREE.Vector3(PIVOT.x + BEAM_HALF * cos, PIVOT.y + BEAM_HALF * sin - PAN_DROP, 0);
        // 方块：选中的飞上左盘，其余留在桌面槽位
        const side = BASE_SIDE * Math.cbrt(vol);
        for (const b of blocks) {
          const onPan = b.kind === selected;
          const targetPos = onPan
            ? new THREE.Vector3(panLTop.x, panLTop.y + 0.04 + side / 2, 0)
            : new THREE.Vector3(b.slot.x, b.slot.y + side / 2, 0);
          b.mesh.position.x = damp(b.mesh.position.x, targetPos.x, 5, dt);
          b.mesh.position.y = damp(b.mesh.position.y, targetPos.y, 5, dt);
          b.mesh.position.z = damp(b.mesh.position.z, targetPos.z, 5, dt);
          const s = damp(b.mesh.scale.x, side, 6, dt);
          b.mesh.scale.setScalar(s);
          b.mat.emissiveIntensity = onPan ? 0.3 + Math.sin(elapsed * 4) * 0.12 : 0.06;
        }
        // 砝码逐个出现，配平动画
        const count = Math.min(WEIGHT_N, Math.round(mShown / WEIGHT_UNIT));
        for (let i = 0; i < WEIGHT_N; i++) {
          const w = weights[i];
          w.visible = i < count;
          if (w.visible) {
            w.position.set(panRTop.x, panRTop.y + 0.1 + i * 0.14, 0);
          }
        }
      },
      dispose() {
        ctx.scene.remove(root);
        disposeObject(root);
      },
    };
  },
};
