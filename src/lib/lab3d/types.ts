// ---------------------------------------------------------------------------
// 3D 实验室 — 场景类型契约
// 每个场景是一个自包含的 three.js 演示 + 分步讲解，知识点页/合集页共用。
// ---------------------------------------------------------------------------
import type * as THREE from 'three';

export interface SceneStep {
  /** 步骤短标题（显示在步骤条上） */
  title: string;
  /** 讲解文字（也是 TTS 朗读内容，控制在 200 字以内） */
  text: string;
}

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  /** OrbitControls（结构化类型，场景如需移动相机可修改 target） */
  controls?: { target: THREE.Vector3; update(): void };
}

/** 场景自定义控件的声明（ScenePlayer 通用渲染） */
export type SceneControl =
  | {
      kind: 'select';
      id: string;
      label: string;
      options: { value: string; label: string }[];
      defaultValue: string;
    }
  | {
      kind: 'slider';
      id: string;
      label: string;
      min: number;
      max: number;
      step: number;
      defaultValue: number;
      unit?: string;
    }
  | { kind: 'button'; id: string; label: string };

export interface SceneHandle {
  /** 讲解步骤切换（0 起）：驱动该步骤的动画/高亮状态 */
  setStep(index: number): void;
  /** 自定义控件回调；button 每次点击都会触发（value 为递增计数） */
  setParam?(id: string, value: number | string): void;
  /** 每帧回调：dt 秒数、elapsed 总秒数 */
  update?(dt: number, elapsed: number): void;
  /** 卸载清理（几何体/材质/事件） */
  dispose(): void;
}

export interface Scene3DDefinition {
  id: string;
  title: string;
  subject: '数学' | '物理' | '化学';
  /** 适用年级学期，如 '7上' '8下' '9全'（合集页展示用，可空） */
  grade?: string;
  icon: string;
  /** 一句话简介（合集页卡片用） */
  tagline: string;
  /** 知识点匹配关键词（标题/keywords 命中即加分） */
  keywords: string[];
  /** 初始相机；缺省由 Stage 给一个通用视角 */
  camera?: { position: [number, number, number]; target?: [number, number, number] };
  controls?: SceneControl[];
  steps: SceneStep[];
  build(ctx: SceneContext): SceneHandle;
}
