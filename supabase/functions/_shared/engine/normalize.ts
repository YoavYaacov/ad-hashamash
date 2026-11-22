/**
 * Deterministic Hebrew free-text answer checking — no AI.
 *
 * Match categories (spec §6, task 11):
 *   exact            – normalized answer equals the canonical answer
 *   alternative      – equals one of the pre-approved alternatives
 *   spelling_variant – same consonant skeleton (כתיב מלא/חסר); accepted only if the
 *                      answer key allows it AND it doesn't collide with a known wrong answer
 *   uncertain        – close (small typo) but NOT auto-scored; goes to host review
 *   wrong            – anything else, or an explicitly rejected near-miss
 */

export type MatchKind = 'exact' | 'alternative' | 'spelling_variant' | 'uncertain' | 'wrong';

export interface TextAnswerKey {
  canonical: string;
  alternatives?: string[];
  /** Known near-misses that must never be accepted (e.g. a different but similar word). */
  rejects?: string[];
  /** Accept כתיב מלא/חסר variants automatically. Default true. */
  acceptSpellingVariants?: boolean;
  /** Also accept the answer with a leading definite article ה (per word-group). Default false. */
  allowDefiniteArticle?: boolean;
  /** Max edit distance considered "uncertain" (never auto-accepted). Default: 1, or 2 for long answers. */
  typoTolerance?: number;
}

export interface MatchResult {
  kind: MatchKind;
  accepted: boolean;
  matchedAgainst?: string;
  normalized: string;
}

const NIQQUD = /[֑-ׇ]/g; // cantillation + niqqud (letters are U+05D0..U+05EA)
const FINALS: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

/** Remove niqqud, punctuation, geresh/gershayim, unify finals, collapse spaces, lowercase Latin. */
export function normalizeText(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[־׀׃]/g, ' ') // maqaf, paseq, sof pasuq → space (they sit inside the niqqud range)
    .replace(NIQQUD, '')
    .replace(/[̀-ͯ]/g, '') // Latin combining marks
    .toLowerCase()
    .replace(/[־\-_/\\]/g, ' ') // maqaf, dashes, slashes → space
    .replace(/[^\p{L}\p{N}\s]/gu, '') // drop remaining punctuation incl. ׳ ״ ' " . , ! ?
    .replace(/[ךםןףץ]/g, (c) => FINALS[c])
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Consonant skeleton for מלא/חסר: drop ו/י that are not word-initial and collapse doubles.
 * "סופגנייה" → "ספגנה", "סופגניה" → "ספגנה", "חנוכיה" → "חנכה".
 */
export function spellingSkeleton(normalized: string): string {
  return normalized
    .split(' ')
    .map((w) => (w.length <= 1 ? w : w[0] + w.slice(1).replace(/[וי]/g, '')))
    .join(' ');
}

/** Optimal string alignment (Damerau–Levenshtein restricted) distance. */
export function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 3) return Math.abs(m - n);
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

function withArticle(forms: string[]): string[] {
  return forms.flatMap((f) => [f, 'ה' + f]);
}

export function checkTextAnswer(raw: string, key: TextAnswerKey): MatchResult {
  const normalized = normalizeText(raw);
  const result = (kind: MatchKind, matchedAgainst?: string): MatchResult => ({
    kind,
    accepted: kind === 'exact' || kind === 'alternative' || kind === 'spelling_variant',
    matchedAgainst,
    normalized,
  });
  if (!normalized) return result('wrong');

  const canonical = normalizeText(key.canonical);
  let alts = (key.alternatives ?? []).map(normalizeText);
  let canonForms = [canonical];
  if (key.allowDefiniteArticle) {
    canonForms = withArticle(canonForms);
    alts = withArticle(alts);
  }
  const rejects = (key.rejects ?? []).map(normalizeText);

  // An explicit reject always wins.
  if (rejects.includes(normalized)) return result('wrong', normalized);
  if (canonForms.includes(normalized)) return result('exact', canonical);
  const alt = alts.find((a) => a === normalized);
  if (alt) return result('alternative', alt);

  const allForms = [...canonForms, ...alts];
  const sk = spellingSkeleton(normalized);
  const rejectSkeletons = new Set(rejects.map(spellingSkeleton));

  if (key.acceptSpellingVariants !== false) {
    const hit = allForms.find((f) => spellingSkeleton(f) === sk);
    if (hit) {
      // A skeleton shared with a known wrong answer is ambiguous → human review.
      return rejectSkeletons.has(sk) ? result('uncertain', hit) : result('spelling_variant', hit);
    }
  }

  // Small typos: flagged as uncertain only — never auto-scored (spec).
  for (const f of allForms) {
    const fsk = spellingSkeleton(f);
    const tol = key.typoTolerance ?? (fsk.length >= 9 ? 2 : 1);
    if (fsk.length >= 4 && editDistance(sk, fsk) <= tol && !rejectSkeletons.has(sk)) {
      return result('uncertain', f);
    }
  }
  return result('wrong');
}

/** Digits-only code check for the vault (task 4). */
export function normalizeCode(raw: string): string {
  return raw.replace(/[^\d]/g, '');
}
