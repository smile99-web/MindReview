// ---------------------------------------------------------------------------
// 3D 思维导图（知识星空）— three.js 渲染引擎
//
// 视觉设计（面向孩子："把整片知识星空点亮"）：
// - 知识点 = 星球：掌握度越高越亮（0 灰暗 → 1-59 微光 → 60-79 金色 → 80+ 翠绿）
// - 知识关系 = 星座连线：按关系类型着色；两端都掌握的边最亮（学过的东西"连成网"）
// - 章节 = 星座：锚点处有章节名牌 + 底盘光圈
// - 前置已满足的未掌握节点 = "推荐点亮"：金色脉冲光环引导孩子下一步学什么
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { makeLabel } from '@/lib/lab3d/three-utils';
import { computeGalaxyLayout } from '@/lib/mindmap3d/layout';
import { RELATION_COLORS } from '@/types';
import type { RelationType } from '@/types';

export interface GalaxyRawNode {
  id: string;
  title?: string | null;
  masteryLevel?: number | null;
  difficulty?: number | null;
  representationType?: string | null;
  chapter?: { id?: string | null; title?: string | null } | null;
  chapterId?: string | null;
}

export interface GalaxyRawEdge {
  id?: string;
  fromId?: string | null;
  toId?: string | null;
  relationType?: string | null;
}

export interface GalaxyStats {
  total: number;
  mastered: number;
  /** 推荐点亮的节点 id（前置已掌握、自身未掌握），按连接度排序，最多 6 个 */
  suggested: string[];
}

export interface GalaxyCallbacks {
  onHover?: (info: { id: string; x: number; y: number } | null) => void;
  onFocusChange?: (id: string | null) => void;
  onStatsChange?: (stats: GalaxyStats) => void;
}

interface GraphNode {
  id: string;
  title: string;
  chapterKey: string;
  mastery: number;
  degree: number;
  bucket: number;
  suggested: boolean;
  mesh: THREE.Mesh;
  glow: THREE.Sprite;
  ring: THREE.Mesh | null;
  pos: THREE.Vector3;
  radius: number;
}

interface GraphEdge {
  id: string;
  fromId: string;
  toId: string;
  relationType: RelationType | undefined;
  crossChapter: boolean;
}

const FALLBACK_EDGE_COLOR = '#94a3b8';
const CROSS_CHAPTER_COLOR = '#fbbf24';
const MASTERED_THRESHOLD = 60;

/** 掌握度分档（星球亮度） */
const BUCKETS = [
  { color: '#7d8aa5', emissive: '#1e293b', emissiveIntensity: 0.35, glow: '#5b6b8c', glowOpacity: 0.22 },
  { color: '#f59e0b', emissive: '#b45309', emissiveIntensity: 0.55, glow: '#f59e0b', glowOpacity: 0.5 },
  { color: '#fbbf24', emissive: '#d97706', emissiveIntensity: 0.8, glow: '#fde047', glowOpacity: 0.75 },
  { color: '#34d399', emissive: '#059669', emissiveIntensity: 1.0, glow: '#6ee7b7', glowOpacity: 0.95 },
] as const;

function bucketOf(mastery: number): number {
  if (mastery <= 0) return 0;
  if (mastery < MASTERED_THRESHOLD) return 1;
  if (mastery < 80) return 2;
  return 3;
}

function relationColor(type: RelationType | undefined): THREE.Color {
  return new THREE.Color(type ? RELATION_COLORS[type] : FALLBACK_EDGE_COLOR);
}

function makeGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.28)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * 重建图谱时只释放"每节点独有"的资源（标签纹理、光环、线段、箭头锥），
 * 跳过引擎级共享资源（球体几何、分档材质、辉光材质）——否则重新加载数据后
 * 共享几何体被 dispose，整个图会消失。
 */
function disposeGraphObject(root: THREE.Object3D, skip: Set<object>): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    // Sprite 的 geometry 是 three 模块级单例，绝不能 dispose
    const isSprite = (obj as THREE.Sprite).isSprite === true;
    if (mesh.geometry && !isSprite && !skip.has(mesh.geometry)) mesh.geometry.dispose();
    const mat = (mesh as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    const mats = Array.isArray(mat) ? mat : mat ? [mat] : [];
    for (const m of mats) {
      if (skip.has(m)) continue;
      const sm = m as THREE.MeshStandardMaterial;
      if (sm.map) sm.map.dispose();
      m.dispose();
    }
  });
}

export class GalaxyEngine {
  private container: HTMLElement;
  private callbacks: GalaxyCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private raycaster = new THREE.Raycaster();
  private resizeObserver: ResizeObserver;
  private rafId = 0;
  private disposed = false;
  private elapsed = 0;
  private lastTime = 0;

  // 图数据
  private graphGroup: THREE.Group | null = null;
  private nodes: GraphNode[] = [];
  private edges: GraphEdge[] = [];
  private nodeById = new Map<string, GraphNode>();
  private pickMeshes: THREE.Mesh[] = [];
  private baseLines: THREE.LineSegments | null = null;
  private highlightLines: THREE.LineSegments | null = null;
  private conePool: THREE.Mesh[] = [];
  private sceneRadius = 8;

  // 共享资源
  private sphereGeo = new THREE.SphereGeometry(1, 20, 14);
  private glowTex = makeGlowTexture();
  private bucketMats: THREE.MeshStandardMaterial[] = [];
  private bucketHiMats: THREE.MeshStandardMaterial[] = [];
  private dimMat = new THREE.MeshStandardMaterial({ color: '#2b3548', emissive: '#0b1023', emissiveIntensity: 0.3, roughness: 0.6 });
  private glowMats: THREE.SpriteMaterial[] = [];

  // 交互状态
  private hoveredId: string | null = null;
  private focusId: string | null = null;
  private pointer = new THREE.Vector2();
  private pointerClient = { x: 0, y: 0 };
  private pointerDirty = false;
  private downInfo: { x: number; y: number; t: number } | null = null;
  private desiredCamPos: THREE.Vector3 | null = null;
  private desiredTarget: THREE.Vector3 | null = null;
  private homePos = new THREE.Vector3();
  private homeTarget = new THREE.Vector3();
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  private relationFilter = '';
  private crossChapter = false;

  constructor(container: HTMLElement, callbacks: GalaxyCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0b1023');
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
    this.camera.position.set(0, 10, 22);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.5;
    this.controls.addEventListener('start', this.handleInteract);

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const dir = new THREE.DirectionalLight(0xffffff, 1.6);
    dir.position.set(6, 12, 8);
    this.scene.add(dir);
    const rim = new THREE.DirectionalLight(0x93c5fd, 0.5);
    rim.position.set(-8, 4, -6);
    this.scene.add(rim);

    // 背景星野
    const starCount = 700;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 260 + Math.random() * 260;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.cos(phi);
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xffffff, size: 1.1, sizeAttenuation: true, transparent: true, opacity: 0.7, depthWrite: false,
    }));
    this.scene.add(stars);

    // 共享材质
    for (const b of BUCKETS) {
      this.bucketMats.push(new THREE.MeshStandardMaterial({
        color: b.color, emissive: b.emissive, emissiveIntensity: b.emissiveIntensity, roughness: 0.42, metalness: 0.12,
      }));
      this.bucketHiMats.push(new THREE.MeshStandardMaterial({
        color: b.color, emissive: b.color, emissiveIntensity: 1.25, roughness: 0.35, metalness: 0.1,
      }));
      this.glowMats.push(new THREE.SpriteMaterial({
        map: this.glowTex, color: b.glow, transparent: true, opacity: b.glowOpacity,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
    }

    // 事件
    const el = this.renderer.domElement;
    el.addEventListener('pointermove', this.handlePointerMove);
    el.addEventListener('pointerdown', this.handlePointerDown);
    el.addEventListener('pointerup', this.handlePointerUp);
    el.addEventListener('pointerleave', this.handlePointerLeave);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    this.rafId = requestAnimationFrame(this.tick);
  }

  // ------------------------------------------------------------------ data

  setData(rawNodes: GalaxyRawNode[], rawEdges: GalaxyRawEdge[]): void {
    if (this.disposed) return;
    // 数据重载：清空交互状态（旧聚焦/悬停节点可能已不存在）
    this.focusId = null;
    this.hoveredId = null;
    this.callbacks.onFocusChange?.(null);
    this.callbacks.onHover?.(null);
    // 去重（schema 节点可能重复出现）
    const seen = new Set<string>();
    const uniqueNodes = rawNodes.filter((n) => {
      if (!n.id || seen.has(n.id)) return false;
      seen.add(n.id);
      return true;
    });
    const nodeIds = new Set(uniqueNodes.map((n) => n.id));
    const cleanEdges: GraphEdge[] = [];
    for (const e of rawEdges) {
      if (!e.fromId || !e.toId || e.fromId === e.toId) continue;
      if (!nodeIds.has(e.fromId) || !nodeIds.has(e.toId)) continue;
      const rt = e.relationType && e.relationType in RELATION_COLORS ? e.relationType as RelationType : undefined;
      cleanEdges.push({
        id: e.id || `${e.fromId}:${e.toId}:${e.relationType || 'edge'}`,
        fromId: e.fromId,
        toId: e.toId,
        relationType: rt,
        crossChapter: false,
      });
    }

    // 章节 key 与度数
    const chapterKeyOf = (n: GalaxyRawNode) => n.chapter?.id || n.chapterId || 'uncategorized';
    const degreeById = new Map<string, number>();
    for (const e of cleanEdges) {
      degreeById.set(e.fromId, (degreeById.get(e.fromId) || 0) + 1);
      degreeById.set(e.toId, (degreeById.get(e.toId) || 0) + 1);
    }
    const rawById = new Map(uniqueNodes.map((n) => [n.id, n]));
    for (const e of cleanEdges) {
      const a = rawById.get(e.fromId);
      const b = rawById.get(e.toId);
      if (a && b) e.crossChapter = chapterKeyOf(a) !== chapterKeyOf(b);
    }

    // 布局
    const layout = computeGalaxyLayout(
      uniqueNodes.map((n) => ({ id: n.id, chapterKey: chapterKeyOf(n), degree: degreeById.get(n.id) || 0 })),
      cleanEdges.map((e) => ({
        fromId: e.fromId,
        toId: e.toId,
        sameChapter: !e.crossChapter,
      })),
    );
    this.sceneRadius = layout.sceneRadius;

    // 推荐点亮：自身未掌握，且没有前置负担（无 prerequisite 边的入门节点）
    // 或前置已全部掌握 —— 优先推荐连接多的枢纽，引导孩子顺藤摸瓜
    const masteryById = new Map(uniqueNodes.map((n) => [n.id, Math.max(0, Math.min(100, n.masteryLevel ?? 0))]));
    const prereqSources = new Map<string, string[]>();
    for (const e of cleanEdges) {
      if (e.relationType !== 'prerequisite') continue;
      const list = prereqSources.get(e.toId);
      if (list) list.push(e.fromId);
      else prereqSources.set(e.toId, [e.fromId]);
    }
    const suggestedIds = uniqueNodes
      .filter((n) => {
        const m = masteryById.get(n.id)!;
        if (m >= MASTERED_THRESHOLD) return false;
        const pres = prereqSources.get(n.id);
        if (!pres || pres.length === 0) return (degreeById.get(n.id) || 0) > 0;
        return pres.every((pid) => (masteryById.get(pid) || 0) >= MASTERED_THRESHOLD);
      })
      .sort((a, b) => (degreeById.get(b.id) || 0) - (degreeById.get(a.id) || 0))
      .slice(0, 6)
      .map((n) => n.id);
    const suggestedSet = new Set(suggestedIds);

    // 重建场景图（跳过共享资源，只释放上一轮的独有资源）
    if (this.graphGroup) {
      this.scene.remove(this.graphGroup);
      disposeGraphObject(this.graphGroup, this.sharedResources());
    }
    this.graphGroup = new THREE.Group();
    this.scene.add(this.graphGroup);
    this.nodes = [];
    this.edges = cleanEdges;
    this.nodeById.clear();
    this.pickMeshes = [];
    this.baseLines = null;
    this.highlightLines = null;

    const chapterTitleByKey = new Map<string, string>();
    for (const n of uniqueNodes) {
      const key = chapterKeyOf(n);
      if (!chapterTitleByKey.has(key)) chapterTitleByKey.set(key, n.chapter?.title || '未分组知识');
    }

    const showAllLabels = uniqueNodes.length <= 200;
    const labelCut = uniqueNodes
      .slice()
      .sort((a, b) => (degreeById.get(b.id) || 0) - (degreeById.get(a.id) || 0))
      .slice(0, 140)
      .map((n) => n.id);
    const labelAllow = new Set(showAllLabels ? uniqueNodes.map((n) => n.id) : labelCut);

    for (const raw of uniqueNodes) {
      const posArr = layout.positions.get(raw.id) || [0, 0, 0];
      const pos = new THREE.Vector3(posArr[0], posArr[1], posArr[2]);
      const mastery = masteryById.get(raw.id)!;
      const bucket = bucketOf(mastery);
      const degree = degreeById.get(raw.id) || 0;
      const radius = 0.34 + Math.min(degree, 8) * 0.05 + (suggestedSet.has(raw.id) ? 0.06 : 0);

      const mesh = new THREE.Mesh(this.sphereGeo, this.bucketMats[bucket]);
      mesh.position.copy(pos);
      mesh.scale.setScalar(radius);
      mesh.userData.nodeId = raw.id;
      this.graphGroup.add(mesh);

      // 隐形拾取代理（比可见星球大，触屏/远距更好点；visible=false 仍参与 raycast）
      const picker = new THREE.Mesh(this.sphereGeo, this.dimMat);
      picker.position.copy(pos);
      picker.scale.setScalar(radius * 1.9 + 0.2);
      picker.visible = false;
      picker.userData.nodeId = raw.id;
      this.graphGroup.add(picker);
      this.pickMeshes.push(picker);

      const glow = new THREE.Sprite(this.glowMats[bucket]);
      glow.position.copy(pos);
      glow.scale.setScalar(radius * 4.2);
      this.graphGroup.add(glow);

      let ring: THREE.Mesh | null = null;
      if (suggestedSet.has(raw.id)) {
        ring = new THREE.Mesh(
          new THREE.TorusGeometry(radius + 0.2, 0.035, 8, 42),
          new THREE.MeshBasicMaterial({ color: '#fde047', transparent: true, opacity: 0.85, depthWrite: false }),
        );
        ring.position.copy(pos);
        ring.rotation.x = Math.PI / 2;
        this.graphGroup.add(ring);
      }

      if (labelAllow.has(raw.id) || suggestedSet.has(raw.id)) {
        const label = makeLabel(truncate(raw.title || '未命名', 14), {
          bg: 'rgba(15,23,42,0.85)', color: '#e2e8f0', scale: 0.62, fontSize: 40,
        });
        label.position.copy(pos).add(new THREE.Vector3(0, radius + 0.52, 0));
        this.graphGroup.add(label);
      }

      const node: GraphNode = {
        id: raw.id,
        title: raw.title || '未命名',
        chapterKey: chapterKeyOf(raw),
        mastery,
        degree,
        bucket,
        suggested: suggestedSet.has(raw.id),
        mesh, glow, ring, pos, radius,
      };
      this.nodes.push(node);
      this.nodeById.set(raw.id, node);
    }

    // 章节名牌 + 底盘光圈
    for (const anchor of layout.anchors) {
      const title = chapterTitleByKey.get(anchor.key) || '未分组知识';
      const count = this.nodes.filter((n) => n.chapterKey === anchor.key).length;
      const label = makeLabel(`✦ ${truncate(title, 12)} · ${count}`, {
        bg: 'rgba(30,41,59,0.92)', color: '#93c5fd', scale: 0.95, fontSize: 42,
      });
      label.position.set(anchor.x, 2.4, anchor.z);
      this.graphGroup.add(label);

      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(anchor.radius * 0.9, 48),
        new THREE.MeshBasicMaterial({ color: '#3b82f6', transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide }),
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(anchor.x, -1.9, anchor.z);
      this.graphGroup.add(disc);
    }

    // 箭头锥池（高亮边用）
    this.conePool = [];
    for (let i = 0; i < 24; i++) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.09, 0.3, 10),
        new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false }),
      );
      cone.visible = false;
      this.graphGroup.add(cone);
      this.conePool.push(cone);
    }

    this.rebuildBaseLines();
    this.refreshHighlight();
    this.fitCamera(true);

    const mastered = uniqueNodes.filter((n) => (masteryById.get(n.id) || 0) >= MASTERED_THRESHOLD).length;
    this.callbacks.onStatsChange?.({ total: uniqueNodes.length, mastered, suggested: suggestedIds });
  }

  setRelationFilter(type: string): void {
    this.relationFilter = type;
    if (this.disposed) return;
    this.rebuildBaseLines();
    this.refreshHighlight();
  }

  setCrossChapter(enabled: boolean): void {
    this.crossChapter = enabled;
    if (this.disposed) return;
    this.rebuildBaseLines();
    this.refreshHighlight();
  }

  // --------------------------------------------------------------- camera

  private fitCamera(immediate: boolean): void {
    const r = Math.max(this.sceneRadius, 5);
    const dist = Math.min(Math.max(r * 2.1, 10), 220);
    const dir = new THREE.Vector3(0.32, 0.52, 1).normalize();
    this.homeTarget.set(0, 0, 0);
    this.homePos.copy(dir).multiplyScalar(dist);
    if (immediate) {
      this.camera.position.copy(this.homePos);
      this.controls.target.copy(this.homeTarget);
      this.controls.update();
      this.desiredCamPos = null;
      this.desiredTarget = null;
    } else {
      this.desiredCamPos = this.homePos.clone();
      this.desiredTarget = this.homeTarget.clone();
    }
  }

  resetView(): void {
    this.focusId = null;
    this.refreshHighlight();
    this.callbacks.onFocusChange?.(null);
    this.fitCamera(false);
  }

  focusNode(id: string | null): void {
    if (id && !this.nodeById.has(id)) return;
    this.focusId = id;
    if (id) {
      const node = this.nodeById.get(id)!;
      const dir = new THREE.Vector3().subVectors(this.camera.position, node.pos);
      if (dir.lengthSq() < 0.01) dir.set(0.4, 0.5, 1);
      dir.normalize();
      const dist = Math.max(node.radius * 5 + 4.2, 6.5);
      this.desiredTarget = node.pos.clone();
      this.desiredCamPos = node.pos.clone().addScaledVector(dir, dist);
      this.controls.autoRotate = false;
      if (this.idleTimer) clearTimeout(this.idleTimer);
    } else {
      this.fitCamera(false);
      this.controls.autoRotate = true;
    }
    this.refreshHighlight();
    this.callbacks.onFocusChange?.(id);
  }

  // -------------------------------------------------------------- highlight

  private visibleEdges(): GraphEdge[] {
    if (!this.relationFilter) return this.edges;
    return this.edges.filter((e) => e.relationType === this.relationFilter);
  }

  private rebuildBaseLines(): void {
    if (!this.graphGroup) return;
    if (this.baseLines) {
      this.graphGroup.remove(this.baseLines);
      this.baseLines.geometry.dispose();
      (this.baseLines.material as THREE.Material).dispose();
      this.baseLines = null;
    }
    const edges = this.visibleEdges();
    if (edges.length === 0) return;
    const positions = new Float32Array(edges.length * 6);
    const colors = new Float32Array(edges.length * 6);
    edges.forEach((e, i) => {
      const a = this.nodeById.get(e.fromId);
      const b = this.nodeById.get(e.toId);
      if (!a || !b) return;
      positions.set([a.pos.x, a.pos.y, a.pos.z, b.pos.x, b.pos.y, b.pos.z], i * 6);
      const bothMastered = a.mastery >= MASTERED_THRESHOLD && b.mastery >= MASTERED_THRESHOLD;
      const oneMastered = a.mastery >= MASTERED_THRESHOLD || b.mastery >= MASTERED_THRESHOLD;
      const bright = this.crossChapter && e.crossChapter ? 1.15 : bothMastered ? 0.95 : oneMastered ? 0.6 : 0.34;
      const c = (this.crossChapter && e.crossChapter ? new THREE.Color(CROSS_CHAPTER_COLOR) : relationColor(e.relationType))
        .multiplyScalar(bright);
      colors.set([c.r, c.g, c.b, c.r, c.g, c.b], i * 6);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.baseLines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false,
    }));
    this.graphGroup.add(this.baseLines);
  }

  /** 高亮：悬停/聚焦节点 + 一度邻居；相关边加粗加亮 + 方向箭头 */
  private refreshHighlight(): void {
    if (!this.graphGroup) return;
    const activeId = this.focusId || this.hoveredId;
    const focusing = !!this.focusId;

    // 节点材质
    if (!activeId) {
      for (const n of this.nodes) {
        n.mesh.material = this.bucketMats[n.bucket];
        n.glow.material = this.glowMats[n.bucket];
        // 取消聚焦/悬停后必须恢复辉光可见（聚焦分支把它隐藏过）
        n.glow.visible = true;
      }
    } else {
      const neighborIds = new Set<string>([activeId]);
      for (const e of this.visibleEdges()) {
        if (e.fromId === activeId) neighborIds.add(e.toId);
        if (e.toId === activeId) neighborIds.add(e.fromId);
      }
      for (const n of this.nodes) {
        if (n.id === activeId || neighborIds.has(n.id)) {
          n.mesh.material = this.bucketHiMats[n.bucket];
          n.glow.material = this.glowMats[n.bucket];
          // 高亮节点必须恢复 glow 可见（聚焦分支会把非聚焦节点的 glow 隐藏）
          n.glow.visible = true;
        } else if (focusing) {
          n.mesh.material = this.dimMat;
          // 聚焦时辉光也要调暗：AdditiveBlending 的 glow 仍全亮会让
          // 非聚焦节点在视觉上几乎无差别，聚焦对比度失效
          n.glow.visible = false;
        } else {
          n.mesh.material = this.bucketMats[n.bucket];
          n.glow.material = this.glowMats[n.bucket];
          n.glow.visible = true;
        }
      }
    }

    // 高亮边
    if (this.highlightLines) {
      this.graphGroup.remove(this.highlightLines);
      this.highlightLines.geometry.dispose();
      (this.highlightLines.material as THREE.Material).dispose();
      this.highlightLines = null;
    }
    this.conePool.forEach((c) => { c.visible = false; });
    if (!activeId) return;

    const touching = this.visibleEdges().filter((e) => e.fromId === activeId || e.toId === activeId);
    if (touching.length === 0) return;
    const positions = new Float32Array(touching.length * 6);
    const colors = new Float32Array(touching.length * 6);
    const up = new THREE.Vector3(0, 1, 0);
    touching.forEach((e, i) => {
      const a = this.nodeById.get(e.fromId)!;
      const b = this.nodeById.get(e.toId)!;
      const dir = new THREE.Vector3().subVectors(b.pos, a.pos).normalize();
      const start = a.pos.clone().addScaledVector(dir, a.radius * 1.05);
      const end = b.pos.clone().addScaledVector(dir, -b.radius * 1.05);
      positions.set([start.x, start.y, start.z, end.x, end.y, end.z], i * 6);
      const c = this.crossChapter && e.crossChapter ? new THREE.Color(CROSS_CHAPTER_COLOR) : relationColor(e.relationType);
      c.multiplyScalar(1.2);
      colors.set([c.r, c.g, c.b, c.r, c.g, c.b], i * 6);
      // 方向箭头（指向 to 端，锥池有限，超出就跳过）
      if (i < this.conePool.length) {
        const cone = this.conePool[i];
        cone.visible = true;
        (cone.material as THREE.MeshBasicMaterial).color.copy(c);
        cone.position.copy(start).lerp(end, 0.72);
        cone.quaternion.setFromUnitVectors(up, dir);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.highlightLines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 1, depthWrite: false,
    }));
    this.graphGroup.add(this.highlightLines);
  }

  // ---------------------------------------------------------------- events

  private handleInteract = () => {
    this.controls.autoRotate = false;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (!this.focusId && !this.disposed) this.controls.autoRotate = true;
    }, 8000);
  };

  private handlePointerMove = (ev: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -((ev.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.pointerClient = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    this.pointerDirty = true;
  };

  private handlePointerDown = (ev: PointerEvent) => {
    this.downInfo = { x: ev.clientX, y: ev.clientY, t: performance.now() };
  };

  private handlePointerUp = (ev: PointerEvent) => {
    if (!this.downInfo) return;
    const dx = ev.clientX - this.downInfo.x;
    const dy = ev.clientY - this.downInfo.y;
    const dt = performance.now() - this.downInfo.t;
    this.downInfo = null;
    if (dx * dx + dy * dy > 36 || dt > 450) return; // 拖拽不算点击
    // 触屏常没有 pointermove：先用抬起坐标同步做一次拾取
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -((ev.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.pointerClient = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    this.pick();
    if (this.hoveredId) this.focusNode(this.hoveredId);
    else if (this.focusId) this.focusNode(null);
  };

  private handlePointerLeave = () => {
    this.pointerDirty = false;
    if (this.hoveredId) {
      this.hoveredId = null;
      this.container.style.cursor = '';
      this.callbacks.onHover?.(null);
      this.refreshHighlight();
    }
  };

  private pick(): void {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickMeshes, false);
    const id = hits.length > 0 ? (hits[0].object.userData.nodeId as string) : null;
    if (id !== this.hoveredId) {
      this.hoveredId = id;
      this.container.style.cursor = id ? 'pointer' : '';
      this.callbacks.onHover?.(id ? { id, x: this.pointerClient.x, y: this.pointerClient.y } : null);
      this.refreshHighlight();
    } else if (id) {
      this.callbacks.onHover?.({ id, x: this.pointerClient.x, y: this.pointerClient.y });
    }
  }

  // ------------------------------------------------------------------ loop

  private resize(): void {
    const w = Math.max(this.container.clientWidth, 1);
    const h = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private tick = (time: number) => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.tick);
    const dt = Math.min((time - this.lastTime) / 1000 || 0.016, 0.05);
    this.lastTime = time;
    this.elapsed += dt;

    if (this.pointerDirty) {
      this.pointerDirty = false;
      this.pick();
    }

    // 相机聚焦/复位阻尼
    if (this.desiredCamPos && this.desiredTarget) {
      const lambda = 3.2;
      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, this.desiredCamPos.x, lambda, dt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, this.desiredCamPos.y, lambda, dt);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, this.desiredCamPos.z, lambda, dt);
      this.controls.target.x = THREE.MathUtils.damp(this.controls.target.x, this.desiredTarget.x, lambda, dt);
      this.controls.target.y = THREE.MathUtils.damp(this.controls.target.y, this.desiredTarget.y, lambda, dt);
      this.controls.target.z = THREE.MathUtils.damp(this.controls.target.z, this.desiredTarget.z, lambda, dt);
      if (this.camera.position.distanceTo(this.desiredCamPos) < 0.05) {
        this.desiredCamPos = null;
        this.desiredTarget = null;
      }
    }

    // 推荐点亮：金色光环脉动
    for (const n of this.nodes) {
      if (!n.ring) continue;
      const phase = this.elapsed * 3 + n.pos.x;
      (n.ring.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.35 * Math.sin(phase);
      const s = 1 + 0.1 * Math.sin(phase);
      n.ring.scale.setScalar(s);
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  private sharedResources(): Set<object> {
    return new Set<object>([
      this.sphereGeo, this.glowTex, this.dimMat,
      ...this.bucketMats, ...this.bucketHiMats, ...this.glowMats,
    ]);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.resizeObserver.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener('pointermove', this.handlePointerMove);
    el.removeEventListener('pointerdown', this.handlePointerDown);
    el.removeEventListener('pointerup', this.handlePointerUp);
    el.removeEventListener('pointerleave', this.handlePointerLeave);
    this.controls.removeEventListener('start', this.handleInteract);
    this.controls.dispose();
    disposeGraphObject(this.scene, this.sharedResources());
    this.sphereGeo.dispose();
    this.glowTex.dispose();
    this.bucketMats.forEach((m) => m.dispose());
    this.bucketHiMats.forEach((m) => m.dispose());
    this.glowMats.forEach((m) => m.dispose());
    this.dimMat.dispose();
    this.renderer.dispose();
    el.parentElement?.removeChild(el);
  }
}
