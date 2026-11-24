/**
 * /play — team phone. Mobile first, big targets, short Hebrew copy.
 * Identity = anonymous Supabase session (survives refresh). All state comes from the server.
 */
import { ClueLetter } from '../components/ClueLetter';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useClient } from '../lib/clientContext';
import { usePublicState, useServerClock } from '../lib/hooks';
import { friendlyError } from '../lib/errors';
import type { PublicRound, PublicState, TeamState } from '../lib/types';
import { Timer } from '../components/Timer';
import { APP_NAME } from '../config';
import { askFor } from '../content/asks';
import { Menorah } from '../components/Menorah';
import { TaskInput } from '../tasks/TaskInput';


export default function Play() {
  const client = useClient('play');
  const [ready, setReady] = useState(false);
  const [authErr, setAuthErr] = useState('');
  const { state, version, conn, refetch } = usePublicState(client);
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
        : !team.registered ? <Register s={state} onDone={(n) => { setDrawn(n); loadTeam(); refetch(); }} />
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
          <div key={i} className="member-row" style={{ '--i': i } as React.CSSProperties}>
            <input value={m} placeholder={`משתתף ${i + 1}`} maxLength={24} autoComplete="off" aria-label={`משתתף ${i + 1}`}
                   onChange={(e) => setMembers(members.map((x, j) => (j === i ? e.target.value : x)))} />
            {members.length > 1 && (
              <button type="button" className="remove" aria-label={`מחיקת ${m || `משתתף ${i + 1}`}`}
                      onClick={() => { vibrate(); setMembers(members.filter((_, j) => j !== i)); }}>✕</button>
            )}
          </div>
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

const ORD = ['', 'ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שביעי', 'שמיני', 'תשיעי', 'עשירי'];
const placeName = (n: number) => (ORD[n] ? `ה${ORD[n]}` : `ה־${n}`);
const pts = (n: number) => (n === 1 ? 'נקודה אחת' : `${n.toLocaleString('he-IL')} נקודות`);

/** The line under the score: chase the next place up, or (for the leader) feel the runner-up breathing down your neck. */
function Motivation({ score }: { score: NonNullable<TeamState['score']> }) {
  const P = ({ n }: { n: number }) => <b className="pts-glow">{pts(n)}</b>;
  let body: React.ReactNode = null;
  if (score.rank === 1) {
    if ((score.tied ?? 0) > 0) body = <>אתם צמודים במקום הראשון!<br />כל נקודה מכריעה!</>;
    else if (score.gap_down != null && score.gap_down <= 300) body = <>מקום שני נושף בעורפכם!<br />הפער ביניכם הוא רק <P n={score.gap_down} />!</>;
    else if (score.gap_down != null) body = <>אתם בראש בפער של <P n={score.gap_down} />!<br />תמשיכו ככה עד הנר האחרון!</>;
  } else if (score.gap_up != null && score.rank_up != null) {
    body = <>עוד <P n={score.gap_up + 1} /> ואתם במקום {placeName(score.rank_up)}</>;
  }
  return body ? <p className="motivation">{body}</p> : null;
}

/** Confetti only on the phones of the top three. First place: golden confetti rain + colourful fireworks on the edges. */
function PhoneConfetti({ rank, start }: { rank: number; start: number }) {
  const big = rank === 1;
  const colors = big ? ['#f5c84a', '#ffe7a3', '#fff3c4', '#e9b949', '#d4a53a', '#ffd86b']
    : rank === 2 ? ['#eef1f8', '#b9c2d6', '#dfe6f2', '#ffffff', '#9aa6c2'] : ['#f0b98a', '#c9834e', '#e0a070', '#b8743e', '#ffd2a8'];
  const pieces = useMemo(() => Array.from({ length: big ? 90 : 60 }, (_, i) => {
    const r = (k: number) => ((Math.sin(i * 12.9898 + k * 78.233 + rank) * 43758.5453) % 1 + 1) % 1;
    return { i, x: r(1) * 100, d: 3.5 + r(2) * 3, delay: start + r(3) * (big ? 5 : 3), drift: (r(4) - .5) * 24, spin: 360 + r(5) * 900,
      s: .7 + r(6) * .9, c: colors[i % colors.length], shape: ['rect', 'strip', 'circle', 'rect', 'strip', 'star'][Math.floor(r(7) * 6)] };
  }), [big, rank, start]);
  // fireworks around the edges (first place only): left/right sides and the top corners
  const spots = [[8, 18], [92, 24], [7, 58], [93, 64], [12, 88], [88, 90]];
  const fwColors = ['#f5c84a', '#e8604c', '#5c8df6', '#7bc67e', '#f28ab2', '#b57edc', '#4fb0c6', '#ffe7a3'];
  return createPortal(
    <div className={`phone-confetti ${big ? 'huge' : ''}`} aria-hidden="true">
      {big && <div className="pc-gold-flash" style={{ animationDelay: `${start}s` }} />}
      {pieces.map((p) => (
        <i key={p.i} className={`pf ${p.shape}`}
           style={{ left: `${p.x}%`, background: p.shape === 'star' ? undefined : p.c, color: p.c,
             '--d': `${p.d}s`, '--delay': `${p.delay}s`, '--drift': `${p.drift}vw`, '--spin': `${p.spin}deg`, '--s': p.s } as React.CSSProperties} />
      ))}
      {big && spots.map(([x, y], k) => (
        <div key={k} className="firework" style={{ left: `${x}%`, top: `${y}%`, '--fw': fwColors[k % fwColors.length], '--fd': `${start + .3 + k * .45}s` } as React.CSSProperties}>
          {Array.from({ length: 10 }, (_, j) => <b key={j} style={{ '--a': `${j * 36}deg` } as React.CSSProperties} />)}
        </div>
      ))}
    </div>,
    document.body,
  );
}

/** End of the game on the phones: the same podium as the projector, revealed 3 → 2 → 1. No encouragement lines. */
function PhonePodium({ s, myId, myRank }: { s: PublicState; myId: string; myRank?: number }) {
  const names = new Map(s.teams.map((x) => [x.id, x]));
  const top = (s.standings ?? []).slice(0, 3).map((x: any) => ({ ...x, team: names.get(x.team_id) }));
  const delay: Record<number, number> = { 3: 1.0, 2: 4.2, 1: 7.8 };
  const order = [...top].reverse();                         // 3rd first, winner last (on top of the reveal)
  const place = (i: number) => top.length - i;              // position in the podium (1..3)
  return (
    <div className="phone-podium">
      <h2 className="pp-title">הזוכים הגדולים</h2>
      <div className="pp-list">
        {order.map((r: any, i: number) => {
          const p = place(i);
          return (
            <div key={r.team_id} className={`pp-card pp${p} ${r.team_id === myId ? 'me' : ''}`} style={{ '--d': `${delay[p]}s` } as React.CSSProperties}>
              <span className="pp-flash" aria-hidden="true" />
              <span className="pp-rank">{r.rank}</span>
              <div className="pp-body">
                <b className="pp-name">{r.team?.name}</b>
                {r.members?.length ? <span className="pp-members">{r.members.join(' · ')}</span> : null}
              </div>
              <span className="pp-side">
                {r.team_id === myId && <span className="pp-me">זה אתם!</span>}
                <span className="pp-pts">{r.total.toLocaleString('he-IL')}</span>
              </span>
            </div>
          );
        })}
      </div>
      {myRank && myRank > 3 && <p className="pp-mine">סיימתם במקום {myRank}</p>}
      {myRank && myRank <= 3 && <PhoneConfetti rank={myRank} start={(delay[myRank] ?? 1) + 0.6} />}
      <div className="pp-greeting">
        <Menorah lit={8} shamashLit size={84} />
        <b>חנוכה שמח!</b>
        <span>שמחים שנהניתם</span>
      </div>
    </div>
  );
}

function ScoreCard({ score, clue }: { score: NonNullable<TeamState['score']>; clue?: PublicRound['clue'] }) {
  return (
    <div className="score-card enter" role="status">
      <ClueLetter clue={clue} where="phone" />
      <div className="line"><span>הניקוד שלכם</span><b>{score.total.toLocaleString('he-IL')}</b></div>
      <div className="line"><span>המקום שלכם</span><b>{score.rank}<small className="muted" style={{ fontSize: '1rem' }}> מתוך {score.teams}</small></b></div>
      <Motivation score={score} />
    </div>
  );
}

function InGame({ s, team, offset, onChange }: { s: PublicState; team: TeamState; offset: number; onChange: () => void }) {
  const client = useClient('play');
  const t = team.team!;
  if (t.status !== 'active') return <p className="muted center-msg">הקבוצה הוסרה מהמשחק.</p>;
  const r = s.round;
  const score = team.score;

  if (s.instance.status === 'finished') {
    return <PhonePodium s={s} myId={t.id} myRank={score?.rank} />;
  }
  if (s.instance.status !== 'in_progress' || !r) {
    return (
      <div className="center-msg">
        <p className="team-name-big" style={{ color: t.color }}>{t.name}</p>
        <p className="muted">{t.members.join(' · ')}</p>
        <div className="waiting-dots" aria-hidden="true"><i /><i /><i /></div>
        <p>עוד רגע מתחילים</p>
      </div>
    );
  }

  const roundLabel = r.is_finale ? 'הגמר' : `נר ${r.no}`;
  const isFinalist = !r.is_finale || (r.finalists ?? []).includes(t.id);
  const showScore = score && ['intro', 'revealed', 'done'].includes(r.phase) && (r.phase !== 'intro' || r.no > 1);

  const ask = askFor(r.kind, r.content);
  const live = ['betting', 'bets_locked', 'open'].includes(r.phase);
  return (
    <div className="in-round" key={`${r.no}-${r.phase}`}>
      <div className="round-top">
        <div className="round-chip">{roundLabel} · {r.title}</div>
        {(r.phase === 'open' || r.phase === 'paused') && r.kind !== 'sequence_memory' && <Timer endsAt={r.ends_at} pausedMs={r.paused_remaining_ms} offset={offset} total={r.duration_sec} />}
      </div>
      {r.phase === 'open' && isFinalist && ask && r.kind !== 'sprint' && <p className="ask">{ask}</p>}
      {!isFinalist ? <p className="center-msg">הגמר! צפו במסך</p>
        : r.phase === 'intro' ? <div className="instructions-card enter"><p>{r.instructions}</p><div className="waiting-dots" aria-hidden="true"><i /><i /><i /></div></div>
        : r.phase === 'paused' ? <p className="center-msg">הפסקה קצרה. התשובות שמורות.</p>
        : live ? <TaskInput client={client} s={s} team={team} onChange={onChange} offset={offset} />
        : r.phase === 'closed' || r.phase === 'graded' ? <div className="center-msg"><h3>הזמן נגמר</h3><div className="waiting-dots" aria-hidden="true"><i /><i /><i /></div></div>
        : <div className="center-msg look-up"><h3>הפתרון על המסך</h3></div>}
      {showScore && <ScoreCard score={score!} clue={r.clue} />}
    </div>
  );
}
