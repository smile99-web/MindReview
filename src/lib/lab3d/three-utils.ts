// ---------------------------------------------------------------------------
// 3D 实验室 — 共用 three.js 小工具
// ---------------------------------------------------------------------------
import * as THREE from 'three';

/** 中文友好的文字标签（canvas → Sprite，始终面向相机） */
export function makeLabel(
  text: string,
  opts: { fontSize?: number; color?: string; bg?: string; scale?: number } = {},
): THREE.Sprite {
  const { fontSize = 44, color = '#1e293b', bg = 'rgba(255,255,255,0.88)', scale = 1 } = opts;
  const pad = 18;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = `bold ${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = fontSize + pad * 2;
  canvas.width = w * 2; // 2x 防锯齿
  canvas.height = h * 2;
  const c2 = canvas.getContext('2d')!;
  c2.scale(2, 2);
  c2.font = `bold ${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  if (bg) {
    c2.fillStyle = bg;
    c2.beginPath();
    c2.roundRect(0, 0, w, h, 12);
    c2.fill();
  }
  c2.fillStyle = color;
  c2.textAlign = 'center';
  c2.textBaseline = 'middle';
  c2.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  const s = 0.005 * scale;
  sprite.scale.set(w * s, h * s, 1);
  return sprite;
}

/** 两点之间的圆柱（分子棍、力臂杆等） */
export function cylinderBetween(
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number,
  material: THREE.Material,
): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 12), material);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return mesh;
}

/** 平滑插值辅助（动画状态过渡） */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return THREE.MathUtils.damp(current, target, lambda, dt);
}

/** 递归释放几何体/材质/纹理 */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = (mesh as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) {
      mat.forEach((m) => {
        const sm = m as THREE.MeshStandardMaterial;
        if (sm.map) sm.map.dispose();
        m.dispose();
      });
    } else if (mat) {
      const sm = mat as THREE.MeshStandardMaterial;
      if (sm.map) sm.map.dispose();
      mat.dispose();
    }
  });
}

/** 常用材质工厂（少分配、统一风格） */
export function std(color: string | number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.08, ...extra });
}

/** 地面参考网格 + 柔光，几乎所有场景都用 */
export function addStageBasics(scene: THREE.Scene, size = 14): void {
  const grid = new THREE.GridHelper(size, size, 0xcbd5e1, 0xe2e8f0);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.5;
  scene.add(grid);
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const dir = new THREE.DirectionalLight(0xffffff, 1.4);
  dir.position.set(5, 9, 6);
  scene.add(dir);
  const fill = new THREE.DirectionalLight(0xdbeafe, 0.5);
  fill.position.set(-6, 4, -5);
  scene.add(fill);
}
