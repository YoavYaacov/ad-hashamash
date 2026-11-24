/**
 * Candle-memory symbols: seven clearly different, full-colour illustrations (no emoji),
 * each with its name underneath. Distinct silhouettes AND colours so nothing looks alike.
 */
import type { ReactElement } from 'react';

const Flame = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <ellipse cx="0" cy="-6" rx="9" ry="12" fill="#ffcf6b" opacity=".35" />
    <path d="M0 -15 C6 -8 6 -2 0 2 C-6 -2 -6 -8 0 -15Z" fill="#ffb02e" />
    <path d="M0 -8 C3 -4 3 -1 0 1 C-3 -1 -3 -4 0 -8Z" fill="#fff3c4" />
  </g>
);

export const MEMORY_ART: Record<string, { name: string; draw: ReactElement }> = {
  candle: { name: 'נר', draw: (
    <g><Flame x={50} y={26} s={1.4} />
      <rect x="40" y="32" width="20" height="52" rx="4" fill="#5c8df6" /><rect x="40" y="32" width="7" height="52" rx="3" fill="#86aaff" />
      <path d="M50 30v-4" stroke="#333" strokeWidth="2" /><rect x="32" y="84" width="36" height="7" rx="3" fill="#c9a24a" /></g>) },
  dreidel: { name: 'סביבון', draw: (
    <g><rect x="45" y="8" width="10" height="20" rx="4" fill="#2f7a4f" />
      <path d="M22 28h56v30L50 92 22 58z" fill="#3fb46b" /><path d="M22 28h28v64L22 58z" fill="#2f9a5a" />
      <text x="51" y="61" textAnchor="middle" fontSize="26" fontWeight="700" fill="#fff" fontFamily="inherit">נ</text></g>) },
  sufganiya: { name: 'סופגנייה', draw: (
    <g><ellipse cx="50" cy="60" rx="38" ry="26" fill="#c77b35" /><ellipse cx="50" cy="54" rx="38" ry="24" fill="#e0a052" />
      <path d="M16 50c8-10 60-10 68 0-4 6-12 8-18 8-8 0-10-4-16-4s-8 4-16 4c-6 0-14-2-18-8z" fill="#fff6e6" />
      <circle cx="30" cy="48" r="1.6" fill="#fff" /><circle cx="68" cy="46" r="1.6" fill="#fff" /><circle cx="58" cy="52" r="1.4" fill="#fff" />
      <ellipse cx="50" cy="42" rx="11" ry="7" fill="#d0293b" /><ellipse cx="47" cy="40" rx="4" ry="2" fill="#f2697a" /></g>) },
  oil_jar: { name: 'כד שמן', draw: (
    <g><path d="M36 14h28v10H36z" fill="#9c5b35" /><path d="M40 24h20c0 6 22 14 22 36 0 22-16 30-32 30S18 82 18 60c0-22 22-30 22-36z" fill="#c9764a" />
      <path d="M78 40c10 2 12 16 2 20" stroke="#9c5b35" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M22 58h56" stroke="#f3cf7a" strokeWidth="5" /><path d="M50 66c5 7 5 11 0 14-5-3-5-7 0-14z" fill="#f5c542" /></g>) },
  menorah: { name: 'חנוכייה', draw: (
    <g stroke="#e9b949" strokeWidth="4" fill="none" strokeLinecap="round">
      {[10, 20, 30, 40].map((r) => <path key={r} d={`M${50 - r} 46 a${r} ${r * .7} 0 0 0 ${2 * r} 0`} />)}
      <path d="M50 30v52" /><path d="M34 86h32" strokeWidth="6" />
      {[10, 20, 30, 40, 60, 70, 80, 90].map((x) => <Flame key={x} x={x} y={42} s={.8} />)}<Flame x={50} y={26} s={.9} /></g>) },
  coin: { name: 'מטבע', draw: (
    <g><circle cx="50" cy="52" r="36" fill="#c99a2e" /><circle cx="50" cy="48" r="36" fill="#f2c94c" /><circle cx="50" cy="48" r="27" fill="none" stroke="#c99a2e" strokeWidth="3" />
      <path d="M50 30l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z" fill="#c99a2e" /></g>) },
  latke: { name: 'לביבה', draw: (
    <g><ellipse cx="50" cy="70" rx="40" ry="10" fill="#e8e1d2" /><ellipse cx="50" cy="60" rx="36" ry="18" fill="#9a5a1e" />
      <ellipse cx="50" cy="56" rx="34" ry="16" fill="#c98a3a" />
      <path d="M24 54l8-3M34 60l9-2M58 50l9 3M64 60l8-2M44 50l6 2" stroke="#8a4a12" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M40 46c4-8 18-8 22 0-4 4-18 4-22 0z" fill="#fffdf5" /><circle cx="58" cy="40" r="2.5" fill="#7bc67e" /></g>) },
};

export function MemorySymbol({ id, size = 120, onClick, small }: { id: string; size?: number; onClick?: () => void; small?: boolean }) {
  const a = MEMORY_ART[id];
  const body = (
    <>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">{a?.draw}</svg>
      {!small && <span className="mem-name">{a?.name ?? id}</span>}
    </>
  );
  return onClick
    ? <button type="button" className="mem-symbol" onClick={onClick} aria-label={a?.name ?? id}>{body}</button>
    : <span className={`mem-symbol ${small ? 'small' : ''}`} role="img" aria-label={a?.name ?? id}>{body}</span>;
}
