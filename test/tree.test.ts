import { describe, expect, it } from 'vitest';
import {
  buildOptimalTree,
  expectedCost,
  leavesOf,
  linearTree,
  pathCosts,
  rowColumnTree,
  type GroupNode,
  type ScanCosts,
  type ScanNode,
} from '../src/index';
import { rng } from '../src/sim';

const costs: ScanCosts = { pressMs: 700, waitMs: 1200 };

/** Every contiguous full binary tree over i..j, built independently of the DP. */
function allTrees(i: number, j: number): ScanNode[] {
  if (i === j) return [{ kind: 'leaf', index: i }];
  const out: ScanNode[] = [];
  for (let k = i; k < j; k++) {
    for (const l of allTrees(i, k)) for (const r of allTrees(k + 1, j)) {
      out.push({ kind: 'group', children: [l, r], autoEnterLast: true });
    }
  }
  return out;
}

function randomProbs(n: number, seed: number): number[] {
  const r = rng(seed);
  const raw = Array.from({ length: n }, () => r() ** 2 + 0.01);
  const t = raw.reduce((a, b) => a + b, 0);
  return raw.map((x) => x / t);
}

describe('buildOptimalTree', () => {
  it('matches brute force over all contiguous binary trees for n ≤ 8', () => {
    for (let n = 2; n <= 8; n++) {
      for (let seed = 1; seed <= 5; seed++) {
        const probs = randomProbs(n, seed * 31 + n);
        const { expectedMs } = buildOptimalTree(probs, costs);
        const best = Math.min(...allTrees(0, n - 1).map((t) => expectedCost(t, probs, costs).ms));
        expect(expectedMs).toBeCloseTo(best, 6);
      }
    }
  });

  it('reports the same expected cost the shared evaluator computes', () => {
    const probs = randomProbs(40, 7);
    const { tree, expectedMs } = buildOptimalTree(probs, costs);
    expect(expectedCost(tree, probs, costs).ms).toBeCloseTo(expectedMs, 6);
  });

  it('produces contiguous groups covering every position exactly once', () => {
    const probs = randomProbs(37, 3);
    const { tree } = buildOptimalTree(probs, costs);
    expect(leavesOf(tree)).toEqual(Array.from({ length: 37 }, (_, i) => i));
    const check = (node: ScanNode) => {
      if (node.kind === 'leaf') return;
      const l = leavesOf(node);
      expect(l.at(-1)! - l[0]! + 1).toBe(l.length);
      node.children.forEach(check);
    };
    check(tree);
  });

  it('handles a single item', () => {
    const { tree, expectedMs } = buildOptimalTree([1], costs);
    expect(leavesOf(tree)).toEqual([0]);
    expect(expectedMs).toBe(costs.pressMs);
  });

  it('rejects empty and negative input', () => {
    expect(() => buildOptimalTree([], costs)).toThrow();
    expect(() => buildOptimalTree([0.5, -0.1], costs)).toThrow();
  });

  it('beats row/column and linear scanning on a skewed distribution', () => {
    const probs = randomProbs(40, 11).sort((a, b) => b - a);
    const opt = buildOptimalTree(probs, costs).expectedMs;
    expect(opt).toBeLessThan(expectedCost(rowColumnTree(40, 8), probs, costs).ms);
    expect(opt).toBeLessThan(expectedCost(linearTree(40), probs, costs).ms);
  });
});

describe('pathCosts', () => {
  it('row/column: row index waits + press + column waits + press', () => {
    const t = rowColumnTree(10, 4);
    const pc = pathCosts(t, costs);
    // Item 6 is row 1, column 2.
    expect(pc.get(6)).toEqual({ ms: 1 * 1200 + 700 + 2 * 1200 + 700, presses: 2 });
  });

  it('binary auto-enter: right group entered by waiting, leaves always pressed', () => {
    const t: GroupNode = {
      kind: 'group',
      autoEnterLast: true,
      children: [
        { kind: 'leaf', index: 0 },
        { kind: 'group', autoEnterLast: true, children: [{ kind: 'leaf', index: 1 }, { kind: 'leaf', index: 2 }] },
      ],
    };
    const pc = pathCosts(t, costs);
    expect(pc.get(0)).toEqual({ ms: 700, presses: 1 });
    expect(pc.get(1)).toEqual({ ms: 1200 + 700, presses: 1 });
    expect(pc.get(2)).toEqual({ ms: 1200 + 1200 + 700, presses: 1 });
  });
});
