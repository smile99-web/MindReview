// ---------------------------------------------------------------------------
// 数学 · 概率初步：抛硬币 / 掷骰子，看频率稳定在概率附近
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, damp, disposeObject, makeLabel, std } from '../three-utils';

type Exp = 'coin' | 'dice';
const BAR_SCALE = 5; // 频率 1 → 柱高 5

export const probabilityScene: Scene3DDefinition = {
  id: 'math-probability',
  title: '概率初步',
  subject: '数学',
  grade: '9上',
  icon: '🎲',
  tagline: '抛一百次硬币：频率会越来越接近概率',
  keywords: ['概率', '随机事件', '频率', '试验', '可能性', '等可能', '掷骰子', '摸球'],
  camera: { position: [0, 4, 11], target: [0, 2.2, 0] },
  controls: [
    {
      kind: 'select',
      id: 'exp',
      label: '试验',
      options: [
        { value: 'coin', label: '抛硬币' },
        { value: 'dice', label: '掷骰子' },
      ],
      defaultValue: 'coin',
    },
    { kind: 'button', id: 'run10', label: '抛 10 次' },
    { kind: 'button', id: 'run100', label: '抛 100 次' },
    { kind: 'button', id: 'reset', label: '↺ 重置' },
  ],
  steps: [
    {
      title: '三类事件',
      text: '一定会发生的叫必然事件，比如太阳从东方升起；一定不会发生的叫不可能事件；可能发生也可能不发生的，叫随机事件，比如抛硬币正面朝上。随机事件发生的可能性有大有小。',
    },
    {
      title: '概率的定义',
      text: '如果所有结果出现的可能性相等，概率就等于所求结果数，除以所有等可能结果数。抛硬币正面朝上的概率是二分之一，掷骰子掷出六点的概率是六分之一。绿色平面标出的就是这个理论值。',
    },
    {
      title: '频率与概率',
      text: '点「抛 10 次」「抛 100 次」做试验：橙色柱子是目标结果出现的频率。次数少的时候，柱子可能偏离绿线很远；试验次数越多，频率越稳定在概率附近。这就是用频率估计概率。',
    },
    {
      title: '求概率的方法',
      text: '简单试验可以直接列举所有结果；两步试验用列表法或画树状图，不重不漏地数出所有等可能结果。比如抛两枚硬币，有正正、正反、反正、反反四种结果，一正一反的概率是四分之二。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 14);
    let exp: Exp = 'coin';
    let step = 0;
    let total = 0;
    let hits = 0;
    let queue = 0; // 待做试验次数
    let tossing = 0; // 当前翻转剩余秒数
    let pendingHit = false;
    let pendingFace = 1;
    let barH = 0; // 当前柱高（阻尼）

    const group = new THREE.Group();
    ctx.scene.add(group);

    // 硬币（金 = 正面，蓝 = 反面）
    const coin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.85, 0.14, 32),
      [
        std('#94a3b8'),
        std('#fbbf24', { emissive: '#d97706', emissiveIntensity: 0.3 }),
        std('#7dd3fc', { emissive: '#0284c7', emissiveIntensity: 0.3 }),
      ],
    );
    coin.position.set(-2.6, 1.7, 0);
    group.add(coin);

    // 骰子
    const dice = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 1.15, 1.15),
      std('#f8fafc', { roughness: 0.35 }),
    );
    dice.position.set(-2.6, 1.7, 0);
    dice.visible = false;
    group.add(dice);

    // 单次结果标签
    const resultLabel = makeLabel('', { fontSize: 44, scale: 1.0, color: '#0f172a' });
    resultLabel.position.set(-2.6, 3.1, 0);
    group.add(resultLabel);

    // 柱状图平台
    const baseY = 0.62;
    const platform = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.12, 1.9), std('#cbd5e1'));
    platform.position.set(2.8, baseY - 0.06, 0);
    group.add(platform);
    const chartLabel = makeLabel('频率柱状图', { fontSize: 32, scale: 0.75, color: '#475569' });
    chartLabel.position.set(2.8, 0.25, 0);
    group.add(chartLabel);

    // 频率柱
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 1, 0.95),
      std('#f97316', { emissive: '#ea580c', emissiveIntensity: 0.35 }),
    );
    bar.position.set(2.8, baseY, 0);
    bar.scale.y = 0.001;
    group.add(bar);

    // 理论概率平面（半透明 + 虚线边框）
    const theoryPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(2.8, 1.9),
      new THREE.MeshBasicMaterial({ color: '#22c55e', transparent: true, opacity: 0.28, side: THREE.DoubleSide }),
    );
    theoryPlane.rotation.x = -Math.PI / 2;
    group.add(theoryPlane);
    const theoryBorderGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-1.4, 0, -0.95),
      new THREE.Vector3(1.4, 0, -0.95),
      new THREE.Vector3(1.4, 0, 0.95),
      new THREE.Vector3(-1.4, 0, 0.95),
      new THREE.Vector3(-1.4, 0, -0.95),
    ]);
    const theoryBorder = new THREE.Line(theoryBorderGeo, new THREE.LineDashedMaterial({ color: '#16a34a', dashSize: 0.18, gapSize: 0.12 }));
    theoryBorder.computeLineDistances();
    theoryBorder.position.x = 2.8;
    group.add(theoryBorder);
    const theoryLabel = makeLabel('', { fontSize: 32, scale: 0.8, color: '#15803d' });
    group.add(theoryLabel);

    // 计数牌
    const counterLabel = makeLabel('', { fontSize: 34, scale: 0.85, color: '#0f172a' });
    counterLabel.position.set(2.8, 6.1, 0);
    group.add(counterLabel);

    /** 换文字：释放旧 material 再替换 */
    const setLabel = (
      sprite: THREE.Sprite,
      text: string,
      opts: { fontSize: number; scale: number; color: string },
    ) => {
      sprite.material.map?.dispose();
      sprite.material.dispose();
      const nl = makeLabel(text, opts);
      sprite.material = nl.material;
      sprite.scale.copy(nl.scale);
    };

    const theoryP = () => (exp === 'coin' ? 0.5 : 1 / 6);

    const refreshCounter = () => {
      const name = exp === 'coin' ? '正面' : '6 点';
      const freq = total > 0 ? (hits / total).toFixed(2) : '—';
      setLabel(
        counterLabel,
        total > 0 ? `${name} ${hits} 次 / 共 ${total} 次，频率 ${freq}` : '点「抛 10 次」开始试验',
        { fontSize: 34, scale: 0.85, color: '#0f172a' },
      );
    };

    const refreshTheory = () => {
      const y = baseY + theoryP() * BAR_SCALE;
      theoryPlane.position.set(2.8, y, 0);
      theoryBorder.position.y = y;
      setLabel(
        theoryLabel,
        exp === 'coin' ? '理论概率 1/2 = 0.5' : '理论概率 1/6 ≈ 0.167',
        { fontSize: 32, scale: 0.8, color: '#15803d' },
      );
      theoryLabel.position.set(2.8, y + 0.5, 0);
    };

    const doReset = () => {
      total = 0;
      hits = 0;
      queue = 0;
      tossing = 0;
      refreshCounter();
      setLabel(resultLabel, '', { fontSize: 44, scale: 1.0, color: '#0f172a' });
    };

    const applyExp = () => {
      coin.visible = exp === 'coin';
      dice.visible = exp === 'dice';
      doReset();
      refreshTheory();
    };
    applyExp();

    return {
      setStep(i) {
        step = i;
      },
      setParam(id, value) {
        if (id === 'exp') {
          exp = String(value) as Exp;
          applyExp();
        }
        if (id === 'run10') queue += 10;
        if (id === 'run100') queue += 100;
        if (id === 'reset') doReset();
      },
      update(dt, elapsed) {
        // 启动下一次翻转
        if (queue > 0 && tossing <= 0) {
          queue--;
          if (exp === 'coin') {
            pendingHit = Math.random() < 0.5;
          } else {
            pendingFace = 1 + Math.floor(Math.random() * 6);
            pendingHit = pendingFace === 6;
          }
          tossing = queue > 15 ? 0.05 : 0.45;
        }
        // 翻转动画与结算
        if (tossing > 0) {
          tossing -= dt;
          const spin = dt * (queue > 15 ? 42 : 18);
          if (exp === 'coin') {
            coin.rotation.x += spin;
          } else {
            dice.rotation.x += spin;
            dice.rotation.y += spin * 0.7;
          }
          if (tossing <= 0) {
            total++;
            if (pendingHit) hits++;
            if (exp === 'coin') {
              coin.rotation.x = pendingHit ? 0 : Math.PI;
              setLabel(resultLabel, pendingHit ? '正面' : '反面', {
                fontSize: 44,
                scale: 1.0,
                color: pendingHit ? '#b45309' : '#0369a1',
              });
            } else {
              setLabel(resultLabel, `点数 ${pendingFace}`, {
                fontSize: 44,
                scale: 1.0,
                color: pendingHit ? '#15803d' : '#475569',
              });
            }
            refreshCounter();
          }
        }
        // 频率柱阻尼跟随
        const target = total > 0 ? (hits / total) * BAR_SCALE : 0;
        barH = damp(barH, Math.max(target, 0.001), 6, dt);
        bar.scale.y = barH;
        bar.position.y = baseY + barH / 2;
        // 步骤强调：第 2 步呼吸理论面，第 3 步呼吸频率柱
        const planePulse = step === 1 ? 1 + Math.sin(elapsed * 3) * 0.07 : 1;
        theoryPlane.scale.set(planePulse, planePulse, 1);
        if (step === 2) {
          bar.scale.x = 0.95 + Math.sin(elapsed * 3) * 0.05;
          bar.scale.z = 0.95 + Math.sin(elapsed * 3) * 0.05;
        } else {
          bar.scale.x = 0.95;
          bar.scale.z = 0.95;
        }
      },
      dispose() {
        ctx.scene.remove(group);
        disposeObject(group);
      },
    };
  },
};
