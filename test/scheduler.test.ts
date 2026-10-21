import { describe, expect, it } from 'vitest';
import { ScanScheduler, buildOptimalTree, rowColumnTree, type GroupNode } from '../src/index';

const opts = { intervalMs: 1000, maxCycles: 2 };

const small: GroupNode = {
  kind: 'group',
  autoEnterLast: true,
  children: [
    { kind: 'leaf', index: 0 },
    { kind: 'group', autoEnterLast: true, children: [{ kind: 'leaf', index: 1 }, { kind: 'leaf', index: 2 }] },
  ],
};

describe('ScanScheduler', () => {
  it('starts on the first child of the root', () => {
    const s = new ScanScheduler(small, opts);
    const ev = s.start(0);
    expect(ev).toEqual([{ type: 'highlight', at: 0, leaves: [0], depth: 0 }]);
  });

  it('selects the highlighted leaf on press and restarts at the root', () => {
    const s = new ScanScheduler(small, opts);
    s.start(0);
    const ev = s.press(400);
    expect(ev[0]).toEqual({ type: 'press', at: 400, reactionMs: 400, depth: 0 });
    expect(ev[1]).toEqual({ type: 'select', at: 400, index: 0 });
    expect(s.highlighted()).toEqual([0]);
    expect(s.depth()).toBe(0);
  });

  it('auto-enters the last group on timeout instead of highlighting it', () => {
    const s = new ScanScheduler(small, opts);
    s.start(0);
    s.tick(1000);
    expect(s.highlighted()).toEqual([1]);
    expect(s.depth()).toBe(1);
    const ev = s.press(1500);
    expect(ev.find((e) => e.type === 'select')).toEqual({ type: 'select', at: 1500, index: 1 });
  });

  it('backs out to the root by default after maxCycles unanswered cycles', () => {
    const deep = buildOptimalTree([0.4, 0.3, 0.1, 0.1, 0.05, 0.05], { pressMs: 500, waitMs: 1000 }).tree;
    const s = new ScanScheduler(deep, { intervalMs: 1000, maxCycles: 1 });
    s.start(0);
    let now = 0;
    while (s.depth() < 2) {
      now = s.nextAdvanceAt();
      s.tick(now);
    }
    for (let i = 0; i < 10 && s.depth() > 0; i++) {
      now = s.nextAdvanceAt();
      s.tick(now);
    }
    expect(s.depth()).toBe(0);
  });

  it('with backTo parent: wraps, then backs up one level after maxCycles unanswered cycles', () => {
    const s = new ScanScheduler(small, { ...opts, backTo: 'parent' });
    s.start(0);
    s.tick(1000); // enter right group, highlight 1
    s.tick(2000); // highlight 2
    s.tick(3000); // wrap 1 → highlight 1
    s.tick(4000); // highlight 2
    const ev = s.tick(5000); // second unanswered cycle → back
    expect(ev.some((e) => e.type === 'back')).toBe(true);
    expect(s.depth()).toBe(0);
    expect(s.highlighted()).toEqual([0]);
  });

  it('processes several missed intervals in one tick', () => {
    const s = new ScanScheduler(rowColumnTree(9, 3), opts);
    s.start(0);
    const ev = s.tick(2500);
    expect(ev.filter((e) => e.type === 'highlight')).toHaveLength(2);
    expect(s.highlighted()).toEqual([6, 7, 8]);
  });

  it('reset returns to the root from any depth', () => {
    const s = new ScanScheduler(rowColumnTree(9, 3), opts);
    s.start(0);
    s.press(300);
    expect(s.depth()).toBe(1);
    s.reset(500);
    expect(s.depth()).toBe(0);
    expect(s.highlighted()).toEqual([0, 1, 2]);
  });

  it('reaches every leaf of an optimal tree by pressing only when the target is highlighted', () => {
    const probs = Array.from({ length: 20 }, (_, i) => 1 / (i + 1));
    const { tree } = buildOptimalTree(probs, { pressMs: 500, waitMs: 1000 });
    for (let target = 0; target < 20; target++) {
      const s = new ScanScheduler(tree, { intervalMs: 1000, maxCycles: 3 });
      s.start(0);
      let now = 0;
      let selected: number | undefined;
      for (let step = 0; step < 100 && selected === undefined; step++) {
        if (s.highlighted().includes(target)) {
          now += 500;
          const sel = s.press(now).find((e) => e.type === 'select');
          if (sel && sel.type === 'select') selected = sel.index;
        } else {
          now = s.nextAdvanceAt();
          s.tick(now);
        }
      }
      expect(selected).toBe(target);
    }
  });

  it('rejects bad options', () => {
    expect(() => new ScanScheduler(small, { intervalMs: 0, maxCycles: 1 })).toThrow();
    expect(() => new ScanScheduler(small, { intervalMs: 100, maxCycles: 0 })).toThrow();
  });
});
