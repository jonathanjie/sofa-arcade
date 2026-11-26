# Head Hop

Head Hop runs on one local TV and 2–16 phone browsers. Tap the phone to hop in the direction the jumper faces. Hold for up to 600 ms before release for a higher arc. A stomp restores the air hop. The jumper turns at the edges. Moving brambles squeeze the play area, and the grey walkers’ hat brims narrow late in the round.

| Mode | Win condition |
| --- | --- |
| Last One Up | Stay alive. If the 90-second timer expires, rank by lives, then survival time in whole seconds. |
| Stomp Chain | Earn points for consecutive landings, up to 12 points per stomp. A fall breaks the chain. |
| King of the Heads | Earn one point per accumulated second riding another player's head. Hop off or bounce after 1.6 seconds. |

All modes start with three lives. Each spike fall removes one life. A jumper with a life left returns on a balloon. Stomp Chain and King of the Heads run for 90 seconds. In a fixed-seed replay with inputs every 12 ticks, Last One Up lasted 78.3, 87.05 and 90 seconds at 2, 8 and 16 players.

## Source and files

- Adapted descending-foot/head contact, bounce, chain scoring, spike falls and the advancing edge from Kamran Ahmed’s MIT-licensed `public/games/stomping.html`. The authority runs at the shared party tick. Multiplayer head rides, lives, scoring modes and the late-round hat mechanic are specific to this adaptation.
- Rules and replay tests are in `games/party/head-hop/`. The TV and phone modules are in `ui/party/games/head-hop/`. The TV uses the shared ink kit for figures, name tags, paper and impact effects. The source notice is in `docs/third-party/goofyfish-LICENSE.txt`.
- Registered the game in both party registries, the collection catalog, the shelf cover map, the party delivery list and the desktop manifest. Updated the shelf order test. The runtime file list imports the party delivery list.
- Generated the reference-guided shelf image, retained the original WebP in `ui/media/party/sources/raw/head-hop.webp`, and supplied 1280×720 and 560×315 covers under `ui/media/party/covers/head-hop/`. The generated static copies are under `public/`.
- Socket tests are in `tests/integration/party/head-hop.test.mjs`. The Chromium flow is in `tests/party/head-hop.browser.test.mjs`.

## Checks

Preparation and the production build passed. ESLint reported zero errors and 14 warnings in existing files. The unit suite passed 749 tests, including nine Head Hop tests. One exhaustive pairing test was skipped by the standard suite.

Integration passed 84 of 86 tests, including all three Head Hop socket tests. The two expected failures compare the portable ZIP inventory and request a new module from the archived host. The dispatch requires leaving that ZIP as supplied.

| Phones | Maximum private game state | Largest playing packet | Peak downstream in one second |
| ---: | ---: | ---: | ---: |
| 2 | 34 B | 238 B | 1,190 B |
| 8 | 34 B | 238 B | 1,190 B |
| 16 | 34 B | 240 B | 1,200 B |

Private-state sizes are UTF-8 JSON maxima across the three modes with seed `party-harness-seed`. Packet sizes come from real LAN socket tests. The phone receives only its own score, lives and chain multiplier.

The Chromium test passed with a 1920×1080 TV, three 390×844 touch pages and 13 simulated controllers. It checked both short and held touch input, all four pages for overflow, console errors, CSP violations and 404 responses, and the TV podium. TV render callback p95 was 0.40 ms over 71 samples, below the 16.7 ms limit.

## Screenshot review

Review files are in `work/head-hop/review/`.

| Capture | File |
| --- | --- |
| Full room | `tv-lobby.png` |
| TV instruction | `teaching.png` |
| Phone input demonstration | `phone-teaching.png` |
| 16-player round | `tv-playing.png` |
| Figure and tag detail | `close-up.png` |
| Phone during play | `phone-playing.png` |
| Final rankings | `results.png` |
| Frame measurement | `frame-times.json` |

The first capture showed names overlapping at balloon drops. The reviewed revision staggers respawn heights, moves crowded tags into nearby rows and draws a line to each jumper.

## Open checks

Chromium ran on one Mac. Physical phone touch latency, Wi-Fi and casting latency, three-metre TV readability and human balance still need a hardware playtest. The downloadable ZIP needs the integrator’s packaging pass.
