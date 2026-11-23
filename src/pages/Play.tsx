/**
 * /play — team phone. Mobile first, big targets, short Hebrew copy.
 * Identity = anonymous Supabase session (survives refresh). All state comes from the server.
 */
import { useCallback, useEffect, useState } from 'react';
import { useClient } from '../lib/clientContext';
import { usePublicState, useServerClock } from '../lib/hooks';
import { friendlyError } from '../lib/errors';
import type { PublicState, TeamState } from '../lib/types';
import { Timer } from '../components/Timer';
import { APP_NAME, FINALE_NAME } from '../config';
import { TaskInput } from '../tasks/TaskInput';


export default function Play() {
  const client = useClient('play');
  const [ready, setReady] = useState(false);
  const [authErr, setAuthErr] = useState('');
  const { state, version, conn } = usePublicState(client);
  const offset = useServerClock(client);
  const [team, setTeam] = useState<TeamState | null>(null);
  const [drawn, setDrawn] = useState<string | null>(null);

  // Sign in anonymously; on a flaky network keep retrying (with backoff) instead of getting stuck.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (let attempt = 0; !cancelled; attempt++) {
        const { data } = await client.auth.getSession();
        if (data.session) break;
        const { error } = await client.auth.signInAnonymously();
        if (!error) break;
        setAuthErr(friendlyError(error));
        await new Promise((r) => setTimeout(r, Math.min(10_000, 1500 * 2 ** attempt)));
      }
      if (!cancelled) { setAuthErr(''); setReady(true); }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadTeam = useCallback(async () => {
    const { data, error } = await client.rpc('team_get_state');
    if (!error) setTeam(data as TeamState);
  }, []);
  // Every public change (new round, reveal, …) → refresh this team's private view.
  useEffect(() => { if (ready) loadTeam(); }, [ready, version, loadTeam]);

  if (authErr) return <Shell><p className="error">{authErr}</p></Shell>;
  if (!ready || !team) return <Shell><p className="muted">מתחברים…</p></Shell>;

  return (
    <Shell conn={conn} teamName={team.team?.name} color={team.team?.color} demo={state?.instance.mode === 'demo'}>
      {!state ? <p className="muted">אין משחק פעיל כרגע.</p>
        : drawn && team.registered ? <NameReveal name={drawn} color={team.team?.color ?? 'var(--gold)'} onDone={() => setDrawn(null)} />
        : !team.registered ? <Register s={state} onDone={(n) => { setDrawn(n); loadTeam(); }} />
        : <InGame s={state} team={team} offset={offset} onChange={loadTeam} />}
    </Shell>
  );
}

function Shell({ children, conn, teamName, color, demo }: { children: React.ReactNode; conn?: string; teamName?: string; color?: string; demo?: boolean }) {
  return (
    <div className="play" style={{ '--team': color ?? 'var(--gold)' } as React.CSSProperties}>
      <header className="play-header">
        <span className="play-logo">{APP_NAME}</span>
        {teamName && <span className="play-team">{teamName}</span>}
      </header>
      {demo && <div className="demo-strip">משחק ניסיון</div>}
      {conn && conn !== 'live' && <div className="conn-strip">מתחבר מחדש… אפשר להמשיך, הכול נשמר בשרת</div>}
      <main className="play-main">{children}</main>
    </div>
  );
}

// Only for the "drawing a name" animation; the real name is drawn on the server.
const REEL = ['הסופגניות המעופפות', 'לביבות בלי גבולות', 'הסביבונים המסתחררים', 'פך השמן האבוד', 'המכבים המנומנמים',
  'אנטיוכוס בהלם', 'דמי חנוכה דחופים', 'ריבה בכל מקום', 'מטבעות השוקולד', 'סביבון על טורבו'];

function vibrate(ms = 12) { try { navigator.vibrate?.(ms); } catch { /* not supported */ } }

/** QR → participant names → the server draws a funny team name. No codes, no team-name typing. */
function Register({ s, onDone }: { s: PublicState; onDone: (drawnName: string) => void }) {
  const client = useClient('play');
  const [members, setMembers] = useState<string[]>(['', '']);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [transfer, setTransfer] = useState(false);
  const [code, setCode] = useState('');
  const open = s.instance.status === 'registration_open';
  const filled = members.filter((m) => m.trim());

  const submit = async () => {
    vibrate(); setBusy(true); setErr('');
    const res = transfer
      ? await client.rpc('team_claim_transfer', { p_code: code })
      : await client.rpc('team_register', { p_members: filled });
    setBusy(false);
    if (res.error) setErr(friendlyError(res.error)); else onDone((res.data as { name: string }).name);
  };

  if (transfer) {
    return (
      <div className="register">
        <h2>מעבר לטלפון חדש</h2>
        <p className="muted">את הקוד מקבלים מהמנחה. הטלפון הקודם של הקבוצה יתנתק.</p>
        <label>קוד מעבר (6 ספרות)<input dir="ltr" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} maxLength={6} /></label>
        <button className="primary" disabled={busy || code.length !== 6} onClick={submit}>{busy ? 'מעבירים…' : 'ממשיכים עם הקבוצה'}</button>
        <button className="ghost" onClick={() => { setTransfer(false); setErr(''); }}>חזרה</button>
        {err && <p className="error" role="alert">{err}</p>}
      </div>
    );
  }

  return (
    <div className="register">
      <h2>מי בקבוצה?</h2>
      <p className="muted">כותבים את שמות כל המשתתפים. את שם הקבוצה אנחנו נגריל לכם.</p>
      {!open && <p className="warn">ההרשמה עוד לא נפתחה. אפשר כבר למלא, ולשלוח כשהיא תיפתח.</p>}
      <fieldset className="stagger">
        {members.map((m, i) => (
          <input key={i} style={{ '--i': i } as React.CSSProperties} value={m} placeholder={`משתתף ${i + 1}`} maxLength={24} autoComplete="off"
                 onChange={(e) => setMembers(members.map((x, j) => (j === i ? e.target.value : x)))} />
        ))}
        {members.length < 15 && <button type="button" className="ghost" onClick={() => { vibrate(); setMembers([...members, '']); }}>+ עוד משתתף</button>}
      </fieldset>
      <button className="primary big-cta" disabled={busy || filled.length === 0 || !open} onClick={submit}>{busy ? 'מגרילים…' : 'מצטרפים!'}</button>
      {err && <p className="error" role="alert">{err}</p>}
      <button className="link" onClick={() => setTransfer(true)}>הטלפון של הקבוצה התחלף?</button>
    </div>
  );
}

/** Slot-machine style reveal of the drawn team name. */
function NameReveal({ name, color, onDone }: { name: string; color: string; onDone: () => void }) {
  const [phase, setPhase] = useState<'spin' | 'done'>('spin');
  useEffect(() => {
    const a = setTimeout(() => { setPhase('done'); vibrate(40); }, 1800);
    const b = setTimeout(onDone, 5200);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="name-draw" style={{ '--team': color } as React.CSSProperties}>
      <p className="muted">מגרילים לכם שם…</p>
      {phase === 'spin'
        ? <div className="name-reel" aria-hidden="true"><div>{[...REEL, ...REEL].map((n, i) => <span key={i}>{n}</span>)}</div></div>
        : <div className="sparkles"><div className="drawn-name" role="status">{name}</div></div>}
      {phase === 'done' && <p className="enter">זה השם שלכם! הוא מופיע עכשיו על המסך הגדול.</p>}
    </div>
  );
}

function ScoreCard({ score }: { score: NonNullable<TeamState['score']> }) {
  return (
    <div className="score-card enter" role="status">
      <div className="line"><span>הניקוד שלכם</span><b>{score.total.toLocaleString('he-IL')}</b></div>
      <div className="line"><span>המקום שלכם</span><b>{score.rank}<small className="muted" style={{ fontSize: '1rem' }}> מתוך {score.teams}</small></b></div>
    </div>
  );
}

function InGame({ s, team, offset, onChange }: { s: PublicState; team: TeamState; offset: number; onChange: () => void }) {
  const client = useClient('play');
  const t = team.team!;
  if (t.status !== 'active') return <p className="muted">הקבוצה הוסרה מהמשחק. פנו למנחה.</p>;
  const r = s.round;
  const score = team.score;

  if (s.instance.status === 'finished') {
    return <div className="center-msg"><h2>המשחק הסתיים!</h2>{score && <ScoreCard score={score} />}<p>תודה ששיחקתם!</p></div>;
  }
  if (s.instance.status !== 'in_progress' || !r) {
    return (
      <div className="center-msg">
        <p className="muted">השם שלכם:</p>
        <p className="team-name-big" style={{ color: t.color }}>{t.name}</p>
        <p className="muted">{t.members.join(' · ')}</p>
        <div className="waiting-dots" aria-label="ממתינים"><i /><i /><i /></div>
        <p>ממתינים לתחילת המשחק…</p>
      </div>
    );
  }

  const roundLabel = r.is_finale ? FINALE_NAME : `נר ${r.no}`;
  const isFinalist = !r.is_finale || (r.finalists ?? []).includes(t.id);
  const showScore = score && ['intro', 'revealed', 'done'].includes(r.phase) && (r.phase !== 'intro' || r.no > 1);

  return (
    <div className="in-round" key={`${r.no}-${r.phase}`}>
      <div className="round-top">
        <div className="round-chip">{roundLabel} · {r.title}</div>
        {(r.phase === 'open' || r.phase === 'paused') && <Timer endsAt={r.ends_at} pausedMs={r.paused_remaining_ms} offset={offset} total={r.duration_sec} />}
      </div>
      {!isFinalist ? <p className="center-msg">הגמר יוצא לדרך! צפו במסך, הקבוצות המובילות מתמודדות.</p>
        : r.phase === 'intro' ? <div className="instructions-card"><p>{r.instructions}</p><p className="muted">הסבב ייפתח בעוד רגע…</p></div>
        : r.phase === 'paused' ? <p className="center-msg">הסבב מושהה. התשובות שלכם שמורות.</p>
        : ['betting', 'bets_locked', 'open'].includes(r.phase) ? <TaskInput client={client} s={s} team={team} onChange={onChange} />
        : r.phase === 'closed' || r.phase === 'graded' ? <div className="center-msg"><div className="waiting-dots"><i /><i /><i /></div><p>הזמן נגמר. בודקים תשובות…</p></div>
        : <div className="center-msg"><h3>הפתרון על המסך</h3></div>}
      {showScore && <ScoreCard score={score!} />}
    </div>
  );
}
