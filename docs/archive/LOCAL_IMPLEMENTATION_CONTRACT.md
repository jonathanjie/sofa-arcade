> Historical record. This assignment ended on 20 November 2026 at `a96fd47`.

# Local-first implementation contracts — v1

This was the implementation baseline for the 20 November [local dispatch](DISPATCH_LOCAL.md). The [integration report](workstreams/integration.md) records the assembled interfaces and acceptance. The sections below preserve the agreed design.

Jon selected **Tauri on his Mac, with two ordinary phone browsers on the same LAN**. Apple Silicon is the initial build target, an assumption rather than a verified fact about Jon's device; WS5 verifies its actual tested architecture and reports Intel support separately. Retain the existing playable Sofa Kingdoms and browser/LAN workflow. No hosted WebSocket service, Pages migration, replacement Site, or cloud deployment is part of these assignments. The existing LAN HTTP-action/SSE-update model already supplies immediate push.

## Coordination and ownership

All sessions branch from current GitHub `main` containing this contract, record the exact base SHA, and use separate worktrees/clones. Up to three subagents may work inside each session if that capacity is available; assign each explicit files before they edit. No session may assume a universal account/model concurrency limit.

The dispatch ownership table takes precedence over the older broad ownership descriptions in the general parallel guide. The first five streams have disjoint write sets. Integration owns shared wiring and may prepare its own harness immediately, but final assembly uses completed component PRs pinned by SHA. Do not have multiple sessions update global handoff documents or dependencies as progress journals; each owns one workstream report. WS1–WS4 each own exactly one new CI file: `.github/workflows/ws1-engine.yml`, `ws2-platform.yml`, `ws3-ui.yml`, and `ws4-media.yml`, respectively. WS5 owns `desktop.yml`. These workflows must run the owner's new suites; the legacy root `npm test` list alone does not discover them. Nested test-tool manifests/locks may live within an owned subtree; root dependency changes belong to WS6.

A workstream report must contain: scope, base SHA, exported interfaces, runtime/browser file lists, test commands/results, evidence paths, dependency requests, current limitations, and whether the component is ready for handoff. Reference the tested commit in the PR, rather than placing the report's own future hash inside itself. A ready component PR is a handoff of that tested head. If subsequent changes are needed, identify the new head and invalidate old validation explicitly.

Component sessions do not merge `main`. The integrator may fetch reviewed component PR heads into a candidate branch for testing without altering their branches. If a component is still changing, do not edit its files. After explicit handoff, shared serving-list changes in `server/lan.mjs` and allowlist additions in `desktop/runtime-manifest.json` can transfer to the integrator; preserve their owners' behavior and rerun their checks. This is a sequential ownership transfer, not concurrent editing. Game-specific defects should be fixed by their owner or isolated in a clearly identified follow-up after handoff. Shared generated `public/` module copies and `app/route.ts` belong to WS6; component sessions may build in their own checkout but must not commit those derived files.

## 1. Engine adapter

Engine owner: `games/odd-laws-society/**`. Keep browser-safe public data/helpers separate from authority and private state.

```js
// engine.mjs
export const engine = {
  gameId: 'odd-laws-society',
  playerIds: ['jon', 'lydia'],
  create({ seed, matchId, options }),
  apply(fullState, authenticatedPlayerId, normalizedAction),
  normalizeAction(rawAction),
  actionKey(normalizedAction),
  project(fullState, viewer),
  canRebaseAction(fullState, authenticatedPlayerId, normalizedAction),
};
```

`create`/`apply` return complete JSON-serializable state; `apply` does not mutate its argument. `normalizeAction` validates all fields and rejects unknown fields/enum values. `actionKey` includes every meaningful normalized field in a stable representation. Use typed/code-bearing rule errors with safe messages, not private-state dumps.

`viewer` is `{role:'public'}`, `{role:'host'}`, or `{role:'player', playerId:'jon'|'lydia'}` and is supplied only after authentication. `project` returns a fresh JSON-safe view. A host credential does not reveal both players' votes.

`canRebaseAction` is true only for a still-legal, unsubmitted `commitCouncil` matching this exact match, council phase, actor, and fixed budget. All city actions return false. It authorizes a bounded server CAS re-evaluation, never bypassing authentication, current-phase checks, validation, or duplicate detection. Reject future revisions. Existing Sofa Kingdoms actions retain their prior revision/normalization behavior.

Normalized Odd Laws actions have `type`, `matchId`, `phaseId`, and only the fields below:

| type | Additional fields |
| --- | --- |
| `commitCouncil` | `choiceId`: one offered law ID or `keep`; `bid`: bounded integer |
| `build` | `designId`, `row`, `col`; coordinates 0–2 |
| `work`, `lobby`, `festival` | None |

Council has one shared phase ID for both commitments. Each individual city turn gets a distinct phase ID, incorporating session and action index 0–5. Rejections and duplicate retries never advance it. A new match always has a new match ID.

Public modules:

- `catalog.mjs`: exports immutable `BUILDINGS`, `LAWS`, and `GUILDS` arrays with the PRD's exact IDs. Building fields: `id, name, term, guild, cost, prestige, ability, abilityDescription`; law fields: `id, name, category, description, effect`. Guild fields: `id, name, color, iconKey`, with IDs and icon keys `commerce,craft,civic,culture`. Ability is null or `{type:'income'|'firstBuildDiscount'|'influenceOnBuild'|'festivalBonus', amount:number}`; descriptions are public display text. Economy effects are `{type:'guildDiscount',guild,amount}`, `{type:'firstBuildDiscount',amount}`, or `{type:'workIncome',coins}`. Civic effects are `{type:'guildThreshold',guild,thresholds:[{atLeast,points}]}`, `{type:'streetCount',pointsEach,cap}`, or `{type:'diversityThreshold',thresholds:[{atLeast,points}]}`. Values come from the PRD; use finite data, not executable expressions.
- `preview.mjs`: browser-safe public helpers with the exact return shapes below. It must not import authority/private state modules. The view receives these helpers through injection; its independent harness supplies compatible mocks.
- `fixtures/projected/`: canonical safe TV/Jon/Lydia examples for validation. Full-state fixtures remain in a separate non-served test subtree. Frontend may create matching local mocks before these arrive.

The engine report names exact exports and additional helpers. Additive optional fields are allowed; breaking this contract requires an explicit integration decision and an updated version, not a silent rename.

```js
buildQuote(view, playerId, designId)
  -> { allowed, reason, printedCost, cost,
       discount: { amount, sourceId }, influenceGain, prestige }
streetOutcome(view, playerId, row, col, designId)
  -> { canPlace, reason, completes, qualifies, prestige }
civicAward(view, playerId, lawId = view.activeLaws.civic)
  -> number // 0..2, hypothetical award for this public city
```

For a known design, quote amounts remain available even when `allowed` is false. `allowed` checks the current stage/actor, stock, empty-city space, and affordability, but not a particular plot. `reason` is null when allowed, otherwise a safe concise string. `cost` is actual payment; discount `amount` is the actual reduction, and `sourceId` is null, `workshop`, or the chosen law ID. Choose the law on a tied eligible discount for stable display. `influenceGain` is the gain after the cap; `prestige` is printed building prestige. `streetOutcome` evaluates a hypothetical placement using public city data regardless of turn, coins, or stock: `canPlace` checks the chosen empty plot, `completes` means a newly filled row, `qualifies` means that completed row meets the guild rule, and `prestige` is its new one-time 0-or-2 award. Invalid IDs/coordinates use safe validation errors. Neutral Civic law yields zero. These functions never mutate or commit state.

## 2. Projected game state

Use this stable public shape so the frontend can start independently. Internal full state may differ. `rulesVersion` identifies implemented rules; start with the string `0.2`. All collections contain public authored definitions or visible state only.

```text
schemaVersion: 1
gameId: 'odd-laws-society'
rulesVersion: '0.2'
matchId: string
phase: 'playing' | 'finished'
stage: 'council' | 'actions' | 'finished'
phaseId: string
session: 1..6
term: 1..3
chair: 'jon' | 'lydia'
chairSchedule: PlayerId[6]
activePlayer: PlayerId | null
actionIndex: 0..5 | null
actionsRemaining: { jon: 0..3, lydia: 0..3 }
activeLaws: { economy: LawId | 'economy-neutral', civic: LawId | 'civic-neutral' }
agenda: [{ session, category: 'economy'|'civic', lawIds: [LawId, LawId] }]
council: {
  category, optionIds: [LawId, LawId, 'keep'],
  ready: {jon:boolean, lydia:boolean},
  ownCommitment: null | {choiceId, bid}
} | null
market: [{ designId, remaining: 0..2 }]
players: {
  jon: PlayerView,
  lydia: PlayerView
}
lastCouncil: null | {
  session, phaseId,
  choices: {jon:{choiceId,bid}, lydia:{choiceId,bid}},
  adoptedLawId, category
}
result: null | { winner: PlayerId | 'tie', scores:{jon:number,lydia:number} }
```

`PlayerView` contains `coins`, publicly visible `influence`, `city` (row-major array of nine nulls or `{instanceId,designId}`), `streetEvaluated` (three booleans), `buildsThisSession`, `festivalUsed`, and `score` with `buildings, streets, festivals, civic, treasury, total`. `total` includes the hypothetical treasury conversion; normal live display shows the first four components and labels treasury separately as potential. During a sealed council, public influence remains the pre-bid balance until both deductions occur at reveal.

Only the authenticated player receives its own `council.ownCommitment`; all other viewers get null. `lastCouncil` contains only a previously revealed council, never the pending one. Public setup/agenda cannot encode private votes. Optional public events need stable event IDs so reconnects do not replay rewards; never put secret pending content into event history.

Outside council, `council` is null; the full public agenda remains. Use fresh snapshots or immutable data; no phone can modify authority by editing this shape. Engine/frontend fixtures should cover council unsubmitted/own locked/opponent ready/reveal, ordinary turns, late/full city, and final ties.

## 3. Room and transport

Preserve the existing room envelope: `code, gameId, revision, phase, state, players, expiresAt`; `state` is now the authenticated viewer's projection for private games. The room's lobby phase remains available; the game's own phase is playing/finished.

Keep the existing action transport body `{ revision, actionId, action }` and bearer credentials in headers. No new URL token, insecure wildcard origin, client-supplied viewer role, or hidden full-state broadcast is permitted. Both HTTP and LAN SSE must obtain projected state through the same authenticated path, including retry/error/reconnect responses.

The platform may export a `createRoomApi({ resolveGame, resolveEngine })` factory (or equivalent explicit injection) so tests use a small secret-bearing fake engine without modifying the production catalog/registry. The injection must reach ordinary LAN requests and the handler projecting each SSE subscriber, so tests exercise the actual server path. Preserve the existing `handleApi(request, env)` entry point. The final integrator owns actual Odd Laws registration in `games/registry.mjs` and catalog enablement.

New browser command helper, owned by platform:

```js
createRoomClient({ code, token, playerId, initialRoom, fetcher, onRoom, onStatus })
  -> { submit(action): Promise<RoomEnvelope>, receive(room), dispose() }
```

Assign stable IDs once, serialize the seat's commands, preserve IDs on retry, reject stale city phases, accept authoritative projected snapshots, and cancel old-room work. The existing SSE subscription can feed `receive`. `onStatus` uses `{state:'connecting'|'connected'|'reconnecting'|'offline'|'error', message?:safeText}`; the shell bridges transport/client status to the view, including passive stream disconnection. Do not run the full private engine for optimistic feedback; button feedback and pending drafts suffice. Preserve existing Sofa Kingdoms prediction separately.

Platform owns the LAN server implementation and secure static serving. Add an explicit extension/injection seam for later browser module entries if needed; do not expose whole source directories or private fixtures. Document it in the platform report. Final serving-list wiring can be performed after the platform handoff, with its tests rerun.

## 4. Game view

Frontend owns `ui/games/odd-laws-society/**`. Media is outside that subtree at `ui/media/odd-laws-society/**`.

```js
export function mount(root, {
  viewer,
  dispatch,      // normalized action -> Promise<projected RoomEnvelope>
  rules,         // { buildings, laws, guilds, buildQuote, streetOutcome, civicAward }
  assets,        // { manifest, manifestUrl }; placeholder entries are allowed
  sound,         // { unlock(), setScene(scene), effect(name) }; may be silent
  preferences,   // includes reducedMotion
  onExit,
  onHelp,
}) {
  return { update(roomEnvelope), setConnection(status), dispose() };
}
```

The game view does not create room credentials, fetch hidden state, own an AudioContext, or import another workstream's unmerged module. The parent supplies `dispatch` and the public `rules` adapter; a standalone fixture harness supplies matching mocks. `rules.buildings/laws/guilds` are the catalog arrays, not private authority. `update` can render before/after a pending command; `setConnection` accepts the status shape above; `dispose` removes listeners, timers, animations, and detached UI work. View-local draft bids never alter or leak through the public board. `manifestUrl` is the complete manifest URL; resolve every entry with `new URL(entry.src, manifestUrl)`. Call `sound.unlock()` directly within a user gesture before awaiting a command; the shell must not rely on its old enumerated Sofa action names to unlock new game controls.

`sound.setScene(scene)` accepts the string enum `lobby`, `council`, `term1`, `term2`, `term3`, `celebrate`; effect names are `build`, `coin`, `influence`, `street`, `seal`, `reveal`, `stamp`, `festival`, `win`, `tie`. Trigger only committed public events, or local-only feedback on the actor's own phone. Resource/TV animations must not reveal a sealed bid.

## 5. Media and score

Media owns `public/assets/odd-laws-society/**` and `ui/media/odd-laws-society/**`. Inspect the available `public/assets/characters.png` (Jon mouse, Lydia mouse, Lala) and `sofa-room.png`. The original human character sheets are not in the repo and must not be assumed available in another chat.

`public/assets/odd-laws-society/manifest.json`:

```json
{
  "schemaVersion": 1,
  "gameId": "odd-laws-society",
  "buildings": {},
  "laws": {},
  "guilds": {},
  "characters": {},
  "props": {}
}
```

Every leaf image entry has `src` relative to the manifest URL, explicit `width,height,alt`, and `status: final|placeholder`. Buildings/laws use the exact eighteen/twelve PRD IDs; guild keys are `commerce,craft,civic,culture`. Use lowercase `characters.jon.states` and `characters.lydia.states`, each with `idle,thinking,acting,celebrate,disappointed`; `characters.lala.states` has `idle,thinking,stamp,celebrate`. Every required state provides a normal flat image entry usable without a custom rig. Optional layer/atlas/anchor metadata and extra action-specific states may extend it. Accurately label reused poses; do not claim unique animation frames when only a flat pose exists. Required prop keys are `envelope-sealed,envelope-open,stamp,coin,influence,street-glow`. No baked-in prices, rules, names, or score text. UI owns procedural animation, media supplies its sprites and metadata. Missing media must leave usable code-native fallback graphics.

`ui/media/odd-laws-society/score.mjs` exports pure `SCORE` metadata (title/key/bpm/beatsPerBar/form/bars) and `eventsForBar(index, mode='play')`. Events have `{instrument,pitch,beat,duration,level}`: MIDI pitch, onset and duration in beats at `SCORE.bpm`, finite nonnegative level, and instrument `woodwind|bass|pizzicato|bell`; inspect `ui/score.mjs`. Support the six scene strings above; `play` and unknown modes use the base arrangement. `effects.mjs` may export `eventsForEffect(name)` with the same beat/duration units and event vocabulary; unknown effects return `[]`. No DOM, timers, storage, network, or separate audio context in score data. Integrator connects the shared audio scheduler/preferences and keeps only one soundtrack active.

## 6. Desktop adapter

Desktop owns `desktop/**` and `.github/workflows/desktop.yml`, with nested manifests/lockfiles. Package the existing JavaScript rules and Node HTTP/SQLite/SSE host rather than porting the engine. Start immediately with Sofa Kingdoms.

Existing inspected server API:

```js
startLanServer({ root, databasePath, host, port, heartbeatMs })
  -> Promise<{ port, origin, urls, databasePath, close }>
```

`desktop/host/entry.mjs` can import the packaged server, accept fixed argument-array paths, and emit one bounded JSON readiness record:

```json
{"type":"ready","protocolVersion":1,"port":4177,"hostUrl":"http://127.0.0.1:4177/","controllerUrls":["http://192.168.1.20:4177/"]}
```

This is an example shape, not a real local address. Wait for actual readiness before opening the webview. Keep a stable saved loopback port/origin so stored controller/host credentials survive relaunch. Port zero is for isolated tests. Detect conflicts without connecting to or killing an unrelated process.

Bundle a pinned compatible Node runtime (at least 22.13), verifying official provenance/checksums and ESM/SQLite support. Normal app startup downloads nothing. Stage an explicit repo-shaped runtime allowlist, including server modules, shared game modules, UI/assets, and migrations; root affects served files, not relative module imports. Exclude credentials, local databases, checkout state, development dependencies, and irrelevant sources. Keep SQLite in writable app data outside signed resources.

Use `desktop/runtime-manifest.json` as the staging contract: `{schemaVersion:1, files:[{path, mode?}]}`, where every `path` is an explicit repository-relative file path, `mode` is an optional executable mode, and no wildcard or parent traversal is allowed. Target-specific verified Node binaries are staged separately by the desktop packager. WS5 owns the manifest initially; after its tested handoff, WS6 may add the final Odd Laws runtime files to this one desktop file and must rerun desktop validation. Other native code remains with WS5 unless a separate post-handoff fix is identified.

The native parent owns child startup/shutdown, single-instance behavior, readiness, crash handling, sleep/resume, and a controlled refresh/restart after LAN-address changes. Phones get normal web APIs, never native shell/file capabilities. Reuse settings and gesture-based audio unlock; no native performance claim without measurement.

For current native testing, consult [Tauri WebDriver guidance](https://v2.tauri.app/develop/tests/webdriver/) and [GitHub runner architectures](https://docs.github.com/en/actions/reference/runners/github-hosted-runners). As checked on 20 November, Tauri documents WebdriverIO with `@wdio/tauri-service` and an embedded server for macOS; do not assume bare `tauri-driver` limitations rule out native Mac CI. Keep any embedded driver test-only. Verify the runner's actual architecture and artifact target.

A Mac CI launch is not a physical-phone/Wi-Fi/TV test. Complete available native build/runtime checks, provide artifacts, and explicitly identify remaining hardware evidence. Missing Apple signing credentials are not permission to invent credentials, claim notarization, or disable platform security.

## 7. Shared completion and PR contract

Persist through implementation, focused testing, fixes, review, and PR creation. Checkpoint code and the owned report so compaction or another session can resume. Do not wait indefinitely for another stream: use fixtures, dependency injection, or the existing game to complete independently testable scope.

Every stream pushes its own branch and opens a PR to `main` titled with `WS1` through `WS6`. Include scope, exact tested head, commands/results, evidence, dependencies, and remaining gates. WS1–WS5 implement and run their exclusively owned component workflows; WS6 owns the remaining shared test/integration workflows and runs the combined suite. Check remote CI and repair relevant failures. Do not self-merge or deploy. A component can be ready for integration while explicitly pending whole-product acceptance; a missing test essential to the component itself requires a draft PR with that exact blocker.

The integrator records a manifest of component PR numbers and immutable head SHAs. Prefer already merged components; otherwise assemble those exact reviewed heads on a candidate branch without rewriting their branches. Do not cherry-pick the same patch twice. The preferred review/merge sequence is WS1–WS5 first, then reconcile WS6 against that resulting `main` and rerun acceptance at its final head. Until then, label any aggregate integration PR as depending on its component PRs; do not present both an aggregate and its duplicated component patches as independent merges. Before declaring final CI valid, confirm its tested source equals the proposed integration head and revalidate any changed component.

For the final PR, complete a real engine-backed match with a TV view and two separate controller contexts, privacy checks on serialized HTTP/SSE payloads, reconnect/retry/rematch, data recovery after app relaunch, offline asset checks, audio/motion behavior, and Sofa Kingdoms regression. Include actual rendered evidence, reproducible local commands, Mac build/runtime evidence, and any remaining physical-device limitations. A tested native artifact is required before calling the desktop build ready; a mockup or browser-only run is insufficient.
