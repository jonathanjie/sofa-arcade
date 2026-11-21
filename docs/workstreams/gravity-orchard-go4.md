# GO4 — Gravity Orchard TV and tutorial

## Source and handoff state

- Repository: `jonathanjie/sofa-arcade`.
- Branch: `feature/gravity-orchard-tv`.
- Base fetched from `main`: `6c6eb9343958da591b4488366c2ada4000e3ba08`.
- Contract: frozen Gravity Orchard v0.2 pack at that base.
- Handoff state: component-ready. The complete TV/tutorial implementation has passed the owned Chromium fixture suite, screenshot inspection and repairs. Final integration remains GO7's responsibility.
- Pull request: [GO4: Gravity Orchard TV and tutorial #14](https://github.com/jonathanjie/sofa-arcade/pull/14). Its description records the exact final tested submitted SHA; the workflow also writes `tests/tested-commit.txt` into each evidence artifact.
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

`now` is a monotonic millisecond presentation clock. The timeline buffers at most twelve accepted snapshots, renders 75 ms behind the newest received tick, interpolates only between known positions, and never extrapolates. Latest authoritative membership immediately removes caught fruit. Phase/epoch/level/match changes and reconnect snap cleanly. A higher recovery epoch can restore a lower checkpoint tick; old ticks within the same epoch, old epochs and recently retired match IDs are rejected. GO2 remains responsible for stream ordering. After 750 ms without an active snapshot the TV displays a stale warning and held-view presence; the last known positions and all score/time fields remain fixed.

## Lifecycle and tutorial

All six exact phases are implemented, including both-player readiness, countdown, play, shared pause, stage success/timeout and results. The top strip contains only the active recipe, next two, stage progress and authoritative clock. Both tray identities, full/rejected basket states, bridge handoffs, deferred gate closure and Lala's directional gust warning are visible on the garden.

Host retry is available in interlude/finished when a completed result exists. Same/new-seed whole-run controls appear only paused/finished. Perfect Picnic requires all three stage results, twelve orders and no compost. Untimed practice is labelled without manufacturing a campaign record.

Help during playing/countdown requests `{kind:'pause',payload:{reason:'help'}}` and waits for an authoritative non-active view before opening. Rejection leaves live play visible. Closing/finishing Help sends no ready/resume command. Both phones must ready through GO2 for the normal countdown. A remote resume or a new match closes obsolete Help. The TV also requests pause before exiting active connected play.

The optional tutorial has eight private interactive lessons: comfortable grip/recenter meaning; independent steering using touch/keyboard; held Brake; bridge transfer; matching baskets/rejection; buffered recipe completion; compost/gate/gust warnings; pause/both-ready. It has no live dispatcher, engine, transport, sensor permission request or saved campaign state. Its private examples do not change a normal seed. It traps focus, supports Escape/skip/back, restores prior focus and removes its resources on close/dispose.

Both mounts support repeated mount/dispose, ignore late async work and release RAF/listeners/styles/overlays. The TV owns the tutorial it opens; GO7 owns the realtime client and sound adapter lifetime.

## Browser inventory and media injection

The exact eleven browser modules are listed in `ui/games/gravity-orchard/tv/runtime-files.json`; production dependencies are empty. GO7 must add that closure to shared browser/LAN/native/portable inventories. Exclude nested package files, tests, fixtures, reports, screenshots and READMEs from production delivery.

| Owned area | Runtime files |
| --- | --- |
| `ui/games/gravity-orchard/tv/` | `index.mjs`, `public-view.mjs`, `timeline.mjs`, `effects.mjs`, `styles.mjs`, `scene.mjs`, `scene-style.mjs` |
| `ui/games/gravity-orchard/tutorial/` | `index.mjs`, `lessons.mjs`, `graphics.mjs`, `styles.mjs` |

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

The complete runtime and tests were verified at `8f0e3f9b0e364f8554c68bc8f1db41e3443a29cc` in [GO4 CI run 44778298198](https://github.com/jonathanjie/sofa-arcade/actions/runs/44778298198):

| Check | Actual result |
| --- | --- |
| Owned public fixtures, timeline, event identity and module isolation | 19/19 passed |
| Existing collection rules and rooms | 81/81 passed |
| Locked Playwright 1.57.0 / Chromium rendered suite | 20/20 passed; zero failed, skipped or flaky |
| 1280×720 and 1920×1080 lifecycle/tutorial screenshots | 52 PNG captures retained in the run artifact |
| Production build | `npm run install:ci` and `npm run build` passed locally; build repeated after the first repairs |
| Shared generated-file integrity | `node scripts/check-derived.mjs` passed; no shared generated changes |
| Ownership and whitespace | Only GO4's four allowed areas changed; `git diff --check` passed |

Rendered coverage includes all seventeen lifecycle/hazard scenarios, every tutorial lesson, ordinary/perfect three-stage transcripts, timeout, same/new-seed rematch, completed-stage retry, shared Help pause, pending/rejected commands, actual SVG interpolation and endpoint freezing, malformed/stale data, reconnect/presence, repeated event IDs, live reduced motion, missing assets and disposal. Keyboard focus stays in the tutorial, Escape restores focus without resuming, primary controls fit both viewports, and the repaired Next/Brake hover states meet the tested 4.5:1 text-contrast threshold.

Actual screenshots were inspected, including all sixteen tutorial captures and both-resolution dense/hazard pairs, plus waiting, pause, reconnect, full baskets, ordinary/perfect results, reduced motion and failed-asset fallbacks. Inspection found and repaired the recipe card covering Lydia's label, parent TV hover styling reducing tutorial button contrast, and a gate caption covering adjacent compost openings. The final 1080p gate capture and corrected 720p tutorial/forecast captures were re-opened and inspected. Targeted geometry/contrast assertions now guard those defects. An asynchronous fixture-count race was repaired by waiting for the valid rendered frame before injecting malformed data; the retained-state assertion remains intact.

Four unmodified representative PNGs are committed under `tv/evidence/`:

- [720p dense garden](../../ui/games/gravity-orchard/tv/evidence/tv-1280-dense.png)
- [720p Lala gust forecast](../../ui/games/gravity-orchard/tv/evidence/tv-1280-gust-forecast.png)
- [1080p deferred gate and bridge transfer](../../ui/games/gravity-orchard/tv/evidence/tv-1920-gate-deferred.png)
- [720p isolated recipe tutorial](../../ui/games/gravity-orchard/tv/evidence/tutorial-1280-step-6.png)

[Evidence provenance](../../ui/games/gravity-orchard/tv/evidence/provenance.json) records their source commit, run, artifact digest, capture hashes and all eleven runtime-file hashes. These are diagnostic fixture screenshots, not final art. The final evidence/report commit changes no runtime or tests; the owned workflow runs again on its exact submitted head. Full screenshots, HTML, JSON and failure traces are retained for fourteen days by each run; the four committed captures remain reviewable in Git.

The executor's Chromium launch is restricted (`ProcessSingleton socket() failed: Operation not permitted`), and the separate cloud browser cannot reach its loopback. Neither attempt is counted as a rendered pass. The actual rendered passes above were obtained from the pinned Chromium browser in GitHub Actions.

## External acceptance gates

GO7 must inject reviewed GO1 public geometry/views, GO2 connection/command callbacks, GO5 final media/music, shell navigation and production inventories. These fixture checks do not establish the integrated realtime game, sensor permission/calibration, phone certificate trust, living-room Wi-Fi/casting latency, native WKWebView, speaker behavior, human difficulty or physical-phone compatibility.
