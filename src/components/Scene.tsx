/**
 * Original layered SVG scene (400×300): a family room on Hanukkah night.
 * Every element is driven by SceneSpec so variants differ ONLY where intended.
 * `crop` renders one square piece (for the sliding puzzle): the centre 300×300 is cut into 3×3.
 */
import type { SceneSpec } from '../content/scenes';

const KIPPAH = { red: '#d9473b', blue: '#3b6fd9' };
const FRAME = { gold: '#e2b54a', green: '#4fa66a' };

export function SceneContent({ s }: { s: SceneSpec }) {
  const slots = [118, 136, 154, 172, 228, 246, 264, 282]; // right→left lighting order is handled by index below
  const order = [7, 6, 5, 4, 3, 2, 1, 0];                    // first candle on the right
  return (
    <g>
      {/* wall + floor */}
      <rect width="400" height="300" fill="#1c2350" />
      <rect y="215" width="400" height="85" fill="#2a1f3a" />
      <rect y="212" width="400" height="6" fill="#3a2c4c" />
      {/* window */}
      <g transform="translate(272 34)">
        <rect width="96" height="96" rx="6" fill="#0b1030" stroke="#c9b37a" strokeWidth="5" />
        {[...Array(14)].map((_, i) => <circle key={i} cx={8 + ((i * 37) % 84)} cy={8 + ((i * 53) % 84)} r={i % 3 ? 0.9 : 1.5} fill="#fff" opacity=".8" />)}
        {s.moon && <path d="M70 22a14 14 0 1 0 6 26a11 11 0 1 1 -6 -26z" fill="#f3e9c4" />}
        {s.window === 'closed'
          ? <><line x1="48" y1="0" x2="48" y2="96" stroke="#c9b37a" strokeWidth="4" /><line x1="0" y1="48" x2="96" y2="48" stroke="#c9b37a" strokeWidth="4" /></>
          : <><polygon points="0,0 -14,8 -14,104 0,96" fill="#c9b37a" opacity=".9" /><polygon points="96,0 110,8 110,104 96,96" fill="#c9b37a" opacity=".9" /></>}
      </g>
      {/* picture frame */}
      <g transform="translate(34 40)">
        <rect width="70" height="56" rx="4" fill={FRAME[s.frame]} />
        <rect x="7" y="7" width="56" height="42" fill="#f4ead2" />
        <path d="M12 44 L28 24 L40 38 L48 30 L60 44 Z" fill="#7aa0c8" />
      </g>
      {/* table */}
      <rect x="70" y="170" width="260" height="12" rx="4" fill="#8a5a36" />
      <rect x="84" y="182" width="10" height="34" fill="#6d452a" /><rect x="306" y="182" width="10" height="34" fill="#6d452a" />
      {/* menorah */}
      <g>
        <path d="M118 128 Q200 176 282 128" fill="none" stroke="#e2b54a" strokeWidth="5" />
        <path d="M136 128 Q200 166 264 128" fill="none" stroke="#e2b54a" strokeWidth="5" />
        <path d="M154 128 Q200 156 246 128" fill="none" stroke="#e2b54a" strokeWidth="5" />
        <path d="M172 128 Q200 146 228 128" fill="none" stroke="#e2b54a" strokeWidth="5" />
        <rect x="197" y="104" width="6" height="62" fill="#e2b54a" />
        <path d="M180 170 Q200 156 220 170 Z" fill="#e2b54a" />
        {slots.map((x, i) => {
          const lit = order.indexOf(i) < s.candles;
          return (
            <g key={x}>
              <rect x={x - 3.5} y="106" width="7" height="22" rx="1.5" fill="#f3ede0" />
              {lit && <><ellipse cx={x} cy="99" rx="7" ry="9" fill="#ffc457" opacity=".3" /><path d={`M${x} 92 q4 5 0 10 q-4 -5 0 -10z`} fill="#f5b841" /></>}
            </g>
          );
        })}
        <rect x="196" y="82" width="8" height="22" rx="1.5" fill="#f3ede0" />
        {s.shamash && <><ellipse cx="200" cy="75" rx="8" ry="10" fill="#ffc457" opacity=".3" /><path d="M200 67 q5 6 0 12 q-5 -6 0 -12z" fill="#f5b841" /></>}
      </g>
      {/* plate of sufganiyot */}
      <g transform="translate(92 150)">
        <ellipse cx="34" cy="20" rx="38" ry="7" fill="#e8e2d4" />
        {[...Array(s.donuts)].map((_, i) => (
          <g key={i} transform={`translate(${8 + i * 17} ${i % 2 ? 4 : 8})`}>
            <ellipse cx="8" cy="8" rx="9" ry="7" fill="#c98a4b" /><ellipse cx="8" cy="5" rx="6" ry="2.5" fill="#fff6e6" /><circle cx="8" cy="6" r="1.8" fill="#c7313b" />
          </g>
        ))}
      </g>
      {/* dreidel */}
      <g transform="translate(262 140)">
        <path d="M6 2 h20 v16 l-10 14 l-10 -14z" fill="#4fb0c6" /><rect x="13" y="-6" width="6" height="9" fill="#357e8f" />
        <text x="16" y="17" textAnchor="middle" fontSize="12" fontWeight="800" fill="#0b1026" fontFamily="sans-serif">{s.dreidel}</text>
      </g>
      {/* child */}
      <g transform="translate(330 178)">
        <rect x="-16" y="10" width="32" height="40" rx="12" fill="#5c8df6" />
        <circle cx="0" cy="0" r="15" fill="#f1c7a0" />
        <path d="M-12 -6 a12 9 0 0 1 24 0 z" fill={KIPPAH[s.kippah]} />
        <circle cx="-5" cy="2" r="1.6" fill="#2b2b2b" /><circle cx="5" cy="2" r="1.6" fill="#2b2b2b" />
        <path d="M-5 8 q5 4 10 0" stroke="#7a3d2a" strokeWidth="1.6" fill="none" />
      </g>
      {/* cat */}
      {s.cat && (
        <g transform="translate(40 228)">
          <ellipse cx="22" cy="22" rx="22" ry="12" fill="#e6934a" />
          <circle cx="44" cy="12" r="10" fill="#e6934a" /><path d="M37 6 l3 -9 l5 7z M47 5 l5 -8 l2 9z" fill="#e6934a" />
          <path d="M0 20 q-10 -14 2 -22" stroke="#e6934a" strokeWidth="5" fill="none" strokeLinecap="round" />
          <circle cx="41" cy="12" r="1.4" fill="#222" /><circle cx="47" cy="12" r="1.4" fill="#222" />
        </g>
      )}
    </g>
  );
}

export function Scene({ s, label, crop }: { s: SceneSpec; label?: string; crop?: { col: number; row: number } }) {
  const vb = crop ? `${50 + crop.col * 100} ${crop.row * 100} 100 100` : '0 0 400 300';
  return (
    <svg viewBox={vb} className="scene" role="img" aria-label={label ?? 'תמונה'} preserveAspectRatio="xMidYMid slice">
      <SceneContent s={s} />
    </svg>
  );
}
