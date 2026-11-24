# Input-driven route and replay proof

Run the deterministic software proof from the repository root:

```sh
npm run test:exhaustive -- gravity-orchard
node games/gravity-orchard/validation/run-routes.mjs --output=/tmp/gravity-orchard-route-evidence
```

`pilot.mjs` imports only public catalog and geometry. `createPilot().update(view)` receives a public view and returns `{jon, lydia}` normalized controls. It uses a bounded grid route planner plus velocity feedback. It may plan around obstacles, hold Brake while a gate closes, or cooperate across the bridge; it cannot inspect the private supply, edit authoritative state, or force an outcome. Target selection is based only on currently visible fruit, recipe needs, and buffer capacity.

`run-routes.mjs` constructs real seeded matches, sends each seat's readiness commands, then passes pilot inputs into one fixed engine tick at a time. It records every event, correlates captures to preceding spawns, checks finite motion/the strict 220 speed cap/the eight-fruit bound, and emits a replayable transcript. Every output in the eight-seed suite is replayed without planning; the complete serialized final state must have the same SHA-256. No route proof begins from inserted or repositioned fruit.

The published seeds are `orchard-proof-1` through `orchard-proof-8`. Together they cover all **24 combinations** of stage × basket type × local/crossing origin. Every crossing capture must have an authoritative transfer event. All eight campaigns complete twelve orders. Seven have no compost; the fourth seed loses one fruit through an actual compost opening and still completes using the seeded replacement supply.

| Seed suffix | Morning Delivery ticks | Switchback Grove ticks | Moonlight Picnic ticks | Composted |
| --- | ---: | ---: | ---: | ---: |
| 1 | 2488 | 2480 | 2379 | 0 |
| 2 | 2379 | 3042 | 2508 | 0 |
| 3 | 2379 | 2506 | 2379 | 0 |
| 4 | 2488 | 3110 | 2379 | 1 |
| 5 | 2379 | 2561 | 2379 | 0 |
| 6 | 2379 | 2394 | 2508 | 0 |
| 7 | 2488 | 2954 | 2508 | 0 |
| 8 | 2488 | 2623 | 2379 | 0 |

These observed initial values are regression evidence for tuning version `go1-1`, not a promise that every seed or two human players solve at these times. Divide ticks by 60 for active seconds; countdowns are excluded. The separate safe-input transcript runs all three full 90-second timeouts and reaches the ordinary final screen with zero orders.

The evidence writer produces:

- `route-summary.json`: seeds, stage results, all 24 route combinations, measured bounds, and state/transcript hashes.
- `campaign-transcript.json.gz`: the first run's constructor, readiness commands, and run-length encoded control transcript.
- `campaign-public-paths.json.gz`: public event/capture history and sampled trajectories for checking the rendered route against actual outcomes.

Exported helpers are for tests/authoring only: `driveCampaign`, `replayTranscript`, `writeRouteEvidence`, and `PROOF_SEEDS`. Never add this directory or the harness to production browser/runtime allowlists. Inventory arithmetic and route completion are separate proofs; neither substitutes for integrated controller acceptance or a human balance study.
