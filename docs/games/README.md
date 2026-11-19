# The next games on the sofa

These are **provisional PRDs/design docs**, written on 19 November 2026. They turn the six existing catalogue ideas into bounded implementation proposals. They are not playable games, completed content, or evidence of tested balance. Keep their catalogue entries `planned` until their acceptance criteria and platform dependencies pass.

| Game | Core decision | Proposed first version | Platform dependency |
| --- | --- | --- | --- |
| [Borrowed Minutes](borrowed-minutes.md) | Spend an attempt to create useful echoes, then coordinate a better heist | Three loops of eight simultaneous beats; two authored missions | Private commitments and deterministic simultaneous resolution |
| [Gravity Orchard](gravity-orchard.md) | Plant a temporary blocker, then tilt fruit toward your baskets | Public 5×5 orchard; twenty turns; deterministic landing preview | Public-game module interface |
| [Afterglow Market](afterglow-market.md) | Bid for stock, trade, and choose price versus sales probability | Six rounds; four recipes; bounded trades and one upgrade | Sealed bids/prices, private hints, atomic trades |
| [The Odd Laws Society](odd-laws-society.md) | Adopt a law that helps your position, or save an objection for later | Six rounds; twelve bounded law templates; two active law slots | Public-game module interface |
| [The Last Ninety Seconds](last-ninety-seconds.md) | Combine different phone clues into one consistent timeline | Two authored mysteries plus a teaching vignette; no real-time deadline | Role-specific clues, server-only answers, jointly confirmed revisions |
| [Footprints at Midnight](footprints-at-midnight.md) | Evade using a private route, or deduce it from delayed evidence | Two role-swapped legs on a 6×6 garden | Private movement, exact clue timing, role-specific projections |

**Start with [the parallel-development guide](../PARALLEL_DEVELOPMENT.md).** It names game-owned folders, shared integration ownership, proposed interfaces, release gates, and copy-pastable prompts for seven independent sessions. The canonical repository is [jonathanjie/sofa-arcade](https://github.com/jonathanjie/sofa-arcade).

Gravity Orchard and The Odd Laws Society are the easiest first integrations because their boards are entirely public. The other engines and views can still be developed concurrently against fixtures while the shared platform gains private projections and simultaneous commitments. Do not send secret game state to the browser and hide it visually.

Each document specifies rules, win/loss conditions, TV and phone roles, tutorial, motion/music direction, proposed state/actions, MVP boundaries, acceptance checks, and balance questions. Future sessions may revise the provisional numbers after playtests; record the rationale and rules version rather than silently changing ongoing matches.
