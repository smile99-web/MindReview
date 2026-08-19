// ---------------------------------------------------------------------------
// 年级学期标签工具 — 思维导图"学习路径"按年级推荐学习顺序用。
// KnowledgeNode.gradeLevel 原始值不统一（"九年级上"/"初三上"/"初三"…），
// 这里归一化到 canonical 标签并给出排序权重。
// ---------------------------------------------------------------------------

export const GRADE_ORDER = [
  '七年级上',
  '七年级下',
  '八年级上',
  '八年级下',
  '九年级上',
  '九年级下',
  '高一',
  '高二',
  '高三',
  '其他',
] as const;

export const GRADE_ICONS: Record<string, string> = {
  七年级上: '📘',
  七年级下: '📗',
  八年级上: '📙',
  八年级下: '📕',
  九年级上: '📓',
  九年级下: '📒',
  高一: '📔',
  高二: '📓',
  高三: '📒',
  其他: '📂',
};

/** 常见别名 → canonical 标签 */
const GRADE_ALIASES: Record<string, string> = {
  初一上: '七年级上',
  初一下: '七年级下',
  初二上: '八年级上',
  初二下: '八年级下',
  初三上: '九年级上',
  初三下: '九年级下',
  初三: '九年级上',
  初一: '七年级上',
  初二: '八年级上',
  七年级: '七年级上',
  八年级: '八年级上',
  九年级: '九年级上',
  '7上': '七年级上',
  '7下': '七年级下',
  '8上': '八年级上',
  '8下': '八年级下',
  '9上': '九年级上',
  '9下': '九年级下',
};

/**
 * 归一化年级标签；识别不了的返回 null（调用方自行落到"其他"组）。
 * 容忍首尾空白与"学期"后缀（"九年级上学期"）。
 */
export function normalizeGradeLevel(raw?: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim().replace(/学期$/, '');
  if (!s) return null;
  if ((GRADE_ORDER as readonly string[]).includes(s)) return s === '其他' ? null : s;
  if (GRADE_ALIASES[s]) return GRADE_ALIASES[s];
  return null;
}

/** 排序权重：未知标签排在已知之后（与"其他"同级） */
export function gradeSortIndex(label: string): number {
  const i = (GRADE_ORDER as readonly string[]).indexOf(label);
  if (i >= 0) return i;
  return GRADE_ORDER.length - 1; // 与"其他"同级
}

const CN_NUM: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  十一: 11, 十二: 12, 十三: 13, 十四: 14, 十五: 15, 十六: 16, 十七: 17,
  十八: 18, 十九: 19, 二十: 20, 二十一: 21, 二十二: 22, 二十三: 23,
  二十四: 24, 二十五: 25, 二十六: 26, 二十七: 27, 二十八: 28, 二十九: 29,
  三十: 30,
};

/** 从章节标题解析"第X章/第X单元"序号（支持中文与阿拉伯数字），解析不到返回 0 */
export function chapterNumberFromTitle(title: string): number {
  // (?:章|单元)：字符类 [章单元] 会误匹配"第3单"这种残缺标题
  const m = title.match(/第\s*([一二三四五六七八九十百0-9]+)\s*(?:章|单元)/);
  if (!m) return 0;
  const token = m[1];
  const n = parseInt(token, 10);
  if (!Number.isNaN(n)) return n;
  // 处理"百"：CN_NUM 无映射时"第一百章"会静默得 0。支持 一百X / X百X
  if (token.includes('百')) {
    const [left, right] = token.split('百');
    const hundreds = left === '' ? 1 : (CN_NUM[left] ?? NaN);
    const rest = right === '' ? 0 : (CN_NUM[right] ?? NaN);
    if (Number.isFinite(hundreds) && Number.isFinite(rest)) {
      return hundreds * 100 + rest;
    }
    return 0;
  }
  return CN_NUM[token] ?? 0;
}

/**
 * 章节序号 → 年级启发式（与 subjects/[id] 页一致：
 * 1-6→八上，7-12→八下，13-18→九上，19-24→九下，25+→高中）。
 * 仅当没有任何 gradeLevel 标注时兜底用。
 */
export function inferGradeFromChapterTitle(title: string): string | null {
  const n = chapterNumberFromTitle(title);
  if (n >= 1 && n <= 6) return '八年级上';
  if (n >= 7 && n <= 12) return '八年级下';
  if (n >= 13 && n <= 18) return '九年级上';
  if (n >= 19 && n <= 24) return '九年级下';
  if (n >= 25) return '高一';
  return null;
}
