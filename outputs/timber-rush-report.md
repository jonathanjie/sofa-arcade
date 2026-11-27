# Timber Rush

Timber Rush supports 2–16 phones and one local TV. Each player taps the clear side of a tree to chop. A clean cut refills the six-second time bar. A branch hit or an empty bar costs two seconds of play. Each round lasts up to 90 seconds.

| Mode | Round result |
| --- | --- |
| Fell Race | First to fell three 72-log trees wins. At the deadline, the most logs wins. |
| Sabotage | Every ten consecutive clean cuts send an axe and a branch to a seeded random rival. The most logs wins. |
| Lumber Team | Birch and Cedar pool logs. Each teammate receives the crew total. |

## Files and source

- Rules, projections and replay tests are in `games/party/timber-rush/`.
- The TV renderer, phone controls and phone CSS are in `ui/party/games/timber-rush/`. The TV uses the shared ink figures, paper and name tags.
- Registration touches `games/catalog.mjs`, both party registries, `ui/app.js`, `server/party-delivery.mjs` and `desktop/runtime-manifest.json`. The existing runtime list reads party delivery entries. Served copies are in `public/`.
- The generated shelf illustration is retained in `ui/media/party/sources/raw/timber-rush.webp`. The 1280 × 720 and 560 × 315 covers are in `ui/media/party/covers/timber-rush/`.
- The adaptation uses the side tap, stacked trunk, branch collision, chop refill and combo mechanics from Kamran Ahmed’s `goofyfish/public/games/chopping.html`. The ink treatment follows the source style guide. Source headers identify the port and `docs/third-party/goofyfish-LICENSE.txt` contains the MIT notice. Multiplayer rules, modes and projections are specific to Sofa Arcade.
- Integration and browser tests are in `tests/integration/party/timber-rush.test.mjs` and `tests/party/timber-rush.browser.test.mjs`.

## Verification

Production build and game preparation passed. ESLint reported zero errors and 14 existing warnings. The unit suite passed 743 tests and skipped one, including three passing Timber Rush rules tests.

Integration passed 84 of 86 tests. Only the checked-in portable ZIP failed inventory and isolated-host serving checks. The checkout host serves the game and both covers. The ZIP was left at its existing revision as requested. Earlier integration runs under load hit other games’ timeouts. All of those tests passed on the full rerun.

The round harness played two rounds at each seat count. It checked reconnects, removal, a late guest waiting for the next round, and ranked results. Sizes below are observed maxima. Packet sizes include the WebSocket header.

| Phones | Private game projection | Playing packet |
| ---: | ---: | ---: |
| 2 | 32 B | 239 B |
| 8 | 32 B | 239 B |
| 16 | 32 B | 241 B |

Chromium used a 1920 × 1080 TV, three 390 × 844 touch pages and 13 socket players. It completed a Sabotage round and checked console errors, failed resource requests, content security policy and play-screen overflow. TV render p95 was 1.40 ms across 71 sampled frames. The limit was 16.7 ms.

## Visual review

Screenshots are local to `work/timber-rush/review/`:

- `tv-lobby.png`
- `teaching.png` and `phone-teaching.png`
- `tv-playing.png` and `close-up.png`
- `phone-playing.png`
- `results.png`

The review led to grounded stumps, larger figures, a clearer left/right demonstration and corrected singular score text. Physical phone input latency and readability at an actual sofa viewing distance remain unmeasured.
