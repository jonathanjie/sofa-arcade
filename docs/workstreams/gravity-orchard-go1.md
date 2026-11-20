# GO1 — Gravity Orchard simulation and authored stages

## Scope and source

- Repository: `jonathanjie/sofa-arcade`.
- Branch: `feature/gravity-orchard-engine`.
- Fetched `main` baseline: **`6c6eb9343958da591b4488366c2ada4000e3ba08`** (the merged v0.2 dispatch pack).
- Implementation ownership: `games/gravity-orchard/**`, `.github/workflows/go1-engine.yml`, and this report only.
- Existing checkouts and branches were preserved. No registry/catalog enabling, shared server/native wiring, generated delivery, deployment, or self-merge is included.
- The exact reviewed/tested head is pinned in the PR and its associated CI runs. This report does not attempt a self-referential commit hash.

**Handoff status: GO1 component ready for review.** The complete engine, all three authored stages, public interface, recovery validation, inventory proof, actual-input route proofs and playable diagnostic harness are implemented. The first submitted engine tree passed all four owned CI jobs, including the real Chromium harness, and its rendered captures were inspected at 720p and 1080p. The PR pins the final tested head and final CI results, including the diagnostic corrections described below. GO7 owns production wiring and hardware acceptance; this PR does not enable the game.

## Delivered behavior

The component implements the complete three-stage campaign and untimed practice. Both authenticated seats become ready, a 180-tick countdown starts, and only playing consumes the 5,400-tick campaign budget. Stage success or timeout produces results; untimed interludes wait for both players. Stage-three results finish the run. Pause, resume/countdown, stage advancement, retry and checkpoint restoration fence earlier input through `runEpoch` and clear both control latches and readiness.

Every stage has six shuffled four-fruit bags: six of each type against three of each type demanded by the four recipes. A bag has two local deliveries and one crossing in each direction. Spawn zero occurs on the transition from countdown to playing, at elapsed active tick zero. Subsequent arrivals are 210 active ticks apart. Eight active fruit saturate the world; the next entry remains queued until a slot exists, then schedules the following arrival from that actual spawn time. There is no catch-up burst.

Correct basket contacts capture once into capacity-three buffers. Wrong/full baskets bounce without consuming the fruit. A valid catch resolves at most four already-satisfied recipes in order, consuming distinct ingredient IDs and emitting exactly one reward event per recipe. Compost uses the fruit **center entering the authored opening**, rather than any decorative shadow or a tiny overhang. Active and buffered leftovers at stage end are accounted separately from unspawned and composted fruit.

The four basket assignments are fixed: apple/plum for Jon, pear/starfruit for Lydia. The stages are:

| Stage | Authored mechanics |
| --- | --- |
| Morning Delivery | Broad tray routes, soft circular bumpers, a 200 × 250 bridge, no compost or gusts. |
| Switchback Grove | Rectangular hedges, a longer safe route and an upper shortcut beside marked compost, a 200 × 180 bridge and one gate. The gate schedules six seconds open/three closed and forecasts two seconds before closure. |
| Lala's Moonlight Picnic | Circular/rectangular terrain, clear compost openings, a safe bridge route and seeded cardinal gust rotation. Forecasts at active 19.5/42/64.5 seconds; gusts at 22.5/45/67.5 seconds for 1.5 seconds each. |

A closing gate stays in `forecast` with `ticksToChange: 0` and `closureDeferred: true` while any fruit touches its collision rectangle. It can close on a later tick after that region clears; it never pushes a fruit aside to satisfy the schedule.

Stars are 0 / 1 / 1 / 2 / 3 for 0 / 1 / 2 / 3 / 4 completed orders. The public summary awards Perfect Picnic only to a complete campaign with twelve orders and zero compost. Practice uses the same physics/supply/recipes, has no deadline or gusts, and is explicitly ineligible for normal-run records.

## Exact authority interface

`games/gravity-orchard/engine.mjs` exports the eight contracted functions:

```js
createRun({ seed, matchId, options = { mode: 'campaign' } })
normalizeInput(raw)
step(state, { jon, lydia })
applyCommand(state, actor, command)
pauseForSystem(state, reason)
project(state, viewer)
serializeCheckpoint(state)
restoreCheckpoint(checkpoint)
```

Additional authority-only exports are `GAME_ID`, `ENGINE_VERSION`, `CHECKPOINT_VERSION`, `PLAYER_IDS`, `SAFE_INPUT`, `EngineError`, and `conservationReport(state)`. They are not a second network protocol.

- Engine/rules version: `0.2.0`; public schema: `1`; checkpoint schema: `1`; tuning version: `go1-1`.
- Seed and match ID are nonempty strings of at most 128 characters, without control characters. The host allocates the match ID. The constructor rejects unknown options/fields.
- `normalizeInput` accepts exactly `{x,y,brake}` with finite numeric axes in `[-1,1]` and a boolean Brake. It unit-limits diagonals, then rounds to 1/10000. Unknown fields, accessors, missing values and nonfinite/out-of-range values return `null`.
- `step` advances one fixed tick only in `countdown`/`playing`. Invalid/missing seat controls become neutral+Brake. It never consumes a client delta, position, score or wall clock.
- `actor`/`viewer` must be a trusted `{role,playerId}` object: host/public with `null`, or player with `jon`/`lydia`. Public actors cannot command; hosts cannot ready a seat.
- `applyCommand` accepts the trusted `{kind,payload}` seam, or the full validated command envelope. Supplied `matchId` and `runEpoch` must be supplied together and match; optional `type`, `protocol`, and bounded `id` are validated. Unknown keys and player IDs inside payloads are rejected. GO2 must authenticate the actor and validate/fence/replay wire commands before using this seam.
- Required commands are `ready`, `pause`, `retry-stage`. A valid host `rematch` request returns unchanged state with `COORDINATOR_REQUIRED`; GO2 must allocate a fresh match identity and call `createRun`, including for same-seed rematches.
- Stable refusal codes: `FORBIDDEN`, `INVALID_COMMAND`, `INVALID_PHASE`, `STALE_MATCH`, `STALE_EPOCH`, `COORDINATOR_REQUIRED`. Constructors/checkpoints use typed errors for malformed trusted data. Counter exhaustion fails before unsafe integer overflow.
- `pauseForSystem` accepts only `network`, `host-stall`, or `recovery`. These reasons cannot be forged through the wire `pause` command. Non-recovery system pauses are no-ops outside active/countdown phases.

All transitions are nonmutating. No-op transitions may retain identity. Projection is detached and equivalent for all three supported roles because this game is cooperative; it still excludes seed, future supply, random authoring state, consumption ledgers, diagnostics and private checkpoints.

## Identity, conservation and recovery

Fruit/recipe IDs include match, stage and attempt identity. A retry regenerates identical type/order/spawn-side/recipe/gust choices from independent seeded streams, while allocating new attempt identities. Event IDs are monotonically allocated as `matchId:eN`, retained in a maximum-64 ring and never reused on stage retry. Projection does not generate events.

`conservationReport` returns current-attempt ID arrays for `unspawned`, `active`, `buffered`, `consumedInOrders`, `composted`, and `remainingAtEnd`. Every current-stage supply ID occurs exactly once. Earlier retained stages have archived conservation ledgers. A host retry explicitly discards the latest result and that attempt's ledger; the replacement attempt has disjoint IDs. Thus the accounting universe is the current run's retained attempts, not an unbounded audit history of deliberately discarded retries. Old events remain identifiable in the bounded ring. No persistent database or currency is invented.

The checkpoint is finite JSON with game/schema/engine versions, a state snapshot and an FNV checksum. **The checksum detects accidental corruption; it is not authentication.** Only trusted host storage may supply a checkpoint. Validation also checks authored supply/recipes against seed/attempt, ID conservation, recipe ingredients, finite bounded physics, clear terrain/closed-gate placement, lifecycle/results/archive consistency, scheduled hazards, public-view safety, event ordering and integer headroom. Unknown versions and malformed checkpoints are rejected rather than guessed or silently migrated.

Restoration always produces a new paused state, increases the epoch, neutralizes both seats and requires new readiness/countdown. It does not replay elapsed wall time. Recovery from an interlude preserves the completed result and advances to the next stage after both ready. Recovery from finished remains a recovered result: both ready run a countdown back to `finished`, never restart its physics or duplicate rewards; host rematch remains available while paused.

GO2 must serialize/coalesce checkpoint writes, initially at most once per five seconds, and durably save every epoch-changing boundary before publishing/acknowledging it. Do not continue gameplay through a failed boundary save. The last successful checkpoint is the recovery boundary; up to its unsaved interval can be rolled back. GO2 owns controller epochs, sequence/observed-tick freshness, the 250 ms neutral+Brake fallback, two-second loss pause, and bounded host catch-up/stall detection. None of those network claims are inferred from the pure engine tests.

## Public/runtime inventory for GO7

`games/gravity-orchard/runtime-files.json` is the explicit component inventory. Runtime dependencies: **none**.

| Delivery | Files |
| --- | --- |
| Browser-safe production closure | `catalog.mjs`, `geometry.mjs`, `public.mjs` |
| Additional host authority files | `engine.mjs`, `physics.mjs`, `supply.mjs` |
| Diagnostic/development only; exclude from production | `fixtures/`, `tests/`, `checks/`, `validation/`, `harness/`, generated `.evidence/` and dependency installs |

Public exports:

- `catalog.mjs`: frozen `FRUIT_TYPES`, `FRUIT_IDS`, `STAGES`, `RULES`, `SAFE_INPUT`, `PLAYER_IDS`, `PHASES`, `EVENT_KINDS`, and `deepFreeze`.
- `geometry.mjs`: frozen `LEVELS` object keyed by the three IDs and `getLevel(id)`; exact contracted geometry fields plus additive `spawnPoints`.
- `public.mjs`: `validatePublicView`, `isPublicView`, `assertPublicView`, `bridgeWeights`, `forceAt`, `recipePreview`, `summarizeResults`, `secondsRemaining`.
- Diagnostic fixtures: `PROJECTED_FIXTURES`, `FIXTURE_NAMES`, `getProjectedFixture` in the separately excluded fixture module.

GO7 should serve/package only the named browser closure and keep authority on the host. The debug server deliberately exposes authority **only on its loopback development listener**, to run an isolated simulation. It is not a production route or an authentication adapter.

## Physics and tuning hypotheses

`RULES.tuning` is the versioned source of all tuning. Physics and the public force display share `forceAt`; the harness does not invent an easier force model.

| Quantity | Value |
| --- | --- |
| Ordinary acceleration | 520 world units/s² |
| Ordinary linear damping coefficient | 1.35/s |
| Brake damping coefficient | 12/s |
| Restitution | 0.35 |
| Fruit radius | 14 world units |
| Maximum speed | 220 world units/s; guarded again after rounding |
| Substeps/contact passes | 3 per tick / at most 4 passes per substep |
| Gust acceleration | 260 world units/s² |
| Gust fraction under full Brake | 0.15 |
| Rejected-fruit minimum outward speed | 45 world units/s |
| Basket separation margin | 0.001 world units |
| Repeated rejection cue interval | 30 active ticks |

Velocity integrates with fixed `dt = 1/(60×3)` and damping factor `1/(1 + damping×dt)`. Bridge ownership uses a clamped smoothstep across the bridge's horizontal extent; it blends ordinary forces, Brake damping and gust suppression. Brake removes ordinary tilt without teleportation or collision immunity.

Terrain is the exterior of the **union** of both trays and the bridge, plus authored circle/rect bumpers and closed gates. Collider/entity ordering uses deterministic code-unit comparisons. Maximum substep displacement is 1.2223 units, well below the 14-unit radius; tests include a 0.001-unit-thick wall. Fixed contact limits and bounded fallback prevent a collision search loop. A legal contact failure stops at the last clear position; explicitly invalid private overlap fixtures have a separate bounded diagnostic fallback. Restored live states must pass clear-placement validation first.

These values are hypotheses. A feedback controller completing a stage proves a route exists; it does not establish comfortable phone control or balanced human difficulty.

## Executable verification and graphical harness

```sh
# All component suites, including normalized-input route completion
node --test games/gravity-orchard/tests/*.test.mjs
node games/gravity-orchard/tests/generate-fixtures.mjs --check

# Exhaustive inventory and replayable route evidence
node games/gravity-orchard/checks/inventory.mjs --out /tmp/go1-inventory.json
node games/gravity-orchard/validation/run-routes.mjs --output=/tmp/go1-routes
node games/gravity-orchard/checks/benchmark.mjs --out /tmp/go1-benchmark.json

# Play the real diagnostic simulation
node games/gravity-orchard/harness/server.mjs

# Locked browser check; no root dependency edits
npm ci --prefix games/gravity-orchard/harness
node games/gravity-orchard/harness/node_modules/playwright/cli.js install --with-deps chromium
GO1_BROWSER_EVIDENCE=/tmp/go1-browser node games/gravity-orchard/harness/browser-check.mjs
```

The harness provides manual Jon WASD/Space Brake and Lydia arrows/Shift Brake, readiness, pause, Help, completed-stage retry, seed/mode selection and a public-view-only route demonstration. It shows actual geometry, fruit IDs, velocity/force vectors, collision contacts/normals, bridge weights, basket buffers, recipes, ticks and collision work. It fits 1280×720 and 1920×1080 through a uniformly scaled world. It is diagnostic code-native art, not GO5's final media.

Public fixtures are generated by real engine commands/steps: all six lifecycle phases, both trays, gate forecast/closed, gust forecast/active, recovered pause, retry waiting and practice. Contact unit tests use explicitly private initial conditions to isolate wrong/full basket, overlap and recipe-chain behavior. **All route and campaign completion proofs begin at `createRun` and use actual normalized inputs; they never reposition fruit or bypass collisions.**

### Test and route results

- **58 GO1 tests pass**, covering engine/lifecycle, physics, public geometry/fixtures, seeded supply, actual-input playability and independent authority/recovery review. Owned CI repeats them on Node 22 and Node 24.
- Eight published seeds `orchard-proof-1` through `orchard-proof-8`: all complete 12/12 recipes and 9/9 stars. Seven produce zero compost; one uses replacement supply after one compost. Authored stage times range approximately 39.65–51.83 active seconds.
- Full normalized-control coverage of **24 delivery cases**: every basket × local/opposite-tray origin × three stages. Each complete transcript replays to an identical authoritative checkpoint SHA-256.
- **331,776/331,776** immediate-delivery inventory combinations pass; maximum per-type buffer is three. All 96 bag layouts and the six-of-each versus three-of-each counts are checked. A 128-seed/three-stage authoring sweep sees all 96 layouts, all 24 permutations for stages two/three and all four gust rotations.
- Ideal spawn arithmetic: fruit twelve at 38.5 seconds, fruit twenty-four at 80.5 seconds. At least one departure is needed by spawn nine and four by spawn twelve to avoid the active-fruit cap.
- Physics sweep: **43,200** calls over eight fruits on all authored levels with sustained controls and real terrain contacts; zero fallbacks, finite coordinates/speeds and bounded work.
- Thirteen canonical projected fixture JSON files and their browser fixture index are byte-checked.
- Existing repository `npm test`: **81 passing tests** in the local Node 24 runtime, including the existing real HTTP/SQLite room/transport checks.
- Existing Odd Laws Society suite: **95 passing tests**. The production framework build passes without a catalog, registry or shared generated-source change. The owned collection-regression-build CI job repeats all three checks.

### Performance method and initial local measurement

Node `v24.22.3`, Linux x64, Intel Xeon Platinum 8370C @ 2.80 GHz. For each authored stage the benchmark creates normal game state, reaches eight fruit, warms up 200 steering ticks, then measures 1,000 full engine ticks with exactly eight active fruit. All 3,000 measured ticks contact terrain; no fallback occurred. It includes state copies, spawning, collisions, recipes and events; projection is timed separately.

Observed full-tick medians were approximately **0.215 / 0.246 / 0.307 ms** for the three stages, p95 **0.451 / 0.513 / 0.559 ms**, with a 4.22 ms worst observed sample. These are executor CPU observations against a 16.67 ms tick budget, not Mac, browser rendering, Wi-Fi, sensor or casting measurements. CI preserves its own hardware/runtime report; no flaky machine-speed threshold is used as a correctness gate.

### Owned CI and inspected graphical evidence

`.github/workflows/go1-engine.yml` runs the component suites, fixture consistency, exhaustive inventory, route transcripts and eight-fruit benchmark on Node 22 and 24. Separate jobs exercise the actual Chromium harness at 720p/1080p and run the existing games' suites plus a production framework build. Browser development dependency is exactly Playwright 1.62.1 in the nested locked harness package; it is not a production dependency.

The workflow preserves engine summaries, compressed actual-input transcripts/public paths, benchmark records, screenshots and the browser assertion report for 30 days. Artifact uploads explicitly include the scoped hidden `.evidence` directory and fail when no files exist. This repairs the initial successful engine jobs' upload warnings: the browser evidence uploaded, but the engine evidence directory was skipped by the artifact action's default hidden-file filter.

The first submitted head, `8e0c952df44454968619f5b3f1e4f52630c643a2`, passed [owned CI run 44777707252](https://github.com/jonathanjie/sofa-arcade/actions/runs/44777707252): engine Node 22.23.5, engine Node 24.22.3, graphical-harness and collection-regression-build. The browser was Chromium 151.0.7922.34 with Playwright 1.62.1. Nine screenshots cover waiting, a manual keyboard basket catch, Morning Delivery, Switchback Grove, Moonlight forecast at both resolutions, active gust, Perfect Picnic results and untimed practice. Both viewport checks have no document overflow, and the browser report has no console/page errors.

Visual review checked the authored open bridge connections and collision outlines, actual fruit/catch cues and buffers, force arrows/bridge weights, hazard labels, controls and the complete 12-order/9-star result against the browser's authoritative outcome. The rendered campaign finishes at active ticks 2,488 / 2,480 / 2,379, exactly matching the independent Node route for that seed. Review found the diagnostic mode selector retained its old value after a programmatic practice reset; the selector now follows the live run and the browser test asserts it. Pale terrain IDs were hard to read where they extended onto pale trays; they now sit on dark labels above the obstacle, leaving its collision outline visible. The result panel also uses the public summary helper so practice cannot be labeled Perfect Picnic.

Local Chromium could not launch in the delegated execution sandbox; an escalation was rejected by automatic approval review. All claimed graphical execution and inspected images come from the owned GitHub CI job using ordinary Playwright Chromium. No browser security bypass was used.

Physical iOS/Android sensors, trust onboarding, home Wi-Fi, casting, audio, Tauri/macOS packaging and human balance remain GO7/hardware acceptance, not GO1 claims. The automatic feedback pilot establishes reachability and deterministic completion, not comfortable human difficulty. There are no additional GO1 production dependencies; GO2 must provide the trusted transport/checkpoint boundaries above, and GO7 must package the declared authority/public closures and wire the other components before enabling the collection entry.
