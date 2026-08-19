// ---------------------------------------------------------------------------
// 物理 · 凸透镜成像：三条特殊光线，看照相机、投影仪、放大镜分别怎么成像
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, disposeObject, makeArrow, makeLabel, std } from '../three-utils';

const FW = 1.5; // 1 倍焦距的世界长度
const H_OBJ = 0.85; // 烛焰高度
const LENS_R = 1.5; // 透镜半径（决定光线是否画到镜面上）
const X_CLAMP = 6.2; // 像的位置超出画面时按比例压缩

type LabelOpts = Parameters<typeof makeLabel>[1];

export const lensScene: Scene3DDefinition = {
  id: 'phys-lens',
  title: '凸透镜成像',
  subject: '物理',
  grade: '8上',
  icon: '🔍',
  tagline: '移动蜡烛，看照相机、投影仪、放大镜分别是怎么成像的',
  keywords: ['凸透镜', '焦距', '实像', '虚像', '成像', '照相机', '投影仪', '放大镜', '焦点'],
  camera: { position: [0, 2.8, 9.8], target: [0, 1.5, 0] },
  controls: [
    // u 最小 0.5（小于焦距 f=1），这样才能演示放大镜的正立虚像
    { kind: 'slider', id: 'u', label: '物距 u', min: 0.5, max: 4, step: 0.1, defaultValue: 3, unit: 'f' },
  ],
  steps: [
    {
      title: '认识凸透镜',
      text: '中间厚、边缘薄的透镜叫凸透镜，它对光有会聚作用。O 是光心，F 是焦点，焦距 f 固定为 1。平行于主光轴的光，折射后一定穿过另一侧的焦点。',
    },
    {
      title: '照相机原理',
      text: '物距大于两倍焦距时，成倒立、缩小的实像，像落在一倍和两倍焦距之间。照相机就是这样，把远处大大的景物缩成底片上小小的像。',
    },
    {
      title: '投影仪原理',
      text: '物距在一倍和两倍焦距之间时，成倒立、放大的实像，像在两倍焦距以外。投影仪、幻灯机用的就是这个规律——所以投影片要倒着放。',
    },
    {
      title: '放大镜原理',
      text: '物距小于焦距时，折射光线散开了，但它们的反向延长线（虚线）会聚成一个正立、放大的虚像，和物体在同侧——这就是放大镜。虚像要用虚线画哦。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 16);
    const root = new THREE.Group();
    ctx.scene.add(root);
    const g = new THREE.Group(); // 主光轴高度的子场景
    g.position.y = 1.5;
    root.add(g);

    let u = 3;
    let step = 0;

    // ---- 主光轴与透镜 ----
    const axis = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-6.4, 0, 0), new THREE.Vector3(6.4, 0, 0)]),
      new THREE.LineBasicMaterial({ color: '#64748b' }),
    );
    g.add(axis);
    const lens = new THREE.Mesh(
      new THREE.SphereGeometry(1, 26, 18),
      std('#60a5fa', { transparent: true, opacity: 0.45, depthWrite: false }),
    );
    lens.scale.set(0.24, LENS_R, LENS_R);
    g.add(lens);
    const planeGeo = new THREE.BufferGeometry();
    planeGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([0, -LENS_R - 0.25, 0, 0, LENS_R + 0.25, 0]), 3),
    );
    const lensPlane = new THREE.Line(planeGeo, new THREE.LineDashedMaterial({ color: '#94a3b8', dashSize: 0.14, gapSize: 0.1 }));
    lensPlane.computeLineDistances();
    g.add(lensPlane);
    const lensLabel = makeLabel('凸透镜', { fontSize: 32, scale: 0.72, color: '#1d4ed8' });
    lensLabel.position.set(0, LENS_R + 0.55, 0);
    g.add(lensLabel);

    // ---- 光心、焦点、二倍焦距点 ----
    const markerGeo = new THREE.SphereGeometry(0.07, 10, 8);
    const fMat = std('#dc2626', { emissive: '#b91c1c', emissiveIntensity: 0.5 });
    const f2Mat = std('#7c3aed', { emissive: '#6d28d9', emissiveIntensity: 0.5 });
    const oMat = std('#0f172a');
    const markers: THREE.Mesh[] = [];
    for (const [x, mat] of [
      [-FW, fMat],
      [FW, fMat],
      [-2 * FW, f2Mat],
      [2 * FW, f2Mat],
      [0, oMat],
    ] as [number, THREE.Material][]) {
      const m = new THREE.Mesh(markerGeo, mat);
      m.position.set(x, 0, 0);
      g.add(m);
      markers.push(m);
    }
    const mkMarkLabel = (text: string, x: number, color: string) => {
      const l = makeLabel(text, { fontSize: 30, scale: 0.62, color });
      l.position.set(x, -0.38, 0);
      g.add(l);
    };
    mkMarkLabel('F', -FW, '#b91c1c');
    mkMarkLabel('F', FW, '#b91c1c');
    mkMarkLabel('2F', -2 * FW, '#6d28d9');
    mkMarkLabel('2F', 2 * FW, '#6d28d9');
    mkMarkLabel('O', 0, '#0f172a');

    // ---- 蜡烛（物体） ----
    const candle = new THREE.Group();
    const candleBody = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, H_OBJ, 12), std('#fecaca'));
    candleBody.position.y = H_OBJ / 2;
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.09, 0.24, 10),
      std('#fb923c', { emissive: '#f97316', emissiveIntensity: 0.9 }),
    );
    flame.position.y = H_OBJ + 0.12;
    candle.add(candleBody, flame);
    g.add(candle);
    const candleLabel = makeLabel('蜡烛（物体）', { fontSize: 28, scale: 0.62 });
    g.add(candleLabel);
    const objArrow = makeArrow('#dc2626', { radius: 0.03, headRadius: 0.09, headLength: 0.2 });
    g.add(objArrow.group);

    // ---- 三条特殊光线（每条最多两段） ----
    const RAY_OPTS = { radius: 0.018, headRadius: 0.05, headLength: 0.13 };
    const r1a = makeArrow('#f59e0b', RAY_OPTS);
    const r1b = makeArrow('#f59e0b', RAY_OPTS);
    const r2 = makeArrow('#f59e0b', RAY_OPTS);
    const r3a = makeArrow('#f59e0b', RAY_OPTS);
    const r3b = makeArrow('#f59e0b', RAY_OPTS);
    g.add(r1a.group, r1b.group, r2.group, r3a.group, r3b.group);

    // 虚像的反向延长虚线
    const mkDash = () => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: '#94a3b8', dashSize: 0.14, gapSize: 0.1 }));
      line.visible = false;
      g.add(line);
      return line;
    };
    const dash1 = mkDash();
    const dash2 = mkDash();
    const setDash = (line: THREE.Line, a: THREE.Vector3, b: THREE.Vector3) => {
      const attr = line.geometry.getAttribute('position') as THREE.BufferAttribute;
      attr.setXYZ(0, a.x, a.y, a.z);
      attr.setXYZ(1, b.x, b.y, b.z);
      attr.needsUpdate = true;
      line.computeLineDistances();
      line.visible = true;
    };

    // ---- 像 ----
    const imgArrow = makeArrow('#16a34a', { radius: 0.03, headRadius: 0.09, headLength: 0.2 });
    g.add(imgArrow.group);
    const imgMat = (imgArrow.group.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    imgMat.transparent = true;
    const imgLabel = makeLabel('像', { fontSize: 30, scale: 0.65, color: '#15803d' });
    g.add(imgLabel);

    // ---- 性质与数值标签 ----
    const PROP_OPTS: LabelOpts = { fontSize: 40, scale: 1.0, color: '#0f766e' };
    const NUM_OPTS: LabelOpts = { fontSize: 32, scale: 0.78, color: '#475569' };
    const propLabel = makeLabel('', PROP_OPTS);
    propLabel.position.set(0, 2.6, 0);
    g.add(propLabel);
    const numLabel = makeLabel('', NUM_OPTS);
    numLabel.position.set(0, 2.05, 0);
    g.add(numLabel);

    const setText = (sprite: THREE.Sprite, text: string, opts: LabelOpts) => {
      sprite.material.map?.dispose();
      sprite.material.dispose();
      const nl = makeLabel(text, opts);
      sprite.material = nl.material;
      sprite.scale.copy(nl.scale);
    };

    const V = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);

    interface ImageCase {
      kind: 'parallel' | 'real' | 'virtual';
      /** 像的性质（含应用举例） */
      nature: string;
      /** 性质牌完整文案 */
      propText: string;
      /** |像距|（f 单位）；不成像时为 0 */
      v: number;
      /** 放大率 |v/u| */
      m: number;
    }

    /** 透镜公式 1/u + 1/v = 1/f（f=1）的分类与数值：渲染与读数共用 */
    const analyze = (uu: number): ImageCase => {
      if (Math.abs(uu - 1) < 0.06) {
        return { kind: 'parallel', nature: '不成像', propText: 'u = f：不成像（折射光平行射出）', v: 0, m: 0 };
      }
      if (uu > 1) {
        // 实像：v = u·f/(u−f)，f = 1
        const v = uu / (uu - 1);
        const prefix = uu > 2.06 ? 'u > 2f' : Math.abs(uu - 2) <= 0.06 ? 'u = 2f' : 'f < u < 2f';
        const nature =
          uu > 2.06
            ? '倒立缩小的实像（照相机）'
            : Math.abs(uu - 2) <= 0.06
              ? '倒立等大的实像'
              : '倒立放大的实像（投影仪）';
        return { kind: 'real', nature, propText: `${prefix}：${nature}`, v, m: v / uu };
      }
      // u < f：正立放大的虚像
      const vAbs = uu / (1 - uu);
      const nature = '正立放大的虚像（放大镜）';
      return { kind: 'virtual', nature, propText: `u < f：${nature}`, v: vAbs, m: vAbs / uu };
    };

    const rebuild = () => {
      const candleX = -u * FW;
      candle.position.set(candleX, 0, 0);
      candleLabel.position.set(candleX, -0.62, 0);
      objArrow.set(V(candleX, 0, 0.22), V(candleX, H_OBJ, 0.22));
      const top = V(candleX, H_OBJ, 0);
      dash1.visible = false;
      dash2.visible = false;

      const res = analyze(u);
      let numText: string;
      if (res.kind === 'parallel') {
        // u = f：折射光平行，不成像
        r1a.set(top, V(0, H_OBJ));
        const d1 = V(FW, -H_OBJ).normalize(); // 经透镜后穿焦点方向
        r1b.set(V(0, H_OBJ), V(d1.x * 6, H_OBJ + d1.y * 6));
        const d2 = V(u * FW, -H_OBJ).normalize(); // 过光心方向
        r2.set(top, V(top.x + d2.x * 7, top.y + d2.y * 7));
        r3a.group.visible = false;
        r3b.group.visible = false;
        imgArrow.group.visible = false;
        imgLabel.visible = false;
        numText = `u = ${u.toFixed(1)}f`;
      } else if (res.kind === 'real') {
        const v = res.v;
        let imgX = v * FW;
        let imgY = (-H_OBJ * v) / u;
        if (imgX > X_CLAMP) {
          const k = X_CLAMP / imgX;
          imgX = X_CLAMP;
          imgY *= k;
        }
        r1a.set(top, V(0, H_OBJ));
        r1b.set(V(0, H_OBJ), V(imgX, imgY));
        r2.set(top, V(imgX, imgY));
        // 过焦点→折射后平行的光线，只在像点高度能落到镜面范围内时画
        const onLens = Math.abs(imgY) <= LENS_R;
        r3a.group.visible = onLens;
        r3b.group.visible = onLens;
        if (onLens) {
          r3a.set(top, V(0, imgY));
          r3b.set(V(0, imgY), V(imgX, imgY));
        }
        imgArrow.group.visible = true;
        imgLabel.visible = true;
        imgMat.opacity = 1;
        imgArrow.set(V(imgX, 0, 0.22), V(imgX, imgY, 0.22));
        imgLabel.position.set(imgX, imgY - 0.45, 0);
        numText = `u = ${u.toFixed(1)}f    v = ${v.toFixed(1)}f    像高 = ${(v / u).toFixed(1)} × 物高`;
      } else {
        // u < f：正立放大的虚像（反向延长线会聚）
        const vAbs = res.v;
        let imgX = -vAbs * FW;
        let imgY = H_OBJ / (1 - u);
        if (imgX < -X_CLAMP) {
          const k = -X_CLAMP / imgX;
          imgX = -X_CLAMP;
          imgY *= k;
        }
        r1a.set(top, V(0, H_OBJ));
        const d1 = V(FW, -H_OBJ).normalize(); // 折射后仍穿过远侧焦点
        r1b.set(V(0, H_OBJ), V(d1.x * 3.2, H_OBJ + d1.y * 3.2));
        const d2 = V(u * FW, -H_OBJ).normalize(); // 过光心
        r2.set(top, V(top.x + d2.x * 3.6, top.y + d2.y * 3.6));
        r3a.group.visible = false;
        r3b.group.visible = false;
        setDash(dash1, V(0, H_OBJ), V(imgX, imgY));
        setDash(dash2, V(0, 0), V(imgX, imgY));
        imgArrow.group.visible = true;
        imgLabel.visible = true;
        imgMat.opacity = 0.45; // 虚像半透明
        imgArrow.set(V(imgX, 0, 0.22), V(imgX, imgY, 0.22));
        imgLabel.position.set(imgX, imgY + 0.5, 0);
        numText = `u = ${u.toFixed(1)}f    虚像与物同侧，放大 ${(vAbs / u).toFixed(1)} 倍`;
      }
      setText(propLabel, res.propText, PROP_OPTS);
      setText(numLabel, numText, NUM_OPTS);
    };
    rebuild();

    return {
      setStep(i) {
        step = i;
        // 每一步切到对应物距，直接看到该情况的光路
        if (i === 1) u = 3;
        else if (i === 2) u = 1.5;
        else if (i === 3) u = 0.7;
        rebuild();
      },
      setParam(id, value) {
        if (id === 'u') {
          u = Number(value);
          rebuild();
        }
      },
      getReadouts() {
        const res = analyze(u);
        if (res.kind === 'parallel') return [{ label: '状态', value: '不成像（u=f）' }];
        if (res.kind === 'real') {
          return [
            { label: '物距 u', value: `${u.toFixed(1)} f` },
            { label: '像距 v', value: `${res.v.toFixed(2)} f` },
            { label: '放大率 m', value: `${res.m.toFixed(2)}×` },
            { label: '像的性质', value: res.nature },
          ];
        }
        return [
          { label: '物距 u', value: `${u.toFixed(1)} f` },
          { label: '像距', value: '虚像' },
          { label: '放大率 m', value: `${res.m.toFixed(2)}×` },
          { label: '像的性质', value: res.nature },
        ];
      },
      update(dt, elapsed) {
        // 烛焰摇曳
        flame.scale.set(
          1 + Math.sin(elapsed * 13) * 0.15,
          1 + Math.sin(elapsed * 19) * 0.2,
          1 + Math.sin(elapsed * 13) * 0.15,
        );
        // 第 1 步时焦点 marker 呼吸提示
        const pulse = step === 0 ? 1 + Math.sin(elapsed * 3.5) * 0.3 : 1;
        for (const m of markers) m.scale.setScalar(pulse);
      },
      dispose() {
        ctx.scene.remove(root);
        disposeObject(root);
      },
    };
  },
};
