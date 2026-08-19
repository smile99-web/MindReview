/**
 * 把 LLM 返回的简答题长 answer 文本拆成"答题要点"列表。
 * 服务端生成 questions 时调用，UI 渲染为 checkbox 风格
 * "应答要点"列表，让"我答的"和"应该答的"逐点对照。
 *
 * 拆分规则（按顺序尝试）：
 *   1. 已有 "1. " / "① " / "• " 之类的列表前缀 — 按行拆
 *   2. 中文分号 "；" 切分
 *   3. 英文分号 ";" 切分
 *   4. 句末标点 "。" + 换行 / 连续句号 切分
 *   5. 兜底：整段单点
 *
 * 限制：最多 6 个要点（短问答太多要点反而难对照）；
 * 每条 ≤ 80 字（超长会截断 + "..."）。
 */
export function splitIntoPoints(answer: string): string[] {
  const text = (answer || '').trim();
  if (!text) return [];

  // Pre-normalize: drop leading "答：" / "答案：" / "参考答案："
  //（ alternation 顺序保证"参考答案"优先匹配；旧正则 `答[案案]?` 匹配不到"参"开头的串 ）
  let norm = text.replace(/^\s*(?:参考答案|答案|答)\s*[：:]?\s*/, '').trim();
  if (!norm) return [];

  let parts: string[] = [];

  // 1. 列表前缀：1. / ① / • / (1) / 一、 等
  const listRe = /^\s*(?:\d+[.、)]\s*|①\s*|②\s*|③\s*|④\s*|⑤\s*|⑥\s*|[•·]\s*|[（(]\d+[）)]\s*|[一二三四五六七八九十]+[、.])\s*/;
  const lines = norm.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const allListLines = lines.length > 1 && lines.every((l) => listRe.test(l));
  if (allListLines) {
    parts = lines.map((l) => l.replace(listRe, '').trim()).filter((l) => l.length > 0);
  }

  // 单行带列表编号（如 "1. 加速度是矢量"）：先剥掉行首编号，
  // 否则下方英文句号切分会把 "1" 切出来变成垃圾要点。
  // 要求编号后紧跟空白，避免误剥 "1.5 倍" 这类小数。
  if (parts.length <= 1 && lines.length === 1) {
    const stripped = lines[0]
      .replace(/^\s*(?:\d+[.、)]\s+|①\s+|②\s+|③\s+|④\s+|⑤\s+|⑥\s+|[•·]\s+|[（(]\d+[）)]\s+|[一二三四五六七八九十]+[、.]\s+)/, '')
      .trim();
    if (stripped) norm = stripped;
  }

  // 2. 分号切分（中英文分号都算；此前只认中文；，英文 ; 不切分）
  if (parts.length <= 1) {
    if (/[；;]/.test(norm)) {
      parts = norm.split(/[；;]+/).map((s) => s.trim()).filter((s) => s.length > 0);
    } else if (norm.includes('.')) {
      // English period, but only if it looks like a sentence boundary
      parts = norm.split(/\.\s+/).map((s) => s.trim()).filter((s) => s.length > 0);
    } else if (norm.includes('。')) {
      // Chinese period: split but keep the period off
      parts = norm.split(/[。]+/).map((s) => s.trim()).filter((s) => s.length > 0);
    }
  }

  // 3. 兜底
  if (parts.length === 0) parts = [norm];

  // 截断 + cap
  return parts.slice(0, 6).map((p) => {
    if (p.length > 80) return p.slice(0, 78) + '…';
    return p;
  });
}
