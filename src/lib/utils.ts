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
    for (let i = startIdx; i < cleaned.length; i++) {
      if (cleaned[i] === openChar) {
        depth++;
      } else if (cleaned[i] === closeChar) {
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

  // Escape control characters (same approach as JSON.stringify replacement)
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, (ch) => {
    if (ch === '\n') return '\\n';
    if (ch === '\r') return '\\r';
    if (ch === '\t') return '\\t';
    if (ch === '\b') return '\\b';
    if (ch === '\f') return '\\f';
    return '\\u' + ('000' + ch.charCodeAt(0).toString(16)).slice(-4);
  });

  return cleaned.trim();
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
