import { describe, expect, it } from 'vitest';
import { TASKS, LINEUP } from '../src/content/demoContent';
import { HEATS, buildPictures, heatAnswer, type SceneSpec } from '../src/content/scenes';
import { solveMatching, redundantClues, gradeItem, isSolvable, type AnswerKey, makeClues } from '../supabase/functions/_shared/engine/index.ts';

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
    expect(t.public_content.questions).toHaveLength(5);
    t.public_content.questions.forEach((q: any) => expect(q.options).toHaveLength(4));
    expect(t.answer_key.items.map((x: any) => x.choice)).toEqual(['אנטיוכוס', 'ש׳', 'הנר השישי', '30', 'מסכת שבת בתלמוד']);
    expect(5 + 6 + 7 + 8 + 4).toBe(30);                                       // last four nights + four shamashim
    expect(t.duration_sec).toBe(70);
    expect(t.scoring).toEqual({ method: 'per_item', points: 60 });
  });

  it('vault: approved riddles 4, 7, 2, 1; letters are data; code follows נ-ג-ה-פ', () => {
    const t = task('demo-vault');
    const clues = t.public_content.clues as { label: string; text: string }[];
    expect(clues).toHaveLength(4);
    expect(new Set(clues.map((c) => c.label))).toEqual(new Set(['נ', 'ג', 'ה', 'פ']));
    const digit: Record<string, number> = {};
    for (const c of clues) digit[c.label] = c.text.includes('חנה') ? 7 : c.text.includes('באנו') ? 1 : c.text.includes('אחים') ? 4 : 2;
    expect(['נ', 'ג', 'ה', 'פ'].map((l) => digit[l]).join('')).toBe(t.answer_key.code);
    expect(t.answer_key.code).toBe('4721');                                 // temporary mapping (editable)
    expect(clues.map((c) => c.label).join('')).not.toBe('נגהפ');             // never shown in solution order
    expect(t.attempts_limit).toBe(3);
    expect(t.scoring).toEqual({ method: 'fixed', points: 300 });
  });

  it('pictures: reveal circles = changed details; the answer has the most circles', () => {
    const t = task('demo-pictures');
    t.answer_key.items.forEach((it: any) => {
      const counts = it.marks.map((m: unknown[]) => m.length);
      expect(counts[['א', 'ב', 'ג'].indexOf(it.choice)]).toBe(Math.max(...counts));
      expect(counts.filter((c: number) => c === Math.max(...counts))).toHaveLength(1);
    });
    expect(t.public_content.heats.every((h: any) => !('marks' in h))).toBe(true);   // never before the reveal
  });

  it('memory: six new sequences of 3..8, 3.5 s per symbol, 20 s recall, 25..75 = 300', () => {
    const t = task('demo-memory');
    const stages = t.answer_key.stages as string[][];
    expect(stages.map((x) => x.length)).toEqual([3, 4, 5, 6, 7, 8]);
    expect(t.public_content.stage_lengths).toEqual([3, 4, 5, 6, 7, 8]);
    expect(JSON.stringify(t.public_content)).not.toContain('sufganiya","candle');   // sequences are not public
    expect(t.public_content.stages).toBeUndefined();
    stages.flat().forEach((id) => expect(t.public_content.symbols).toContain(id));
    expect(t.settings.memory).toMatchObject({ show_ms: 3500, recall_ms: 20000 });
    expect(t.scoring.points_by_stage).toEqual([25, 35, 45, 55, 65, 75]);
    expect(t.scoring.points_by_stage.reduce((a: number, b: number) => a + b, 0)).toBe(300);
  });

  it('finale: 8 letters, one per candle; final forms and spaces are forgiven', () => {
    const k = task('demo-finale').answer_key as any;
    expect([...k.letters]).toHaveLength(8);
    expect(task('demo-finale').public_content.length).toBe(8);
    expect(gradeItem(k, 0, { letters: 'סופגניות' }).correct).toBe(true);
    expect(gradeItem(k, 0, { letters: 'סופגניות'.split('').join(' ') }).correct).toBe(true);
    expect(gradeItem(k, 0, { letters: 'סופגניתו' }).correct).toBe(false);
  });

  it('letter journey: scrambled, all letters dealt once, base forms only', () => {
    let seed = 7; const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let n = 0; n < 200; n++) {
      const c = makeClues('סביבונים', rand);
      expect(c).toHaveLength(8);
      expect(c.map((x) => x.letter).sort().join('')).toBe([...'סביבונימ'].sort().join(''));
      expect(c.map((x) => x.letter).join('')).not.toBe('סביבונימ');
      expect(new Set(c.map((x) => x.spot)).size).toBe(8);
      c.forEach((x) => expect(Math.abs(x.rot)).toBeLessThanOrEqual(26));
    }
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
      expect(new Set(t.public_content.heats.map((x: any) => x.pictures[0].type)).size).toBe(3); // a different scene per heat
    });
  });

  it('every answer key grades as correct against itself', () => {
    for (const id of LINEUP) {
      const k = task(id).answer_key as AnswerKey;
      if (k.kind === 'sprint' || k.kind === 'truth_or_fiction' || k.kind === 'three_pictures') {
        k.items.forEach((it: any, i: number) => expect(gradeItem(k, i, 'choice' in it ? { choice: it.choice } : { text: it.text.canonical }).correct).toBe(true));
      }
      if (k.kind === 'finale') expect(gradeItem(k, 0, { letters: (k as any).letters }).correct).toBe(true);
      if (k.kind === 'code_vault') expect(gradeItem(k, 0, { code: (k as any).code }).correct).toBe(true);
      if (k.kind === 'ordering') expect(gradeItem(k, 0, { order: k.correct }).correct).toBe(true);
      if (k.kind === 'bet_puzzle') expect(gradeItem(k, 0, { assignment: k.assignment }).correct).toBe(true);
      if (k.kind === 'sequence_memory') k.stages.forEach((s, i) => expect(gradeItem(k, i, { sequence: s }).correct).toBe(true));
    }
  });
});
