import { describe, expect, it } from 'vitest';
import { TASKS, LINEUP } from '../src/content/demoContent';
import { HEATS, buildPictures, heatAnswer, type SceneSpec } from '../src/content/scenes';
import { solveMatching, redundantClues, gradeItem, isSolvable, type AnswerKey } from '../supabase/functions/_shared/engine/index.ts';

const task = (id: string) => TASKS.find((t) => t.id === id)! as any;

describe('trial content is self-consistent', () => {
  it('lineup: 9 rounds, finale last, all tasks exist', () => {
    expect(LINEUP).toHaveLength(9);
    expect(task(LINEUP[8]).kind).toBe('finale');
    LINEUP.forEach((id) => expect(task(id)).toBeTruthy());
  });

  it('sprint: every choice answer is one of its options', () => {
    const t = task('demo-sprint');
    t.answer_key.items.forEach((it: any, i: number) => {
      if ('choice' in it) expect(t.public_content.questions[i].options).toContain(it.choice);
    });
    expect(gradeItem(t.answer_key, 4, { text: 'מתתיה' }).correct).toBe(true);
    expect(gradeItem(t.answer_key, 4, { text: 'יהודה' }).correct).toBe(false);
  });

  it('vault arithmetic: 9,5,6,7 → order clue gives 5976', () => {
    const digits = { a: 2 + 3 + 4, b: 5, c: 5 + 1, d: 8 - 1 };
    const rest = [digits.a, digits.c, digits.d].sort((x, y) => y - x);
    expect([digits.b, ...rest].join('')).toBe(task('demo-vault').answer_key.code);
  });

  it('finale arithmetic: 6 × 4 + 25 = 49', () => {
    const firstNightOver5 = [1, 2, 3, 4, 5, 6, 7, 8].find((n) => n > 5)!;
    expect(String(firstNightOver5 * 4 + 25)).toBe(task('demo-finale').answer_key.code);
  });

  it('truth or fiction: one answer per set, index within 1..4', () => {
    const t = task('demo-truth');
    t.answer_key.items.forEach((it: any, i: number) => {
      expect(t.public_content.items[i].facts).toHaveLength(4);
      expect(Number(it.choice)).toBeGreaterThanOrEqual(1);
      expect(Number(it.choice)).toBeLessThanOrEqual(4);
    });
  });

  it('ordering: shown items are a permutation of the key, and not already solved', () => {
    const t = task('demo-order');
    const shown = t.public_content.items.map((x: any) => x.id);
    expect([...shown].sort()).toEqual([...t.answer_key.correct].sort());
    expect(shown).not.toEqual(t.answer_key.correct);
  });

  it('sliding puzzle start is solvable and matches the key', () => {
    const t = task('demo-slide');
    expect(isSolvable(t.public_content.start)).toBe(true);
    expect(t.public_content.start).toEqual(t.answer_key.start);
  });

  it('bet puzzle: exactly one solution, no redundant clue, equals the key', () => {
    // These predicates mirror the four written clues one by one.
    const clues = [
      (a: number[]) => a[1] === 2 || a[1] === 3,  // אבי: לא מתכת ולא זכוכית
      (a: number[]) => a[2] !== 0 && a[3] !== 0,  // נועה ואיתי לא כסף
      (a: number[]) => a[1] !== 2,                // לגו לא של אבי
      (a: number[]) => a[2] !== 1,                // נועה לא זכוכית
    ];
    const t = task('demo-bet');
    expect(t.public_content.clues).toHaveLength(clues.length);
    expect(solveMatching(4, clues)).toEqual([t.answer_key.assignment]);
    expect(redundantClues(4, clues)).toEqual([]);
  });

  it('three pictures: each changed feature differs in exactly one picture; answer unique', () => {
    const t = task('demo-pictures');
    HEATS.forEach((h, i) => {
      const pics: SceneSpec[] = buildPictures(h);
      for (const f of Object.keys(h.base) as (keyof SceneSpec)[]) {
        const vals = pics.map((p) => JSON.stringify(p[f]));
        const distinct = new Set(vals).size;
        if (f in h.deviations) {
          expect(distinct).toBe(2);
          expect(vals.filter((v) => v === JSON.stringify(h.base[f]))).toHaveLength(2);
        } else expect(distinct).toBe(1);   // no accidental differences
      }
      expect(t.answer_key.items[i].choice).toBe(['א', 'ב', 'ג'][heatAnswer(h)]);
      expect(t.public_content.heats[i].pictures).toEqual(pics);
    });
  });

  it('every answer key grades as correct against itself', () => {
    for (const id of LINEUP) {
      const k = task(id).answer_key as AnswerKey;
      if (k.kind === 'sprint' || k.kind === 'truth_or_fiction' || k.kind === 'three_pictures') {
        k.items.forEach((it: any, i: number) => expect(gradeItem(k, i, 'choice' in it ? { choice: it.choice } : { text: it.text.canonical }).correct).toBe(true));
      }
      if (k.kind === 'code_vault' || k.kind === 'finale') expect(gradeItem(k, 0, { code: (k as any).code }).correct).toBe(true);
      if (k.kind === 'ordering') expect(gradeItem(k, 0, { order: k.correct }).correct).toBe(true);
      if (k.kind === 'bet_puzzle') expect(gradeItem(k, 0, { assignment: k.assignment }).correct).toBe(true);
      if (k.kind === 'sequence_memory') k.stages.forEach((s, i) => expect(gradeItem(k, i, { sequence: s }).correct).toBe(true));
    }
  });
});
