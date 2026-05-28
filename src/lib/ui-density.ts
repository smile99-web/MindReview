/**
 * Adaptive UI density based on cognitive load assessment.
 *
 * Maps a student's cognitive load level (1-5) to UI density presets
 * that control how much information is displayed at once.
 */

export type DensityLevel = 'sparse' | 'comfortable' | 'compact';

/**
 * Map cognitive load 1-5 to a UI density level.
 *
 * Low load (1-2) → compact — student is handling material well, show more info.
 * Medium load (3) → comfortable — normal information density.
 * High load (4-5) → sparse — student is struggling, reduce cognitive burden.
 */
export function getDensityLevel(cognitiveLoad: number): DensityLevel {
  if (cognitiveLoad <= 2) return 'compact';
  if (cognitiveLoad === 3) return 'comfortable';
  return 'sparse';
}

/**
 * How many items (tasks, questions, cards) to show at once for a given load.
 */
export function getInfoChunkSize(cognitiveLoad: number): number {
  if (cognitiveLoad <= 2) return 8;   // compact — show many
  if (cognitiveLoad === 3) return 5;  // comfortable — normal
  return 3;                            // sparse — show few
}

/**
 * How detailed explanations should be for a given load.
 *
 * High load → brief (concise, essential only).
 * Normal → normal.
 * Low load → detailed (with examples and elaboration).
 */
export function getExplanationLength(cognitiveLoad: number): 'brief' | 'normal' | 'detailed' {
  if (cognitiveLoad <= 2) return 'detailed';
  if (cognitiveLoad === 3) return 'normal';
  return 'brief';
}

/**
 * Split long content into a visible chunk and a hidden chunk
 * based on the student's current cognitive load.
 *
 * Higher load → shorter visible portion, more hidden behind "show more".
 */
const LOAD_CHARS: Record<number, number> = {
  1: 400,
  2: 350,
  3: 250,
  4: 150,
  5: 80,
};

export function progressiveDisclosure(
  content: string,
  cognitiveLoad: number,
): { visible: string; hidden: string } {
  if (!content) return { visible: '', hidden: '' };

  const threshold = LOAD_CHARS[cognitiveLoad] ?? 250;

  if (content.length <= threshold) {
    return { visible: content, hidden: '' };
  }

  // Try to break at a sentence boundary near the threshold.
  const searchEnd = Math.min(threshold + 60, content.length);
  const searchStart = Math.max(threshold - 40, 0);
  const snippet = content.slice(searchStart, searchEnd);

  const breakPoints = [/[。！？\n]/g, /[，；]/g, /[\.\!\?\n]/g, /[,;]/g];

  let breakIndex = -1;
  for (const pattern of breakPoints) {
    let m: RegExpExecArray | null;
    const re = new RegExp(pattern.source, 'g');
    while ((m = re.exec(snippet)) !== null) {
      // Prefer the last break at or before threshold.
      const absIdx = searchStart + m.index;
      if (absIdx > threshold) break;
      breakIndex = absIdx;
    }
    if (breakIndex > 0) break;
  }

  if (breakIndex <= 0) {
    // No natural break — hard split.
    return {
      visible: content.slice(0, threshold) + '…',
      hidden: content.slice(threshold),
    };
  }

  return {
    visible: content.slice(0, breakIndex + 1),
    hidden: content.slice(breakIndex + 1),
  };
}
