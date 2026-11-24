/**
 * Candle-memory round (task 35): one shared timeline for every device.
 * Everything is computed from the round's server-side opened_at, so phones and the screen
 * show the same stage and the same symbol at the same moment, and a refresh never resets anything.
 * The SQL functions (private.memory_window / public.memory_stage) mirror this arithmetic exactly.
 */
export interface MemoryTiming { intro_ms: number; show_ms: number; recall_ms: number; result_ms: number }
export const DEFAULT_MEMORY_TIMING: MemoryTiming = { intro_ms: 3000, show_ms: 3500, recall_ms: 20000, result_ms: 6000 };

export interface StageWindow { introAt: number; showAt: number; recallAt: number; recallEnd: number; resultEnd: number }

export function memoryWindows(lengths: number[], t: MemoryTiming = DEFAULT_MEMORY_TIMING): StageWindow[] {
  const out: StageWindow[] = [];
  let at = 0;
  for (const len of lengths) {
    const introAt = at, showAt = introAt + t.intro_ms, recallAt = showAt + len * t.show_ms;
    const recallEnd = recallAt + t.recall_ms, resultEnd = recallEnd + t.result_ms;
    out.push({ introAt, showAt, recallAt, recallEnd, resultEnd });
    at = resultEnd;
  }
  return out;
}

export const memoryTotalMs = (lengths: number[], t: MemoryTiming = DEFAULT_MEMORY_TIMING) =>
  memoryWindows(lengths, t).at(-1)?.resultEnd ?? 0;

export type MemoryPhase = 'intro' | 'show' | 'recall' | 'result' | 'done';
export interface MemoryNow { stage: number; phase: MemoryPhase; symbol: number; msLeft: number }

/** Where the shared timeline is `elapsed` ms after the round opened. */
export function memoryNow(lengths: number[], elapsed: number, t: MemoryTiming = DEFAULT_MEMORY_TIMING): MemoryNow {
  const w = memoryWindows(lengths, t);
  for (let k = 0; k < w.length; k++) {
    const s = w[k];
    if (elapsed < s.showAt) return { stage: k, phase: 'intro', symbol: -1, msLeft: s.showAt - elapsed };
    if (elapsed < s.recallAt) {
      const i = Math.floor((elapsed - s.showAt) / t.show_ms);
      return { stage: k, phase: 'show', symbol: i, msLeft: s.showAt + (i + 1) * t.show_ms - elapsed };
    }
    if (elapsed < s.recallEnd) return { stage: k, phase: 'recall', symbol: -1, msLeft: s.recallEnd - elapsed };
    if (elapsed < s.resultEnd) return { stage: k, phase: 'result', symbol: -1, msLeft: s.resultEnd - elapsed };
  }
  return { stage: lengths.length - 1, phase: 'done', symbol: -1, msLeft: 0 };
}

/** Approved scoring: +10 per stage, 25 → 75, total 300. Data-driven via scoring.points_by_stage. */
export const DEFAULT_STAGE_POINTS = [25, 35, 45, 55, 65, 75];
