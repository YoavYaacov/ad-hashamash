/**
 * Original layered SVG scene (400×300): a family room on Hanukkah night.
 * Every element is driven by SceneSpec so variants differ ONLY where intended.
 * `crop` renders one square piece (for the sliding puzzle): the centre 300×300 is cut into 3×3.
 */
import type { KitchenSpec, RoomSpec, SceneSpec, StreetSpec } from '../content/scenes';

const KIPPAH = { red: '#d9473b', blue: '#3b6fd9' };
const FRAME = { gold: '#e2b54a', green: '#4fa66a' };

function RoomScene({ s }: { s: RoomSpec }) {
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

/** Doughnut kitchen (wide 480×180): baker, tray, pot, jam, clock, bowl. */
function KitchenScene({ s }: { s: KitchenSpec }) {
  const APRON = { red: '#d9473b', green: '#3f9a5b' };
  const BOWL = { blue: '#4f7fe0', yellow: '#e8c13f' };
  const JAM = { red: '#c7313b', purple: '#7d3fb0' };
  const hand = s.clock === 3 ? 'M0 0 L13 0' : 'M0 0 L-13 0';
  return (
    <g>
      <rect width="480" height="180" fill="#3a2a2a" />
      {[...Array(7)].map((_, r) => [...Array(17)].map((__, c) => (
        <rect key={`${r}-${c}`} x={c * 30 - (r % 2) * 15} y={r * 20} width="28" height="18" fill={(r + c) % 2 ? '#4a3434' : '#443030'} />
      )))}
      <g transform="translate(250 38)">
        <circle r="24" fill="#f4ead2" stroke="#c9b37a" strokeWidth="4" />
        {[0, 1, 2, 3].map((k) => <circle key={k} cx={Math.cos((k * Math.PI) / 2) * 18} cy={Math.sin((k * Math.PI) / 2) * 18} r="2" fill="#555" />)}
        <path d="M0 0 L0 -15" stroke="#222" strokeWidth="3" strokeLinecap="round" />
        <path d={hand} stroke="#222" strokeWidth="3" strokeLinecap="round" />
      </g>
      <rect x="0" y="136" width="480" height="44" fill="#6d452a" />
      <rect x="0" y="128" width="480" height="10" fill="#9b6b43" />
      <g transform="translate(28 68)">
        <rect x="0" y="40" width="90" height="20" rx="4" fill="#555" />
        <rect x="10" y="6" width="70" height="36" rx="8" fill="#8a8f9c" />
        <rect x="4" y="2" width="82" height="8" rx="4" fill="#a7adb9" />
        {s.steam && [18, 45, 70].map((x) => <path key={x} d={`M${x} -2 q-8 -12 0 -22 q8 -10 0 -22`} stroke="#e8e8e8" strokeWidth="3" fill="none" opacity=".75" strokeLinecap="round" />)}
      </g>
      <g transform="translate(128 110)"><path d="M0 0 h50 a25 18 0 0 1 -50 0z" fill={BOWL[s.bowl]} /></g>
      <g transform="translate(196 102)">
        <rect x="0" y="16" width="130" height="10" rx="4" fill="#c9b37a" />
        {[...Array(s.tray)].map((_, i) => (
          <g key={i} transform={`translate(${6 + i * 20} 0)`}>
            <ellipse cx="9" cy="10" rx="10" ry="8" fill="#c98a4b" /><ellipse cx="9" cy="6" rx="7" ry="3" fill="#fff6e6" /><circle cx="9" cy="7" r="2" fill="#c7313b" />
          </g>
        ))}
      </g>
      <g transform="translate(344 88)">
        <rect x="0" y="8" width="26" height="32" rx="6" fill={JAM[s.jam]} />
        <rect x="-2" y="2" width="30" height="8" rx="3" fill="#d8d0c0" />
        <rect x="4" y="18" width="18" height="10" rx="2" fill="#f4ead2" />
      </g>
      <g transform="translate(428 50) scale(.88)">
        <rect x="-22" y="26" width="44" height="64" rx="14" fill="#f4ead2" />
        <path d="M-16 40 h32 v46 h-32z" fill={APRON[s.apron]} />
        <circle cx="0" cy="10" r="17" fill="#f1c7a0" />
        <circle cx="-6" cy="10" r="1.8" fill="#2b2b2b" /><circle cx="6" cy="10" r="1.8" fill="#2b2b2b" />
        <path d="M-6 18 q6 5 12 0" stroke="#7a3d2a" strokeWidth="1.8" fill="none" />
        {s.hat && <g><rect x="-14" y="-12" width="28" height="10" fill="#fff" /><ellipse cx="0" cy="-16" rx="18" ry="10" fill="#fff" /></g>}
      </g>
    </g>
  );
}

/** Street at night (wide 480×180): house with a menorah in the window, lamp, tree, dreidel, moon, bike. */
function StreetScene({ s }: { s: StreetSpec }) {
  const DOOR = { red: '#c7313b', blue: '#3b6fd9' };
  const DREIDEL = { teal: '#4fb0c6', orange: '#f0935a' };
  return (
    <g>
      <rect width="480" height="180" fill="#0d1238" />
      {[...Array(22)].map((_, i) => <circle key={i} cx={10 + ((i * 53) % 460)} cy={6 + ((i * 29) % 70)} r={i % 4 ? 1 : 1.8} fill="#fff" opacity=".8" />)}
      {s.moon === 'full' ? <circle cx="440" cy="34" r="18" fill="#f3e9c4" /> : <path d="M449 17 a18 18 0 1 0 7 32 a14 14 0 1 1 -7 -32z" fill="#f3e9c4" />}
      <rect y="160" width="480" height="20" fill="#2c2f45" />
      <rect y="150" width="480" height="11" fill="#5b5f7a" />
      <g transform="translate(168 54) scale(.7)">
        <rect width="180" height="136" fill="#c9a77c" />
        <path d="M-12 2 L90 -52 L192 2 Z" fill="#8a4b3a" />
        <rect x="18" y="26" width="76" height="56" rx="4" fill="#3a2a14" stroke="#f4ead2" strokeWidth="4" />
        <rect x="22" y="30" width="68" height="48" fill="#ffd98a" opacity=".25" />
        <g transform="translate(56 66)">
          <rect x="-26" y="0" width="52" height="4" fill="#e2b54a" /><rect x="-2" y="-14" width="4" height="16" fill="#e2b54a" />
          {[-24, -18, -12, -6, 6, 12, 18, 24].map((x, i) => (
            <g key={x}>
              <rect x={x - 1.5} y="-8" width="3" height="8" fill="#f3ede0" />
              {(7 - i) < s.wcandles && <path d={`M${x} -14 q2.5 3 0 6 q-2.5 -3 0 -6z`} fill="#f5b841" />}
            </g>
          ))}
          <rect x="-1.5" y="-20" width="3" height="6" fill="#f3ede0" /><path d="M0 -26 q2.5 3 0 6 q-2.5 -3 0 -6z" fill="#f5b841" />
        </g>
        <rect x="118" y="56" width="44" height="80" rx="4" fill={DOOR[s.door]} />
        <circle cx="152" cy="98" r="3" fill="#e2b54a" />
      </g>
      <g transform="translate(70 36)">
        <rect x="-3" y="10" width="6" height="106" fill="#3a3f5c" />
        <path d="M-14 10 h28 l-6 -16 h-16z" fill="#3a3f5c" />
        {s.lamp && <><ellipse cx="0" cy="22" rx="34" ry="22" fill="#ffd98a" opacity=".22" /><rect x="-8" y="0" width="16" height="10" fill="#ffe7a8" /></>}
      </g>
      {s.tree && (
        <g transform="translate(400 72)">
          <rect x="-5" y="20" width="10" height="58" fill="#6d452a" />
          <circle cx="0" cy="10" r="30" fill="#5d7a4a" /><circle cx="-20" cy="22" r="18" fill="#6b8a55" /><circle cx="20" cy="22" r="18" fill="#6b8a55" />
        </g>
      )}
      <g transform="translate(332 118)">
        <path d="M0 0 h26 v18 l-13 16 l-13 -16z" fill={DREIDEL[s.dreidel]} /><rect x="10" y="-9" width="6" height="10" fill="#2c2f45" />
      </g>
      {s.bike && (
        <g transform="translate(108 140)" stroke="#e2b54a" strokeWidth="3" fill="none">
          <circle cx="0" cy="0" r="12" /><circle cx="42" cy="0" r="12" /><path d="M0 0 L16 -18 L34 -18 L42 0 M16 -18 L22 0 L34 -18" /><path d="M14 -24 h8" />
        </g>
      )}
    </g>
  );
}

/** Living room (wide 480×180) for the three-pictures heats; same parts as the tall puzzle room. */
function RoomWideScene({ s }: { s: RoomSpec }) {
  const KIPPAH = { red: '#d9473b', blue: '#3b6fd9' };
  const FRAME = { gold: '#e2b54a', green: '#4fa66a' };
  const slots = [118, 136, 154, 172, 228, 246, 264, 282];
  const order = [7, 6, 5, 4, 3, 2, 1, 0];
  return (
    <g>
      <rect width="480" height="180" fill="#1c2350" />
      <rect y="142" width="480" height="38" fill="#2a1f3a" /><rect y="139" width="480" height="5" fill="#3a2c4c" />
      <g transform="translate(22 22) scale(.85)">
        <rect width="70" height="56" rx="4" fill={FRAME[s.frame]} /><rect x="7" y="7" width="56" height="42" fill="#f4ead2" />
        <path d="M12 44 L28 24 L40 38 L48 30 L60 44 Z" fill="#7aa0c8" />
      </g>
      <g transform="translate(384 14) scale(.8)">
        <rect width="96" height="96" rx="6" fill="#0b1030" stroke="#c9b37a" strokeWidth="5" />
        {[...Array(14)].map((_, i) => <circle key={i} cx={8 + ((i * 37) % 84)} cy={8 + ((i * 53) % 84)} r={i % 3 ? 0.9 : 1.5} fill="#fff" opacity=".8" />)}
        {s.moon && <path d="M70 22a14 14 0 1 0 6 26a11 11 0 1 1 -6 -26z" fill="#f3e9c4" />}
        {s.window === 'closed'
          ? <><line x1="48" y1="0" x2="48" y2="96" stroke="#c9b37a" strokeWidth="4" /><line x1="0" y1="48" x2="96" y2="48" stroke="#c9b37a" strokeWidth="4" /></>
          : <><polygon points="0,0 -14,8 -14,104 0,96" fill="#c9b37a" opacity=".9" /><polygon points="96,0 110,8 110,104 96,96" fill="#c9b37a" opacity=".9" /></>}
      </g>
      <rect x="120" y="112" width="250" height="11" rx="4" fill="#8a5a36" />
      <rect x="134" y="123" width="9" height="20" fill="#6d452a" /><rect x="348" y="123" width="9" height="20" fill="#6d452a" />
      <g transform="translate(245 112) scale(.78) translate(-200 -170)">
        <path d="M118 128 Q200 176 282 128" fill="none" stroke="#e2b54a" strokeWidth="5" />
        <path d="M136 128 Q200 166 264 128" fill="none" stroke="#e2b54a" strokeWidth="5" />
        <path d="M154 128 Q200 156 246 128" fill="none" stroke="#e2b54a" strokeWidth="5" />
        <path d="M172 128 Q200 146 228 128" fill="none" stroke="#e2b54a" strokeWidth="5" />
        <rect x="197" y="104" width="6" height="62" fill="#e2b54a" /><path d="M180 170 Q200 156 220 170 Z" fill="#e2b54a" />
        {slots.map((x, i) => (
          <g key={x}>
            <rect x={x - 3.5} y="106" width="7" height="22" rx="1.5" fill="#f3ede0" />
            {order.indexOf(i) < s.candles && <><ellipse cx={x} cy="99" rx="7" ry="9" fill="#ffc457" opacity=".3" /><path d={`M${x} 92 q4 5 0 10 q-4 -5 0 -10z`} fill="#f5b841" /></>}
          </g>
        ))}
        <rect x="196" y="82" width="8" height="22" rx="1.5" fill="#f3ede0" />
        {s.shamash && <><ellipse cx="200" cy="75" rx="8" ry="10" fill="#ffc457" opacity=".3" /><path d="M200 67 q5 6 0 12 q-5 -6 0 -12z" fill="#f5b841" /></>}
      </g>
      <g transform="translate(136 92)">
        <ellipse cx="34" cy="20" rx="38" ry="7" fill="#e8e2d4" />
        {[...Array(s.donuts)].map((_, i) => (
          <g key={i} transform={`translate(${8 + i * 17} ${i % 2 ? 4 : 8})`}>
            <ellipse cx="8" cy="8" rx="9" ry="7" fill="#c98a4b" /><ellipse cx="8" cy="5" rx="6" ry="2.5" fill="#fff6e6" /><circle cx="8" cy="6" r="1.8" fill="#c7313b" />
          </g>
        ))}
      </g>
      <g transform="translate(318 84)">
        <path d="M6 2 h20 v16 l-10 14 l-10 -14z" fill="#4fb0c6" /><rect x="13" y="-6" width="6" height="9" fill="#357e8f" />
        <text x="16" y="17" textAnchor="middle" fontSize="12" fontWeight="800" fill="#0b1026" fontFamily="sans-serif">{s.dreidel}</text>
      </g>
      <g transform="translate(410 104) scale(.85)">
        <rect x="-16" y="10" width="32" height="40" rx="12" fill="#5c8df6" />
        <circle cx="0" cy="0" r="15" fill="#f1c7a0" />
        <path d="M-12 -6 a12 9 0 0 1 24 0 z" fill={KIPPAH[s.kippah]} />
        <circle cx="-5" cy="2" r="1.6" fill="#2b2b2b" /><circle cx="5" cy="2" r="1.6" fill="#2b2b2b" />
        <path d="M-5 8 q5 4 10 0" stroke="#7a3d2a" strokeWidth="1.6" fill="none" />
      </g>
      {s.cat && (
        <g transform="translate(40 116) scale(.85)">
          <ellipse cx="22" cy="22" rx="22" ry="12" fill="#e6934a" />
          <circle cx="44" cy="12" r="10" fill="#e6934a" /><path d="M37 6 l3 -9 l5 7z M47 5 l5 -8 l2 9z" fill="#e6934a" />
          <path d="M0 20 q-10 -14 2 -22" stroke="#e6934a" strokeWidth="5" fill="none" strokeLinecap="round" />
          <circle cx="41" cy="12" r="1.4" fill="#222" /><circle cx="47" cy="12" r="1.4" fill="#222" />
        </g>
      )}
    </g>
  );
}

export function SceneContent({ s }: { s: SceneSpec }) {
  const t = (s as { type?: string }).type ?? 'room';
  if (t === 'kitchen') return <KitchenScene s={s as KitchenSpec} />;
  if (t === 'street') return <StreetScene s={s as StreetSpec} />;
  if ((s as RoomSpec).wide) return <RoomWideScene s={s as RoomSpec} />;
  return <RoomScene s={{ ...(s as RoomSpec), type: 'room' }} />;
}

/** Wide panoramas (three-pictures heats) vs. the tall living room (sliding puzzle). */
export function isWide(s: SceneSpec): boolean {
  return s.type === 'kitchen' || s.type === 'street' || !!(s as RoomSpec).wide;
}

export function Scene({ s, label, crop, marks }: { s: SceneSpec; label?: string; crop?: { col: number; row: number }; marks?: { x: number; y: number; rx: number; ry: number }[] }) {
  const wide = isWide(s);
  const vb = crop ? `${50 + crop.col * 100} ${crop.row * 100} 100 100` : wide ? '0 0 480 180' : '0 0 400 300';
  return (
    <svg viewBox={vb} className="scene" role="img" aria-label={label ?? 'תמונה'} preserveAspectRatio="xMidYMid slice">
      <SceneContent s={s} />
      {marks?.map((m, i) => (
        <ellipse key={i} className="diff-mark" cx={m.x} cy={m.y} rx={m.rx} ry={m.ry} pathLength={100} style={{ '--k': i } as React.CSSProperties} />
      ))}
    </svg>
  );
}
