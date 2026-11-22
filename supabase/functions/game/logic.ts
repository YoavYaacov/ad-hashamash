/**
 * Pure server-side game logic used by the Edge Function (no I/O here → unit-testable).
 */
import {
  betDelta, finalsAward, gradeItem, proposeFinalsOptions, analyzeFinals, rankTeams,
  DEFAULT_FINALS_PARAMS, type AnswerKey, type BetConfig, type FinalsParams, type ItemGrade,
  type ItemSubmission, type TieBreaker,
} from '../_shared/engine/index.ts';

export interface Scoring {
  method: 'fixed' | 'per_item' | 'partial' | 'per_stage' | 'time_linear' | 'bet' | 'finals';
  points?: number;
  /** time_linear: points × max(minRatio, 1 − elapsed/duration). PROPOSAL — not approved. */
  minRatio?: number;
}

export function pointsFor(scoring: Scoring, grade: ItemGrade, elapsedMs?: number, durationMs?: number): number {
  if (grade.needsReview) return 0;
  const p = scoring.points ?? 0;
  switch (scoring.method) {
    case 'fixed': case 'per_stage': return grade.correct ? p : 0;
    case 'per_item': case 'partial': return Math.round(p * grade.ratio);
    case 'time_linear': {
      if (!grade.correct || elapsedMs === undefined || !durationMs) return 0;
      const r = Math.max(scoring.minRatio ?? 0.3, 1 - elapsedMs / durationMs);
      return Math.round(p * r);
    }
    case 'bet': case 'finals': return 0; // settled at round level
  }
}

export function gradeSubmission(key: AnswerKey, itemIndex: number, payload: ItemSubmission): ItemGrade {
  try {
    return gradeItem(key, itemIndex, payload);
  } catch (e) {
    return { ratio: 0, correct: false, needsReview: false, detail: { error: (e as Error).message } };
  }
}

export interface SubRow { id: number; team_id: string; item_index: number; status: string; ratio: number | null; received_at: string }
export interface BetRow { team_id: string; track_id: string; base_points: number; total_before: number }

/** Bet settlement: success = the team solved the puzzle (any graded attempt with ratio 1). */
export function settleBets(cfg: BetConfig, bets: BetRow[], subs: SubRow[], round: number) {
  return bets.map((b) => {
    const success = subs.some((s) => s.team_id === b.team_id && s.status === 'graded' && Number(s.ratio) === 1);
    const delta = betDelta(cfg, b.base_points, b.track_id, success, b.total_before);
    return { team_id: b.team_id, source_key: `r${round}:bet`, points: delta, reason: success ? 'bet_won' : 'bet_lost',
             detail: { track: b.track_id, base: b.base_points, total_before: b.total_before } };
  });
}

/** Finals: first two teams with a correct answer, by SERVER receive time. */
export function finalsPlacements(subs: SubRow[]): { team_id: string; place: number }[] {
  const firstCorrect = new Map<string, number>();
  for (const s of subs) {
    if (s.status !== 'graded' || Number(s.ratio) !== 1) continue;
    const t = Date.parse(s.received_at);
    if (!firstCorrect.has(s.team_id) || t < firstCorrect.get(s.team_id)!) firstCorrect.set(s.team_id, t);
  }
  return [...firstCorrect.entries()].sort((a, b) => a[1] - b[1]).slice(0, 2).map(([team_id], i) => ({ team_id, place: i + 1 }));
}

export function finalsScoreEvents(placements: { team_id: string; place: number }[], opt: { firstPrize: number; secondPrize: number; id: 'A' | 'B'; label: string }) {
  return placements.map((p) => ({ team_id: p.team_id, source_key: 'r9:finals', points: finalsAward(p.place, opt),
                                  reason: `finals_place_${p.place}`, detail: { option: opt.id } }));
}

/** After round 8: pick finalists and compute exactly two prize options with full analysis for the host. */
export function computeFinals(totals: { team_id: string; total: number }[], settings: { finalists?: number; tie_breakers?: TieBreaker[]; finals_params?: FinalsParams }) {
  const ranked = rankTeams(totals.map((t) => ({ teamId: t.team_id, total: t.total })), (settings.tie_breakers ?? []).filter((b) => b !== 'finalPlace'));
  const n = settings.finalists ?? 5;
  // Teams tied on the cut line all go through (open decision — flagged to host).
  const cutRank = ranked[Math.min(n, ranked.length) - 1]?.rank ?? 1;
  const finalists = ranked.filter((r) => r.rank <= cutRank).map((r) => ({ teamId: r.teamId, total: r.total }));
  const options = proposeFinalsOptions(finalists.map((f) => f.total), settings.finals_params ?? DEFAULT_FINALS_PARAMS);
  const tiedOnCut = finalists.length > n;
  return {
    finalists,
    tiedOnCut,
    options,
    analysis: Object.fromEntries(options.map((o) => [o.id, analyzeFinals(finalists, o)])),
    gaps: finalists.map((f, i) => ({ teamId: f.teamId, behindLeader: finalists[0].total - f.total, behindNext: i ? finalists[i - 1].total - f.total : 0 })),
  };
}
