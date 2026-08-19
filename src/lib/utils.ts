import { type ClassValue, clsx } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

// ========== JSON sanitization for LLM responses ==========

/**
 * Sanitize a raw LLM response before JSON.parse.
 * Handles three common LLM output issues:
 * 1. Strips markdown code fences (```json ... ```)
 * 2. Extracts the outermost JSON object/array (ignores extraneous prose)
 * 3. Escapes control characters that would break JSON.parse
 */
export function sanitizeJsonString(raw: string): string {
  let cleaned = raw;

  // Strip markdown code fences
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/gim, '').replace(/\n?```\s*$/gim, '');
  cleaned = cleaned.replace(/```(?:json)?\s*\n?/gi, '');

  // Extract the outermost JSON object or array (handles LLMs that add prose before/after)
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  let startIdx = -1;

  if (firstBrace === -1 && firstBracket === -1) {
    // No JSON structure found; proceed with cleaned string as-is
  } else if (firstBrace === -1) {
    startIdx = firstBracket;
  } else if (firstBracket === -1) {
    startIdx = firstBrace;
  } else {
    startIdx = Math.min(firstBrace, firstBracket);
  }

  if (startIdx !== -1) {
    const isObject = cleaned[startIdx] === '{';
    const openChar = isObject ? '{' : '[';
    const closeChar = isObject ? '}' : ']';

    let depth = 0;
    let endIdx = -1;
    // 跟踪字符串字面量与 \ 转义状态：字符串内容里的花括号不参与配对，
    // 否则会提前截断（参考 tts-client.ts 的 parseConcatenatedJson）
    let inString = false;
    let escaped = false;
    for (let i = startIdx; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === openChar) {
        depth++;
      } else if (ch === closeChar) {
        depth--;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }

    if (endIdx !== -1) {
      cleaned = cleaned.slice(startIdx, endIdx + 1);
    }
  }

  // 转义字符串字面量内的控制字符。JSON 字符串里不允许出现原始 \n \r \t 等
  // 控制字符；字符串外只保留合法空白，其余控制字符直接丢弃。
  // 旧实现的字符类 [\x00-\x08\x0B\x0C\x0E-\x1F] 恰好排除了 \t\n\r，
  // 导致转义分支永远不可达（死代码），LLM 输出的字符串值带原始换行就
  // 整个 JSON.parse 失败。
  let out = '';
  let inString = false;
  let escaped = false;
  const VALID_ESCAPES = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u']);
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (inString && ch === '\\') {
      const next = cleaned[i + 1];
      // LLM 常在字符串里直接写 LaTeX（\frac \dfrac \pi …），而 JSON 只认
      // \" \\ \/ \b \f \n \r \t \uXXXX 这些转义。非法转义把反斜杠自身
      // 再转义一次（\d → \\d），保住 LaTeX 文本且 JSON 合法。
      if (next !== undefined && !VALID_ESCAPES.has(next)) {
        out += '\\\\';
        continue; // next 字符下轮按普通字符处理
      }
      // \u 后必须跟 4 个十六进制，否则同样属于非法转义
      if (next === 'u') {
        const hex = cleaned.slice(i + 2, i + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
          out += '\\\\';
          continue;
        }
      }
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      out += ch;
      continue;
    }
    const code = ch.charCodeAt(0);
    if (inString) {
      if (code < 0x20 || code === 0x7f) {
        if (ch === '\n') out += '\\n';
        else if (ch === '\r') out += '\\r';
        else if (ch === '\t') out += '\\t';
        else if (ch === '\b') out += '\\b';
        else if (ch === '\f') out += '\\f';
        else out += '\\u' + ('000' + code.toString(16)).slice(-4);
        continue;
      }
      out += ch;
      continue;
    }
    // 字符串外：丢弃非法控制字符（JSON 合法空白是空格/\t/\n/\r）
    if ((code < 0x20 && ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') || code === 0x7f) {
      continue;
    }
    out += ch;
  }

  return out.trim();
}

export function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function formatDateTime(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getMasteryColor(level: number): string {
  if (level >= 90) return 'bg-green-500';
  if (level >= 80) return 'bg-lime-500';
  if (level >= 60) return 'bg-yellow-500';
  if (level >= 40) return 'bg-orange-500';
  return 'bg-red-500';
}

export function getMasteryLabel(level: number): string {
  if (level >= 90) return '精通';
  if (level >= 80) return '熟练';
  if (level >= 60) return '一般';
  if (level >= 40) return '薄弱';
  return '未掌握';
}

export function getDifficultyLabel(level: number): string {
  const labels: Record<number, string> = {
    1: '★☆☆☆☆',
    2: '★★☆☆☆',
    3: '★★★☆☆',
    4: '★★★★☆',
    5: '★★★★★',
  };
  return labels[level] || '★★★☆☆';
}
