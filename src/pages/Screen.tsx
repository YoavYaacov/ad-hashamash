/**
 * /screen — the projector. Read-only, anonymous, shows ONLY the screen-safe snapshot.
 * No host controls, no secrets: everything here comes from public_state.
 */
import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { useClient } from '../lib/clientContext';
import { usePublicState, useServerClock, useAutoStandings } from '../lib/hooks';
import type { PublicState, PublicTeam } from '../lib/types';
import { Menorah } from '../components/Menorah';
import { Timer } from '../components/Timer';
import { SymbolTile } from '../components/Symbols';
import { APP_NAME, FINALE_NAME } from '../config';
import { Scene } from '../components/Scene';
import { Swap } from '../components/Swap';
import { Character, MenorahVariant } from '../components/BetArt';
import { SafeArt } from '../components/Safe';
import { StakeLines } from '../components/BetStakes';
import type { SceneSpec } from '../content/scenes';


/** Slow rising embers: the screen should feel alive even when nothing happens. */
const EMBERS = Array.from({ length: 26 }, (_, i) => ({
  x: `${(i * 37) % 100}%`, s: `${4 + ((i * 7) % 9)}px`, d: `${14 + ((i * 11) % 16)}s`, delay: `${-((i * 13) % 28)}s`,
  dx: `${((i % 5) - 2) * 18}px`, o: 0.35 + ((i * 3) % 5) / 10,
}));
function Embers() {
  return (
    <div className="embers" aria-hidden="true">
      {EMBERS.map((e, i) => <i key={i} style={{ '--x': e.x, '--s': e.s, '--d': e.d, '--delay': e.delay, '--dx': e.dx, '--o': e.o } as React.CSSProperties} />)}
    </div>
  );
}

export default function Screen() {
  const client = useClient('screen');
  const { state, conn } = usePublicState(client);
  const offset = useServerClock(client);
  const auto = useAutoStandings(state?.round, offset);

  return (
    <div className="screen-wrap"><div className="screen stage-16x9">
      <Embers />
      {conn !== 'live' && <div className="conn-badge" aria-live="polite">{conn === 'connecting' ? 'מתחבר…' : 'מתחבר מחדש…'}</div>}
      {state?.instance.mode === 'demo' && <div className="demo-badge">משחק ניסיון</div>}
      <Swap k={viewKey(state, auto.show)} className="screen-swap"><Body s={state} offset={offset} autoStandings={auto.show} /></Swap>
    </div></div>
  );
}

/** Which "screen" is showing: changing it triggers the fade-out → fade-in sequence. */
function viewKey(s: PublicState | null, autoStandings = false): string {
  if (!s) return 'lobby';
  const { status, screen_view } = s.instance;
  if (status === 'finished' || screen_view === 'final_results') return 'final';
  if (screen_view === 'standings' || (autoStandings && s.standings)) return `standings-${s.round?.no}`;
  if (status === 'in_progress' && s.round) return `round-${s.round.no}`;
  return 'lobby';
}

function Body({ s, offset, autoStandings }: { s: PublicState | null; offset: number; autoStandings: boolean }) {
  if (!s) return <Lobby s={null} />;
  const { status, screen_view } = s.instance;
  if (status === 'finished' || screen_view === 'final_results') return <FinalResults key="final" s={s} />;
  if (screen_view === 'standings' || (autoStandings && s.standings)) return <Standings key={`st-${s.round?.no}`} s={s} />;
  if (status === 'in_progress' && s.round) return <RoundView key={`r-${s.round.no}`} s={s} offset={offset} />;
  return <Lobby s={s} />;
}

function joinUrl() {
  return `${location.origin}${import.meta.env.BASE_URL}play`;
}

/**
 * Idle and registration are ONE layout: when the host opens registration the title glides up,
 * and the QR, instructions and the arriving teams fade in beneath it.
 */
function Lobby({ s }: { s: PublicState | null }) {
  const status = s?.instance.status;
  const reg = status === 'registration_open' || status === 'registration_locked';
  const open = status === 'registration_open';
  const [qr, setQr] = useState('');
  const url = joinUrl();
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 520, color: { dark: '#0b1026', light: '#fdf6e3' } }).then(setQr);
  }, [url]);
  return (
    <div className={`lobby ${reg ? 'reg' : 'idle'}`}>
      <div className="lobby-title">
        <Menorah lit={8} shamashLit size={520} />
        <h1 className="logo">{APP_NAME}</h1>
        <p className="tagline">שמונה נרות · שַׁמָּשׁ אחד · משפחה אחת</p>
      </div>
      <div className="lobby-body">
        <Swap k={open ? 'open' : 'locked'} className="join-swap">
          <div className="join">
            {open ? (
              <>
                {qr && <img src={qr} alt={`קוד QR להצטרפות: ${url}`} className="qr" />}
                <ol className="steps">
                  <li><span>1</span>סורקים את הקוד, טלפון אחד לכל קבוצה</li>
                  <li><span>2</span>כותבים את שמות המשתתפים</li>
                  <li><span>3</span>מקבלים שם קבוצה מצחיק, ומחכים להתחלה</li>
                </ol>
              </>
            ) : <div className="locked-msg">ההרשמה נסגרה. עוד רגע מתחילים!</div>}
          </div>
        </Swap>
        <TeamCloud teams={s?.teams ?? []} />
      </div>
    </div>
  );
}

/** Teams appear one by one as glowing "flames". Only the drawn name is shown, never participants. */
function TeamCloud({ teams }: { teams: PublicTeam[] }) {
  return (
    <div className="team-cloud" data-count={teams.length}>
      <div className="team-count">{teams.length === 0 ? 'מחכים לקבוצה הראשונה…' : `${teams.length} קבוצות כבר כאן`}</div>
      <div className="team-grid">
        {teams.map((t) => (
          <div key={t.id} className="team-chip new" style={{ '--c': t.color } as React.CSSProperties}>
            <span className="chip-flame" aria-hidden="true" />
            <span className="chip-name">{t.name}</span>
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
        <Swap k={r.phase === 'paused' ? 'open' : r.phase}>
        {r.phase === 'intro' && <p className="instructions">{r.instructions}</p>}
        {r.phase === 'betting' && <BetBoard s={s} />}
        {r.phase === 'bets_locked' && <div className="big-msg">ההימורים ננעלו. החידה נחשפת…</div>}
        {(r.phase === 'open' || r.phase === 'paused') && <ScreenContent s={s} />}
        {r.phase === 'closed' && <div className="big-msg">הזמן נגמר! ההגשות נסגרו.</div>}
        {r.phase === 'graded' && <div className="big-msg">התשובות נבדקו. מחכים למנחה…</div>}
        {(r.phase === 'revealed' || r.phase === 'done') && <Solution s={s} />}
        </Swap>
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
        <div className="vault-screen">
        <div className="clue-grid">
          {(c.clues ?? []).map((cl: any) => <div key={cl.label} className="clue"><b>{cl.label}</b><p>{cl.text}</p></div>)}
          {c.order_clue && <div className="clue order"><b>סדר</b><p>{c.order_clue}</p></div>}
        </div>
        <SafeArt state="closed" />
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
      return (
        <div className="fact-sets">
          {(c.items ?? []).map((it: any, k: number) => (
            <div key={k} className="fact-set enter" style={{ animationDelay: `${k * 0.2}s` }}>
              <h4>סט {k + 1}</h4>
              <ol>{it.facts.map((f: string, i: number) => <li key={i}>{f}</li>)}</ol>
            </div>
          ))}
        </div>
      );
    case 'ordering':
      return <div className="order-items">{(c.items ?? []).map((it: any) => <div key={it.id} className="order-item">{it.label}</div>)}</div>;
    case 'three_pictures':
      return <PictureHeats heats={c.heats ?? []} item={r.screen_item ?? 0} />;
    case 'bet_puzzle':
      return (
        <div className="bet-puzzle">
          <div className="bet-cast stagger">
            {(c.people ?? []).map((p: string, i: number) => (
              <figure key={p} className="cast person" style={{ '--i': i } as React.CSSProperties}>
                {c.people_art?.[i] && <Character id={c.people_art[i]} size={96} />}<figcaption>{p}</figcaption>
              </figure>
            ))}
          </div>
          <div className="bet-cast stagger">
            {(c.items ?? []).map((p: string, i: number) => (
              <figure key={p} className="cast menorah" style={{ '--i': i + 4 } as React.CSSProperties}>
                {c.items_art?.[i] && <MenorahVariant id={c.items_art[i]} size={96} />}<figcaption>{p}</figcaption>
              </figure>
            ))}
          </div>
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
  const base = s.round?.bet_base ?? 0;
  return (
    <div className="bet-board">
      <p className="instructions">בחרו מסלול בטלפון. החידה תיחשף רק אחרי שכל ההימורים יינעלו.</p>
      <div className="tracks stagger">
        {tracks.map((t, i) => (
          <div key={t.id} className="track" style={{ '--i': i } as React.CSSProperties}>
            <h3>{t.label}</h3>
            <StakeLines t={t} base={base} />
          </div>
        ))}
      </div>
      <p className="hint">אם לא בוחרים מסלול, נשארים ב"{tracks.find((t) => t.lossMultiplier === 0)?.label ?? 'זהיר'}". הניקוד אף פעם לא יורד מתחת ל־0.</p>
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
    case 'code_vault':
      body = <div className="vault-screen" style={{ gridTemplateColumns: 'auto auto', justifyContent: 'center' }}><div className="sol-code" dir="ltr">{sol.code}</div><SafeArt state="open" digits={sol.code} /></div>; break;
    case 'finale':
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
      body = (
        <div className="bet-solution stagger">
          {sol.assignment.map((j: number, i: number) => (
            <div key={i} className="pair" style={{ '--i': i } as React.CSSProperties}>
              {c.people_art?.[i] && <Character id={c.people_art[i]} size={84} />}
              <span className="who">{c.people?.[i]}</span>
              <span className="arrow" aria-hidden="true">←</span>
              {c.items_art?.[j] && <MenorahVariant id={c.items_art[j]} size={84} />}
              <b>{c.items?.[j]}</b>
            </div>
          ))}
        </div>
      ); break;
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
    return (s.standings ?? []).map((x: any) => ({ ...x, team: names.get(x.team_id) }));
  }, [s]);
}

/** Top 5 only. Each team sees its own exact place on its phone. */
function Standings({ s }: { s: PublicState }) {
  const ranked = useRanked(s);
  const max = Math.max(1, ...ranked.map((r) => r.total));
  return (
    <div className="standings top5">
      <h2 className="enter">חמש המובילות</h2>
      <div className="standings-list">
        {ranked.map((r, i) => (
          <div key={r.team_id} className="standing-row" style={{ '--c': r.team?.color, '--i': ranked.length - 1 - i } as React.CSSProperties}>
            <span className="rank">{r.rank}</span>
            <span className="name">{r.team?.name}</span>
            <span className="bar"><span style={{ width: `${(100 * r.total) / max}%` }} /></span>
            <span className="pts">{r.total.toLocaleString('he-IL')}</span>
          </div>
        ))}
      </div>
      <p className="hint enter-slow" style={{ animationDelay: '1.5s' }}>המקום והניקוד של כל קבוצה מופיעים בטלפון שלה</p>
    </div>
  );
}

/** Lots of confetti: a steady rain plus two side cannons that fire in waves. Pure CSS, deterministic. */
const CONFETTI_COLORS = ['#e9b949', '#f5d77a', '#5c8df6', '#7bc67e', '#f28ab2', '#b57edc', '#4fb0c6', '#f4ead2', '#e8604c'];
const SHAPES = ['rect', 'strip', 'circle', 'star'];
function Confetti() {
  const rain = useMemo(() => Array.from({ length: 140 }, (_, i) => {
    const r = (k: number) => ((Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
    return {
      x: r(1) * 100, d: 4.5 + r(2) * 4, delay: -r(3) * 9, drift: (r(4) - .5) * 18, spin: 360 + r(5) * 900,
      s: .6 + r(6) * .9, c: CONFETTI_COLORS[i % CONFETTI_COLORS.length], shape: SHAPES[Math.floor(r(7) * SHAPES.length)],
    };
  }), []);
  const bursts = useMemo(() => Array.from({ length: 72 }, (_, i) => {
    const r = (k: number) => ((Math.sin(i * 39.3467 + k * 11.135) * 24634.6345) % 1 + 1) % 1;
    const side = i % 2 ? 1 : -1;
    return {
      side, wave: Math.floor(i / 24), bx: side * (18 + r(1) * 38), by: -(30 + r(2) * 45), spin: 300 + r(3) * 700,
      c: CONFETTI_COLORS[(i * 5) % CONFETTI_COLORS.length], shape: SHAPES[Math.floor(r(4) * SHAPES.length)], s: .7 + r(5) * .8,
    };
  }), []);
  return (
    <div className="confetti" aria-hidden="true">
      {rain.map((p, i) => (
        <i key={i} className={`cf ${p.shape}`} style={{ left: `${p.x}%`, background: p.shape === 'star' ? undefined : p.c, color: p.c,
          '--d': `${p.d}s`, '--delay': `${p.delay}s`, '--drift': `${p.drift}cqw`, '--spin': `${p.spin}deg`, '--s': p.s } as React.CSSProperties} />
      ))}
      {bursts.map((p, i) => (
        <i key={`b${i}`} className={`burst ${p.shape} ${p.side > 0 ? 'from-left' : 'from-right'}`} style={{ background: p.shape === 'star' ? undefined : p.c, color: p.c,
          '--bx': `${p.bx}cqw`, '--by': `${p.by}cqh`, '--spin': `${p.spin}deg`, '--s': p.s, '--delay': `${.3 + p.wave * 2.6 + (i % 6) * .05}s` } as React.CSSProperties} />
      ))}
    </div>
  );
}

function FinalResults({ s }: { s: PublicState }) {
  const ranked = useRanked(s);
  const champ = ranked.filter((r) => r.rank === 1);
  return (
    <div className="final-results">
      <Menorah lit={8} shamashLit size={300} />
      <div className="champion-label enter">{champ.length > 1 ? 'האלופות' : 'האלופה'}</div>
      <h1 className="champion" style={{ animation: 'pop-name 1.4s cubic-bezier(.2,1.4,.4,1) .4s both' }}>{champ.map((c) => c.team?.name).join(' · ')}</h1>
      <div className="final-list stagger">
        {ranked.slice(champ.length).map((r, i) => (
          <div key={r.team_id} className="final-row" style={{ '--i': i + 6 } as React.CSSProperties}><span>{r.rank}</span><span>{r.team?.name}</span><span>{r.total.toLocaleString('he-IL')}</span></div>
        ))}
      </div>
      <Confetti />
    </div>
  );
}

/** One heat at a time, large. The HOST chooses which heat is shown (no automatic rotation). */
function PictureHeats({ heats, item }: { heats: { title?: string; pictures: SceneSpec[] }[]; item: number }) {
  const k = Math.min(Math.max(0, item), heats.length - 1);
  const h = heats[k];
  if (!h) return null;
  return (
    <div className="heat-view">
      <div className="heat-label">מקצה {k + 1} מתוך {heats.length}{h.title ? ` · ${h.title}` : ''}
        <span className="heat-dots">{heats.map((_, i) => <i key={i} className={i === k ? 'on' : ''} />)}</span>
      </div>
      <Swap k={`heat-${k}`} className="heat-swap">
        <div className="pictures-wide">
          {h.pictures.map((p, j) => (
            <figure key={j}><Scene s={p} label={`מקצה ${k + 1}, תמונה ${['א', 'ב', 'ג'][j]}`} /><figcaption>{['א', 'ב', 'ג'][j]}</figcaption></figure>
          ))}
        </div>
      </Swap>
    </div>
  );
}
