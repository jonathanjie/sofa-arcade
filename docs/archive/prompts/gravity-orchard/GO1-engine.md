> Historical record. This assignment ended on 21 November 2026 at `e0504c1`.

# GO1 — Gravity Orchard engine and authored stages

You are implementing GO1, the deterministic rules/physics engine and three authored stages for **Gravity Orchard v0.2** in Sofa Arcade. This is a sustained implementation assignment: finish the owned component, create a usable graphical test harness, run meaningful tests, fix defects, and open a GitHub PR.

**Repository:** https://github.com/jonathanjie/sofa-arcade

## Context and baseline

Jon and Lydia play one collection on a local Tauri Mac/TV, with two ordinary phone browsers on the LAN. Sofa Kingdoms and Odd Laws Society already exist and must continue to work. The next game is real-time cooperation: each player tilts their own floating garden tray, passes fruit across a bridge and fills shared picnic orders. A large held Brake button steadies fruit. Touch mode must be equally playable.

**Use v0.2.** The older turn-based 5×5 Gravity Orchard draft is archived and is not the implementation brief. The starting run has three 90-second stages, four three-fruit recipes per stage, four basket/fruit types, seeded balanced supply, at most eight active fruit, 60 Hz fixed simulation and 20 Hz input/snapshot starting rates. These are design hypotheses, not proved human balance or measured Wi-Fi performance.

Read `AGENTS.md`, `README.md`, `docs/GITHUB_WORKFLOW.md`, `docs/GRAVITY_ORCHARD_CONTRACT.md`, `docs/archive/DISPATCH_GRAVITY_ORCHARD.md` and `docs/games/gravity-orchard.md`, then inspect current engine/registry/fixture conventions. The new Gravity dispatch ownership supersedes the older broader game ownership rules for this assignment. The contract owns exact APIs and schemas; do not silently invent competing ones.

Fetch current GitHub state and inspect existing branches/PRs. Use an isolated clone/worktree and `feature/gravity-orchard-engine`. Record the exact base SHA. Start from current `main` containing the dispatch packet; if it is still on a reviewed packet branch, identify that exact commit with Git history and record the deliberate baseline. Do not guess from the archived v0.1 document, overwrite another session's work or force-push a moving branch.

## Exclusive write ownership

- `games/gravity-orchard/**`
- `.github/workflows/go1-engine.yml`
- `docs/archive/workstreams/gravity-orchard-go1.md`

Own nested test-tool manifests/locks only inside the game subtree. Do not edit root package files, shared registry/catalog, room/server APIs, shared shell, media assets, other component workflows, desktop files, generated `public/` copies or global handoff documents. GO7 owns shared wiring and final delivery. Request needed interfaces in your report instead of crossing ownership boundaries.

Up to three subagents may help if available. Assign exclusive internal files before they edit; a useful split is engine/physics, authored stages/public fixtures, and independent validation. You retain responsibility for reconciling and testing their work.

## Build the complete component

1. Implement the exact contract in `engine.mjs`: `createRun`, `normalizeInput`, `step`, `applyCommand`, `pauseForSystem`, `project`, `serializeCheckpoint` and `restoreCheckpoint`. `step` returns a new state; `applyCommand` returns `{accepted, state, code?}`; `normalizeInput` returns `{x, y, brake}` or `null`, while GO2 validates the authenticated wire envelope. Normalization rejects malformed/nonfinite/out-of-range values, limits the vector to the unit circle and rounds as contracted. `pauseForSystem(state, reason)` returns a new state and is restricted to trusted network/host-stall/recovery reasons; it is not a client wire command. Export browser-safe data/helpers through `catalog.mjs`, `geometry.mjs` and `public.mjs`. Keep authority and authoring/testing modules out of the declared browser closure.
2. Implement the full recipe/basket/spawn/run rules from v0.2, not one isolated movement demo. Stable fruit, recipe and event identities must survive snapshots and checkpoint restoration. A new match identity fences a same-seed rematch.
3. Implement the left/right tray force fields and smooth bridge blending, Brake, bounded circle/terrain collisions, correct/wrong/full baskets, compost, gate closure deferral and forecast Lala gusts. General pile physics and fruit-to-fruit collisions are outside v1.
4. Author all three complete stages: Morning Delivery, Switchback Grove and Lala's Moonlight Picnic. Publish geometry/feature metadata that a renderer can consume; never derive collisions from artwork pixels.
5. Define and version exact tuning values: acceleration, damping, restitution, radius, collision iteration/substep bounds and hazard coefficients. Retain the contract's 220-unit speed cap and 1/10000 position/velocity/input rounding; do not tune those independently. Keep randomness seeded and event/entity ordering stable. No wall clock, variable client delta or `Math.random()` in pure engine logic.
6. Implement standard run, timeout, success, stars/Perfect Picnic, practice without deadline/gust, completed-stage retry, pause/countdown and safe restored-paused behavior. GO2 owns whole-run rematch allocation through `createRun`, not an additional engine command that invents match IDs. Implement player/host command authority and the exact `waiting/countdown/playing/paused/interlude/finished` lifecycle, including readiness, epoch resets and monotonic ticks. Document checkpoint assumptions the transport must satisfy; do not invent a database inside the engine.
7. Produce safe projected fixtures for both tray positions and every contracted public lifecycle state. Keep calibration/permission states in GO3 and connection presence in GO2's envelope. Fixtures must contain no tokens, private keys, socket internals or full future supply/RNG state. Publish `LEVELS`/`getLevel`, `FRUIT_TYPES`/`STAGES`/`RULES` and exact geometry/event shapes from the contract rather than renderer-specific schemas.
8. Create a working owned browser debug harness using canvas/SVG/code-native graphics drawn from the real geometry and engine. It should show fruit IDs, force regions, collisions, baskets, recipe buffers, tick counters and playable keyboard controls. This is diagnostic art, not a competing final asset pack. The harness is not shipped in the game runtime.

The continuous wire frame includes `type: 'input'`, match/run/controller epochs, a sequence number, the last observed host tick, finite normalized `x`/`y` values and `brake`; use the exact contract rather than copying an old turn-action shape. The host supplies authenticated actors and latest accepted controls. Network buffering, sensor permissions and TLS are owned by other streams.

## Test, inspect and repair

Use hand-checked fixtures plus a bounded seeded sweep. Establish determinism/replay, complete fruit conservation, exactly-once recipe rewards, finite physics and bounded collision work. Cover corners, thin walls, bridge transitions, wrong/full baskets, spawn saturation, recipe chains, overlapping gate closure, compost edges, max speed and all three hazard schedules. Verify the four crossing assignments and 24 permutations per bag, six-of-each supply against three-of-each demand, and the ideal first-12/last-24 spawn times of 38.5/80.5 seconds. Keep the PRD's inventory check reproducible. Then show every basket is reachable and a complete stage can be solved by real normalized input on authored geometry, without teleporting fruit or bypassing collisions; pure inventory arithmetic alone does not establish playability.

Exercise a full three-stage run through both success and timeout, pause/countdown time conservation, deterministic completed-stage retry, coordinator-style fresh-match construction and recovery from serialized state. Verify trusted-system pause reasons, refusal of client-forged system commands, player/host/public authority, stale epoch boundaries, projection safety, stable unique event IDs and the bounded event ring. Verify malformed/nonfinite/unknown input rejection and immutability where the contract requires it. Check public helpers/fixtures without exposing authority modules.

Run the actual graphical harness and inspect screenshots at 720p and 1080p. Confirm its visible paths and captures agree with authoritative outcomes; do not treat screenshots merely existing as visual review. Measure performance under the stated eight-fruit bound and report the runtime/hardware/method. Do not label a Node or browser fixture result as physical-phone latency or human balance.

Your owned CI must actually execute the new engine and fixture checks on the supported Node versions and retain useful evidence. The repository's legacy `npm test` alone does not discover new game tests. Keep CI dependencies locked and scoped. Run the relevant baseline/build checks required by `AGENTS.md`; leave shared generated outputs uncommitted.

## Completion and GitHub handoff

Continue through implementation, graphical inspection, tests, repairs and a tested commit; do not stop at a plan, scaffold or first stage. Work against contract fixtures so unfinished components do not block useful progress. Integrate no moving owner branch into your component.

Write `docs/archive/workstreams/gravity-orchard-go1.md` with scope/base SHA, exact exports and schema versions, public/runtime file list, tuning decisions, tests/results/evidence, dependency requests, known limits and a clear ready-or-blocked handoff status. Never invent a physical test or successful build.

Commit only owned files, push your branch and open a PR to GitHub `main` titled **GO1: Gravity Orchard engine and stages**. In the PR, explain the complete behavior, what was tested at the exact submitted commit, what GO7 must wire, and any remaining gate. Do not merge `main`, enable the collection card, publish a Site/Pages release or claim a completed native release. End by returning the PR URL, tested commit, results and limitations.
