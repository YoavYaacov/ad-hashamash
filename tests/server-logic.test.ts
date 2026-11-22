import { describe, expect, it } from 'vitest';
import { computeFinals, finalsPlacements, finalsScoreEvents, pointsFor, settleBets } from '../supabase/functions/game/logic.ts';
import type { BetConfig } from '../supabase/functions/_shared/engine/index.ts';

const g = (ratio: number, needsReview = false) => ({ ratio, correct: ratio === 1, needsReview });

describe('pointsFor', () => {
  it('methods', () => {
    expect(pointsFor({ method: 'fixed', points: 300 }, g(1))).toBe(300);
    expect(pointsFor({ method: 'fixed', points: 300 }, g(0.6))).toBe(0);
    expect(pointsFor({ method: 'partial', points: 300 }, g(0.6))).toBe(180);
    expect(pointsFor({ method: 'per_item', points: 60 }, g(1, true))).toBe(0); // review → nothing yet
    expect(pointsFor({ method: 'time_linear', points: 300, minRatio: 0.3 }, g(1), 60_000, 240_000)).toBe(225);
    expect(pointsFor({ method: 'time_linear', points: 300, minRatio: 0.3 }, g(1), 239_000, 240_000)).toBe(90);
    expect(pointsFor({ method: 'bet' }, g(1))).toBe(0);
  });
});

describe('bet settlement', () => {
  const cfg: BetConfig = { baseMethod: 'average_floor100', tracks: [
    { id: 'safe', label: '', winMultiplier: 0.5, lossMultiplier: 0 },
    { id: 'all', label: '', winMultiplier: 2, lossMultiplier: 2 }] };
  it('win, loss and zero floor', () => {
    const ev = settleBets(cfg,
      [{ team_id: 'a', track_id: 'all', base_points: 1000, total_before: 600 },
       { team_id: 'b', track_id: 'all', base_points: 1000, total_before: 900 },
       { team_id: 'c', track_id: 'safe', base_points: 1000, total_before: 900 }],
      [{ id: 1, team_id: 'b', item_index: 0, status: 'graded', ratio: 1, received_at: '' },
       { id: 2, team_id: 'a', item_index: 0, status: 'graded', ratio: 0, received_at: '' }], 7);
    expect(ev.find((e) => e.team_id === 'a')!.points).toBe(-600); // floored at zero total
    expect(ev.find((e) => e.team_id === 'b')!.points).toBe(2000);
    expect(ev.find((e) => e.team_id === 'c')!.points).toBe(0);
    expect(new Set(ev.map((e) => e.source_key))).toEqual(new Set(['r7:bet']));
  });
});

describe('finals', () => {
  it('placements by server time, only first two', () => {
    const p = finalsPlacements([
      { id: 1, team_id: 'x', item_index: 0, status: 'graded', ratio: 0, received_at: '2026-12-14T18:00:01Z' },
      { id: 2, team_id: 'y', item_index: 0, status: 'graded', ratio: 1, received_at: '2026-12-14T18:00:05Z' },
      { id: 3, team_id: 'z', item_index: 0, status: 'graded', ratio: 1, received_at: '2026-12-14T18:00:03Z' },
      { id: 4, team_id: 'x', item_index: 0, status: 'graded', ratio: 1, received_at: '2026-12-14T18:00:09Z' },
    ]);
    expect(p).toEqual([{ team_id: 'z', place: 1 }, { team_id: 'y', place: 2 }]);
    const ev = finalsScoreEvents(p, { id: 'A', label: '', firstPrize: 1500, secondPrize: 600 });
    expect(ev.map((e) => e.points)).toEqual([1500, 600]);
  });
  it('computeFinals picks top 5 and two options', () => {
    const totals = [3000, 2400, 2100, 1900, 1750, 1500, 900].map((t, i) => ({ team_id: `t${i}`, total: t }));
    const r = computeFinals(totals, {});
    expect(r.finalists.map((f) => f.teamId)).toEqual(['t0', 't1', 't2', 't3', 't4']);
    expect(r.options).toHaveLength(2);
    expect(r.tiedOnCut).toBe(false);
    expect(r.analysis.A.find((a) => a.teamId === 't4')!.winGuaranteesTitle).toBe(true);
  });
  it('tie on the cut line is flagged', () => {
    const totals = [3000, 2400, 2100, 1900, 1750, 1750].map((t, i) => ({ team_id: `t${i}`, total: t }));
    const r = computeFinals(totals, {});
    expect(r.finalists).toHaveLength(6);
    expect(r.tiedOnCut).toBe(true);
  });
});
