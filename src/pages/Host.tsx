/**
 * /host — the host's phone console. Email/password sign-in; the account must be listed in public.hosts.
 * Reads full data via RLS (hosts only), acts only through RPCs / the Edge Function.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMemoryClock } from '../lib/memory';
import type { MemoryNow } from '../../supabase/functions/_shared/engine/memory.ts';
import type { Session } from '@supabase/supabase-js';
import { useClient } from '../lib/clientContext';
import { usePublicState, useServerClock, useAutoStandings, useTick } from '../lib/hooks';
import { friendlyError } from '../lib/errors';
import { Timer } from '../components/Timer';
import { APP_NAME, FINALE_NAME } from '../config';


export default function Host() {
  const client = useClient('host');
  const [session, setSession] = useState<Session | null>(null);
  const [isHost, setIsHost] = useState<boolean | null>(null);

  useEffect(() => {
    client.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = client.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session) { setIsHost(null); return; }
    client.rpc('am_i_host').then(({ data }) => setIsHost(data === true));
  }, [session]);

  if (!session) return <Login />;
  if (isHost === null) return <div className="host"><p className="muted">בודקים הרשאות…</p></div>;
  if (!isHost) return <div className="host"><p className="error">החשבון הזה אינו מוגדר כמנחה.</p><button onClick={() => client.auth.signOut()}>יציאה</button></div>;
  return <Console />;
}

function Login() {
  const client = useClient('host');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  return (
    <div className="host login">
      <h1>{APP_NAME} · מנחה</h1>
      <label>אימייל<input dir="ltr" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>סיסמה<input dir="ltr" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
      <button className="primary" onClick={async () => {
        const { error } = await client.auth.signInWithPassword({ email, password: pw });
        if (error) setErr('פרטי הכניסה שגויים.');
      }}>כניסה</button>
      {err && <p className="error">{err}</p>}
    </div>
  );
}

interface Sub { id: number; team_id: string; item_index: number; attempt_no: number; status: string; ratio: number | null; payload: any; received_at: string }

function Console() {
  const client = useClient('host');
  const { state, version, conn, refetch } = usePublicState(client);
  const offset = useServerClock(client);
  const [templates, setTemplates] = useState<{ id: string; name: string; is_placeholder: boolean }[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string; color: string; members: string[]; status: string }[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [finals, setFinals] = useState<any>(null);
  const [review, setReview] = useState<Sub[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  const [confirm, setConfirm] = useState<{ text: string; run: () => Promise<void> } | null>(null);

  const inst = state?.instance;
  const r = state?.round;

  const load = useCallback(async () => {
    const t = await client.from('game_templates').select('id, name, is_placeholder').order('created_at');
    setTemplates(t.data ?? []);
    if (!inst) return;
    const tm = await client.from('teams').select('id, name, color, members, status').eq('instance_id', inst.id).order('created_at');
    setTeams(tm.data ?? []);
    if (inst.current_round) {
      const s = await client.from('submissions').select('id, team_id, item_index, attempt_no, status, ratio, payload, received_at')
        .eq('instance_id', inst.id).eq('round_no', inst.current_round).order('received_at');
      setSubs(s.data ?? []);
      setReview((s.data ?? []).filter((x) => x.status === 'needs_review'));
    }
    const f = await client.from('finals').select('*').eq('instance_id', inst.id).maybeSingle();
    setFinals(f.data);
  }, [inst?.id, inst?.current_round]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load, version]);
  // Submissions don't broadcast (Realtime rate limits) → poll while a round is live.
  useEffect(() => {
    if (!r || !['open', 'paused', 'closed'].includes(r.phase)) return;
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [r?.phase, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn: () => PromiseLike<{ error: any; data?: any }>, ok?: string) => {
    setBusy(true);
    const { error, data } = await fn();
    setBusy(false);
    if (error) {
      let msg = error.message;
      try { const b = await error.context?.json?.(); if (b?.error) msg = b.error; } catch { /* ignore */ }
      setToast({ text: friendlyError(msg), bad: true });
    } else if (ok) setToast({ text: ok });
    refetch();   // don't wait for Realtime: show the new state right away
    load();
    return data;
  };
  const edge = (body: Record<string, unknown>) => client.functions.invoke('game', { body });
  const rpc = (fn: string, args: Record<string, unknown>) => client.rpc(fn, args);
  const ask = (text: string, run: () => Promise<void>) => setConfirm({ text, run });
  // Notifications fade by themselves (errors stay a bit longer).
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.bad ? 5000 : 2200);
    return () => clearTimeout(id);
  }, [toast]);
  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? '—';
  const [transfer, setTransfer] = useState<{ name: string; code: string } | null>(null);
  const issueTransfer = async (id: string, name: string) => {
    const { data, error } = await client.rpc('host_issue_transfer_code', { p_team: id });
    if (error) setToast({ text: friendlyError(error), bad: true }); else setTransfer({ name, code: data as string });
  };

  // ── Automatic flow (runs on the host phone): time up / everyone finished → close → grade → reveal.
  // Only decisions that matter stay manual: opening a round, uncertain answers, next round, finals.
  useTick(1000);
  useWakeLock();
  const autoDone = useRef(new Set<string>());
  const lastGrade = useRef(0);
  const activeTeams = teams.filter((t) => t.status === 'active');
  const memNow = useMemoryClock(r?.kind === 'sequence_memory' ? r : null, offset);
  const allDone = !!r && activeTeams.length > 0 && activeTeams.every((t) => teamFinished(r, subs.filter((x) => x.team_id === t.id && x.status !== 'late'), memNow));
  const doneCount = r ? activeTeams.filter((t) => teamFinished(r, subs.filter((x) => x.team_id === t.id && x.status !== 'late'), memNow)).length : 0;
  const [autoNote, setAutoNote] = useState('');
  useEffect(() => {
    if (!inst || !r || inst.status !== 'in_progress' || busy) return;
    const key = `${inst.id}:${r.no}:${r.phase}`;
    const once = (tag: string, fn: () => void) => { if (!autoDone.current.has(key + tag)) { autoDone.current.add(key + tag); fn(); } };
    if (r.phase === 'open') {
      const ends = r.ends_at ? Date.parse(r.ends_at) : null;
      const timeUp = ends != null && Date.now() + offset >= ends + 800;
      if (timeUp || allDone) once(':close', () => {
        setAutoNote(timeUp ? 'הזמן נגמר' : 'כל הקבוצות סיימו');
        setTimeout(() => act(() => rpc('host_round_action', { p_instance: inst.id, p_round: r.no, p_action: 'close' })), allDone && !timeUp ? 1500 : 0);
      });
    }
    if (r.phase === 'closed' && review.length === 0 && Date.now() - lastGrade.current > 5000) {
      lastGrade.current = Date.now();
      act(() => edge({ action: 'grade_round', instance_id: inst.id, round_no: r.no })).then((res) => {
        if (res?.needs_review?.length) setToast({ text: `${res.needs_review.length} תשובות צריכות הכרעה שלך`, bad: true });
      });
    }
    if (r.phase === 'graded') once(':reveal', () => setTimeout(() => act(() => rpc('host_round_action', { p_instance: inst.id, p_round: r.no, p_action: 'reveal' })), 1200));
    if (r.phase === 'revealed' && r.no === 8 && !finals) once(':finals', () => act(() => edge({ action: 'compute_finals', instance_id: inst.id })));
  }); // runs every tick
  useEffect(() => { setAutoNote(''); }, [r?.no, r?.phase]);

  return (
    <div className="host">
      <header className="host-bar">
        <b>{APP_NAME}</b>
        {inst && <span className={`mode ${inst.mode}`}>{inst.mode === 'demo' ? 'ניסיון' : 'אמיתי'}</span>}
        <span className={`dot ${conn}`} aria-label={conn} />
      </header>

      {toast && <div className={`toast ${toast.bad ? 'bad' : ''}`} onClick={() => setToast(null)} role="status">{toast.text}</div>}

      {!inst && (
        <section className="card">
          <h2>יצירת משחק</h2>
          {templates.map((t) => (
            <div key={t.id} className="row">
              <span>{t.name}</span>
              <button disabled={busy} onClick={() => act(() => rpc('host_create_instance', { p_template: t.id, p_mode: 'demo' }), 'נוצר משחק ניסיון')}>ניסיון</button>
              <button disabled={busy || t.is_placeholder} title={t.is_placeholder ? 'תצורת דמה' : ''}
                      onClick={() => ask('ליצור משחק אמיתי?', async () => { await act(() => rpc('host_create_instance', { p_template: t.id, p_mode: 'live' }), 'נוצר משחק אמיתי'); })}>אמיתי</button>
            </div>
          ))}
        </section>
      )}

      {inst && ['setup', 'registration_open', 'registration_locked'].includes(inst.status) && (
        <section className="card">
          <h2>הרשמה</h2>
          <div className="big-buttons">
            {inst.status !== 'registration_open'
              ? <button className="primary" disabled={busy} onClick={() => act(() => rpc('host_set_registration', { p_instance: inst.id, p_open: true }))}>פתיחת הרשמה</button>
              : <button className="ghost" disabled={busy} onClick={() => act(() => rpc('host_set_registration', { p_instance: inst.id, p_open: false }))}>סגירת הרשמה</button>}
            {inst.status !== 'setup' && (
              <button className="go" disabled={busy || activeTeams.length < 2} onClick={() => ask(`להתחיל עם ${activeTeams.length} קבוצות?`, async () => {
                if (inst.status === 'registration_open') await act(() => rpc('host_set_registration', { p_instance: inst.id, p_open: false }));
                await act(() => rpc('host_start_game', { p_instance: inst.id }));
              })}>התחלת המשחק</button>
            )}
          </div>
          <TeamList teams={teams} onTransfer={issueTransfer} onRemove={(id, name) => ask(`להסיר את "${name}"?`, async () => { await act(() => rpc('host_remove_team', { p_team: id })); })} />
        </section>
      )}

      {inst?.status === 'in_progress' && r && (
        <section className="card round-card">
          <h2>{r.is_finale ? FINALE_NAME : `סבב ${r.no} / 8`} · {r.title}</h2>
          <div className="phase">שלב: <b>{PHASES[r.phase] ?? r.phase}</b> · {new Set(subs.filter((x) => x.status !== 'late').map((x) => x.team_id)).size}/{r.progress.total_teams} שלחו</div>
          {(r.phase === 'open' || r.phase === 'paused') && <Timer endsAt={r.ends_at} pausedMs={r.paused_remaining_ms} offset={offset} total={r.duration_sec} />}
          {r.kind === 'three_pictures' && ['open', 'paused', 'closed', 'graded'].includes(r.phase) && (
            <div className="heat-picker">
              <span>על המסך:</span>
              {Array.from({ length: r.item_count }, (_, i) => (
                <button key={i} className={(r.screen_item ?? 0) === i ? 'on' : ''}
                        onClick={() => act(() => rpc('host_set_screen_item', { p_instance: inst.id, p_item: i }))}>מקצה {i + 1}</button>
              ))}
            </div>
          )}
          <div className="big-buttons">
            {r.phase === 'intro' && r.kind === 'bet_puzzle' && <button className="go" disabled={busy} onClick={() => act(() => rpc('host_round_action', { p_instance: inst.id, p_round: r.no, p_action: 'open_betting' }))}>פתיחת הימורים</button>}
            {r.phase === 'betting' && <button className="go" disabled={busy} onClick={async () => {
              await act(() => rpc('host_round_action', { p_instance: inst.id, p_round: r.no, p_action: 'lock_bets' }));
              await act(() => rpc('host_round_action', { p_instance: inst.id, p_round: r.no, p_action: 'open' }));
            }}>נעילה וחשיפת החידה</button>}
            {((r.phase === 'intro' && r.kind !== 'bet_puzzle') || r.phase === 'bets_locked') && (
              <button className="go" disabled={busy} onClick={() => act(() => rpc('host_round_action', { p_instance: inst.id, p_round: r.no, p_action: 'open' }))}>{r.kind === 'bet_puzzle' ? 'חשיפת החידה' : 'פתיחה'}</button>
            )}
            {(r.phase === 'open' || r.phase === 'paused') && (
              <>
                <p className="auto-note">{autoNote || `${doneCount}/${activeTeams.length} סיימו · נסגר לבד בסוף הזמן`}</p>
                <div className="row">
                  {r.phase === 'open'
                    ? (r.kind !== 'sequence_memory' && <button className="grow" disabled={busy} onClick={() => act(() => rpc('host_round_action', { p_instance: inst.id, p_round: r.no, p_action: 'pause' }))}>השהיה</button>)
                    : <button className="grow primary" disabled={busy} onClick={() => act(() => rpc('host_round_action', { p_instance: inst.id, p_round: r.no, p_action: 'resume' }))}>המשך</button>}
                  <button className="grow ghost" disabled={busy} onClick={() => act(() => rpc('host_round_action', { p_instance: inst.id, p_round: r.no, p_action: 'close' }))}>סגירה עכשיו</button>
                </div>
              </>
            )}
            {(r.phase === 'closed' || r.phase === 'graded') && review.length === 0 && <p className="auto-note">בודקים וחושפים…</p>}
            {r.phase === 'revealed' && (
              <>
                <StandingsControl inst={inst} r={r} offset={offset}
                  onShow={() => act(() => rpc('host_set_screen_view', { p_instance: inst.id, p_view: 'standings' }))}
                  onPin={() => act(() => rpc('host_pin_solution', { p_instance: inst.id, p_pin: true }))} />
                {r.no < 9 && <button className="go" disabled={busy || (r.no === 8 && !finals?.chosen_option)} onClick={() => act(() => rpc('host_next_round', { p_instance: inst.id }))}>{r.no === 8 ? `ל${FINALE_NAME}` : 'לסבב הבא'}</button>}
                {r.no === 8 && finals && !finals.chosen_option && <p className="auto-note">בחרו חלופת ניקוד לגמר למטה</p>}
                {r.no === 9 && <button className="go" disabled={busy} onClick={() => ask('לסיים ולהכריז על האלופה?', async () => { await act(() => rpc('host_finish_game', { p_instance: inst.id })); })}>סיום והכרזה</button>}
              </>
            )}
          </div>

          {review.length > 0 && (
            <div className="review">
              <h3>להכרעה שלך</h3>
              {review.map((s) => (
                <div key={s.id} className="row">
                  <span>{teamName(s.team_id)} · פריט {s.item_index + 1}: <b>{s.payload?.text ?? JSON.stringify(s.payload)}</b></span>
                  <button className="go" onClick={() => act(() => edge({ action: 'review', submission_id: s.id, accept: true }))}>לקבל</button>
                  <button className="danger" onClick={() => act(() => edge({ action: 'review', submission_id: s.id, accept: false }))}>לדחות</button>
                </div>
              ))}
            </div>
          )}

          {finals && r.no >= 8 && <FinalsPanel finals={finals} teamName={teamName} locked={r.no === 9 && r.phase !== 'intro'}
            onChoose={(o) => ask(`לאשר את חלופה ${o}? אחרי האישור לא ניתן לשנות.`, async () => { await act(() => rpc('host_choose_finals_option', { p_instance: inst.id, p_option: o }), `נבחרה חלופה ${o}`); })} />}

          <details className="subs">
            <summary>קבוצות ({teams.filter((t) => t.status === 'active').length})</summary>
            <TeamList teams={teams} onTransfer={issueTransfer} onRemove={(id, name) => ask(`להסיר את "${name}"?`, async () => { await act(() => rpc('host_remove_team', { p_team: id })); })} />
          </details>
          <details className="subs">
            <summary>הגשות בסבב ({subs.length})</summary>
            <table><tbody>{subs.map((s) => (
              <tr key={s.id}><td>{teamName(s.team_id)}</td><td>#{s.item_index + 1}/{s.attempt_no}</td><td>{STATUS[s.status] ?? s.status}</td>
                <td>{s.ratio == null ? '' : s.ratio == 1 ? '✓' : Number(s.ratio) > 0 ? `${Math.round(Number(s.ratio) * 100)}%` : '✗'}</td>
                <td>{new Date(s.received_at).toLocaleTimeString('he-IL')}</td></tr>
            ))}</tbody></table>
          </details>
        </section>
      )}

      {inst?.status === 'finished' && <section className="card"><h2>המשחק הסתיים</h2></section>}

      {inst && <MusicControl music={inst.music ?? { on: true, volume: 60 }} onSet={(on, volume) => act(() => rpc('host_set_music', { p_instance: inst.id, p_on: on, p_volume: volume }))} />}

      {inst && (
        <section className="card danger-zone">
          <h3>ניהול</h3>
          {inst.mode === 'demo' && <ResetButton instanceId={inst.id} onDone={(t) => { setToast({ text: t }); load(); }} onError={(t) => setToast({ text: t, bad: true })} />}
          <button className="ghost" onClick={() => ask('לארכב את המשחק? הוא יוסר מהמסך.', async () => { await act(() => rpc('host_archive_instance', { p_instance: inst.id }), 'המשחק אורכב'); })}>ארכוב משחק</button>
          <button className="ghost" onClick={() => client.auth.signOut()}>יציאה</button>
        </section>
      )}

      {transfer && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-box enter">
            <p>קוד מעבר לטלפון חדש עבור <b>{transfer.name}</b>:</p>
            <div className="transfer-code" dir="ltr">{transfer.code}</div>
            <p className="muted small">בטלפון החדש: סורקים את ה־QR, לוחצים "הטלפון של הקבוצה התחלף?" ומקלידים את הקוד. הקוד תקף ל־10 דקות, והטלפון הישן יתנתק.</p>
            <button className="primary" onClick={() => setTransfer(null)}>סגירה</button>
          </div>
        </div>
      )}

      {confirm && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-box">
            <p>{confirm.text}</p>
            <button className="go" onClick={async () => { const c = confirm; setConfirm(null); await c.run(); }}>אישור</button>
            <button className="ghost" onClick={() => setConfirm(null)}>ביטול</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** After a reveal the screen switches to the top-5 table by itself after 8 s; the host can keep the solution or jump now. */
function StandingsControl({ inst, r, offset, onShow, onPin }: { inst: { screen_view: string }; r: { phase: string; revealed_at: string | null; pin_solution: boolean }; offset: number; onShow: () => void; onPin: () => void }) {
  useTick(500);
  const { show, due } = useAutoStandings(r, offset);
  const showing = inst.screen_view === 'standings' || show;
  if (showing) return <><p className="muted small">על המסך: טבלת חמש המובילות</p><button onClick={onPin}>חזרה לפתרון</button></>;
  if (r.pin_solution) return <><p className="muted small">הפתרון נשאר על המסך</p><button onClick={onShow}>הצגת טבלת דירוג</button></>;
  const left = due ? Math.max(0, Math.ceil((due - (Date.now() + offset)) / 1000)) : 0;
  return (
    <>
      <p className="muted small">הטבלה תופיע אוטומטית בעוד {left} שניות</p>
      <div className="row"><button className="grow" onClick={onShow}>להציג עכשיו</button><button className="grow ghost" onClick={onPin}>להשאיר את הפתרון</button></div>
    </>
  );
}

const PHASES: Record<string, string> = {
  pending: 'ממתין', intro: 'הצגת הוראות', betting: 'הימורים פתוחים', bets_locked: 'הימורים נעולים', open: 'פתוח להגשות',
  paused: 'מושהה', closed: 'סגור', graded: 'נבדק', revealed: 'נחשף', done: 'הסתיים',
};
const STATUS: Record<string, string> = { received: 'התקבל', graded: 'נבדק', needs_review: 'להכרעה', late: 'באיחור' };

function TeamList({ teams, onRemove, onTransfer }: { teams: { id: string; name: string; color: string; members: string[]; status: string }[]; onRemove: (id: string, name: string) => void; onTransfer: (id: string, name: string) => void }) {
  const active = teams.filter((t) => t.status === 'active');
  return (
    <div className="team-list">
      <h3>{active.length} קבוצות רשומות</h3>
      {active.map((t) => (
        <div key={t.id} className="row enter">
          <span className="swatch" style={{ background: t.color }} />
          <span className="grow"><b>{t.name}</b> <small>{t.members.join(', ')}</small></span>
          <button className="ghost small" onClick={() => onTransfer(t.id, t.name)}>טלפון חלופי</button>
          <button className="ghost small" onClick={() => onRemove(t.id, t.name)}>הסרה</button>
        </div>
      ))}
    </div>
  );
}

function FinalsPanel({ finals, teamName, locked, onChoose }: { finals: any; teamName: (id: string) => string; locked: boolean; onChoose: (o: 'A' | 'B') => void }) {
  const o = finals.options;
  return (
    <div className="finals-panel">
      <h3>חלופות ניקוד לגמר {o.tiedOnCut && <small className="warn">(שוויון על קו העלייה — עלו יותר מ-5)</small>}</h3>
      <table className="gaps"><tbody>{o.gaps.map((g: any, i: number) => (
        <tr key={g.teamId}><td>{i + 1}</td><td>{teamName(g.teamId)}</td><td>{o.finalists[i].total}</td><td>−{g.behindLeader}</td></tr>
      ))}</tbody></table>
      {o.options.map((opt: any) => (
        <div key={opt.id} className={`option-card ${finals.chosen_option === opt.id ? 'chosen' : ''}`}>
          <h4>חלופה {opt.id} — {opt.label}</h4>
          <p>מקום 1 בגמר: <b>+{opt.firstPrize}</b> · מקום 2: <b>+{opt.secondPrize}</b> · מקומות 3–5: 0</p>
          <ul>
            {o.analysis[opt.id].map((a: any) => (
              <li key={a.teamId}><b>{teamName(a.teamId)}</b>: {a.winGuaranteesTitle ? 'ניצחון בגמר מבטיח זכייה' : a.canWinTitle ? 'יכולה לזכות אם המובילות לא יקבלו נקודות' : 'לא יכולה להגיע למקום הראשון'}
                {a.overtakesEvenIfRivalSecond.length > 0 && <> · עוקפת גם אם היריבה שנייה: {a.overtakesEvenIfRivalSecond.map(teamName).join(', ')}</>}
              </li>
            ))}
          </ul>
          {!finals.chosen_option && !locked && <button className="primary" onClick={() => onChoose(opt.id)}>בחירת חלופה {opt.id}</button>}
        </div>
      ))}
      <p className="muted small">הנוסחאות הן הצעה לבדיקה — טרם אושרו סופית.</p>
    </div>
  );
}

/** Two-step reset: server issues a 90-second token, then the host must type "איפוס". */
function ResetButton({ instanceId, onDone, onError }: { instanceId: string; onDone: (t: string) => void; onError: (t: string) => void }) {
  const client = useClient('host');
  const [token, setToken] = useState<string | null>(null);
  const [text, setText] = useState('');
  if (!token) return <button className="danger" onClick={async () => {
    const { data, error } = await client.rpc('host_request_reset', { p_instance: instanceId });
    if (error) onError(friendlyError(error)); else setToken(data as string);
  }}>איפוס משחק הניסיון…</button>;
  return (
    <div className="reset-box">
      <p>האיפוס ימחק את כל הקבוצות, התשובות, ההימורים והניקוד של משחק הניסיון. התוכן והחידות נשמרים. הקלידו <b>איפוס</b> לאישור:</p>
      <input value={text} onChange={(e) => setText(e.target.value)} />
      <button className="danger" disabled={text !== 'איפוס'} onClick={async () => {
        const { error } = await client.rpc('host_confirm_reset', { p_token: token, p_confirm_text: text, p_scope: 'reset' });
        setToken(null); setText('');
        if (error) onError(friendlyError(error)); else onDone('משחק הניסיון אופס');
      }}>אישור איפוס</button>
      <button className="ghost" onClick={() => { setToken(null); setText(''); }}>ביטול</button>
    </div>
  );
}

/** Has this team finished the round? (used to close the round early when everyone is done) */
function teamFinished(r: { kind: string; item_count: number }, mine: Sub[], mem?: MemoryNow | null): boolean {
  if (r.kind === 'sequence_memory' && mem) {
    if (mem.phase === 'result') return false;                         // let the stage result show first
    const closed = mem.phase === 'done' ? mem.stage : mem.stage - 1;   // stages whose recall window has ended
    for (let k = 0; k <= closed; k++) {
      const x = mine.find((y) => y.item_index === k);
      if (!x || (x.ratio != null && Number(x.ratio) < 1)) return true;  // missed or failed → out
    }
    return closed >= r.item_count - 1;
  }
  if (mine.length === 0) return false;
  const solved = mine.some((x) => Number(x.ratio) === 1);
  switch (r.kind) {
    case 'code_vault': return solved || mine.length >= 3;
    case 'finale': case 'sliding_puzzle': case 'ordering': case 'bet_puzzle': return true;
    case 'sequence_memory': return mine.some((x) => x.ratio != null && Number(x.ratio) === 0) || new Set(mine.map((x) => x.item_index)).size >= r.item_count;
    case 'symbols': return new Set(mine.filter((x) => Number(x.ratio) === 1).map((x) => x.item_index)).size >= r.item_count;
    default: return new Set(mine.map((x) => x.item_index)).size >= r.item_count;
  }
}

/** Keep the host phone awake: the automatic flow runs here. */
function useWakeLock() {
  useEffect(() => {
    let lock: any = null;
    const get = async () => { try { lock = await (navigator as any).wakeLock?.request('screen'); } catch { /* unsupported */ } };
    get();
    const onVis = () => { if (document.visibilityState === 'visible') get(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); try { lock?.release(); } catch { /* ignore */ } };
  }, []);
}

/** Background music on the projector: on/off and volume. */
function MusicControl({ music, onSet }: { music: { on: boolean; volume: number }; onSet: (on: boolean, volume: number) => void }) {
  const [vol, setVol] = useState(music.volume);
  useEffect(() => setVol(music.volume), [music.volume]);
  return (
    <section className="card music-card">
      <h3>מוזיקה במסך</h3>
      <div className="row">
        <button className={music.on ? 'primary grow' : 'ghost grow'} onClick={() => onSet(!music.on, vol)}>{music.on ? 'מתנגנת' : 'כבויה'}</button>
        <input type="range" min={0} max={100} step={5} value={vol} disabled={!music.on} aria-label="עוצמה"
               onChange={(e) => setVol(Number(e.target.value))}
               onPointerUp={() => onSet(music.on, vol)} onKeyUp={() => onSet(music.on, vol)} onTouchEnd={() => onSet(music.on, vol)} />
      </div>
    </section>
  );
}
