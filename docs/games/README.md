# The next games on the sofa

These are **provisional PRDs/design docs**, initially written on 19 November 2026. Odd Laws Society was expanded on 20 November into a complete strategy-game specification, replacing its lighter movement prototype. These are not playable games or evidence of tested balance. Keep their catalogue entries `planned` until their acceptance criteria and platform dependencies pass.

| Game | Core decision | Proposed first version | Platform dependency |
| --- | --- | --- | --- |
| [Borrowed Minutes](borrowed-minutes.md) | Spend an attempt to create useful echoes, then coordinate a better heist | Three loops of eight simultaneous beats; two authored missions | Private commitments and deterministic simultaneous resolution |
| [Gravity Orchard](gravity-orchard.md) | Plant a temporary blocker, then tilt fruit toward your baskets | Public 5×5 orchard; twenty turns; deterministic landing preview | Public-game module interface |
| [Afterglow Market](afterglow-market.md) | Bid for stock, trade, and choose price versus sales probability | Six rounds; four recipes; bounded trades and one upgrade | Sealed bids/prices, private hints, atomic trades |
| [The Odd Laws Society](odd-laws-society.md) | Build a lasting city, contest scarce stock, and bid for shared laws | Six sessions; 18 building designs; 12 laws; four actions; 3×3 cities; 35–45-minute target | Private sealed bids and simultaneous commitments, plus game module interface |
| [The Last Ninety Seconds](last-ninety-seconds.md) | Combine different phone clues into one consistent timeline | Two authored mysteries plus a teaching vignette; no real-time deadline | Role-specific clues, server-only answers, jointly confirmed revisions |
| [Footprints at Midnight](footprints-at-midnight.md) | Evade using a private route, or deduce it from delayed evidence | Two role-swapped legs on a 6×6 garden | Private movement, exact clue timing, role-specific projections |

**Start with [the parallel-development guide](../PARALLEL_DEVELOPMENT.md).** It names game-owned folders, shared integration ownership, proposed interfaces, release gates, and copy-pastable prompts for seven independent sessions. The canonical repository is [jonathanjie/sofa-arcade](https://github.com/jonathanjie/sofa-arcade).

Gravity Orchard remains the simplest public-information integration. **Odd Laws Society is the selected deeper design**: its city boards are public, but sealed council choices require private projections and simultaneous commitments. Its engine and views can proceed against fixtures while the shared platform gains those capabilities. Do not send secret game state to the browser and hide it visually.

The [hosting and desktop design note](../DEPLOYMENT_OPTIONS.md) separates GitHub Pages frontend hosting, a WebSocket/SSE room backend, and optional Tauri packaging. None is implemented by these design documents, and the rules should stay independent of delivery mode.

Each document specifies rules, win/loss conditions, TV and phone roles, tutorial, motion/music direction, proposed state/actions, MVP boundaries, acceptance checks, and balance questions. Future sessions may revise the provisional numbers after playtests; record the rationale and rules version rather than silently changing ongoing matches.
