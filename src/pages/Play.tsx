/**
 * /play — team phone. Mobile first, big targets, short Hebrew copy.
 * Identity = anonymous Supabase session (survives refresh). All state comes from the server.
 */
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
        : !team.registered ? <Register s={state} onDone={loadTeam} />
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

function Register({ s, onDone }: { s: PublicState; onDone: () => void }) {
  const client = useClient('play');
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get('code') ?? '');
  const [mode, setMode] = useState<'new' | 'join'>('new');
  const [name, setName] = useState('');
  const [members, setMembers] = useState<string[]>(['', '', '']);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const open = s.instance.status === 'registration_open';

  const submit = async () => {
    setBusy(true); setErr('');
    const res = mode === 'new'
      ? await client.rpc('team_register', { p_join_code: code, p_name: name, p_members: members.filter((m) => m.trim()) })
      : await client.rpc('team_join', { p_join_code: code, p_pin: pin });
    setBusy(false);
    if (res.error) setErr(friendlyError(res.error)); else onDone();
  };

  return (
    <div className="register">
      <div className="seg">
        <button className={mode === 'new' ? 'on' : ''} onClick={() => setMode('new')}>קבוצה חדשה</button>
        <button className={mode === 'join' ? 'on' : ''} onClick={() => setMode('join')}>טלפון נוסף לקבוצה</button>
      </div>
      <label>קוד משחק<input dir="ltr" inputMode="text" autoCapitalize="characters" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} /></label>
      {mode === 'new' ? (
        <>
          {!open && <p className="warn">ההרשמה עדיין סגורה — אפשר למלא ולשלוח כשתיפתח.</p>}
          <label>שם הקבוצה<input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="למשל: המכבים הצעירים" /></label>
          <fieldset>
            <legend>משתתפים</legend>
            {members.map((m, i) => (
              <input key={i} value={m} placeholder={`משתתף ${i + 1}`} maxLength={24}
                     onChange={(e) => setMembers(members.map((x, j) => (j === i ? e.target.value : x)))} />
            ))}
            {members.length < 15 && <button type="button" className="ghost" onClick={() => setMembers([...members, ''])}>+ עוד משתתף</button>}
          </fieldset>
          <button className="primary" disabled={busy || name.trim().length < 2 || !code} onClick={submit}>{busy ? 'שולחים…' : 'מצטרפים למשחק'}</button>
        </>
      ) : (
        <>
          <label>קוד הקבוצה (4 ספרות, מופיע בטלפון הראשי)<input dir="ltr" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} maxLength={4} /></label>
          <button className="primary" disabled={busy || pin.length !== 4 || !code} onClick={submit}>{busy ? 'מצטרפים…' : 'הצטרפות לקבוצה'}</button>
        </>
      )}
      {err && <p className="error" role="alert">{err}</p>}
    </div>
  );
}

function InGame({ s, team, offset, onChange }: { s: PublicState; team: TeamState; offset: number; onChange: () => void }) {
  const client = useClient('play');
  const t = team.team!;
  if (t.status !== 'active') return <p className="muted">הקבוצה הוסרה מהמשחק. פנו למנחה.</p>;
  const r = s.round;
  const scoreLine = team.score && <div className="my-score">מקום {team.score.rank} · {team.score.total.toLocaleString('he-IL')} נקודות</div>;

  if (s.instance.status === 'finished') return <div className="center-msg"><h2>המשחק הסתיים!</h2>{scoreLine}<p>תודה ששיחקתם!</p></div>;
  if (s.instance.status !== 'in_progress' || !r) {
    return (
      <div className="center-msg">
        <h2>נרשמתם! ✓</h2>
        <p className="team-name-big" style={{ color: t.color }}>{t.name}</p>
        {t.members.length > 0 && <p className="muted">{t.members.join(' · ')}</p>}
        {t.pin && <div className="pin-box">טלפון נוסף? קוד הקבוצה: <b dir="ltr">{t.pin}</b></div>}
        <p className="muted">ממתינים לתחילת המשחק…</p>
      </div>
    );
  }

  const roundLabel = r.is_finale ? FINALE_NAME : `נר ${r.no}`;
  const isFinalist = !r.is_finale || (r.finalists ?? []).includes(t.id);

  return (
    <div className="in-round">
      <div className="round-chip">{roundLabel} · {r.title}</div>
      {(r.phase === 'open' || r.phase === 'paused') && <Timer endsAt={r.ends_at} pausedMs={r.paused_remaining_ms} offset={offset} total={r.duration_sec} />}
      {!isFinalist ? <p className="center-msg">הגמר יוצא לדרך! צפו במסך — הקבוצות המובילות מתמודדות.</p>
        : r.phase === 'intro' ? <div className="instructions-card"><p>{r.instructions}</p><p className="muted">הסבב ייפתח בעוד רגע…</p></div>
        : r.phase === 'paused' ? <p className="center-msg">הסבב מושהה. התשובות שלכם שמורות.</p>
        : ['betting', 'bets_locked', 'open'].includes(r.phase) ? <TaskInput client={client} s={s} team={team} onChange={onChange} />
        : r.phase === 'closed' || r.phase === 'graded' ? <p className="center-msg">הזמן נגמר. מחכים לתוצאות…</p>
        : <div className="center-msg"><h3>התוצאות על המסך</h3>{scoreLine}</div>}
      {t.role === 'member' && r.phase === 'open' && <p className="muted small">הטלפון הראשי של הקבוצה שולח את התשובות.</p>}
    </div>
  );
}
