import { describe, expect, it } from 'vitest';
import { IntentModel, applyOrder, probabilityOrder, type Intent } from '../src/index';

const DAY = 86_400_000;
const now = 1_800_000_000_000;
const intents: Intent[] = [
  { id: 'a', label: 'A', kind: 'title' },
  { id: 'b', label: 'B', kind: 'title' },
  { id: 'c', label: 'C', kind: 'title', boost: 2, boostReason: 'Next episode' },
  { id: 'back', label: 'Back', kind: 'back' },
];

describe('IntentModel', () => {
  it('gives every intent a non-zero probability that sums to 1', () => {
    const p = new IntentModel().probabilities(intents, now);
    expect(p.every((x) => x > 0)).toBe(true);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it('ranks recent choices above old ones', () => {
    const m = new IntentModel({}, [
      { intentId: 'a', at: now - 30 * DAY },
      { intentId: 'b', at: now - 1 * DAY },
    ]);
    const [pa, pb] = m.probabilities(intents, now);
    expect(pb!).toBeGreaterThan(pa!);
  });

  it('halves a choice’s weight after one half-life', () => {
    const m = new IntentModel({ halfLifeDays: 7, alpha: 0 }, [{ intentId: 'a', at: now - 7 * DAY }]);
    expect(m.scores(intents, now)[0]).toBeCloseTo(0.5, 10);
  });

  it('learns from new records', () => {
    const m = new IntentModel();
    const before = m.probabilities(intents, now)[1]!;
    m.record('b', now);
    m.record('b', now);
    expect(m.probabilities(intents, now)[1]!).toBeGreaterThan(before);
  });

  it('forget clears all history', () => {
    const m = new IntentModel({}, [{ intentId: 'a', at: now }]);
    m.forget();
    expect(m.getHistory()).toHaveLength(0);
  });

  it('explains with boost reason and history', () => {
    const m = new IntentModel({}, [{ intentId: 'c', at: now - 2 * 3_600_000 }]);
    const e = m.explain(intents, 'c', now);
    expect(e.timesChosen).toBe(1);
    expect(e.reasons).toEqual(['Next episode', 'Chosen 1 time, last 2 h ago']);
  });

  it('is deterministic for the same inputs', () => {
    const h = [{ intentId: 'a', at: now - DAY }];
    expect(new IntentModel({}, h).probabilities(intents, now)).toEqual(new IntentModel({}, h).probabilities(intents, now));
  });
});

describe('probabilityOrder', () => {
  it('sorts by probability and keeps ties stable', () => {
    expect(probabilityOrder([0.1, 0.4, 0.1, 0.4])).toEqual([1, 3, 0, 2]);
    expect(applyOrder(['w', 'x', 'y', 'z'], [1, 3, 0, 2])).toEqual(['x', 'z', 'w', 'y']);
  });
});
