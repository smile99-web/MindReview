// ---------------------------------------------------------------------------
// 3D 实验室 — 场景注册表
// 本文件不 import 任何场景实现（它们依赖 three.js，体积大），
// 只保存轻量元数据 + 动态加载器，保证卡片页等入口不会把 three 打进主包。
// 新增场景时：在 SCENES 与 LOADERS 各加一行，二者 id 必须一致。
// ---------------------------------------------------------------------------
import type { Scene3DDefinition } from './types';

export interface SceneMeta {
  id: string;
  title: string;
  subject: '数学' | '物理' | '化学';
  icon: string;
  tagline: string;
  keywords: string[];
}

export const SCENES: SceneMeta[] = [
  {
    id: 'chem-molecule',
    title: '分子的空间结构',
    subject: '化学',
    icon: '🧪',
    tagline: '水、二氧化碳、甲烷、氨的球棍模型，认识键角与孤对电子',
    keywords: ['分子', '原子', '共价键', '化学键', '键角', '分子结构', '水', '甲烷', '二氧化碳', '氨', '孤对电子'],
  },
  {
    id: 'chem-atom',
    title: '原子结构模型',
    subject: '化学',
    icon: '⚛️',
    tagline: '质子、中子与分层排布的电子，理解最外层电子决定化学性质',
    keywords: ['原子', '原子核', '质子', '中子', '电子', '电子层', '核外电子', '最外层电子', '原子结构', '离子'],
  },
  {
    id: 'chem-diffusion',
    title: '分子热运动与扩散',
    subject: '化学',
    icon: '🌫️',
    tagline: '抽走隔板看两种气体自发混合——分子在不停地做无规则运动',
    keywords: ['分子运动', '扩散', '热运动', '温度', '分子动理论', '微粒', '无规则运动'],
  },
  {
    id: 'chem-nacl',
    title: '氯化钠离子晶体',
    subject: '化学',
    icon: '🧂',
    tagline: '钠离子与氯离子交替排列成立体晶格，遇水为什么会溶解？',
    keywords: ['离子', '离子键', '晶体', '氯化钠', '食盐', '溶解', '钠离子', '氯离子', '晶格', '电解质'],
  },
  {
    id: 'phys-circuit',
    title: '串联电路与电流',
    subject: '物理',
    icon: '🔌',
    tagline: '闭合开关看电子定向移动，电压越大灯泡越亮——欧姆定律',
    keywords: ['电路', '电流', '电压', '电阻', '欧姆定律', '串联', '开关', '电源', '灯泡', '导体'],
  },
  {
    id: 'phys-lever',
    title: '杠杆的平衡条件',
    subject: '物理',
    icon: '⚖️',
    tagline: '调节力和力臂，亲眼看到杠杆平衡或倾倒——F₁L₁ = F₂L₂',
    keywords: ['杠杆', '支点', '力臂', '动力', '阻力', '杠杆平衡', '简单机械', '滑轮', '机械'],
  },
  {
    id: 'phys-light',
    title: '光的反射与折射',
    subject: '物理',
    icon: '🔦',
    tagline: '激光射入水中：反射角等于入射角，折射光线偏向法线',
    keywords: ['光', '反射', '折射', '入射角', '反射角', '折射角', '法线', '全反射', '光的传播', '透镜'],
  },
  {
    id: 'phys-projectile',
    title: '抛体运动',
    subject: '物理',
    icon: '🏀',
    tagline: '发射小球看抛物线：水平方向匀速、竖直方向自由落体的叠加',
    keywords: ['抛体运动', '平抛', '斜抛', '抛物线', '自由落体', '重力', '加速度', '运动合成', '运动的分解', '曲线运动'],
  },
  {
    id: 'math-solids',
    title: '立体几何图形',
    subject: '数学',
    icon: '📦',
    tagline: '正方体展开图动画 + 圆柱、圆锥、球、棱柱的表面积与体积',
    keywords: ['立体几何', '正方体', '长方体', '圆柱', '圆锥', '球', '棱柱', '表面积', '体积', '展开图', '几何体'],
  },
  {
    id: 'math-three-views',
    title: '三视图',
    subject: '数学',
    icon: '👁️',
    tagline: '同一个积木，从正面、左面、上面看各是什么样？',
    keywords: ['三视图', '主视图', '俯视图', '左视图', '视图', '投影', '观察物体', '从不同方向看'],
  },
  {
    id: 'math-pythagoras',
    title: '勾股定理',
    subject: '数学',
    icon: '📐',
    tagline: '直角三角形三边上的正方形：a² + b² 的小方块恰好填满 c²',
    keywords: ['勾股定理', '直角三角形', '斜边', '直角边', '毕达哥拉斯', '平方', '弦图'],
  },
  {
    id: 'math-function-transform',
    title: '函数图像的变换',
    subject: '数学',
    icon: '📈',
    tagline: '拖动 a、h、v，看抛物线如何伸缩与平移——图像变换的规律',
    keywords: ['函数', '函数图像', '二次函数', '抛物线', '平移', '对称', '顶点', '正弦函数', '绝对值', '图像变换'],
  },
];

const LOADERS: Record<string, () => Promise<Scene3DDefinition>> = {
  'chem-molecule': () => import('./scenes/molecule').then((m) => m.moleculeScene),
  'chem-atom': () => import('./scenes/atom').then((m) => m.atomScene),
  'chem-diffusion': () => import('./scenes/diffusion').then((m) => m.diffusionScene),
  'chem-nacl': () => import('./scenes/nacl').then((m) => m.naclScene),
  'phys-circuit': () => import('./scenes/circuit').then((m) => m.circuitScene),
  'phys-lever': () => import('./scenes/lever').then((m) => m.leverScene),
  'phys-light': () => import('./scenes/light').then((m) => m.lightScene),
  'phys-projectile': () => import('./scenes/projectile').then((m) => m.projectileScene),
  'math-solids': () => import('./scenes/solids').then((m) => m.solidsScene),
  'math-three-views': () => import('./scenes/threeViews').then((m) => m.threeViewsScene),
  'math-pythagoras': () => import('./scenes/pythagoras').then((m) => m.pythagorasScene),
  'math-function-transform': () => import('./scenes/functionTransform').then((m) => m.functionScene),
};

export function getSceneMeta(id: string): SceneMeta | undefined {
  return SCENES.find((s) => s.id === id);
}

/** 动态加载完整场景定义（此时才把 three.js 拉进浏览器） */
export async function loadScene(id: string): Promise<Scene3DDefinition | null> {
  const loader = LOADERS[id];
  if (!loader) return null;
  try {
    return await loader();
  } catch {
    return null;
  }
}

/**
 * 按知识点内容匹配场景。
 * title 命中关键词 +3 分/个；keywords 命中 +2 分/个；学科一致 +1。
 * 返回得分 ≥3 的场景，按分数降序，最多 3 个。
 */
export function matchScenes(input: {
  title?: string | null;
  keywords?: string[] | string | null;
  subjectName?: string | null;
}): SceneMeta[] {
  const title = (input.title ?? '').toLowerCase();
  const kwText = (
    Array.isArray(input.keywords) ? input.keywords.join(' ') : (input.keywords ?? '')
  ).toLowerCase();
  const haystack = `${title} ${kwText}`;
  if (!haystack.trim()) return [];

  const scored = SCENES.map((scene) => {
    let score = 0;
    for (const kw of scene.keywords) {
      const k = kw.toLowerCase();
      if (title.includes(k)) score += 3;
      else if (kwText.includes(k)) score += 2;
    }
    if (input.subjectName && scene.subject === input.subjectName) score += 1;
    return { scene, score };
  });
  return scored
    .filter((s) => s.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => s.scene);
}
