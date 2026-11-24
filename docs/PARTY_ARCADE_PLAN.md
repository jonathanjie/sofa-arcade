# Party arcade build plan

Status: in progress from 24 November 2026. Integration branch: `feature/party-arcade`. This file is the resume point. Update the "Progress" table after each phase.

## Goal

Add arcade games for 2 to 16 phones and one TV to Sofa Arcade, as described in [party arcade ideas](games/party-arcade-ideas.md). The first release has the shared party platform and five playable games.

## Decisions (defaults chosen without the owner; change them here if Jon disagrees)

| Question | Decision | Reason |
| --- | --- | --- |
| Maximum players | 16 phones, minimum 2 | Covers a large living room; drives every limit below. |
| Where it runs | Local Mac host only (portable host and Tauri app), like Gravity Orchard | Real-time play needs the local coordinator; the hosted Site stays unchanged and shows party games as "local only". |
| Room model | A new party room type beside the present two-seat rooms | Two-seat rooms, their saved data and their tests must not change. |
| Rendering | Canvas 2D on the TV, no new rendering library | 16 small sprites and particles do not need WebGL. No new dependency. |
| Art | Pixel art written in code (letter grids plus palettes), see the proof in `docs/games/party-arcade-art/coded-sprite-proof.mjs` | No image tool, no drift between frames, one sprite for 16 players. Generated pictures only for covers. |
| Identity | 16 player looks: colour plus pattern plus a short name | Distinct for colour-blind players. |
| Game choice | The host picks each game on the TV; "party night" chaining comes later | Smaller first release. |
| Theme | Part A games keep the mice and Lala; Part B games may use other worlds | As in the ideas document. |

## Architecture

1. **Party rooms** (`server/party/`): create, join by QR or code, name and look choice, seats for 2–16 players, host controls (start, kick, next game), late join (waits for next round), reconnect keeps a seat for 30 s. Credentials and Origin rules follow the existing room code. Separate storage from two-seat rooms.
2. **Party realtime coordinator** (`server/realtime/party/`): one WebSocket per phone and one for the TV. Fixed-tick simulation on the host. Phones send inputs; the TV receives full snapshots; each phone receives only its own state and round events. Short host stalls are absorbed with bounded catch-up ticks (same approach as the Gravity Orchard fix). Connection limits sized for 16 phones, 1 TV, and reconnect churn.
3. **Party game interface** (`games/party/`): a game module supplies `id`, player range, `createRound(players, seed, gameRound, match)`, `step(state, inputs, dt, context)`, `projectForPhone(state, playerId)`, `projectForTv(state)`, `isRoundOver(state)`, `scores(state)`. Deterministic for the same seed, round context and tick log. One registry file lists party games.
4. **Arcade kit** (`ui/party/kit/`): TV canvas loop at display rate, interpolation between snapshots, coded-sprite renderer and palette swap, juice effects (shake, hit-stop, particles, squash, pop-up numbers) that respect reduced motion, sound hooks into the existing audio engine.
5. **Phone controller kit** (`ui/party/phone/`): large touch zones, one-button, stick, slide, tilt (with permission tap and touch fallback), player colour tint, connection state. No render loop.
6. **Round frame** (`ui/party/frame/`): lobby wall on the TV, countdown, round timer, results, podium, "next round / next game".

## Phases

| Phase | Work | Owner | Done when |
| --- | --- | --- | --- |
| 1 | Party platform (items 1–6 above) plus one tiny reference game, "Tap Race", that proves the whole path | Sol worker | 16 simulated phones play Tap Race end to end in tests and in Chromium; all existing checks stay green |
| 2 | Second Sol pass reviews phase 1 | Sol reviewer | Defects fixed; contract frozen in `docs/PARTY_CONTRACT.md` |
| 3 | Five games in parallel, each in its own worktree and folder | One Sol worker per game | Each game passes its tests, plays with 2, 8 and 16 simulated phones, and looks right in screenshots |
| 4 | Cross-review each game | Sol reviewer per game | Defects fixed |
| 5 | Integrate, verify, open a pull request | Integrator | All checks green; browser play verified |

First five games: **Don't Wake Lala**, **Dust Bunny Sumo**, **Wall of Paddles**, **Tug of Yarn**, **Snack Stack**.

## Progress

| Phase | State | Branch | Notes |
| --- | --- | --- | --- |
| 1 | Done | `party/platform` | Tap Race and the shared party kit. Real sockets verified 16 phones, reconnects, late join, and two rounds. Chromium verified 3 phone pages plus 13 simulated phones, with 16.6 ms median and 17.6 ms p95 frame time. Peak phone downstream was 1,165 B/s. See the [party contract](PARTY_CONTRACT.md). |
| 2 | Done | `party/platform` | Hardened room authority, peer admission, reconnects, fixed ticks and slow-phone handling. Verified 2, 8 and 16 phones, caught ten deliberate regressions, and reviewed the TV and phone captures. In Chromium at 1920×1080, the 16-runner draw callback took 0.3 ms at p95 and the display interval was 16.7 ms at p95. Browser join took 2.1 s. See the [additive contract changes](PARTY_CONTRACT.md#contract-changes-after-review). |
| 3 | Game branches built | `party/game-*` | Five games were built on separate branches. Their game reports identify the shared platform gaps below. |
| 3 follow-up | Platform changes complete | `party/platform-2` | Added round context, departures, duration-based harness budgets, phone clock sync, a full-stage TV layout and sprite scale guidance. Chromium verified the new frame and the 64 CSS px minimum for 16 Tap Race runners at 1920×1080. See the [party contract](PARTY_CONTRACT.md). |
| 4 | Not started | | |
| 5 | Not started | | |

## Checks for every phase

`npm run lint`, `npm test`, `npm run test:integration`, `npm run test:gravity-orchard`, `npm run build`, `npm run package:lan`, plus the party tests that phase adds and a Chromium run with simulated phones. Existing games must keep working.
