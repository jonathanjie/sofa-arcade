# Sofa Arcade handoff

Use the [collection table](../README.md#the-collection) for availability in this source tree. Use the [GitHub and Sites workflow](GITHUB_WORKFLOW.md) for the public URL, project ID, Worker/D1 binding and publication procedure. Source merge dates below do not establish what is live.

## Open verification

Physical iOS and Android certificate trust, tilt permission, sensor readings, and phone-to-TV latency still need checks on Jon and Lydia’s setup. Measure home Wi-Fi and casting separately. Human balance, playtime and tilt comfort also remain open. Record the devices, build SHA and observations in the [hardware sign-off](LOCAL_RELEASE.md#hardware-and-distribution-sign-off).

## Merged milestones

| Date | Source | Evidence |
| --- | --- | --- |
| 20 November 2026 | `a96fd47` merged WS1–WS6 and enabled Odd Laws Society locally. | Browser and packaged Apple Silicon/Intel acceptance passed on `eb8eb79`. See the [local dispatch](archive/DISPATCH_LOCAL.md) and [integration report](archive/workstreams/integration.md). |
| 20 November | `392345f` merged collection music and acknowledged AppKit Quit. | [Menu and native lifecycle report](archive/workstreams/menu-audio.md) |
| 21 November | `6c6eb93` merged the Odd Laws cover, guild labels and draft-preserving city inspection, plus the Gravity Orchard dispatch. | [UI feedback report](archive/workstreams/odd-laws-ui-feedback.md) and [executed dispatch](archive/DISPATCH_GRAVITY_ORCHARD.md) |
| 21 November | Desktop tag `v0.2.0` points to `ae54c15`. | Its catalog still listed Gravity Orchard as planned. |
| 21 November | `e0504c1` merged GO1–GO7 and enabled Gravity Orchard on the local host. | `8e29e68` was an earlier software checkpoint. The merge records passing CI at reviewed head `856fd76`, including TV/two-phone browser journeys and packaged WKWebView checks on both architectures. |

After the Gravity Orchard merge, the polish branch changed screen text and campaign acceptance at `c4fe088`, adjusted native stall recovery at `a48a902`, and serialized native tilt setup at `0560ca7`. The [GO7 report](archive/workstreams/gravity-orchard-go7.md) records the failures and corrections by revision. Use CI evidence from the intended commit for a new build.

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

Gravity Orchard uses `server/gravity-orchard-host.mjs` to connect the local HTTP and optional HTTPS listeners to one coordinator and database. See the [wire contract](GRAVITY_ORCHARD_CONTRACT.md). Runtime art is under `public/assets/`. Generated character sheets for Gravity Orchard are tracked in [the character source directory](../ui/media/gravity-orchard/sources/characters/).

See the [Sofa Kingdoms rules](games/sofa-kingdoms.md), [Odd Laws rules](games/odd-laws-society.md), [parallel integration checklist](PARALLEL_DEVELOPMENT.md) and [release commands and delivery inventory](LOCAL_RELEASE.md).

## Sofa Kingdoms verification recorded at the 19 November 2026 import

The handoff imported at `a42b028` reported **66 passing Node tests**, comprising 25 engine, 17 room API, 10 action queue, 4 LAN server, 5 browser transport, and 5 score checks. Opening tests exercise both starters, deterministic seeds, one-time compensation, scoring, alternating order, and v1/v2 compatibility. Coverage includes 64 complete seeded matches, resource conservation, bonuses/recharge, classic-room compatibility, steering retries, rapid queued inputs, rematch/cancellation races, real HTTP/SSE updates, credential redaction/rotation, local persistence, safe static routes, and stream reconnects.

Managed-browser checks covered the clearer row/column targets, pounce cross, toy axis/direction choices, and the full eight-step tutorial, including the corrected toy lesson and return to the original practice match at round three. A real server room with a TV view and 360 px Jon/390 px Lydia controller frames synchronized rapid move/collect inputs across all three views. Reversing the same row's direction moved Lydia from E1 to D1; the round-two Lydia-start announcement and fresh two actions appeared correctly on the TV and controllers. A complete five-crumb delivery displayed the contextual bank bonus and awarded seven points. These were browser frames, not physical phones. The controller's round announcement uses the scheduled starter, including when two fast moves advance to the second player's turn before a poll arrives. Consult Sites version history for the production build and publication of the corresponding source commit.

The randomized-opening update was also checked in the managed browser: a Lydia-first practice match gave Jon one opening point, round two started Jon, and a separate shared room gave Lydia the point when Jon started. The TV and 360/390 px phone frames agreed through rapid move/collect inputs and the next-round transition. The complete eight-step tutorial still finished and returned to its saved match. Transient opening/round messages are cleared on tutorial and navigation boundaries.

The portable ZIP was checked for valid CRCs, safe paths, and executable launcher permissions. A fresh extracted copy without `node_modules` served its modules, created a room, joined both seats, started a match, and accepted a move. These were executor/loopback checks, **not measurements on Jon's Mac, home Wi-Fi, or TV**. Casting can add display delay independently of controller transport.
