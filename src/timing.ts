/**
 * Learns how fast this person reacts, and recommends a scan interval and planning cost to match.
 * Deterministic: it only sees reaction times you give it.
 */
export interface TimingOptions {
  /** Most recent reactions kept. */
  window: number;
  /** Reactions faster than this are anticipations or bounces, not reactions to the highlight. */
  minReactionMs: number;
  /** Reactions slower than this are ignored (the person was not responding to that highlight). */
  maxReactionMs: number;
  /** Samples needed before a recommendation replaces the fallback. */
  minSamples: number;
  /** The interval leaves this much headroom over the slow end (p90) of the person's reactions. */
  safetyFactor: number;
  minIntervalMs: number;
  maxIntervalMs: number;
}

export const DEFAULT_TIMING_OPTIONS: TimingOptions = {
  window: 30,
  minReactionMs: 120,
  maxReactionMs: 4000,
  minSamples: 5,
  safetyFactor: 1.3,
  minIntervalMs: 600,
  maxIntervalMs: 3000,
};

export interface TimingStats {
  n: number;
  meanMs: number;
  p90Ms: number;
}

/** Linear-interpolated quantile of a sorted array, q in [0,1]. */
export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo]!;
  const b = sorted[hi]!;
  return a + (b - a) * (pos - lo);
}

export class TimingModel {
  readonly options: TimingOptions;
  private samples: number[] = [];

  constructor(options: Partial<TimingOptions> = {}, samples: number[] = []) {
    this.options = { ...DEFAULT_TIMING_OPTIONS, ...options };
    for (const s of samples) this.add(s);
  }

  /** Returns true if the sample was kept. */
  add(reactionMs: number): boolean {
    const { minReactionMs, maxReactionMs, window } = this.options;
    if (!(reactionMs >= minReactionMs && reactionMs <= maxReactionMs)) return false;
    this.samples.push(reactionMs);
    if (this.samples.length > window) this.samples.splice(0, this.samples.length - window);
    return true;
  }

  getSamples(): readonly number[] {
    return this.samples;
  }

  clear(): void {
    this.samples.length = 0;
  }

  stats(): TimingStats {
    const n = this.samples.length;
    if (n === 0) return { n: 0, meanMs: NaN, p90Ms: NaN };
    const sorted = [...this.samples].sort((a, b) => a - b);
    const mean = this.samples.reduce((a, b) => a + b, 0) / n;
    return { n, meanMs: mean, p90Ms: quantile(sorted, 0.9) };
  }

  /** True once there are enough samples to trust a recommendation. */
  isCalibrated(): boolean {
    return this.samples.length >= this.options.minSamples;
  }

  /** Scan interval: slow-end reaction plus headroom, clamped, rounded to 100 ms. */
  recommendedIntervalMs(fallbackMs: number): number {
    if (!this.isCalibrated()) return fallbackMs;
    const { safetyFactor, minIntervalMs, maxIntervalMs } = this.options;
    const raw = this.stats().p90Ms * safetyFactor;
    const rounded = Math.round(raw / 100) * 100;
    return Math.min(maxIntervalMs, Math.max(minIntervalMs, rounded));
  }

  /** Typical press cost for planning the scan tree. */
  recommendedPressMs(fallbackMs: number): number {
    if (!this.isCalibrated()) return fallbackMs;
    return Math.round(this.stats().meanMs);
  }
}
