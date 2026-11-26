# Wobble Tower

Two to sixteen players share a 90-second local round. The active phone has one drop button. The other phones count down their turns. A turn expires after three seconds.

| Mode | Scoring |
| --- | --- |
| Tallest Tower | Each crew builds its own tower. All members receive its final height. |
| Don't Topple | Everyone builds one tower. A miss resets it. The highest level reached during the round is the shared score. |
| Plank Duel | Crews alternate on one tower. A complete miss costs the dropping crew one point. |

## Files and source

- Server rules and replay tests live in `games/party/wobble-tower/`. The TV and phone renderers live in `ui/party/games/wobble-tower/`.
- The catalog, both party registries, shelf cover map, party delivery list and desktop runtime manifest include the game. The runtime file list consumes the party delivery list.
- The generated cover pair lives in `ui/media/party/covers/wobble-tower/`. The retained original lives in `ui/media/party/sources/raw/wobble-tower.webp`. Preparation copies browser modules and covers to `public/`.
- The swinging load adapts goofyfish `public/games/stacks.html`. Overlap, falling offcuts and perfect-drop growth adapt `public/games/planks.html`. The ink kit supplies the figures, paper, tags and impact effects. The port headers credit Kamran Ahmed under the [MIT license](../docs/third-party/goofyfish-LICENSE.txt).
- Socket coverage lives in `tests/integration/party/wobble-tower.test.mjs`. Browser coverage lives in `tests/party/wobble-tower.browser.test.mjs`.

## Verification

Asset preparation and the production build passed. ESLint reported zero errors and 14 warnings outside the game. The unit suite passed 746 tests and skipped one exhaustive pairing test. All six Wobble Tower rules tests passed.

The integration suite passed 85 of 87 tests. All four Wobble Tower tests passed, including mode selection, seat replacement, departures and late joins. Both failures concern the existing portable ZIP. Its inventory lacks the added files, and its isolated host returns 404 for the new phone module. ZIP regeneration was excluded from this task.

| Players | Largest phone state in seeded tap replay | Largest observed socket frame | Peak rolling downstream |
| ---: | ---: | ---: | ---: |
| 2 | 14 B | 222 B | 1,314 B/s |
| 8 | 14 B | 222 B | 1,110 B/s |
| 16 | 15 B | 225 B | 1,125 B/s |

One Chromium test passed with a 1920 × 1080 TV, three 390 × 844 touch pages and thirteen simulated phones. TV draw time was **1.0 ms p95** over 71 samples. The test checked console errors, page errors, 404 responses, content-security violations and overflow. The shared monitor and physical phone experience still needs an on-device playtest.

## Screenshots

All files are in `work/wobble-tower/review/` in this worktree. They cover the [TV teaching card](../work/wobble-tower/review/teaching.png), [phone teaching card](../work/wobble-tower/review/phone-teaching.png), [16-player board](../work/wobble-tower/review/mid-play.png), [tower close-up](../work/wobble-tower/review/close-up.png), [active phone](../work/wobble-tower/review/phone.png), [lobby](../work/wobble-tower/review/tv-lobby.png) and [results](../work/wobble-tower/review/results.png). The [render sample summary](../work/wobble-tower/review/frame-times.json) records the p95 result.
