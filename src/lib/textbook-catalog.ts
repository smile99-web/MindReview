// ---------------------------------------------------------------------------
// 人教版教材目录（已人工核验）— 唯一真实来源：data/textbook-catalog.json
//
// 背景：教材生成功能早期让 LLM 直接"回忆"人教版章节目录与知识点，
// 产出过编造内容（单元名虚构、每章固定 4 个知识点、化学出现在八年级等）。
// 现在章节与知识点（= 教材实际单元/章/课/节标题）只来自这份经核验的
// 目录文件，LLM 不再参与结构生成。data/textbook-catalog.json 由
// scripts/rebuild-textbook-content.mjs 与两个 textbook 路由共用。
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs';
import path from 'path';

export interface CatalogChapter {
  title: string;
  /** 该章/单元下教材实际印刷的课/节/课题标题（照抄目录原文） */
  sections: string[];
}
export interface CatalogVolume {
  /** 版本说明，如 "2024秋新版（2022课标）" / "2013审定旧版（新版尚未发行）" */
  edition: string;
  sources: string[];
  chapters: CatalogChapter[];
  notes?: string;
}
/** subject -> gradeLevel("七年级上"…) -> volume */
export type TextbookCatalog = Record<string, Record<string, CatalogVolume>>;

let cache: TextbookCatalog | null = null;

export function loadTextbookCatalog(): TextbookCatalog {
  if (cache) return cache;
  const file = path.join(process.cwd(), 'data', 'textbook-catalog.json');
  const raw = JSON.parse(readFileSync(file, 'utf8')) as { subjects?: TextbookCatalog } | TextbookCatalog;
  // 文件带 {version, subjects} 包装；兼容裸 subjects 映射
  cache = ('subjects' in raw ? raw.subjects : raw) as TextbookCatalog;
  return cache;
}

/** 各科在人教版初中阶段实际开设的学期（学科开设矩阵） */
export const SUBJECT_GRADE_LEVELS: Record<string, string[]> = {
  语文: ['七年级上', '七年级下', '八年级上', '八年级下', '九年级上', '九年级下'],
  数学: ['七年级上', '七年级下', '八年级上', '八年级下', '九年级上', '九年级下'],
  历史: ['七年级上', '七年级下', '八年级上', '八年级下', '九年级上', '九年级下'],
  道法: ['七年级上', '七年级下', '八年级上', '八年级下', '九年级上', '九年级下'],
  // 物理八年级才开课
  物理: ['八年级上', '八年级下', '九年级上', '九年级下'],
  // 化学九年级才开课
  化学: ['九年级上', '九年级下'],
  // 生物、地理八年级结束（会考）
  生物: ['七年级上', '七年级下', '八年级上', '八年级下'],
  地理: ['七年级上', '七年级下', '八年级上', '八年级下'],
};

const GRADE_NAME: Record<string, string> = { 初一: '七年级', 初二: '八年级', 初三: '九年级' };

/**
 * UI 的 grade+volume（如 初二/上册）→ gradeLevel 标签列表。
 * 全册 → 上下两个标签；高中不在目录收录范围 → null。
 */
export function gradeVolumeToLevels(grade: string, volume: string): string[] | null {
  const base = GRADE_NAME[grade];
  if (!base) return null;
  if (volume === '上册') return [`${base}上`];
  if (volume === '下册') return [`${base}下`];
  if (volume === '全册') return [`${base}上`, `${base}下`];
  return null;
}

/** 该学科实际开设的学期里，gradeLevels 中哪些有效；全部无效时返回空数组 */
export function filterValidLevels(subject: string, levels: string[]): string[] {
  const valid = SUBJECT_GRADE_LEVELS[subject] || [];
  return levels.filter((l) => valid.includes(l));
}

export interface CatalogLookup {
  volumes: { gradeLevel: string; volume: CatalogVolume }[];
  missing: string[];
}

/** 按学科 + gradeLevel 列表查目录；缺失的册列入 missing */
export function lookupVolumes(subject: string, levels: string[]): CatalogLookup {
  const catalog = loadTextbookCatalog();
  const byGrade = catalog[subject] || {};
  const volumes: CatalogLookup['volumes'] = [];
  const missing: string[] = [];
  for (const level of levels) {
    const v = byGrade[level];
    if (v) volumes.push({ gradeLevel: level, volume: v });
    else missing.push(level);
  }
  return { volumes, missing };
}
