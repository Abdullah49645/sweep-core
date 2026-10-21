/**
 * Simulation benchmark: Sweep vs row/column scanning on the demo home screen.
 * Synthetic users and seeded history — these are model outputs, NOT measurements of real people.
 * Usage: npm run bench [-- --trials 500 --seed 1]
 */
import {
  DEFAULT_USER,
  DEMO_INTENTS,
  IntentModel,
  applyOrder,
  demoHistory,
  expectedCost,
  planBaselineScreen,
  planSweepScreen,
  probabilityOrder,
  rng,
  rowColumnTree,
  runTrial,
  sample,
  summarize,
  type GroupNode,
  type Intent,
  type TrialResult,
} from '../src/index';

const args = process.argv.slice(2);
const arg = (name: string, d: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : d;
};
const TRIALS = arg('trials', 500);
const SEED = arg('seed', 1);
const COLUMNS = arg('columns', 8);
const INTERVAL = arg('interval', 1200);

const now = Date.UTC(2026, 9, 17, 20, 0, 0);
const model = new IntentModel({}, demoHistory(now));
const costs = { pressMs: DEFAULT_USER.reactionMeanMs, waitMs: INTERVAL };
const trialOpts = { intervalMs: INTERVAL, maxCycles: 2, timeoutMs: 180_000 };

const sweepFast = planSweepScreen(DEMO_INTENTS, model, costs, now, 0);
const sweep = planSweepScreen(DEMO_INTENTS, model, costs, now);
const base = planBaselineScreen(DEMO_INTENTS, model, costs, now, COLUMNS);
// Stronger baseline: row/column, but already sorted by the same model. Isolates the tree's contribution.
const order = probabilityOrder(base.probabilities);
const sortedLayout: Intent[] = applyOrder(DEMO_INTENTS, order);
const sortedProbs = applyOrder(base.probabilities, order);
const sortedTree = rowColumnTree(DEMO_INTENTS.length, COLUMNS);

interface Variant {
  name: string;
  tree: GroupNode;
  layout: Intent[];
  probs: number[];
}
const variants: Variant[] = [
  { name: `Row/column, catalogue order (${COLUMNS} cols)`, tree: base.tree, layout: base.layout, probs: base.probabilities },
  { name: `Row/column, predicted order (${COLUMNS} cols)`, tree: sortedTree, layout: sortedLayout, probs: sortedProbs },
  { name: 'Sweep, fastest (no press penalty)', tree: sweepFast.tree, layout: sweepFast.layout, probs: sweepFast.probabilities },
  { name: 'Sweep, balanced (default)', tree: sweep.tree, layout: sweep.layout, probs: sweep.probabilities },
];

function run(targetIds: string[], seed: number) {
  return variants.map((v) => {
    const r = rng(seed);
    const results: TrialResult[] = targetIds.map((id) =>
      runTrial(v.tree, v.layout.findIndex((x) => x.id === id), DEFAULT_USER, trialOpts, r),
    );
    return { v, s: summarize(results), e: expectedCost(v.tree, v.probs, costs) };
  });
}

const fmt = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
function table(title: string, rows: ReturnType<typeof run>) {
  console.log(`\n${title}`);
  console.log('variant'.padEnd(46), 'mean'.padStart(8), 'median'.padStart(8), 'presses'.padStart(8), 'wrong/task'.padStart(11), 'done'.padStart(8), 'model E[t]'.padStart(11));
  for (const { v, s, e } of rows) {
    console.log(
      v.name.padEnd(46),
      fmt(s.meanMs).padStart(8),
      fmt(s.medianMs).padStart(8),
      s.meanPresses.toFixed(2).padStart(8),
      s.wrongSelectionsPerTask.toFixed(3).padStart(11),
      `${s.completed}/${s.trials}`.padStart(8),
      fmt(e.ms).padStart(11),
    );
  }
}

const pick = rng(SEED * 7919);
const fromHistory = Array.from({ length: TRIALS }, () => DEMO_INTENTS[sample(base.probabilities, pick)]!.id);
const uniform = Array.from({ length: TRIALS }, () => DEMO_INTENTS[Math.floor(pick() * DEMO_INTENTS.length)]!.id);

console.log(`Sweep simulation · ${DEMO_INTENTS.length} intents · ${TRIALS} tasks/condition · scan ${INTERVAL} ms · seed ${SEED}`);
console.log(`Synthetic user: reaction ${DEFAULT_USER.reactionMeanMs}±${DEFAULT_USER.reactionSdMs} ms, miss ${DEFAULT_USER.missRate * 100}%, false press ${DEFAULT_USER.falsePressRate * 100}%`);
table('A) Targets drawn from the user’s own history (prediction is right on average)', run(fromHistory, SEED));
table('B) Targets uniformly random (prediction is no help — worst case for Sweep)', run(uniform, SEED));

// C) Auto-calibration: does fitting the scan speed to the person help? (synthetic users)
import { TimingModel, normal, type SyntheticUser } from '../src/index';
const users: Array<[string, SyntheticUser]> = [
  ['typical (650±150 ms)', DEFAULT_USER],
  ['slow (1100±300 ms, 8% miss)', { reactionMeanMs: 1100, reactionSdMs: 300, missRate: 0.08, falsePressRate: 0.02 }],
  ['fast (420±80 ms)', { reactionMeanMs: 420, reactionSdMs: 80, missRate: 0.03, falsePressRate: 0.02 }],
];
console.log('\nC) Fixed 1.2 s scan vs auto-calibrated scan (10 calibration presses), Sweep balanced, history targets');
console.log('user'.padEnd(32), 'interval'.padStart(9), 'mean'.padStart(8), 'presses'.padStart(8), 'wrong/task'.padStart(11), 'done'.padStart(8));
for (const [name, u] of users) {
  const cal = new TimingModel();
  const rc = rng(SEED * 31);
  for (let i = 0; i < 10; i++) cal.add(Math.max(150, normal(rc, u.reactionMeanMs, u.reactionSdMs)));
  for (const [label, interval, press] of [
    ['fixed', 1200, DEFAULT_USER.reactionMeanMs],
    ['auto', cal.recommendedIntervalMs(1200), cal.recommendedPressMs(650)],
  ] as Array<[string, number, number]>) {
    const scr = planSweepScreen(DEMO_INTENTS, model, { pressMs: press, waitMs: interval }, now);
    const r = rng(SEED);
    const res = fromHistory.map((id) =>
      runTrial(scr.tree, scr.layout.findIndex((x) => x.id === id), u, { intervalMs: interval, maxCycles: 2, timeoutMs: 180_000 }, r),
    );
    const s = summarize(res);
    console.log(`${name} · ${label}`.padEnd(32), fmt(interval).padStart(9), fmt(s.meanMs).padStart(8), s.meanPresses.toFixed(2).padStart(8), s.wrongSelectionsPerTask.toFixed(3).padStart(11), `${s.completed}/${s.trials}`.padStart(8));
  }
}
