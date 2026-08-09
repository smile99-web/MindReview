// ---------------------------------------------------------------------------
// 物理 · 声现象：振膜振动产生声波——频率决定音调，振幅决定响度
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, disposeObject, makeLabel, std } from '../three-utils';

const RING_N = 16;
const WAVE_PTS = 160;
const RING_X0 = -1.55; // 声波环出发位置
const RING_X1 = 5.6; // 声波环消散位置
const RING_Y = 1.7;
// 波形面板
const WX = 0.2;
const WY = 4.55;
const WW = 4.6;
const WH = 1.9;

const STEP_HINTS = [
  '振膜来回振动 → 发出声音',
  '一圈圈声波靠空气传出去；真空不能传声',
  '频率滑块 → 波变密，音调变高',
  '振幅滑块 → 波变高，响度变大',
];

interface Ring {
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  active: boolean;
  x: number;
}

type LabelOpts = Parameters<typeof makeLabel>[1];

export const soundScene: Scene3DDefinition = {
  id: 'phys-sound',
  title: '声现象',
  subject: '物理',
  grade: '8上',
  icon: '🔊',
  tagline: '声音由振动产生：频率决定音调，振幅决定响度',
  keywords: ['声音', '声源', '振动', '音调', '响度', '音色', '频率', '振幅', '声波', '介质'],
  camera: { position: [1.2, 3.6, 10], target: [0.8, 2.2, 0] },
  controls: [
    { kind: 'slider', id: 'freq', label: '频率（音调）', min: 1, max: 8, step: 0.5, defaultValue: 3 },
    { kind: 'slider', id: 'amp', label: '振幅（响度）', min: 0.2, max: 1, step: 0.1, defaultValue: 0.6 },
  ],
  steps: [
    {
      title: '振动产生声音',
      text: '看喇叭的振膜：它在飞快地来回振动，声音就是这样产生的。一切正在发声的物体都在振动——拨琴弦、敲音叉都一样；振动停止，发声也就停止。',
    },
    {
      title: '介质传声',
      text: '振膜推动面前的空气，形成一圈圈疏密相间的波向外传，这就是声波。声音要靠介质传播，气体、液体、固体都行；把玻璃罩里的空气抽走，铃声就消失了——真空不能传声。',
    },
    {
      title: '音调与频率',
      text: '每秒振动的次数叫频率，它决定音调：频率高，音调就高。蚊子翅膀振动快，声音又尖又高；牛叫振动慢，声音又低又沉。拖动频率滑块，看声波和波形变密还是变疏。',
    },
    {
      title: '响度与音色',
      text: '振动的幅度叫振幅，它决定响度：振幅越大，声音越响，用力敲鼓就是增大振幅。而音色让我们一听就分清小提琴和钢琴。调大振幅滑块，看振膜和波形的变化。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 16);
    const root = new THREE.Group();
    ctx.scene.add(root);

    let freq = 3;
    let amp = 0.6;
    let phase = 0;
    let spawnT = 0;
    let step = 0;

    // ---- 喇叭 ----
    const speaker = new THREE.Group();
    speaker.position.set(-2.6, RING_Y, 0);
    const bodyBox = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.5, 1.5), std('#334155'));
    bodyBox.position.x = -0.35;
    const horn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.75, 0.9, 20, 1, true),
      std('#64748b', { side: THREE.DoubleSide }),
    );
    horn.rotation.z = Math.PI / 2;
    horn.position.x = 0.45;
    const membrane = new THREE.Mesh(
      new THREE.CircleGeometry(0.58, 24),
      std('#0f172a', { emissive: '#f59e0b', emissiveIntensity: 0.25, side: THREE.DoubleSide }),
    );
    membrane.rotation.y = Math.PI / 2;
    membrane.position.x = 0.92;
    speaker.add(bodyBox, horn, membrane);
    root.add(speaker);
    const spkLabel = makeLabel('喇叭振膜（声源）', { fontSize: 32, scale: 0.75 });
    spkLabel.position.set(-2.6, RING_Y + 1.55, 0);
    root.add(spkLabel);

    // ---- 声波环（对象池） ----
    const ringGeo = new THREE.TorusGeometry(1, 0.05, 8, 36);
    const rings: Ring[] = [];
    for (let i = 0; i < RING_N; i++) {
      const mat = std('#38bdf8', {
        transparent: true,
        opacity: 0,
        emissive: '#0ea5e9',
        emissiveIntensity: 0.4,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.rotation.y = Math.PI / 2;
      mesh.position.set(RING_X0, RING_Y, 0);
      mesh.visible = false;
      root.add(mesh);
      rings.push({ mesh, mat, active: false, x: 0 });
    }

    // ---- 右侧波形面板 ----
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(WW + 0.5, WH + 0.5),
      std('#f8fafc', { transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }),
    );
    panel.position.set(WX + WW / 2, WY, -0.06);
    root.add(panel);
    const midLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(WX, WY, 0), new THREE.Vector3(WX + WW, WY, 0)]),
      new THREE.LineBasicMaterial({ color: '#94a3b8' }),
    );
    root.add(midLine);
    const waveGeo = new THREE.BufferGeometry();
    waveGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(WAVE_PTS * 3), 3));
    const wave = new THREE.Line(waveGeo, new THREE.LineBasicMaterial({ color: '#dc2626' }));
    root.add(wave);
    const waveLabel = makeLabel('波形：疏密看音调，高低看响度', { fontSize: 28, scale: 0.65, color: '#b91c1c' });
    waveLabel.position.set(WX + WW / 2, WY - WH / 2 - 0.4, 0);
    root.add(waveLabel);

    // ---- 状态与步骤标签 ----
    const STATUS_OPTS: LabelOpts = { fontSize: 36, scale: 0.9, color: '#0f766e' };
    const HINT_OPTS: LabelOpts = { fontSize: 32, scale: 0.8, color: '#475569' };
    const statusLabel = makeLabel('', STATUS_OPTS);
    statusLabel.position.set(WX + WW / 2, WY + WH / 2 + 0.55, 0);
    root.add(statusLabel);
    const hintLabel = makeLabel('', HINT_OPTS);
    hintLabel.position.set(1.0, 0.5, 0);
    root.add(hintLabel);

    const setText = (sprite: THREE.Sprite, text: string, opts: LabelOpts) => {
      sprite.material.map?.dispose();
      sprite.material.dispose();
      const nl = makeLabel(text, opts);
      sprite.material = nl.material;
      sprite.scale.copy(nl.scale);
    };
    const refreshStatus = () => {
      const tone = freq >= 5 ? '高' : freq <= 2 ? '低' : '中';
      const loud = amp >= 0.7 ? '大' : amp <= 0.35 ? '小' : '中';
      setText(statusLabel, `音调：${tone}（频率 ${freq.toFixed(1)}）   响度：${loud}（振幅 ${amp.toFixed(1)}）`, STATUS_OPTS);
    };
    const refreshHint = () => setText(hintLabel, STEP_HINTS[step], HINT_OPTS);
    refreshStatus();
    refreshHint();

    return {
      setStep(i) {
        step = i;
        refreshHint();
      },
      setParam(id, value) {
        if (id === 'freq') freq = Number(value);
        if (id === 'amp') amp = Number(value);
        refreshStatus();
      },
      update(dt) {
        // 振膜往复
        phase += dt * freq * 1.6;
        membrane.position.x = 0.92 + Math.sin(phase) * amp * 0.16;
        // 按频率生成声波环
        spawnT += dt;
        const interval = 1 / (0.5 + freq * 0.28);
        if (spawnT >= interval) {
          spawnT -= interval;
          const free = rings.find((r) => !r.active);
          if (free) {
            free.active = true;
            free.x = RING_X0;
            free.mesh.visible = true;
          }
        }
        for (const r of rings) {
          if (!r.active) continue;
          r.x += 1.7 * dt;
          if (r.x > RING_X1) {
            r.active = false;
            r.mesh.visible = false;
            continue;
          }
          const prog = (r.x - RING_X0) / (RING_X1 - RING_X0);
          const radius = 0.35 + (r.x - RING_X0) * 0.17;
          r.mesh.position.x = r.x;
          r.mesh.scale.set(radius, radius, 0.5 + amp); // 环的粗细体现振幅
          r.mat.opacity = amp * 0.8 * (1 - prog) + 0.02; // 亮度体现振幅
        }
        // 实时波形
        const attr = waveGeo.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < WAVE_PTS; i++) {
          const u = i / (WAVE_PTS - 1);
          attr.setXYZ(i, WX + u * WW, WY + amp * 0.8 * Math.sin(u * freq * 2.2 - phase), 0.02);
        }
        attr.needsUpdate = true;
      },
      dispose() {
        ctx.scene.remove(root);
        disposeObject(root);
      },
    };
  },
};
