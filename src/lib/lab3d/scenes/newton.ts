// ---------------------------------------------------------------------------
// 物理 · 牛顿第一定律与惯性：斜面小车实验 + 理想推理 + 惯性演示
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, disposeObject, makeArrow, makeLabel, std } from '../three-utils';

type SurfaceKey = 'towel' | 'cloth' | 'wood' | 'ice';

const RAMP_END_X = -1.0; // 斜面底端（水平面起点）
const RAMP_TOP_X = -4.6;
const RAMP_TOP_Y = 2.3;
const PLANE_END_X = 8.5;
const V_CAP = 3.7; // 到达水平面的速度上限
const BARRIER_X = 3.2; // 惯性演示挡板位置

const SURFACES: Record<SurfaceKey, { name: string; decel: number; color: string }> = {
  towel: { name: '毛巾', decel: 3.2, color: '#dc2626' },
  cloth: { name: '棉布', decel: 1.8, color: '#60a5fa' },
  wood: { name: '木板', decel: 0.9, color: '#a16207' },
  ice: { name: '冰面', decel: 0, color: '#bae6fd' },
};

export const newtonScene: Scene3DDefinition = {
  id: 'phys-newton',
  title: '牛顿第一定律',
  subject: '物理',
  grade: '8下',
  icon: '🛞',
  tagline: '表面越光滑小车滑得越远——推理出：不受力的物体将一直运动',
  keywords: ['牛顿第一定律', '惯性', '阻力', '理想实验', '运动状态改变'],
  camera: { position: [3.5, 4.5, 10], target: [1.5, 0.8, 0] },
  controls: [
    {
      kind: 'select',
      id: 'surface',
      label: '水平面材质',
      options: [
        { value: 'towel', label: '毛巾' },
        { value: 'cloth', label: '棉布' },
        { value: 'wood', label: '木板' },
        { value: 'ice', label: '冰面（理想）' },
      ],
      defaultValue: 'wood',
    },
    { kind: 'button', id: 'release', label: '🛞 释放小车' },
  ],
  steps: [
    {
      title: '力维持运动吗',
      text: '两千多年前，亚里士多德认为：力是维持运动的原因，不推物体就会停下来。真的是这样吗？注意看：小车从斜面滑下来以后，并没有马上停下，而是继续向前滑了一段路。',
    },
    {
      title: '阻力实验',
      text: '让小车从斜面的同一高度滑下，到达水平面时速度相同。换不同材质试试：毛巾上很快停下，棉布上滑得远些，木板上更远。表面越光滑，阻力越小，滑行的距离越远。',
    },
    {
      title: '科学推理',
      text: '继续推理下去：如果水平面绝对光滑、阻力为零，小车将不会减速，而是以恒定的速度一直运动下去。这就是牛顿第一定律：一切物体在不受力时，总保持静止状态或匀速直线运动状态。',
    },
    {
      title: '惯性',
      text: '物体保持原来运动状态不变的性质叫惯性。看演示：小车撞上挡板突然停下，车上的小球却继续向前飞了出去。坐车时急刹车人会向前倾，也是惯性在作怪。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 16);
    const root = new THREE.Group();
    ctx.scene.add(root);

    let step = 0;
    let surface: SurfaceKey = 'wood';
    let phase: 'idle' | 'ramp' | 'flat' | 'stopped' = 'idle';
    let x = RAMP_TOP_X;
    let v = 0;
    let wheelRot = 0;

    const tanT = RAMP_TOP_Y / (RAMP_END_X - RAMP_TOP_X); // 斜面坡度
    const theta = Math.atan(tanT);
    const surfY = (px: number) => (px <= RAMP_END_X ? (RAMP_END_X - px) * tanT : 0);

    // 斜面
    const rampLen = Math.hypot(RAMP_END_X - RAMP_TOP_X, RAMP_TOP_Y);
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(rampLen, 0.16, 1.5), std('#78716c'));
    ramp.position.set((RAMP_TOP_X + RAMP_END_X) / 2, RAMP_TOP_Y / 2 - 0.1, 0);
    ramp.rotation.z = -theta;
    root.add(ramp);
    const rampLabel = makeLabel('斜面（同一高度滑下）', { fontSize: 34, scale: 0.8 });
    rampLabel.position.set(RAMP_TOP_X + 0.6, RAMP_TOP_Y + 0.7, 0);
    root.add(rampLabel);

    // 水平面（材质随选择变色）
    const planeMat = std(SURFACES.wood.color);
    const plane = new THREE.Mesh(
      new THREE.BoxGeometry(PLANE_END_X - RAMP_END_X, 0.24, 2.2),
      planeMat,
    );
    plane.position.set((RAMP_END_X + PLANE_END_X) / 2, -0.12, 0);
    root.add(plane);

    // 距离标尺
    for (let d = 0; d <= 8; d++) {
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.22), std('#475569'));
      tick.position.set(RAMP_END_X + d, 0.07, 1.0);
      root.add(tick);
      if (d % 2 === 0) {
        const num = makeLabel(`${d}`, { fontSize: 32, scale: 0.7 });
        num.position.set(RAMP_END_X + d, 0.38, 1.0);
        root.add(num);
      }
    }
    const rulerLabel = makeLabel('滑行距离（米）', { fontSize: 34, scale: 0.8 });
    rulerLabel.position.set(4.2, 0.72, 1.05);
    root.add(rulerLabel);

    // 停车位置小旗
    const flag = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.8, 8), std('#475569'));
    pole.position.y = 0.4;
    const banner = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.03), std('#e11d48'));
    banner.position.set(0.2, 0.68, 0);
    flag.add(pole, banner);
    flag.visible = false;
    root.add(flag);

    // 小车
    const cart = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.3, 0.6), std('#0ea5e9'));
    body.position.y = 0.36;
    cart.add(body);
    const wheels: THREE.Mesh[] = [];
    for (const wx of [-0.28, 0.28]) {
      for (const wz of [-0.32, 0.32]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 14), std('#1e293b'));
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(wx, 0.14, wz);
        cart.add(wheel);
        wheels.push(wheel);
      }
    }
    cart.position.set(x, surfY(x), 0);
    cart.rotation.z = -theta;
    root.add(cart);

    // 惯性演示：小球 + 挡板
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 16, 12),
      std('#f59e0b', { emissive: '#b45309', emissiveIntensity: 0.3 }),
    );
    ball.visible = false;
    root.add(ball);
    const barrier = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.9, 1.0), std('#7f1d1d'));
    barrier.position.set(BARRIER_X + 0.2, 0.45, 0);
    barrier.visible = false;
    root.add(barrier);
    let ballMode: 'ride' | 'fly' | 'rest' = 'ride';
    let ballX = 0;
    let ballY = 0;
    let ballVX = 0;
    let ballT = 0;

    // 科学推理：灰色长箭头
    const reasonArrow = makeArrow('#64748b');
    reasonArrow.set(new THREE.Vector3(2.8, 0.9, 0), new THREE.Vector3(8.0, 0.9, 0));
    reasonArrow.group.visible = false;
    root.add(reasonArrow.group);
    const reasonLabel = makeLabel('阻力为零 → 永远匀速直线运动', { fontSize: 36, scale: 0.9, color: '#475569' });
    reasonLabel.position.set(5.4, 1.45, 0);
    reasonLabel.visible = false;
    root.add(reasonLabel);

    // 状态牌
    const status = makeLabel('', { fontSize: 40, scale: 1, color: '#0f766e' });
    status.position.set(1.6, 3.4, 0);
    root.add(status);
    let lastStatus = '';
    const setStatus = (text: string, color = '#0f766e') => {
      if (text === lastStatus) return;
      lastStatus = text;
      status.material.map?.dispose();
      status.material.dispose();
      const nl = makeLabel(text, { fontSize: 40, scale: 1, color });
      status.material = nl.material;
      status.scale.copy(nl.scale);
    };
    setStatus(`当前水平面：${SURFACES[surface].name}`);

    const release = () => {
      phase = 'ramp';
      x = RAMP_TOP_X;
      v = 0;
      flag.visible = false;
      ballMode = 'ride';
      setStatus(`当前水平面：${SURFACES[surface].name}`);
    };

    const applyStep = () => {
      const inertia = step === 3;
      barrier.visible = inertia;
      ball.visible = inertia;
      reasonArrow.group.visible = step === 2;
      reasonLabel.visible = step === 2;
      if ((step === 1 || step === 3) && phase !== 'ramp' && phase !== 'flat') release();
    };

    return {
      setStep(i) {
        step = i;
        applyStep();
      },
      setParam(id, value) {
        if (id === 'surface') {
          surface = String(value) as SurfaceKey;
          planeMat.color.set(SURFACES[surface].color);
          setStatus(`当前水平面：${SURFACES[surface].name}`);
        }
        if (id === 'release') release();
      },
      update(dt) {
        if (phase === 'ramp') {
          v += 1.9 * dt;
          x += v * dt;
          if (x >= RAMP_END_X) {
            x = RAMP_END_X;
            v = Math.min(v, V_CAP);
            phase = 'flat';
          }
        } else if (phase === 'flat') {
          const decel = SURFACES[surface].decel;
          if (decel > 0) v = Math.max(0, v - decel * dt);
          x += v * dt;
          if (step === 3 && x + 0.45 >= BARRIER_X) {
            // 撞上挡板：车停，小球因惯性继续向前（慢放）
            x = BARRIER_X - 0.45;
            phase = 'stopped';
            ballMode = 'fly';
            ballX = x + 0.5;
            ballY = surfY(x) + 0.67;
            ballVX = Math.max(v, 2.6);
            ballT = 0;
            v = 0;
            setStatus('车停了，小球继续向前飞——惯性！', '#b91c1c');
          } else if (decel === 0 && x > PLANE_END_X - 0.3) {
            x = RAMP_END_X + 0.1; // 冰面：滑出后回绕，一直匀速
            setStatus('冰面：不减速，一直匀速滑下去！');
          } else if (v === 0 && decel > 0) {
            phase = 'stopped';
            const dist = x - RAMP_END_X;
            flag.position.set(x + 0.5, 0, 0.6);
            flag.visible = true;
            setStatus(`${SURFACES[surface].name}：滑行约 ${dist.toFixed(1)} 米`);
          }
        }
        wheelRot -= (v * dt) / 0.14;
        wheels.forEach((w) => {
          w.rotation.y = wheelRot;
        });
        cart.position.set(x, surfY(x), 0);
        cart.rotation.z = phase === 'ramp' || (phase === 'idle' && x < RAMP_END_X) ? -theta : 0;

        // 小球：跟车 / 慢放飞行 / 落地静止
        if (step === 3) {
          if (ballMode === 'ride') {
            ball.position.set(x + 0.05, surfY(x) + 0.67, 0);
          } else if (ballMode === 'fly') {
            ballT += dt * 0.45; // 慢放
            const bx = ballX + ballVX * ballT;
            const by = ballY - 4.9 * ballT * ballT;
            if (by <= 0.16) {
              ball.position.set(bx, 0.16, 0);
              ballMode = 'rest';
            } else {
              ball.position.set(bx, by, 0);
            }
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
