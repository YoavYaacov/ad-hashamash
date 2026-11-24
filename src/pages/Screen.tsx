/**
 * /screen — the projector. Read-only, anonymous, shows ONLY the screen-safe snapshot.
 * No host controls, no secrets: everything here comes from public_state.
 */
import { ClueLetter } from '../components/ClueLetter';
import { LetterMenorah } from '../components/LetterMenorah';
import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { useClient } from '../lib/clientContext';
import { usePublicState, useServerClock, useAutoStandings, useTick } from '../lib/hooks';
import { useMusic, pickTrack } from '../lib/music';
import type { PublicState, PublicTeam } from '../lib/types';
import { Menorah } from '../components/Menorah';
import { Timer } from '../components/Timer';
import { SymbolTile } from '../components/Symbols';
import { APP_NAME } from '../config';
import { Scene } from '../components/Scene';
import { Swap } from '../components/Swap';
import { Character, MenorahVariant } from '../components/BetArt';
import { askFor } from '../content/asks';
import { FitText } from '../components/FitText';
import { MemorySymbol } from '../components/MemoryArt';
import { useMemoryClock, useStageData } from '../lib/memory';
import { VaultClues } from '../components/VaultClues';
import { SafeArt, OpeningSafe } from '../components/Safe';
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

  // One click anywhere on the screen: the screen itself goes full screen (also inside the demo's split view),
  // and that click also lets the browser start the music.
  const goFull = (e: React.MouseEvent<HTMLDivElement>) => {
    // On the real projector page the whole page goes full screen; inside the demo only the screen pane does.
    const el = document.querySelector('.demo-shell') ? e.currentTarget : document.documentElement;
    try { if (!document.fullscreenElement) el.requestFullscreen?.().catch(() => {}); } catch { /* not allowed */ }
  };
  return (
    <div className="screen-wrap" onClick={goFull}><div className="screen stage-16x9">
      <Embers />
      {conn !== 'live' && <div className="conn-badge" aria-live="polite">{conn === 'connecting' ? 'מתחבר…' : 'מתחבר מחדש…'}</div>}
      {state?.instance.mode === 'demo' && <div className="demo-badge">משחק ניסיון</div>}
      <Swap k={viewKey(state, auto.show)} className="screen-swap"><Body s={state} offset={offset} autoStandings={auto.show} /></Swap>
      {state && <Music s={state} offset={offset} />}
    </div></div>
  );
}

/** Background music for the room (projector only). The host controls on/off and volume. */
function Music({ s, offset }: { s: PublicState; offset: number }) {
  useTick(500);
  const mem = useMemoryClock(s.round?.kind === 'sequence_memory' ? s.round : null, offset);
  const track = pickTrack(s, Date.now() + offset, mem?.phase);
  const m = s.instance.music ?? { on: true, volume: 60 };
  useMusic(track, m.on, m.volume);
  return null;
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
            ) : (
              <div className="locked-msg">
                <p className="lk-l1">שמונה נרות. שמונה מבחנים.</p>
                <p className="lk-l2">{['עירנות', 'חדות', 'זריזות', 'ידע'].map((w, i) => <span key={w} style={{ '--i': i } as React.CSSProperties}>{w}</span>)}</p>
                <p className="lk-l3">רק הטובים ביותר יגיעו אל השַּׁמָּשׁ</p>
              </div>
            )}
          </div>
        </Swap>
        <TeamCloud teams={s?.teams ?? []} />
      </div>
    </div>
  );
}

/** The more teams, the smaller the chips, so up to 30 always fit the projector without scrolling. */
function chipScale(n: number) {
  return n <= 8 ? 1 : n <= 12 ? 0.86 : n <= 16 ? 0.74 : n <= 20 ? 0.66 : n <= 25 ? 0.58 : 0.52;
}

/** Teams appear one by one as glowing "flames". Only the drawn name is shown, never participants. */
function TeamCloud({ teams }: { teams: PublicTeam[] }) {
  return (
    <div className="team-cloud" data-count={teams.length} style={{ '--chip-scale': chipScale(teams.length) } as React.CSSProperties}>
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
  const roundLabel = r.is_finale ? 'הגמר' : `נר ${r.no}`;
  return (
    <div className={`round phase-${r.phase}`}>
      <header className="round-header">
        <Menorah lit={r.is_finale ? 8 : litBefore} shamashLit={r.is_finale && ['revealed', 'done'].includes(r.phase)}
                 active={r.is_finale ? null : r.no - 1} size={260} />
        <div className="round-titles">
          <div className="round-label">{roundLabel}</div>
          <h2 className="round-title">{r.title}</h2>
          {['open', 'paused'].includes(r.phase) && askFor(r.kind, r.content) && <p className="round-ask">{askFor(r.kind, r.content)}</p>}
        </div>
        {(r.phase === 'open' || r.phase === 'paused') && r.kind !== 'sequence_memory' && <Timer endsAt={r.ends_at} pausedMs={r.paused_remaining_ms} offset={offset} total={r.duration_sec} big />}
      </header>

      <main className="round-main">
        <Swap k={r.phase === 'paused' ? 'open' : r.phase === 'graded' ? 'closed' : r.phase}>
        {r.phase === 'intro' && <p className="instructions">{r.instructions}</p>}
        {r.phase === 'betting' && <BetBoard s={s} />}
        {r.phase === 'bets_locked' && <div className="big-msg">ההימורים ננעלו</div>}
        {(r.phase === 'open' || r.phase === 'paused') && (r.kind === 'sequence_memory' ? <MemoryScreen s={s} offset={offset} /> : <ScreenContent s={s} />)}
        {(r.phase === 'closed' || r.phase === 'graded') && <div className="big-msg">הזמן נגמר<div className="waiting-dots" aria-hidden="true"><i /><i /><i /></div></div>}
        {(r.phase === 'revealed' || r.phase === 'done') && <Solution s={s} />}
        </Swap>
      </main>

      {(r.phase === 'open' || r.phase === 'paused' || r.phase === 'closed') && r.kind !== 'sequence_memory' && (
        <footer className="progress">
          <div className="progress-bar"><div style={{ width: `${(100 * progress.submitted_teams) / Math.max(1, progress.total_teams)}%` }} /></div>
          <span>{progress.submitted_teams} / {progress.total_teams} קבוצות שלחו</span>
        </footer>
      )}
    </div>
  );
}

/** What the audience sees while a task runs. Per-phone tasks show only a status, never answers. */
/** Candle memory on the projector: same shared timeline as the phones. */
function MemoryScreen({ s, offset }: { s: PublicState; offset: number }) {
  const client = useClient('screen');
  const r = s.round!;
  const c = r.content ?? {};
  const now = useMemoryClock(r, offset);
  const stage = now?.stage ?? 0, phase = now?.phase ?? 'intro';
  const data = useStageData(client, s.instance.id, stage, phase !== 'intro', phase === 'result');
  const total = (c.stage_lengths ?? []).length;
  if (!now) return null;
  let body: React.ReactNode;
  if (phase === 'intro') body = <div className="mem-screen-intro"><span>שלב</span><b>{stage + 1}</b><small>מתוך {total}</small></div>;
  else if (phase === 'show') body = data.sequence ? <div className="mem-screen-symbol"><MemorySymbol id={data.sequence[now.symbol]} size={300} /></div> : null;
  else if (phase === 'recall') {
    const recall = c.timing?.recall_ms ?? 20000, sec = Math.ceil(now.msLeft / 1000);
    body = (
      <div className="mem-screen-recall">
        <svg viewBox="0 0 120 120" className="mem-ring" aria-hidden="true">
          <circle cx="60" cy="60" r="52" className="track" />
          <circle cx="60" cy="60" r="52" className="fill" style={{ strokeDasharray: 327, strokeDashoffset: 327 * (1 - now.msLeft / recall) }} />
        </svg>
        <b className="mem-sec">{sec}</b>
        <span>משחזרים בטלפון</span>
      </div>
    );
  } else if (phase === 'result') body = (
    <div className="mem-screen-result">
      <div className="mem-seq">{(data.sequence ?? []).map((id, i) => <span key={i} style={{ '--i': i } as React.CSSProperties}><MemorySymbol id={id} size={110} /></span>)}</div>
      {data.passed !== undefined && <p className="mem-left">{data.passed === 0 ? 'אף נציג לא עבר' : `${data.passed} נציגים ממשיכים`}</p>}
    </div>
  );
  else body = <div className="big-msg">סוף הסבב</div>;
  return <Swap k={`${stage}-${phase}-${phase === 'show' ? now.symbol : ''}`} className="mem-swap" outMs={280}>{body}</Swap>;
}

function ScreenContent({ s }: { s: PublicState }) {
  const r = s.round!;
  const c = r.content ?? {};
  switch (r.kind) {
    case 'code_vault':
      return (
        <div className="vault-screen">
          <VaultClues clues={c.clues ?? []} order={c.order_clue} big />
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
          {c.setup && <p className="bet-setup">{c.setup}</p>}
          <div className="bet-cast stagger">
            {(c.people ?? []).map((p: string, i: number) => (
              <figure key={p} className="cast person" style={{ '--i': i } as React.CSSProperties}>
                {c.people_art?.[i] && <Character id={c.people_art[i]} size={96} />}<figcaption>{p}</figcaption>
              </figure>
            ))}
          </div>
          <div className="bet-cast stagger">
            {(c.items ?? []).map((p: string, i: number) => (
              <figure key={p} className="cast menorah" style={{ '--i': i + (c.people?.length ?? 4) } as React.CSSProperties}>
                {c.items_art?.[i] && <MenorahVariant id={c.items_art[i]} size={96} />}<figcaption>{p}</figcaption>
              </figure>
            ))}
          </div>
          <ol className="clues">{(c.clues ?? []).map((cl: string, i: number) => <li key={i}>{cl}</li>)}</ol>
        </div>
      );
    case 'finale':
      return c.answer_type === 'letters'
        ? <div className="finale-board"><LetterMenorah letters={Array(8).fill('')} /><p className="finale-puzzle">{c.puzzle}</p></div>
        : <div className="finale-puzzle">{c.puzzle}</div>;
    default:
      // sprint, sliding puzzle, sequence memory, video questions: played on the phones.
      return <div className="on-phones"><PhoneGlyph /><span>בטלפון</span></div>;
  }
}

function BetBoard({ s }: { s: PublicState }) {
  const tracks = s.round?.bet_tracks ?? [];
  const base = s.round?.bet_base ?? 0;
  return (
    <div className="bet-board">
      <p className="instructions">החידה עוד מוסתרת. על כמה אתם מהמרים?</p>
      <div className="tracks stagger">
        {tracks.map((t, i) => (
          <div key={t.id} className="track" style={{ '--i': i } as React.CSSProperties}>
            <h3>{t.label}</h3>
            <StakeLines t={t} base={base} />
          </div>
        ))}
      </div>
      <p className="hint">בלי בחירה = "{tracks.find((t) => t.lossMultiplier === 0)?.label ?? 'זהיר'}"</p>
    </div>
  );
}

const PhoneGlyph = () => (
  <svg viewBox="0 0 40 64" width="64" height="100" aria-hidden="true"><rect x="2" y="2" width="36" height="60" rx="7" fill="none" stroke="currentColor" strokeWidth="3" /><circle cx="20" cy="54" r="2.6" fill="currentColor" /></svg>
);

/** Shows the actual answers after reveal (only ever rendered from the revealed snapshot). */
function Solution({ s }: { s: PublicState }) {
  const sol = s.round?.solution as any;
  const c = (s.round?.content ?? {}) as any;
  if (!sol) return <div className="big-msg">הפתרון נחשף</div>;
  let body: React.ReactNode = null;
  switch (sol.kind) {
    case 'code_vault':
      body = <div className="vault-screen" style={{ gridTemplateColumns: 'auto auto', justifyContent: 'center' }}><div className="sol-code" dir="ltr">{sol.code}</div><OpeningSafe digits={sol.code} size={260} delay={600} /></div>; break;
    case 'finale':
      body = sol.letters ? <div className="finale-board"><LetterMenorah letters={[...String(sol.letters)]} lit className="reveal" /></div>
        : sol.code ? <div className="sol-code" dir="ltr">{sol.code}</div> : <div className="sol-code">{sol.text?.canonical ?? sol.choice}</div>; break;
    case 'sprint': case 'video_memory':
      body = <ol className="sol-list">{sol.items.map((it: any, i: number) => (
        <li key={i}><span className="q">{(c.questions ?? [])[i]?.text}</span><b>{'choice' in it ? it.choice : it.text.canonical}</b></li>))}</ol>; break;
    case 'truth_or_fiction':
      body = <ol className="sol-list">{sol.items.map((it: any, i: number) => (
        <li key={i}><span className="q">ההמצאה:</span><b>{c.items?.[i]?.facts?.[Number(it.choice) - 1] ?? it.choice}</b></li>))}</ol>; break;
    case 'three_pictures':
      body = (
        <div className="pic-solution stagger">
          {sol.items.map((it: any, i: number) => (
            <div key={i} className="heat-sol" style={{ '--i': i } as React.CSSProperties}>
              {(c.heats?.[i]?.pictures ?? []).map((p: SceneSpec, j: number) => {
                const letter = ['א', 'ב', 'ג'][j];
                const n = it.marks?.[j]?.length ?? 0;
                return (
                  <figure key={j} className={letter === it.choice ? 'win' : ''} style={{ '--h': i } as React.CSSProperties}>
                    <Scene s={p} marks={it.marks?.[j]} />
                    <figcaption>{letter}{it.marks && <span className="diff-count">{n}</span>}</figcaption>
                  </figure>
                );
              })}
            </div>
          ))}
        </div>
      ); break;
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
              {c.items_art?.[j] && <MenorahVariant id={c.items_art[j]} size={84} />}
              <b>{c.items?.[j]}</b>
            </div>
          ))}
        </div>
      ); break;
    case 'sequence_memory':
      body = null; break;                                   // no solution for the memory round: straight to the scores
    case 'sliding_puzzle':
      body = c.scene ? <div className="puzzle-solution"><Scene s={c.scene} /></div> : null; break;
  }
  return <div className="solution">{body}</div>;
}

function useRanked(s: PublicState) {
  return useMemo(() => {
    const names = new Map(s.teams.map((t) => [t.id, t]));
    return (s.standings ?? []).map((x: any) => ({ ...x, team: names.get(x.team_id) }));
  }, [s]);
}

/** Top 5 only. Each team sees its own exact place on its phone. */
/** Number that counts up when it appears. */
function CountUp({ to, ms = 1400, delay = 0 }: { to: number; ms?: number; delay?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0; const t0 = performance.now() + delay;
    const step = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - t0) / ms));
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, ms, delay]);
  return <>{v.toLocaleString('he-IL')}</>;
}

/** Top 5, big and centred: rows rise from the bottom (5 → 1), bars grow, points count up, the leader glows. */
function Standings({ s }: { s: PublicState }) {
  const ranked = useRanked(s);
  const max = Math.max(1, ...ranked.map((r) => r.total));
  const n = ranked.length;
  return (
    <div className="standings top5">
      <ClueLetter clue={s.round?.clue} where="screen" />
      <h2 className="top5-title">חמש המובילות</h2>
      <div className="top5-list">
        {ranked.map((r, i) => (
          <div key={r.team_id} className={`top5-row ${r.rank === 1 ? 'leader' : ''}`} style={{ '--c': r.team?.color, '--i': n - 1 - i } as React.CSSProperties}>
            <span className="rank">{r.rank}</span>
            <span className="name"><FitText>{r.team?.name}</FitText></span>
            <span className="bar"><span style={{ width: `${(100 * r.total) / max}%` }} /></span>
            <span className="pts"><CountUp to={r.total} delay={(n - 1 - i) * 220 + 300} /></span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Lots of confetti: a steady rain plus two side cannons that fire in waves. Pure CSS, deterministic. */
const CONFETTI_COLORS = ['#e9b949', '#f5d77a', '#5c8df6', '#7bc67e', '#f28ab2', '#b57edc', '#4fb0c6', '#f4ead2', '#e8604c'];
const SHAPES = ['rect', 'strip', 'circle', 'star'];
/** Fireworks around the edges of the projector (sides and top corners), bursting in turns. */
const FW_SPOTS = [[6, 16], [94, 14], [4, 48], [96, 46], [8, 80], [92, 78], [22, 6], [78, 7], [3, 30], [97, 64]];
const FW_COLORS = ['#f5c84a', '#e8604c', '#5c8df6', '#7bc67e', '#f28ab2', '#b57edc', '#4fb0c6', '#ffe7a3'];

function Confetti() {
  const rain = useMemo(() => Array.from({ length: 140 }, (_, i) => {
    const r = (k: number) => ((Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
    return {
      x: r(1) * 100, d: 4.5 + r(2) * 4, delay: -r(3) * 9, drift: (r(4) - .5) * 18, spin: 360 + r(5) * 900,
      s: .6 + r(6) * .9, c: CONFETTI_COLORS[i % CONFETTI_COLORS.length], shape: SHAPES[Math.floor(r(7) * SHAPES.length)],
    };
  }), []);
  return (
    <div className="confetti" aria-hidden="true">
      {rain.map((p, i) => (
        <i key={i} className={`cf ${p.shape}`} style={{ left: `${p.x}%`, background: p.shape === 'star' ? undefined : p.c, color: p.c,
          '--d': `${p.d}s`, '--delay': `${p.delay}s`, '--drift': `${p.drift}cqw`, '--spin': `${p.spin}deg`, '--s': p.s } as React.CSSProperties} />
      ))}
      {FW_SPOTS.map(([x, y], k) => (
        <div key={`fw${k}`} className="firework big" style={{ left: `${x}%`, top: `${y}%`, '--fw': FW_COLORS[k % FW_COLORS.length], '--fd': `${.4 + k * .37}s` } as React.CSSProperties}>
          {Array.from({ length: 12 }, (_, j) => <b key={j} style={{ '--a': `${j * 30}deg` } as React.CSSProperties} />)}
        </div>
      ))}
    </div>
  );
}

/** The podium: places 1–3, team name big, its players underneath. Built up 3 → 2 → 1, then celebration. */
function FinalResults({ s }: { s: PublicState }) {
  const ranked = useRanked(s);
  const top = ranked.slice(0, 3);
  const slot = (place: number) => top[place - 1];
  const order = [2, 1, 3];                               // classic podium, left to right
  const delayOf: Record<number, number> = { 3: 1.0, 2: 4.2, 1: 7.8 };   // 3 → 2 → 1, with suspense
  return (
    <div className="final-results podium-stage">
      <div className="podium-glow" aria-hidden="true" />
      <div className="podium-head">
        <Menorah lit={8} shamashLit size={120} />
      </div>
      <div className="podium3" dir="ltr">
        {order.map((place) => {
          const r = slot(place);
          if (!r) return <div key={place} className="pod-col empty" />;
          return (
            <div key={place} className={`pod-col p${place}`} style={{ '--d': `${delayOf[place]}s` } as React.CSSProperties}>
              <div className="pod-team" dir="rtl">
                <span className="pod-flash" aria-hidden="true" />
                <div className="pod-name">{r.team?.name}</div>
                {r.members?.length ? <div className="pod-members">{r.members.map((m: string, i: number) => <span key={i}>{m}</span>)}</div> : null}
                <div className="pod-pts"><CountUp to={r.total} delay={delayOf[place] * 1000 + 500} /></div>
              </div>
              <div className="pod-block"><span>{r.rank}</span></div>
            </div>
          );
        })}
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
