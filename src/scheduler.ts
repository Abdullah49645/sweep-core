import { leavesOf } from './tree';
import type { GroupNode, ScanNode } from './types';

export interface SchedulerOptions {
  /** How long each highlight stays up, in ms. */
  intervalMs: number;
  /** Full unanswered cycles through a group before backing out. */
  maxCycles: number;
  /**
   * Where to go after maxCycles unanswered cycles. 'root' (default) recovers quickly from a
   * missed highlight that sent the scan into the wrong half; 'parent' backs up one level.
   */
  backTo?: 'root' | 'parent';
  /**
   * true (default): one-switch auto-scan, the highlight moves on a timer.
   * false: two-switch step-scan, the highlight moves only on step(); tick() does nothing.
   */
  autoAdvance?: boolean;
}

export type SchedulerEvent =
  | { type: 'highlight'; at: number; leaves: number[]; depth: number }
  | { type: 'select'; at: number; index: number }
  | { type: 'back'; at: number; depth: number }
  | { type: 'reset'; at: number }
  /** Emitted on every press. reactionMs = time from the current highlight appearing to the press. */
  | { type: 'press'; at: number; reactionMs: number; depth: number };

interface Frame {
  node: GroupNode;
  idx: number;
  misses: number;
}

/**
 * Explicit state machine that turns timed highlights and single switch presses into a
 * walk down a scan tree. Pure: no timers, no I/O. The host calls tick(now) on its clock
 * and press(now) on the switch.
 */
export class ScanScheduler {
  private stack: Frame[] = [];
  private highlightAt = 0;
  private readonly leafCache = new WeakMap<ScanNode, number[]>();

  constructor(
    private root: GroupNode,
    readonly options: SchedulerOptions,
  ) {
    if (options.intervalMs <= 0) throw new Error('intervalMs must be positive');
    if (options.maxCycles < 1) throw new Error('maxCycles must be at least 1');
  }

  /** Replace the tree (e.g. after the model or screen changed) and restart at the root. */
  setTree(root: GroupNode, now: number): SchedulerEvent[] {
    this.root = root;
    return this.start(now);
  }

  start(now: number): SchedulerEvent[] {
    this.stack = [{ node: this.root, idx: 0, misses: 0 }];
    this.highlightAt = now;
    return [this.highlightEvent(now)];
  }

  /** Currently highlighted layout positions. */
  highlighted(): number[] {
    return this.leaves(this.current());
  }

  depth(): number {
    return this.stack.length - 1;
  }

  /** Time at which the next automatic advance happens. */
  nextAdvanceAt(): number {
    if (this.options.autoAdvance === false) return Infinity;
    return this.highlightAt + this.options.intervalMs;
  }

  /** When the current highlight appeared. */
  highlightStartedAt(): number {
    return this.highlightAt;
  }

  tick(now: number): SchedulerEvent[] {
    this.ensureStarted();
    const events: SchedulerEvent[] = [];
    if (this.options.autoAdvance === false) return events;
    while (now - this.highlightAt >= this.options.intervalMs) {
      events.push(...this.advance(this.highlightAt + this.options.intervalMs));
    }
    return events;
  }

  press(now: number): SchedulerEvent[] {
    this.ensureStarted();
    const events = this.tick(now);
    events.push({ type: 'press', at: now, reactionMs: now - this.highlightAt, depth: this.depth() });
    const child = this.current();
    if (child.kind === 'leaf') {
      events.push({ type: 'select', at: now, index: child.index });
      events.push(...this.start(now));
      return events;
    }
    this.stack.push({ node: child, idx: 0, misses: 0 });
    this.highlightAt = now;
    events.push(this.highlightEvent(now));
    return events;
  }

  /** Second switch in two-switch mode: move the highlight on now. */
  step(now: number): SchedulerEvent[] {
    this.ensureStarted();
    const events = this.tick(now);
    events.push(...this.advance(now));
    return events;
  }

  /** Long press / dedicated back: return to the root. */
  reset(now: number): SchedulerEvent[] {
    return [{ type: 'reset', at: now }, ...this.start(now)];
  }

  private advance(at: number): SchedulerEvent[] {
    const top = this.stack[this.stack.length - 1]!;
    const n = top.node.children.length;
    const next = top.idx + 1;
    const nextChild = top.node.children[next];
    this.highlightAt = at;

    if (next === n - 1 && top.node.autoEnterLast && nextChild?.kind === 'group') {
      this.stack.push({ node: nextChild, idx: 0, misses: 0 });
      return [this.highlightEvent(at)];
    }
    if (next < n) {
      top.idx = next;
      return [this.highlightEvent(at)];
    }
    top.misses += 1;
    if (top.misses >= this.options.maxCycles && this.stack.length > 1) {
      if ((this.options.backTo ?? 'root') === 'root') this.stack.length = 1;
      else this.stack.pop();
      // Restart the group we backed into from its first child.
      const parent = this.stack[this.stack.length - 1]!;
      parent.idx = 0;
      parent.misses = 0;
      return [{ type: 'back', at, depth: this.depth() }, this.highlightEvent(at)];
    }
    top.idx = 0;
    return [this.highlightEvent(at)];
  }

  private current(): ScanNode {
    const top = this.stack[this.stack.length - 1]!;
    const child = top.node.children[top.idx];
    if (!child) throw new Error('Scheduler is in an invalid state');
    return child;
  }

  private leaves(node: ScanNode): number[] {
    let l = this.leafCache.get(node);
    if (!l) {
      l = leavesOf(node);
      this.leafCache.set(node, l);
    }
    return l;
  }

  private highlightEvent(at: number): SchedulerEvent {
    return { type: 'highlight', at, leaves: this.highlighted(), depth: this.depth() };
  }

  private ensureStarted() {
    if (this.stack.length === 0) throw new Error('Call start(now) first');
  }
}
