/**
 * Returns a permutation of item positions sorted by probability, highest first.
 * Ties keep their original order so the layout is stable between renders.
 * Result[k] = index into the original array of the item shown at position k.
 */
export function probabilityOrder(probs: readonly number[]): number[] {
  return probs
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (b.p !== a.p ? b.p - a.p : a.i - b.i))
    .map((x) => x.i);
}

/** Reorders `items` by a permutation from probabilityOrder. */
export function applyOrder<T>(items: readonly T[], order: readonly number[]): T[] {
  return order.map((i) => {
    const item = items[i];
    if (item === undefined) throw new Error(`Order index ${i} out of range`);
    return item;
  });
}
