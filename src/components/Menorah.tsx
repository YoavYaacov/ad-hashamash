/**
 * Original SVG menorah: 8 candles + a raised central שַׁמָּשׁ (a CANDLE, never a sun).
 * `lit` = how many of the 8 candles are lit (completed rounds). `shamashLit` for the finale.
 * `active` = index (0-based) of the candle currently "being lit" (flickers).
 */
interface Props {
  lit: number;
  shamashLit?: boolean;
  active?: number | null;
  size?: number;
  label?: string;
}

const GOLD = 'var(--gold)';

function Flame({ x, y, on, flicker, big }: { x: number; y: number; on: boolean; flicker?: boolean; big?: boolean }) {
  const s = big ? 1.25 : 1;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} className={`flame ${on ? 'on' : 'off'} ${flicker ? 'flicker' : ''}`}>
      <ellipse cx="0" cy="-2" rx="16" ry="20" className="flame-glow" />
      <path d="M0 -26 C 7 -16, 9 -8, 0 0 C -9 -8, -7 -16, 0 -26 Z" className="flame-outer" />
      <path d="M0 -15 C 3.5 -10, 4 -5, 0 -1 C -4 -5, -3.5 -10, 0 -15 Z" className="flame-inner" />
    </g>
  );
}

export function Menorah({ lit, shamashLit = false, active = null, size = 520, label }: Props) {
  // Candle slots right→left (Hebrew reading order: first candle is on the right).
  const xs = [470, 420, 370, 320, 200, 150, 100, 50];
  const shamashX = 260;
  return (
    <svg viewBox="0 0 520 330" width={size} role="img" aria-label={label ?? `חנוכייה: ${lit} נרות דולקים${shamashLit ? ' והשמש' : ''}`} className="menorah">
      <defs>
        <linearGradient id="gold" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#F8DA8B" />
          <stop offset="1" stopColor="#B8862F" />
        </linearGradient>
        <linearGradient id="wax" x1="0" x2="1">
          <stop offset="0" stopColor="#F3EDE0" />
          <stop offset="1" stopColor="#D9CFBC" />
        </linearGradient>
      </defs>

      {/* arms: concentric arcs */}
      {/* arms: half-ellipses joining each candle pair through the stem */}
      {[60, 110, 160, 210].map((r) => (
        <path key={r} d={`M ${shamashX - r} 150 A ${r} ${r * 0.55} 0 0 0 ${shamashX + r} 150`}
              fill="none" stroke="url(#gold)" strokeWidth="7" strokeLinecap="round" />
      ))}
      {/* cups + stem + base */}
      {xs.map((x) => <rect key={x} x={x - 14} y={142} width={28} height={10} rx={3} fill="url(#gold)" />)}
      <rect x={shamashX - 6} y={90} width={12} height={180} fill="url(#gold)" />
      <rect x={shamashX - 18} y={82} width={36} height={12} rx={4} fill="url(#gold)" />
      <path d={`M ${shamashX - 70} 300 Q ${shamashX} 255 ${shamashX + 70} 300 Z`} fill="url(#gold)" />
      <rect x={shamashX - 80} y={298} width={160} height={10} rx={5} fill="url(#gold)" />

      {/* candles */}
      {xs.map((x, i) => (
        <g key={i}>
          <rect x={x - 7} y={92} width={14} height={50} rx={3} fill="url(#wax)" />
          <line x1={x} y1={92} x2={x} y2={86} stroke="#3a2f22" strokeWidth={2} />
          <Flame x={x} y={86} on={i < lit || i === active} flicker={i === active} />
        </g>
      ))}
      {/* the shamash: taller, raised candle at the centre */}
      <rect x={shamashX - 8} y={22} width={16} height={60} rx={3} fill="url(#wax)" stroke={GOLD} strokeWidth={1.5} />
      <line x1={shamashX} y1={22} x2={shamashX} y2={15} stroke="#3a2f22" strokeWidth={2} />
      <Flame x={shamashX} y={15} on={shamashLit} big />
    </svg>
  );
}
