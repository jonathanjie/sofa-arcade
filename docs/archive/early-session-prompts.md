> Historical prompts. The local and realtime dispatches superseded these assignments on 20–21 November 2026.

# Early platform and game assignments

### Shared platform session

> Continue `jonathanjie/sofa-arcade` from BASE_COMMIT on `feature/game-platform`. Read AGENTS.md, docs/HANDOFF.md, and docs/PARALLEL_DEVELOPMENT.md. Implement the shared engine/view registration, authenticated per-role state projection for all API and LAN stream paths, and safe simultaneous commitments. Preserve Sofa Kingdoms and existing room versions. Coordinate the exact contract with the six game sessions. You own shared registry, shell, room, transport, and packaging changes; avoid editing individual game-owned modules except agreed integration adapters. Add meaningful compatibility/security/concurrency tests. Open a reviewable PR with contract examples and integration instructions. Do not mark unfinished games playable or publish independently.

### Gravity Orchard session

> Continue `jonathanjie/sofa-arcade` from BASE_COMMIT on `feature/gravity-orchard`. Read AGENTS.md, docs/PARALLEL_DEVELOPMENT.md, and docs/games/gravity-orchard.md. Implement the provisional public-information orchard MVP in its owned game/UI subtree. Prioritize deterministic settling, an accurate landing preview, and distinct placement/tilt decisions. Coordinate the proposed module contract with the platform owner. Do not rewrite shared shell/room/catalog files or publish independently. Include complete seeded tests, an isolated tutorial, TV/phone views, and explicit remaining integration/balance risks in a PR.

### The Odd Laws Society session

> Continue `jonathanjie/sofa-arcade` from BASE_COMMIT on `feature/odd-laws-society`. Read AGENTS.md, docs/PARALLEL_DEVELOPMENT.md, and the full v0.2 specification in docs/games/odd-laws-society.md. Implement the six-session city-building rules prototype in its owned subtree: 18 building designs, 12 laws, Build/Work/Lobby/Festival, 3×3 streets, and sealed all-pay council bids. The earlier 5×5 movement game is superseded. Reproduce the worked accounting fixture; test pre-action discounts, the A-B/B-A/A-B Chair schedule, scoring caps, private projections, both commitment orders, and idempotent reveals. Coordinate Gates A/B/C with the platform owner; do not expose bids or deduct them publicly before reveal. Keep the catalog planned until full tutorial, TV/two-phone, online/LAN, and actual playtest gates pass. Do not publish independently. Open a PR with precise implemented scope and remaining balance questions.

For separate sessions on this game's engine and frontend, agree ownership before starting: the engine owner uses `games/odd-laws-society/`; the frontend owner uses `ui/games/odd-laws-society/` and consumes projected fixtures; the platform owner retains the shared files listed above. The PRD's milestones name the corresponding exit criteria. Hosting/WebSocket work and Tauri packaging are separate workstreams described in [DEPLOYMENT_OPTIONS.md](../archive/DEPLOYMENT_OPTIONS.md).
