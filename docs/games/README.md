# The next games on the sofa

These PRDs/design docs began on 19 November 2026. Odd Laws Society's deeper strategy design has since been implemented in the local GitHub collection. Gravity Orchard was revised on 20 November to a real-time cooperative tilt game; its old turn-based draft is archived. The remaining games are plans, and none of these documents proves human balance. Keep unfinished catalogue entries `planned` until their acceptance criteria and platform dependencies pass.

| Game | Core decision | Proposed first version | Platform dependency |
| --- | --- | --- | --- |
| [Borrowed Minutes](borrowed-minutes.md) | Spend an attempt to create useful echoes, then coordinate a better heist | Three loops of eight simultaneous beats; two authored missions | Private commitments and deterministic simultaneous resolution |
| [Gravity Orchard v0.2](gravity-orchard.md) | Steer separate garden trays, coordinate bridge transfers, and buffer fruit for shared picnic orders | Three 90-second real-time co-op stages; tilt or touch; 6–10-minute session target | Local authoritative simulation/WebSockets; optional trusted HTTPS/WSS for browser motion |
| [Afterglow Market](afterglow-market.md) | Bid for stock, trade, and choose price versus sales probability | Six rounds; four recipes; bounded trades and one upgrade | Sealed bids/prices, private hints, atomic trades |
| [The Odd Laws Society](odd-laws-society.md) | Build a lasting city, contest scarce stock, and bid for shared laws | Six sessions; 18 building designs; 12 laws; four actions; 3×3 cities; 35–45-minute target | Private sealed bids and simultaneous commitments, plus game module interface |
| [The Last Ninety Seconds](last-ninety-seconds.md) | Combine different phone clues into one consistent timeline | Two authored mysteries plus a teaching vignette; no real-time deadline | Role-specific clues, server-only answers, jointly confirmed revisions |
| [Footprints at Midnight](footprints-at-midnight.md) | Evade using a private route, or deduce it from delayed evidence | Two role-swapped legs on a 6×6 garden | Private movement, exact clue timing, role-specific projections |

**Start with [the parallel-development guide](../PARALLEL_DEVELOPMENT.md).** It names game-owned folders, shared integration ownership, proposed interfaces, release gates, and copy-pastable prompts for seven independent sessions. The canonical repository is [jonathanjie/sofa-arcade](https://github.com/jonathanjie/sofa-arcade).

**The next implementation is Gravity Orchard v0.2.** Use its [seven-session dispatch pack](../DISPATCH_GRAVITY_ORCHARD.md) and [frozen contracts](../GRAVITY_ORCHARD_CONTRACT.md), which supersede the older broad parallel guide for this game. Six components can start together against fixtures; a seventh session owns shared integration. Ordinary HTTP touch remains available while optional secure phone motion is built and verified.

**Odd Laws Society is the implemented deeper strategy game**: its city boards are public, while sealed council choices use per-viewer projections and simultaneous commitments. Preserve those protections. Do not send secret game state to a browser and merely hide it visually.

The [hosting and desktop design note](../DEPLOYMENT_OPTIONS.md) separates GitHub Pages frontend hosting, a WebSocket/SSE room backend, and optional Tauri packaging. These design documents are not deployment evidence; the implemented local Tauri host is documented in [LOCAL_RELEASE.md](../LOCAL_RELEASE.md). Rules should stay independent of delivery mode.

Each document specifies rules, win/loss conditions, TV and phone roles, tutorial, motion/music direction, proposed state/actions, MVP boundaries, acceptance checks, and balance questions. Future sessions may revise the provisional numbers after playtests; record the rationale and rules version rather than silently changing ongoing matches.
