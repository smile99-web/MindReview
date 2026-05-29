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
              result.push({ type: 'text', content: inlineParts[j], key: key++ });
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
