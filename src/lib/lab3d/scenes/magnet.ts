// ---------------------------------------------------------------------------
// 物理 · 磁现象与电流的磁效应：条形磁铁磁感线 / 奥斯特实验 / 电磁铁
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, cylinderBetween, damp, disposeObject, makeLabel, std } from '../three-utils';

type Demo = 'bar' | 'oersted' | 'electromagnet';

const fract = (v: number) => v - Math.floor(v);

export const magnetScene: Scene3DDefinition = {
  id: 'phys-magnet',
  title: '磁现象与电流磁效应',
  subject: '物理',
  grade: '9全',
  icon: '🧲',
  tagline: '磁感线从 N 极出发回到 S 极；通电导线也能产生磁场',
  keywords: ['磁体', '磁极', '磁场', '磁感线', '电流的磁效应', '电磁铁', '奥斯特', '安培定则'],
  camera: { position: [5, 4.2, 8.5], target: [0, 1.7, 0] },
  controls: [
    {
      kind: 'select',
      id: 'demo',
      label: '演示',
      options: [
        { value: 'bar', label: '条形磁铁磁场' },
        { value: 'oersted', label: '奥斯特实验' },
        { value: 'electromagnet', label: '电磁铁' },
      ],
      defaultValue: 'bar',
    },
    { kind: 'slider', id: 'current', label: '电流大小', min: 0, max: 2, step: 0.25, defaultValue: 1, unit: 'A' },
  ],
  steps: [
    {
      title: '磁极',
      text: '条形磁铁两端磁性最强，叫做磁极：红色是 N 极，蓝色是 S 极。同名磁极相互排斥，异名磁极相互吸引。每个磁体都有两个磁极，就算摔成两段，每一段仍然有 N 极和 S 极。',
    },
    {
      title: '磁场与磁感线',
      text: '磁场看不见、摸不着，我们用磁感线来描述它。在磁体外部，磁感线从 N 极出发，回到 S 极。小磁针静止时 N 极所指的方向，就是该点磁场的方向——看，小磁针都沿着磁感线的切线方向排列。',
    },
    {
      title: '奥斯特实验',
      text: '一八二〇年，奥斯特发现：导线通电的一瞬间，下方的小磁针偏转了！这说明通电导线周围存在磁场，这就是电流的磁效应，也叫电生磁。断电后，小磁针又转回原来的方向。',
    },
    {
      title: '电磁铁',
      text: '把导线绕在铁钉上，通电后就成了电磁铁。拖动电流滑块：电流越大，吸起的回形针越多，磁性越强；线圈匝数越多，磁性也越强。电磁起重机、电铃、磁悬浮列车，用的都是电磁铁。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 14);
    const root = new THREE.Group();
    ctx.scene.add(root);
    let step = 0;
    let demo: Demo = 'bar';
    let current = 1;
    let oerstedT = 99; // 奥斯特模式计时（>1.2s 自动通电）
    let oflow = 0;

    interface LabelOpts {
      fontSize?: number;
      color?: string;
      bg?: string;
      scale?: number;
    }
    const mkLabel = (parent: THREE.Object3D, text: string, opts: LabelOpts, pos: [number, number, number]) => {
      const s = makeLabel(text, opts);
      s.position.set(pos[0], pos[1], pos[2]);
      parent.add(s);
      return s;
    };
    const dynLabel = (parent: THREE.Object3D, text: string, opts: LabelOpts, pos: [number, number, number]) => {
      const sprite = mkLabel(parent, text, opts, pos);
      let last = text;
      return (t: string) => {
        if (t === last) return;
        last = t;
        sprite.material.map?.dispose();
        sprite.material.dispose();
        const nl = makeLabel(t, opts);
        sprite.material = nl.material;
        sprite.scale.copy(nl.scale);
      };
    };

    // ================= 演示一：条形磁铁磁场 =====================================
    const barGroup = new THREE.Group();
    root.add(barGroup);
    const nHalf = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.5), std('#dc2626'));
    nHalf.position.set(-0.6, 1.6, 0);
    const sHalf = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.5), std('#2563eb'));
    sHalf.position.set(0.6, 1.6, 0);
    barGroup.add(nHalf, sHalf);
    mkLabel(barGroup, 'N', { fontSize: 44, scale: 1.0, color: '#b91c1c' }, [-1.05, 2.15, 0]);
    mkLabel(barGroup, 'S', { fontSize: 44, scale: 1.0, color: '#1d4ed8' }, [1.05, 2.15, 0]);

    // 磁感线：从 N（左）到 S（右）的平滑曲线族
    const fieldMat = new THREE.LineBasicMaterial({ color: '#8b9dc3' });
    interface FieldCfg {
      plane: 'xy' | 'xz';
      sign: 1 | -1;
      i: number;
    }
    const cfgs: FieldCfg[] = [
      { plane: 'xy', sign: 1, i: 1 },
      { plane: 'xy', sign: -1, i: 1 },
      { plane: 'xy', sign: 1, i: 2 },
      { plane: 'xy', sign: -1, i: 2 },
      { plane: 'xy', sign: 1, i: 3 },
      { plane: 'xy', sign: -1, i: 3 },
      { plane: 'xz', sign: 1, i: 1 },
      { plane: 'xz', sign: -1, i: 1 },
      { plane: 'xz', sign: 1, i: 2 },
      { plane: 'xz', sign: -1, i: 2 },
    ];
    const fieldPoint = (c: FieldCfg, t: number) => {
      const ax = 1.45 + 0.3 * (c.i - 1);
      const b = 0.55 + 0.42 * (c.i - 1);
      const x = -ax * Math.cos(Math.PI * t);
      const bulge = c.sign * b * Math.sin(Math.PI * t);
      return c.plane === 'xy' ? new THREE.Vector3(x, 1.6 + bulge, 0) : new THREE.Vector3(x, 1.6, bulge);
    };
    for (const c of cfgs) {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 48; k++) pts.push(fieldPoint(c, k / 48));
      barGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), fieldMat));
      // 上方三条线加方向箭头（N → S）
      if (c.plane === 'xy' && c.sign === 1) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 10), std('#64748b'));
        cone.position.copy(fieldPoint(c, 0.5));
        cone.rotation.z = -Math.PI / 2;
        barGroup.add(cone);
      }
    }
    // 小磁针：沿中间那条磁感线的切线方向排列
    const needleCfg: FieldCfg = { plane: 'xy', sign: 1, i: 2 };
    for (const t of [0.18, 0.34, 0.5, 0.66, 0.82]) {
      const g = new THREE.Group();
      const north = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.05, 0.05), std('#dc2626'));
      north.position.x = 0.065;
      const south = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.05, 0.05), std('#334155'));
      south.position.x = -0.065;
      g.add(north, south);
      g.position.copy(fieldPoint(needleCfg, t));
      const ax = 1.45 + 0.3 * (needleCfg.i - 1);
      const b = 0.55 + 0.42 * (needleCfg.i - 1);
      const tangent = new THREE.Vector3(ax * Math.sin(Math.PI * t), b * Math.cos(Math.PI * t), 0).normalize();
      g.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), tangent);
      barGroup.add(g);
    }
    const poleHint = mkLabel(barGroup, '同名相斥，异名相吸', { fontSize: 36, scale: 0.9, color: '#b91c1c' }, [0, 3.7, 0]);
    const fieldHint = mkLabel(barGroup, '磁感线：N 出 S 入，小磁针沿切线排列', { fontSize: 34, scale: 0.85, color: '#1d4ed8' }, [0, 3.7, 0]);

    // ================= 演示二：奥斯特实验 ======================================
    const oeGroup = new THREE.Group();
    root.add(oeGroup);
    const cuMat = std('#b0653a', { metalness: 0.6, roughness: 0.35 });
    const oeWire = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.4, 12), cuMat);
    oeWire.rotation.z = Math.PI / 2;
    oeWire.position.set(0, 2.3, 0);
    oeGroup.add(oeWire);
    const oeWireMat = std('#d97706', { metalness: 0.55, roughness: 0.35 });
    const ow = (a: THREE.Vector3, b: THREE.Vector3) => oeGroup.add(cylinderBetween(a, b, 0.04, oeWireMat));
    ow(new THREE.Vector3(-2.2, 2.3, 0), new THREE.Vector3(-2.2, 0.8, 0));
    ow(new THREE.Vector3(-2.2, 0.8, 0), new THREE.Vector3(-0.5, 0.75, -1.2));
    ow(new THREE.Vector3(0.5, 0.75, -1.2), new THREE.Vector3(2.2, 0.8, 0));
    ow(new THREE.Vector3(2.2, 0.8, 0), new THREE.Vector3(2.2, 2.3, 0));
    const oeBat = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 0.7), std('#dc2626'));
    oeBat.position.set(0, 0.45, -1.2);
    oeGroup.add(oeBat);
    mkLabel(oeGroup, '电源', { fontSize: 34, scale: 0.8 }, [0, 0.45, -2.0]);
    mkLabel(oeGroup, '通电直导线（沿南北方向）', { fontSize: 32, scale: 0.78 }, [0, 2.75, 0]);
    // 小磁针（支架 + 双锥指针）
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.35, 8), std('#64748b'));
    post.position.set(0, 1.05, 0);
    oeGroup.add(post);
    const compass = new THREE.Group();
    compass.position.set(0, 1.3, 0);
    const coneN = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.36, 10), std('#dc2626'));
    coneN.rotation.z = -Math.PI / 2;
    coneN.position.x = 0.18;
    const coneS = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.36, 10), std('#334155'));
    coneS.rotation.z = Math.PI / 2;
    coneS.position.x = -0.18;
    compass.add(coneN, coneS);
    oeGroup.add(compass);
    mkLabel(oeGroup, '小磁针', { fontSize: 32, scale: 0.75 }, [0, 0.55, 0.3]);
    // 电流电子 + 环形磁场
    const oeEMat = std('#38bdf8', { emissive: '#0284c7', emissiveIntensity: 0.8 });
    const oeEGeo = new THREE.SphereGeometry(0.08, 8, 6);
    const oeEs: THREE.Mesh[] = [];
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(oeEGeo, oeEMat);
      oeGroup.add(m);
      oeEs.push(m);
    }
    const ringMat = std('#22c55e', { transparent: true, opacity: 0.55, emissive: '#16a34a', emissiveIntensity: 0.4 });
    const rings: THREE.Mesh[] = [];
    for (const x of [-1.1, 0, 1.1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.02, 8, 32), ringMat);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(x, 2.3, 0);
      oeGroup.add(ring);
      rings.push(ring);
    }
    const oeState = dynLabel(oeGroup, '未通电：小磁针与导线平行', { fontSize: 36, scale: 0.9, color: '#15803d' }, [0, 3.7, 0]);

    // ================= 演示三：电磁铁 ==========================================
    const emGroup = new THREE.Group();
    root.add(emGroup);
    const nail = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.2, 14), std('#9aa5b1', { metalness: 0.6 }));
    nail.rotation.z = Math.PI / 2;
    nail.position.set(0.3, 2.0, 0);
    emGroup.add(nail);
    for (let i = 0; i < 8; i++) {
      const turn = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.045, 8, 20), cuMat);
      turn.rotation.y = Math.PI / 2;
      turn.position.set(-0.55 + i * 0.18, 2.0, 0);
      emGroup.add(turn);
    }
    const emBat = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 0.7), std('#dc2626'));
    emBat.position.set(-1.9, 0.6, 0.9);
    emGroup.add(emBat);
    mkLabel(emGroup, '电源', { fontSize: 32, scale: 0.75 }, [-1.9, 0.6, 1.7]);
    emGroup.add(cylinderBetween(new THREE.Vector3(-0.55, 2.0, 0), new THREE.Vector3(-2.05, 0.95, 0.9), 0.035, oeWireMat));
    emGroup.add(cylinderBetween(new THREE.Vector3(0.71, 2.0, 0), new THREE.Vector3(-1.72, 0.95, 0.9), 0.035, oeWireMat));
    const table = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 1.1), std('#a16207'));
    table.position.set(1.35, 0.78, 0);
    emGroup.add(table);
    // 回形针（小方块）
    const clipGeo = new THREE.BoxGeometry(0.18, 0.04, 0.09);
    const clipMat = std('#d1d5db', { metalness: 0.7, roughness: 0.3 });
    const clips: { mesh: THREE.Mesh; pile: THREE.Vector3; stuck: THREE.Vector3 }[] = [];
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(clipGeo, clipMat);
      const pile = new THREE.Vector3(1.05 + (i % 4) * 0.18, 0.86, -0.14 + Math.floor(i / 4) * 0.26);
      const stuck = new THREE.Vector3(1.42 + ((i % 3) - 1) * 0.07, 1.88 - Math.floor(i / 3) * 0.12, ((i % 2) - 0.5) * 0.12);
      m.position.copy(pile);
      emGroup.add(m);
      clips.push({ mesh: m, pile, stuck });
    }
    mkLabel(emGroup, '电磁铁（铁钉 + 线圈）', { fontSize: 34, scale: 0.85 }, [0.3, 2.65, 0]);
    mkLabel(emGroup, '回形针', { fontSize: 30, scale: 0.7 }, [1.35, 1.25, 0.6]);
    const emInfo = dynLabel(emGroup, '', { fontSize: 36, scale: 0.9, color: '#b45309' }, [0.3, 3.35, 0]);

    const setDemo = (d: Demo) => {
      demo = d;
      barGroup.visible = d === 'bar';
      oeGroup.visible = d === 'oersted';
      emGroup.visible = d === 'electromagnet';
      if (d === 'oersted') oerstedT = 0;
    };
    setDemo('bar');

    const applyStep = () => {
      // 步骤联动演示：0/1 → 条形磁铁；2 → 奥斯特；3 → 电磁铁
      if (step <= 1) setDemo('bar');
      else if (step === 2) setDemo('oersted');
      else setDemo('electromagnet');
      poleHint.visible = demo === 'bar' && step === 0;
      fieldHint.visible = demo === 'bar' && step === 1;
    };
    applyStep();

    return {
      setStep(i) {
        step = i;
        applyStep();
      },
      setParam(id, value) {
        if (id === 'demo') {
          setDemo(String(value) as Demo);
          poleHint.visible = demo === 'bar' && step === 0;
          fieldHint.visible = demo === 'bar' && step === 1;
        }
        if (id === 'current') current = Number(value);
      },
      update(dt, elapsed) {
        if (demo === 'oersted') {
          oerstedT += dt;
          const powered = oerstedT > 1.2;
          oeState(powered ? '通电！小磁针发生偏转——电流周围有磁场' : '未通电：小磁针与导线平行');
          compass.rotation.y = damp(compass.rotation.y, powered ? -Math.PI / 2 + 0.12 * Math.sin(elapsed * 6) : 0, 3, dt);
          for (const r of rings) r.visible = powered;
          if (powered) oflow += dt * 0.35;
          for (let i = 0; i < oeEs.length; i++) {
            oeEs[i].visible = powered;
            oeEs[i].position.set(-2.2 + fract(i / oeEs.length + oflow) * 4.4, 2.3, 0);
          }
        }
        if (demo === 'electromagnet') {
          const n = Math.round((current / 2) * 8);
          emInfo(`电流 ${current.toFixed(2).replace(/\.?0+$/, '')}A → 吸起 ${n} 枚回形针`);
          clips.forEach((c, i) => {
            const target = i < n ? c.stuck : c.pile;
            c.mesh.position.x = damp(c.mesh.position.x, target.x, 5, dt);
            c.mesh.position.y = damp(c.mesh.position.y, target.y, 5, dt);
            c.mesh.position.z = damp(c.mesh.position.z, target.z, 5, dt);
            c.mesh.rotation.z = i < n ? 0.15 * Math.sin(elapsed * 3 + i) : 0;
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
