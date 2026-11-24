/**
 * One letter of the finale word, quietly sitting somewhere on the score screen.
 * No glow, no blinking — it is simply there for whoever notices it.
 */
export const SCREEN_SPOTS: [number, number][] = [
  [4, 7], [95, 9], [3, 92], [96, 90], [50, 95], [25, 6], [74, 7], [3, 50], [97, 46], [18, 94], [82, 95],
];
const PHONE_SPOTS: React.CSSProperties[] = [
  { top: '.15rem', left: '42%' }, { bottom: '.1rem', left: '.7rem' }, { bottom: '.1rem', right: '.8rem' },
  { top: '.15rem', right: '36%' }, { top: '.2rem', left: '.7rem' }, { bottom: '.12rem', left: '47%' },
];

export function ClueLetter({ clue, where }: { clue?: { letter: string; spot: number; rot: number } | null; where: 'screen' | 'phone' }) {
  if (!clue?.letter) return null;
  const pos: React.CSSProperties = where === 'screen'
    ? (() => { const [x, y] = SCREEN_SPOTS[clue.spot % SCREEN_SPOTS.length]; return { left: `${x}%`, top: `${y}%` }; })()
    : PHONE_SPOTS[clue.spot % PHONE_SPOTS.length];
  return <span className={`clue-letter cl-${where}`} aria-hidden="true" style={{ ...pos, '--rot': `${clue.rot}deg` } as React.CSSProperties}>{clue.letter}</span>;
}
