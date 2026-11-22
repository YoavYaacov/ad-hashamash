/**
 * Task 31 helper — verify a logic matching puzzle (e.g. 4 characters ↔ 4 menorahs)
 * has exactly one solution, by exhaustive search over permutations.
 * A solution is an array `assign` where assign[i] = index of the item matched to person i.
 */
export type Constraint = (assign: number[]) => boolean;

export function permutations(n: number): number[][] {
  const out: number[][] = [];
  const rec = (cur: number[], used: boolean[]) => {
    if (cur.length === n) return void out.push(cur.slice());
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      used[i] = true; cur.push(i);
      rec(cur, used);
      cur.pop(); used[i] = false;
    }
  };
  rec([], Array(n).fill(false));
  return out;
}

export function solveMatching(n: number, constraints: Constraint[]): number[][] {
  return permutations(n).filter((p) => constraints.every((c) => c(p)));
}

export function hasUniqueSolution(n: number, constraints: Constraint[]): boolean {
  return solveMatching(n, constraints).length === 1;
}

/** Report which clues are redundant (puzzle still unique without them) — useful while authoring. */
export function redundantClues(n: number, constraints: Constraint[]): number[] {
  return constraints
    .map((_, i) => i)
    .filter((i) => hasUniqueSolution(n, constraints.filter((_, j) => j !== i)));
}
