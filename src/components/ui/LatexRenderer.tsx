'use client';

import { useEffect, useRef } from 'react';
import katex from 'katex';

interface LatexRendererProps {
  /** LaTeX string to render (without $ delimiters) */
  latex: string;
  /** Display mode: block (centered, larger) or inline */
  displayMode?: boolean;
  /** Additional CSS class for the wrapper */
  className?: string;
  /** Error fallback: if true, show the raw LaTeX on error instead of an error message */
  showRawOnError?: boolean;
}

export function LatexRenderer({
  latex,
  displayMode = false,
  className = '',
  showRawOnError = false,
}: LatexRendererProps) {
  const containerRef = useRef<HTMLSpanElement | HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    try {
      katex.render(latex, el, {
        displayMode,
        throwOnError: true,
        strict: false,
        trust: false,
      });
    } catch {
      if (showRawOnError) {
        el.textContent = latex;
      }
    }
  }, [latex, displayMode, showRawOnError]);

  if (displayMode) {
    return (
      <div
        ref={containerRef as React.Ref<HTMLDivElement>}
        className={`katex-block-wrapper overflow-x-auto ${className}`}
      />
    );
  }

  return (
    <span
      ref={containerRef as React.Ref<HTMLSpanElement>}
      className={`katex-inline-wrapper ${className}`}
    />
  );
}
