'use client';

// ---------------------------------------------------------------------------
// ThreeStage：three.js 渲染宿主（renderer / camera / OrbitControls / RAF 循环）
// 只负责舞台生命周期；场景内容由 def.build 产出，步骤/参数由 ScenePlayer 驱动。
// ---------------------------------------------------------------------------
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Scene3DDefinition, SceneHandle } from '@/lib/lab3d/types';
import { disposeObject } from '@/lib/lab3d/three-utils';

export default function ThreeStage({
  def,
  onHandle,
}: {
  def: Scene3DDefinition;
  onHandle: (handle: SceneHandle | null) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const cbRef = useRef(onHandle);
  useEffect(() => {
    cbRef.current = onHandle;
  }, [onHandle]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f1f5f9');

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    camera.position.set(...(def.camera?.position ?? [7, 5, 9]));

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(...(def.camera?.target ?? [0, 1, 0]));

    const handle = def.build({ scene, camera, renderer, controls });
    cbRef.current(handle);

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    let raf = 0;
    let last = performance.now();
    let elapsed = 0;
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      elapsed += dt;
      handle.update?.(dt, elapsed);
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      cbRef.current(null);
      handle.dispose();
      disposeObject(scene);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
    };
  }, [def]);

  return <div ref={hostRef} className="h-full w-full touch-none" />;
}
