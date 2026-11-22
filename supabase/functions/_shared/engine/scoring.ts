/**
 * Scoring primitives. All numbers here are PARAMETERS — the final formulas for
 * betting (task 31) and finals prizes (§9) are open decisions and must be approved.
 */

export const floorZero = (n: number) => Math.max(0, n);
export const roundDown100 = (n: number) => Math.floor(n / 100) * 100;
export const roundUp100 = (n: number) => Math.ceil(n / 100) * 100;

// ───────────────────────── Betting (task 31) ─────────────────────────

export interface BetTrack {
  id: string;
  label: string;
  /** Points won on success = base × winMultiplier */
  winMultiplier: number;
  /** Points lost on failure = base × lossMultiplier */
  lossMultiplier: number;
}

export interface BetConfig {
  /** 'average_floor100' = average team total before the round, rounded down to 100 (preferred direction). */
  baseMethod: 'average_floor100' | 'fixed';
  fixedBase?: number;
  minBase?: number;
  tracks: BetTrack[];
}

export function betBase(cfg: BetConfig, totalsBefore: number[]): number {
  if (cfg.baseMethod === 'fixed') return cfg.fixedBase ?? 0;
  const avg = totalsBefore.length ? totalsBefore.reduce((a, b) => a + b, 0) / totalsBefore.length : 0;
  return Math.max(cfg.minBase ?? 100, roundDown100(avg));
}

/** Returns the score delta, already clamped so the team total never goes below zero. */
export function betDelta(cfg: BetConfig, base: number, trackId: string, success: boolean, totalBefore: number): number {
  const t = cfg.tracks.find((x) => x.id === trackId);
  if (!t) throw new Error(`unknown bet track ${trackId}`);
  const raw = success ? Math.round(base * t.winMultiplier) : -Math.round(base * t.lossMultiplier);
  return floorZero(totalBefore + raw) - totalBefore;
}

/** Whether to show the "this may zero your score" warning before confirming. */
export function isRiskyBet(cfg: BetConfig, base: number, trackId: string, totalBefore: number): boolean {
  const t = cfg.tracks.find((x) => x.id === trackId)!;
  return base * t.lossMultiplier >= totalBefore;
}

// ───────────────────────── Ranking & ties ─────────────────────────

export interface TeamStanding {
  teamId: string;
  total: number;
  /** Optional tiebreak keys — which ones count is an open decision (§8). */
  finalPlace?: number | null;
  lastRoundPoints?: number;
  /** Server timestamp (ms) of the last accepted submission — earlier wins. */
  lastCorrectAt?: number | null;
}

export type TieBreaker = 'finalPlace' | 'lastRoundPoints' | 'lastCorrectAt';

export interface RankedTeam extends TeamStanding { rank: number; tied: boolean }

/** Standard competition ranking (1,1,3) after applying tie-breakers in order. */
export function rankTeams(teams: TeamStanding[], breakers: TieBreaker[] = []): RankedTeam[] {
  const cmp = (a: TeamStanding, b: TeamStanding): number => {
    if (b.total !== a.total) return b.total - a.total;
    for (const k of breakers) {
      if (k === 'finalPlace') {
        const av = a.finalPlace ?? Infinity, bv = b.finalPlace ?? Infinity;
        if (av !== bv) return av - bv;
      } else if (k === 'lastRoundPoints') {
        const d = (b.lastRoundPoints ?? 0) - (a.lastRoundPoints ?? 0);
        if (d) return d;
      } else if (k === 'lastCorrectAt') {
        const av = a.lastCorrectAt ?? Infinity, bv = b.lastCorrectAt ?? Infinity;
        if (av !== bv) return av - bv;
      }
    }
    return 0;
  };
  const sorted = teams.slice().sort((a, b) => cmp(a, b) || a.teamId.localeCompare(b.teamId));
  const out: RankedTeam[] = [];
  sorted.forEach((t, i) => {
    const prev = out[i - 1];
    const rank = prev && cmp(sorted[i - 1], t) === 0 ? prev.rank : i + 1;
    out.push({ ...t, rank, tied: false });
  });
  for (const t of out) t.tied = out.filter((x) => x.rank === t.rank).length > 1;
  return out;
}

// ───────────────────────── Finals prize options (§9) ─────────────────────────

export interface FinalsOption {
  id: 'A' | 'B';
  label: string;
  firstPrize: number;
  secondPrize: number;
}

export interface FinalsParams {
  minFirst: number;
  minSecond: number;
  /** Option B: first prize = gap × this ratio (rounded up to 100). */
  balancedRatio: number;
  /** Second prize as a fraction of first, for both options. */
  secondRatio: number;
}

export const DEFAULT_FINALS_PARAMS: FinalsParams = { minFirst: 200, minSecond: 100, balancedRatio: 0.5, secondRatio: 0.5 };

/**
 * PROPOSED formulas (not approved):
 *  A — dramatic: 5th place winning the final beats the leader finishing 2nd in the final:
 *      s5 + P1 > s1 + P2  ⇔  P1 > gap + P2.
 *  B — balanced: P1 = ceil100(gap × balancedRatio), so only teams within that band can overtake.
 */
export function proposeFinalsOptions(top5Totals: number[], p: FinalsParams = DEFAULT_FINALS_PARAMS): FinalsOption[] {
  if (top5Totals.length < 2) throw new Error('need at least 2 finalists');
  const s = top5Totals.slice().sort((a, b) => b - a);
  const gap = s[0] - s[s.length - 1];

  const aSecond = Math.max(p.minSecond, roundUp100(gap * p.secondRatio));
  const aFirst = Math.max(p.minFirst, roundUp100(gap + aSecond) + 100); // strictly greater

  const bFirst = Math.max(p.minFirst, roundUp100(gap * p.balancedRatio));
  const bSecond = Math.max(p.minSecond, roundUp100(bFirst * p.secondRatio));

  return [
    { id: 'A', label: 'דרמטית', firstPrize: aFirst, secondPrize: Math.min(aSecond, aFirst - 100) },
    { id: 'B', label: 'מאוזנת', firstPrize: bFirst, secondPrize: Math.min(bSecond, bFirst) },
  ];
}

export interface FinalistAnalysis {
  teamId: string;
  total: number;
  /** Winning the final guarantees overall 1st even if the strongest rival takes 2nd in the final. */
  winGuaranteesTitle: boolean;
  /** Winning the final can yield overall 1st in the best case (nobody else scores). */
  canWinTitle: boolean;
  /** Teams this finalist could overtake by winning the final, even if that team finishes 2nd. */
  overtakesEvenIfRivalSecond: string[];
  /** Teams this finalist could overtake by winning the final only if that team gets nothing. */
  overtakesIfRivalScoresZero: string[];
}

export function analyzeFinals(finalists: { teamId: string; total: number }[], opt: FinalsOption): FinalistAnalysis[] {
  return finalists.map((me) => {
    const others = finalists.filter((o) => o.teamId !== me.teamId);
    const mine = me.total + opt.firstPrize;
    const worstRival = Math.max(...others.map((o) => o.total + opt.secondPrize));
    const bestRival = Math.max(...others.map((o) => o.total));
    return {
      teamId: me.teamId,
      total: me.total,
      winGuaranteesTitle: mine > worstRival,
      canWinTitle: mine > bestRival,
      overtakesEvenIfRivalSecond: others.filter((o) => o.total >= me.total && mine > o.total + opt.secondPrize).map((o) => o.teamId),
      overtakesIfRivalScoresZero: others
        .filter((o) => o.total >= me.total && mine > o.total && !(mine > o.total + opt.secondPrize))
        .map((o) => o.teamId),
    };
  });
}

/** Finals points: only first two successful finishers score. */
export function finalsAward(place: number | null, opt: FinalsOption): number {
  if (place === 1) return opt.firstPrize;
  if (place === 2) return opt.secondPrize;
  return 0;
}
