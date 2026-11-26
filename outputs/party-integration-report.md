# Sofa Arcade party integration

Verified on Apple Silicon macOS 27.0.1 with Node.js 24.22.3, Playwright 1.62.1 and the installed Chromium headless shell 145.0.7632.6. The starting revision was `1e3bf49`, shared with `feature/party-arcade` and descended from the fetched GitHub `main` at `e0504c1`. The checks used the existing `node_modules` symlink.

## Merges and conflicts

| Order | Branch | Merge | Resolution |
| --- | --- | --- | --- |
| 1 | `party/game-dont-wake-lala` | `39a4fc4` | No conflicts. |
| 2 | `party/game-dust-bunny-sumo` | `aa743c3` | Kept both games in the catalog, both registries, and the shared delivery list. Combined the phone practice updates. Restored the integration-side manifest, public catalog, phone frame, UI registry, and ZIP for regeneration. |
| 3 | `party/game-wall-of-paddles` | `a0cf941` | Kept all catalog, registry, and delivery entries. Used the shared practice interface. Restored the integration-side manifest, public catalog, phone frame, and ZIP. |
| 4 | `party/game-tug-of-yarn` | `f3a95eb` | Kept all catalog, registry, and delivery entries. Kept Tug of Yarn’s match labels and practice mode. Restored the integration-side manifest, public catalog, phone frame, UI registry, and ZIP. |
| 5 | `party/game-snack-stack` | `78e29e7` | Kept all catalog, registry, and delivery entries. Combined practice controls. Kept projection time for Sumo and tick time for Snack Stack in room authority and the contract. Restored the integration-side manifest, public catalog, phone frame, UI registry, and ZIP. |

Commit `f8baaa8` regenerated the delivery files after the merges. The desktop manifest took its 63 party paths from the shared delivery list. Desktop staging validated 304 files and their import closure. The final portable ZIP passed its CRC check and contains 306 files across 10,997,275 bytes. Its SHA-256 is `bd3d0c3a32fec06dc232ed5dc2b05e4a96b713a838d1e14d9a4a439d5510e8b8`. The runtime bundle check reproduced 705,552 bytes and 19 dependencies.

## Cross-game checks and fixes

- Verified 13 unique catalog IDs and the same six party IDs in the shelf, rules registry, and TV/phone registry. The shelf starts with Tap Race and ends with Snack Stack. Every card has a distinct short tagline.
- Checked game modules, kit registries, and CSS. Each game keeps its cue names within its renderer and uses existing audio effects. Pixel art compiles within each renderer from its own grids and the shared looks. No game registers a browser global. Styles use game-specific selectors. During switches, no stylesheet from the previous game remained on the phone pages.
- `7a36521` restored the room round number in phone updates. The Tug of Yarn rhythm renderer uses it to clear timing and feedback at the start of a new round. A focused Chromium probe reproduced the exception before the fix and passed two updates and disposal after it.
- `17c9a04` gives the TV a clean canvas when a renderer ends. This clears old cue attributes, accessible labels, canvas settings, and sizing state before the next game.
- `980442b` corrected the Wall of Paddles shelf description. The winning target varies with player count. The 16-seat capture shows a target of 11.
- `79dd9b5` changed the Gravity Orchard test harness to wait for the expected WebSocket packet. One initial unit run failed when its Ready assertion ran before the reply was recorded. The focused suite passed 25 checks and the three final full runs passed.

## Check results

The final command suites ran at `980442b`. Two browser-suite attempts during heavy machine load hit timing failures in Tap Race and the Gravity Orchard fixture. The unmodified command passed all 10 tests after the load subsided.

| Command or check | Result |
| --- | --- |
| `npm run lint` | 0 errors, 14 existing warnings |
| `npm test` × 3 | 702 passed each run, 0 failures, 1 full-pairing check reserved for the exhaustive suite |
| `npm run test:integration` | 77 passed, 0 failed |
| `npm run test:gravity-orchard` | 42 passed, 0 failed |
| `npm run test:browser` | 10 passed, 0 failed |
| `npm run build` | Passed all five build stages |
| `npm run test:cloud` | 1 passed, 0 failed |
| Hosted production build in local Miniflare | Six “Local host only” cards, no party host action, HTTP 404 `not_found` for party creation |
| Sofa Kingdoms | Loaded TV and both phones. Move up advanced revision 3 to 4. |
| The Odd Laws Society | Loaded TV and both phones. Seal vote advanced revision 3 to 4. |
| Gravity Orchard | Loaded TV and both phones. Jon’s touch joystick applied an x value of 0.55 in the TV snapshot. |

### Per-game socket harnesses

| 16-phone game harness | Tests passed | Peak downstream | Duration |
| --- | ---: | ---: | ---: |
| Tap Race | 3 | 1,165 B/s | 0.24 s |
| Don't Wake Lala | 3 | 1,565 B/s | 0.54 s |
| Dust Bunny Sumo | 3 | 1,165 B/s | 0.25 s |
| Wall of Paddles | 4 | 1,185 B/s | 0.88 s |
| Tug of Yarn | 4 | 1,210 B/s | 0.46 s |
| Snack Stack | 3 | 1,512 B/s | 1.39 s |

## One party in Chromium

The instrumented session ran on `17c9a04` before the Wall of Paddles description changed. A 1920 × 1080 TV page and three separate 390 × 844 touch browser pages joined with 13 real-socket harness phones. All 16 seats played all six games in one room. The TV chose each next game from the podium. All 16 phone clients followed each selection and kept their seat IDs. The browser pages kept their documents and one party WebSocket each. The session ended on the Snack Stack podium with 16 results.

| Round | Game | Start to podium | Phone-browser inputs | Verified capture |
| ---: | --- | ---: | --- | --- |
| 1 | Tap Race | 8.09 s | 1 / 1 / 1 | [TV](../work/party-int/tap-race-mid-play.png) |
| 2 | Don't Wake Lala | 50.77 s | 7 / 7 / 7 | [TV](../work/party-int/dont-wake-lala-mid-play.png) |
| 3 | Dust Bunny Sumo | 81.79 s | 2 / 2 / 2 | [TV](../work/party-int/dust-bunny-sumo-mid-play.png) |
| 4 | Wall of Paddles | 62.94 s | 1 / 1 / 1 | [TV](../work/party-int/wall-of-paddles-mid-play.png) |
| 5 | Tug of Yarn | 26.06 s | 1 / 1 / 1 | [TV](../work/party-int/tug-of-yarn-mid-play.png) |
| 6 | Snack Stack | 112.12 s | 77 / 77 / 77 | [TV](../work/party-int/snack-stack-mid-play.png) |

The 16 seats reached Ready in 595 ms on loopback. The session recorded 0 console errors or uncaught exceptions, 0 CSP violations, and 0 HTTP 404s. I inspected the six 1920 × 1080 gameplay captures and the [final podium](../work/party-int/final-podium.png).

The stock browser suite also sampled 120 Tap Race frames, with a 16.7 ms median display interval and a 0.4 ms p95 TV draw callback on its final run.

### Resources at game switches

The browser probe tracked live listener registrations, scheduled timeouts and intervals, and queued animation frame callbacks in the four documents. Counts exclude detached DOM targets and count game registrations separately from shared frame and connection registrations. The “before” sample was on the previous podium, and the “after” sample was in the next lobby.

| Switch | Listeners before → after | Timers before → after | Animation frames before → after | Old game listeners after |
| --- | ---: | ---: | ---: | ---: |
| Tap Race → Don't Wake Lala | 111 → 141 | 4 → 4 | 0 → 0 | 0 |
| Don't Wake Lala → Dust Bunny Sumo | 141 → 147 | 4 → 4 | 0 → 0 | 0 |
| Dust Bunny Sumo → Wall of Paddles | 147 → 132 | 4 → 4 | 0 → 0 | 0 |
| Wall of Paddles → Tug of Yarn | 132 → 117 | 4 → 4 | 0 → 0 | 0 |
| Tug of Yarn → Snack Stack | 117 → 111 | 4 → 4 | 0 → 0 | 0 |

The first lobby had 111 listeners and 3 timers. The fifth switch ended with 111 listeners and 4 timers. The final podium had 129 listeners, 4 shared timers, and 0 queued animation frames. 21 of those listeners belonged to the current Snack Stack phone controls. During play, the TV had one queued game frame callback in each game. Snack Stack also had one per phone while its cue was active. No timer, canvas loop, or listener from an earlier game remained after a switch.

Evidence is in [work/party-int](../work/party-int/), with [browser measurements](../work/party-int/collection-evidence.json), the [hosted result](../work/party-int/hosted-evidence.json), the [existing-game actions](../work/party-int/existing-games-evidence.json), and command logs.

## Open items

- Physical iOS and Android sensor input, certificate trust, Wi-Fi and casting latency, and live play balance.
- Native Mac app launch with the integrated party collection on Apple Silicon and Intel. This run validated desktop runtime staging.
- The branch remains local.
