# Sofa Arcade — continuation handoff

This is a living-room game collection for Jon and Lydia: one Site, one source repository, a shared TV, and two phone controllers. Read [README.md](../README.md), [AGENTS.md](../AGENTS.md), and the current source before editing. This handoff includes the strategy, local-network, randomized-opening, GitHub migration, and parallel game-design updates; inspect version history and deployment status for the latest published release.

## Current continuation — Odd Laws feedback and the next game

The initial local workstreams were merged through PRs #3–#8; main reached `a96fd477d2a3239d715421ed711682648e16eccc` with the combined browser/native acceptance complete. PR #9 then added composed collection music and the acknowledged AppKit Quit shutdown path at `392345f4fbdfdb65218482bd204403264ae7a34c`. Preserve those changes when reconciling newer branches.

PR #10 adds an original Odd Laws cover, larger labelled/coloured guild cards, and read-only **My city** inspection that preserves policy/bid/build drafts. Its exact CI results and corrections are recorded in the PR and [UI feedback report](workstreams/odd-laws-ui-feedback.md). Inspect current PR/main status before calling that feedback released; a GitHub merge does not deploy the Site.

The next assignment is **Gravity Orchard v0.2**, a real-time cooperative game with two phone-controlled garden trays, bridge transfers, shared picnic recipes and Brake. Read the [seven-session dispatch pack](DISPATCH_GRAVITY_ORCHARD.md), [frozen implementation contract](GRAVITY_ORCHARD_CONTRACT.md), [PRD](games/gravity-orchard.md) and [browser/LAN technical notes](GRAVITY_ORCHARD_TECHNICAL_NOTES.md). These supersede the old turn-based Gravity Orchard draft and overlapping broad ownership for this game. Six components can start in parallel; GO7 owns shared server/native/shell wiring and final acceptance. The catalog remains planned.

## Historical local integration checkpoint

WS6 works on `feature/local-integration` from base
`e34b0015399cb9791b175987adf1fab1b542565a`. Read
[the frozen component matrix](../tests/integration/components.json),
[the executed acceptance report](workstreams/integration.md), and
[local setup/build instructions](LOCAL_RELEASE.md) before continuing.
All five ready component heads are included by merge ancestry. The complete
browser candidate passed at `4695643`; Odd Laws is now enabled. The ordinary
collection-create rerun and combined native acceptance were subsequently completed
before the aggregate PR merged. The paragraph above records the merged baseline;
the reports below retain their original checkpoint history.
Do not combine moving owner-branch tips or copy unfinished component files.

Shared production and portable inputs now live in `scripts/runtime-files.mjs`.
Regenerate public modules/root HTML and the portable ZIP after source changes;
verify the extracted archive, explicit LAN routes, and desktop manifest together.
`npm run verify:components` / `npm run verify:local-release` are strict readiness
gates. Reports distinguish exact committed checks, dirty diagnostics, native CI,
and physical hardware acceptance. See the matrix for permitted serving-only
post-handoff corrections.

## Project identity

| Item | Value |
| --- | --- |
| Product title | Sofa Arcade |
| First playable game | Sofa Kingdoms |
| Public Site | https://sofa-kingdoms-jon-lydia.jon-marinachain.chatgpt.site/ |
| Sites project ID | `appgprj_6afefbec09788191b3615027f614b989` |
| Hosting provider | `cloudflare_artifact` through ChatGPT Sites |
| Production database | D1 binding `DB`, declared in `.openai/hosting.json` |
| Canonical source | https://github.com/jonathanjie/sofa-arcade (`main`) |
| Deployment source | Sites managed Git mirror; preserve existing Site identity |

The URL, package, and folder retain the earlier `sofa-kingdoms` name. Preserve this Site identity, public audience, and existing links. Add future games in this repository; do not create a replacement Site for each game. Another session should begin from the latest GitHub `main` and [GitHub workflow](GITHUB_WORKFLOW.md). Sites access is needed for publication, not for ordinary source development. The deployment mirror and canonical GitHub history can have different commit IDs; verify source tree/content equality when publishing.

## Product intent and playable scope

**Current execution plan:** Jon chose Tauri/local play and requested independent implementation sessions ending in tested GitHub PRs. The initial [local dispatch](DISPATCH_LOCAL.md) is implemented and remains useful architecture history. New work uses the [Gravity Orchard dispatch](DISPATCH_GRAVITY_ORCHARD.md): GO1 simulation, GO2 realtime, GO3 phone, GO4 TV/tutorial, GO5 media, GO6 secure LAN, GO7 integration. Each has a separate branch, exclusive write set and report. No hosted migration/deployment is part of these scopes.

The TV displays the shared board, normally from a Mac browser cast to the living-room TV. Each phone owns one controller seat. Jon and Lydia are illustrated tiny mouse adventurers; their orange cat Lala rearranges the sofa kingdom. Generated game art is in `public/assets/`; original character sheets are not committed.

Keep characters lively and regular match screens spacious. Explanations belong in the optional tutorial, Help, and contextual dialogs. The latest feedback concerned unclear pounce effects and forecast targets, confusing consecutive turns across Lala, noticeable input delay, and a desire for deeper strategy. Those prompted the current update.

| Game | Status | Direction |
| --- | --- | --- |
| Sofa Kingdoms | Playable | Collect and bank crumbs while Lala shifts the board |
| Borrowed Minutes | Planned | Cooperative time-loop heist |
| Gravity Orchard | Planned | Real-time cooperative phone tilt, garden routing and shared picnic orders |
| Afterglow Market | Planned | Trade and build a night-market stall |
| The Odd Laws Society | Playable in the merged local collection | Six-session city builder with sealed bids, finite markets and changing shared laws |
| The Last Ninety Seconds | Planned | Mystery with clues split across phones |
| Footprints at Midnight | Planned | Hidden movement and tracking |

A planned catalog entry cannot create rooms. Odd Laws has all five integrated components and passed the ordinary enabled-card browser journey and combined native checks before the aggregate PR merged. New feedback continues through its own PR checks. The other planned games remain specifications.

### Latest planning direction — 20 November 2026

Jon requested strategy-game depth comparable in weight to Citadels / 7 Wonders. [Odd Laws Society v0.2](games/odd-laws-society.md) replaces the earlier 5×5 movement race with a six-session, four-action city builder: 3×3 boroughs, scarce public building stock, 18 building designs, 12 bounded laws, two active law slots, and simultaneous sealed influence bids. All five components are integrated at the reviewed heads in the WS6 matrix; automated component, protocol and rendered checks are recorded in the integration report. Human balance/playtime validation and combined native acceptance remain distinct gates. Private commitments require per-viewer projection; the old public-only integration advice is obsolete. The [parallel guide](PARALLEL_DEVELOPMENT.md) and session prompt have been updated accordingly.

[DEPLOYMENT_OPTIONS.md](DEPLOYMENT_OPTIONS.md) preserves the hosting and desktop research. The implemented local Tauri shell bundles the HTTP/SSE host, SQLite and assets; its current build and acceptance instructions are in [LOCAL_RELEASE.md](LOCAL_RELEASE.md). This integration does not publish the existing Site, migrate to Pages, introduce a cloud service or claim a measured casting/Wi-Fi improvement.

## Architecture

| Path | Responsibility |
| --- | --- |
| `ui/index.html`, `ui/app.js`, `ui/styles.css` | Authored document, collection, TV/phone views, networking, practice, tutorial, and Help |
| `ui/board-view.mjs`, `ui/board-view.css` | Forecast lane/cross overlays, coordinate highlights, turn order, and lookahead |
| `ui/action-queue.mjs` | Immediate controller prediction with serialized authoritative confirmation |
| `ui/transport.mjs` | Local-host metadata and authenticated fetch/SSE subscriptions |
| `ui/audio.js`, `ui/score.mjs` | Web Audio synthesis/lifecycle and the authored soundtrack |
| `ui/motion.js`, `ui/motion.css` | Layered character animation and action effects |
| `game/engine.mjs` | Pure deterministic state creation, rules, legal actions, previews, scoring, and forecasts |
| `games/catalog.mjs`, `games/registry.mjs` | Collection metadata and playable engine registration |
| `server/rooms.mjs` | Shared authoritative room API, credentials, presence, validation, and retry protection |
| `app/api/[...path]/route.ts` | Production Worker/D1 adapter |
| `server/lan.mjs`, `scripts/lan-server.mjs` | Optional Node HTTP/SQLite host and authenticated room streams |
| `start-sofa.command` | Mac launcher with a Node-version check |
| `db/schema.ts`, `drizzle/` | Room schema and checked-in migrations |
| `scripts/prepare-game.mjs` | Copies browser modules to `public/` and generates `app/route.ts` |
| `scripts/package-lan.mjs` | Generates the portable local-play ZIP from an explicit runtime allowlist |
| `public/assets/` | Background, character atlas, and QR dependency/license |
| `docs/LAN.md` | User setup and connection guidance for local play |

Production uses the Sites Vinext starter with a Cloudflare Worker and D1. The game interface is browser JavaScript/CSS authored in `ui/`; generated `public/` module copies and `app/route.ts` are not the source of truth. The LAN host serves `ui/` directly.

When adding a served module, update **all three lists**: production preparation, the LAN server's static allowlist, and the portable package allowlist. Retain the QR MIT license notice. Never include runtime databases, credentials, checkout metadata, or installed dependencies in the local ZIP.

## Rules and compatibility

The board is 5×5 and all-walkable. A match lasts ten rounds, with two actions per player per round. Players move, collect into a five-crumb bag, bank at their fixed home, spend a toy, or end early. Homes are Jon at A5 and Lydia at E1.

New matches have engine `version: 3`:

- `firstPlayer` is drawn from an independent deterministic seed stream; normal hosted and practice games supply fresh seeds. The initial second player receives `openingBonus: 1`, the starter receives zero. This is a one-time secured point, not an extra crumb or action. `SECOND_PLAYER_BONUS` is the tuning constant; equal win rates have not been established.
- `roundStarter(state, round)` alternates relative to `firstPlayer`; v1/v2 games keep their historical Jon-first parity. The tutorial passes `firstPlayer: 'jon'` for repeatable lessons. Invalid explicit overrides are rejected.

- Banked crumbs score one point each; banking a full five-crumb bag also awards **two bonus points**.
- Banking at least three crumbs restores **one used toy**, capped at two.
- One action and one toy can select any row or column and either direction for the current swipe. Choosing the unchanged forecast is invalid. Pounces and naps cannot be redirected.
- `banked` remains the conserved physical crumb count. `bonusPoints` records delivery bonuses and `openingBonus` records the one-time second-player allowance. `scoreFor(player)` adds all three for display/scoring.
- `upcomingForecasts(state, count = 1)` returns the following one or two deterministic events as `{ round, ...forecast }`, stopping at the final round. Current toys do not alter future forecasts.

Existing version 1 states retain their original scoring, non-replenishing toys, and same-axis/same-direction redirection through match completion. Version 2 states keep delivery bonuses, recharging toys, and expanded steering, with Jon as their initial starter and no opening point. Starting a new match creates version 3. Keep these compatibility paths when changing rules.

Lala resolves after both players' turns. A swipe moves the selected tiles, crumbs, and occupants one square with edge wrapping; home positions stay fixed. A pounce affects the center and four orthogonal neighbours, **not diagonals**. Caught players drop every carried crumb onto their current tile and return home, retaining banked points. A nap leaves the board unchanged. Nobody is eliminated; equal final scores share the crown.

Turn order alternates relative to the initial draw: **drawn starter → other player → Lala**, then **other player → drawn starter → Lala**. The same player therefore receives a fresh turn after Lala in alternating rounds. The UI shows the actual round order and announces the scheduled starter even when `activePlayer` stays the same. Legacy games and the pinned tutorial use Jon as the initial starter.

Swipes use a continuous amber lane, highlighted coordinate, and direction cues. Pounces use a coral five-cell cross and a center target. Landing previews stay optional; the forecast card also shows the following round's event.

## Room authority and responsiveness

Rooms have six-character codes and a 24-hour lifetime. Each records `gameId`, phase, seats, engine state, and recent action IDs. Old rooms without `gameId` default to Sofa Kingdoms; unknown/planned games are rejected before creation.

The TV owns a host credential; phones own separate seat credentials. Only hashes are stored in room data, and public responses redact them. QR codes contain join links without credentials. Browsers retain their own credentials for refresh/reconnection. Presence updates do not increment gameplay revisions. Compare-and-swap revisions and action IDs protect against concurrent and repeated requests.

The controller now predicts legal input immediately with the shared engine. `ui/action-queue.mjs` sends queued commands one at a time against acknowledged revisions, preserves IDs for retries, reconciles GET/stream updates, rolls back rejected predictions, and discards old plans when the match changes. Predictions never become server authority. Room epoch/code/seat guards and teardown prevent late responses from changing another screen. Tutorial entry releases pending prediction before saving its return context.

The public Site targets **250 ms polling during visible play**, replacing 1,400 ms. Lobbies target 900 ms, hidden tabs 5 seconds, and an active LAN stream retains a 10-second polling fallback. In-flight reads are not overlapped. These are scheduling intervals, not measured end-to-end latency guarantees.

The LAN host reuses `handleApi()` with built-in SQLite and pushes authoritative snapshots through authenticated SSE at `/api/rooms/CODE/events`. It validates credentials for streams, maintains presence, supports reconnects, rejects foreign Origins/unknown Host headers, and allowlists static files. Tokens stay in Authorization headers. Local metadata enables streaming and supplies a phone-reachable join origin even when the Mac opened localhost.

Steering idempotency keys include explicit `axis` and `direction` while preserving omitted fields for older index-only requests. Do not infer omitted fields from the current forecast when computing retry identity: a later action may have changed it.

## Development and local play

Use Node.js **22.13 or newer**. For the full framework checkout, use the checked-in lockfile and `npm run install:ci` when installation is needed. The wrapper selects managed or portable execution settings; do not commit machine-local profiles.

| Purpose | Command |
| --- | --- |
| Relevant automated suites | `npm test` |
| Framework development | `npm run dev` |
| Framework production build | `npm run build` |
| Mac/LAN host | `npm run lan` or `node scripts/lan-server.mjs` |
| Portable local download | `npm run package:lan` |

The Mac launcher `start-sofa.command` performs the Node check and starts the LAN host. Local play needs no dependency installation or framework build. Default port is 4177; `--port 4178` selects another. Rooms persist in ignored `.sofa-lan/rooms.sqlite`. The public Site and LAN host use separate room stores. See [LAN.md](LAN.md) for setup and connection guidance.

`npm run package:lan` creates `public/downloads/sofa-arcade-local.zip`, including runtime source, art, migrations, launcher, and instructions. Regenerate it after relevant source edits, before Site packaging. This command does not publish by itself; normal Site publication serves the generated download.

Framework dev/build prepare generated assets automatically. `npm run db:generate` is only for schema changes. Apply the checked-in D1 migration before framework multiplayer preview; the LAN host applies its SQLite migrations itself. In a managed Sites session, use the documented managed preview and `build-site.mjs` workflow, then stop the preview when finished.

## Verification recorded for this update

At this documentation update, **66 Node tests passed**: 25 engine, 17 room API, 10 action queue, 4 LAN server, 5 browser transport, and 5 score checks. Opening tests exercise both starters, deterministic seeds, one-time compensation, scoring, alternating order, and v1/v2 compatibility. Coverage includes 64 complete seeded matches, resource conservation, bonuses/recharge, classic-room compatibility, steering retries, rapid queued inputs, rematch/cancellation races, real HTTP/SSE updates, credential redaction/rotation, local persistence, safe static routes, and stream reconnects.

Managed-browser checks covered the clearer row/column targets, pounce cross, toy axis/direction choices, and the full eight-step tutorial, including the corrected toy lesson and return to the original practice match at round three. A real server room with a TV view and 360 px Jon/390 px Lydia controller frames synchronized rapid move/collect inputs across all three views. Reversing the same row's direction moved Lydia from E1 to D1; the round-two Lydia-start announcement and fresh two actions appeared correctly on the TV and controllers. A complete five-crumb delivery displayed the contextual bank bonus and awarded seven points. These were browser frames, not physical phones. The controller's round announcement uses the scheduled starter, including when two fast moves advance to the second player's turn before a poll arrives. Consult Sites version history for the production build and publication of the corresponding source commit.

The randomized-opening update was also checked in the managed browser: a Lydia-first practice match gave Jon one opening point, round two started Jon, and a separate shared room gave Lydia the point when Jon started. The TV and 360/390 px phone frames agreed through rapid move/collect inputs and the next-round transition. The complete eight-step tutorial still finished and returned to its saved match. Transient opening/round messages are cleared on tutorial and navigation boundaries.

The portable ZIP was checked for valid CRCs, safe paths, and executable launcher permissions. A fresh extracted copy without `node_modules` served its modules, created a room, joined both seats, started a match, and accepted a move. These were executor/loopback checks, **not measurements on Jon's Mac, home Wi-Fi, or TV**. Casting can add display delay independently of controller transport.

Earlier releases verified the collection/tutorial flows and the composed soundtrack, **Lala’s Little Waltz**: a 32-bar G-major AABA waltz at 104 BPM, with a sustained woodwind melody, bass, and quiet pizzicato. Preserve the complete menu melody, TV-only music, saved music/effects/volume preferences, quiet phone defaults, gesture unlocking, and hidden-page pause. Score/code and lifecycle checks do not imply an auditory evaluation.

## Reopen and publish the same Site

1. Read the installed **Sites** skill, fetch the exact project above, and verify current source/access.
2. Obtain fresh short-lived source access and open the latest pushed source using the prescribed `site-workflow.mjs` input. Retain its complete opening result and returned checkout.
3. Implement and verify changes. The checkout path is session-specific, not the project identity. Regenerate the local download when its included source changes.
4. Package through the same source workflow with the opening result, fresh credential, remaining ordered checks/build, and an absolute archive destination. Let the helper prepare Git, commit/push, verify, and package.
5. Save that exact returned project ID/commit/archive and deploy the saved version to the existing public Site. Verify the reported outcome.

Use the current skill's tool schemas and helper paths. Never put credentials into command arguments, documented remotes, checked-in files, or handoffs. Preserve the audience and resume an existing publication attempt instead of starting duplicates.

## Future games and portability

Keep all games in this collection. Register a new engine and mark its catalog entry playable only after its rules, views, phone controls, and meaningful tests are complete. Before private clues or hidden movement, implement **per-role state projection** for every read/push channel. The current Sofa Kingdoms envelope exposes its whole public board. Extend action validation and canonical retry normalization for each new action shape.

Future refinements can deepen animation poses, add original themes, or tune strategy from actual play feedback. Current character motion is procedural animation of illustrated cutouts, not a complete frame-by-frame atlas.

Use GitHub `jonathanjie/sofa-arcade` for source changes, branches, and review. Keep Sites as the host and follow [GitHub workflow](GITHUB_WORKFLOW.md). GitHub Pages alone cannot execute the existing Worker/D1 backend; a hosting migration must supply compatible multiplayer services and test joins, actions, and reconnects. The optional LAN bundle is a local runtime package, not a replacement for the complete hosted-project repository.

## New-game work and networking

The six [game PRDs](games/README.md) are provisional implementation briefs. [Parallel development](PARALLEL_DEVELOPMENT.md) assigns isolated game folders, shared-platform gates, integration order, and session prompts. Keep their catalog entries planned until the acceptance gates pass. [Networking](NETWORKING.md) records current primary-source evidence and proposed push/WebRTC options; no new cloud transport was implemented with the opening-rule release.
