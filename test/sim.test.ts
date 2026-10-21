import { describe, expect, it } from 'vitest';
import {
  DEFAULT_USER,
  DEMO_INTENTS,
  IntentModel,
  demoHistory,
  pathCosts,
  planBaselineScreen,
  planSweepScreen,
  rng,
  runTrial,
  sample,
  summarize,
} from '../src/index';

const now = 1_800_000_000_000;
const costs = { pressMs: 650, waitMs: 1200 };
const trialOpts = { intervalMs: 1200, maxCycles: 2, timeoutMs: 180_000 };

describe('simulation', () => {
  it('is reproducible with the same seed', () => {
    const model = new IntentModel({}, demoHistory(now));
    const screen = planSweepScreen(DEMO_INTENTS, model, costs, now);
    const a = runTrial(screen.tree, 5, DEFAULT_USER, trialOpts, rng(42));
    const b = runTrial(screen.tree, 5, DEFAULT_USER, trialOpts, rng(42));
    expect(a).toEqual(b);
  });

  it('a perfect user matches the error-free cost model exactly', () => {
    const model = new IntentModel({}, demoHistory(now));
    const screen = planSweepScreen(DEMO_INTENTS, model, costs, now);
    const perfect = { reactionMeanMs: costs.pressMs, reactionSdMs: 0, missRate: 0, falsePressRate: 0 };
    const pc = pathCosts(screen.tree, costs);
    for (let t = 0; t < screen.layout.length; t++) {
      const r = runTrial(screen.tree, t, perfect, trialOpts, rng(t));
      expect(r.completed).toBe(true);
      expect(r.wrongSelections).toBe(0);
      expect(r.presses).toBe(pc.get(t)!.presses);
      expect(r.ms).toBeCloseTo(pc.get(t)!.ms, 6);
    }
  });

  it('Sweep needs less time than row/column when targets follow the history', () => {
    const model = new IntentModel({}, demoHistory(now));
    const sweep = planSweepScreen(DEMO_INTENTS, model, costs, now);
    const base = planBaselineScreen(DEMO_INTENTS, model, costs, now, 8);
    const r = rng(7);
    const s: ReturnType<typeof runTrial>[] = [];
    const b: ReturnType<typeof runTrial>[] = [];
    for (let i = 0; i < 300; i++) {
      const id = DEMO_INTENTS[sample(base.probabilities, r)]!.id;
      s.push(runTrial(sweep.tree, sweep.layout.findIndex((x) => x.id === id), DEFAULT_USER, trialOpts, r));
      b.push(runTrial(base.tree, base.layout.findIndex((x) => x.id === id), DEFAULT_USER, trialOpts, r));
    }
    expect(summarize(s).meanMs).toBeLessThan(summarize(b).meanMs);
  });
});
