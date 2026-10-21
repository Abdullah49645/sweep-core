# sweep-core

Predictive one-switch scanning for TV interfaces. Fire TV has no Switch Access; `sweep-core` is the engine behind **Sweep**, a Fire TV app that lets someone who can only press one switch reach what they want to watch faster than row/column scanning.

It is pure TypeScript with no dependencies and no I/O, so any React Native, Vega or web TV app can use it.

## How it works

1. **Intent model.** Every on-screen choice (resume, next episode, a title, a genre, captions, back) gets a probability from recency-decayed choice counts, optional app boosts ("you finished episode 2 yesterday") and smoothing. Every score can be explained.
2. **Layout.** Choices are drawn in probability order, so highlighted groups are always contiguous blocks on screen.
3. **Optimal scan tree.** A dynamic program builds the contiguous binary scan tree with the lowest expected selection time. Pressing and waiting have different costs, and a single item is always selected by a press, never by a timeout.

   ```
   F(i,i) = W(i,i)·press
   F(i,j) = min_k [ W(i,k)·press + (i<k ? F(i,k) : 0) + W(k+1,j)·wait + F(k+1,j) ]
   ```

   Here `W` is summed probability. Expected time is `F(0,n-1)/W(0,n-1)`, and the solve is O(n³).
4. **Scheduler.** An explicit state machine turns timed highlights and switch presses into a walk down the tree. After unanswered cycles it backs out to the root, so a missed highlight is cheap to recover from.
5. **Auto-calibration (`TimingModel`).** Learns the person's reaction times (from a 40-second check or from normal use) and sets the scan interval to the slow end of their reactions (p90 × 1.3, clamped 0.6–3.0 s). The same numbers feed the tree builder.
6. **Two-switch step mode.** `autoAdvance: false` plus `step()`. The planner treats each move as a press instead of a wait, so the tree reshapes itself for the input method.
7. **Press penalty.** `pressPenaltyMs` trades speed against the number of presses, which matters because presses cause fatigue for switch users. The balanced default is 1000 ms.

Baseline and Sweep costs come from the same `pathCosts` / `expectedCost` code.

## Use

```ts
import { IntentModel, planSweepScreen, ScanScheduler } from 'sweep-core';

const model = new IntentModel({}, savedHistory);
const screen = planSweepScreen(intents, model, { pressMs: 650, waitMs: 1200 }, Date.now());
const scheduler = new ScanScheduler(screen.tree, { intervalMs: 1200, maxCycles: 2 });

scheduler.start(Date.now());
// On your clock:   scheduler.tick(now)  → highlight events (draw screen.layout[i] for i in event.leaves)
// On the switch:   scheduler.press(now) → may emit { type: 'select', index }
// On select:       model.record(screen.layout[index].id, now), then re-plan the screen
```

## Simulation results (synthetic, not real users)

`npm run bench` runs 500 tasks per condition on the 39-item demo home screen used by the Fire TV app, laid out in an 8-column grid. The scan interval is 1.2 s. The synthetic user has a reaction time of 650±150 ms, misses 5% of highlights and false-presses on 2%. The viewing history is seeded test data.

Seed 1, targets drawn from the user's own history:

| Variant | Mean time | Median | Presses | Wrong selections / task |
| --- | --- | --- | --- | --- |
| Row/column, catalogue order | 10.3 s | 8.5 s | 2.68 | 0.328 |
| Row/column, predicted order | 8.0 s | 6.3 s | 2.60 | 0.294 |
| Sweep, fastest | 6.0 s | 4.9 s | 3.28 | 0.054 |
| **Sweep, balanced (default)** | **6.9 s** | **5.6 s** | **2.57** | **0.150** |

Across seeds 1–3, balanced Sweep takes 28–33% less time than catalogue-order row/column, with slightly fewer presses and about half the wrong selections. With uniformly random targets, where prediction cannot help, the optimal tree alone is still faster (9.2 s vs 11.2 s). Full output is in `bench/results-seed1.txt`.

Auto-calibration (section C of the benchmark, 10 calibration presses per synthetic user, Sweep balanced):

| Synthetic user | Fixed 1.2 s scan | Auto-calibrated scan |
| --- | --- | --- |
| Typical, 650±150 ms | 6.9 s per task | 6.8 s (1.0 s scan) |
| Slow, 1100±300 ms, 8% miss | 30.4 s, 0.42 wrong/task | 11.9 s, 0.18 wrong/task (1.8 s scan) |
| Fast, 420±80 ms | 5.9 s | 3.7 s (0.6 s scan) |

A fixed speed is wrong for most people; fitting it to the person matters most for slow reactors.

These are model outputs. Real-user numbers will be measured separately and reported only if measured.

## Develop

```
npm install
npm test        # 38 tests: DP vs brute force (n ≤ 8), scheduler, step mode, timing, model, simulation
npm run bench
npm run build
```

## Licence

MIT © Abdullah49645. Demo titles are public-domain or Creative Commons films.
