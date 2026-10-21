import { applyOrder, probabilityOrder } from './layout';
import { IntentModel } from './model';
import { buildOptimalTree, expectedCost, rowColumnTree } from './tree';
import type { GroupNode, Intent, ScanCosts } from './types';

export interface SweepScreen {
  /** Intents in the order they are drawn on screen. */
  layout: Intent[];
  /** probabilities[i] belongs to layout[i]. */
  probabilities: number[];
  tree: GroupNode;
  expectedMs: number;
  expectedPresses: number;
}

/**
 * Extra planning cost per press, in ms. 0 = fastest; higher = fewer presses (less fatigue) at
 * some cost in time. In the demo simulation, ~1000 ms keeps presses level with row/column
 * scanning while staying faster. Only shapes the tree; reported costs use the real `costs`.
 */
export const BALANCED_PRESS_PENALTY_MS = 1000;

/** One call from model + intents to a ready-to-scan screen. This is what an app uses. */
export function planSweepScreen(
  intents: readonly Intent[],
  model: IntentModel,
  costs: ScanCosts,
  now: number,
  pressPenaltyMs = BALANCED_PRESS_PENALTY_MS,
): SweepScreen {
  const probs = model.probabilities(intents, now);
  const order = probabilityOrder(probs);
  const layout = applyOrder(intents, order);
  const probabilities = applyOrder(probs, order);
  const { tree } = buildOptimalTree(probabilities, { pressMs: costs.pressMs + pressPenaltyMs, waitMs: costs.waitMs });
  const e = expectedCost(tree, probabilities, costs);
  return { layout, probabilities, tree, expectedMs: e.ms, expectedPresses: e.presses };
}

/** The comparison baseline: row/column scanning over the app's normal (catalogue) order. */
export function planBaselineScreen(
  intents: readonly Intent[],
  model: IntentModel,
  costs: ScanCosts,
  now: number,
  columns: number,
): SweepScreen {
  const probabilities = model.probabilities(intents, now);
  const tree = rowColumnTree(intents.length, columns);
  const e = expectedCost(tree, probabilities, costs);
  return { layout: [...intents], probabilities, tree, expectedMs: e.ms, expectedPresses: e.presses };
}
