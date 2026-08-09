// ---------------------------------------------------------------------------
// 物理 · 液体压强与大气压：侧孔喷水 / 连通器 / 托里拆利实验
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, cylinderBetween, disposeObject, makeLabel, std } from '../three-utils';

type ViewMode = 'holes' | 'u-tube' | 'torricelli';

const TANK_BOTTOM = 0.15;
const TANK_H = 2.4;
const HOLE_Y = [0.45, 1.15, 1.85]; // 三个侧孔高度
const DROP_N = 20;

export const liquidPressureScene: Scene3DDefinition = {
  id: 'phys-liquid-pressure',
  title: '液体压强',
  subject: '物理',
  grade: '8下',
  icon: '💧',
  tagline: '深度越深压强越大：看三个孔的水柱谁喷得远',
  keywords: ['液体压强', '深度', '压强计', '连通器', '大气压', '托里拆利', '马德堡半球'],
  camera: { position: [4, 3.4, 7.5], target: [0, 1.4, 0] },
  controls: [
    { kind: 'slider', id: 'level', label: '注水深度', min: 0.3, max: 1, step: 0.05, defaultValue: 0.8 },
    {
      kind: 'select',
      id: 'view',
      label: '演示',
      options: [
        { value: 'holes', label: '侧孔喷水' },
        { value: 'u-tube', label: '连通器' },
        { value: 'torricelli', label: '托里拆利实验' },
      ],
      defaultValue: 'holes',
    },
  ],
  steps: [
    {
      title: '液体内部有压强',
      text: '液体受重力，又有流动性，所以液体内部向各个方向都有压强。看水箱侧壁的小孔：水不仅向下压，还从侧面向外喷出来。孔被水淹得越深，喷得越有力。',
    },
    {
      title: '深度与压强',
      text: '同种液体，深度越大压强越大：p 等于 ρ g h。看三个小孔：最下面的孔最深，水柱喷得最远；上面的孔浅，喷得近。拖动滑块改变水深，喷射距离跟着变化。',
    },
    {
      title: '连通器',
      text: '上端开口、底部连通的容器叫连通器。切换到连通器看看：不管怎么加水，同种液体静止时，两边液面总是相平。茶壶、锅炉水位计、船闸，都是连通器的应用。',
    },
    {
      title: '大气压',
      text: '空气也有压强！马德堡半球实验证明了大气压的存在；托里拆利实验测出：大气压能托起七十六厘米高的水银柱。切换到托里拆利实验，看看玻璃管里的水银柱和顶部的真空。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 12);
    const root = new THREE.Group();
    ctx.scene.add(root);

    let step = 0;
    let view: ViewMode = 'holes';
    let level = 0.8;
    let sloshT = 99; // 连通器晃动计时

    // ---------------- 视图一：侧孔喷水 ----------------
    const holesGroup = new THREE.Group();
    root.add(holesGroup);
    const glassMat = std('#dbeafe', { transparent: true, opacity: 0.16, depthWrite: false });
    const tank = new THREE.Mesh(new THREE.BoxGeometry(3, TANK_H, 1.6), glassMat);
    tank.position.set(0, TANK_BOTTOM + TANK_H / 2, 0);
    holesGroup.add(tank);
    const waterMat = std('#38bdf8', { transparent: true, opacity: 0.5, depthWrite: false });
    const water = new THREE.Mesh(new THREE.BoxGeometry(2.9, 1, 1.5), waterMat);
    holesGroup.add(water);
    const holeLabelTexts = ['浅：喷得近', '中', '深：喷得远'];
    HOLE_Y.forEach((hy, i) => {
      const plug = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 10), std('#1e293b'));
      plug.rotation.z = Math.PI / 2;
      plug.position.set(1.52, hy, 0);
      holesGroup.add(plug);
      const lab = makeLabel(holeLabelTexts[i], { fontSize: 30, scale: 0.68, color: '#0369a1' });
      lab.position.set(1.35, hy + 0.28, 0.6);
      holesGroup.add(lab);
    });
    const dropGeo = new THREE.SphereGeometry(0.05, 8, 6);
    const dropMat = std('#0ea5e9', { emissive: '#0284c7', emissiveIntensity: 0.5 });
    const drops: THREE.Mesh[][] = HOLE_Y.map(() => {
      const arr: THREE.Mesh[] = [];
      for (let i = 0; i < DROP_N; i++) {
        const d = new THREE.Mesh(dropGeo, dropMat);
        holesGroup.add(d);
        arr.push(d);
      }
      return arr;
    });

    // ---------------- 视图二：连通器 ----------------
    const utubeGroup = new THREE.Group();
    utubeGroup.visible = false;
    root.add(utubeGroup);
    const U_Y0 = 0.55;
    const U_ARM = 0.9;
    const U_H = 2.2;
    for (const sx of [-U_ARM, U_ARM]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, U_H, 16, 1, true), glassMat);
      arm.position.set(sx, U_Y0 + U_H / 2, 0);
      utubeGroup.add(arm);
    }
    const uBend = new THREE.Mesh(new THREE.TorusGeometry(U_ARM, 0.17, 12, 24, Math.PI), glassMat);
    uBend.rotation.z = Math.PI;
    uBend.position.y = U_Y0;
    utubeGroup.add(uBend);
    const uWaterBend = new THREE.Mesh(new THREE.TorusGeometry(U_ARM, 0.13, 10, 24, Math.PI), waterMat);
    uWaterBend.rotation.z = Math.PI;
    uWaterBend.position.y = U_Y0;
    utubeGroup.add(uWaterBend);
    const colGeo = new THREE.CylinderGeometry(0.13, 0.13, 1, 12);
    const colL = new THREE.Mesh(colGeo, waterMat);
    const colR = new THREE.Mesh(colGeo, waterMat);
    utubeGroup.add(colL, colR);
    const utubeLabel = makeLabel('连通器：两液面总是相平', { fontSize: 36, scale: 0.9, color: '#0369a1' });
    utubeLabel.position.set(0, 3.15, 0);
    utubeGroup.add(utubeLabel);
    const utubeLabel2 = makeLabel('茶壶、锅炉水位计、船闸', { fontSize: 32, scale: 0.8 });
    utubeLabel2.position.set(0, 0.15, 0);
    utubeGroup.add(utubeLabel2);

    // ---------------- 视图三：托里拆利 ----------------
    const torrGroup = new THREE.Group();
    torrGroup.visible = false;
    root.add(torrGroup);
    const hgMat = std('#9ca3af', { metalness: 0.75, roughness: 0.25 });
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.15, 0.3, 24), std('#64748b'));
    basin.position.y = 0.15;
    torrGroup.add(basin);
    const basinHg = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.06, 24), hgMat);
    basinHg.position.y = 0.3;
    torrGroup.add(basinHg);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 2.8, 16, 1, true), glassMat);
    tube.position.y = 0.2 + 1.4;
    torrGroup.add(tube);
    const HG_H = 1.67; // 76 厘米水银柱（场景比例）
    const hgCol = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, HG_H, 14), hgMat);
    hgCol.position.y = 0.3 + HG_H / 2;
    torrGroup.add(hgCol);
    const ruler = cylinderBetween(
      new THREE.Vector3(0.5, 0.3, 0),
      new THREE.Vector3(0.5, 0.3 + HG_H, 0),
      0.02,
      std('#dc2626'),
    );
    torrGroup.add(ruler);
    const hgLabel = makeLabel('76 厘米水银柱', { fontSize: 34, scale: 0.85, color: '#b91c1c' });
    hgLabel.position.set(1.35, 0.3 + HG_H / 2, 0);
    torrGroup.add(hgLabel);
    const vacuumLabel = makeLabel('真空', { fontSize: 34, scale: 0.85 });
    vacuumLabel.position.set(0, 0.3 + HG_H + 0.4, 0);
    torrGroup.add(vacuumLabel);
    const atmLabel = makeLabel('大气压托住了水银柱', { fontSize: 36, scale: 0.9, color: '#0369a1' });
    atmLabel.position.set(0, 3.4, 0);
    torrGroup.add(atmLabel);

    // 顶部信息牌 + 步骤提示
    const info = makeLabel('', { fontSize: 40, scale: 1, color: '#0f766e' });
    info.position.set(0, 4.0, 0);
    root.add(info);
    let lastInfo = '';
    const setInfo = (text: string) => {
      if (text === lastInfo) return;
      lastInfo = text;
      info.material.map?.dispose();
      info.material.dispose();
      const nl = makeLabel(text, { fontSize: 40, scale: 1, color: '#0f766e' });
      info.material = nl.material;
      info.scale.copy(nl.scale);
    };
    const hints = [
      '液体内部向各个方向都有压强',
      'p = ρ·g·h：深度越大压强越大',
      '连通器：同种液体静止时液面相平',
      '大气压：马德堡半球 + 托里拆利实验',
    ].map((t) => {
      const lab = makeLabel(t, { fontSize: 34, scale: 0.85, color: '#7c3aed' });
      lab.position.set(0, 4.55, 0);
      lab.visible = false;
      root.add(lab);
      return lab;
    });

    const refreshInfo = () => {
      if (view === 'holes') setInfo(`水深 h = ${level.toFixed(2)}m，p = ρ·g·h`);
      else if (view === 'u-tube') setInfo('同种液体静止时，各液面相平');
      else setInfo('大气压 = 76 厘米水银柱产生的压强');
    };

    const applyView = () => {
      holesGroup.visible = view === 'holes';
      utubeGroup.visible = view === 'u-tube';
      torrGroup.visible = view === 'torricelli';
      refreshInfo();
    };
    applyView();

    const applyStep = () => {
      hints.forEach((h, i) => {
        h.visible = i === step;
      });
    };
    applyStep();

    return {
      setStep(i) {
        step = i;
        applyStep();
      },
      setParam(id, value) {
        if (id === 'level') {
          level = Number(value);
          sloshT = 0; // 连通器重新晃动
          refreshInfo();
        }
        if (id === 'view') {
          view = String(value) as ViewMode;
          applyView();
        }
      },
      update(dt, elapsed) {
        if (view === 'holes') {
          const waterH = level * 2.2;
          const waterTop = TANK_BOTTOM + waterH;
          water.scale.y = waterH;
          water.position.y = TANK_BOTTOM + waterH / 2;
          HOLE_Y.forEach((hy, hi) => {
            const depth = waterTop - hy;
            const active = depth > 0.03;
            const v0 = 0.55 * Math.sqrt(2 * 9.8 * Math.max(depth, 0));
            const gEff = 3.2;
            const life = Math.sqrt((2 * hy) / gEff) + 0.12;
            for (let i = 0; i < DROP_N; i++) {
              const d = drops[hi][i];
              if (!active) {
                d.visible = false;
                continue;
              }
              const age = (elapsed + (i * life) / DROP_N) % life;
              const px = 1.58 + v0 * age;
              const py = hy - 0.5 * gEff * age * age;
              d.visible = py > 0.02;
              d.position.set(px, Math.max(py, 0.02), 0);
            }
          });
        } else if (view === 'u-tube') {
          sloshT += dt;
          const target = 0.3 + level * 1.6;
          const off = 0.22 * Math.sin(9 * sloshT) * Math.exp(-2.0 * sloshT);
          const hL = target + off;
          const hR = target - off;
          colL.scale.y = hL;
          colL.position.set(-U_ARM, U_Y0 + hL / 2, 0);
          colR.scale.y = hR;
          colR.position.set(U_ARM, U_Y0 + hR / 2, 0);
        } else {
          // 托里拆利：水银柱微微闪烁，提示大气压的"托举"
          hgCol.scale.y = 1 + 0.01 * Math.sin(elapsed * 2);
        }
      },
      dispose() {
        ctx.scene.remove(root);
        disposeObject(root);
      },
    };
  },
};
