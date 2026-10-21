import type { HistoryEvent, Intent } from './types';

export interface IntentModelOptions {
  /** Half-life of a past choice's influence, in days. */
  halfLifeDays: number;
  /** Additive smoothing so unseen intents keep a non-zero probability. */
  alpha: number;
  /** Prior weight multiplier for intents of kind 'back' (always reachable, rarely wanted). */
  backWeight: number;
}

export const DEFAULT_MODEL_OPTIONS: IntentModelOptions = {
  halfLifeDays: 7,
  alpha: 0.25,
  backWeight: 0.5,
};

const DAY_MS = 86400000;

export interface Explanation {
  intentId: string;
  probability: number;
  timesChosen: number;
  lastChosenAt?: number;
  reasons: string[];
}

/**
 * Transparent local intent model: recency-decayed choice counts + app-supplied boosts + smoothing.
 * Deterministic: every call takes `now` explicitly.
 */
export class IntentModel {
  private readonly history: HistoryEvent[] = [];
  readonly options: IntentModelOptions;

  constructor(options: Partial<IntentModelOptions> = {}, history: HistoryEvent[] = []) {
    this.options = { ...DEFAULT_MODEL_OPTIONS, ...options };
    for (const e of history) this.record(e.intentId, e.at);
  }

  record(intentId: string, at: number): void {
    this.history.push({ intentId, at });
  }

  forget(): void {
    this.history.length = 0;
  }

  getHistory(): readonly HistoryEvent[] {
    return this.history;
  }

  /** Unnormalised score for each intent. */
  scores(intents: readonly Intent[], now: number): number[] {
    const { halfLifeDays, alpha, backWeight } = this.options;
    const decayed = new Map<string, number>();
    for (const e of this.history) {
      const ageDays = Math.max(0, now - e.at) / DAY_MS;
      const w = Math.pow(0.5, ageDays / halfLifeDays);
      decayed.set(e.intentId, (decayed.get(e.intentId) ?? 0) + w);
    }
    return intents.map((it) => {
      const base = alpha + (decayed.get(it.id) ?? 0) + (it.boost ?? 0);
      return it.kind === 'back' ? base * backWeight : base;
    });
  }

  probabilities(intents: readonly Intent[], now: number): number[] {
    const s = this.scores(intents, now);
    const total = s.reduce((a, b) => a + b, 0);
    if (total <= 0) return intents.map(() => 1 / Math.max(1, intents.length));
    return s.map((x) => x / total);
  }

  explain(intents: readonly Intent[], intentId: string, now: number): Explanation {
    const probs = this.probabilities(intents, now);
    const idx = intents.findIndex((i) => i.id === intentId);
    if (idx < 0) throw new Error(`Unknown intent: ${intentId}`);
    const intent = intents[idx]!;
    const mine = this.history.filter((e) => e.intentId === intentId);
    const last = mine.reduce<number | undefined>((m, e) => (m === undefined || e.at > m ? e.at : m), undefined);
    const reasons: string[] = [];
    if (intent.boost && intent.boostReason) reasons.push(intent.boostReason);
    if (mine.length > 0 && last !== undefined) {
      reasons.push(`Chosen ${mine.length} time${mine.length === 1 ? '' : 's'}, last ${formatAge(now - last)}`);
    }
    if (reasons.length === 0) reasons.push('Not chosen yet');
    return {
      intentId,
      probability: probs[idx]!,
      timesChosen: mine.length,
      lastChosenAt: last,
      reasons,
    };
  }
}

export function formatAge(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${Math.max(1, min)} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}
