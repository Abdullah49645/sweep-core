import { ScanScheduler } from './scheduler';
import type { GroupNode } from './types';

/** Small seeded PRNG (mulberry32) so simulations are reproducible. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normal(rand: () => number, mean: number, sd: number): number {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Synthetic switch user. These are assumptions for simulation, not measurements of real users. */
export interface SyntheticUser {
  reactionMeanMs: number;
  reactionSdMs: number;
  /** Chance of not pressing when the target is highlighted. */
  missRate: number;
  /** Chance of pressing when the target is NOT highlighted. */
  falsePressRate: number;
}

export const DEFAULT_USER: SyntheticUser = {
  reactionMeanMs: 650,
  reactionSdMs: 150,
  missRate: 0.05,
  falsePressRate: 0.02,
};

export interface TrialResult {
  target: number;
  ms: number;
  presses: number;
  /** Wrong items selected before the target. */
  wrongSelections: number;
  completed: boolean;
}

export interface TrialOptions {
  intervalMs: number;
  maxCycles: number;
  /** Give up after this long. */
  timeoutMs: number;
}

/** Runs one task: the user tries to select `target` in `tree`. */
export function runTrial(
  tree: GroupNode,
  target: number,
  user: SyntheticUser,
  opts: TrialOptions,
  rand: () => number,
): TrialResult {
  const sched = new ScanScheduler(tree, { intervalMs: opts.intervalMs, maxCycles: opts.maxCycles });
  let now = 0;
  sched.start(now);
  let presses = 0;
  let wrong = 0;

  while (now < opts.timeoutMs) {
    const shownAt = now;
    const hit = sched.highlighted().includes(target);
    const wantsPress = hit ? rand() >= user.missRate : rand() < user.falsePressRate;
    const reaction = Math.max(150, normal(rand, user.reactionMeanMs, user.reactionSdMs));

    if (wantsPress && reaction < opts.intervalMs) {
      now = shownAt + reaction;
      presses++;
      const selected = sched.press(now).find((e) => e.type === 'select');
      if (selected && selected.type === 'select') {
        if (selected.index === target) return { target, ms: now, presses, wrongSelections: wrong, completed: true };
        wrong++;
      }
    } else {
      now = sched.nextAdvanceAt();
      sched.tick(now);
    }
  }
  return { target, ms: opts.timeoutMs, presses, wrongSelections: wrong, completed: false };
}

export interface Summary {
  trials: number;
  completed: number;
  meanMs: number;
  medianMs: number;
  meanPresses: number;
  wrongSelectionsPerTask: number;
}

export function summarize(results: readonly TrialResult[]): Summary {
  const ms = results.map((r) => r.ms).sort((a, b) => a - b);
  const mid = Math.floor(ms.length / 2);
  const median = ms.length === 0 ? 0 : ms.length % 2 ? ms[mid]! : (ms[mid - 1]! + ms[mid]!) / 2;
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return {
    trials: results.length,
    completed: results.filter((r) => r.completed).length,
    meanMs: mean(results.map((r) => r.ms)),
    medianMs: median,
    meanPresses: mean(results.map((r) => r.presses)),
    wrongSelectionsPerTask: mean(results.map((r) => r.wrongSelections)),
  };
}

/** Samples an index from a probability vector. */
export function sample(probs: readonly number[], rand: () => number): number {
  const total = probs.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < probs.length; i++) {
    r -= probs[i]!;
    if (r <= 0) return i;
  }
  return probs.length - 1;
}
