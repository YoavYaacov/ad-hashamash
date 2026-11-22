/**
 * Phone-side task UIs. These only COLLECT answers — correctness and points are decided on the server.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PublicState, TeamState } from '../lib/types';
import { submitAnswer, type SubmitResult } from '../lib/submit';
import { friendlyError } from '../lib/errors';
import { SymbolTile } from '../components/Symbols';
import { isSolved, moveTile, neighbors, type Board } from '../../supabase/functions/_shared/engine/slidingPuzzle.ts';

interface Props { client: SupabaseClient; s: PublicState; team: TeamState; onChange: () => void }

const HEB = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח'];

/** Shared submit state for one item, with a stable request id per pending answer. */
function useSubmitter(client: SupabaseClient, onChange: () => void) {
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ item: number; text: string; tone: 'ok' | 'bad' | 'info' } | null>(null);
  const pending = useRef(new Map<string, string>());

  const send = async (item: number, payload: unknown): Promise<SubmitResult | null> => {
    const key = `${item}:${JSON.stringify(payload)}`;
    if (!pending.current.has(key)) pending.current.set(key, crypto.randomUUID());
    setBusy(item); setMsg(null);
    const res = await submitAnswer(client, item, payload, pending.current.get(key));
    setBusy(null);
    if (res.received) {
      pending.current.delete(key);
      if (res.status === 'late') setMsg({ item, text: 'התשובה הגיעה אחרי שהזמן נגמר.', tone: 'bad' });
      else if (res.correct === true) setMsg({ item, text: 'נכון!', tone: 'ok' });
      else if (res.correct === false) setMsg({ item, text: res.attempts_left ? `לא נכון. נשארו ${res.attempts_left} ניסיונות.` : 'לא נכון.', tone: 'bad' });
      else setMsg({ item, text: 'התשובה התקבלה ✓', tone: 'info' });
      onChange();
    } else {
      setMsg({ item, text: friendlyError(res.error), tone: 'bad' });
      if (res.status !== 'network') pending.current.delete(key);
      onChange();
    }
    return res;
  };
  return { busy, msg, send };
}

export function TaskInput(p: Props) {
  const r = p.s.round!;
  const canSubmit = p.team.team?.role === 'captain';
  const subs = p.team.round_submissions ?? [];
  const common = { ...p, canSubmit, subs };
  if (r.phase === 'betting' || r.phase === 'bets_locked') return <BetPicker {...common} />;
  switch (r.kind) {
    case 'code_vault': return <CodeInput {...common} />;
    case 'sprint': return <Sprint {...common} />;
    case 'video_memory': case 'truth_or_fiction': case 'three_pictures': return <ChoiceItems {...common} />;
    case 'symbols': return <TextItems {...common} />;
    case 'ordering': return <Ordering {...common} />;
    case 'sliding_puzzle': return <Sliding {...common} />;
    case 'bet_puzzle': return <Matching {...common} />;
    case 'sequence_memory': return <SequenceMemory {...common} />;
    case 'finale': return <Finale {...common} />;
  }
}

type CP = Props & { canSubmit: boolean; subs: NonNullable<TeamState['round_submissions']> };

const Feedback = ({ m, item }: { m: ReturnType<typeof useSubmitter>['msg']; item: number }) =>
  m && m.item === item ? <p className={`feedback ${m.tone}`} role="status">{m.text}</p> : null;

const submittedItems = (subs: CP['subs']) => new Set(subs.filter((x) => x.status !== 'late').map((x) => x.item_index));
const solvedItems = (subs: CP['subs']) => new Set(subs.filter((x) => x.correct === true).map((x) => x.item_index));

// ── 4: vault ──
function CodeInput({ client, s, subs, canSubmit, onChange }: CP) {
  const [code, setCode] = useState('');
  const { busy, msg, send } = useSubmitter(client, onChange);
  const solved = solvedItems(subs).has(0);
  const used = subs.filter((x) => x.item_index === 0).length;
  if (solved) return <p className="center-msg ok">הכספת נפתחה! ✓</p>;
  return (
    <div className="task code">
      <p className="muted">הקלידו את הקוד בן 4 הספרות. ניסיונות שנוצלו: {used}</p>
      <input className="code-input" dir="ltr" inputMode="numeric" maxLength={4} value={code}
             onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} aria-label="קוד" disabled={!canSubmit} />
      <button className="primary" disabled={!canSubmit || code.length !== 4 || busy !== null} onClick={() => send(0, { code })}>פותחים את הכספת</button>
      <Feedback m={msg} item={0} />
      {s.round?.content?.order_clue && <p className="hint">רמז הסדר מופיע על המסך</p>}
    </div>
  );
}

// ── 9: sprint — one question at a time, locked after sending ──
function Sprint({ client, s, subs, canSubmit, onChange }: CP) {
  const qs: any[] = s.round?.content?.questions ?? [];
  const current = submittedItems(subs).size;
  const [text, setText] = useState('');
  const { busy, msg, send } = useSubmitter(client, onChange);
  useEffect(() => setText(''), [current]);
  if (current >= qs.length) return <p className="center-msg">שלחתם את כל {qs.length} התשובות ✓</p>;
  const q = qs[current];
  return (
    <div className="task sprint">
      <div className="q-counter">שאלה {current + 1} מתוך {qs.length} · אין חזרה אחורה</div>
      <h3 className="q-text">{q.text}</h3>
      {q.options ? (
        <div className="options">
          {q.options.map((o: string) => <button key={o} className="option" disabled={!canSubmit || busy !== null} onClick={() => send(current, { choice: o })}>{o}</button>)}
        </div>
      ) : (
        <>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="התשובה שלכם" disabled={!canSubmit} />
          <button className="primary" disabled={!canSubmit || !text.trim() || busy !== null} onClick={() => send(current, { text })}>שליחה ונעילה</button>
        </>
      )}
      <Feedback m={msg} item={current - 1} />
    </div>
  );
}

// ── 5 / 8 / 13: one choice per item (questions / facts / heats) ──
function ChoiceItems({ client, s, subs, canSubmit, onChange }: CP) {
  const r = s.round!;
  const c = r.content ?? {};
  const done = submittedItems(subs);
  const { busy, msg, send } = useSubmitter(client, onChange);
  const items: { title: string; options: { value: string; label: string }[] }[] =
    r.kind === 'truth_or_fiction'
      ? (c.items ?? []).map((it: any) => ({ title: 'איזו עובדה מומצאת?', options: it.facts.map((f: string, i: number) => ({ value: String(i + 1), label: f })) }))
      : r.kind === 'three_pictures'
      ? (c.heats ?? []).map((_: any, i: number) => ({ title: `מקצה ${i + 1}: באיזו תמונה הכי הרבה חריגים?`, options: (c.choices ?? ['א', 'ב', 'ג']).map((x: string) => ({ value: x, label: `תמונה ${x}` })) }))
      : (c.questions ?? []).map((q: any) => ({ title: q.text, options: q.options.map((o: string) => ({ value: o, label: o })) }));
  return (
    <div className="task choices">
      {items.map((it, i) => (
        <section key={i} className={`item ${done.has(i) ? 'done' : ''}`}>
          <h3>{it.title}</h3>
          {done.has(i) ? <p className="ok">נשלח ✓</p> : (
            <div className="options">
              {it.options.map((o) => <button key={o.value} className="option" disabled={!canSubmit || busy !== null} onClick={() => send(i, { choice: o.value })}>{o.label}</button>)}
            </div>
          )}
          <Feedback m={msg} item={i} />
        </section>
      ))}
    </div>
  );
}

// ── 11: free-text puzzles, any order ──
function TextItems({ client, s, subs, canSubmit, onChange }: CP) {
  const puzzles: any[] = s.round?.content?.puzzles ?? [];
  const [vals, setVals] = useState<string[]>(() => puzzles.map(() => ''));
  const [open, setOpen] = useState(0);
  const solved = solvedItems(subs);
  const { busy, msg, send } = useSubmitter(client, onChange);
  return (
    <div className="task text-items">
      <div className="tabs">{puzzles.map((_, i) => <button key={i} className={`${open === i ? 'on' : ''} ${solved.has(i) ? 'solved' : ''}`} onClick={() => setOpen(i)}>{i + 1}</button>)}</div>
      {puzzles[open] && (
        <section className="item">
          <div className="symbol-row">{puzzles[open].symbols.map((id: string, j: number) => <SymbolTile key={j} id={id} size={64} />)}</div>
          {solved.has(open) ? <p className="ok">פתרתם ✓</p> : (
            <>
              <input value={vals[open] ?? ''} onChange={(e) => setVals(vals.map((v, j) => (j === open ? e.target.value : v)))} placeholder="מה הפתרון?" disabled={!canSubmit} />
              <button className="primary" disabled={!canSubmit || !vals[open]?.trim() || busy !== null} onClick={() => send(open, { text: vals[open] })}>בדיקה</button>
            </>
          )}
          <Feedback m={msg} item={open} />
        </section>
      )}
    </div>
  );
}

// ── 17: ordering, with accessible move buttons ──
function Ordering({ client, s, subs, canSubmit, onChange }: CP) {
  const items: { id: string; label: string }[] = s.round?.content?.items ?? [];
  const [order, setOrder] = useState(() => items.map((x) => x.id));
  const { busy, msg, send } = useSubmitter(client, onChange);
  const byId = useMemo(() => new Map(items.map((x) => [x.id, x])), [items]);
  if (submittedItems(subs).has(0)) return <p className="center-msg">הסדר נשלח ✓</p>;
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const n = order.slice(); [n[i], n[j]] = [n[j], n[i]]; setOrder(n);
  };
  return (
    <div className="task ordering">
      <ol className="order-list">
        {order.map((id, i) => (
          <li key={id}>
            <span className="pos">{i + 1}</span>
            <span className="label">{byId.get(id)?.label}</span>
            <button aria-label="הזזה למעלה" disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
            <button aria-label="הזזה למטה" disabled={i === order.length - 1} onClick={() => move(i, 1)}>▼</button>
          </li>
        ))}
      </ol>
      <button className="primary" disabled={!canSubmit || busy !== null} onClick={() => send(0, { order })}>שליחת הסדר</button>
      <Feedback m={msg} item={0} />
    </div>
  );
}

// ── 26: 3×3 sliding puzzle — moves are replayed and verified on the server ──
function Sliding({ client, s, subs, canSubmit, onChange }: CP) {
  const start: Board = s.round?.content?.start ?? [];
  const [board, setBoard] = useState<Board>(start);
  const [moves, setMoves] = useState<number[]>([]);
  const { busy, msg, send } = useSubmitter(client, onChange);
  const sentRef = useRef(false);
  const done = solvedItems(subs).has(0);

  useEffect(() => {
    if (isSolved(board) && moves.length && !sentRef.current && canSubmit) { sentRef.current = true; send(0, { moves }); }
  }, [board]); // eslint-disable-line react-hooks/exhaustive-deps

  if (done) return <p className="center-msg ok">הפאזל הושלם! ✓</p>;
  const blank = board.indexOf(0);
  const tap = (i: number) => {
    if (!canSubmit || !neighbors(blank).includes(i)) return;
    const n = moveTile(board, board[i]);
    if (n) { setBoard(n); setMoves([...moves, board[i]]); }
  };
  return (
    <div className="task sliding">
      <div className="puzzle" role="grid" aria-label="פאזל החלקה">
        {board.map((v, i) => (
          <button key={i} className={`tile ${v === 0 ? 'blank' : ''} ${neighbors(blank).includes(i) ? 'movable' : ''}`}
                  style={v ? { '--tx': ((v - 1) % 3), '--ty': Math.floor((v - 1) / 3) } as React.CSSProperties : undefined}
                  onClick={() => tap(i)} disabled={v === 0} aria-label={v ? `אריח ${v}` : 'משבצת ריקה'}>{v || ''}</button>
        ))}
      </div>
      <p className="muted">מהלכים: {moves.length}</p>
      <button className="ghost" onClick={() => { setBoard(start); setMoves([]); sentRef.current = false; }}>התחלה מחדש</button>
      {busy !== null && <p className="muted">שולחים…</p>}
      <Feedback m={msg} item={0} />
    </div>
  );
}

// ── 31: bet (before the puzzle) + matching (after) ──
function BetPicker({ client, s, team, canSubmit, onChange }: CP) {
  const tracks = s.round?.bet_tracks ?? [];
  const [pick, setPick] = useState<string | null>(team.bet?.track_id ?? null);
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState('');
  const locked = s.round?.phase === 'bets_locked';
  const place = async (id: string) => {
    const t = tracks.find((x) => x.id === id)!;
    if (t.lossMultiplier >= 1 && !confirm) { setPick(id); setConfirm(true); return; }
    setConfirm(false); setErr('');
    const { error } = await client.rpc('team_place_bet', { p_track: id });
    if (error) setErr(friendlyError(error)); else { setPick(id); onChange(); }
  };
  if (locked) return <p className="center-msg">ההימור ננעל: <b>{tracks.find((t) => t.id === team.bet?.track_id)?.label ?? 'לא נבחר'}</b></p>;
  return (
    <div className="task bet">
      <p>בחרו מסלול לפני שהחידה נחשפת:</p>
      {tracks.map((t) => (
        <button key={t.id} className={`track-btn ${team.bet?.track_id === t.id ? 'on' : ''}`} disabled={!canSubmit} onClick={() => place(t.id)}>
          <b>{t.label}</b><span>הצלחה +{t.winMultiplier}× · כישלון −{t.lossMultiplier}×</span>
        </button>
      ))}
      {team.bet && <p className="ok">בחרתם: {tracks.find((t) => t.id === team.bet!.track_id)?.label} (בסיס {team.bet.base_points}). אפשר לשנות עד הנעילה.</p>}
      {confirm && pick && (
        <div className="confirm-box" role="alertdialog">
          <p><b>זהירות:</b> במסלול הזה כישלון עלול לאפס את כל הניקוד שלכם.</p>
          <button className="danger" onClick={() => place(pick)}>כן, אנחנו מהמרים</button>
          <button className="ghost" onClick={() => setConfirm(false)}>ביטול</button>
        </div>
      )}
      {err && <p className="error">{err}</p>}
    </div>
  );
}

function Matching({ client, s, subs, canSubmit, onChange }: CP) {
  const c = s.round?.content ?? {};
  const people: string[] = c.people ?? [];
  const items: string[] = c.items ?? [];
  const [a, setA] = useState<number[]>(() => people.map(() => -1));
  const { busy, msg, send } = useSubmitter(client, onChange);
  if (submittedItems(subs).has(0)) return <p className="center-msg">התשובה נשלחה ✓</p>;
  const valid = a.every((x) => x >= 0) && new Set(a).size === a.length;
  return (
    <div className="task matching">
      {people.map((p, i) => (
        <label key={i} className="match-row">{p}
          <select value={a[i]} onChange={(e) => setA(a.map((x, j) => (j === i ? Number(e.target.value) : x)))}>
            <option value={-1}>בחרו…</option>
            {items.map((it, j) => <option key={j} value={j}>{it}</option>)}
          </select>
        </label>
      ))}
      {!valid && a.every((x) => x >= 0) && <p className="warn">כל פריט יכול להופיע פעם אחת בלבד.</p>}
      <button className="primary" disabled={!canSubmit || !valid || busy !== null} onClick={() => send(0, { assignment: a })}>שליחה</button>
      <Feedback m={msg} item={0} />
    </div>
  );
}

// ── 35: sequence memory — watch, then rebuild. One mistake ends the run. ──
function SequenceMemory({ client, s, subs, canSubmit, onChange }: CP) {
  const c = s.round?.content ?? {};
  const stages: string[][] = c.stages ?? [];
  const palette: string[] = c.symbols ?? [];
  const showMs: number = c.show_ms_per_symbol ?? 900;
  const passed = solvedItems(subs).size;
  const failed = subs.some((x) => x.correct === false);
  const stage = passed;
  const [mode, setMode] = useState<'ready' | 'show' | 'recall'>('ready');
  const [shown, setShown] = useState(0);
  const [input, setInput] = useState<string[]>([]);
  const { busy, msg, send } = useSubmitter(client, onChange);

  useEffect(() => { setMode('ready'); setInput([]); }, [stage]);
  useEffect(() => {
    if (mode !== 'show') return;
    setShown(0);
    const seq = stages[stage];
    let i = 0;
    const id = setInterval(() => { i++; if (i >= seq.length) { clearInterval(id); setTimeout(() => setMode('recall'), showMs); } setShown(i); }, showMs);
    return () => clearInterval(id);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) return <p className="center-msg">הריצה הסתיימה. עברתם {passed} שלבים — הנקודות נשמרו.</p>;
  if (stage >= stages.length) return <p className="center-msg ok">השלמתם את כל השלבים! ✓</p>;
  const seq = stages[stage];
  return (
    <div className="task memory">
      <div className="q-counter">שלב {stage + 1} · {seq.length} סמלים</div>
      {mode === 'ready' && <button className="primary" disabled={!canSubmit} onClick={() => setMode('show')}>מוכנים? הצגת הרצף</button>}
      {mode === 'show' && <div className="memory-show"><SymbolTile id={seq[Math.min(shown, seq.length - 1)]} size={160} /></div>}
      {mode === 'recall' && (
        <>
          <div className="memory-input">{seq.map((_, i) => <span key={i} className="slot">{input[i] ? <SymbolTile id={input[i]} size={44} /> : HEB[i]}</span>)}</div>
          <div className="palette">{palette.map((id) => <SymbolTile key={id} id={id} size={64} label onClick={() => input.length < seq.length && setInput([...input, id])} />)}</div>
          <div className="row">
            <button className="ghost" onClick={() => setInput(input.slice(0, -1))} disabled={!input.length}>מחיקה</button>
            <button className="primary" disabled={!canSubmit || input.length !== seq.length || busy !== null} onClick={() => send(stage, { sequence: input })}>שליחה</button>
          </div>
        </>
      )}
      <Feedback m={msg} item={stage} />
    </div>
  );
}

// ── 9th round: answer type depends on the (not yet chosen) finale puzzle ──
function Finale(p: CP) {
  const type = p.s.round?.content?.answer_type ?? 'code';
  const [v, setV] = useState('');
  const { busy, msg, send } = useSubmitter(p.client, p.onChange);
  if (solvedItems(p.subs).has(0)) return <p className="center-msg ok">פתרתם! מחכים לשאר הקבוצות…</p>;
  return (
    <div className="task finale">
      <input dir={type === 'code' ? 'ltr' : 'rtl'} inputMode={type === 'code' ? 'numeric' : 'text'} value={v}
             onChange={(e) => setV(type === 'code' ? e.target.value.replace(/\D/g, '') : e.target.value)} disabled={!p.canSubmit} placeholder="הפתרון" />
      <button className="primary" disabled={!p.canSubmit || !v.trim() || busy !== null} onClick={() => send(0, type === 'code' ? { code: v } : { text: v })}>שליחה</button>
      <Feedback m={msg} item={0} />
    </div>
  );
}
