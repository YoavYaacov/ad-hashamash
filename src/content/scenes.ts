/**
 * "Three pictures" (task 13): pictures built from controlled SVG layers, never by hand.
 * Each heat uses a DIFFERENT scene (room / doughnut kitchen / street at night).
 * For every changed feature, two pictures keep the base value and exactly one gets the alternate.
 * The answer (picture with the most deviations) is computed and tested to be unique.
 */
export interface RoomSpec { type: 'room'; wide?: boolean; kippah: 'red' | 'blue'; donuts: 3 | 4; window: 'open' | 'closed'; candles: number; shamash: boolean; dreidel: 'נ' | 'ג'; cat: boolean; frame: 'gold' | 'green'; moon: boolean }
export interface KitchenSpec { type: 'kitchen'; apron: 'red' | 'green'; hat: boolean; tray: 5 | 6; jam: 'red' | 'purple'; clock: 3 | 9; steam: boolean; bowl: 'blue' | 'yellow' }
export interface StreetSpec { type: 'street'; wcandles: 5 | 6; door: 'red' | 'blue'; lamp: boolean; tree: boolean; dreidel: 'teal' | 'orange'; moon: 'crescent' | 'full'; bike: boolean }
export type SceneSpec = RoomSpec | KitchenSpec | StreetSpec;

type AnyKey = string;
/** Alternate value for each feature (one function per feature name). */
const ALT: Record<AnyKey, (v: any) => any> = { // eslint-disable-line @typescript-eslint/no-explicit-any
  kippah: (v) => (v === 'red' ? 'blue' : 'red'), donuts: (v) => (v === 3 ? 4 : 3), window: (v) => (v === 'open' ? 'closed' : 'open'),
  candles: (v) => (v === 4 ? 3 : 4), shamash: (v) => !v, dreidel: (v) => ({ 'נ': 'ג', 'ג': 'נ', teal: 'orange', orange: 'teal' } as Record<string, string>)[v],
  cat: (v) => !v, frame: (v) => (v === 'gold' ? 'green' : 'gold'), moon: (v) => (typeof v === 'boolean' ? !v : v === 'full' ? 'crescent' : 'full'),
  apron: (v) => (v === 'red' ? 'green' : 'red'), hat: (v) => !v, tray: (v) => (v === 5 ? 6 : 5), jam: (v) => (v === 'red' ? 'purple' : 'red'),
  clock: (v) => (v === 3 ? 9 : 3), steam: (v) => !v, bowl: (v) => (v === 'blue' ? 'yellow' : 'blue'),
  wcandles: (v) => (v === 5 ? 6 : 5), door: (v) => (v === 'red' ? 'blue' : 'red'), lamp: (v) => !v, tree: (v) => !v, bike: (v) => !v,
};

export const ROOM: RoomSpec = { type: 'room', wide: true, kippah: 'red', donuts: 3, window: 'closed', candles: 4, shamash: true, dreidel: 'נ', cat: true, frame: 'gold', moon: true };
export const KITCHEN: KitchenSpec = { type: 'kitchen', apron: 'red', hat: true, tray: 5, jam: 'red', clock: 3, steam: true, bowl: 'blue' };
export const STREET: StreetSpec = { type: 'street', wcandles: 5, door: 'blue', lamp: true, tree: true, dreidel: 'teal', moon: 'crescent', bike: false };

export interface Heat { title: string; base: SceneSpec; deviations: Record<string, 0 | 1 | 2> }

export const HEATS: Heat[] = [
  { title: 'הסלון בערב חנוכה', base: ROOM, deviations: { kippah: 1, donuts: 0, window: 1, candles: 2, cat: 1 } },                       // ב (3)
  { title: 'מטבח הסופגניות', base: KITCHEN, deviations: { apron: 0, tray: 0, hat: 2, clock: 0, steam: 1, bowl: 2 } },                  // א (3)
  { title: 'רחוב בלילה', base: STREET, deviations: { door: 2, wcandles: 2, lamp: 0, tree: 1, dreidel: 2, moon: 0 } },                  // ג (3)
];

export function buildPictures(h: Heat): SceneSpec[] {
  return [0, 1, 2].map((i) => {
    const s = { ...h.base } as Record<string, unknown>;
    for (const [f, who] of Object.entries(h.deviations)) {
      if (who === i) s[f] = ALT[f]((h.base as unknown as Record<string, unknown>)[f]);
    }
    return s as unknown as SceneSpec;
  });
}

/** Index (0..2) of the picture with the most deviations; throws if not unique. */
export function heatAnswer(h: Heat): number {
  const counts = [0, 0, 0];
  for (const who of Object.values(h.deviations)) counts[who]++;
  const max = Math.max(...counts);
  if (counts.filter((c) => c === max).length !== 1) throw new Error('ambiguous heat');
  return counts.indexOf(max);
}

/** The sliding-puzzle picture: the festive living room. */
export const PUZZLE_SCENE: RoomSpec = { type: 'room', kippah: 'blue', donuts: 4, window: 'open', candles: 8, shamash: true, dreidel: 'נ', cat: true, frame: 'gold', moon: true };

/** Where each changeable feature sits in the wide (480×180) scenes — used to circle the changes on the final reveal. */
export interface Mark { x: number; y: number; rx: number; ry: number }
export const HOTSPOTS: Record<string, Record<string, Mark>> = {
  room: {
    kippah: { x: 410, y: 99, rx: 16, ry: 13 }, donuts: { x: 170, y: 103, rx: 40, ry: 17 }, window: { x: 422, y: 52, rx: 50, ry: 46 },
    candles: { x: 267, y: 58, rx: 14, ry: 16 }, shamash: { x: 245, y: 40, rx: 12, ry: 14 }, dreidel: { x: 334, y: 94, rx: 18, ry: 22 },
    cat: { x: 64, y: 126, rx: 34, ry: 22 }, frame: { x: 52, y: 46, rx: 38, ry: 32 }, moon: { x: 440, y: 42, rx: 15, ry: 15 },
  },
  kitchen: {
    apron: { x: 428, y: 105, rx: 22, ry: 26 }, hat: { x: 428, y: 37, rx: 22, ry: 15 }, tray: { x: 261, y: 113, rx: 72, ry: 20 },
    jam: { x: 357, y: 112, rx: 22, ry: 26 }, clock: { x: 250, y: 38, rx: 30, ry: 30 }, steam: { x: 73, y: 52, rx: 50, ry: 26 },
    bowl: { x: 153, y: 116, rx: 32, ry: 18 },
  },
  street: {
    door: { x: 266, y: 120, rx: 24, ry: 34 }, wcandles: { x: 207, y: 94, rx: 26, ry: 18 }, lamp: { x: 70, y: 46, rx: 34, ry: 28 },
    tree: { x: 400, y: 90, rx: 40, ry: 42 }, dreidel: { x: 345, y: 128, rx: 22, ry: 24 }, moon: { x: 440, y: 34, rx: 24, ry: 24 },
    bike: { x: 129, y: 132, rx: 34, ry: 22 },
  },
};

/** For each picture of a heat: the circles around ITS changed details (shown only in the final reveal). */
export function heatMarks(h: Heat): Mark[][] {
  const t = (h.base as { type: string }).type;
  return [0, 1, 2].map((i) => Object.entries(h.deviations).filter(([, who]) => who === i).map(([f]) => HOTSPOTS[t][f]));
}
