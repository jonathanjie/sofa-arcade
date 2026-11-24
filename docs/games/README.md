# Game designs

Six design briefs cover two implemented games and four planned games. The [Sofa Kingdoms rules](sofa-kingdoms.md) cover the original game. Human balance and duration targets still need playtesting.

| Game | Core decision | Version or design scope | Platform dependency |
| --- | --- | --- | --- |
| Planned — [Borrowed Minutes](borrowed-minutes.md) | Spend an attempt to create useful echoes, then coordinate a better heist | Three loops of eight simultaneous beats; two authored missions | Private commitments and deterministic simultaneous resolution |
| Implemented — [Gravity Orchard v0.2](gravity-orchard.md) | Steer separate garden trays, coordinate bridge transfers, and buffer fruit for shared picnic orders | Three 90-second real-time co-op stages; tilt or touch; 6–10-minute session target | Local authoritative simulation/WebSockets; optional trusted HTTPS/WSS for browser motion |
| Planned — [Afterglow Market](afterglow-market.md) | Bid for stock, trade, and choose price versus sales probability | Six rounds; four recipes; bounded trades and one upgrade | Sealed bids/prices, private hints, atomic trades |
| Implemented — [The Odd Laws Society](odd-laws-society.md) | Build a lasting city, contest scarce stock, and bid for shared laws | Six sessions; 18 building designs; 12 laws; four actions; 3×3 cities; 35–45-minute target | Private sealed bids and simultaneous commitments, plus game module interface |
| Planned — [The Last Ninety Seconds](last-ninety-seconds.md) | Combine different phone clues into one consistent timeline | Two authored mysteries plus a teaching vignette; no real-time deadline | Role-specific clues, server-only answers, jointly confirmed revisions |
| Planned — [Footprints at Midnight](footprints-at-midnight.md) | Evade using a private route, or deduce it from delayed evidence | Two role-swapped legs on a 6×6 garden | Private movement, exact clue timing, role-specific projections |

Use the [parallel development guide](../PARALLEL_DEVELOPMENT.md) for planned games. For Gravity Orchard, use the [local runtime contract](../GRAVITY_ORCHARD_CONTRACT.md) and [device sign-off](../LOCAL_RELEASE.md#hardware-and-distribution-sign-off).
