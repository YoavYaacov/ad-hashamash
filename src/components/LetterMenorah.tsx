import { useId, useRef } from 'react';

/**
 * The finale menorah: each of the 8 branches carries a one-letter "candle" cell (input on the
 * phone, display on the projector). The שַׁמָּשׁ in the middle is always lit — it is its round.
 * `lit` lights the 8 flames one after another (right → left, the Hebrew reading order).
 */
const XS = [470, 420, 370, 320, 200, 150, 100, 50];
const SX = 260;
const W = 520, H = 330;
const CELL_W = 42, CELL_H = 58, CELL_BOTTOM = 142;

function Flame({ x, y, on, delay = 0, big }: { x: number; y: number; on: boolean; delay?: number; big?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${big ? 1.25 : 1})`}>
      <g className={`flame lm-flame ${on ? 'on' : 'off'}`} style={{ transitionDelay: `${delay}ms` }}>
        <ellipse cx="0" cy="-2" rx="16" ry="20" className="flame-glow" />
        <path d="M0 -26 C 7 -16, 9 -8, 0 0 C -9 -8, -7 -16, 0 -26 Z" className="flame-outer" />
        <path d="M0 -15 C 3.5 -10, 4 -5, 0 -1 C -4 -5, -3.5 -10, 0 -15 Z" className="flame-inner" />
      </g>
    </g>
  );
}

interface Props {
  letters: string[];
  onChange?: (letters: string[]) => void;
  disabled?: boolean;
  lit?: boolean;
  className?: string;
  onEnter?: () => void;
}

const HEB = /[א-ת]/;

export function LetterMenorah({ letters, onChange, disabled, lit = false, className = '', onEnter }: Props) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  // Unique gradient ids: with a shared id, a hidden copy elsewhere on the page can blank out the menorah.
  const uid = useId().replace(/:/g, '');
  const gold = `lm-gold-${uid}`, wax = `lm-wax-${uid}`;
  const editable = !!onChange;
  const set = (i: number, v: string) => {
    const next = letters.slice(); next[i] = v; onChange?.(next);
  };
  const focus = (i: number) => { const el = refs.current[i]; if (el) { el.focus(); el.select(); } };
  const pct = (v: number, of: number) => `${(100 * v) / of}%`;
  return (
    <div className={`letter-menorah ${lit ? 'lit' : ''} ${className}`} dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <defs>
          <linearGradient id={gold} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#F8DA8B" /><stop offset="1" stopColor="#B8862F" /></linearGradient>
          <linearGradient id={wax} x1="0" x2="1"><stop offset="0" stopColor="#F3EDE0" /><stop offset="1" stopColor="#D9CFBC" /></linearGradient>
        </defs>
        {[60, 110, 160, 210].map((r) => (
          <path key={r} d={`M ${SX - r} 150 A ${r} ${r * 0.55} 0 0 0 ${SX + r} 150`} fill="none" stroke={`url(#${gold})`} strokeWidth="7" strokeLinecap="round" />
        ))}
        {XS.map((x) => <rect key={x} x={x - 22} y={142} width={44} height={10} rx={3} fill={`url(#${gold})`} />)}
        <rect x={SX - 6} y={90} width={12} height={180} fill={`url(#${gold})`} />
        <rect x={SX - 18} y={82} width={36} height={12} rx={4} fill={`url(#${gold})`} />
        <path d={`M ${SX - 70} 300 Q ${SX} 255 ${SX + 70} 300 Z`} fill={`url(#${gold})`} />
        <rect x={SX - 80} y={298} width={160} height={10} rx={5} fill={`url(#${gold})`} />
        {XS.map((x, i) => (
          <g key={i}>
            <line x1={x} y1={CELL_BOTTOM - CELL_H} x2={x} y2={CELL_BOTTOM - CELL_H - 7} stroke="#3a2f22" strokeWidth={2} />
            <Flame x={x} y={CELL_BOTTOM - CELL_H - 7} on={lit} delay={300 + i * 260} />
          </g>
        ))}
        <rect x={SX - 8} y={22} width={16} height={60} rx={3} fill={`url(#${wax})`} stroke="var(--gold)" strokeWidth={1.5} />
        <line x1={SX} y1={22} x2={SX} y2={15} stroke="#3a2f22" strokeWidth={2} />
        <Flame x={SX} y={15} on big />
      </svg>
      {XS.map((x, i) => {
        const style = { left: pct(x - CELL_W / 2, W), top: pct(CELL_BOTTOM - CELL_H, H), width: pct(CELL_W, W), height: pct(CELL_H, H),
                        '--i': i } as React.CSSProperties;
        const v = letters[i] ?? '';
        return editable ? (
          <input key={i} ref={(el) => { refs.current[i] = el; }} className={`lm-cell ${v ? 'full' : ''}`} style={style}
                 dir="rtl" inputMode="text" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                 enterKeyHint={i === 7 ? 'done' : 'next'} aria-label={`אות ${i + 1}`} value={v} disabled={disabled}
                 onFocus={(e) => e.currentTarget.select()}
                 onChange={(e) => {
                   const chars = [...e.currentTarget.value].filter((c) => HEB.test(c));
                   const c = chars.length ? chars[chars.length - 1] : '';
                   set(i, c);
                   if (c && i < 7) focus(i + 1);
                 }}
                 onKeyDown={(e) => {
                   if (e.key === 'Backspace' && !v && i > 0) { e.preventDefault(); set(i - 1, ''); focus(i - 1); }
                   else if (e.key === 'Enter') { e.preventDefault(); if (i < 7) focus(i + 1); else onEnter?.(); }
                 }} />
        ) : (
          <span key={i} className={`lm-cell ${v ? 'full' : ''}`} style={style}>{v}</span>
        );
      })}
    </div>
  );
}
