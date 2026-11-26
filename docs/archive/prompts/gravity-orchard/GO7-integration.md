> Historical record. This assignment ended on 21 November 2026 at `e0504c1`.

# GO7 — Collection, realtime host and Tauri integration

Copy the complete prompt below into a separate implementation session.

---

You are implementing **GO7, final integration and acceptance**, for Gravity Orchard in Sofa Arcade.

Repository: https://github.com/jonathanjie/sofa-arcade

Use an isolated clone/worktree. Fetch current main, record its SHA, and create feature/gravity-orchard-integration. Start from main containing the Gravity Orchard v0.2 dispatch packet. If it is still on the reviewed packet branch, explicitly pin that exact reviewed commit and record the dependency, as the dispatch permits; do not use the old PRD. Read AGENTS.md, docs/HANDOFF.md, docs/GITHUB_WORKFLOW.md, docs/archive/DISPATCH_GRAVITY_ORCHARD.md, docs/GRAVITY_ORCHARD_CONTRACT.md, docs/GRAVITY_ORCHARD_TECHNICAL_NOTES.md, and docs/games/gravity-orchard.md. Inspect actual source and open GO1–GO6 PRs; do not assume handoff prose proves implementation or that a PR's latest head is its tested head.

## Context and objective

Sofa Arcade is one GitHub repository and one game collection. The Mac's Tauri app hosts the TV board and two browser phones over LAN. Sofa Kingdoms and Odd Laws Society already work, including private council votes, composed host music, local packaging and native lifecycle. Preserve them.

Gravity Orchard is a real-time cooperative tilt game: two garden trays, bridge transfers, four fruit/basket types, shared recipes, Brake, three 90-second stages, optional untimed practice. The Mac owns 60 Hz simulation; phones send latest normalized steering at 20 Hz; viewers receive 20 Hz snapshots. Touch remains complete over ordinary HTTP. Optional trusted local HTTPS/WSS supports motion after explicit phone setup. Rates/difficulty are initial hypotheses, not measured promises.

Your job is to assemble the actual tested components into a playable collection entry and prove the whole path. Begin the integration harness and adapters immediately; do not idle waiting for all six PRs. Do not duplicate their implementations.

## Exclusive write ownership

You own shared catalog/registry, shell routing/global integration styles, the new ui/games/gravity-orchard/index.mjs bridge, existing server/rooms.mjs and server/lan.mjs integration seams, existing desktop host/native/protocol/config entrypoints, shared audio wiring, root production dependencies/locks, explicit runtime/browser allowlists, generated public/app route files and portable package, tests/gravity-orchard-integration/**, .github/workflows/go7-integration.yml, shared handoff documentation, and docs/archive/workstreams/gravity-orchard-go7.md.

GO1–GO6 exclusively own the subtrees/workflows in the dispatch table. Do not edit them concurrently. After an explicit tested handoff, any necessary component correction must be small, reviewed, listed with exact path/blob/reason and reverified; preserve the original PR and its tested SHA. Do not weaken existing tests or CI checks to get green.

Use up to three subagents if available with separate files: server/auth/runtime wiring; collection/UI/media bridge; acceptance/package/native validation. Coordinate shared-file ownership before they edit.

## Assembly responsibilities

1. Inspect component reports, tests, exported APIs and real code. Record exact PR/base/head/tree and readiness. Use injected contract fixtures while work is pending. Assemble pinned reviewed heads into the integration branch without merging main or force-pushing someone else's branch. Prefer component PRs landing before final acceptance; reconcile latest main intentionally.

2. Add a narrow **server-only credential authorization seam** to existing room authority. A room GET does not identify a socket's seat. GO2's authorize callback must reuse the same room credentials/expiry/roles, never accept a client actor field or expose credential hashes. Keep all old HTTP/SSE/retry/private projection behavior.

3. Wire HTTP WS upgrades and optional HTTPS WSS upgrades to **one realtime coordinator and one room database**. Inject exact Host/Origin validation before upgrades. Derive HTTP/HTTPS scheme from the actual listener/socket, not forwarded headers; do not rewrite request headers to conceal scheme differences. Continuous inputs/ticks stay in memory; reliable lifecycle commands and bounded checkpoints use persistence. Existing GET/SSE/coarse room state must agree with the realtime run.

4. Integrate native secure-status/readiness/setup via GO6's factory. Keep the stable loopback host origin and owned-child shutdown/relaunch behavior, including the merged AppKit Quit fix. Advertise only validated controller origins. Phone routes cannot provision certificates, export private material or gain native capabilities. Setup callbacks are native/loopback host-authorized. Package needed certificate tooling and runtime dependencies; installed app startup downloads nothing.

5. Mount GO3 phone, GO4 TV/tutorial and GO5 assets/score through the shared game bridge. Pass only public views and authenticated viewer identity. Forward presence to presentation, keep input/command ownership clear, dispose every owner on navigation/rematch and reset event cursors per match. Do not run another global audio engine; preserve host-only output, music/effects preferences, unlock and existing menu transitions.

6. Add explicit serving/build/native inventories for required runtime files only. Do not expose private engine/checkpoint/certificate files, test fixtures, authoring prompts, test drivers, databases or secrets through browser delivery. Regenerate source-derived public files, app/route.ts and the reproducible portable ZIP. Keep the whole collection in this repo. No Site/Pages/hosted-relay migration.

7. Leave the catalog planned during incomplete assembly. Enable playability only after the complete software acceptance passes. If physical motion/offline-native gates remain unverified, state them plainly; do not present sensor compatibility, home-Wi-Fi latency or notarized release status as proven.

## Acceptance and sustained work

Build real integration tests, not only mocked snapshots. Start a real local host, connect a rendered TV plus two isolated authenticated phone contexts and finish all three stages. Exercise fruit transfers both directions, held Brake, recipe buffers, wrong/full basket behavior, practice, tutorial isolation, results, same/new-seed rematch and stage retry.

Exercise permission denial/no samples/touch mode; page hiding, Help, recenter, both-ready resume, socket loss, stale backlog, epoch replacement, lost command acknowledgment, host stall/sleep, checkpoint restore, room isolation and unauthorized steering. Inspect serialized frames for secrets and prove no SQLite write per input. Verify bounded queues/rates and cleanup.

Run existing Sofa Kingdoms, Odd Laws private-vote and composed-menu journeys. Inspect 720p/1080p TV and 360/390 phone screenshots with actual final assets. Check reduced motion, control sizes, no persistent instructions and no external runtime asset requests. Run relevant core/component suites, production build, extracted ZIP closure and native staging checks.

Use current supported macOS CI to build and launch the packaged Tauri app, Apple Silicon first; report Intel separately. Verify runtime without Node on PATH, startup, two controllers, persistence, safe owned-process quit, explicit exit/relaunch and no release test driver. Preserve native artifacts/screenshots and actual test evidence. Do not count a Linux browser as native macOS verification.

Run measured load/backpressure diagnostics and report input acknowledgment RTT, accepted input tick age and host/render overruns. Do not infer one-way latency from unsynchronized clocks. Separate same-machine/CI results from physical Wi-Fi and TV casting.

Physical iOS Safari and Android Chrome require explicit checks of certificate trust, user-gesture permission, finite tilt readings and orientation/recenter. After setup, test cold launch with WAN disconnected, plus lock/background/reconnect and wrong/expired/address-mismatched certificates. If devices are unavailable, complete automated tests and report the exact manual gate; do not fabricate a successful hardware test or require an insecure browser workaround.

Persist through real integration defects and CI failures. Checkpoint coherent work, maintain the handoff and keep the PR current. Avoid artificial waiting, speculative expansions, fake latency claims and tests that merely mirror implementation.

## PR completion

Create .github/workflows/go7-integration.yml so new acceptance actually runs. Record the assembled component SHAs, any reviewed corrections, dependency/runtime inventory, commands/results, screenshots, native artifacts, measurement method and remaining gates in your owned report and appropriate shared handoff.

Push and open **“GO7: Integrate Gravity Orchard into local Sofa Arcade”** against main. Inspect CI and repair relevant failures. Final PR must identify the exact tested head and component dependency/merge order; unresolved essential gates stay explicit in draft status. Report PR URL and what a user can run now. Do not self-merge main, deploy Sites, publish a public desktop release or silently change system/phone certificate trust.
