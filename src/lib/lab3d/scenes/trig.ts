// ---------------------------------------------------------------------------
// 数学 · 锐角三角函数：正弦、余弦、正切是直角三角形三边的比值
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, cylinderBetween, damp, disposeObject, makeLabel, std } from '../three-utils';

const HYP = 5; // 斜边固定 5
const DEG = Math.PI / 180;
const SPECIALS = [30, 45, 60];
const EXACT: Record<number, { sin: string; cos: string; tan: string }> = {
  30: { sin: '1/2', cos: '√3/2', tan: '√3/3' },
  45: { sin: '√2/2', cos: '√2/2', tan: '1' },
  60: { sin: '√3/2', cos: '1/2', tan: '√3' },
};

export const trigScene: Scene3DDefinition = {
  id: 'math-trig',
  title: '锐角三角函数',
  subject: '数学',
  grade: '9下',
  icon: '📐',
  tagline: '正弦、余弦、正切，就是直角三角形三边的比值',
  keywords: ['三角函数', '正弦', '余弦', '正切', '锐角', '直角三角形', '特殊角', '解直角三角形'],
  camera: { position: [0.5, 3.0, 10.5], target: [0.3, 2.0, 0] },
  controls: [
    { kind: 'slider', id: 'theta', label: '锐角 θ', min: 10, max: 80, step: 1, defaultValue: 35, unit: '°' },
    { kind: 'button', id: 'special', label: '⭐ 特殊角 30°/45°/60°' },
  ],
  steps: [
    {
      title: '认识三边',
      text: '直角三角形中，锐角 θ 正对着的边叫对边，贴着的直角边叫邻边，最长的叫斜边。图中对边红色，邻边蓝色，斜边黄色。拖动 θ 看看：三边长度跟着变，但名字不会变。',
    },
    {
      title: '三个比值',
      text: '正弦是对边比斜边，余弦是邻边比斜边，正切是对边比邻边。右边三块牌子实时显示这三个比值。拖动 θ：角一变，三个比值全都跟着变。',
    },
    {
      title: '比值由角决定',
      text: '注意里面的小三角形：它和外面的大三角形相似，边长都缩小了一半，但同样的角算出来的比值一模一样。所以三角函数值只由角决定，跟三角形大小无关。',
    },
    {
      title: '特殊角',
      text: '三十度、四十五度、六十度的三角函数值经常考，要记牢。点上面的特殊角按钮循环切换：sin 三十度等于二分之一，cos 四十五度等于二分之根号二，tan 六十度等于根号三。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 14);
    let step = 0;
    let tTheta = 35; // 目标角
    let cTheta = 35; // 当前显示角（阻尼）
    let specialIdx = -1;

    const group = new THREE.Group();
    group.position.y = 1.3;
    ctx.scene.add(group);

    const O = new THREE.Vector3(-3.2, 0, 0);

    // 三条边（对边红、邻边蓝、斜边黄）
    const oppMat = std('#dc2626', { emissive: '#b91c1c', emissiveIntensity: 0.4 });
    const adjMat = std('#2563eb', { emissive: '#1d4ed8', emissiveIntensity: 0.4 });
    const hypMat = std('#eab308', { emissive: '#ca8a04', emissiveIntensity: 0.4 });
    const adjEdge = cylinderBetween(O, O.clone().add(new THREE.Vector3(4, 0, 0)), 0.06, adjMat);
    const oppEdge = cylinderBetween(O, O.clone().add(new THREE.Vector3(0, 3, 0)), 0.06, oppMat);
    const hypEdge = cylinderBetween(O, O.clone().add(new THREE.Vector3(3, 3, 0)), 0.06, hypMat);
    group.add(adjEdge, oppEdge, hypEdge);

    // 边名称标签
    const adjLabel = makeLabel('', { fontSize: 34, scale: 0.8, color: '#1d4ed8' });
    const oppLabel = makeLabel('', { fontSize: 34, scale: 0.8, color: '#b91c1c' });
    const hypLabel = makeLabel('斜边 = 5', { fontSize: 34, scale: 0.8, color: '#a16207' });
    group.add(adjLabel, oppLabel, hypLabel);

    // θ 弧线 + 标签
    let thetaArc: THREE.Mesh | null = null;
    const thetaArcMat = std('#f97316', { emissive: '#ea580c', emissiveIntensity: 0.45 });
    const thetaLabel = makeLabel('', { fontSize: 36, scale: 0.8, color: '#ea580c' });
    group.add(thetaLabel);

    // 直角标记
    const sqMat = std('#0f172a');
    const sq1 = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 0.05), sqMat);
    const sq2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.32, 0.05), sqMat);
    group.add(sq1, sq2);

    // 比值牌（右上方三块）
    const sinBoard = makeLabel('', { fontSize: 36, scale: 0.85, color: '#b91c1c' });
    sinBoard.position.set(3.6, 4.3, 0);
    const cosBoard = makeLabel('', { fontSize: 36, scale: 0.85, color: '#1d4ed8' });
    cosBoard.position.set(3.6, 3.4, 0);
    const tanBoard = makeLabel('', { fontSize: 36, scale: 0.85, color: '#7c3aed' });
    tanBoard.position.set(3.6, 2.5, 0);
    group.add(sinBoard, cosBoard, tanBoard);

    // 内部相似小三角形（step>=2）
    const innerGeo = new THREE.BufferGeometry();
    innerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    const innerTri = new THREE.LineLoop(
      innerGeo,
      new THREE.LineBasicMaterial({ color: '#8b5cf6' }),
    );
    group.add(innerTri);
    const innerLabel = makeLabel('小三角形与大三角形相似，比值相同', {
      fontSize: 30,
      scale: 0.75,
      color: '#7c3aed',
    });
    group.add(innerLabel);

    // 特殊角提示
    const specialHint = makeLabel('👆 点「⭐ 特殊角」按钮，看 30°/45°/60° 的精确值', {
      fontSize: 30,
      scale: 0.8,
      color: '#b45309',
    });
    specialHint.position.set(0.3, 5.35, 0);
    group.add(specialHint);

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

    /** 用圆柱重连一条边 */
    const relink = (mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material) => {
      const nm = cylinderBetween(a, b, r, mat);
      mesh.geometry.dispose();
      mesh.geometry = nm.geometry;
      mesh.position.copy(nm.position);
      mesh.quaternion.copy(nm.quaternion);
    };

    const rebuild = () => {
      const rad = cTheta * DEG;
      const adjLen = HYP * Math.cos(rad);
      const oppLen = HYP * Math.sin(rad);
      const B = O.clone().add(new THREE.Vector3(adjLen, 0, 0));
      const T = O.clone().add(new THREE.Vector3(adjLen, oppLen, 0));

      relink(adjEdge, O, B, 0.06, adjMat);
      relink(oppEdge, B, T, 0.06, oppMat);
      relink(hypEdge, O, T, 0.06, hypMat);

      // 边标签
      const degInt = Math.round(cTheta);
      setLabel(adjLabel, `邻边 = ${adjLen.toFixed(2)}`, { fontSize: 34, scale: 0.8, color: '#1d4ed8' });
      adjLabel.position.copy(O).lerp(B, 0.5).add(new THREE.Vector3(0, -0.5, 0));
      setLabel(oppLabel, `对边 = ${oppLen.toFixed(2)}`, { fontSize: 34, scale: 0.8, color: '#b91c1c' });
      oppLabel.position.copy(B).lerp(T, 0.5).add(new THREE.Vector3(1.0, 0, 0));
      hypLabel.position
        .copy(O)
        .lerp(T, 0.5)
        .add(new THREE.Vector3(-Math.sin(rad), Math.cos(rad), 0).multiplyScalar(0.7));

      // θ 弧线
      const pts: THREE.Vector3[] = [];
      const n = 28;
      for (let i = 0; i <= n; i++) {
        const t = (rad * i) / n;
        pts.push(new THREE.Vector3(O.x + Math.cos(t) * 1.0, Math.sin(t) * 1.0, 0));
      }
      const arcGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.045, 8, false);
      if (thetaArc) {
        thetaArc.geometry.dispose();
        thetaArc.geometry = arcGeo;
      } else {
        thetaArc = new THREE.Mesh(arcGeo, thetaArcMat);
        group.add(thetaArc);
      }
      setLabel(thetaLabel, `θ = ${degInt}°`, { fontSize: 36, scale: 0.8, color: '#ea580c' });
      thetaLabel.position.set(O.x + Math.cos(rad / 2) * 1.55, Math.sin(rad / 2) * 1.55, 0);

      // 直角标记
      sq1.position.set(B.x - 0.16, B.y + 0.3, 0);
      sq2.position.set(B.x - 0.32, B.y + 0.15, 0);

      // 比值牌
      const sinV = Math.sin(rad);
      const cosV = Math.cos(rad);
      const tanV = Math.tan(rad);
      const exact = EXACT[degInt];
      const isSpecial = !!exact && Math.abs(cTheta - degInt) < 0.3;
      setLabel(
        sinBoard,
        isSpecial ? `sin ${degInt}° = ${exact.sin}（对 ÷ 斜）` : `sin ${degInt}° ≈ ${sinV.toFixed(3)}（对 ÷ 斜）`,
        { fontSize: 36, scale: 0.85, color: '#b91c1c' },
      );
      setLabel(
        cosBoard,
        isSpecial ? `cos ${degInt}° = ${exact.cos}（邻 ÷ 斜）` : `cos ${degInt}° ≈ ${cosV.toFixed(3)}（邻 ÷ 斜）`,
        { fontSize: 36, scale: 0.85, color: '#1d4ed8' },
      );
      setLabel(
        tanBoard,
        isSpecial ? `tan ${degInt}° = ${exact.tan}（对 ÷ 邻）` : `tan ${degInt}° ≈ ${tanV.toFixed(3)}（对 ÷ 邻）`,
        { fontSize: 36, scale: 0.85, color: '#7c3aed' },
      );
      const showBoards = step >= 1;
      sinBoard.visible = showBoards;
      cosBoard.visible = showBoards;
      tanBoard.visible = showBoards;

      // 内部相似小三角形（一半大小）
      const showInner = step >= 2;
      innerTri.visible = showInner;
      innerLabel.visible = showInner;
      if (showInner) {
        const attr = innerGeo.getAttribute('position') as THREE.BufferAttribute;
        attr.setXYZ(0, O.x, O.y, 0);
        attr.setXYZ(1, O.x + adjLen / 2, 0, 0);
        attr.setXYZ(2, O.x + adjLen / 2, oppLen / 2, 0);
        attr.needsUpdate = true;
        innerLabel.position.set(O.x + adjLen / 4 + 0.6, oppLen / 2 + 0.55, 0);
      }

      // 特殊角提示
      specialHint.visible = step === 3 && !isSpecial;
    };
    rebuild();

    return {
      setStep(i) {
        step = i;
        rebuild();
      },
      setParam(id, value) {
        if (id === 'theta') {
          tTheta = Number(value);
          specialIdx = -1;
        }
        if (id === 'special') {
          specialIdx = (specialIdx + 1) % SPECIALS.length;
          tTheta = SPECIALS[specialIdx];
        }
      },
      update(dt) {
        const prev = cTheta;
        cTheta = damp(cTheta, tTheta, 8, dt);
        if (Math.abs(prev - cTheta) > 0.001) rebuild();
      },
      dispose() {
        ctx.scene.remove(group);
        disposeObject(group);
      },
    };
  },
};
