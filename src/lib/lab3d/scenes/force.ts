// ---------------------------------------------------------------------------
// 物理 · 力与二力平衡：力的示意图、摩擦力方向、二力平衡四条件
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, disposeObject, makeArrow, makeLabel, std } from '../three-utils';

type CaseMode = 'rest' | 'stuck' | 'uniform';

const TABLE_TOP = 1.2; // 桌面上表面高度
const KINETIC_F = 8; // 滑动摩擦力固定 8N

export const forceScene: Scene3DDefinition = {
  id: 'phys-force',
  title: '力与二力平衡',
  subject: '物理',
  grade: '8下',
  icon: '💪',
  tagline: '力的示意图怎么画？二力平衡要满足哪四个条件？',
  keywords: ['力', '重力', '支持力', '摩擦力', '二力平衡', '力的示意图', '弹力', '力的作用效果'],
  camera: { position: [5, 4, 8], target: [0, 1.6, 0] },
  controls: [
    {
      kind: 'select',
      id: 'case',
      label: '情境',
      options: [
        { value: 'rest', label: '静止的书' },
        { value: 'stuck', label: '推不动的箱子' },
        { value: 'uniform', label: '匀速拉动的箱子' },
      ],
      defaultValue: 'rest',
    },
    { kind: 'slider', id: 'push', label: '推力 F', min: 0, max: 20, step: 1, defaultValue: 8, unit: 'N' },
  ],
  steps: [
    {
      title: '力的作用效果',
      text: '力是物体对物体的作用。拍桌子时手会疼，因为桌子也在"还手"。力的作用效果有两类：改变物体的形状，比如把海绵压扁；改变物体的运动状态，比如让静止的箱子动起来。看，物体正在被轻轻挤压。',
    },
    {
      title: '力的示意图',
      text: '画力的示意图要抓住三要素：作用点、方向和大小。箭头的起点是作用点，指向表示方向，长度表示大小。红色是重力，绿色是支持力，橙色是推力，蓝色是摩擦力。',
    },
    {
      title: '摩擦力',
      text: '摩擦力总是阻碍相对运动。箱子有向右运动的趋势，静摩擦力就向左，而且它随推力一起变大，所以推不动。箱子滑动起来以后，滑动摩擦力大小基本不变，方向仍然和运动方向相反。',
    },
    {
      title: '二力平衡',
      text: '二力平衡要同时满足四个条件：作用在同一物体上、大小相等、方向相反、并且在同一条直线上。看演示：支持力一偏，两个力不再共线，物体就会转起来，平衡被打破了。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 12);
    const root = new THREE.Group();
    ctx.scene.add(root);

    let step = 0;
    let caseMode: CaseMode = 'rest';
    let push = 8;

    // 桌子
    const table = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.24, 3), std('#a16207'));
    top.position.y = TABLE_TOP - 0.12;
    table.add(top);
    for (const sx of [-2.4, 2.4]) {
      for (const sz of [-1.3, 1.3]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, TABLE_TOP - 0.24, 10), std('#78350f'));
        leg.position.set(sx, (TABLE_TOP - 0.24) / 2, sz);
        table.add(leg);
      }
    }
    root.add(table);
    const tableLabel = makeLabel('桌面', { fontSize: 36, scale: 0.8 });
    tableLabel.position.set(-2.4, TABLE_TOP + 0.35, -1.2);
    root.add(tableLabel);

    // 物体组：书（rest）与箱子（stuck/uniform）
    const obj = new THREE.Group();
    root.add(obj);
    const book = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.4, 1.2), std('#b45309'));
    book.position.y = 0.2;
    obj.add(book);
    const bookBand = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.12, 1.24), std('#fbbf24'));
    bookBand.position.y = 0.2;
    obj.add(bookBand);
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.25, 1.25), std('#d97706'));
    crate.position.y = 0.625;
    obj.add(crate);
    obj.position.y = TABLE_TOP;

    // 力箭头（makeArrow：set(from,to) 自动定向缩放）
    const gArrow = makeArrow('#dc2626');
    const nArrow = makeArrow('#16a34a');
    const fArrow = makeArrow('#f59e0b');
    const frArrow = makeArrow('#2563eb');
    root.add(gArrow.group, nArrow.group, fArrow.group, frArrow.group);

    const gLab = makeLabel('G 重力', { fontSize: 36, scale: 0.8, color: '#b91c1c' });
    const nLab = makeLabel('N 支持力', { fontSize: 36, scale: 0.8, color: '#15803d' });
    const fLab = makeLabel('F 推力', { fontSize: 36, scale: 0.8, color: '#b45309' });
    const frLab = makeLabel('f 摩擦力', { fontSize: 36, scale: 0.8, color: '#1d4ed8' });
    root.add(gLab, nLab, fLab, frLab);

    // 状态牌
    const status = makeLabel('', { fontSize: 40, scale: 1 });
    status.position.set(0, 4.1, 0);
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

    // 二力平衡四条件标签（step3）
    const condGroup = new THREE.Group();
    const condWords = ['① 同体', '② 等大', '③ 反向', '④ 共线'];
    condWords.forEach((w, i) => {
      const lab = makeLabel(w, { fontSize: 38, scale: 0.9, color: '#7c3aed' });
      lab.position.set(-2.7 + i * 1.8, 3.3, 0);
      condGroup.add(lab);
    });
    const tiltLab = makeLabel('二力不共线 → 物体转动！', { fontSize: 36, scale: 0.9, color: '#be123c' });
    tiltLab.position.set(0, 2.75, 0);
    condGroup.add(tiltLab);
    condGroup.visible = false;
    root.add(condGroup);

    const dims = () =>
      caseMode === 'rest' ? { hw: 0.85, hh: 0.4, hd: 1.2 } : { hw: 0.625, hh: 1.25, hd: 1.25 };

    const statusText = (): string => {
      if (step === 3) return '二力平衡：同体、等大、反向、共线';
      if (caseMode === 'rest') return '静止的书：G 与 N 是一对平衡力';
      if (caseMode === 'stuck') return `推不动：静摩擦力 f = F = ${push}N`;
      if (Math.abs(push - KINETIC_F) < 0.5) return `F = f = ${KINETIC_F}N：匀速直线运动`;
      return push > KINETIC_F ? `F=${push}N > f=${KINETIC_F}N：将会加速` : `F=${push}N < f=${KINETIC_F}N：将会减速`;
    };
    setStatus(statusText());

    const applyCase = () => {
      book.visible = caseMode === 'rest';
      bookBand.visible = caseMode === 'rest';
      crate.visible = caseMode !== 'rest';
      obj.position.x = 0;
      obj.rotation.z = 0;
      setStatus(statusText());
    };
    applyCase();

    const tmpFrom = new THREE.Vector3();
    const tmpTo = new THREE.Vector3();

    return {
      setStep(i) {
        step = i;
        condGroup.visible = step === 3;
        setStatus(statusText());
      },
      setParam(id, value) {
        if (id === 'case') {
          caseMode = String(value) as CaseMode;
          applyCase();
        }
        if (id === 'push') {
          push = Number(value);
          setStatus(statusText());
        }
      },
      update(dt, elapsed) {
        // 匀速情境：箱子一直向右匀速移动，到边回绕
        if (caseMode === 'uniform' && step !== 3) {
          obj.position.x += 1.1 * dt;
          if (obj.position.x > 2.3) obj.position.x = -2.3;
        }
        // step0：挤压动画（力改变形状）
        if (step === 0) {
          const sq = 1 - 0.07 * (0.5 + 0.5 * Math.sin(elapsed * 4));
          obj.scale.set(1 + (1 - sq) * 0.7, sq, 1 + (1 - sq) * 0.7);
        } else {
          obj.scale.x = THREE.MathUtils.damp(obj.scale.x, 1, 8, dt);
          obj.scale.y = THREE.MathUtils.damp(obj.scale.y, 1, 8, dt);
          obj.scale.z = THREE.MathUtils.damp(obj.scale.z, 1, 8, dt);
        }
        // step3：二力不共线 → 摇摆转动演示
        let nOffset = 0;
        if (step === 3) {
          const wob = Math.sin(elapsed * 1.8);
          obj.rotation.z = 0.16 * wob;
          nOffset = 0.55 * wob;
        } else {
          obj.rotation.z = THREE.MathUtils.damp(obj.rotation.z, 0, 8, dt);
        }

        const { hw, hh } = dims();
        const cx = obj.position.x;
        const cy = TABLE_TOP + hh / 2;
        const showGN = step >= 1;
        const showFF = step >= 1 && step !== 3 && caseMode !== 'rest';
        gArrow.group.visible = showGN;
        nArrow.group.visible = showGN;
        fArrow.group.visible = showFF;
        frArrow.group.visible = showFF;
        gLab.visible = showGN;
        nLab.visible = showGN;
        fLab.visible = showFF;
        frLab.visible = showFF;

        // 重力 G（向下红）
        const gLen = 1.25;
        gArrow.set(tmpFrom.set(cx - 0.14, cy, 0), tmpTo.set(cx - 0.14, cy - gLen, 0));
        gLab.position.set(cx - 0.75, cy - gLen - 0.2, 0);
        // 支持力 N（向上绿，step3 偏移演示不共线）
        nArrow.set(tmpFrom.set(cx + 0.14 + nOffset, cy, 0), tmpTo.set(cx + 0.14 + nOffset, cy + gLen, 0));
        nLab.position.set(cx + 0.85 + nOffset, cy + gLen + 0.2, 0);
        if (showFF) {
          // 推力 F（向右橙），长度随滑块
          const fLen = 0.25 + push * 0.075;
          fArrow.set(tmpFrom.set(cx - hw - fLen - 0.05, cy, 0), tmpTo.set(cx - hw - 0.05, cy, 0));
          fLab.position.set(cx - hw - fLen - 0.45, cy + 0.45, 0);
          // 摩擦力 f（向左蓝）：静摩擦随 F 同步；动摩擦恒定
          const frLen = caseMode === 'stuck' ? 0.25 + push * 0.075 : 0.25 + KINETIC_F * 0.075;
          const fy = TABLE_TOP + 0.08;
          const pulse = step === 2 ? 1 + 0.1 * Math.sin(elapsed * 6) : 1;
          frArrow.group.scale.setScalar(pulse);
          frArrow.set(tmpFrom.set(cx + frLen / 2, fy, 0.8), tmpTo.set(cx - frLen / 2, fy, 0.8));
          frLab.position.set(cx + frLen / 2 + 0.7, fy + 0.35, 0.8);
        }
      },
      dispose() {
        ctx.scene.remove(root);
        disposeObject(root);
      },
    };
  },
};
