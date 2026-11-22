/**
 * /screen — the projector. Read-only, anonymous, shows ONLY the screen-safe snapshot.
 * No host controls, no secrets: everything here comes from public_state.
 */
import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { useClient } from '../lib/clientContext';
import { usePublicState, useServerClock } from '../lib/hooks';
import type { PublicState, PublicTeam } from '../lib/types';
import { Menorah } from '../components/Menorah';
import { Timer } from '../components/Timer';
import { SymbolTile } from '../components/Symbols';
import { APP_NAME, FINALE_NAME } from '../config';


export default function Screen() {
  const client = useClient('screen');
  const { state, conn } = usePublicState(client);
  const offset = useServerClock(client);

  return (
    <div className="screen-wrap"><div className="screen stage-16x9">
      {conn !== 'live' && <div className="conn-badge" aria-live="polite">{conn === 'connecting' ? 'מתחבר…' : 'מתחבר מחדש…'}</div>}
      {state?.instance.mode === 'demo' && <div className="demo-badge">משחק ניסיון</div>}
      {!state ? <Splash /> : <Body s={state} offset={offset} />}
    </div></div>
  );
}

function Body({ s, offset }: { s: PublicState; offset: number }) {
  const { status, screen_view } = s.instance;
  if (status === 'finished' || screen_view === 'final_results') return <FinalResults s={s} />;
  if (screen_view === 'standings') return <Standings s={s} />;
  if (status === 'setup') return <Splash />;
  if (status === 'registration_open' || status === 'registration_locked') return <Registration s={s} />;
  if (status === 'in_progress' && s.round) return <RoundView s={s} offset={offset} />;
  return <Splash />;
}

function Splash() {
  return (
    <div className="splash center-col">
      <Menorah lit={8} shamashLit size={560} />
      <h1 className="logo">{APP_NAME}</h1>
      <p className="tagline">שמונה נרות · שַׁמָּשׁ אחד · משפחה אחת</p>
      <p className="hint">הכינו טלפון אחד לכל קבוצה</p>
    </div>
  );
}

function joinUrl(code: string) {
  return `${location.origin}${import.meta.env.BASE_URL}play?code=${code}`;
}

function Registration({ s }: { s: PublicState }) {
  const [qr, setQr] = useState('');
  const url = joinUrl(s.instance.join_code);
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 520, color: { dark: '#0b1026', light: '#fdf6e3' } }).then(setQr);
  }, [url]);
  const open = s.instance.status === 'registration_open';
  return (
    <div className="registration">
      <div className="reg-side">
        <h1 className="logo small">{APP_NAME}</h1>
        {open ? (
          <>
            {qr && <img src={qr} alt={`קוד QR להצטרפות: ${url}`} className="qr" />}
            <div className="join-code">קוד משחק: <b dir="ltr">{s.instance.join_code}</b></div>
            <div className="join-url" dir="ltr">{url.replace(/^https?:\/\//, '')}</div>
            <ol className="steps">
              <li><span>1</span>סורקים את הקוד</li>
              <li><span>2</span>בוחרים שם קבוצה ומזינים משתתפים</li>
              <li><span>3</span>מצטרפים וממתינים לתחילת המשחק</li>
            </ol>
          </>
        ) : <div className="locked-msg">ההרשמה נסגרה — עוד רגע מתחילים!</div>}
      </div>
      <TeamCloud teams={s.teams} />
    </div>
  );
}

/** Teams appear one by one as glowing "flames" — scales nicely to 17+ teams. */
function TeamCloud({ teams }: { teams: PublicTeam[] }) {
  return (
    <div className="team-cloud" data-count={teams.length}>
      <div className="team-count">{teams.length} קבוצות</div>
      <div className="team-grid">
        {teams.map((t, i) => (
          <div key={t.id} className="team-chip" style={{ '--c': t.color, animationDelay: `${(i % 6) * 40}ms` } as React.CSSProperties}>
            <span className="chip-flame" aria-hidden="true" />
            <span className="chip-name">{t.name}</span>
            <span className="chip-members">{t.members > 0 ? `${t.members} משתתפים` : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Poll submission progress while a round is live (cheap; avoids a Realtime message per answer). */
function useProgress(active: boolean, fallback: { submitted_teams: number; total_teams: number }) {
  const client = useClient('screen');
  const [p, setP] = useState(fallback);
  useEffect(() => {
    if (!active) { setP(fallback); return; }
    let alive = true;
    const tick = async () => {
      const { data } = await client.rpc('round_progress');
      if (alive && data) setP(data as typeof fallback);
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => { alive = false; clearInterval(id); };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  return p;
}

function RoundView({ s, offset }: { s: PublicState; offset: number }) {
  const r = s.round!;
  const progress = useProgress(['open', 'paused', 'closed'].includes(r.phase), r.progress);
  const litBefore = Math.min(8, r.no - 1);
  const roundLabel = r.is_finale ? FINALE_NAME : `נר ${r.no}`;
  return (
    <div className={`round phase-${r.phase}`}>
      <header className="round-header">
        <Menorah lit={r.is_finale ? 8 : litBefore} shamashLit={r.is_finale && ['revealed', 'done'].includes(r.phase)}
                 active={r.is_finale ? null : r.no - 1} size={260} />
        <div className="round-titles">
          <div className="round-label">{roundLabel}</div>
          <h2 className="round-title">{r.title}</h2>
        </div>
        {(r.phase === 'open' || r.phase === 'paused') && <Timer endsAt={r.ends_at} pausedMs={r.paused_remaining_ms} offset={offset} total={r.duration_sec} big />}
      </header>

      <main className="round-main">
        {r.phase === 'intro' && <p className="instructions">{r.instructions}</p>}
        {r.phase === 'betting' && <BetBoard s={s} />}
        {r.phase === 'bets_locked' && <div className="big-msg">ההימורים ננעלו. החידה נחשפת…</div>}
        {(r.phase === 'open' || r.phase === 'paused') && <ScreenContent s={s} />}
        {r.phase === 'closed' && <div className="big-msg">הזמן נגמר! ההגשות נסגרו.</div>}
        {r.phase === 'graded' && <div className="big-msg">התשובות נבדקו. מחכים למנחה…</div>}
        {(r.phase === 'revealed' || r.phase === 'done') && <Solution s={s} />}
      </main>

      {(r.phase === 'open' || r.phase === 'paused' || r.phase === 'closed') && (
        <footer className="progress">
          <div className="progress-bar"><div style={{ width: `${(100 * progress.submitted_teams) / Math.max(1, progress.total_teams)}%` }} /></div>
          <span>{progress.submitted_teams} / {progress.total_teams} קבוצות שלחו</span>
        </footer>
      )}
    </div>
  );
}

/** What the audience sees while a task runs. Per-phone tasks show only a status, never answers. */
function ScreenContent({ s }: { s: PublicState }) {
  const r = s.round!;
  const c = r.content ?? {};
  switch (r.kind) {
    case 'code_vault':
      return (
        <div className="clue-grid">
          {(c.clues ?? []).map((cl: any) => <div key={cl.label} className="clue"><b>{cl.label}</b><p>{cl.text}</p></div>)}
          {c.order_clue && <div className="clue order"><b>סדר</b><p>{c.order_clue}</p></div>}
        </div>
      );
    case 'symbols':
      return (
        <div className="symbol-puzzles">
          {(c.puzzles ?? []).map((p: any, i: number) => (
            <div key={i} className="symbol-row"><span className="num">{i + 1}</span>{p.symbols.map((id: string, j: number) => <SymbolTile key={j} id={id} size={96} />)}</div>
          ))}
        </div>
      );
    case 'truth_or_fiction':
      return <ol className="facts">{(c.items?.[0]?.facts ?? []).map((f: string, i: number) => <li key={i}>{f}</li>)}</ol>;
    case 'ordering':
      return <div className="order-items">{(c.items ?? []).map((it: any) => <div key={it.id} className="order-item">{it.label}</div>)}</div>;
    case 'three_pictures':
      return <div className="pictures">{['א', 'ב', 'ג'].map((l) => <div key={l} className="picture-placeholder">תמונה {l}<small>(נכס גרפי בהכנה)</small></div>)}</div>;
    case 'bet_puzzle':
      return (
        <div className="bet-puzzle">
          <div className="cols"><ul>{(c.people ?? []).map((p: string) => <li key={p}>{p}</li>)}</ul><ul>{(c.items ?? []).map((p: string) => <li key={p}>{p}</li>)}</ul></div>
          <ol className="clues">{(c.clues ?? []).map((cl: string, i: number) => <li key={i}>{cl}</li>)}</ol>
        </div>
      );
    case 'finale':
      return <div className="finale-puzzle">{c.puzzle}</div>;
    default:
      // sprint, sliding puzzle, sequence memory, video questions: played on the phones.
      return <div className="big-msg">משחקים בטלפונים!</div>;
  }
}

function BetBoard({ s }: { s: PublicState }) {
  const tracks = s.round?.bet_tracks ?? [];
  return (
    <div className="bet-board">
      <p className="instructions">בחרו מסלול בטלפון. החידה תיחשף רק אחרי שכל ההימורים יינעלו.</p>
      <div className="tracks">
        {tracks.map((t) => (
          <div key={t.id} className="track">
            <h3>{t.label}</h3>
            <p>הצלחה: <b>+{t.winMultiplier}×</b> בסיס</p>
            <p>כישלון: <b>−{t.lossMultiplier}×</b> בסיס</p>
          </div>
        ))}
      </div>
      <p className="hint">הניקוד אף פעם לא יורד מתחת לאפס.</p>
    </div>
  );
}

/** Shows the actual answers after reveal (only ever rendered from the revealed snapshot). */
function Solution({ s }: { s: PublicState }) {
  const sol = s.round?.solution as any;
  const c = (s.round?.content ?? {}) as any;
  if (!sol) return <div className="big-msg">הפתרון נחשף</div>;
  let body: React.ReactNode = null;
  switch (sol.kind) {
    case 'code_vault': case 'finale':
      body = sol.code ? <div className="sol-code" dir="ltr">{sol.code}</div> : <div className="sol-code">{sol.text?.canonical ?? sol.choice}</div>; break;
    case 'sprint': case 'video_memory':
      body = <ol className="sol-list">{sol.items.map((it: any, i: number) => (
        <li key={i}><span className="q">{(c.questions ?? [])[i]?.text}</span><b>{'choice' in it ? it.choice : it.text.canonical}</b></li>))}</ol>; break;
    case 'truth_or_fiction':
      body = <ol className="sol-list">{sol.items.map((it: any, i: number) => (
        <li key={i}><span className="q">ההמצאה:</span><b>{c.items?.[i]?.facts?.[Number(it.choice) - 1] ?? it.choice}</b></li>))}</ol>; break;
    case 'three_pictures':
      body = <ol className="sol-list">{sol.items.map((it: any, i: number) => <li key={i}><span className="q">מקצה {i + 1}:</span><b>תמונה {it.choice}</b></li>)}</ol>; break;
    case 'symbols':
      body = <ol className="sol-list">{sol.items.map((it: any, i: number) => <li key={i}><b>{it.text.canonical}</b></li>)}</ol>; break;
    case 'ordering': {
      const lbl = new Map((c.items ?? []).map((x: any) => [x.id, x.label]));
      body = <ol className="sol-order">{sol.correct.map((id: string) => <li key={id}>{String(lbl.get(id) ?? id)}</li>)}</ol>; break;
    }
    case 'bet_puzzle':
      body = <ul className="sol-list">{sol.assignment.map((j: number, i: number) => <li key={i}><span className="q">{c.people?.[i]}</span><b>{c.items?.[j]}</b></li>)}</ul>; break;
    case 'sequence_memory':
      body = <div className="sol-seq">{sol.stages[sol.stages.length - 1].map((id: string, i: number) => <SymbolTile key={i} id={id} size={64} />)}</div>; break;
    case 'sliding_puzzle':
      body = <div className="big-msg">הפאזל המלא</div>; break;
  }
  return <div className="solution"><h3>הפתרון</h3>{body}</div>;
}

function useRanked(s: PublicState) {
  return useMemo(() => {
    const names = new Map(s.teams.map((t) => [t.id, t]));
    let prev: number | null = null, rank = 0;
    return (s.standings ?? []).map((x, i) => {
      if (x.total !== prev) { rank = i + 1; prev = x.total; }
      return { ...x, rank, team: names.get(x.team_id) };
    });
  }, [s]);
}

function Standings({ s }: { s: PublicState }) {
  const ranked = useRanked(s);
  const max = Math.max(1, ...ranked.map((r) => r.total));
  return (
    <div className="standings">
      <h2>טבלת הניקוד</h2>
      <div className={`standings-list ${ranked.length > 10 ? 'two-col' : ''}`}>
        {ranked.map((r) => (
          <div key={r.team_id} className="standing-row" style={{ '--c': r.team?.color } as React.CSSProperties}>
            <span className="rank">{r.rank}</span>
            <span className="name">{r.team?.name}</span>
            <span className="bar"><span style={{ width: `${(100 * r.total) / max}%` }} /></span>
            <span className="pts">{r.total.toLocaleString('he-IL')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FinalResults({ s }: { s: PublicState }) {
  const ranked = useRanked(s);
  const champ = ranked.filter((r) => r.rank === 1);
  return (
    <div className="final-results">
      <Menorah lit={8} shamashLit size={300} />
      <div className="champion-label">{champ.length > 1 ? 'האלופות' : 'האלופה'}</div>
      <h1 className="champion">{champ.map((c) => c.team?.name).join(' · ')}</h1>
      <div className="final-list">
        {ranked.slice(champ.length).map((r) => (
          <div key={r.team_id} className="final-row"><span>{r.rank}</span><span>{r.team?.name}</span><span>{r.total.toLocaleString('he-IL')}</span></div>
        ))}
      </div>
      <div className="confetti" aria-hidden="true">{Array.from({ length: 40 }, (_, i) => <i key={i} style={{ '--i': i } as React.CSSProperties} />)}</div>
    </div>
  );
}
