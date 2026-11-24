> Historical record. This assignment ended on 21 November 2026 at `e0504c1`.

# GO3 — Phone controller, tilt calibration and touch play

Copy the complete prompt below into a separate implementation session.

---

You are implementing **GO3, the phone controller and motion input**, for Gravity Orchard in Sofa Arcade.

Repository: https://github.com/jonathanjie/sofa-arcade

Use an isolated clone/worktree. Fetch current main, record its SHA, and create feature/gravity-orchard-phone. Start from main containing the Gravity Orchard v0.2 dispatch packet. If it is still on the reviewed packet branch, explicitly pin that exact reviewed commit and record the dependency, as the dispatch permits; do not use the old PRD. Read AGENTS.md, docs/HANDOFF.md, docs/archive/DISPATCH_GRAVITY_ORCHARD.md, docs/GRAVITY_ORCHARD_CONTRACT.md, docs/GRAVITY_ORCHARD_TECHNICAL_NOTES.md, and docs/games/gravity-orchard.md. Inspect existing source. Do not revive the archived turn-based v0.1 design.

## Context and objective

Jon and Lydia play one collection of games on a living-room TV using two ordinary phone browsers. The Mac runs a local Tauri app and owns the board/authoritative game. Sofa Kingdoms and Odd Laws Society already work. Gravity Orchard adds real-time cooperation: each person tilts their own garden tray, passes fruit over a central bridge, and fills shared picnic recipes. Three authored stages run for 90 active seconds each, with untimed interludes and practice. No phone app or internet relay is required by the intended design.

Build the real phone experience and input adapter, not a mockup. Comfortable seated tilt and one large held Brake button are the primary controls. A touch joystick must offer the whole game when tilt is unavailable. Normal screens stay uncluttered; setup instructions belong in the initial walkthrough and Help.

## Exclusive write ownership

Write only:
- ui/games/gravity-orchard/phone/**
- .github/workflows/go3-phone.yml
- docs/archive/workstreams/gravity-orchard-go3.md

You own sensor processing, calibration, touch controls, actual phone markup/styles and an independent visual/test harness inside that subtree. Use nested test dependencies/lockfiles if needed. Do not edit TV/tutorial, final shared game index, server/transport, TLS, desktop, shared shell/audio, root dependencies, catalog/registry, generated public files, other workflows/reports, or the frozen contract. Report integration needs in your owned report.

GO2 owns the WebSocket client and its 20 Hz sender. GO4 owns TV and the broader game tutorial. GO5 owns final reusable art/audio. GO6 owns certificate setup. GO7 wires their real modules. Use injection and small safe fixtures so you can finish without waiting for them. Create code-native diagnostic visuals for your harness; consume the contracted art keys with accessible fallbacks rather than duplicating GO5's final cover/character set.

## Required implementation

Implement the exact createMotionController and mountPhone exports in the contract. The mounted view consumes a public view, connection status and injected setInput/onCommand functions. It must not advance the simulation, score or clock. Emit only normalized x/y in [-1,1] and a held boolean Brake; positive x means right and positive y down. GO2 adds match/epoch/sequence/authentication fields.

Use relative DeviceOrientation beta/gamma and a comfortable neutral pose, not compass heading or integration of raw acceleration. Feature-detect secure context and APIs. Where requestPermission exists, call it directly inside the user's tap before unrelated await operations. Handle rejection, denied/unsupported/insecure states and granted permission with no finite sensor samples. Never repeatedly prompt or strand the player.

Calibrate from stable samples, implement bounded filtering/dead zone/sensitivity in one module, and prevent recentering from creating a sudden force spike. Start near the contract's 25-degree usable range and 3-degree dead zone, clearly labelled as tuning assumptions. Test orientation angles 0/90/180/270 and wrap boundaries. Pause/recenter deliberately on rotation. Do not require shaking, flicking, rapid movement, a perfectly flat phone or motion while standing.

After initial readiness, a stationary phone with no changed events must remain controllable. Keep its latest stable vector; the network heartbeat is a separate clock. On hidden/locked page, Help, recenter, pointer cancellation or disposal, emit neutral+Brake and attempt a shared pause. Never assume the final message will arrive; the server's deadman covers it. Dispose every listener, animation frame, timer and pointer capture.

Build the actual portrait phone view at 360/390 CSS pixels: player identity, compact connection status, tilt gauge or joystick, one generous Brake button and compact pause/recenter access. Touch targets should be comfortably at least 48 CSS pixels. Show ready/countdown/paused/interlude/results without persistent rule paragraphs. Do not silently resume when Help closes; both players must be ready.

Touch mode must work on ordinary LAN HTTP, with complete two-dimensional steering, held Brake, multi-touch/pointer-cancel safety and a useful keyboard equivalent in the test harness. Keep phones quiet and respect reduced motion. Communicate readiness/error status with text/icons as well as colour. Match the warm existing collection style.

## Work plan and tests

Use up to three concurrent subagents if available, with disjoint ownership: sensor/calibration module; responsive phone view; harness/meaningful tests/accessibility review. Integrate and independently review their changes. Keep working through implementation, rendered testing and repairs; do not stop at scaffolding or manufacture waiting. Checkpoint coherent work and maintain the owned report.

Use injected sensor/event/clock environments for deterministic tests covering insecure/unsupported/denied/granted/no-sample states; finite/invalid readings; calibration noise/wrap; all orientations; recenter; stationary hold; hidden/resume; pointer cancellation; joystick+Brake; disposal and late events. Verify no raw sensor recording or accidental client score authority.

Add a rendered browser fixture that exercises every visible state, actual input events and both control modes at 360/390 widths, portrait and landscape. Record emitted normalized values, not fake network-latency numbers. Capture screenshots and inspect them. Verify targets, scrolling, focus, safe-area layout and reduced motion. Exercise the complete setup-to-play-to-pause/recenter flow. Test the adapter independently of real hardware and label the distinction.

Create the owned GitHub Actions workflow to run your actual new Node/browser suites and preserve useful screenshots/traces. Existing npm test does not discover your subtree automatically. Consult current primary browser documentation where needed. Real iOS Safari and Android Chrome trust/permissions/finite sensor readings require physical devices; if unavailable, explicitly mark those checks unverified rather than claiming emulation proves them. You can complete the component against its contract without waiting for GO6.

## Handoff and PR

Deliver the implementation, test commands/results, exported APIs, runtime/browser file inventory, screenshots, tuning assumptions and exact physical-device checklist in docs/archive/workstreams/gravity-orchard-go3.md. Reconcile current main without overwriting another session's work. Inspect the final diff and verify only your owned files changed.

Push feature/gravity-orchard-phone and open **“GO3: Add Gravity Orchard phone tilt and touch controls”** against main. Inspect CI, fix relevant failures and report the PR URL and exact tested commit. If an essential component test is genuinely blocked, finish everything reachable and open a draft PR with the precise missing gate. Do not self-merge, mark the game playable, deploy Sites, publish a desktop release or modify phone trust settings automatically.
