# Sofa Arcade test timings

Measured on the same arm64 Mac with Node 24.22.3. Times are elapsed seconds and include OS scheduling delays. The machine also ran unrelated work during measurement.

## Default suite

The original three runs at `0560ca7` took 1133.39, 1138.79, and 1133.12 seconds. Each had 582 passes and one failure. The final five consecutive runs took 176.56, 53.79, 55.48, 35.36, 89.45 seconds. Each had 584 passes, zero failures, zero cancellations, one exhaustive-only skip, and one product TODO.

## Per-file wall times

The audit supplied three-run medians for the ten slowest files. The other 42 baseline files were run together from a tracked snapshot of the same revision, using the installed dependencies. The after columns come from the five consecutive default runs. Node reports duration per file, so overlapping rows do not sum to the command wall time.

The three new certificate store files partition the 19 cases previously in `store.test.mjs`. The board view tests are new.

| File | Baseline source | Before | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 | After median |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| `game/engine.test.mjs` | Additional run | 19.94 | 49.76 | 13.43 | 11.18 | 6.47 | 14.04 | 13.43 |
| `games/gravity-orchard/tests/engine.test.mjs` | Audit median | 284.51 | 61.64 | 20.22 | 19.52 | 11.97 | 21.98 | 20.22 |
| `games/gravity-orchard/tests/geometry-public.test.mjs` | Additional run | 3.59 | 5.85 | 2.36 | 1.26 | 0.45 | 0.58 | 1.26 |
| `games/gravity-orchard/tests/independent-review.test.mjs` | Audit median | 171.78 | 68.21 | 24.15 | 23.71 | 15.40 | 28.78 | 24.15 |
| `games/gravity-orchard/tests/physics.test.mjs` | Audit median | 49.51 | 49.80 | 12.49 | 11.02 | 6.93 | 14.20 | 12.49 |
| `games/gravity-orchard/tests/playability.test.mjs` | Audit median | 1124.41 | 87.30 | 32.08 | 31.81 | 23.17 | 55.19 | 32.08 |
| `games/gravity-orchard/tests/supply.test.mjs` | Additional run | 16.47 | 3.84 | 0.63 | 0.40 | 0.25 | 0.47 | 0.47 |
| `games/odd-laws-society/tests/catalog.test.mjs` | Additional run | 1.60 | 1.61 | 0.71 | 0.05 | 0.02 | 0.24 | 0.24 |
| `games/odd-laws-society/tests/engine.test.mjs` | Additional run | 12.88 | 33.32 | 9.46 | 6.66 | 3.37 | 6.85 | 6.85 |
| `games/odd-laws-society/tests/fixtures.test.mjs` | Additional run | 1.66 | 1.33 | 0.66 | 1.77 | 0.65 | 1.04 | 1.04 |
| `games/odd-laws-society/tests/independent-review.test.mjs` | Additional run | 10.72 | 20.39 | 6.48 | 5.73 | 3.09 | 6.70 | 6.48 |
| `games/odd-laws-society/tests/modules.test.mjs` | Additional run | 26.90 | 46.88 | 13.18 | 11.45 | 7.86 | 13.19 | 13.18 |
| `games/odd-laws-society/tests/preview.test.mjs` | Additional run | 6.73 | 16.33 | 3.85 | 3.07 | 1.78 | 3.61 | 3.61 |
| `games/odd-laws-society/tests/privacy.test.mjs` | Additional run | 2.08 | 3.16 | 0.78 | 0.81 | 0.82 | 0.63 | 0.81 |
| `games/odd-laws-society/tests/simulation.test.mjs` | Audit median | 91.62 | 20.04 | 7.74 | 7.27 | 5.67 | 9.32 | 7.74 |
| `games/odd-laws-society/tests/v03.test.mjs` | Additional run | 15.01 | 20.48 | 6.80 | 8.58 | 5.77 | 8.65 | 8.58 |
| `games/odd-laws-society/tests/validation.test.mjs` | Additional run | 1.69 | 1.28 | 1.05 | 0.58 | 0.49 | 1.35 | 1.05 |
| `server/lan.test.mjs` | Additional run | 12.05 | 13.44 | 6.86 | 6.14 | 3.94 | 3.90 | 6.14 |
| `server/realtime/gravity-orchard/tests/adversarial.test.mjs` | Audit median | 62.57 | 33.72 | 11.15 | 9.29 | 8.57 | 22.52 | 11.15 |
| `server/realtime/gravity-orchard/tests/coordinator.test.mjs` | Audit median | 68.91 | 24.44 | 7.06 | 7.10 | 3.73 | 6.05 | 7.06 |
| `server/realtime/gravity-orchard/tests/fixture-client.test.mjs` | Additional run | 9.08 | 3.99 | 2.06 | 2.07 | 1.24 | 2.49 | 2.07 |
| `server/realtime/gravity-orchard/tests/fixture.test.mjs` | Additional run | 3.83 | 6.57 | 1.49 | 2.16 | 0.79 | 3.14 | 2.16 |
| `server/room-lan-integration.test.mjs` | Additional run | 17.04 | 19.75 | 5.45 | 7.43 | 6.00 | 15.33 | 7.43 |
| `server/room-platform.test.mjs` | Additional run | 12.12 | 15.19 | 3.75 | 5.69 | 3.85 | 10.09 | 5.69 |
| `server/rooms.test.mjs` | Additional run | 9.90 | 18.32 | 2.76 | 5.49 | 4.73 | 16.93 | 5.49 |
| `server/secure-lan/certificates/tests/material.test.mjs` | Additional run | 17.34 | 23.91 | 7.50 | 5.83 | 6.19 | 16.07 | 7.50 |
| `server/secure-lan/certificates/tests/store-integrity.test.mjs` | New file | — | 47.46 | 9.80 | 10.07 | 8.24 | 36.16 | 10.07 |
| `server/secure-lan/certificates/tests/store-lifecycle.test.mjs` | New file | — | 56.12 | 13.27 | 11.15 | 8.74 | 47.08 | 13.27 |
| `server/secure-lan/certificates/tests/store-transactions.test.mjs` | New file | — | 58.85 | 14.50 | 10.23 | 9.76 | 50.22 | 14.50 |
| `server/secure-lan/certificates/tests/store.test.mjs` | Audit median | 73.54 | — | — | — | — | — | — |
| `server/secure-lan/tests/fixture.test.mjs` | Audit median | 44.31 | 31.56 | 8.98 | 5.56 | 7.39 | 29.07 | 8.98 |
| `server/secure-lan/tests/host.test.mjs` | Additional run | 1.47 | 2.37 | 0.68 | 0.51 | 0.56 | 0.18 | 0.56 |
| `server/secure-lan/tests/listener.test.mjs` | Audit median | 43.48 | 27.11 | 11.41 | 7.63 | 9.91 | 31.54 | 11.41 |
| `ui/action-queue.test.mjs` | Additional run | 0.04 | 3.65 | 0.24 | 0.35 | 0.78 | 0.41 | 0.41 |
| `ui/board-view.test.mjs` | New file | — | 0.03 | 0.45 | 0.21 | 0.28 | 1.00 | 0.28 |
| `ui/games/gravity-orchard/phone/tests/contract.test.mjs` | Additional run | 2.13 | 3.54 | 2.18 | 1.09 | 0.70 | 8.78 | 2.18 |
| `ui/games/gravity-orchard/phone/tests/motion.test.mjs` | Additional run | 1.51 | 3.01 | 0.92 | 0.60 | 0.76 | 1.22 | 0.92 |
| `ui/games/gravity-orchard/tv/tests/fixtures.test.mjs` | Additional run | 1.49 | 3.29 | 1.47 | 0.59 | 0.46 | 8.89 | 1.47 |
| `ui/games/gravity-orchard/tv/tests/timeline.test.mjs` | Additional run | 0.90 | 1.03 | 0.02 | 0.62 | 0.31 | 3.17 | 0.62 |
| `ui/games/odd-laws-society/tests/city-inspection.test.mjs` | Additional run | 0.83 | 1.92 | 0.63 | 0.03 | 0.02 | 0.07 | 0.07 |
| `ui/games/odd-laws-society/tests/controller.test.mjs` | Additional run | 3.13 | 1.46 | 1.08 | 0.46 | 0.38 | 2.25 | 1.08 |
| `ui/games/odd-laws-society/tests/fixtures.test.mjs` | Additional run | 1.57 | 1.35 | 0.85 | 0.29 | 0.52 | 1.39 | 0.85 |
| `ui/games/odd-laws-society/tests/graphics.test.mjs` | Additional run | 0.04 | 0.80 | 0.52 | 0.02 | 0.36 | 0.04 | 0.36 |
| `ui/games/odd-laws-society/tests/motion.test.mjs` | Additional run | 1.17 | 1.28 | 0.31 | 0.22 | 0.21 | 0.63 | 0.31 |
| `ui/games/odd-laws-society/tests/phone.test.mjs` | Additional run | 0.87 | 1.84 | 0.53 | 0.20 | 0.25 | 0.64 | 0.53 |
| `ui/games/odd-laws-society/tutorial.test.mjs` | Additional run | 0.13 | 0.71 | 0.03 | 0.12 | 0.01 | 0.05 | 0.05 |
| `ui/games/odd-laws-society/tv.test.mjs` | Additional run | 1.03 | 0.88 | 0.45 | 0.02 | 0.01 | 0.67 | 0.45 |
| `ui/media/gravity-orchard/manifest.test.mjs` | Additional run | 23.21 | 18.22 | 6.10 | 2.78 | 3.78 | 14.03 | 6.10 |
| `ui/media/gravity-orchard/score.test.mjs` | Additional run | 2.93 | 2.96 | 1.66 | 0.72 | 0.65 | 2.44 | 1.66 |
| `ui/media/odd-laws-society/manifest.test.mjs` | Additional run | 20.45 | 14.93 | 6.04 | 2.01 | 3.66 | 12.84 | 6.04 |
| `ui/media/odd-laws-society/score.test.mjs` | Additional run | 4.43 | 2.27 | 1.21 | 0.86 | 0.99 | 2.70 | 1.21 |
| `ui/media/sofa-menu/score.test.mjs` | Additional run | 5.40 | 2.50 | 1.64 | 1.03 | 0.79 | 4.54 | 1.64 |
| `ui/realtime/gravity-orchard/tests/client.test.mjs` | Additional run | 1.42 | 2.42 | 1.65 | 0.86 | 1.12 | 4.44 | 1.65 |
| `ui/room-client.test.mjs` | Additional run | 4.42 | 2.57 | 2.03 | 0.93 | 1.51 | 3.42 | 2.03 |
| `ui/score.test.mjs` | Additional run | 0.92 | 0.55 | 0.54 | 0.34 | 0.52 | 0.69 | 0.54 |
| `ui/transport.test.mjs` | Additional run | 2.63 | 3.52 | 1.68 | 0.68 | 0.87 | 2.03 | 1.68 |

## Other checks

| Command | Elapsed seconds | Result |
|---|---:|---|
| `npm run test:exhaustive` | 4193.28 | 63 passed. This run used reduced scheduling priority during heavy system load. |
| `npm run test:realtime:exhaustive` | 204.14 | 82 passed. |
| `npm run test:integration` | 477.11 | 49 passed. |
| `npm run test:gravity-orchard` | 223.78 | 39 passed. |
| `npm run test:cloud` | 10.62 | Local production Worker and D1 passed. |
| `npm run build` | 668.05 | Production build passed. |
| `npm run lint` with an empty cache | 275.27 | Zero errors and 14 warnings. |
| `npm run lint` with the resulting cache | 20.95 | Zero errors and 14 warnings. |

The audit recorded 904.22 seconds, 17 errors and 347 warnings for lint. Earlier lint runs during peak host load took up to 2481.49 seconds. The final cache contains ESLint results keyed by source content. Every unit timing above executes its tests again.

The additional baseline run reproduced the original fixture-client failure. A separate reproduction delayed the scheduler 350 ms immediately after readiness. All three connected peers reported `paused` with reason `host-stall`, as expected from the coordinator's 250 ms stall threshold. The corrected harness controls the coordinator and browser pump clocks while retaining real socket traffic.

Both complete TV tutorial viewport cases passed on focused reruns. The optional full GO7 browser journey reached the reconnect check and then timed out waiting for play to resume. The updated layout assertions passed in Chrome at all four requested viewport sizes, and the isolated pause check observed two coordinator timer callbacks at the same paused tick.
