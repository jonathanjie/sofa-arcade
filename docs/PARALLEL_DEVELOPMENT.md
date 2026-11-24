# Sofa Arcade — parallel game development

**Status: proposed implementation plan, updated 20 November 2026.** The six linked games are design drafts, not implemented features or promises of established balance. Sofa Kingdoms remains the only playable game. Odd Laws Society is now the selected deeper city-building design; its former public-only movement prototype is superseded. Use this document to divide work between coding sessions without splitting the collection into separate products.

Canonical project: **https://github.com/jonathanjie/sofa-arcade**. Read the current `AGENTS.md`, `README.md`, and `docs/HANDOFF.md` before editing. The existing ChatGPT Site remains the deployment destination unless Jon explicitly changes hosting.

**Current local-release assignment:** Jon has selected Tauri/local play. Use [DISPATCH_LOCAL.md](archive/DISPATCH_LOCAL.md) for six self-contained session prompts and exact disjoint ownership, together with [LOCAL_IMPLEMENTATION_CONTRACT.md](archive/LOCAL_IMPLEMENTATION_CONTRACT.md). That more specific assignment supersedes this document's broad shared-platform/game ownership for WS1–WS6. The general rules and other game PRDs below remain useful; no cloud deployment is included in the local assignments.

## Pick a workstream

| Workstream | PRD | Suggested branch | Main dependency |
| --- | --- | --- | --- |
| Shared platform | This guide, especially the integration contract | `feature/game-platform` | None; coordinate with every game owner |
| Gravity Orchard | [PRD](games/gravity-orchard.md) | `feature/gravity-orchard` | Public-game module registration |
| The Odd Laws Society | [Full strategy specification](games/odd-laws-society.md) | `feature/odd-laws-society` | Private sealed bids and simultaneous commitments, Gates A/B/C |
| Borrowed Minutes | [PRD](games/borrowed-minutes.md) | `feature/borrowed-minutes` | Simultaneous commitment contract |
| Afterglow Market | [PRD](games/afterglow-market.md) | `feature/afterglow-market` | Private submissions and simultaneous resolution |
| The Last Ninety Seconds | [PRD](games/last-ninety-seconds.md) | `feature/last-ninety-seconds` | Private clues and server-only case answers |
| Footprints at Midnight | [PRD](games/footprints-at-midnight.md) | `feature/footprints-at-midnight` | Private movement and role-specific projections |

**Current priority:** Odd Laws Society's rules prototype and the shared private-state/commitment platform can proceed in parallel, with a frontend working against agreed fixtures. Gravity Orchard remains a simpler public-game integration when useful for Gate A. All six engines and isolated views can proceed in their owned areas. An isolated prototype is not permission to enable its catalog entry.

## Product constraints for every game

- One collection, one repository, one existing Site. Reuse room creation/joining, Jon/Lydia seats, reconnection, settings, and the Mac local-play option.
- The TV is the shared board; phones carry controls and any genuinely private information. Give phone controls comfortable touch targets and keep the regular board legible from the sofa.
- Rules belong in optional guided tutorials and Help. Use short status labels, contextual choices, and a visible next step during play. Do not leave the PRD's explanatory prose on the board.
- Keep the warm illustrated direction. Jon and Lydia can change roles or costumes; Lala remains a playful presence. Animate purposeful movement and reactions, with reduced-motion alternatives.
- Music plays on the TV by default; phones start quiet. Give each game a written musical motif and restrained variations. Do not replace the existing composed music with random-note generators.
- No external AI calls are needed during a match. Outcomes, generated layouts, and replays must be reproducible from authoritative inputs.
- Both players must have an intelligible path to victory or useful cooperative contribution. Randomize initial initiative where relevant, use role-swapped matches for strongly asymmetric games, and treat balance numbers below as hypotheses to test.

## File ownership and integration boundaries

Each game session owns the following new subtree, substituting its catalog slug:

```text
games/<slug>/engine.mjs
games/<slug>/engine.test.mjs
games/<slug>/projection.mjs
games/<slug>/actions.mjs
games/<slug>/fixtures/
ui/games/<slug>/view.mjs
ui/games/<slug>/styles.css
ui/games/<slug>/tutorial.mjs
public/assets/<slug>/
docs/games/<slug>.md
```

These paths are **proposed**, not existing shared interfaces. A small public-only game may keep projection/actions in its engine if the platform owner agrees. Private case answers, seeds, decks, and solution fixtures must stay outside browser-served paths. Do not copy an entire game server module into `public/` merely because a public engine can be shared.

Only the integration owner should coordinate changes to `games/catalog.mjs`, `games/registry.mjs`, `ui/app.js`, `server/rooms.mjs`, `server/lan.mjs`, `scripts/prepare-game.mjs`, `scripts/package-lan.mjs`, shared tests, and package scripts. Game sessions should state the requested integration change in their PR instead of independently rewriting these files. Never edit generated `public/` copies or `app/route.ts` as the source of a fix.

Keep a session's changes on its branch/worktree. Before integrating, refresh the default branch and inspect other open work. Do not reset another session's work, force-push over it, or publish several competing builds to the same Site. One integration owner merges and releases a known combination of commits.

## Proposed engine and view contract

The current registry offers `playerIds`, `create`, and `apply`. The current UI and room action validator still contain Sofa Kingdoms assumptions. Extend them deliberately before registering another engine.

Proposed shared engine capabilities:

```js
create({ seed, matchId, options }) -> FullState
apply(state, authenticatedPlayerId, normalizedAction) -> FullState
normalizeAction(rawAction) -> NormalizedAction
actionKey(normalizedAction) -> stableString
project(state, viewer) -> ViewerState
legalActions(state, authenticatedPlayerId) -> ActionDescription[]
```

`viewer` is derived from authentication: `{ role: 'public' | 'host' }` or `{ role: 'player', playerId: 'jon' | 'lydia' }`. It is never accepted as an unchecked request parameter. The shared outer state retains `phase: 'playing' | 'finished'`; individual games use an inner `stage`, `round`, `beat`, or `leg`. Include `rulesVersion` and a unique `matchId`; do not identify a rematch only by a seed that might repeat.

Each game's public renderer consumes `ViewerState`, not `FullState`. A proposed view module supplies TV, controller, results, and tutorial renderers plus command binding. Agree the exact DOM and lifecycle signatures with the platform owner before building integration around them. Renderer teardown must release listeners, timers, audio, and old-room work.

### Gate A: public-game registration

1. Route normalization and action validation through the selected game engine, with bounded payloads and no unknown enum values.
2. Include every semantically meaningful field in retry identity. Keep stable action IDs on retries; reusing an ID for another command must fail.
3. Generalize active-player, status, result, and tutorial handling. Do not assume all games have a 5×5 board, two actions, a crumb bag, or Lala forecasts.
4. Update production preparation, LAN static serving, and local ZIP allowlists together. Add the game's assets and license notices once.
5. Maintain existing Sofa Kingdoms room/rules compatibility and the collection's `planned` gate until end-to-end acceptance passes.

### Gate B: private information

**The existing room envelope returns the entire Sofa Kingdoms state. It is not safe to reuse unchanged for hidden games.** A TV host credential grants room management, not permission to see both players' secrets.

Project state on every outbound path: unauthenticated/host/player GET, join, start, rematch, action success, idempotent retry, reconnect, and LAN stream. Return only the authenticated player's private fields. Filter event history and error payloads too. Keep authoritative state in the server/store; keep seeds capable of reconstructing secret choices and unrevealed deck order private. Sending secrets and concealing them with CSS is not a projection.

Each private game needs tests that inspect the serialized response, not merely the rendered screen. Assert that the TV, public viewer, and other seat cannot retrieve secret fields or infer them from verbose errors. Reauthentication, rotated credentials, and seat recovery must not carry another seat's previous private view. This protects normal play; the project is public source, so it does not promise anti-cheat against someone deliberately reading authored case solutions in GitHub.

### Gate C: simultaneous submissions

Use an explicit `phaseId`/round/beat identity and one server-authoritative commitment per seat. Phone drafting can be immediate and local; reveal/resolution waits for both valid commitments. The waiting player sees a ready indicator, never the other submission. A commitment is immutable in the MVP unless a particular PRD explicitly requires a jointly cancelled phase.

The current global-revision compare-and-swap may reject the second of two submissions sent from the same revision. Do not remove concurrency checks globally. Add a bounded, game-aware retry/acceptance policy that checks the same match/phase, unchanged own submission, legal resources, and stable action ID before retrying the write against the new revision. A stale action from a resolved phase must never become an action for the next phase. Reconnect restores the player's own committed choice without submitting it twice.

The current optimistic action queue runs the full rules engine in the browser. Use it only when the browser legitimately has every necessary input. Private games may optimistically animate the selected button or show a pending plan, but cannot simulate an authoritative hidden outcome by receiving secrets. Shared pending-state UX should not block the other player's independent submission.

## Acceptance and release gates

Every game PR should include:

1. A deterministic engine with documented state/action schema, valid fixtures, strict illegal-action handling, and reproducible complete matches.
2. Unit/property checks relevant to its actual risks: conservation, finite resolution, simultaneous order independence, exact information projection, or puzzle solvability. Avoid tests that merely repeat implementation constants.
3. An isolated tutorial fixture and complete win/loss/tie paths. Reconnection midway through a decision must not lose or duplicate actions.
4. Browser evidence for TV and two narrow phone views, including waiting, active, disconnected, results, and reduced-motion behavior. Test real role separation for private games.
5. An integration checklist for online rooms, LAN push, module packaging, existing matches, music/settings, and return to collection.
6. A short playtest note: what two people actually tried, what remains untested, and which numerical balance choices still need tuning. Bot sweeps are regression checks, not proof of equal human win rates.

Keep new games `planned` until all relevant platform gates and their PRD's MVP criteria pass. Use a feature branch or an internal fixture route while incomplete; do not expose a catalog button that starts a nonfunctional game. Preserve old saved states with explicit rules-version handling rather than silently changing an in-progress match.

## Copy-pastable session prompts

Use one prompt per session. Replace `BASE_COMMIT` with the actual GitHub commit agreed by the integration owner. These prompts authorize a bounded implementation branch, not an independent production deployment.

The [early platform, Gravity Orchard and Odd Laws prompts](archive/early-session-prompts.md) are historical.

### Borrowed Minutes session

> Continue `jonathanjie/sofa-arcade` from BASE_COMMIT on `feature/borrowed-minutes`. Read AGENTS.md, docs/PARALLEL_DEVELOPMENT.md, and docs/games/borrowed-minutes.md. Implement the provisional cooperative time-loop heist in its owned subtree, including deterministic recorded-position echoes and beat resolution. Use the shared simultaneous-commitment contract; do not expose the partner's pending plan. Prove the authored maps solvable with stored replay fixtures. Do not edit shared integration files or publish independently. Deliver a PR with an isolated tutorial and clear platform dependencies.

### Afterglow Market session

> Continue `jonathanjie/sofa-arcade` from BASE_COMMIT on `feature/afterglow-market`. Read AGENTS.md, docs/PARALLEL_DEVELOPMENT.md, and docs/games/afterglow-market.md. Implement the provisional six-round market MVP in its owned subtree. Prioritize sealed bids/prices, atomic consented trades, bounded resources, deterministic customer choices, and the rule ledger. Use authenticated projections and safe simultaneous commitments. Do not expose hidden demand order or reuse the full-state optimistic client. Keep catalog planned and open a PR; do not publish independently.

### The Last Ninety Seconds session

> Continue `jonathanjie/sofa-arcade` from BASE_COMMIT on `feature/last-ninety-seconds`. Read AGENTS.md, docs/PARALLEL_DEVELOPMENT.md, and docs/games/last-ninety-seconds.md. Implement the provisional cooperative mystery MVP in its owned subtree. Author the tutorial and two cases, prove each has exactly one solution from the combined starting clues, and keep role-specific clues/answers off the TV and other phone. Use a jointly confirmed answer revision. Do not write shared integration files or publish independently. Deliver a PR with puzzle verification, tutorial, and privacy acceptance evidence.

### Footprints at Midnight session

> Continue `jonathanjie/sofa-arcade` from BASE_COMMIT on `feature/footprints-at-midnight`. Read AGENTS.md, docs/PARALLEL_DEVELOPMENT.md, and docs/games/footprints-at-midnight.md. Implement the provisional hidden-movement MVP in its owned subtree. Prioritize exact clue timing, legal hidden paths, role projections, and two-leg role swaps. Never send the wanderer's position/history to the TV or tracker before the specified reveal. Coordinate platform dependencies, keep catalog planned, and open a PR with deterministic privacy/replay tests and phone/TV acceptance evidence. Do not publish independently.

## Decisions to revisit after prototypes

The suggested turn counts, prices, bonuses, map sizes, and content quantities are starting points. Tune after observed play, recording which rule version changes. The shared networking transport may improve independently, but all these MVPs are discrete-decision games: they should remain playable with ordinary browser-network delay, pause cleanly for reconnection, and avoid making reflex timing the source of success.
