/**
 * "Three pictures" (task 13): pictures built from controlled SVG layers, never by hand.
 * Each heat lists which features differ and in which picture. For every changed feature,
 * two pictures keep the base value and exactly one gets the alternate value.
 * The answer is computed (the picture with the most deviations) and tested to be unique.
 */
export interface SceneSpec {
  kippah: 'red' | 'blue';
  donuts: 3 | 4;
  window: 'open' | 'closed';
  candles: number;          // lit candles, 0..8
  shamash: boolean;         // shamash lit
  dreidel: 'נ' | 'ג';
  cat: boolean;
  frame: 'gold' | 'green';
  moon: boolean;
}
export type Feature = keyof SceneSpec;

const ALT: { [K in Feature]: (v: SceneSpec[K]) => SceneSpec[K] } = {
  kippah: (v) => (v === 'red' ? 'blue' : 'red'),
  donuts: (v) => (v === 3 ? 4 : 3),
  window: (v) => (v === 'open' ? 'closed' : 'open'),
  candles: (v) => (v === 4 ? 3 : 4),
  shamash: (v) => !v,
  dreidel: (v) => (v === 'נ' ? 'ג' : 'נ'),
  cat: (v) => !v,
  frame: (v) => (v === 'gold' ? 'green' : 'gold'),
  moon: (v) => !v,
};

export const BASE: SceneSpec = { kippah: 'red', donuts: 3, window: 'closed', candles: 4, shamash: true, dreidel: 'נ', cat: true, frame: 'gold', moon: true };

export interface Heat { base: SceneSpec; deviations: Partial<Record<Feature, 0 | 1 | 2>> }

export const HEATS: Heat[] = [
  { base: BASE, deviations: { kippah: 1, donuts: 0, window: 1, candles: 2, cat: 1 } },                       // ב (3)
  { base: { ...BASE, cat: false }, deviations: { donuts: 0, window: 0, dreidel: 2, frame: 0, moon: 1 } },     // א (3)
  { base: { ...BASE, kippah: 'blue', donuts: 4 }, deviations: { kippah: 2, candles: 2, cat: 0, frame: 1, dreidel: 2, window: 0 } }, // ג (3)
];

export function buildPictures(h: Heat): SceneSpec[] {
  return [0, 1, 2].map((i) => {
    const s: SceneSpec = { ...h.base };
    for (const [f, who] of Object.entries(h.deviations) as [Feature, number][]) {
      if (who === i) (s as unknown as Record<string, unknown>)[f] = (ALT[f] as (v: unknown) => unknown)(h.base[f]);
    }
    return s;
  });
}

/** Index (0..2) of the picture with the most deviations; throws if not unique. */
export function heatAnswer(h: Heat): number {
  const counts = [0, 0, 0];
  for (const who of Object.values(h.deviations)) counts[who as number]++;
  const max = Math.max(...counts);
  if (counts.filter((c) => c === max).length !== 1) throw new Error('ambiguous heat');
  return counts.indexOf(max);
}

/** The sliding-puzzle picture: everything lit and festive. */
export const PUZZLE_SCENE: SceneSpec = { kippah: 'blue', donuts: 4, window: 'open', candles: 8, shamash: true, dreidel: 'נ', cat: true, frame: 'gold', moon: true };
