/**
 * Phone-side task UIs. These only COLLECT answers — correctness and points are decided on the server.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { uuid } from '../lib/uuid';
import type { PublicState, TeamState } from '../lib/types';
import { submitAnswer, type SubmitResult } from '../lib/submit';
import { friendlyError } from '../lib/errors';
import { SymbolTile } from '../components/Symbols';
import { Scene } from '../components/Scene';
import { SafeArt, OpeningSafe, type SafeState } from '../components/Safe';
import { VaultClues } from '../components/VaultClues';
import { MemorySymbol } from '../components/MemoryArt';
import { useMemoryClock, useStageData } from '../lib/memory';
import { StakeLines, stake, fmt } from '../components/BetStakes';
import { Sortable } from '../components/Sortable';
import { Character, MenorahVariant, type CharacterId, type MenorahId } from '../components/BetArt';
import type { SceneSpec } from '../content/scenes';
import { isSolved, moveTile, neighbors, type Board } from '../../supabase/functions/_shared/engine/slidingPuzzle.ts';

interface Props { client: SupabaseClient; s: PublicState; team: TeamState; onChange: () => void; offset?: number }

const HEB = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח'];
const tap = () => { try { navigator.vibrate?.(12); } catch { /* unsupported */ } };
const vibrateLong = () => { try { navigator.vibrate?.([30, 40, 60]); } catch { /* unsupported */ } };

/** Shared submit state for one item, with a stable request id per pending answer. */
function useSubmitter(client: SupabaseClient, onChange: () => void) {
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ item: number; text: string; tone: 'ok' | 'bad' | 'info' } | null>(null);
  const pending = useRef(new Map<string, string>());

  const send = async (item: number, payload: unknown): Promise<SubmitResult | null> => {
    const key = `${item}:${JSON.stringify(payload)}`;
    if (!pending.current.has(key)) pending.current.set(key, uuid());
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

// ── 4: vault — a real safe: keypad, shake on a wrong code, door swings open on the right one ──
function CodeInput({ client, s, subs, canSubmit, onChange }: CP) {
  const c = s.round?.content ?? {};
  const [code, setCode] = useState('');
  const [state, setState] = useState<SafeState>('closed');
  const [status, setStatus] = useState('');
  const [fails, setFails] = useState(0);
  const { busy, send } = useSubmitter(client, onChange);
  const solved = solvedItems(subs).has(0);
  const used = subs.filter((x) => x.item_index === 0 && x.status !== 'late').length;
  const left = Math.max(0, 3 - used);
  const press = (d: string) => { if (busy !== null || state === 'open') return; tap(); setState('closed'); setStatus(''); setCode((c) => (c.length < 4 ? c + d : c)); };
  const open = async () => {
    if (code.length !== 4) return;
    tap();
    const res = await send(0, { code });
    if (res?.correct === true) { setState('unlock'); vibrateLong(); setTimeout(() => setState('open'), 700); }
    else if (res?.correct === false) {
      setFails((n) => n + 1); setState('fail');
      try { navigator.vibrate?.([90, 60, 90, 60, 140]); } catch { /* unsupported */ }
      setStatus(res.attempts_left ? `קוד שגוי. נשארו ${res.attempts_left} ניסיונות.` : 'קוד שגוי. הכספת ננעלה.');
      setTimeout(() => { setState('closed'); setCode(''); }, 1100);
    }
  };
  if (solved || state === 'open') {
    return <div className="vault-phone done"><OpeningSafe digits={code} size={230} /><p className="ok vault-status vault-win">הכספת נפתחה!</p></div>;
  }
  if (left === 0) return <div className="vault-phone done"><SafeArt state="closed" size={200} /><p className="center-msg">הכספת ננעלה</p></div>;
  return (
    <div className="vault-phone">
      <VaultClues clues={c.clues ?? []} order={c.order_clue} />
      <div className="vault-pad">
        <div className="vault-side">
          <SafeArt key={fails} state={state} digits={code} size={112} />
          <p className={`vault-status ${state === 'fail' ? 'error' : 'muted'}`} role="status">{status || `${left} ניסיונות`}</p>
        </div>
        <div className="keypad" dir="ltr">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} disabled={!canSubmit} onClick={() => press(d)}>{d}</button>)}
          <button className="del" aria-label="מחיקה" disabled={!canSubmit || !code} onClick={() => { tap(); setCode((x) => x.slice(0, -1)); }}>⌫</button>
          <button disabled={!canSubmit} onClick={() => press('0')}>0</button>
          <button className="ok" aria-label="פתיחה" disabled={!canSubmit || code.length !== 4 || busy !== null} onClick={open}>{busy !== null ? '…' : 'פתח'}</button>
        </div>
      </div>
    </div>
  );
}

// ── 9: sprint — one question at a time, locked after sending ──
function Sprint({ client, s, subs, canSubmit, onChange }: CP) {
  const qs: any[] = s.round?.content?.questions ?? [];
  const current = submittedItems(subs).size;
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const { busy, send } = useSubmitter(client, onChange);
  useEffect(() => { setText(''); setPicked(null); }, [current]);
  if (current >= qs.length) return <p className="center-msg ok">ההגשה הושלמה</p>;
  const q = qs[current];
  const choose = (o: string) => { if (picked) return; tap(); setPicked(o); setTimeout(() => send(current, { choice: o }), 350); };
  return (
    <div className="task sprint" key={current}>
      <div className="q-progress">{qs.map((_, i) => <i key={i} className={i < current ? 'done' : i === current ? 'now' : ''} />)}</div>
      <div className="q-counter">שאלה {current + 1} מתוך {qs.length}</div>
      <h3 className="q-text">{q.text}</h3>
      {q.options ? (
        <div className={`options ${picked ? 'locked' : ''}`}>
          {q.options.map((o: string) => <button key={o} className={`option ${picked === o ? 'chosen' : ''}`} disabled={!canSubmit || busy !== null || (!!picked && picked !== o)} onClick={() => choose(o)}>{o}</button>)}
        </div>
      ) : (
        <>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="התשובה שלכם" disabled={!canSubmit} />
          <button className="primary" disabled={!canSubmit || !text.trim() || busy !== null} onClick={() => { tap(); send(current, { text }); }}>שליחה ונעילה</button>
        </>
      )}
    </div>
  );
}

// ── 5 / 8 / 13: several heats/sets, ONE at a time (no scrolling) ──
// A choice is highlighted and the pager moves on; the team can go back and change anything,
// and only the bottom button sends everything as the final answer.
function ChoiceItems({ client, s, subs, canSubmit, onChange }: CP) {
  const r = s.round!;
  const c = r.content ?? {};
  const done = submittedItems(subs);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const [zoom, setZoom] = useState<SceneSpec | null>(null);
  const items: { title: string; options: { value: string; label: string }[]; pictures?: SceneSpec[] }[] =
    r.kind === 'truth_or_fiction'
      ? (c.items ?? []).map((it: any) => ({ title: '', options: it.facts.map((f: string, i: number) => ({ value: String(i + 1), label: f })) }))
      : r.kind === 'three_pictures'
      ? (c.heats ?? []).map((h: any) => ({ title: 'באיזו תמונה הכי הרבה הבדלים?', pictures: h.pictures,
          options: (c.choices ?? ['א', 'ב', 'ג']).map((x: string) => ({ value: x, label: `תמונה ${x}` })) }))
      : (c.questions ?? []).map((q: any) => ({ title: q.text, options: q.options.map((o: string) => ({ value: o, label: o })) }));
  const unit = r.kind === 'truth_or_fiction' ? 'סט' : r.kind === 'three_pictures' ? 'מקצה' : 'שאלה';
  const allSent = items.length > 0 && items.every((_, i) => done.has(i));
  const answered = items.filter((_, i) => picked[i] !== undefined || done.has(i)).length;

  const choose = (v: string) => {
    if (done.has(idx) || sending) return;
    tap();
    const next = { ...picked, [idx]: v };
    setPicked(next);
    const nextOpen = items.findIndex((_, i) => i > idx && next[i] === undefined && !done.has(i));
    if (nextOpen >= 0) setTimeout(() => setIdx(nextOpen), 450);
  };

  const sendAll = async () => {
    setSending(true); setErr(''); tap();
    for (const [k, v] of Object.entries(picked)) {
      const i = Number(k);
      if (done.has(i)) continue;
      const res = await submitAnswer(client, i, { choice: v });
      if (!res.received && res.error && !/no_attempts_left|already_solved/.test(res.error)) setErr(friendlyError(res.error));
    }
    setSending(false); vibrateLong(); onChange();
  };

  if (allSent) {
    return (
      <div className="center-msg">
        <h3 className="ok">נשלח</h3>
        <p className="muted">{items.map((_, i) => `${unit} ${i + 1}: ${picked[i] ? items[i].options.find((o) => o.value === picked[i])?.label.slice(0, 18) : 'נשלח'}`).join(' · ')}</p>
      </div>
    );
  }
  const it = items[idx];
  if (!it) return null;
  const locked = done.has(idx);
  return (
    <div className="task pager">
      <div className="pager-nav" role="tablist">
        {items.map((_, i) => (
          <button key={i} role="tab" aria-selected={i === idx} onClick={() => { tap(); setIdx(i); }}
                  className={`${i === idx ? 'now' : ''} ${picked[i] !== undefined || done.has(i) ? 'answered' : ''}`}>
            {unit} {i + 1}
          </button>
        ))}
      </div>
      <section className="item pager-page" key={idx}>
        {!it.pictures && it.title && <h3>{it.title}</h3>}
        {it.pictures ? (
          // All three pictures at once (wide panoramas) — tap a picture to choose it.
          <div className={`pic-stack ${locked ? 'locked' : ''}`}>
            {it.pictures.map((p, j) => {
              const v = it.options[j]?.value ?? HEB[j];
              return (
                <div key={j} className={`pic-choice ${picked[idx] === v ? 'chosen' : ''}`}>
                  <span className="pic-letter" aria-hidden="true">{HEB[j]}</span>
                  <button className="pic-btn" disabled={!canSubmit || locked || sending} onClick={() => choose(v)} aria-label={`בחירה: תמונה ${HEB[j]}`}>
                    <Scene s={p} label={`תמונה ${HEB[j]}`} />
                  </button>
                  <button className="pic-zoom" aria-label={`הגדלת תמונה ${HEB[j]}`} onClick={() => setZoom(p)}>
                    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.4" /><path d="M15 15l5.5 5.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className={`options ${locked ? 'locked' : ''}`}>
            {it.options.map((o) => (
              <button key={o.value} className={`option ${picked[idx] === o.value ? 'chosen' : ''}`}
                      disabled={!canSubmit || locked || sending} onClick={() => choose(o.value)}>{o.label}</button>
            ))}
          </div>
        )}
      </section>
      <div className="pager-footer">
        <button className="primary big-cta" disabled={!canSubmit || sending || Object.keys(picked).length === 0}
                onClick={sendAll}>{sending ? 'שולחים…' : answered < items.length ? `שליחת תשובה סופית (${answered}/${items.length})` : 'שליחת תשובה סופית'}</button>
        {err && <p className="error">{err}</p>}
      </div>
      {zoom && <div className="modal" onClick={() => setZoom(null)}><div className="zoom enter"><Scene s={zoom} /><p className="muted">הקישו לסגירה</p></div></div>}
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

// ── 17: ordering — drag a row and the others slide out of its way (arrows kept as a fallback) ──
function Ordering({ client, s, subs, canSubmit, onChange }: CP) {
  const items: { id: string; label: string }[] = s.round?.content?.items ?? [];
  const [order, setOrder] = useState(() => items.map((x) => x.id));
  const { busy, msg, send } = useSubmitter(client, onChange);
  const byId = useMemo(() => new Map(items.map((x) => [x.id, x])), [items]);
  if (submittedItems(subs).has(0)) return <p className="center-msg ok">נשלח</p>;
  return (
    <div className="task ordering">
      <p className="drag-hint">גוררים כל שורה למקום שלה</p>
      <Sortable ids={order} onChange={setOrder} label="סידור לפי הסדר" disabled={!canSubmit}
                render={(id, i) => <><span className="pos">{i + 1}</span><span className="label">{byId.get(id)?.label}</span></>} />
      <button className="primary" disabled={!canSubmit || busy !== null} onClick={() => send(0, { order })}>שליחת הסדר</button>
      <Feedback m={msg} item={0} />
    </div>
  );
}

// ── 26: 3×3 sliding puzzle — tiles carry the picture and glide; moves are verified on the server ──
function Sliding({ client, s, subs, canSubmit, onChange }: CP) {
  const start: Board = s.round?.content?.start ?? [];
  const scene: SceneSpec | undefined = s.round?.content?.scene;
  const [board, setBoard] = useState<Board>(start);
  const [moves, setMoves] = useState<number[]>([]);
  const { busy, msg, send } = useSubmitter(client, onChange);
  const sentRef = useRef(false);
  const done = solvedItems(subs).has(0);

  useEffect(() => {
    if (isSolved(board) && moves.length && !sentRef.current && canSubmit) { sentRef.current = true; vibrateLong(); send(0, { moves }); }
  }, [board]); // eslint-disable-line react-hooks/exhaustive-deps

  if (done) return <div className="center-msg ok"><div className="puzzle-done">{scene && <Scene s={scene} />}</div>הפאזל הושלם!</div>;
  const blank = board.indexOf(0);
  const tapTile = (i: number) => {
    if (!canSubmit || !neighbors(blank).includes(i)) return;
    const n = moveTile(board, board[i]);
    if (n) { tap(); setBoard(n); setMoves([...moves, board[i]]); }
  };
  return (
    <div className="task sliding">
      <div className="puzzle glide" role="grid" aria-label="פאזל החלקה">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((v) => {
          const pos = board.indexOf(v);
          const home = v - 1;
          return (
            <button key={v} className={`tile ${neighbors(blank).includes(pos) ? 'movable' : ''}`}
                    style={{ '--c': pos % 3, '--r': Math.floor(pos / 3) } as React.CSSProperties}
                    onClick={() => tapTile(pos)} aria-label={`אריח ${v}`}>
              {scene ? <Scene s={scene} crop={{ col: home % 3, row: Math.floor(home / 3) }} /> : null}
            </button>
          );
        })}
      </div>
      <div className="puzzle-foot">
        {scene && <div className="puzzle-ref" aria-label="התמונה המלאה"><Scene s={scene} /></div>}
        <span className="muted">{moves.length} מהלכים</span>
        <button className="ghost small" onClick={() => { setBoard(start); setMoves([]); sentRef.current = false; }}>מההתחלה</button>
      </div>
      {busy !== null && <p className="muted">בודקים…</p>}
      <Feedback m={msg} item={0} />
    </div>
  );
}

// ── 31: bet (before the puzzle) + matching (after) ──
function BetPicker({ client, s, team, canSubmit, onChange }: CP) {
  const tracks = s.round?.bet_tracks ?? [];
  const base = s.round?.bet_base ?? 0;
  const myTotal = team.score?.total ?? null;
  const [pick, setPick] = useState<string | null>(team.bet?.track_id ?? null);
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState('');
  const locked = s.round?.phase === 'bets_locked';
  const chosen = tracks.find((t) => t.id === team.bet?.track_id);
  const place = async (id: string) => {
    const t = tracks.find((x) => x.id === id)!;
    const hasPoints = myTotal == null || myTotal > 0;
    const risky = t.lossMultiplier > 0 && hasPoints && (t.lossMultiplier >= 1 || (myTotal != null && stake(base, t.lossMultiplier) >= myTotal));
    if (risky && !confirm) { setPick(id); setConfirm(true); return; }
    setConfirm(false); setErr('');
    const { error } = await client.rpc('team_place_bet', { p_track: id });
    if (error) setErr(friendlyError(error)); else { setPick(id); onChange(); }
  };
  if (locked) {
    return (
      <div className="center-msg">
        <h3 style={{ color: 'var(--gold)' }}>{chosen?.label ?? 'זהיר'}</h3>
        {chosen && <StakeLines t={chosen} base={base} myTotal={myTotal} />}
      </div>
    );
  }
  const pending = tracks.find((t) => t.id === pick);
  return (
    <div className="task bet">
      <p className="ask">על כמה אתם מהמרים?</p>
      {myTotal === 0 && <p className="muted small">יש לכם 0 נקודות, אין מה להפסיד</p>}
      {tracks.map((t) => (
        <button key={t.id} className={`track-btn ${team.bet?.track_id === t.id ? 'chosen' : ''}`} disabled={!canSubmit} onClick={() => { tap(); place(t.id); }}>
          <b>{t.label}</b>
          <StakeLines t={t} base={base} myTotal={myTotal} />
        </button>
      ))}
      {confirm && pending && (
        <div className="confirm-box enter" role="alertdialog">
          <p><b>בטוחים?</b> אם החידה לא תיפתר, תפסידו <b className="lose-text" dir="ltr">{fmt(Math.min(stake(base, pending.lossMultiplier), myTotal ?? Infinity))}</b> נקודות{myTotal != null && stake(base, pending.lossMultiplier) >= myTotal ? ', כלומר את כל הניקוד שלכם' : ''}.</p>
          <button className="danger" onClick={() => place(pending.id)}>כן, מהמרים על {pending.label}</button>
          <button className="ghost" onClick={() => setConfirm(false)}>ביטול</button>
        </div>
      )}
      {err && <p className="error">{err}</p>}
    </div>
  );
}

/** People stay put; the menorahs are dragged up and down until each one sits opposite its owner. */
function Matching({ client, s, subs, canSubmit, onChange }: CP) {
  const c = s.round?.content ?? {};
  const people: string[] = c.people ?? [];
  const items: string[] = c.items ?? [];
  const peopleArt: CharacterId[] = c.people_art ?? [];
  const itemsArt: MenorahId[] = c.items_art ?? [];
  const clues: string[] = c.clues ?? [];
  const [order, setOrder] = useState<string[]>(() => items.map((_, j) => String(j)));
  const { busy, msg, send } = useSubmitter(client, onChange);
  if (submittedItems(subs).has(0)) return <p className="center-msg ok">נשלח</p>;
  const assignment = order.map(Number);
  return (
    <div className="task matching">
      {clues.length > 0 && <ol className="match-clues">{clues.map((cl, i) => <li key={i}>{cl}</li>)}</ol>}
      <p className="drag-hint">גוררים כל חנוכייה מול מי שבחר בה</p>
      <div className="match-board">
        <ol className="match-people" aria-label="המשתתפים">
          {people.map((p, i) => (
            <li key={i} className="person">
              {peopleArt[i] && <Character id={peopleArt[i]} size={44} />}
              <span>{p}</span>
            </li>
          ))}
        </ol>
        <Sortable ids={order} onChange={setOrder} className="match-items" disabled={!canSubmit} label="החנוכיות"
                  render={(id) => (
                    <span className="menorah-card">
                      {itemsArt[Number(id)] && <MenorahVariant id={itemsArt[Number(id)]} size={44} />}
                      <span>{items[Number(id)]}</span>
                    </span>
                  )} />
      </div>
      <button className="primary" disabled={!canSubmit || busy !== null} onClick={() => send(0, { assignment })}>שליחה</button>
      <Feedback m={msg} item={0} />
    </div>
  );
}

// ── 35: sequence memory — watch, then rebuild. One mistake ends the run. ──
/**
 * Candle memory (approved redesign). One shared, server-timed timeline: every phone and the screen
 * show the same stage and symbol together. No length hints, no counters. 20 s to rebuild the sequence.
 */
function SequenceMemory({ client, s, subs, canSubmit, onChange, offset = 0 }: CP) {
  const r = s.round!;
  const c = r.content ?? {};
  const now = useMemoryClock(r, offset);
  const palette: string[] = c.symbols ?? [];
  const stagePts: number[] = c.stage_points ?? [];
  const total = (c.stage_lengths ?? []).length;
  const stage = now?.stage ?? 0;
  const phase = now?.phase ?? 'intro';
  const data = useStageData(client, s.instance.id, stage, phase === 'show' || phase === 'recall', false);
  const [input, setInput] = useState<string[]>([]);
  const sentFor = useRef(-1);
  const { busy, send } = useSubmitter(client, onChange);
  useEffect(() => { setInput([]); }, [stage]);

  const mine = new Map(subs.filter((x) => x.status !== 'late').map((x) => [x.item_index, x]));
  const closedUpTo = phase === 'result' || phase === 'done' ? stage : stage - 1;
  let outAt = -1;
  for (let k = 0; k <= closedUpTo; k++) { const x = mine.get(k); if (!x || x.correct === false) { outAt = k; break; } }
  const passedCount = [...mine.values()].filter((x) => x.correct === true).length;
  const earned = [...mine.values()].filter((x) => x.correct === true).reduce((a, x) => a + (stagePts[x.item_index] ?? 0), 0);
  const submitted = mine.has(stage);

  // When time runs out, whatever was entered is sent automatically.
  useEffect(() => {
    if (phase === 'recall' && now && now.msLeft < 700 && input.length > 0 && !submitted && sentFor.current !== stage && canSubmit) {
      sentFor.current = stage;
      send(stage, { sequence: input });
    }
  });

  if (!now) return null;
  if (outAt >= 0 && !(phase === 'result' && outAt === stage)) {
    return <div className="mem-out enter"><h3>יצאתם מהמשחק</h3><p className="mem-earned">{earned} נקודות נשמרו</p><p className="muted">צפו במסך</p></div>;
  }
  if (phase === 'done' || passedCount === total) {
    return <div className="mem-out ok enter"><h3>כל {total} השלבים!</h3><p className="mem-earned">{earned} נקודות</p></div>;
  }
  return (
    <div className="task memory2">
      {phase === 'intro' && (
        <div className="mem-intro" key={`i${stage}`}>
          <span className="mem-stage">שלב {stage + 1} מתוך {total}</span>
          <span className="mem-ready">מסתכלים!</span>
        </div>
      )}
      {phase === 'show' && (
        <div className="mem-show" key={`s${stage}-${now.symbol}`}>
          {data.sequence ? <MemorySymbol id={data.sequence[now.symbol]} size={180} /> : <div className="waiting-dots"><i /><i /><i /></div>}
        </div>
      )}
      {phase === 'recall' && (submitted ? (
        <div className="mem-out enter"><h3>נשלח</h3><div className="waiting-dots" aria-hidden="true"><i /><i /><i /></div></div>
      ) : (
        <>
          <div className="mem-bar" aria-hidden="true"><i style={{ width: `${Math.max(0, now.msLeft / ((c.timing?.recall_ms ?? 20000))) * 100}%` }} /></div>
          <div className="mem-input" aria-label="הבחירות שלכם">
            {input.length === 0 ? <span className="muted">לוחצים לפי הסדר</span> : input.map((id, i) => <MemorySymbol key={i} id={id} size={40} small />)}
          </div>
          <div className="mem-palette">{palette.map((id) => <MemorySymbol key={id} id={id} size={58} onClick={() => { if (!canSubmit) return; tap(); setInput((x) => [...x, id]); }} />)}</div>
          <div className="row">
            <button className="ghost grow" onClick={() => setInput((x) => x.slice(0, -1))} disabled={!input.length}>מחיקה</button>
            <button className="primary grow" disabled={!canSubmit || !input.length || busy !== null} onClick={() => { sentFor.current = stage; send(stage, { sequence: input }); }}>שליחה</button>
          </div>
        </>
      ))}
      {phase === 'result' && (() => {
        const x = mine.get(stage);
        return x?.correct === true
          ? <div className="mem-result ok" key={`r${stage}`}><b>הצלחתם!</b><span>+{stagePts[stage] ?? 0}</span></div>
          : <div className="mem-result bad" key={`r${stage}`}><b>{x ? 'טעות' : 'לא נשלח בזמן'}</b><span>יצאתם, {earned} נקודות נשמרו</span></div>;
      })()}
    </div>
  );
}

// ── 9th round: answer type depends on the (not yet chosen) finale puzzle ──
function Finale(p: CP) {
  const type = p.s.round?.content?.answer_type ?? 'code';
  const [v, setV] = useState('');
  const { busy, msg, send } = useSubmitter(p.client, p.onChange);
  if (solvedItems(p.subs).has(0)) return <p className="center-msg ok">פתרתם!</p>;
  return (
    <div className="task finale">
      <input dir={type === 'code' ? 'ltr' : 'rtl'} inputMode={type === 'code' ? 'numeric' : 'text'} value={v}
             onChange={(e) => setV(type === 'code' ? e.target.value.replace(/\D/g, '') : e.target.value)} disabled={!p.canSubmit} placeholder="הפתרון" />
      <button className="primary" disabled={!p.canSubmit || !v.trim() || busy !== null} onClick={() => send(0, type === 'code' ? { code: v } : { text: v })}>שליחה</button>
      <Feedback m={msg} item={0} />
    </div>
  );
}
