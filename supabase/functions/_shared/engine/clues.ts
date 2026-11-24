/**
 * "מסע האותיות": each of the 8 regular rounds hides one letter of the finale word on the
 * score screens. Letters are dealt to rounds in a scrambled order (never the word's own order,
 * no two neighbouring letters of the word in consecutive rounds), each at an inconspicuous spot,
 * sometimes tilted. The live server does the same in SQL (private.ensure_clues).
 */
export interface Clue { letter: string; spot: number; rot: number }

export const CLUE_SPOTS = 11;
const FINAL_TO_BASE: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

/** Shown letters are always the base form (a final ם would give away the word's end). */
export function baseLetter(c: string) { return FINAL_TO_BASE[c] ?? c; }

export function isScrambled(order: number[]) {
  for (let i = 0; i < order.length; i++) {
    if (order[i] === i) return false;
    if (i > 0 && Math.abs(order[i] - order[i - 1]) === 1) return false;
  }
  return true;
}

export function makeClues(word: string, rand: () => number = Math.random): Clue[] {
  const letters = [...word].filter((c) => /\S/.test(c));
  const n = letters.length;
  let order = letters.map((_, i) => i);
  for (let tries = 0; tries < 5000; tries++) {
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    if (isScrambled(order)) break;
  }
  // Spots: all different, never the same spot twice in a row.
  const spots = Array.from({ length: CLUE_SPOTS }, (_, i) => i);
  for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
  return order.map((k, i) => ({
    letter: baseLetter(letters[k]),
    spot: spots[i % spots.length],
    rot: rand() < 0.45 ? 0 : Math.round((rand() < 0.5 ? -1 : 1) * (8 + rand() * 18)),
  }));
}
