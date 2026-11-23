/**
 * /host — the host's phone console. Email/password sign-in; the account must be listed in public.hosts.
 * Reads full data via RLS (hosts only), acts only through RPCs / the Edge Function.
 */
import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useClient } from '../lib/clientContext';
import { usePublicState, useServerClock } from '../lib/hooks';
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
  const { state, version, conn } = usePublicState(client);
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
          <p className="muted small">הקבוצות סורקות את ה־QR שעל המסך, כותבות שמות משתתפים ומקבלות שם מוגרל.</p>
          <div className="big-buttons">
            {inst.status !== 'registration_open'
              ? <button className="primary" disabled={busy} onClick={() => act(() => rpc('host_set_registration', { p_instance: inst.id, p_open: true }), 'ההרשמה נפתחה')}>פתיחת הרשמה</button>
              : <button className="primary" disabled={busy} onClick={() => act(() => rpc('host_set_registration', { p_instance: inst.id, p_open: false }), 'ההרשמה ננעלה')}>נעילת הרשמה</button>}
            {inst.status === 'registration_locked' && (
              <button className="go" disabled={busy || teams.length < 2} onClick={() => ask(`להתחיל את המשחק עם ${teams.filter((t) => t.status === 'active').length} קבוצות?`, async () => { await act(() => rpc('host_start_game', { p_instance: inst.id }), 'המשחק התחיל!'); })}>התחלת המשחק</button>
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
          <div className="big-buttons">
            {r.phase === 'intro' && r.kind === 'bet_puzzle' && <button className="primary" disabled={busy} onClick={() => act(() => rpc('host_round_action', { p_instance: inst.id, p_round: r.no, p_action: 'open_betting' }))}>פתיחת הימורים</button>}
            {r.phase === 'betting' && <button className="primary" disabled={busy} onClick={() => act(() => rpc('host_round_action', { p_instance: inst.id, p_round: r.no, p_action: 'lock_bets' }), 'ההימורים ננעלו')}>נעילת הימורים</button>}
            {((r.phase === 'intro' && r.kind !== 'bet_puzzle') || r.phase === 'bets_locked') && (
              <button className="go" disabled={busy} onClick={() => act(() => rpc('host_round_action', { p_instance: inst.id, p_round: r.no, p_action: 'open' }), 'הסבב נפתח — הטיימר רץ')}>{r.kind === 'bet_puzzle' ? 'חשיפת החידה והפעלת טיימר' : 'פתיחת הסבב והפעלת טיימר'}</button>
            )}
            {r.phase === 'open' && <button disabled={busy} onClick={() => act(() => rpc('host_round_action', { p_instance: inst.id, p_round: r.no, p_action: 'pause' }))}>השהיה</button>}
            {r.phase === 'paused' && <button className="primary" disabled={busy} onClick={() => act(() => rpc('host_round_action', { p_instance: inst.id, p_round: r.no, p_action: 'resume' }))}>המשך</button>}
            {(r.phase === 'open' || r.phase === 'paused') && <button className="danger" disabled={busy} onClick={() => ask('לסגור את ההגשות?', async () => { await act(() => rpc('host_round_action', { p_instance: inst.id, p_round: r.no, p_action: 'close' }), 'ההגשות נסגרו'); })}>סגירת הגשות</button>}
            {r.phase === 'closed' && <button className="primary" disabled={busy} onClick={async () => {
              const res = await act(() => edge({ action: 'grade_round', instance_id: inst.id, round_no: r.no }));
              if (res?.needs_review) setToast({ text: `${res.needs_review.length} תשובות ממתינות להכרעה`, bad: true });
              else if (res?.graded) setToast({ text: 'הבדיקה הושלמה' });
            }}>בדיקה אוטומטית</button>}
            {r.phase === 'graded' && <button className="go" disabled={busy} onClick={() => ask('לחשוף פתרון וניקוד של הסבב?', async () => { await act(() => rpc('host_round_action', { p_instance: inst.id, p_round: r.no, p_action: 'reveal' }), 'נחשף'); })}>חשיפת פתרון וניקוד</button>}
            {['revealed'].includes(r.phase) && (
              <>
                <button onClick={() => act(() => rpc('host_set_screen_view', { p_instance: inst.id, p_view: inst.screen_view === 'standings' ? 'auto' : 'standings' }))}>
                  {inst.screen_view === 'standings' ? 'הסתרת הטבלה' : 'הצגת טבלת דירוג'}
                </button>
                {r.no === 8 && !finals && <button className="primary" disabled={busy} onClick={() => act(() => edge({ action: 'compute_finals', instance_id: inst.id }), 'חלופות הגמר חושבו')}>חישוב חלופות גמר</button>}
                {r.no < 9 && <button className="go" disabled={busy || (r.no === 8 && !finals)} onClick={() => act(() => rpc('host_next_round', { p_instance: inst.id }))}>{r.no === 8 ? `מעבר ל${FINALE_NAME}` : 'לסבב הבא'}</button>}
                {r.no === 9 && <button className="go" disabled={busy} onClick={() => ask('לסיים את המשחק ולהכריז על האלופה?', async () => { await act(() => rpc('host_finish_game', { p_instance: inst.id }), 'המשחק הסתיים'); })}>סיום והכרזה</button>}
              </>
            )}
          </div>

          {review.length > 0 && (
            <div className="review">
              <h3>תשובות לא ודאיות — הכרעת מנחה</h3>
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

      {inst?.status === 'finished' && <section className="card"><h2>המשחק הסתיים</h2><p>התוצאות מוצגות על המסך.</p></section>}

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
