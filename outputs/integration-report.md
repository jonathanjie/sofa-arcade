# Sofa Arcade integration report

## Final integration · 24 November 2026

Verified source `b372c4820030903e4e768023bb4e4977133be8b8` on `improve/integration`. All six lanes are integrated. The final checks used Node.js 24.22.3, Chromium 145.0.7632.6 and the existing dependency symlink. The suite commands ran in sequence on a shared Mac. Other applications were active, so machine-wide idle conditions were not verified. All changes are local.

### UI merge and corrections

- `88c891f` merged `improve/ui-polish` at `d0edb8b`. Resolved authored conflicts in `ui/app.js`, `ui/styles.css`, and the Orchard phone module. Kept the playable-first shelf, responsive image candidates and dimensions, hero preload and fetch priority, route-first startup and on-demand character atlas. The responsive shelf aspect ratio now yields to the TV layout. Direct links, rejected room entry and browser history kept both lanes' behavior.
- Kept conditional DOM writes on Orchard phones and reserved space for reconnect text. A regression check caught a 26 px Ready-button shift during the merge. The rendered test verifies fixed placement across three viewport sizes, connection-dependent enablement, Ready and Cancel ready labels, both seat labels and zero Ready-panel mutations for an identical snapshot.
- Resolved generated conflicts in `public/app.js`, `public/styles.css`, the public Orchard phone module and the ZIP by taking one side and running the generators. The final delivery also includes the regenerated host bundle and dependency inventory.
- **Scheduler** · `69a2cea`. An active scheduler gap up to and including 1,000 ms uses the existing five-tick cap (83⅓ ms). Excess whole ticks are discarded. Stale input still brakes at 250 ms. More than one second without a callback means more than 20 missed TV snapshot intervals. The coordinator pauses before stepping and requires both players to ready. No wire field or version changed. Controlled-clock tests failed at 350 ms before the fix. After it, a 350 ms gap plus one ordinary wake matched six replayed fixed ticks in the seeded engine. Tests cover a 1,000 ms gap, a 1,001 ms pause with no tick advance, both-ready countdown and resume. The restart fixture now uses 1,250 ms to test durable recovery above the new threshold.
- **SSE** · `edfa9fc`. Stopping inside the offline callback originally left a 200 ms retry timer. The normal test now proves that no timer remains and no second request occurs.
- **TV score** · `e958b62`. The projection reader checks the star count for each stage before accepting a snapshot. The rendered regression failed on the previous implementation, then verified that a bad result preserves all rows and totals, plays no finish sound, and allows the next valid correction. The isolated test used the root Playwright test runner through a temporary module alias. No packages were installed.
- **Smoke findings.** An unknown join code generated an HTTP 404 and a Chromium console error. `bc45ce3` adds an opt-in exact-code lookup that returns JSON null on a miss. Direct reads retain their 404 and matching rooms retain their existing authentication and projection. Screenshot inspection also found a keyboard focus ring crossing the Orchard steering heading. `742fb21` moves it inside the joystick and tests the rendered bounds. The setup guides now match the Ready label.

### Final checks

| Check | Result | Wall time |
| --- | --- | ---: |
| Lint | Exit 0, 0 errors, 14 existing warnings | 3.96 s |
| Unit run 1 | 609 passed, 1 exhaustive-only skip, 0 TODO | 6.67 s |
| Unit run 2 | 609 passed, 1 exhaustive-only skip, 0 TODO | 5.52 s |
| Unit run 3 | 609 passed, 1 exhaustive-only skip, 0 TODO | 4.92 s |
| Integration | 49 passed | 4.90 s |
| Gravity Orchard integration | 42 passed | 2.98 s |
| Browser | 8 passed | 19.08 s |
| UI polish | 6 passed | 3.39 s |
| Full Gravity browser journey | 18 checks passed, 12 orders and nine stars, practice and recovery complete | 233.90 s |
| Rendered TV score regression | Bad snapshot produced no score or sound change. Valid correction rendered. | 1.70 s |
| Production build | Completed, root and API routes built | 4.53 s |
| Chromium smoke on port 52144 | 12 screenshots, zero console, page, network, socket or CSP errors | 8.38 s |
| Derived browser files and archive | Reproduce | 0.08 s |
| Host bundle and dependency inventory | Reproduce | 0.53 s |
| Cold-screen baseline | All 21 captures rendered | 212.32 s |

The smoke used independent TV, Jon and Lydia browser contexts. It exercised three acknowledged Sofa moves, two sealed Odd Laws votes plus three Work actions, and both Orchard Ready commands plus three steering inputs observed in authoritative snapshots. Reduced motion was enabled. The missing room kept the attempted code selected and offered no seats. Reviewed the 1920 × 1080 and 390 × 844 collection, all nine room screens and the unknown-code screen. The TV shelf shows playable cards beside named planned games. Both featured actions fit on the phone. The final steering focus ring clears the heading. [Screenshots and smoke data](../work/integration/final/result.json) · [Command logs](../work/integration/final/checks/) · [Full Orchard journey](../work/integration/final/gravity-browser/gravity-orchard-browser.json)

### Performance on the integrated tree

Three cold navigations per screen, 10 seconds each, on loopback with the cache disabled. All screen roles used the audit's 390 × 844 viewport at 3× DPR, with 20 ms latency, 25 Mbit/s down and 10 Mbit/s up. The audit runner included the required same-origin header for setup writes. Values are independent medians. HTTP bytes include response headers and observed stream data. Total bytes also include received WebSocket payload. HTTP requests exclude WebSocket upgrades. [Per-request measurements](../work/integration/final/performance-baseline-final.json)

| Screen | Total received B | HTTP B | HTTP requests | WS upgrades | WS received B |
| --- | ---: | ---: | ---: | ---: | ---: |
| Collection | 671,468 | 671,468 | 19 | 0 | 0 |
| Sofa Kingdoms · Phone | 542,745 | 542,745 | 20 | 0 | 0 |
| Sofa Kingdoms · TV | 542,737 | 542,737 | 20 | 0 | 0 |
| Odd Laws · Phone | 616,565 | 616,565 | 41 | 0 | 0 |
| Odd Laws · TV | 659,279 | 659,279 | 43 | 0 | 0 |
| Gravity Orchard · Phone | 1,014,006 | 690,871 | 45 | 1 | 323,135 |
| Gravity Orchard · TV | 1,451,921 | 1,128,442 | 51 | 1 | 323,479 |

Final portable archive SHA-256 `8adb8af541ea2a4da457c6f34291d9a265093828a9ea6627b992b5545a12042e`. Physical phone tilt, certificate trust, home Wi-Fi and casting latency, physical audio and packaged Tauri sign-off remain open.

## Earlier five-lane integration record

Branch `improve/integration` started from `0560ca7` (`fix/gravity-orchard-polish`). The merge used five local lane heads. No packages were installed or changed. The existing `node_modules` symlink supplied dependencies. Checks used Node.js 24.22.3 and the installed Playwright Chromium 145.0.7632.6 on macOS arm64. No push, pull request, or deployment was made.

### Merge order and conflict resolutions

| Order | Lane head | Merge | Resolution |
| --- | --- | --- | --- |
| 1 | `improve/docs` · `9b1b9d2` | `5299782` | Clean merge. Adopted the rewritten contributor and play guides and archived records. |
| 2 | `improve/tests-ci` · `895a761` | `d485f59` | Kept the docs structure in `AGENTS.md` and `README.md`. Added the installed, standalone, exhaustive, realtime, and cloud test commands. In `go1-engine.yml`, `go3-phone.yml`, `go4-tv.yml`, and `ws3-ui.yml`, kept the CI structure and both lanes' path filters. Kept the CI implementation in `scripts/run-unit-tests.mjs` and rewrote its header to describe explicit standalone filtering and separate browser and nested suites. Carried the prior generated ZIP. |
| 3 | `improve/security-hardening` · `f39bba1` | `8880906` | Combined the `realpath` and `writeFile` imports in `tests/gravity-orchard-integration/native/host.test.mjs`. Kept all native pipe and TLS refresh assertions. In `tests/gravity-orchard-integration/protocol/authority.test.mjs`, kept rollback and bounded-write assertions, the controlled restart, capacity reclamation, and the occupied-port checkpoint test. Carried the prior generated ZIP. |
| 4 | `improve/correctness` · `5ea5a93` | `45f409a` | Kept the docs structure in `docs/GRAVITY_ORCHARD_CONTRACT.md` and added the receipt-capacity epoch reset. In `server/realtime/gravity-orchard/fixture/server.mjs` and `tests/fixture-client.test.mjs` under that coordinator, the CI manual clock superseded the duplicate scheduler. It keeps real sockets, shares one clock with the input pumps, issues credentials before mocking timers, and keeps the rematch and host-stall assertions. In the Orchard authority suite, retained the narrower scoped wall-clock mock for the checkpoint measurement. In `tests/integration/protocol/public-delivery.test.mjs`, both lanes already resolved the temporary path with `realpath`. Carried the prior ZIP and runtime dependency inventory for regeneration. |
| 5 | `improve/performance` · `81438f0` | `a82de3f` | Kept both the frame policy and reconnect tests and the direct startup, missing room and Back/Forward test in `server/room-browser.test.mjs`. Carried the prior generated ZIP. |

The workflow merges also retained the security lane's full action pins, including the media artifact uploads. All merge commits have both parents in the requested order.

### Integration fixes and semantic checks

- **LAN image policy** · `b7e37f4`. The performance lane fetches the Sofa WebP atlas, creates a local object URL, then decodes it. Chromium reported three `img-src` violations and the atlas stayed on its SVG fallback. Added `blob:` only to `img-src` and made the regression require the decoded atlas. Same-origin WebP files, responsive candidates and preloads work with the existing directives. The favicon and fallback images still use the existing `data:` allowance. The following ZIP refresh was committed separately as `418696f`.
- **Orchard media proof** · `ba0bf9f`. The exact inventory comparison found 52 images while the test expected 49. The test now verifies the new total and explicitly names the two controller portraits and compact cover. It retains the inventory equality, decoder, frame and gutter checks. The three initial unit runs had this one failing assertion.
- **Odd Laws cover proof** · `d2353c4`. The rendered acceptance helper assumed the original cover's intrinsic pixel size. Chromium reports 399 × 250 CSS pixels for the responsive shelf image. The check now decodes the actual selected URL on its own and verifies the full or compact asset's pixel dimensions. The collection open, both phone joins and rendered room start passed in 7.06 s with two checks and two screenshots.
- **Request headers, connection limits and realtime ownership.** Checked the explicit Origin and JSON headers in direct HTTP and fixture writes. Chromium adds same-origin Origin to real UI writes. The suite covers rejection of missing or foreign Origin and invalid content type, stream timeout and slot cleanup, and rapid controller reloads under the stream limits. The manual-clock tests cover controller replacement, orderly Ready cleanup and reconnects. The protocol integration also checks that expired rooms free a coordinator slot and that a bind failure preserves the live checkpoint.
- **Delivery.** Ran `npm run bundle:runtime`, `node scripts/prepare-game.mjs`, and `npm run package:lan` using the pinned Node. Commit `4345526` records the integrated ZIP and regenerated dependency inventory. The tracked served copies and route were already reproducible. The secure-LAN manifest contains the new helper and the bundled runtime includes it. The delivery audit checked 41 added WebPs and 69 browser modules against the LAN responses, the shared public inventory, the ZIP and desktop staging. The ZIP contains 242 files. Verified 240 files in the staged desktop runtime, including byte equality and executable modes.
- **Contributor and LAN guides.** Re-read `AGENTS.md` and `docs/LAN.md` after updating the write requirements, room and socket limits, SSE limits, test suites and lint cache behavior. Commits `a5250b9`, `595cac4`, and `f20eb4f` record the documentation changes. The final ZIP includes the corrected LAN guide.
- **Existing expected failures.** Preserved the transport test for an offline callback leaving a retry timer and the GO4 TV test for contradictory order and star counts. The default unit runner counts one TODO and one exhaustive-only skip. The GO4 component Playwright expected failure lives outside the requested root suites.

### Orchard browser baseline comparison

The first integrated full browser run at `418696f` reached five checks and timed out in 33.63 s while waiting to resume after an authenticated socket reconnect. The same command against a local archive of `fix/gravity-orchard-polish` at `0560ca7` exited 1 in 43.35 s. It reached the next both-ready resume, after a real pagehide and Back navigation, and timed out there. Both failure screenshots show the Orchard host-stall message. The coordinator raises that pause when an active scheduler callback arrives over 250 ms after the preceding callback. The normal room startup, both-ready smoke flow, and controlled-clock realtime tests passed. The timing guard and acceptance assertions stayed in place.

Evidence is in `work/integration/gravity-browser-first/` and `work/integration/baseline-gravity/`. The baseline files came from `git archive` and ran with the same Node and Chromium. The baseline log begins with the exact archived commit.

The final-tree retry reached both resume gates, completed stage one, and hit the same host-stall pause during stage two. It exited 1 after 95.76 s. The complete campaign, remaining practice journey and end-of-suite recovery assertions are still open in Chromium. The automated protocol suite separately covers storage recovery and the scheduler safety behavior.

### Final verification

Runtime and test source checked at `f20eb4fe9747dfbf5d67027899189c29d7d5ff5f`. Wall times are from `/usr/bin/time -p`. Full command logs are in `work/integration/checks/`. Earlier run logs remain in `work/integration/prior-checks/`.

| Command or check | Exit | Count or result | Wall time |
| --- | ---: | --- | ---: |
| `npm run lint` | 0 | 0 errors, 14 warnings, same count as the tests lane | 4.09 s |
| `npm test`, run 1 | 0 | 608 tests. 606 passed, 1 exhaustive-only skip, 1 expected TODO, 0 failures | 10.81 s |
| `npm test`, run 2 | 0 | 608 tests. 606 passed, 1 exhaustive-only skip, 1 expected TODO, 0 failures | 6.52 s |
| `npm test`, run 3 | 0 | 608 tests. 606 passed, 1 exhaustive-only skip, 1 expected TODO, 0 failures | 8.02 s |
| `npm run test:integration` | 0 | 49 passed, 0 failed or skipped | 6.14 s |
| `npm run test:gravity-orchard` | 0 | 42 passed, 0 failed or skipped | 4.30 s |
| `npm run test:browser` | 0 | 8 passed, 0 failed or skipped | 19.55 s |
| `npm run test:gravity-browser` | 1 | 7 checks passed before the stage-two host-stall pause | 95.76 s |
| `npm run build` | 0 | Five Vinext build phases completed. Root and API routes built. | 15.37 s |
| Chromium smoke on spare port 53633 | 0 | 3 rooms, 3 independent browser contexts per room, 10 screenshots, 0 console errors, page errors, CSP violations, HTTP errors or WebSocket errors | 12.06 s |
| Runtime delivery and desktop staging | 0 | 41 new WebPs, 69 browser modules, 242 ZIP files, 240 staged desktop files | 2.41 s |
| Production public inventory | 0 | 224 declared public files and 13 framework files. 17 excluded tracked sources stayed out. | 0.83 s |
| `node scripts/check-derived.mjs` | 0 | Tracked served copies, root route and ZIP current | 0.19 s |
| `npm run bundle:runtime -- --check` | 0 | Host bundle, 19 dependencies and inventory reproduce | 1.53 s |

The smoke flow started a fresh real LAN host on port 53633 with an in-memory SQLite database. It loaded the collection, created each room, and joined Jon and Lydia through the rendered UI in isolated phone-sized contexts. Sofa Kingdoms accepted three moves and loaded the decoded character atlas. Odd Laws accepted both sealed votes and three Work actions. Both Orchard controllers chose touch and readied, and the coordinator entered play. The host stopped at the end. [Screenshots and result](../work/integration/smoke/)

Final workflow review confirmed eight archived documentation paths and 73 action SHA pins across 15 workflows. The two expected-failure source files match the tests lane. The final portable ZIP SHA-256 is `654de3fd453c0b690f1bcdf85eb1e430a41043825d14c51b1befa8688c9bc660`.

### Open at the five-lane checkpoint

- Run the full rendered Orchard campaign, practice and recovery journey without an incidental host-stall pause.
- Test physical phones for Wi-Fi, QR joining, tilt, certificate trust and latency. Chromium touch and simulated sensors cover only browser behavior.
- Check TV casting, display latency and physical audio.
- Build and run the packaged Tauri app, including its WKWebView, signing and updater path. Local runtime staging and the Node host tests passed.
