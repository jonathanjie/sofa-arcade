# Working on Sofa Arcade

## Start here

Read the [collection guide](README.md), the [handoff](docs/HANDOFF.md) and the relevant game or platform contract. Check current source and Git history before using a handoff. Keep the whole collection in [jonathanjie/sofa-arcade](https://github.com/jonathanjie/sofa-arcade) and on its existing public Site. Fetch and reconcile GitHub `main` before implementation. Preserve concurrent and newer work. Follow the [GitHub and Sites workflow](docs/GITHUB_WORKFLOW.md).

## Product and host roles

Design for one Mac host, a shared TV board and two phone browsers controlling Jon and Lydia. Keep Lala, their orange cat, as the playful board disruptor. Preserve the warm illustrated characters and purposeful motion. Keep play screens clear. Put explanations in the optional tutorial or Help.

Play music on the host or practice screen. Start phone controllers quiet. Retain separate music and effects settings, gesture-based audio unlocking and reduced-motion support.

Check `games/catalog.mjs`, `games/registry.mjs` and host capabilities for availability. Sofa Kingdoms, Odd Laws Society and Gravity Orchard are playable on the local host. The hosted Site keeps Gravity Orchard unavailable because it lacks the realtime coordinator. Follow the [Gravity Orchard runtime contract](docs/GRAVITY_ORCHARD_CONTRACT.md). Report physical-phone tilt, certificate trust and latency as open until tested on the devices.

## Branches and ownership

Start each game from its [design brief](docs/games/README.md) on a `feature/<game-id>` branch. Use an isolated worktree or clone and limit edits to your assigned files and report. Use fixtures, injection or Sofa Kingdoms when a dependency is incomplete. Test the component and submit a PR for review. The integrator owns the catalog and registry, `server/rooms.mjs`, routing in `ui/app.js`, the delivery files below and final acceptance. Leave merges and publication to the integrator. Use the [parallel development checklist](docs/PARALLEL_DEVELOPMENT.md).

## Authoring and checks

Use Node.js 22.13 or newer and the checked-in lockfile. Install root dependencies with `npm run install:ci`. Follow the [release guide](docs/LOCAL_RELEASE.md) for the pinned ZIP and desktop toolchains, suite commands and delivery inventories.

Edit interface, styles, audio and motion in `ui/`. Preserve source art and license notices in `public/assets/`. `node scripts/prepare-game.mjs`, `npm run dev` and `npm run build` regenerate served copies in `public/` and `app/route.ts`. Fix the authored source first.

Keep `scripts/runtime-files.mjs` (used by `scripts/prepare-game.mjs` and `scripts/package-lan.mjs`) aligned with the explicit routes in `server/lan.mjs` and staging in `desktop/runtime-manifest.json`. Gravity Orchard shares delivery entries in `server/gravity-orchard-delivery.mjs`. After changes to shipped files, run `npm run package:lan` with Node.js 24.22.3 to regenerate `public/downloads/sofa-arcade-local.zip`. Run `npm run bundle:runtime` when its host inputs change. Exclude credentials, runtime databases, development dependencies and checkout metadata.

`npm test` uses `scripts/run-unit-tests.mjs` to discover `*.test.mjs` recursively in `game/`, `games/`, `server/` and `ui/`. New eligible tests need no registration. The default suite requires locked root dependencies. Only `npm run test:standalone` skips tests with missing packages. Use `npm run test:exhaustive` for the full game proofs, `npm run test:realtime:exhaustive` for the full realtime input and checkpoint checks, and `npm run test:cloud` after a build for the local Worker and D1. Run the listed browser tests with `npm run test:browser` after `npx playwright install chromium`. For the nested secure-LAN suite, run `npm ci --prefix server/secure-lan` then `npm test --prefix server/secure-lan`.

Run `npm run lint`, focused tests and a production build for code changes. Lint checks authored code and caches results by content in `work/eslint/`. Generated delivery copies and build output are excluded. Exercise the affected browser flow after UI, music or controller changes. Review the diff and links for documentation changes. Report the source checked, which checks passed and what remains open.

## Rules and room authority

Maintain Sofa Kingdoms rules in `game/engine.mjs` and forecasts in `ui/board-view.mjs`. Keep v3 as the normal ruleset. Use `roundStarter(state)` and keep `banked`, `bonusPoints` and `openingBonus` separate. Preserve v1/v2 rules until rematch. Keep v4 opt-in until sealed toys have room projection, action handling and support on both screens. Follow the [v3 scoring, toy, opening and pounce rules](docs/games/sofa-kingdoms.md).

Keep room authority in `server/rooms.mjs`. Preserve revision checks, seat ownership, credential redaction and legacy rooms. Serialize predicted commands in `ui/action-queue.mjs` against acknowledged revisions. Retain IDs on retries, discard invalid predictions on state or match changes, and cancel old-room work on navigation. Use Authorization headers for authenticated HTTP/SSE and the bounded first auth frame for Gravity sockets. Keep bearer credentials out of URLs, QR codes, logs and documentation. Preserve the exact same-origin and JSON requirements for LAN writes and the room, socket and SSE limits in the [LAN guide](docs/LAN.md).

Require real rules and controls, bounded payload validation and action normalization for stable retry identity before enabling a game. Project state for each authenticated role before introducing secrets. The legacy Sofa Kingdoms room adapter exposes the full board. Keep unfinished games marked `planned`.

## Run and publish

Run the portable host on port 4177 with `npm run lan` or `start-sofa.command`. It serves `ui/` directly with no dependency install or framework build. Keep its ignored `.sofa-lan/` store separate from native and hosted rooms. Maintain LAN transport in `ui/transport.mjs` and `server/lan.mjs`. Follow the [LAN guide](docs/LAN.md).

Keep local work local. Publish to Sites, migrate hosting or add hosted realtime only when separately authorized. A GitHub push does not deploy the Site. Preserve its identity in `.openai/hosting.json`, public access, links and Worker/D1 backend. Use the installed Sites skill for managed preview and build. For publication, pin the reviewed GitHub revision and open the managed mirror with fresh short-lived credentials through the helper's prescribed stdin. Keep credentials out of commits. Retain the opening result and transfer the reviewed tracked snapshot safely. Let the helper build, commit, push and package the mirror. Verify tree equality, save and deploy that exact result, then verify and report publication separately.
