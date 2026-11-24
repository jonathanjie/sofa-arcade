# Sofa Arcade

A collection of living-room games for Jon and Lydia: one local Mac host, one shared TV, two phone browsers, and one source repository. **Sofa Kingdoms** is a crumb-collecting rivalry; **The Odd Laws Society** adds a six-session strategy city builder with sealed councils.

**Canonical source:** [jonathanjie/sofa-arcade](https://github.com/jonathanjie/sofa-arcade). This branch integrates the local Tauri release. See [local setup, builds and acceptance](docs/LOCAL_RELEASE.md), the [archived component checkpoint](docs/archive/local-release-components.json), and [integration evidence](docs/archive/workstreams/integration.md). The existing hosted version is a separate delivery path; this work does not publish it.

## The collection

| Game | Status | Idea |
| --- | --- | --- |
| Sofa Kingdoms | Playable | A crumb-collecting rivalry on a board rearranged by Lala |
| Borrowed Minutes | Planned | A cooperative time-loop heist with echoes of earlier attempts |
| Gravity Orchard | Playable on the local Mac host | Tilt your garden and pass fruit across the bridge to fill picnic orders together |
| Afterglow Market | Planned | Build and trade at an unpredictable night market |
| The Odd Laws Society | Playable in the local integration candidate | Build a nine-plot borough through six sealed councils, finite markets and changing laws |
| The Last Ninety Seconds | Planned | Reconstruct a mystery from clues split across two phones |
| Footprints at Midnight | Planned | Hidden movement through a moonlit garden |

Planned entries describe the collection's direction; they do not start dummy matches. All games belong to this same project. The published URL and existing room links stay valid as the collection grows.

## Play

1. Start the local host on the Mac (see below), open its printed LAN address, select **Sofa Kingdoms** or **The Odd Laws Society**, and host a game.
2. Scan the room QR code on each phone, or open the same local address and enter its six-character room code.
3. Choose Jon on one phone and Lydia on the other.
4. Start the match from the TV. Use the phones for moves and actions.

The TV can display the Mac's full-screen browser. The Mac and both phones use the same LAN for local play; no cloud account is required. The existing public Site retains its separate server-backed room path.

Sofa Kingdoms **Practice** runs in one browser without a room or a second device and lets you control both characters.

Each game's optional **Tutorial** teaches its actions separately from the live room, can be replayed, and remembers completion on each device. The normal match keeps explanations in Help so the TV can emphasize the board and phones can emphasize the controls.

### Play over home Wi-Fi

Choose **Play over local Wi-Fi** on the game menu for the portable download. Install Node.js **22.13 or newer** on the Mac, unzip the game, and open `start-sofa.command`. In a complete checkout, `npm run lan` starts the same host; the direct command is `node scripts/lan-server.mjs`.

Open the local address printed in Terminal, host a room, and scan its QR with both phones. Keep the Mac and phones on the same home network and leave Terminal open. The local host pushes room changes immediately and saves them in a local SQLite database. It needs no dependency installation, framework build, cloud account, or internet connection during play once the files and Node.js are available. Local rooms are separate from public Site rooms. Screencasting can still add display delay.

See [docs/LAN.md](docs/LAN.md) for setup, connection help, and the optional port setting.

## Sound and motion

The collection menu welcomes you with **Make Yourself at Home**, an original 32-bar G-major waltz at 92 BPM. A recurring woodwind invitation returns around a contrasting E-minor middle section, with gentle plucked accompaniment and written breaths. Selecting a game and returning to the shelf have brief matching sound cues. The pure score and cue data are in `ui/media/sofa-menu/`.

Sofa Kingdoms has **Lala’s Little Waltz**, an original 32-bar composition in G major and 3/4 time at 104 BPM. A rounded woodwind melody repeats in an AABA form over a gentle bass-and-pizzicato accompaniment, with a contrasting middle section, held phrase endings, and written breaths. Its game detail screen retains the melody with a quieter accompaniment. The score is in `ui/score.mjs`; Web Audio synthesizes it locally without external audio services.

Odd Laws adds **Lala Calls the House**, a 32-bar F-major AABA score in 4/4 at 100 BPM, with arrangements for the council, three terms and results. Both games share one audio lifecycle and the same saved controls; switching games stops the previous score.

Music and effects have separate toggles and a saved volume setting. A direct click, tap, or Enter/Space interaction unlocks menu audio. Music follows the collection, TV/host, or practice screen through one audio engine; phone controllers start quiet, with their own optional effects toggle. Leaving a controller or Join screen keeps that session's menu quiet until explicitly hosting or starting practice. Background tabs pause their soundtrack.

Characters use the illustrated atlas with layered movement and action effects: idle motion, mouse hops, crumb pickups, banking celebrations, and Lala's swipe, pounce, and nap. The animation system respects the device's reduced-motion preference. This is procedural animation of illustrated characters rather than a full frame-by-frame character atlas.

## Rules

### The Odd Laws Society

Build a nine-plot borough across six council sessions. Both players secretly choose a proposed law and an influence bid on their own phones; the TV shows readiness until both have sealed. Take Build, Work, Festival or Lobby actions against a finite shared market and the active laws. Final prestige combines buildings, streets, festivals, civic laws and treasury; equal totals share victory. The optional ten-lesson tutorial and in-game Help explain the details. See [the complete rules](docs/games/odd-laws-society.md). The catalog's 35–45 minute duration is a design target awaiting human playtime validation.

### Sofa Kingdoms

- Ten rounds, two actions per player per round. Move one square, collect crumbs, bank at your own burrow, use a toy, or end your turn early.
- Bags hold five crumbs. Banked crumbs score one point each. **A full five-crumb delivery adds two bonus points.** Carried crumbs do not score.
- Each player starts with two toys. **Banking three or more crumbs restores one used toy**, up to two.
- A toy costs one action and one toy. Choose any row or column and either direction for Lala's current swipe. Toys cannot change a pounce or nap.
- After both turns, Lala performs the displayed forecast. Swipes carry tiles, crumbs, and players one square and wrap at the edge. Burrows stay fixed.
- A pounce hits the marked square plus the squares above, below, left, and right. **Diagonals are safe.** Caught players drop every carried crumb on their current square and return home. Banked points remain safe; nobody is eliminated.
- After the last round, banked crumbs plus delivery bonuses and the opening point decide the winner. Equal scores share the crown.

Each new match randomly draws its first player. The second player receives **one secured opening point**, separate from physical crumbs and delivery bonuses. This small allowance is a tunable balance hypothesis, not a measured claim about win rates. Both players still receive two actions per turn.

| Round | Order |
| --- | --- |
| 1 | Drawn starter → other player → Lala |
| 2 | Other player → drawn starter → Lala |
| 3 | Drawn starter → other player → Lala |

The same player therefore receives a fresh two-action turn immediately after Lala in alternating rounds. The opening announcement, round-order strip, and new-round announcement explain the sequence. The tutorial deliberately starts as Jon for its scripted lessons.

An amber lane and direction markers identify the next swipe; a coral cross identifies a pounce. **Preview** shows landing squares, and **Next round** reveals the following forecast. This supports planning a ride home, a safer delivery, or a toy counterplay.

New matches use rules version 3. Existing version 2 matches retain Jon as their initial starter and have no opening allowance; version 1 matches also retain their original banked-crumb scoring and non-replenishing toys. A fresh match uses the current rules. The board remains all-walkable, forecasts resolve deterministically, and no external AI calls are required during play.

## Development

**Current integration: Tauri and local play.** The [dispatch pack](docs/archive/DISPATCH_LOCAL.md) and [local implementation contracts](docs/archive/LOCAL_IMPLEMENTATION_CONTRACT.md) define the five components and shared acceptance. All five reviewed immutable heads are assembled. Four complete Odd Laws browser matches and the Sofa regression journey passed at `4695643`; the Odd Laws card is now enabled. The normal collection-create rerun and combined native acceptance remain gates, so the aggregate PR is still draft. See the [acceptance report](docs/archive/workstreams/integration.md) for exact source and evidence.

Start with [AGENTS.md](AGENTS.md) and [docs/HANDOFF.md](docs/HANDOFF.md) to continue the project in another coding session. **GitHub `jonathanjie/sofa-arcade` is the source of truth.** Branch from its latest `main`, keep one game per feature branch, and reconcile upstream changes before merging. Sites keeps a deployment mirror for its publication workflow; it is not a competing development branch. [GitHub workflow](docs/GITHUB_WORKFLOW.md) describes the separate source and deployment checkouts.

For game designs and the five remaining planned games, start with the [game design documents](docs/games/README.md) and [parallel development guide](docs/PARALLEL_DEVELOPMENT.md). The [networking design note](docs/NETWORKING.md) and [hosting and desktop options](docs/archive/DEPLOYMENT_OPTIONS.md) preserve the earlier research and alternatives. Current local implementation and acceptance are tracked in [the release guide](docs/LOCAL_RELEASE.md); the existing public Site has not been republished by this integration.

Requires Node.js 22.13 or newer. The application uses the Sites Vinext starter, a Cloudflare Worker and D1 for shared room state. Sofa Kingdoms rules are in the dependency-free `game/engine.mjs`; `server/rooms.mjs` validates multiplayer actions.

```sh
npm run install:ci
npm test
npm run dev
```

`npm run db:generate` is needed only for schema changes. The database migration is checked in under `drizzle/`. Apply it to the local D1 database before testing multiplayer in a local preview; production migrations are applied by Sites publication. See the installed Sites workflow for local migration and hosting commands.

`ui/` contains the authored collection shell, game interface, tutorial, board forecast helpers, action prediction queue, transport, audio, and motion modules. `scripts/prepare-game.mjs` copies browser modules and the public game engine to served assets before development and builds. Delivered artwork lives in `public/assets/`. Authoring sources and review sheets remain in the repository but are excluded from the runtime; the framework stages an explicit public directory before serving/building. When adding a browser module, update `BROWSER_FILES` in `scripts/runtime-files.mjs`, the local static allowlist in `server/lan.mjs`, and, after its handoff, `desktop/runtime-manifest.json`. Preparation and the portable packager share the explicit runtime inventory. Odd Laws authority/projection are host-only; its browser closure is catalog, preview and safe errors.

### Local-play download

`npm run package:lan` creates `public/downloads/sofa-arcade-local.zip` from an explicit runtime allowlist, including the Mac launcher and local-play instructions. It uses Node built-ins and excludes credentials, runtime databases, Git/Sites metadata, installed dependencies, and build output. Rebuild this download after relevant source changes and before packaging the Site release. The command creates the file; the normal Site publication makes it available online.

### Adding the next game

`games/catalog.mjs` is the shared collection catalog. `games/registry.mjs` maps playable entries to server rule engines. Each room records its `gameId`; rooms created before this upgrade default to Sofa Kingdoms. Unknown and planned games are rejected before a room is written.

Add the next game in this checkout, implement its board and phone controls, register its engine, and mark its catalog entry playable only when it is complete. Reuse the room joining, host/player credentials, presence, music settings, and collection navigation. Game-specific action validation, normalization for safe retries, and secrecy rules must be reviewed for every private game. The WS2 room API projects each HTTP/SSE response for its authenticated viewer; only legacy Sofa Kingdoms intentionally exposes its full public board. The private command client preserves action identities through uncertain responses and never predicts with a private engine.

The source repository and Site identity in `.openai/hosting.json` are retained. Do not register a second Site for another game in this collection.

## Multiplayer design

- Rooms expire after 24 hours.
- The server is authoritative: controllers cannot alter another player's turn, scores, or forecast.
- Compare-and-swap revisions protect concurrent moves; action identifiers make retries safe. Controller feedback is predicted immediately with the shared deterministic engine, while queued commands are sent in order using acknowledged server revisions. Rejected predictions roll back to authoritative state.
- Random bearer credentials control the TV host and individual character seats. Only their SHA-256 hashes are stored server-side, and credentials are never included in QR codes or public room responses.
- Controllers retain their own room credentials locally to reconnect after a refresh. Presence is separate from game state.
- The public Site polls at a 250 ms target interval during visible play, replacing the previous 1,400 ms interval; reads slow down in lobbies and hidden tabs. Network time still contributes to delay.
- The optional LAN host reuses the same authoritative API with Node HTTP and built-in SQLite. Authenticated server-sent events push updates, with polling retained as a reconnect fallback. Stream credentials stay in headers.
- The public Worker/D1 service and the local host remain separate room stores. Local runtime data under `.sofa-lan/` must never be committed or included in the download.

## Art and credits

Original generated artwork was created for this game using the user-provided Jon, Lydia, and Lala character references. Character atlas order: Jon, Lydia, Lala.

QR codes use `qrcode-generator` by Kazuhiko Arase under the MIT license. The complete dependency license notice is included at `public/assets/qrcode-LICENSE.txt`.
