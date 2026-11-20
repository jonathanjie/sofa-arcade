# Gravity Orchard v0.2 — parallel dispatch pack

Prepared 20 November 2026 for Jon and Lydia's next Sofa Arcade game.

**Start GO1–GO6 together in separate sessions. GO7 can start its acceptance harness immediately, then assemble their tested PR heads.** The goal is maximum useful parallel work, not seven people modifying the same shared server. Each prompt contains the repository, context, owned paths, exact source documents, implementation scope, meaningful graphical/test evidence and GitHub PR requirements.

Gravity Orchard is now a **real-time cooperative tilt game**. Each player steers a separate garden tray, passes fruit across a bridge and fills shared picnic orders, with a large Brake control and a complete touch alternative. The old turn-based v0.1 concept is [archived](games/archive/gravity-orchard-v0.1.md). Keep the game planned until integration acceptance.

## Read the shared specification

- [Game PRD v0.2](games/gravity-orchard.md): rules, authored-stage goals, player experience and balance questions.
- [Frozen implementation contract](GRAVITY_ORCHARD_CONTRACT.md): exact public view, engine and UI exports, command/wire fields, authority, epochs, rates, media, TLS and recovery.
- [Technical notes](GRAVITY_ORCHARD_TECHNICAL_NOTES.md): primary-source browser/security research and real-device limitations.
- [Repository handoff](HANDOFF.md) and [GitHub workflow](GITHUB_WORKFLOW.md): current local collection and version-control/release discipline.

The canonical repo is https://github.com/jonathanjie/sofa-arcade. Start from current main containing this packet and record its SHA. If starting before the packet merges, explicitly pin the reviewed packet commit on feature/odd-laws-feedback (PR #10) and record that dependency; do not accidentally work from the old PRD. Never overwrite existing work or force-push main.

## Seven independent prompts

| Stream | Copy this complete prompt | Branch | Exclusive implementation paths |
| --- | --- | --- | --- |
| GO1 — Simulation and stages | [GO1-engine.md](prompts/gravity-orchard/GO1-engine.md) | feature/gravity-orchard-engine | games/gravity-orchard/** |
| GO2 — Realtime transport | [GO2-realtime.md](prompts/gravity-orchard/GO2-realtime.md) | feature/gravity-orchard-realtime | server/realtime/gravity-orchard/**; ui/realtime/gravity-orchard/** |
| GO3 — Phone tilt and touch | [GO3-phone.md](prompts/gravity-orchard/GO3-phone.md) | feature/gravity-orchard-phone | ui/games/gravity-orchard/phone/** |
| GO4 — TV and tutorial | [GO4-tv.md](prompts/gravity-orchard/GO4-tv.md) | feature/gravity-orchard-tv | ui/games/gravity-orchard/tv/**; ui/games/gravity-orchard/tutorial/** |
| GO5 — Art and composed music | [GO5-media.md](prompts/gravity-orchard/GO5-media.md) | feature/gravity-orchard-media | public/assets/gravity-orchard/**; ui/media/gravity-orchard/** |
| GO6 — Secure LAN and setup | [GO6-secure-lan.md](prompts/gravity-orchard/GO6-secure-lan.md) | feature/gravity-orchard-secure-lan | server/secure-lan/**; desktop/secure-lan/** |
| GO7 — Integration and acceptance | [GO7-integration.md](prompts/gravity-orchard/GO7-integration.md) | feature/gravity-orchard-integration | Shared entrypoints/registry/shell/native wiring/root manifests/delivery; ui/games/gravity-orchard/index.mjs; tests/gravity-orchard-integration/** |

Each component also owns exactly its named workflow and report:

| Stream | Workflow | Report |
| --- | --- | --- |
| GO1 | .github/workflows/go1-engine.yml | docs/workstreams/gravity-orchard-go1.md |
| GO2 | .github/workflows/go2-realtime.yml | docs/workstreams/gravity-orchard-go2.md |
| GO3 | .github/workflows/go3-phone.yml | docs/workstreams/gravity-orchard-go3.md |
| GO4 | .github/workflows/go4-tv.yml | docs/workstreams/gravity-orchard-go4.md |
| GO5 | .github/workflows/go5-media.yml | docs/workstreams/gravity-orchard-go5.md |
| GO6 | .github/workflows/go6-secure-lan.yml | docs/workstreams/gravity-orchard-go6.md |
| GO7 | .github/workflows/go7-integration.yml | docs/workstreams/gravity-orchard-go7.md |

This ownership supersedes overlapping older broad game/WS1–WS6 assignments for Gravity Orchard. Existing tested component histories and their verifiers remain intact.

## How the streams stay independent

GO1 supplies pure simulation, geometry and public fixtures. GO2 can use an injected fake simulation and authorization adapter; it does not wait for GO1. GO3's sensor/controller harness records normalized input through an injected seam. GO4 renders safe public fixtures and uses injected media. GO5 builds a standalone gallery and audio preview. GO6 tests its TLS listener with an injected request/upgrade handler and its setup view with safe host stubs. GO7 prepares contract and acceptance harnesses immediately, then replaces fixtures with exact reviewed components.

**GO7 is the only parallel owner of existing server/rooms.mjs, server/lan.mjs and native host/startup/protocol files.** GO2 and GO6 export tested factories instead of each forking the shared host. The new game index is also GO7's; phone/TV owners stay in their subdirectories.

Nested development manifests/locks stay in owned subtrees. Production dependencies and runtime files are explicitly inventoried for GO7 to package. Generated public copies, portable ZIP and root dependency files are GO7's. Component tests must not quietly require root lockfile changes.

Final reusable art belongs to GO5. Other lanes create diagnostic canvas/SVG graphics or fixtures in their own scope so they can test immediately; they do not produce competing final cover/character packs. Music stays with the shared host scheduler and existing user settings.

Use up to three subagents per session **when that capacity is actually available**. Assign disjoint internal files and integrate their results. This is not a statement about a subscription-wide limit. Long-running means completing implementation, useful tests, inspection and repair; it does not mean artificial waiting or unlimited speculative features.

## Handoff and merge sequence

Every stream must end with a real GitHub PR against main, an exact tested head, CI results, runtime/API inventory, graphical evidence where relevant, and an owned report. No stream self-merges or publishes. Component-ready means its contracted fixture and owned tests pass; final integration-ready is a separate claim.

GO7 records the six tested heads and any unresolved dependencies. Components can be reviewed/merged independently once ready; prefer GO1, then GO2–GO6 in any reviewed order, and GO7 last. GO7 may assemble pinned heads on its own branch beforehand while preserving each original PR. Reconcile latest main and retest the actual final assembled source. Do not merge moving branch tips or hide cross-component corrections.

If an essential test is unavailable, complete all reachable work and preserve a draft PR with the precise missing gate. Absence of physical phones does not justify stopping a pure engine/controller-fixture implementation; neither does a synthetic orientation event justify claiming real sensor compatibility.

## Acceptance boundaries

The proposed tilt route is optional trusted local HTTPS/WSS with an explicit one-time phone trust step. Ordinary LAN HTTP remains playable through touch. No certificate-warning bypass, security flags, shared private CA keys, silent trust installation, hosted internet relay or separate phone app is part of v1.

Software acceptance includes a real TV and two rendered authenticated controllers, three complete stages, both input modes, reconnect/backlog safety, paused checkpoint recovery, no per-input SQLite writes, old-game regressions, production asset closure and packaged macOS execution. Real iOS/Android trust/sensors, actual Wi-Fi, WAN-disconnected cold start, casting latency and physical audio must be recorded separately and honestly.

Do not deploy the existing Site, migrate to Pages or publish a public desktop release in these prompts. Preserve the whole collection in the canonical repository. Jon can review and merge the resulting tested PRs in a subsequent integration session.
