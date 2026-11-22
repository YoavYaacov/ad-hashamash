/**
 * Task 17 — partial credit by pairwise relative order.
 * score = (#pairs in correct relative order) / (n·(n−1)/2)
 */
export function pairwiseOrderRatio<T>(correct: readonly T[], submitted: readonly T[]): number {
  const n = correct.length;
  if (n < 2) throw new Error('need at least 2 items');
  if (submitted.length !== n) throw new Error('submission length mismatch');
  const pos = new Map<T, number>();
  submitted.forEach((item, i) => pos.set(item, i));
  if (pos.size !== n) throw new Error('duplicate items in submission');
  for (const item of correct) if (!pos.has(item)) throw new Error('unknown item in submission');

  let good = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (pos.get(correct[i])! < pos.get(correct[j])!) good++;
    }
  }
  return good / ((n * (n - 1)) / 2);
}

export function pairwiseOrderPoints<T>(correct: readonly T[], submitted: readonly T[], maxPoints: number): number {
  // Round to whole points; deterministic.
  return Math.round(pairwiseOrderRatio(correct, submitted) * maxPoints);
}
