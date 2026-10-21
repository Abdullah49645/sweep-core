import { describe, expect, it } from 'vitest';
import { ScanScheduler, TimingModel, buildOptimalTree, quantile, rowColumnTree } from '../src/index';

describe('quantile', () => {
  it('interpolates linearly', () => {
    expect(quantile([0, 10], 0.5)).toBe(5);
    expect(quantile([1, 2, 3, 4, 5], 0.9)).toBeCloseTo(4.6, 10);
    expect(Number.isNaN(quantile([], 0.5))).toBe(true);
  });
});

describe('TimingModel', () => {
  it('uses the fallback until it has enough samples', () => {
    const t = new TimingModel({ minSamples: 5 }, [500, 600, 700]);
    expect(t.isCalibrated()).toBe(false);
    expect(t.recommendedIntervalMs(1200)).toBe(1200);
    expect(t.recommendedPressMs(650)).toBe(650);
  });

  it('drops anticipations and non-responses', () => {
    const t = new TimingModel();
    expect(t.add(50)).toBe(false);
    expect(t.add(9000)).toBe(false);
    expect(t.add(700)).toBe(true);
    expect(t.getSamples()).toEqual([700]);
  });

  it('recommends p90 × safety, rounded to 100 ms and clamped', () => {
    const t = new TimingModel({}, [600, 650, 700, 750, 800, 850, 900, 950, 1000, 1050]);
    // p90 of 600..1050 step 50 = 1005; × 1.3 = 1306.5 → 1300
    expect(t.recommendedIntervalMs(9999)).toBe(1300);
    expect(t.recommendedPressMs(0)).toBe(825);
    const fast = new TimingModel({}, [200, 210, 220, 230, 240]);
    expect(fast.recommendedIntervalMs(1200)).toBe(600);
    const slow = new TimingModel({}, [3500, 3600, 3700, 3800, 3900]);
    expect(slow.recommendedIntervalMs(1200)).toBe(3000);
  });

  it('keeps only the most recent window', () => {
    const t = new TimingModel({ window: 3 }, [500, 600, 700, 800]);
    expect(t.getSamples()).toEqual([600, 700, 800]);
  });

  it('slower reactions give a slower scan', () => {
    const a = new TimingModel({}, [500, 520, 540, 560, 580]);
    const b = new TimingModel({}, [1200, 1250, 1300, 1350, 1400]);
    expect(b.recommendedIntervalMs(1000)).toBeGreaterThan(a.recommendedIntervalMs(1000));
  });
});

describe('ScanScheduler press reaction and step mode', () => {
  it('reports reaction time from highlight onset', () => {
    const s = new ScanScheduler(rowColumnTree(9, 3), { intervalMs: 1000, maxCycles: 2 });
    s.start(0);
    const ev = s.press(1450); // second row appeared at 1000
    const p = ev.find((e) => e.type === 'press');
    expect(p).toEqual({ type: 'press', at: 1450, reactionMs: 450, depth: 0 });
  });

  it('step mode never advances on its own', () => {
    const s = new ScanScheduler(rowColumnTree(9, 3), { intervalMs: 1000, maxCycles: 2, autoAdvance: false });
    s.start(0);
    expect(s.tick(60_000)).toEqual([]);
    expect(s.highlighted()).toEqual([0, 1, 2]);
    expect(s.nextAdvanceAt()).toBe(Infinity);
  });

  it('step moves the highlight and press selects', () => {
    const s = new ScanScheduler(rowColumnTree(9, 3), { intervalMs: 1000, maxCycles: 2, autoAdvance: false });
    s.start(0);
    s.step(100);
    expect(s.highlighted()).toEqual([3, 4, 5]);
    s.press(200);
    s.step(300);
    const ev = s.press(400);
    expect(ev.find((e) => e.type === 'select')).toEqual({ type: 'select', at: 400, index: 4 });
  });

  it('step auto-enters the last group of a binary tree like a timeout does', () => {
    const { tree } = buildOptimalTree([0.5, 0.3, 0.2], { pressMs: 500, waitMs: 500 });
    const s = new ScanScheduler(tree, { intervalMs: 1000, maxCycles: 2, autoAdvance: false });
    s.start(0);
    s.step(10);
    expect(s.depth()).toBe(1);
  });
});
