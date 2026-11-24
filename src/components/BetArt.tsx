/**
 * Original little characters and four different menorahs for the bet puzzle (task 31).
 * Flat, friendly shapes in one style; 64×64 viewBox each.
 */
export type CharacterId = 'grandma' | 'uncle' | 'girl' | 'boy';
export type MenorahId = 'silver' | 'glass' | 'lego' | 'clay';

const SKIN = '#f1c7a0';
const Eyes = ({ y = 30 }: { y?: number }) => <><circle cx="27" cy={y} r="1.9" fill="#2b2b2b" /><circle cx="37" cy={y} r="1.9" fill="#2b2b2b" /></>;
const Smile = ({ y = 37 }: { y?: number }) => <path d={`M27 ${y} q5 4 10 0`} stroke="#7a3d2a" strokeWidth="1.8" fill="none" strokeLinecap="round" />;
const Cheeks = () => <><circle cx="23" cy="35" r="2.6" fill="#f28ab2" opacity=".5" /><circle cx="41" cy="35" r="2.6" fill="#f28ab2" opacity=".5" /></>;

export function Character({ id, size = 56 }: { id: CharacterId; size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className="bet-art" aria-hidden="true">
      {id === 'grandma' && (
        <g>
          <path d="M14 64 q0 -20 18 -20 q18 0 18 20z" fill="#b57edc" />
          <circle cx="32" cy="30" r="14" fill={SKIN} />
          <path d="M17 28 q0 -16 15 -16 q15 0 15 16 q-3 -9 -15 -9 q-12 0 -15 9z" fill="#e8e6f0" />
          <circle cx="32" cy="13" r="6" fill="#e8e6f0" />
          <circle cx="27" cy="30" r="4" fill="none" stroke="#5c4b7a" strokeWidth="1.6" /><circle cx="37" cy="30" r="4" fill="none" stroke="#5c4b7a" strokeWidth="1.6" />
          <line x1="31" y1="30" x2="33" y2="30" stroke="#5c4b7a" strokeWidth="1.6" />
          <Eyes /><Smile y={38} /><Cheeks />
        </g>
      )}
      {id === 'uncle' && (
        <g>
          <path d="M12 64 q0 -20 20 -20 q20 0 20 20z" fill="#4fb0c6" />
          <circle cx="32" cy="30" r="14" fill={SKIN} />
          <path d="M18 27 q2 -12 14 -12 q12 0 14 12 q-6 -5 -14 -5 q-8 0 -14 5z" fill="#5a3a24" />
          <path d="M20 36 q12 14 24 0 q-2 10 -12 10 q-10 0 -12 -10z" fill="#5a3a24" />
          <path d="M23 18.5 a9 5.5 0 0 1 18 0z" fill="#3b6fd9" />
          <Eyes /><path d="M28 38 q4 3 8 0" stroke="#f4ead2" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </g>
      )}
      {id === 'girl' && (
        <g>
          <path d="M16 64 q0 -18 16 -18 q16 0 16 18z" fill="#f28ab2" />
          <path d="M16 30 q-6 10 -2 20 l6 -4z M48 30 q6 10 2 20 l-6 -4z" fill="#c9705b" />
          <circle cx="32" cy="31" r="13" fill={SKIN} />
          <path d="M19 30 q0 -15 13 -15 q13 0 13 15 q-5 -8 -13 -8 q-8 0 -13 8z" fill="#c9705b" />
          <circle cx="45" cy="18" r="4" fill="#f5b841" /><circle cx="19" cy="18" r="4" fill="#f5b841" />
          <Eyes y={31} /><Smile y={37} /><Cheeks />
        </g>
      )}
      {id === 'boy' && (
        <g>
          <path d="M16 64 q0 -18 16 -18 q16 0 16 18z" fill="#7bc67e" />
          <circle cx="32" cy="31" r="13" fill={SKIN} />
          <path d="M19 28 q1 -13 13 -13 q12 0 13 13 l-4 -5 l-4 4 l-5 -5 l-5 5 l-4 -4z" fill="#3a2a1a" />
          <path d="M23 17 a9 5 0 0 1 18 0z" fill="#d9473b" />
          <Eyes y={31} /><path d="M27 37 q5 5 10 0" stroke="#7a3d2a" strokeWidth="1.8" fill="#fff" strokeLinecap="round" /><Cheeks />
        </g>
      )}
    </svg>
  );
}

/** Eight branches + raised shamash, drawn in four very different styles. */
export function MenorahVariant({ id, size = 64 }: { id: MenorahId; size?: number }) {
  const xs = [8, 14, 20, 26, 38, 44, 50, 56];
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className="bet-art" aria-hidden="true">
      {id === 'silver' && (
        <g stroke="#cfd6e6" strokeWidth="2.4" fill="none" strokeLinecap="round">
          {[6, 12, 18, 24].map((r) => <path key={r} d={`M${32 - r} 30 a${r} ${r * 0.8} 0 0 0 ${2 * r} 0`} />)}
          <path d="M32 20 v34" /><path d="M24 56 h16" strokeWidth="3.4" />
          {[...xs.map((x) => [x, 28]), [32, 18]].map(([x, y], i) => <path key={i} d={`M${x} ${y} q2 -4 0 -7 q-2 3 0 7z`} fill="#f5b841" stroke="none" />)}
        </g>
      )}
      {id === 'glass' && (
        <g>
          <rect x="4" y="34" width="56" height="5" rx="2" fill="#9fd8e8" opacity=".8" />
          <rect x="26" y="39" width="12" height="18" rx="2" fill="#9fd8e8" opacity=".7" /><rect x="18" y="56" width="28" height="4" rx="2" fill="#9fd8e8" />
          {xs.map((x) => <g key={x}><path d={`M${x - 3} 26 h6 l-1 8 h-4z`} fill="#cdeef7" stroke="#6fb7cc" strokeWidth="1" /><rect x={x - 2} y="29" width="4" height="4" fill="#f2d16b" /></g>)}
          <path d="M29 16 h6 l-1 10 h-4z" fill="#cdeef7" stroke="#6fb7cc" strokeWidth="1" />
          {[...xs.map((x) => [x, 24]), [32, 14]].map(([x, y], i) => <path key={i} d={`M${x} ${y} q2 -4 0 -7 q-2 3 0 7z`} fill="#f5b841" />)}
        </g>
      )}
      {id === 'lego' && (
        <g>
          {['#d9473b', '#f5b841', '#3b6fd9', '#7bc67e', '#7bc67e', '#3b6fd9', '#f5b841', '#d9473b'].map((c, i) => (
            <g key={i}><rect x={xs[i] - 3} y="34" width="6" height="8" fill={c} /><rect x={xs[i] - 2} y="32" width="4" height="2" fill={c} /></g>
          ))}
          <rect x="4" y="42" width="56" height="8" fill="#e8604c" />{[8, 16, 24, 32, 40, 48, 56].map((x) => <rect key={x} x={x - 2} y="40" width="4" height="2" fill="#e8604c" />)}
          <rect x="28" y="24" width="8" height="18" fill="#b57edc" /><rect x="22" y="50" width="20" height="8" fill="#5c8df6" />
          {[...xs.map((x) => [x, 32]), [32, 22]].map(([x, y], i) => <path key={i} d={`M${x} ${y} q2 -4 0 -7 q-2 3 0 7z`} fill="#f5b841" />)}
        </g>
      )}
      {id === 'clay' && (
        <g>
          <path d="M4 44 q28 10 56 0 v6 q-28 10 -56 0z" fill="#c9705b" />
          {xs.map((x, i) => <ellipse key={x} cx={x} cy={40 - (i % 2)} rx="3.6" ry="3" fill="#d98a6c" stroke="#a9563e" strokeWidth="1" />)}
          <path d="M28 44 q4 -20 8 0z" fill="#d98a6c" stroke="#a9563e" strokeWidth="1" /><ellipse cx="32" cy="24" rx="4" ry="3" fill="#d98a6c" stroke="#a9563e" strokeWidth="1" />
          <circle cx="18" cy="48" r="1.4" fill="#f4ead2" /><circle cx="32" cy="50" r="1.4" fill="#f4ead2" /><circle cx="46" cy="48" r="1.4" fill="#f4ead2" />
          {[...xs.map((x, i) => [x, 37 - (i % 2)]), [32, 21]].map(([x, y], i) => <path key={i} d={`M${x} ${y} q2 -4 0 -7 q-2 3 0 7z`} fill="#f5b841" />)}
        </g>
      )}
    </svg>
  );
}
