// ---------------------------------------------------------------------------
// 物理 · 功和功率：做功两要素、W = F·s、三种不做功、功率比较
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, disposeObject, makeArrow, makeLabel, std } from '../three-utils';

type CaseKey = 'push' | 'lift' | 'carry';

const CASES: Record<CaseKey, { T: number; W: number; formula: string }> = {
  push: { T: 2.2, W: 100, formula: 'W = F·s = 50N × 2m = 100J' },
  lift: { T: 1.8, W: 150, formula: 'W = G·h = 100N × 1.5m = 150J' },
  carry: { T: 2.2, W: 0, formula: '力向上、位移水平 → W = 0' },
};

export const workScene: Scene3DDefinition = {
  id: 'phys-work',
  title: '功和功率',
  subject: '物理',
  grade: '8下',
  icon: '🏋️',
  tagline: '有力还要有距离才做功；做功快慢用功率表示',
  keywords: ['功', '功率', '做功', '焦耳', '瓦特', '有用功', '额外功'],
  camera: { position: [4.5, 3.5, 7.5], target: [0.5, 1.3, 0] },
  controls: [
    {
      kind: 'select',
      id: 'case',
      label: '情境',
      options: [
        { value: 'push', label: '推箱子前进' },
        { value: 'lift', label: '举起哑铃' },
        { value: 'carry', label: '提桶水平走（不做功）' },
      ],
      defaultValue: 'push',
    },
    { kind: 'button', id: 'act', label: '▶ 执行动作' },
  ],
  steps: [
    {
      title: '做功两要素',
      text: '做功要有两个要素，缺一不可：一是作用在物体上的力，二是物体在力的方向上通过的距离。推箱子时，力向前、箱子也向前移动，推力就对箱子做了功。',
    },
    {
      title: '功的公式',
      text: '功等于力乘以距离：W 等于 F s，单位是焦耳。用五十牛的力推箱子前进两米，做功一百焦。点"执行动作"，看着功随着移动一点点累积起来。',
    },
    {
      title: '不做功三种',
      text: '这三种情况不做功：用力推而推不动，有力无距离；物体靠惯性滑行，有距离无力；提着桶水平走，力的方向上没有距离。切换到提桶试试，看红色的提示。',
    },
    {
      title: '功率',
      text: '做功有快有慢：功率 P 等于 W 除以 t。看两台起重机做同样多的功：乙只用四秒，甲要十秒——乙的功率更大。生活中说的"马力"，就是一种功率。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 12);
    const root = new THREE.Group();
    ctx.scene.add(root);

    let step = 0;
    let caseKey: CaseKey = 'push';
    let acting = false;
    let actT = 0;

    // 小人剪影
    const person = new THREE.Group();
    const bodyMat = std('#475569');
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.6, 6, 12), bodyMat);
    body.position.y = 1.15;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), std('#94a3b8'));
    head.position.y = 1.78;
    person.add(body, head);
    for (const sx of [-0.12, 0.12]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.7, 8), bodyMat);
      leg.position.set(sx, 0.35, 0);
      person.add(leg);
    }
    person.position.x = -0.85;
    root.add(person);

    // 三种道具
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), std('#d97706'));
    crate.position.set(0.6, 0.45, 0);
    root.add(crate);
    const dumbbell = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 10), std('#334155'));
    bar.rotation.z = Math.PI / 2;
    dumbbell.add(bar);
    for (const sx of [-0.35, 0.35]) {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 16), std('#1e293b', { metalness: 0.5 }));
      disc.rotation.z = Math.PI / 2;
      disc.position.x = sx;
      dumbbell.add(disc);
    }
    dumbbell.position.set(0.35, 0.55, 0);
    dumbbell.visible = false;
    root.add(dumbbell);
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.42, 14), std('#0ea5e9'));
    bucket.position.set(0.3, 0.75, 0);
    bucket.visible = false;
    root.add(bucket);

    // 力箭头 + 位移箭头
    const fArrow = makeArrow('#f59e0b');
    const sArrow = makeArrow('#16a34a');
    root.add(fArrow.group, sArrow.group);
    const fLab = makeLabel('F', { fontSize: 38, scale: 0.8, color: '#b45309' });
    const sLab = makeLabel('距离 s', { fontSize: 34, scale: 0.75, color: '#15803d' });
    root.add(fLab, sLab);

    // 做功进度条
    const barBg = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.26, 0.06), std('#e2e8f0'));
    barBg.position.set(0.6, 3.35, 0);
    root.add(barBg);
    const barFill = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.26, 0.07), std('#f59e0b'));
    barFill.position.set(0.6, 3.35, 0);
    barFill.scale.x = 0.001;
    root.add(barFill);
    const wLabel = makeLabel('W = 0 J', { fontSize: 38, scale: 0.9, color: '#0f766e' });
    wLabel.position.set(0.6, 3.85, 0);
    root.add(wLabel);
    let lastW = '';
    const setWLabel = (text: string, color = '#0f766e') => {
      if (text === lastW) return;
      lastW = text;
      wLabel.material.map?.dispose();
      wLabel.material.dispose();
      const nl = makeLabel(text, { fontSize: 38, scale: 0.9, color });
      wLabel.material = nl.material;
      wLabel.scale.copy(nl.scale);
    };

    // 功率赛跑（step3）：两台起重机
    const race = new THREE.Group();
    race.visible = false;
    root.add(race);
    const craneLoads: THREE.Mesh[] = [];
    const raceFills: THREE.Mesh[] = [];
    ['甲：10 秒', '乙：4 秒 → 功率大'].forEach((name, i) => {
      const cx = i === 0 ? -1.6 : 1.6;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.2, 0.16), std('#64748b'));
      post.position.set(cx - 0.5, 1.1, -2.2);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.14, 0.14), std('#64748b'));
      arm.position.set(cx, 2.2, -2.2);
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 6), std('#334155'));
      rope.position.set(cx + 0.45, 1.7, -2.2);
      const load = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), std('#dc2626'));
      load.position.set(cx + 0.45, 0.9, -2.2);
      race.add(post, arm, rope, load);
      craneLoads.push(load);
      const lab = makeLabel(name, { fontSize: 32, scale: 0.75, color: i === 0 ? '#475569' : '#b91c1c' });
      lab.position.set(cx, 2.75, -2.2);
      race.add(lab);
      const bg = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.2, 0.05), std('#e2e8f0'));
      bg.position.set(cx, 3.15, -2.2);
      const fill = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.2, 0.06), std(i === 0 ? '#94a3b8' : '#dc2626'));
      fill.position.set(cx, 3.15, -2.2);
      fill.scale.x = 0.001;
      race.add(bg, fill);
      raceFills.push(fill);
    });

    // 步骤提示
    const hints = [
      '做功 = 力 + 力的方向上通过的距离',
      'W = F·s，单位：焦耳（J）',
      '不做功：有力无距离 / 有距离无力 / 力与距离垂直',
      'P = W ÷ t：同样的功，时间越短功率越大',
    ].map((t) => {
      const lab = makeLabel(t, { fontSize: 34, scale: 0.85, color: '#7c3aed' });
      lab.position.set(0.6, 4.4, 0);
      lab.visible = false;
      root.add(lab);
      return lab;
    });

    const applyCase = () => {
      acting = false;
      actT = 0;
      crate.visible = caseKey === 'push';
      dumbbell.visible = caseKey === 'lift';
      bucket.visible = caseKey === 'carry';
      person.position.x = caseKey === 'push' ? -0.85 : -0.5;
      crate.position.x = 0.6;
      dumbbell.position.y = 0.55;
      bucket.position.set(0.3, 0.75, 0);
      barFill.scale.x = 0.001;
      barFill.position.x = 0.6 - 1.3;
      setWLabel(caseKey === 'carry' ? CASES.carry.formula : `准备：${CASES[caseKey].formula}`);
    };

    const applyStep = () => {
      hints.forEach((h, i) => {
        h.visible = i === step;
      });
      race.visible = step === 3;
    };
    applyCase();
    applyStep();

    const tmpFrom = new THREE.Vector3();
    const tmpTo = new THREE.Vector3();
    const ease = (t: number) => t * t * (3 - 2 * t);

    return {
      setStep(i) {
        step = i;
        applyStep();
      },
      setParam(id, value) {
        if (id === 'case') {
          caseKey = String(value) as CaseKey;
          applyCase();
        }
        if (id === 'act' && !acting && step !== 3) {
          applyCase();
          acting = true;
        }
      },
      update(dt, elapsed) {
        const cfg = CASES[caseKey];
        if (acting) {
          actT += dt;
          const p = Math.min(actT / cfg.T, 1);
          const e = ease(p);
          if (caseKey === 'push') {
            person.position.x = -0.85 + e * 2;
            crate.position.x = 0.6 + e * 2;
          } else if (caseKey === 'lift') {
            dumbbell.position.y = 0.55 + e * 1.5;
          } else {
            person.position.x = -0.5 + e * 2.5;
            bucket.position.x = 0.85 + e * 2.5;
          }
          const wNow = Math.round(cfg.W * e);
          barFill.scale.x = Math.max(e, 0.001);
          barFill.position.x = 0.6 - 1.3 + (e * 2.6) / 2;
          setWLabel(
            caseKey === 'carry' ? (p >= 1 ? 'W = 0：力的方向上没有距离' : 'W = 0 J') : `W = ${wNow} J`,
            caseKey === 'carry' ? '#b91c1c' : '#0f766e',
          );
          if (p >= 1) acting = false;
        }
        // 力箭头与位移箭头
        const showArrows = step !== 3;
        fArrow.group.visible = showArrows;
        sArrow.group.visible = showArrows;
        fLab.visible = showArrows;
        sLab.visible = showArrows;
        if (showArrows) {
          if (caseKey === 'push') {
            const fx = crate.position.x - 0.45;
            fArrow.set(tmpFrom.set(fx - 1.0, 0.5, 0.55), tmpTo.set(fx - 0.05, 0.5, 0.55));
            fLab.position.set(fx - 1.15, 0.85, 0.55);
            sArrow.set(tmpFrom.set(0.6, 0.06, 1.1), tmpTo.set(0.6 + 2 * ease(Math.min(actT / cfg.T, 1)), 0.06, 1.1));
            sLab.position.set(1.6, 0.35, 1.1);
          } else if (caseKey === 'lift') {
            const dy = dumbbell.position.y;
            fArrow.set(tmpFrom.set(0.35, dy + 0.3, 0), tmpTo.set(0.35, dy + 1.3, 0));
            fLab.position.set(0.35, dy + 1.55, 0);
            sArrow.set(tmpFrom.set(1.15, 0.55, 0), tmpTo.set(1.15, dy, 0));
            sLab.position.set(1.55, (0.55 + dy) / 2, 0);
          } else {
            const bx = bucket.position.x;
            fArrow.set(tmpFrom.set(bx, 1.05, 0), tmpTo.set(bx, 2.0, 0));
            fLab.position.set(bx, 2.25, 0);
            sArrow.set(tmpFrom.set(bx - 0.6, 0.06, 1.0), tmpTo.set(bx + 0.6, 0.06, 1.0));
            sLab.position.set(bx, 0.35, 1.0);
          }
        }
        // 功率赛跑循环（甲 10 秒、乙 4 秒，做完停 2 秒重来）
        if (step === 3) {
          const cycle = 12;
          const t = elapsed % cycle;
          const pA = Math.min(t / 10, 1);
          const pB = Math.min(t / 4, 1);
          [pA, pB].forEach((p, i) => {
            raceFills[i].scale.x = Math.max(p, 0.001);
            raceFills[i].position.x = (i === 0 ? -1.6 : 1.6) - 0.8 + (p * 1.6) / 2;
            craneLoads[i].position.y = 0.9 + p * 1.1;
          });
        }
      },
      dispose() {
        ctx.scene.remove(root);
        disposeObject(root);
      },
    };
  },
};
