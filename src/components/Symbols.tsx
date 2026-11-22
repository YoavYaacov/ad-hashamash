/**
 * Original, consistent vector symbols (no OS emoji). Used by the memory and symbol tasks.
 * One visual language: 64×64 grid, gold/cream on a dark tile, 3px rounded strokes.
 */
import type { ReactElement } from 'react';

const S = { stroke: 'var(--gold)', strokeWidth: 3, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const F = { fill: 'var(--gold)' };

export const SYMBOLS: Record<string, { label: string; draw: ReactElement }> = {
  oil:      { label: 'כד שמן', draw: <g><path {...S} d="M22 20h20M24 20c-8 6-10 14-10 22 0 8 8 12 18 12s18-4 18-12c0-8-2-16-10-22" /><path {...S} d="M27 14h10v6H27z" /><path {...F} d="M20 40c4 4 20 4 24 0-1 7-7 9-12 9s-11-2-12-9z" opacity=".55" /></g> },
  dreidel:  { label: 'סביבון', draw: <g><path {...S} d="M32 8v10M18 18h28l-4 22-10 14-10-14z" /><path {...S} d="M27 28h10M32 28v12" /></g> },
  candle:   { label: 'נר', draw: <g><rect {...S} x="26" y="26" width="12" height="28" rx="2" /><path {...F} d="M32 8c5 6 6 11 0 16-6-5-5-10 0-16z" /></g> },
  sufganiya:{ label: 'סופגנייה', draw: <g><ellipse {...S} cx="32" cy="38" rx="20" ry="13" /><path {...S} d="M14 34c6-6 30-6 36 0" /><circle {...F} cx="32" cy="27" r="4" /><path {...S} strokeWidth={2} d="M22 31l1-2M40 30l1 2M30 33l1-2" /></g> },
  menorah:  { label: 'חנוכייה', draw: <g><path {...S} d="M32 22v30M14 22c0 12 8 16 18 16s18-4 18-16M22 22c0 8 4 10 10 10s10-2 10-10M24 54h16" /><path {...F} d="M32 10c3 4 3 7 0 9-3-2-3-5 0-9z" /></g> },
  coin:     { label: 'מטבע', draw: <g><circle {...S} cx="32" cy="32" r="18" /><circle {...S} strokeWidth={2} cx="32" cy="32" r="12" /><path {...S} d="M28 27h8l-4 10" /></g> },
  jar:      { label: 'פך', draw: <g><path {...S} d="M24 14h16M26 14v6c-6 3-10 9-10 17 0 10 7 15 16 15s16-5 16-15c0-8-4-14-10-17v-6" /><path {...S} d="M46 26c6 0 8 6 3 10" /></g> },
  star:     { label: 'מגן דוד', draw: <g><path {...S} d="M32 10l18 31H14zM32 54L14 23h36z" /></g> },
  temple:   { label: 'מקדש', draw: <g><path {...S} d="M12 26l20-14 20 14M16 26v24M26 26v24M38 26v24M48 26v24M10 52h44" /></g> },
  // A sparkle (not rays/sun — sun imagery is deliberately avoided across the game).
  miracle:  { label: 'נס', draw: <g><path {...F} d="M30 10c1.5 12 4 15 16 16-12 1.5-14.5 4-16 16-1.5-12-4-14.5-16-16 12-1 14.5-4 16-16z" /><path {...F} d="M47 38c.8 5 2 6.2 7 7-5 .8-6.2 2-7 7-.8-5-2-6.2-7-7 5-.8 6.2-2 7-7z" opacity=".7" /></g> },
};

export function SymbolTile({ id, size = 72, selected, onClick, label }: { id: string; size?: number; selected?: boolean; onClick?: () => void; label?: boolean }) {
  const sym = SYMBOLS[id];
  const body = (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      {sym ? sym.draw : <text x="32" y="40" textAnchor="middle" fill="var(--gold)" fontSize="20">{id}</text>}
    </svg>
  );
  const content = <>{body}{label && <span className="symbol-label">{sym?.label ?? id}</span>}</>;
  if (!onClick) return <span className={`symbol-tile ${selected ? 'selected' : ''}`} role="img" aria-label={sym?.label ?? id}>{content}</span>;
  return <button type="button" className={`symbol-tile ${selected ? 'selected' : ''}`} onClick={onClick} aria-label={sym?.label ?? id}>{content}</button>;
}
