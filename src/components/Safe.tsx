import { useEffect, useId, useState } from 'react';
/**
 * Original safe illustration (SVG + CSS). States:
 *   closed  – idle, a soft glint passes over the steel
 *   fail    – shakes, the LED turns red
 *   open    – the door swings open on its hinge and golden light spills out
 */
export type SafeState = 'closed' | 'fail' | 'unlock' | 'open';

export function SafeArt({ state, digits = '', size = 260, slots = 4 }: { state: SafeState; digits?: string; size?: number; slots?: number }) {
  // Unique gradient ids: with shared ids a hidden safe elsewhere on the page can blank out the golden light.
  const uid = useId().replace(/:/g, '');
  const steel = `steel-${uid}`, glow = `gold-glow-${uid}`;
  return (
    <div className={`safe safe-${state}`} style={{ width: size }}>
      <svg viewBox="0 0 220 230" className="safe-body" aria-hidden="true">
        <defs>
          <linearGradient id={steel} x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#5d6684" /><stop offset="1" stopColor="#2d3350" /></linearGradient>
          <radialGradient id={glow}><stop offset="0" stopColor="#fff3c4" /><stop offset=".5" stopColor="#f5b841" /><stop offset="1" stopColor="#f5b84100" /></radialGradient>
        </defs>
        <rect x="6" y="6" width="208" height="206" rx="14" fill={`url(#${steel})`} stroke="#1b2038" strokeWidth="4" />
        <rect x="24" y="212" width="30" height="12" rx="3" fill="#1b2038" /><rect x="166" y="212" width="30" height="12" rx="3" fill="#1b2038" />
        {/* interior (visible when the door opens) */}
        <rect x="22" y="22" width="176" height="174" rx="8" fill="#140f05" />
        <circle cx="110" cy="110" r="90" fill={`url(#${glow})`} className="safe-light" />
        <g className="safe-treasure">
          {[[80, 150], [100, 146], [120, 150], [140, 146], [90, 136], [112, 132], [132, 136]].map(([x, y], i) => (
            <ellipse key={i} cx={x} cy={y} rx="12" ry="5" fill="#e9b949" stroke="#b8862f" strokeWidth="1.5" />
          ))}
          <path d="M96 98 h28 v10 l-6 26 h-16 l-6 -26z" fill="#c9b37a" /><rect x="104" y="90" width="12" height="9" fill="#a68c52" />
        </g>
      </svg>
      {/* the door is a separate layer so it can swing in 3D */}
      <div className="safe-door">
        <svg viewBox="0 0 176 174" aria-hidden="true">
          <rect x="0" y="0" width="176" height="174" rx="8" fill="#4a5272" stroke="#20253f" strokeWidth="3" />
          {[[14, 14], [162, 14], [14, 160], [162, 160]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="4" fill="#8890b0" />)}
          <circle cx="88" cy="104" r="34" fill="#353c5a" stroke="#8890b0" strokeWidth="4" />
          <g className="safe-wheel">{[0, 60, 120].map((a) => <rect key={a} x="84" y="74" width="8" height="60" rx="4" fill="#aab2d0" transform={`rotate(${a} 88 104)`} />)}<circle cx="88" cy="104" r="9" fill="#d5dbf0" /></g>
          <circle cx="150" cy="40" r="6" className="safe-led" />
        </svg>
        <div className="safe-display" dir="ltr">
          {Array.from({ length: slots }, (_, i) => <span key={i} className={digits[i] ? 'filled' : ''}>{digits[i] ?? ''}</span>)}
        </div>
      </div>
      <i className="safe-glint" aria-hidden="true" />
    </div>
  );
}

/**
 * The success moment, staged so nothing "jumps": the safe appears closed with the code in green,
 * the wheel spins, the door swings open, light and treasure spill out, sparks fly.
 */
export function OpeningSafe({ digits = '', size = 240, delay = 250, glide = false }: { digits?: string; size?: number; delay?: number; glide?: boolean }) {
  const [st, setSt] = useState<SafeState>('unlock');
  useEffect(() => { const t = setTimeout(() => setSt('open'), delay + 900); return () => clearTimeout(t); }, [delay]);
  return (
    <div className={`opening-safe ${glide ? 'glide' : ''}`} style={{ width: size }}>
      <SafeArt state={st} digits={digits} size={size} />
      {st === 'open' && (
        <div className="safe-sparks" aria-hidden="true">
          {Array.from({ length: 18 }, (_, i) => <i key={i} style={{ '--a': `${i * 20}deg`, '--d': `${(i % 3) * 60}ms` } as React.CSSProperties} />)}
        </div>
      )}
    </div>
  );
}
