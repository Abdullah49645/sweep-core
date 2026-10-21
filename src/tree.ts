import type { GroupNode, LeafNode, PathCost, ScanCosts, ScanNode } from './types';

const leaf = (index: number): LeafNode => ({ kind: 'leaf', index });

export interface OptimalTreeResult {
  tree: GroupNode;
  /** Expected milliseconds per selection under the cost model (no errors). */
  expectedMs: number;
}

/**
 * Builds the contiguous binary scan tree with minimum expected cost.
 *
 * Items are in layout order (normally probability order). At a node covering positions i..j
 * split at k, the scanner highlights i..k. Target inside: the user presses (pressMs).
 * Target outside: the user waits one interval (waitMs) and the scanner enters k+1..j.
 * A single item is always selected by a press, never by timeout.
 *
 *   F(i,i) = W(i,i)·press
 *   F(i,j) = min_k [ W(i,k)·press + (i<k ? F(i,k) : 0) + W(k+1,j)·wait + F(k+1,j) ]
 *
 * F is probability-weighted; expected cost = F(0,n-1) / W(0,n-1). O(n³), fine for n ≤ ~100.
 */
export function buildOptimalTree(probs: readonly number[], costs: ScanCosts): OptimalTreeResult {
  const n = probs.length;
  if (n === 0) throw new Error('Cannot build a scan tree with no items');
  const prefix = [0];
  for (const p of probs) {
    if (!(p >= 0)) throw new Error('Probabilities must be non-negative numbers');
    prefix.push(prefix[prefix.length - 1]! + p);
  }
  const W = (i: number, j: number) => prefix[j + 1]! - prefix[i]!;
  const total = W(0, n - 1);

  if (n === 1) {
    return { tree: { kind: 'group', children: [leaf(0)], autoEnterLast: false }, expectedMs: costs.pressMs };
  }

  const F: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const split: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(-1));
  for (let i = 0; i < n; i++) F[i]![i] = W(i, i) * costs.pressMs;

  for (let len = 2; len <= n; len++) {
    for (let i = 0; i + len - 1 < n; i++) {
      const j = i + len - 1;
      let best = Infinity;
      let bestK = i;
      for (let k = i; k < j; k++) {
        const left = W(i, k) * costs.pressMs + (i < k ? F[i]![k]! : 0);
        const right = W(k + 1, j) * costs.waitMs + F[k + 1]![j]!;
        const c = left + right;
        if (c < best - 1e-12) {
          best = c;
          bestK = k;
        }
      }
      F[i]![j] = best;
      split[i]![j] = bestK;
    }
  }

  const build = (i: number, j: number): ScanNode => {
    if (i === j) return leaf(i);
    const k = split[i]![j]!;
    return { kind: 'group', children: [build(i, k), build(k + 1, j)], autoEnterLast: true };
  };

  const tree = build(0, n - 1) as GroupNode;
  const expectedMs = total > 0 ? F[0]![n - 1]! / total : 0;
  return { tree, expectedMs };
}

/** Classic row/column scanning over a grid in the given layout order. Rows and items each need a press. */
export function rowColumnTree(n: number, columns: number): GroupNode {
  if (n <= 0) throw new Error('Cannot build a scan tree with no items');
  if (columns <= 0) throw new Error('columns must be positive');
  const rows: ScanNode[] = [];
  for (let start = 0; start < n; start += columns) {
    const items: ScanNode[] = [];
    for (let i = start; i < Math.min(n, start + columns); i++) items.push(leaf(i));
    rows.push({ kind: 'group', children: items, autoEnterLast: false });
  }
  return { kind: 'group', children: rows, autoEnterLast: false };
}

/** Linear scanning: one item at a time. */
export function linearTree(n: number): GroupNode {
  if (n <= 0) throw new Error('Cannot build a scan tree with no items');
  return { kind: 'group', children: Array.from({ length: n }, (_, i) => leaf(i)), autoEnterLast: false };
}

/**
 * Error-free cost of reaching every leaf. One code path for every tree shape, so baseline
 * and Sweep numbers come from the same arithmetic.
 */
export function pathCosts(tree: ScanNode, costs: ScanCosts): Map<number, PathCost> {
  const out = new Map<number, PathCost>();
  const visit = (node: ScanNode, acc: PathCost) => {
    if (node.kind === 'leaf') {
      out.set(node.index, acc);
      return;
    }
    const n = node.children.length;
    node.children.forEach((child, m) => {
      const auto = node.autoEnterLast && m === n - 1 && child.kind === 'group';
      const press = auto ? 0 : 1;
      visit(child, {
        ms: acc.ms + m * costs.waitMs + press * costs.pressMs,
        presses: acc.presses + press,
      });
    });
  };
  visit(tree, { ms: 0, presses: 0 });
  return out;
}

export interface ExpectedCost {
  ms: number;
  presses: number;
}

/** Probability-weighted expected cost of a tree. `probs[i]` is the probability of the item at layout position i. */
export function expectedCost(tree: ScanNode, probs: readonly number[], costs: ScanCosts): ExpectedCost {
  const pc = pathCosts(tree, costs);
  let ms = 0;
  let presses = 0;
  let total = 0;
  probs.forEach((p, i) => {
    const c = pc.get(i);
    if (!c) throw new Error(`Tree has no leaf for position ${i}`);
    ms += p * c.ms;
    presses += p * c.presses;
    total += p;
  });
  return total > 0 ? { ms: ms / total, presses: presses / total } : { ms: 0, presses: 0 };
}

/** Layout positions under a node, in order. */
export function leavesOf(node: ScanNode): number[] {
  if (node.kind === 'leaf') return [node.index];
  return node.children.flatMap(leavesOf);
}
