# GO4 — Gravity Orchard TV and tutorial experience

You are implementing GO4, the finished shared-TV presentation and optional tutorial for **Gravity Orchard v0.2** in Sofa Arcade. Complete the owned experience, create graphical fixtures, test it in a browser, inspect the actual screenshots, fix defects, and open a GitHub PR.

**Repository:** https://github.com/jonathanjie/sofa-arcade

## Context and baseline

Jon and Lydia use a local Tauri Mac as the TV host and two ordinary phone browsers as controllers. The collection already contains Sofa Kingdoms and Odd Laws Society. Gravity Orchard v0.2 adds simultaneous cooperative play: each player tilts one of two connected garden trays, passes fruit across a bridge, brakes to steady it, and fills shared picnic recipes. Standard runs have three 90-second stages, up to eight active fruit and four three-fruit recipes per stage. The game must work with touch controllers as well as properly authorized phone motion.

The TV is the main playing surface, not a documentation page. Keep the board large, control ownership clear and text compact. Instructions belong in the optional tutorial/Help. Warm illustrated Jon/Lydia/Lala artwork, dynamic characters and composed host-only sound should match the collection. Reduced motion and colour-independent fruit/basket recognition are requirements.

Read `AGENTS.md`, `README.md`, `docs/GITHUB_WORKFLOW.md`, `docs/GRAVITY_ORCHARD_CONTRACT.md`, `docs/DISPATCH_GRAVITY_ORCHARD.md` and `docs/games/gravity-orchard.md`. Inspect existing shared view, tutorial, motion and audio integration conventions. The new packet supersedes the archived turn-based 5×5 Gravity Orchard design. Exact schemas/signatures come from the contract, not your own variant.

Fetch GitHub and inspect existing branches/PRs. Use an isolated clone/worktree on `feature/gravity-orchard-tv`; record the exact base SHA. Use current `main` with this packet, or deliberately identify and record the exact reviewed packet commit if it has not landed yet. Do not continue from v0.1, overwrite concurrent work or force-push another session's branch.

## Exclusive write ownership

- `ui/games/gravity-orchard/tv/**`
- `ui/games/gravity-orchard/tutorial/**`
- `.github/workflows/go4-tv.yml`
- `docs/workstreams/gravity-orchard-go4.md`

Keep fixture tooling/dependencies/locks within an owned subtree. Do not edit the phone subtree, game engine, real-time client, media subtree, shared shell, root dependencies, native packaging, global styles, collection adapter or generated public copies. GO3 owns phone/motion UI; GO5 owns final assets/audio; GO7 owns `ui/games/gravity-orchard/index.mjs` and shared integration.

Use up to three subagents if available, with explicit separate files. Suitable lanes are TV scene/rendering, tutorial/fixtures and independent accessibility/browser validation. You remain responsible for their combined result.

## Build a finished TV view

1. Export `mountTV(root, {assets, geometry, onCommand, onExit, sound, reducedMotion, now})` from `tv/index.mjs`, returning `update(view)`, `setConnection(status)` and `dispose()`. Export `mountTutorial(root, {onClose, inputMode, reducedMotion})` from `tutorial/index.mjs`, returning `dispose()`. Follow the contract for all argument details. Use injected projected snapshots, public geometry/helpers, media and callbacks. Do not import private authority, create a second room client or start your own authoritative simulation.
2. Render both trays, the bridge, authored terrain, fruit, baskets and buffer counts from actual public coordinates/metadata. The active recipe, next two recipes, stage/time, readiness and connection state must be readable from a sofa while leaving the board dominant. Read both-player presence through the optional `presence` field of `setConnection` status, as the contract specifies; do not add transport state to the pure engine projection.
3. Interpolate authoritative snapshots smoothly at display-frame rate, respecting match/epoch/tick changes. Bound interpolation/extrapolation and freeze safely on missing data. Snap or reconcile cleanly after reconnect and pause; never predict a score, capture or completed recipe as confirmed. Stable event IDs from the bounded recent ring prevent repeated celebration/sound triggers; clear the event cursor on a new match. Use exact public geometry and event kinds from the contract.
4. Make each player's force and Brake state immediately understandable. Use gardener lean/brace/cheer, bridge handoff emphasis, basket acceptance/rejection/full states, and distinct Lala forecast/gust cues. Code-native fallbacks must remain usable before GO5 arrives; expose a real media-injection seam instead of hardcoding another final asset library.
5. Implement the complete presentation lifecycle using the exact phases `waiting`, `countdown`, `playing`, `paused`, `interlude` and `finished`. Include controller loss/neutral state, reconnect/resume countdown, stage success/timeout and run results. Host-only completed-stage retry is available in interlude/finished; whole-run same/new-seed rematch is available when paused/finished. Dispatch only contracted commands; both-ready performs resume, not a new `resume` wire kind. Never use an endlessly animated fake score in place of a real projected state.
6. Keep recipe and hazard cues visual as well as audible; symbols/patterns must work without colour alone. Do not rotate the whole screen or coordinate system to indicate tilt. Honor live reduced-motion changes without losing the current match/view subscription.
7. Keep styles scoped to the owned view. Release timers, animation frames, observers, listeners, overlays and inserted style elements on disposal. Late callbacks after navigation must not resurrect an old scene.

## Tutorial and graphical fixtures

Deliver an optional isolated practice/tutorial covering natural grip/recenter, independent trays, Brake, a bridge handoff, matching baskets, recipe buffers, hazards and pause/recovery. Sensor permission/calibration UI is GO3's responsibility; teach its meaning without implementing a second permission requester.

The tutorial owns private scripted fixtures behind the contracted `mountTutorial` API; do not add a live dispatcher or invent an incompatible required driver argument. It must never issue a command to a real room, mutate live state or rig a normal run's seed. Opening Help during playing/countdown uses the TV's injected `pause` command with reason `help`; closing Help does not resume without both players becoming ready. Keep this isolated tutorial distinct from a normal `mode: 'practice'` engine run.

Create an owned, working browser fixture with all lifecycle states and a coherent multi-stage sequence. It must render actual fruit/basket/terrain visuals and interactable tutorial steps, not only JSON text. Use clearly labeled injected transport/engine fixtures while dependencies are unfinished; validate against exact reviewed real fixtures when available without editing their sources.

The tutorial should be short and demonstrative. Explanations disappear after completion. Normal gameplay should not permanently display step-by-step instructions, networking internals, certificates, API names or developer diagnostics.

## Verify and repair

Run rendered browser tests and inspect real screenshots at **1280×720** and **1920×1080**. Check the entire board, active/preview recipes, connection warning, paused state, Lala telegraph, dense eight-fruit scene, basket saturation, results and every final/rematch control. Verify no hidden horizontal overflow or clipped primary action at 720p.

Test keyboard/focus order for tutorial and modal controls, reduced motion, missing/failed assets, repeated snapshots/event IDs, stale/old-epoch frames, remount/disposal and late callbacks. Test that opening help requests pause and that tutorial actions cannot call a live dispatch function. Keep logical board positions aligned with visual hit targets through scaling and resize.

Run a full fixture journey through all three stages, ordinary and perfect results, timeout, pause/reconnect and same-seed rematch. Use the actual public schema; do not make tests pass by weakening fixture checks or bypassing the component you are validating.

Your owned CI must run the new view/tutorial and rendered tests, retaining screenshots/reports. Use locked nested tooling. Legacy root tests alone are insufficient. Execute the relevant existing baseline/build checks from `AGENTS.md`, but do not commit shared generated files. Browser fixture success does not establish phone sensor access, living-room Wi-Fi, native WKWebView, casting or physical speaker behavior.

## Completion and PR

Work through implementation, browser exercise, screenshot inspection and repairs until the complete owned experience is reviewable. Do not stop after a static mockup or the happy-path running screen. Use injected contracts to keep progressing while other streams are unfinished.

Write `docs/workstreams/gravity-orchard-go4.md` with base SHA, exports, selectors/lifecycle behavior, runtime/browser file list, media requests, actual checks/evidence, integration requirements and a clear handoff state. State incomplete external gates honestly.

Commit only owned files, push and open a GitHub PR to `main` titled **GO4: Gravity Orchard TV and tutorial**. Describe the player experience, tested submitted commit, screenshot evidence and GO7 wiring needs. Do not self-merge, enable the game, edit the phone component, deploy Sites/Pages or claim a complete native release. Return the PR URL, tested commit, results and limitations.
