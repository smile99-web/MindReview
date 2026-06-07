'use client';

import { Fragment, useMemo } from 'react';
import { LatexRenderer } from './LatexRenderer';

interface LatexTextProps {
  /** Text that may contain inline $...$ and block $$...$$ LaTeX */
  text: string;
  /** Additional class for the wrapper div */
  className?: string;
}

const BLOCK_REGEX = /\$\$([\s\S]*?)\$\$/g;
const INLINE_REGEX = /\$([^$\n]+?)\$/g;

interface Segment {
  type: 'text' | 'display' | 'inline';
  content: string;
  key: number;
}

interface AutoMathPattern {
  regex: RegExp;
  latex: string;
}

const AUTO_MATH_PATTERNS: AutoMathPattern[] = [
  {
    regex:
      /x\s*=\s*\[-b\s*\u00b1\s*\u221a\(\s*b(?:\u00b2|\^2)\s*-\s*4ac\s*\)\s*\]\s*\/\s*\(2a\)/g,
    latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}',
  },
  {
    regex:
      /(?:\u0394|Delta|\\Delta)\s*=\s*b(?:\u00b2|\^2)\s*-\s*4ac\s*\u2265\s*0/g,
    latex: '\\Delta = b^2 - 4ac \\ge 0',
  },
  {
    regex: /ax(?:\u00b2|\^2)\s*\+\s*bx\s*\+\s*c\s*=\s*0/g,
    latex: 'ax^2 + bx + c = 0',
  },
  {
    regex: /a\s*\u2260\s*0/g,
    latex: 'a \\ne 0',
  },
];

function splitAutoMath(text: string, keyStart: number) {
  const matches: Array<{ start: number; end: number; latex: string }> = [];

  for (const pattern of AUTO_MATH_PATTERNS) {
    pattern.regex.lastIndex = 0;
    let match = pattern.regex.exec(text);
    while (match) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        latex: pattern.latex,
      });
      match = pattern.regex.exec(text);
    }
  }

  if (matches.length === 0) {
    return {
      segments: text ? [{ type: 'text' as const, content: text, key: keyStart }] : [],
      nextKey: text ? keyStart + 1 : keyStart,
    };
  }

  const segments: Segment[] = [];
  let key = keyStart;
  let cursor = 0;

  for (const match of matches.sort((a, b) => a.start - b.start || b.end - a.end)) {
    if (match.start < cursor) {
      continue;
    }

    if (match.start > cursor) {
      segments.push({
        type: 'text',
        content: text.slice(cursor, match.start),
        key: key++,
      });
    }

    segments.push({ type: 'inline', content: match.latex, key: key++ });
    cursor = match.end;
  }

  if (cursor < text.length) {
    segments.push({ type: 'text', content: text.slice(cursor), key: key++ });
  }

  return { segments, nextKey: key };
}

export function LatexText({ text, className = '' }: LatexTextProps) {
  const segments = useMemo((): Segment[] => {
    if (!text) return [];

    const result: Segment[] = [];
    let key = 0;

    // First, split by block display math $$...$$
    const blockParts = text.split(BLOCK_REGEX);
    for (let i = 0; i < blockParts.length; i++) {
      if (i % 2 === 0) {
        // Text between block math — further split by inline $...$
        const inlineParts = blockParts[i].split(INLINE_REGEX);
        for (let j = 0; j < inlineParts.length; j++) {
          if (j % 2 === 0) {
            if (inlineParts[j]) {
              const autoMath = splitAutoMath(inlineParts[j], key);
              result.push(...autoMath.segments);
              key = autoMath.nextKey;
            }
          } else {
            result.push({ type: 'inline', content: inlineParts[j], key: key++ });
          }
        }
      } else {
        // Block display math
        result.push({ type: 'display', content: blockParts[i], key: key++ });
      }
    }

    return result;
  }, [text]);

  if (segments.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      {segments.map((seg) => {
        switch (seg.type) {
          case 'display':
            return (
              <LatexRenderer
                key={seg.key}
                latex={seg.content}
                displayMode
                showRawOnError
                className="my-2"
              />
            );
          case 'inline':
            return (
              <LatexRenderer
                key={seg.key}
                latex={seg.content}
                displayMode={false}
                showRawOnError
              />
            );
          default:
            return <Fragment key={seg.key}>{seg.content}</Fragment>;
        }
      })}
    </div>
  );
}
