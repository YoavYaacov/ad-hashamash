import { describe, expect, it } from 'vitest';
import {
  checkTextAnswer, normalizeText, spellingSkeleton, normalizeCode,
  pairwiseOrderRatio, pairwiseOrderPoints,
  SOLVED, scramble, isSolvable, isSolved, verifyMoves, moveTile, neighbors,
  betBase, betDelta, isRiskyBet, rankTeams, proposeFinalsOptions, analyzeFinals, finalsAward,
  solveMatching, hasUniqueSolution, gradeItem, type BetConfig, type Board,
  memoryWindows, memoryNow, memoryTotalMs, DEFAULT_MEMORY_TIMING,
} from '../supabase/functions/_shared/engine/index.ts';
import { pointsFor } from '../supabase/functions/game/logic.ts';

describe('text normalization', () => {
  it('strips niqqud, punctuation, finals and spaces', () => {
    expect(normalizeText('  סֻפְגָּנִיָּה!! ')).toBe('ספגניה');
    expect(normalizeText('סוּפְגָּנִיָּה')).toBe('סופגניה');
    expect(normalizeText('בית־המקדש')).toBe('בית המקדש');
    expect(normalizeText('מכבים')).toBe(normalizeText('מכבימ'));
    expect(normalizeText('יהודה  "המכבי"')).toBe('יהודה המכבי');
  });
  it('skeleton unifies כתיב מלא/חסר', () => {
    expect(spellingSkeleton(normalizeText('סופגנייה'))).toBe(spellingSkeleton(normalizeText('ספגניה')));
    expect(spellingSkeleton(normalizeText('חנוכייה'))).toBe(spellingSkeleton(normalizeText('חנכיה')));
  });
});

describe('checkTextAnswer', () => {
  const key = { canonical: 'סופגנייה', alternatives: ['סופגניה', 'סופגניות'], rejects: ['סופגן'] };
  it('exact', () => expect(checkTextAnswer('סוּפְגָּנִיָּה', { canonical: 'סופגניה' }).kind).toBe('exact'));
  it('approved alternative', () => expect(checkTextAnswer('סופגניות', key).kind).toBe('alternative'));
  it('spelling variant accepted', () => {
    const r = checkTextAnswer('ספגנייה', key);
    expect(r.kind).toBe('spelling_variant');
    expect(r.accepted).toBe(true);
  });
  it('typo is uncertain and NOT accepted', () => {
    const r = checkTextAnswer('סופגנזה', key);
    expect(r.kind).toBe('uncertain');
    expect(r.accepted).toBe(false);
  });
  it('explicit reject wins', () => expect(checkTextAnswer('סופגן', key).kind).toBe('wrong'));
  it('semantically different short word is wrong, not uncertain', () => {
    // short words (<4 skeleton chars) get no typo tolerance
    expect(checkTextAnswer('נס', { canonical: 'נר' }).kind).toBe('wrong');
  });
  it('variants can be disabled', () => {
    expect(checkTextAnswer('ספגנייה', { canonical: 'סופגנייה', acceptSpellingVariants: false }).accepted).toBe(false);
  });
  it('definite article opt-in', () => {
    expect(checkTextAnswer('החנוכייה', { canonical: 'חנוכייה' }).accepted).toBe(false);
    expect(checkTextAnswer('החנוכייה', { canonical: 'חנוכייה', allowDefiniteArticle: true }).accepted).toBe(true);
  });
  it('empty is wrong', () => expect(checkTextAnswer('  !! ', { canonical: 'נר' }).kind).toBe('wrong'));
  it('code normalization', () => expect(normalizeCode(' 9-5 1 2')).toBe('9512'));
});

describe('pairwise ordering (task 17)', () => {
  it('spec example gives 60%', () => {
    expect(pairwiseOrderRatio(['A', 'B', 'C', 'D', 'E'], ['C', 'D', 'A', 'B', 'E'])).toBeCloseTo(0.6);
    expect(pairwiseOrderPoints(['A', 'B', 'C', 'D', 'E'], ['C', 'D', 'A', 'B', 'E'], 100)).toBe(60);
  });
  it('perfect and reversed', () => {
    expect(pairwiseOrderRatio([1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6])).toBe(1);
    expect(pairwiseOrderRatio([1, 2, 3, 4, 5, 6], [6, 5, 4, 3, 2, 1])).toBe(0);
  });
  it('8 items has 28 pairs', () => {
    const c = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(pairwiseOrderRatio(c, [2, 1, 3, 4, 5, 6, 7, 8])).toBeCloseTo(27 / 28);
  });
  it('rejects malformed submissions', () => {
    expect(() => pairwiseOrderRatio(['A', 'B'], ['A', 'A'])).toThrow();
    expect(() => pairwiseOrderRatio(['A', 'B'], ['A'])).toThrow();
    expect(() => pairwiseOrderRatio(['A', 'B'], ['A', 'Z'])).toThrow();
  });
});

/** BFS solver used only to prove scrambles solve. */
function solve(start: Board): number[] {
  const key = (b: Board) => b.join('');
  const prev = new Map<string, [string, number] | null>([[key(start), null]]);
  const q: Board[] = [start];
  while (q.length) {
    const b = q.shift()!;
    if (isSolved(b)) {
      const moves: number[] = [];
      let k = key(b);
      while (prev.get(k)) { const [p, t] = prev.get(k)!; moves.unshift(t); k = p; }
      return moves;
    }
    for (const n of neighbors(b.indexOf(0))) {
      const nb = moveTile(b, b[n])!;
      const nk = key(nb);
      if (!prev.has(nk)) { prev.set(nk, [key(b), b[n]]); q.push(nb); }
    }
  }
  throw new Error('unsolvable');
}

describe('sliding puzzle 3×3 (task 26)', () => {
  it('same seed → same scramble for all teams', () => {
    expect(scramble(2026)).toEqual(scramble(2026));
    expect(scramble(2026)).not.toEqual(scramble(2027));
  });
  it('scrambles are solvable, unsolved, and difficult enough', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const b = scramble(seed);
      expect(isSolvable(b)).toBe(true);
      expect(isSolved(b)).toBe(false);
      expect(b.slice().sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    }
  });
  it('detects an unsolvable board', () => expect(isSolvable([2, 1, 3, 4, 5, 6, 7, 8, 0])).toBe(false));
  it('verifies a real solution and detects completion', () => {
    const start = scramble(7);
    const moves = solve(start);
    expect(verifyMoves(start, moves)).toMatchObject({ valid: true, solved: true });
    expect(verifyMoves(start, moves.slice(0, -1)).solved).toBe(false);
  });
  it('rejects illegal moves', () => {
    expect(verifyMoves(SOLVED, [1]).valid).toBe(false); // tile 1 not adjacent to blank
    expect(verifyMoves(SOLVED, [8, 8]).valid).toBe(true);
  });
});

describe('betting (task 31) — parametric, floor zero', () => {
  const cfg: BetConfig = {
    baseMethod: 'average_floor100',
    tracks: [
      { id: 'safe', label: 'זהיר', winMultiplier: 0.5, lossMultiplier: 0 },
      { id: 'mid', label: 'בינוני', winMultiplier: 1, lossMultiplier: 0.5 },
      { id: 'all', label: 'הכול או כלום', winMultiplier: 2, lossMultiplier: 2 },
    ],
  };
  it('base = average rounded down to 100', () => expect(betBase(cfg, [1250, 980, 1740])).toBe(1300));
  it('win/loss deltas', () => {
    expect(betDelta(cfg, 1000, 'mid', true, 800)).toBe(1000);
    expect(betDelta(cfg, 1000, 'mid', false, 800)).toBe(-500);
  });
  it('never below zero', () => {
    expect(betDelta(cfg, 1000, 'all', false, 700)).toBe(-700);
    expect(isRiskyBet(cfg, 1000, 'all', 700)).toBe(true);
    expect(isRiskyBet(cfg, 1000, 'safe', 700)).toBe(false);
  });
});

describe('ranking & ties', () => {
  it('competition ranking with shared places', () => {
    const r = rankTeams([
      { teamId: 'a', total: 500 }, { teamId: 'b', total: 700 }, { teamId: 'c', total: 500 }, { teamId: 'd', total: 100 },
    ]);
    expect(r.map((x) => [x.teamId, x.rank, x.tied])).toEqual([['b', 1, false], ['a', 2, true], ['c', 2, true], ['d', 4, false]]);
  });
  it('tie-breakers resolve in order', () => {
    const r = rankTeams(
      [{ teamId: 'a', total: 500, lastRoundPoints: 50 }, { teamId: 'c', total: 500, lastRoundPoints: 90 }],
      ['finalPlace', 'lastRoundPoints'],
    );
    expect(r.map((x) => [x.teamId, x.rank])).toEqual([['c', 1], ['a', 2]]);
  });
});

describe('finals options (§9) — proposed formulas', () => {
  const finalists = [
    { teamId: 't1', total: 2400 }, { teamId: 't2', total: 2100 }, { teamId: 't3', total: 1900 },
    { teamId: 't4', total: 1750 }, { teamId: 't5', total: 1500 },
  ];
  const [A, B] = proposeFinalsOptions(finalists.map((f) => f.total));

  it('option A: 5th winning beats leader finishing 2nd', () => {
    expect(1500 + A.firstPrize).toBeGreaterThan(2400 + A.secondPrize);
    const a5 = analyzeFinals(finalists, A).find((x) => x.teamId === 't5')!;
    expect(a5.winGuaranteesTitle).toBe(true);
    expect(A.firstPrize).toBeGreaterThan(A.secondPrize);
  });
  it('option B is smaller and does not guarantee the 5th team', () => {
    expect(B.firstPrize).toBeLessThan(A.firstPrize);
    const a5 = analyzeFinals(finalists, B).find((x) => x.teamId === 't5')!;
    expect(a5.canWinTitle).toBe(false);
    const a2 = analyzeFinals(finalists, B).find((x) => x.teamId === 't2')!;
    expect(a2.canWinTitle).toBe(true);
  });
  it('scenario: one team 1st and another 2nd both get points', () => {
    const totals = new Map(finalists.map((f) => [f.teamId, f.total]));
    totals.set('t4', totals.get('t4')! + finalsAward(1, B));
    totals.set('t1', totals.get('t1')! + finalsAward(2, B));
    expect(finalsAward(3, B)).toBe(0);
    expect(totals.get('t1')).toBe(2400 + B.secondPrize);
  });
  it('handles equal scores (gap 0) with minimum prizes', () => {
    const [a, b] = proposeFinalsOptions([1000, 1000, 1000, 1000, 1000]);
    expect(a.firstPrize).toBeGreaterThan(a.secondPrize);
    expect(b.firstPrize).toBeGreaterThanOrEqual(b.secondPrize);
  });
});

describe('logic puzzle uniqueness (task 31 helper)', () => {
  it('counts solutions and detects uniqueness', () => {
    // demo clues only — NOT the real puzzle
    const clues = [(p: number[]) => p[0] === 2, (p: number[]) => p[1] !== 0];
    expect(solveMatching(4, clues).length).toBe(4);
    expect(hasUniqueSolution(4, clues)).toBe(false);
    const unique = [...clues, (p: number[]) => p[3] === p[1] - 1];
    expect(solveMatching(4, unique)).toEqual([[2, 1, 3, 0]]);
  });
});

describe('gradeItem dispatch', () => {
  it('vault exact code', () => {
    expect(gradeItem({ kind: 'code_vault', code: '9512' }, 0, { code: '95 12' }).correct).toBe(true);
    expect(gradeItem({ kind: 'code_vault', code: '9512' }, 0, { code: '9521' }).correct).toBe(false);
  });
  it('symbols uncertain goes to review', () => {
    const g = gradeItem({ kind: 'symbols', items: [{ text: { canonical: 'נס גדול היה פה' } }] }, 0, { text: 'נס גדול היה פא' });
    expect(g.needsReview).toBe(true);
    expect(g.ratio).toBe(0);
  });
  it('ordering partial', () => {
    expect(gradeItem({ kind: 'ordering', correct: ['A', 'B', 'C', 'D', 'E'] }, 0, { order: ['C', 'D', 'A', 'B', 'E'] }).ratio).toBeCloseTo(0.6);
  });
  it('sequence memory stage', () => {
    const key = { kind: 'sequence_memory' as const, stages: [['oil', 'dreidel', 'candle'], ['a', 'b', 'c', 'd']] };
    expect(gradeItem(key, 0, { sequence: ['oil', 'dreidel', 'candle'] }).correct).toBe(true);
    expect(gradeItem(key, 1, { sequence: ['a', 'b', 'd', 'c'] }).correct).toBe(false);
  });
  it('malformed submissions never throw', () => {
    expect(gradeItem({ kind: 'ordering', correct: ['A', 'B'] }, 0, { text: 'x' } as never).correct).toBe(false);
    expect(gradeItem({ kind: 'sliding_puzzle', start: scramble(1) }, 0, { moves: ['x'] } as never).correct).toBe(false);
  });
});

describe('candle memory shared timeline', () => {
  const L = [3, 4, 5, 6, 7, 8];
  const T = DEFAULT_MEMORY_TIMING;
  it('windows follow intro → show → recall → result', () => {
    const w = memoryWindows(L, T);
    expect(w[0]).toEqual({ introAt: 0, showAt: 3000, recallAt: 3000 + 3 * 3500, recallEnd: 13500 + 20000, resultEnd: 33500 + 6000 });
    expect(w[1].introAt).toBe(w[0].resultEnd);
    expect(memoryTotalMs(L, T)).toBe(6 * (3000 + 20000 + 6000) + 33 * 3500);
  });
  it('every device derives the same symbol from elapsed time', () => {
    expect(memoryNow(L, 0, T)).toMatchObject({ stage: 0, phase: 'intro' });
    expect(memoryNow(L, 3000, T)).toMatchObject({ stage: 0, phase: 'show', symbol: 0 });
    expect(memoryNow(L, 3000 + 3500 * 2 + 10, T)).toMatchObject({ stage: 0, phase: 'show', symbol: 2 });
    expect(memoryNow(L, 13500, T)).toMatchObject({ stage: 0, phase: 'recall' });
    expect(memoryNow(L, 33500, T)).toMatchObject({ stage: 0, phase: 'result' });
    expect(memoryNow(L, 39500, T)).toMatchObject({ stage: 1, phase: 'intro' });
    expect(memoryNow(L, memoryTotalMs(L, T) + 1, T).phase).toBe('done');
  });
  it('stage points 25..75 sum to 300; wrong = 0', () => {
    const sc = { method: 'per_stage' as const, points: 25, points_by_stage: [25, 35, 45, 55, 65, 75] };
    const ok = { ratio: 1, correct: true, needsReview: false };
    expect([0, 1, 2, 3, 4, 5].map((i) => pointsFor(sc, ok, 0, 1, i)).reduce((a, b) => a + b)).toBe(300);
    expect(pointsFor(sc, { ratio: 0, correct: false, needsReview: false }, 0, 1, 5)).toBe(0);
  });
});
