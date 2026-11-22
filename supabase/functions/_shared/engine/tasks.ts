/**
 * Task engine types + grading dispatch.
 *
 * Every task is split in two:
 *   - public content  (task_templates.public_content)  → safe to send to phones/screen
 *   - answer key      (private.task_secrets.answer_key) → never leaves the server before reveal
 *
 * Grading is a pure function of (kind, answer key, submission). It runs only in the
 * Edge Function with the service role; the phone never decides correctness or points.
 */
import { checkTextAnswer, normalizeCode, type MatchKind, type TextAnswerKey } from './normalize.ts';
import { pairwiseOrderRatio } from './ordering.ts';
import { verifyMoves, type Board } from './slidingPuzzle.ts';

export const TASK_KINDS = [
  'code_vault',       // 4 — הכספת החשמונאית
  'video_memory',     // 5 — מה ראיתם עכשיו?
  'truth_or_fiction', // 8 — האמת או ההמצאה?
  'sprint',           // 9 — המרוץ נגד השעון
  'symbols',          // 11 — חנוכה בסמלים
  'three_pictures',   // 13 — שלוש התמונות
  'ordering',         // 17 — הסדר הנכון
  'sliding_puzzle',   // 26 — פאזל ההחלקה
  'bet_puzzle',       // 31 — הימור בחידה
  'sequence_memory',  // 35 — זיכרון הנרות
  'finale',           // 9th round — השַׁמָּשׁ (content TBD)
] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

/** A task may contain several items (questions/heats/stages) but is still ONE round. */
export type AnswerKey =
  | { kind: 'code_vault'; code: string }
  | { kind: 'video_memory' | 'truth_or_fiction' | 'three_pictures'; items: { choice: string }[] }
  | { kind: 'sprint'; items: ({ choice: string } | { text: TextAnswerKey })[] }
  | { kind: 'symbols'; items: { text: TextAnswerKey }[] }
  | { kind: 'ordering'; correct: string[] }
  | { kind: 'sliding_puzzle'; start: Board }
  | { kind: 'bet_puzzle'; assignment: number[] }
  | { kind: 'sequence_memory'; stages: string[][] }
  | { kind: 'finale'; text?: TextAnswerKey; choice?: string; code?: string };

/** What a team sends for ONE item. Shape depends on kind. */
export type ItemSubmission =
  | { choice: string }
  | { text: string }
  | { code: string }
  | { order: string[] }
  | { moves: number[] }
  | { assignment: number[] }
  | { sequence: string[] };

export interface ItemGrade {
  /** Fraction of the item's points earned, 0..1. */
  ratio: number;
  correct: boolean;
  /** true → not auto-scored; the host must decide (uncertain text match). */
  needsReview: boolean;
  match?: MatchKind;
  detail?: Record<string, unknown>;
}

const yes = (detail?: Record<string, unknown>): ItemGrade => ({ ratio: 1, correct: true, needsReview: false, detail });
const no = (detail?: Record<string, unknown>): ItemGrade => ({ ratio: 0, correct: false, needsReview: false, detail });

function gradeText(raw: unknown, key: TextAnswerKey): ItemGrade {
  if (typeof raw !== 'string') return no({ error: 'expected text' });
  const m = checkTextAnswer(raw, key);
  if (m.kind === 'uncertain') return { ratio: 0, correct: false, needsReview: true, match: m.kind };
  return { ratio: m.accepted ? 1 : 0, correct: m.accepted, needsReview: false, match: m.kind };
}

export function itemCount(key: AnswerKey): number {
  switch (key.kind) {
    case 'video_memory': case 'truth_or_fiction': case 'three_pictures': case 'sprint': case 'symbols':
      return key.items.length;
    case 'sequence_memory':
      return key.stages.length;
    default:
      return 1;
  }
}

export function gradeItem(key: AnswerKey, itemIndex: number, sub: ItemSubmission): ItemGrade {
  const s = sub as Record<string, unknown>;
  switch (key.kind) {
    case 'code_vault':
      return normalizeCode(String(s.code ?? '')) === normalizeCode(key.code) ? yes() : no();

    case 'video_memory': case 'truth_or_fiction': case 'three_pictures': {
      const it = key.items[itemIndex];
      if (!it) return no({ error: 'bad item' });
      return s.choice === it.choice ? yes() : no();
    }

    case 'sprint': {
      const it = key.items[itemIndex];
      if (!it) return no({ error: 'bad item' });
      if ('choice' in it) return s.choice === it.choice ? yes() : no();
      return gradeText(s.text, it.text);
    }

    case 'symbols': {
      const it = key.items[itemIndex];
      if (!it) return no({ error: 'bad item' });
      return gradeText(s.text, it.text);
    }

    case 'ordering': {
      const order = s.order;
      if (!Array.isArray(order)) return no({ error: 'expected order' });
      try {
        const ratio = pairwiseOrderRatio(key.correct, order as string[]);
        return { ratio, correct: ratio === 1, needsReview: false };
      } catch (e) {
        return no({ error: (e as Error).message });
      }
    }

    case 'sliding_puzzle': {
      const moves = s.moves;
      if (!Array.isArray(moves) || !moves.every((m) => Number.isInteger(m))) return no({ error: 'expected moves' });
      const v = verifyMoves(key.start, moves as number[]);
      return v.valid && v.solved ? yes({ moveCount: v.moveCount }) : no({ ...v });
    }

    case 'bet_puzzle': {
      const a = s.assignment;
      const ok = Array.isArray(a) && a.length === key.assignment.length && a.every((v, i) => v === key.assignment[i]);
      return ok ? yes() : no();
    }

    case 'sequence_memory': {
      const stage = key.stages[itemIndex];
      const seq = s.sequence;
      if (!stage) return no({ error: 'bad stage' });
      const ok = Array.isArray(seq) && seq.length === stage.length && seq.every((v, i) => v === stage[i]);
      return ok ? yes() : no();
    }

    case 'finale': {
      if (key.code !== undefined) return normalizeCode(String(s.code ?? '')) === normalizeCode(key.code) ? yes() : no();
      if (key.choice !== undefined) return s.choice === key.choice ? yes() : no();
      if (key.text) return gradeText(s.text, key.text);
      return no({ error: 'finale not configured' });
    }
  }
}
