# Working on Sofa Arcade

Read [README.md](README.md) for the product and [docs/HANDOFF.md](docs/HANDOFF.md) for architecture, verified history, hosting identity, and unfinished work. Inspect the current source before assuming a handoff describes the latest release.

## Product direction

- Keep the entire game collection in this repository and this Site. Sofa Kingdoms and Odd Laws Society are playable in the local GitHub baseline; other catalog entries remain planned.
- **Current implementation priority (20 November): local Tauri on Jon's Mac, with two phone browsers over LAN.** Follow [docs/DISPATCH_LOCAL.md](docs/DISPATCH_LOCAL.md) and [docs/LOCAL_IMPLEMENTATION_CONTRACT.md](docs/LOCAL_IMPLEMENTATION_CONTRACT.md). The six local workstream assignments supersede overlapping broad ownership descriptions below and in the older parallel guide. Preserve the existing Site, but do not deploy it, migrate to Pages, or build a hosted WebSocket service as part of these local assignments.
- **Next game: Gravity Orchard v0.2, real-time cooperative tilt play.** Use [docs/DISPATCH_GRAVITY_ORCHARD.md](docs/DISPATCH_GRAVITY_ORCHARD.md) and [docs/GRAVITY_ORCHARD_CONTRACT.md](docs/GRAVITY_ORCHARD_CONTRACT.md). Its seven exclusive assignments supersede older overlapping ownership for this new game. GO7 alone edits existing shared server/native/shell wiring; GO1–GO6 deliver injected components. The archived turn-based Gravity Orchard draft is not the implementation plan. Preserve the completed local games and their reviewed component checks.
- The living-room TV shows the board, usually through a Mac browser cast to the TV. Two phones control Jon and Lydia. Lala is their orange cat and the playful board disruptor.
- Preserve the warm illustrated character style and dynamic motion. Keep regular TV and phone screens uncluttered; explanations belong in the optional tutorial or Help.
- Music belongs on the host/practice screen. Phone controllers start quiet. Retain independent music/effects settings, gesture-based audio unlocking, and reduced-motion support.

## Canonical source and parallel work

- Use **https://github.com/jonathanjie/sofa-arcade**, branch `main`, as the source of truth from now on. Fetch/reconcile its latest state before implementation. Do not assume a Sites checkout is current when another session may have updated GitHub.
- Read [docs/GITHUB_WORKFLOW.md](docs/GITHUB_WORKFLOW.md). Keep the existing public Site as hosting, with a separate deployment mirror when its managed Git workflow requires it. Verify reviewed GitHub source and deployed source trees agree; different commit IDs do not imply matching contents. Do not claim pushes automatically deploy.
- Use one `feature/<game-id>` branch per game and follow [docs/PARALLEL_DEVELOPMENT.md](docs/PARALLEL_DEVELOPMENT.md). Start from the relevant [game PRD](docs/games/README.md); these proposed contracts are not all implemented. A shared-platform integrator owns catalog/registry, room APIs, shell routing, and delivery allowlists.
- For the current local release, use the finer WS1–WS6 branches and exclusive paths in the dispatch pack. Each session uses its own worktree/clone, writes only its owned workstream report, tests its component, and opens a PR. Shared wiring and final acceptance belong to WS6; component sessions do not self-merge or publish. Use fixtures/injection/existing Sofa Kingdoms to avoid waiting on unfinished components.

## Source and development

- Use Node.js **22.13 or newer** and the checked-in lockfile. `npm run install:ci` is the repository's dependency-install wrapper when installation is needed.
- Edit `ui/` for the authored interface, styles, audio, and motion. `scripts/prepare-game.mjs` generates served copies in `public/` and `app/route.ts`; do not fix those generated copies alone. Artwork and license notices in `public/assets/` are source assets and should be retained.
- Rules live in `game/engine.mjs`; shared room authority lives in `server/rooms.mjs`; collection metadata and engine registration live in `games/`. Board forecasting is in `ui/board-view.mjs`; controller prediction is in `ui/action-queue.mjs`; optional LAN streaming is in `ui/transport.mjs` and `server/lan.mjs`.
- `npm test` checks rules, room contracts, optimistic input, LAN/stream transport, and score integrity. `npm run dev` and `npm run build` prepare generated assets automatically. Use the installed Sites skill's current preview and build workflow in a managed Sites environment.
- Run relevant tests and a production build for code changes. For UI, music, or controller changes, exercise the affected browser flow as well. Report what was checked and what remains unverified. Documentation-only changes need a diff review rather than unrelated test runs.

## Rules and local play

- New matches use engine version 3: five-crumb deliveries earn two bonus points; deliveries of at least three restore one toy up to two; toys can choose swipe axis, line, and direction. Keep secured crumbs and `bonusPoints` separate. Existing version 1 and 2 matches retain their original rules until the next match.
- New matches randomly choose `firstPlayer`, give the other player one protected `openingBonus` point, and alternate round starters relative to that choice. Use `roundStarter(state)` rather than hardcoded Jon-first parity; old v1/v2 matches keep Jon-first order. The tutorial explicitly pins Jon. This allowance is a balance hypothesis, not proof of equal win rates. Pounce affects only its center and four orthogonal neighbours, drops carried crumbs on their current tile, and returns caught players home without taking banked points.
- `npm run lan` or `start-sofa.command` starts the optional Mac host on port 4177 with Node 22.13+, without installing dependencies or building the framework. Read [docs/LAN.md](docs/LAN.md). The host serves `ui/` directly and persists separate local rooms in ignored `.sofa-lan/` data.
- When adding served browser modules, keep `scripts/prepare-game.mjs`, `server/lan.mjs`, and `scripts/package-lan.mjs` allowlists aligned. Regenerate `public/downloads/sofa-arcade-local.zip` with `npm run package:lan` after source changes and before release packaging. Never package runtime databases, credentials, or checkout metadata.

## Multiplayer and future games

Keep server-authoritative actions, revision checks, retry idempotency, seat ownership, credential redaction, and old-room compatibility intact. Immediate controller prediction must not become authority: serialize queued commands against acknowledged revisions, preserve IDs on retries, and discard invalid predictions when state or match changes. Keep stream credentials in Authorization headers and cancel old-room work on navigation. Do not put bearer credentials in URLs, QR codes, logs, or documentation.

Before enabling a new game, implement its real engine and controls, validate its action payloads, and extend action normalization for safe retries. Add role-specific state projection before introducing private clues or hidden movement: the current public room envelope exposes the complete Sofa Kingdoms board. Keep unfinished games marked `planned`.

## Continue the existing deployment

The project is **Sofa Arcade**, hosted through ChatGPT Sites; its legacy URL and package/folder name still contain `sofa-kingdoms`. The exact project ID and live URL are in `docs/HANDOFF.md` and `.openai/hosting.json`. Preserve that identity and its public access.

For Sites publication, first establish the exact reviewed GitHub source revision. Read the installed Sites skill and open the existing deployment mirror through its source workflow helper using fresh short-lived credentials through prescribed stdin. Retain the opening result, transfer the reviewed tracked snapshot safely, and verify source equality. Let the helper build/commit/push/package; save and deploy that exact result to the existing Site. Never overwrite newer GitHub work with a stale deployment checkout. Never commit credentials.

GitHub is canonical version control; ChatGPT Sites remains the Worker/D1 host. Preserve the existing backend when changing deployment arrangements: GitHub Pages alone cannot execute multiplayer rooms. Report exactly what source, tests, and publication were verified.
