# Working on Sofa Arcade

## Start here

Read the [collection guide](README.md), the [handoff](docs/HANDOFF.md) and the relevant game or platform contract. Check current source and Git history before using a handoff. Keep the whole collection in the canonical `jonathanjie/sofa-arcade` repository and on its existing public Site. Fetch and reconcile GitHub `main` before implementation. Preserve concurrent and newer work. Follow the [GitHub and Sites workflow](docs/GITHUB_WORKFLOW.md).

## Product and host roles

Design for one Mac host, a shared TV board and two phone browsers controlling Jon and Lydia. Keep Lala, their orange cat, as the playful board disruptor. Preserve the warm illustrated characters and purposeful motion. Keep play screens clear. Put explanations in the optional tutorial or Help.

Play music on the host or practice screen. Start phone controllers quiet. Retain separate music and effects settings, gesture-based audio unlocking and reduced-motion support.

Check the catalog, registry and host capabilities for availability. Require the local realtime coordinator for Gravity Orchard. Follow its [runtime contract](docs/GRAVITY_ORCHARD_CONTRACT.md). Report physical-phone tilt, certificate trust and latency as open until tested on the devices.

## Branches and ownership

Start each game from its [design brief](docs/games/README.md) on a `feature/<game-id>` branch. Use an isolated worktree or clone for independent work. Agree on owned files and a report. Leave the shared catalog, registry, room API, shell routing and delivery inventories to the integrator. Use fixtures, injection or Sofa Kingdoms when a dependency is incomplete. Test the component and submit a PR for review. Coordinate merging and publication through the integrator. Use the [parallel development checklist](docs/PARALLEL_DEVELOPMENT.md).

## Authoring and checks

Use Node.js 22.13 or newer and the checked-in lockfile. Install root dependencies with `npm run install:ci`. Follow the [release guide](docs/LOCAL_RELEASE.md) for the pinned ZIP and desktop toolchains, suite commands and delivery inventories.

Edit interface, styles, audio and motion in `ui/`. Preserve source art and license notices in `public/assets/`. Regenerate served copies in `public/` and `app/route.ts` through `scripts/prepare-game.mjs` or the framework dev/build commands. Update shared inventories, LAN mappings and desktop staging where applicable. Regenerate affected private bundles and the portable ZIP before release. Exclude credentials, runtime databases, development dependencies and checkout metadata.

Run focused tests and a production build for code changes. Exercise the affected browser flow after UI, music or controller changes. Check unit-test skips and run applicable browser and nested suites separately. Review the diff and links for documentation changes. Report what passed and what remains unverified.

## Rules and room authority

Maintain Sofa rules in `game/engine.mjs` and forecasts in `ui/board-view.mjs`. Preserve normal v3 scoring, toy recharge, steering, opening order and pounce behavior. Use `roundStarter` and keep banked crumbs, delivery bonuses and the opening point separate. Preserve v1/v2 rules until rematch. Keep v4 opt-in until sealed toys have room projection, action handling and support on both screens. Follow the [rules and compatibility reference](docs/games/sofa-kingdoms.md).

Keep room authority in `server/rooms.mjs`. Preserve revision checks, seat ownership, credential redaction and legacy rooms. Serialize predicted commands in `ui/action-queue.mjs` against acknowledged revisions. Retain IDs on retries, discard invalid predictions on state or match changes, and cancel old-room work on navigation. Use Authorization headers for authenticated HTTP/SSE and the bounded first auth frame for Gravity sockets. Keep bearer credentials out of URLs, QR codes, logs and documentation.

Require real rules and controls, bounded payload validation and canonical retry identity before enabling a game. Project state for each authenticated role before introducing secrets. Keep unfinished games marked `planned`.

## Run and publish

Use the [LAN guide](docs/LAN.md) to run the portable host on port 4177 with `npm run lan` or `start-sofa.command`. Keep its ignored `.sofa-lan/` store separate from native and hosted rooms. Maintain LAN transport in `ui/transport.mjs` and `server/lan.mjs`. Use the installed Sites skill for managed preview, build and authorized publication. Preserve the Site identity, public access, existing links and Worker/D1 backend. Use fresh short-lived credentials through the prescribed stdin and retain the opening result. Transfer the reviewed tracked snapshot safely. Verify tree equality, deploy the exact result built and packaged by the helper, and verify publication separately from the GitHub push.
