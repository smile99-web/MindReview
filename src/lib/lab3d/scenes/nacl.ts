// ---------------------------------------------------------------------------
// 化学 · 离子晶体：NaCl 晶格结构与溶解过程
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, disposeObject, makeLabel, std } from '../three-utils';

const GAP = 1.15;
const DIM = 3; // 3x3x3 晶胞展示

interface Ion {
  mesh: THREE.Mesh;
  home: THREE.Vector3;
  drift: THREE.Vector3;
  phase: number;
}

export const naclScene: Scene3DDefinition = {
  id: 'chem-nacl',
  title: '氯化钠离子晶体',
  subject: '化学',
  icon: '🧂',
  tagline: '钠离子与氯离子交替排列成立体晶格，遇水为什么会溶解？',
  keywords: ['离子', '离子键', '晶体', '氯化钠', '食盐', '溶解', '钠离子', '氯离子', '晶格', '电解质'],
  camera: { position: [5.5, 4.5, 7], target: [0, 1.2, 0] },
  controls: [{ kind: 'button', id: 'dissolve', label: '💧 溶解 / 结晶' }],
  steps: [
    {
      title: '离子晶体',
      text: '食盐的主要成分是氯化钠。紫色小球是钠离子，绿色大球是氯离子。钠原子失去一个电子带正电，氯原子得到一个电子带负电，阴阳离子靠静电作用紧紧吸引。',
    },
    {
      title: '晶格结构',
      text: '在晶体中，钠离子和氯离子按规则交替排列，每个钠离子周围有六个氯离子，每个氯离子周围也有六个钠离子。这种规则排列叫晶格，所以食盐颗粒总是方方正正的。',
    },
    {
      title: '溶解过程',
      text: '点一下"溶解"按钮：水是极性分子，水分子会把钠离子和氯离子从晶体表面"拉"下来，包围着它们均匀分散到水中。离子晶体因此容易溶于水，溶解后就能导电了。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 12);
    const group = new THREE.Group();
    ctx.scene.add(group);
    const ions: Ion[] = [];
    let dissolved = 0; // 0 晶体 ↔ 1 溶解
    let target = 0;
    let step = 0;

    const naGeo = new THREE.SphereGeometry(0.3, 18, 14);
    const clGeo = new THREE.SphereGeometry(0.48, 18, 14);
    const naMat = std('#a78bfa', { emissive: '#7c3aed', emissiveIntensity: 0.2 });
    const clMat = std('#4ade80', { emissive: '#15803d', emissiveIntensity: 0.15 });
    let seed = 7;
    const srnd = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    const off = ((DIM - 1) / 2) * GAP;
    for (let x = 0; x < DIM; x++)
      for (let y = 0; y < DIM; y++)
        for (let z = 0; z < DIM; z++) {
          const isNa = (x + y + z) % 2 === 0;
          const mesh = new THREE.Mesh(isNa ? naGeo : clGeo, isNa ? naMat : clMat);
          const home = new THREE.Vector3(x * GAP - off, y * GAP - off + 1.6, z * GAP - off);
          mesh.position.copy(home);
          group.add(mesh);
          ions.push({
            mesh,
            home,
            drift: new THREE.Vector3((srnd() - 0.5) * 9, srnd() * 4 - 0.5, (srnd() - 0.5) * 9),
            phase: srnd() * Math.PI * 2,
          });
        }

    // 晶格连线（近邻）
    const lineMat = new THREE.LineBasicMaterial({ color: '#cbd5e1', transparent: true, opacity: 0.6 });
    const linePts: THREE.Vector3[] = [];
    ions.forEach((a, i) => {
      ions.forEach((b, j) => {
        if (j <= i) return;
        if (Math.abs(a.home.distanceTo(b.home) - GAP) < 0.01) {
          linePts.push(a.home.clone(), b.home.clone());
        }
      });
    });
    const lattice = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(linePts), lineMat);
    group.add(lattice);

    const labelNa = makeLabel('Na⁺ 钠离子', { fontSize: 36, scale: 0.8, color: '#6d28d9' });
    labelNa.position.set(-3.4, 3.6, 0);
    group.add(labelNa);
    const labelCl = makeLabel('Cl⁻ 氯离子', { fontSize: 36, scale: 0.8, color: '#15803d' });
    labelCl.position.set(3.4, 3.6, 0);
    group.add(labelCl);
    const waterLabel = makeLabel('💧 水分子把离子包围分散', { fontSize: 38, scale: 0.9, color: '#0369a1' });
    waterLabel.position.set(0, 4.4, 0);
    waterLabel.visible = false;
    group.add(waterLabel);

    const applyStep = () => {
      lattice.visible = step < 2;
      waterLabel.visible = step >= 2 && target > 0.5;
    };
    applyStep();

    return {
      setStep(i) {
        step = i;
        if (step >= 2) target = 1;
        else target = 0;
        applyStep();
      },
      setParam(id) {
        if (id === 'dissolve') {
          target = target > 0.5 ? 0 : 1;
          applyStep();
        }
      },
      update(dt, elapsed) {
        dissolved = THREE.MathUtils.damp(dissolved, target, 2.2, dt);
        lattice.visible = dissolved < 0.5 && step < 2;
        ions.forEach((ion) => {
          const wobble = Math.sin(elapsed * 1.6 + ion.phase) * 0.22;
          const dest = ion.home
            .clone()
            .lerp(ion.drift, dissolved)
            .add(new THREE.Vector3(0, wobble * dissolved + Math.sin(elapsed * 2.4 + ion.phase) * 0.02, 0));
          ion.mesh.position.copy(dest);
        });
        group.rotation.y += dt * 0.12 * (1 - dissolved);
      },
      dispose() {
        ctx.scene.remove(group);
        disposeObject(group);
      },
    };
  },
};
