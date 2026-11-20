# GO4 — Gravity Orchard TV and tutorial

## Source and handoff state

- Repository: `jonathanjie/sofa-arcade`.
- Branch: `feature/gravity-orchard-tv`.
- Base fetched from `main`: `6c6eb9343958da591b4488366c2ada4000e3ba08`.
- Contract: frozen Gravity Orchard v0.2 pack at that base.
- Current state: component implementation complete; rendered CI validation and screenshot review in progress. This report will record actual final results before handoff.
- No shared shell, phone, engine, transport, media pack, registry or production allowlist changes. The game remains planned. No merge or deployment.

## Runtime exports

`ui/games/gravity-orchard/tv/index.mjs` exports:

```js
mountTV(root, { assets, geometry, onCommand, onExit, sound, reducedMotion, now })
  // -> { update(view), setConnection(status), dispose() }
```

`ui/games/gravity-orchard/tutorial/index.mjs` exports:

```js
mountTutorial(root, { onClose, inputMode, reducedMotion })
  // -> { dispose() }
```

The TV accepts the exact safe `PublicView`. It clones the listed fields and rejects invalid values/oversized lists without drawing NaN or changing authority. Presentation never computes a score, recipe capture, spawn or clock tick. `update` additionally returns a boolean accepted result for diagnostics; GO7 need not consume it.

`geometry` can be the browser-safe GO1 module with `getLevel`, its `LEVELS` map/array, or one level. Missing geometry is explicit; runtime does not invent a collision map. The retained SVG scales uniformly using the injected bounds and draws fruit at the public coordinates.

`onCommand({kind,payload})` is injected by GO7. It may return a command-result Promise (or void). GO7 supplies reliable IDs, authenticated host authority and the current match/epoch. Legal host controls dispatch only `pause`, `retry-stage` and `rematch`. There is no TV steering, player `ready`, or `resume` command. Authoritative updates remain the sole phase source even after a command is acknowledged.

`setConnection({state,presence?})` accepts GO2's five status states and optional exact two-player presence; it never adds network data to the engine projection. Pass connection/presence before `update(snapshot.view)` when handling a welcome or reconnect snapshot. A disconnected/stale view is held; presentation control badges become neutral + Brake without changing the received snapshot. Transport diagnostic text is not echoed into ordinary gameplay.

`sound` is the existing shared host scheduler adapter: optional `setScene(scene)` and `effect(name,{id,event})`. Scene keys are menu/practice/stage1/stage2/stage3/paused/celebrate, and effects are catch/reject/compost/order/forecast/countdown/finish. There is no AudioContext, audio-unlock override, volume store or music timer here. The owner retains music/effects preferences and host-only lifecycle. Stable event IDs and per-cue burst restraint prevent replay/overlap; initially received and reconnect history is silent.

`reducedMotion` accepts a boolean, a live zero-argument getter or a MediaQueryList-like object. The OS reduced-motion preference always wins. Live changes update the existing scene without remounting/subscription loss. Essential force/gust arrows, final positions and basket/gate state remain visible.

`now` is a monotonic millisecond presentation clock. The timeline buffers at most twelve accepted snapshots, renders 75 ms behind the newest received tick, interpolates only between known positions, and never extrapolates. Latest authoritative membership immediately removes caught fruit. Phase/epoch/level/match changes and reconnect snap cleanly. Old ticks/epochs and recently retired match IDs are rejected; GO2 remains responsible for stream ordering. After 750 ms without an active snapshot the TV displays a stale warning; the last known positions and all score/time fields remain fixed.

## Lifecycle and tutorial

All six exact phases are implemented, including both-player readiness, countdown, play, shared pause, stage success/timeout and results. The top strip contains only the active recipe, next two, stage progress and authoritative clock. Both tray identities, full/rejected basket states, bridge handoffs, deferred gate closure and Lala's directional gust warning are visible on the garden.

Host retry is available in interlude/finished when a completed result exists. Same/new-seed whole-run controls appear only paused/finished. Perfect Picnic requires all three stage results, twelve orders and no compost. Untimed practice is labelled without manufacturing a campaign record.

Help during playing/countdown requests `{kind:'pause',payload:{reason:'help'}}` and waits for an authoritative non-active view before opening. Rejection leaves live play visible. Closing/finishing Help sends no ready/resume command. Both phones must ready through GO2 for the normal countdown. A remote resume or a new match closes obsolete Help. The TV also requests pause before exiting active connected play.

The optional tutorial has eight private interactive lessons: comfortable grip/recenter meaning; independent steering using touch/keyboard; held Brake; bridge transfer; matching baskets/rejection; buffered recipe completion; compost/gate/gust warnings; pause/both-ready. It has no live dispatcher, engine, transport, sensor permission request or saved campaign state. Its private examples do not change a normal seed. It traps focus, supports Escape/skip/back, restores prior focus and removes its resources on close/dispose.

Both mounts support repeated mount/dispose, ignore late async work and release RAF/listeners/styles/overlays. The TV owns the tutorial it opens; GO7 owns the realtime client and sound adapter lifetime.

## Browser inventory and media injection

The exact eleven browser modules are listed in `ui/games/gravity-orchard/tv/runtime-files.json`; production dependencies are empty. GO7 must add that closure to shared browser/LAN/native/portable inventories. Exclude nested package files, tests, fixtures, reports, screenshots and READMEs from production delivery.

Final reusable media belongs to GO5. This component uses code-native diagnostic silhouettes until injected. It accepts `{assets,characterStates}` or adapters exposing `resolve(key)`/`getAsset(key)`. Canonical keys include `fruit.apple`, `basket.apple`, `environment.morning-delivery`, and `character.jon.idle`; equivalent hyphen keys and `characterStates` references work. Supported character vocabulary: Jon/Lydia idle/lean/brace/cheer; Lala idle/forecast/gust/pleased. `cheer` also recognizes `celebrate`. Root-relative URLs, declared dimensions and atlas frame rectangles/durations are supported. Failed images preserve the fallback shape. Terrain collision and labels always come from geometry/public state, never from an image.

Stable integration selectors include `[data-go-tv]` with phase/match/epoch/tick/stale/connection attributes, `[data-go-action]`, `[data-go-orders]`, `[data-go-clock]`, `[data-go-status]`, `[data-go-panel]`, `[data-go-hazard]`, `[data-go-scene]`, `[data-fruit-id]`, `[data-basket]`, `[data-player]`, `[data-gate]`, and `[data-go-tutorial]` / `[data-tutorial-step]` / `[data-tutorial-action]`.

## Verification and evidence

Reproduce owned checks:

```sh
cd ui/games/gravity-orchard/tv
npm ci --ignore-scripts
npm test
npx playwright install --with-deps chromium
npm run test:browser
```

The standalone fixture is `npm run fixture`, at `http://127.0.0.1:4194/tv/fixtures/`. The fixture toolbar explicitly identifies injected diagnostic snapshots; it is excluded from normal runtime delivery. Seventeen scenarios cover all phases, eight simultaneous fruit, full baskets, gate forecast/deferred/closed, Lala forecast/active gust, reconnect, timeout, ordinary/perfect final results and untimed practice. A coherent injected three-stage transcript exercises the actual view; it does not claim engine solvability.

Executed so far:

- Root `npm test`: 81/81 passing.
- Root `npm run install:ci` and `npm run build`: passing; no root manifest/lock changes.
- Owned Node checks: 16/16 passing before rendered review.
- Browser spec discovery: 18 rendered tests, including 720p/1080p lifecycle and tutorial sweeps, layout bounds, alignment, authority, malformed/stale data, presence, host commands, repeat event IDs, motion preferences, failed assets and disposal.
- Executor Chromium cannot launch: `ProcessSingleton socket() failed: Operation not permitted`. The separate cloud browser cannot reach this executor's loopback. Neither is counted as a rendered pass. The owned workflow executes the locked real Chromium suite in GitHub Actions and retains screenshots/HTML/JSON/traces with the exact tested SHA.

Final CI runs, inspected screenshot findings and any repairs will be appended before component handoff.

## External acceptance gates

GO7 must inject reviewed GO1 public geometry/views, GO2 connection/command callbacks, GO5 final media/music, shell navigation and production inventories. These fixture checks do not establish the integrated realtime game, sensor permission/calibration, phone certificate trust, living-room Wi-Fi/casting latency, native WKWebView, speaker behavior, human difficulty or physical-phone compatibility.
