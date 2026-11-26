# Balloon Bop

Balloon Bop runs on a local TV host with 2–16 phone browsers. Tap a position on the wide pad to hop there. The yellow floor marker shows the balloon’s horizontal position. Gusts move balloons sideways. Jump between a balloon and the ladder goon to block a dart.

| Mode | Scoring and end condition |
| --- | --- |
| Keep It Up | Each bop adds one personal bop and one team point per airborne balloon. The third loss or the 90-second limit ends play. |
| Balloon Volley | The pad maps to the player’s half. A loss on one side gives the other team a point. Players rank by their team’s score after 90 seconds. |

## Files and source

- Server rules and replay tests live in `games/party/balloon-bop/`. The host locks the round roster. The rules remove departed players before handling hops.
- The TV renderer, phone control and stylesheet live in `ui/party/games/balloon-bop/`. The cover pair lives in `ui/media/party/covers/balloon-bop/`. The retained source image is `ui/media/party/sources/raw/balloon-bop.webp`.
- Registration covers the party server and UI registries, collection catalog, shelf art, shelf order test, party delivery list and desktop runtime manifest. The existing runtime inventory imports the party delivery list. Preparation generated the corresponding public copies.
- The tap-to-hop mechanic, upward impulse, airborne score multiplier, gusts, dart interception and balloon silhouette adapt `goofyfish/public/games/bopping.html`. The rules and renderer identify the source. The shared ink kit supplies the figures, paper and impact effects. See [Kamran Ahmed’s MIT notice](../docs/third-party/goofyfish-LICENSE.txt).
- The integration test is `tests/integration/party/balloon-bop.test.mjs`. The Chromium test is `tests/party/balloon-bop.browser.test.mjs`.

## Verification

| Check | Result |
| --- | --- |
| Preparation and production build | Passed |
| ESLint | 0 errors, 14 existing warnings outside Balloon Bop |
| Unit suite | 747 passed, 1 exhaustive-only case skipped, 0 failed. Includes 7 Balloon Bop rules tests. |
| Integration suite | 84 passed, 2 stale-ZIP checks failed. All three Balloon Bop cases passed. |
| Chromium | 1 passed. A 1920 × 1080 TV, three touch-enabled phone pages and 13 socket clients played co-op, reached results and started volley. No console errors, 404s or play-screen overflow. |
| TV render | 1.1 ms p95 over 71 draw callbacks. Budget 16.7 ms. |

The 2-, 8- and 16-phone harness cases each ran two rounds with reconnection, removal and late entry. Largest measured playing packets, including WebSocket headers, were **233**, **233** and **235 bytes**, respectively. The initial private game projection alone was 26 UTF-8 JSON bytes at all three sizes.

## Local screenshots

The browser test writes the images under `work/balloon-bop/review/`. Review covered `tv-lobby.png`, `teaching.png`, `phone-teaching.png`, `tv-playing.png`, `close-up.png`, `phone-playing.png` and `results.png`. The render sample summary is `frame-times.json`. Visual review led to smaller name-tag type so numbered names remain distinguishable, a ladder for the goon, and staggered jumps in the 16-player capture.

## Open checks

The existing portable ZIP lacks the new game files. This accounts for its inventory failure and the missing controller stylesheet when the integration suite launches that archive. The ZIP was left for the integrator as requested. Human balance, sofa-distance readability on a physical TV and physical phone-to-TV latency still need a device session.
