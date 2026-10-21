/** What a viewer can choose on a screen. Kept app-agnostic on purpose. */
export type IntentKind = 'resume' | 'next' | 'title' | 'genre' | 'action' | 'back';

export interface Intent {
  /** Stable id; history is keyed by it. */
  id: string;
  label: string;
  kind: IntentKind;
  /** Optional extra prior weight supplied by the app (e.g. "next episode of what was watched last night"). */
  boost?: number;
  /** Short human reason for the boost, shown in "why is this first?". */
  boostReason?: string;
}

/** One confirmed choice by the viewer. */
export interface HistoryEvent {
  intentId: string;
  /** Epoch milliseconds. */
  at: number;
}

/**
 * Timing costs of one scanning step.
 * pressMs: time from a highlight appearing to the user's press (reaction + press).
 * waitMs: one scan interval, i.e. the time a highlight stays up when the user does not press.
 */
export interface ScanCosts {
  pressMs: number;
  waitMs: number;
}

export interface LeafNode {
  kind: 'leaf';
  /** Position in the layout (0-based). */
  index: number;
}

export interface GroupNode {
  kind: 'group';
  children: ScanNode[];
  /**
   * When true and the last child is a group, the scanner enters that group on timeout
   * instead of waiting for a press (binary-code scanning: "no press" means "the other half").
   * Leaf children always require a press.
   */
  autoEnterLast: boolean;
}

export type ScanNode = LeafNode | GroupNode;

export interface PathCost {
  /** Milliseconds to reach and select this leaf with no errors. */
  ms: number;
  /** Switch presses needed to select this leaf with no errors. */
  presses: number;
}
