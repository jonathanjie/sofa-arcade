# Sofa Arcade: local Tauri dispatch pack

Prepared 20 November 2026. Jon selected Tauri/local play and requested independent, sustained implementation sessions ending in tested GitHub PRs. This is the current dispatch plan for Odd Laws Society and local packaging; its file ownership supersedes conflicting broad assignments in the older [parallel guide](PARALLEL_DEVELOPMENT.md).

The complete implementation contracts are in [LOCAL_IMPLEMENTATION_CONTRACT.md](LOCAL_IMPLEMENTATION_CONTRACT.md). The game rules remain [Odd Laws Society v0.2](games/odd-laws-society.md). None of these documents claims the implementation is already built.

## Dispatch order

Start **WS1–WS5 in parallel**. WS6 can prepare its harness/checklist immediately and assemble the final build after component PRs are ready. Each prompt is self-contained; copy one into each separate coding session. Ask for up to three subagents where actually available, without assuming a universal subscription limit.

| Workstream | Branch | Exclusive parallel write set |
| --- | --- | --- |
| WS1 Engine | feature/odd-laws-engine | games/odd-laws-society/**; ws1-engine.yml; own report |
| WS2 Platform | feature/local-platform | Named room/LAN server files, room-* helpers, transport/room-client modules/tests; ws2-platform.yml; own report |
| WS3 UI | feature/odd-laws-ui | ui/games/odd-laws-society/**; ws3-ui.yml; own report |
| WS4 Media | feature/odd-laws-media | public/assets/odd-laws-society/**; ui/media/odd-laws-society/**; ws4-media.yml; own report |
| WS5 Desktop | feature/tauri-local | desktop/**; .github/workflows/desktop.yml; own report |
| WS6 Integration | feature/local-integration | Shared shell, registry/catalog, root manifests/build/CI excluding component workflows, generated public modules/app/route.ts, integration tests and shared documentation; final post-handoff serving/runtime entries |

No two independent sessions share a working tree. The first five do not edit root package/lockfiles, global handoff documents, or one another's directories. Their individual reports live under docs/workstreams/ as specified below. The four ws*-*.yml files above live in .github/workflows/; each component owner adds a workflow that actually runs its new suites. Nested test dependencies stay within owned subtrees. Component sessions do not commit generated shared public modules or app/route.ts. UI has an isolated fixture harness; platform has an injected secret-bearing fake engine; desktop begins with already playable Sofa Kingdoms. These boundaries let work proceed without circular waiting.

Each component ends with a PR, test evidence, integration instructions, and a pinned tested head. Final whole-product verification belongs to WS6. No implementation stream self-merges main, deploys the existing Site, or publishes a public desktop release. The integrator may assemble reviewed component heads into its own candidate branch while keeping every original PR intact; its final PR identifies the exact combination and any merge dependencies. Prefer merging component PRs first, then reconciling and retesting the integration PR against that main. Only after explicit tested handoffs may WS6 update platform serving entries and desktop/runtime-manifest.json.

These assignments call for continued work through meaningful tests and repairs, not artificial waiting or unbounded speculative expansion. Complete available independent work; if an essential prerequisite remains unavailable, preserve it in a draft PR with an exact next step. Never substitute fake test claims for absent Mac hardware, rendered UI, audio audition, or human playtests.

## Self-contained prompts

### WS1 — Odd Laws rules engine and balance harness

```text
You are implementing WS1, the Odd Laws Society rules engine, for Jon and Lydia's Sofa Arcade.

Repository: https://github.com/jonathanjie/sofa-arcade
Create an isolated clone/worktree and branch feature/odd-laws-engine from the latest main. Record the base commit; inspect existing work before editing. This is an implementation assignment: finish the owned scope, test it, fix defects, and open a GitHub PR.

Context: Sofa Arcade is one collection/repository. Sofa Kingdoms is already playable. Jon has chosen a local-first Tauri app on an Apple Silicon Mac, with the TV displaying the board and two ordinary phone browsers as controllers. We are now building Odd Laws Society at roughly Citadels / 7 Wonders decision weight. No cloud migration or deployment is part of this task.

Read AGENTS.md, docs/DISPATCH_LOCAL.md, docs/LOCAL_IMPLEMENTATION_CONTRACT.md, docs/games/odd-laws-society.md, and docs/HANDOFF.md. The full v0.2 city-building specification supersedes the old movement game. Preserve its exact starting rules; numerical balance is unproven.

WRITE OWNERSHIP: games/odd-laws-society/**, .github/workflows/ws1-engine.yml, and docs/workstreams/odd-laws-engine.md only. Do not edit registry/catalog, server, UI, shared manifests/lockfiles, other workstream reports, or the PRD. Record integration requests in your report.

Build the complete six-session rules engine: three terms of finite public stock, 18 building designs with two copies each, 12 laws, two active law slots, 3×3 cities, and Build/Work/Lobby/Festival. Implement the term-aware Chair schedule, sealed all-pay council bids, irreversible street placement, exact income/discount timing, final scores/ties, and fresh match/individual-turn phase IDs. Follow the contract's engine exports, explicit catalog effect objects, exact public preview return shapes, and projected view shape. Keep private authority/fixtures separate from browser-safe data.

Implement authenticated role projection, normalized action identity, and tightly bounded canRebaseAction for a still-open council commitment only. Never reveal the first locked bid through public influence deductions, another seat's ownCommitment, history, or errors. Every rule transition must be deterministic, JSON-serializable, and non-mutating.

Make meaningful tests: the PRD's accounting example; full six-session completions; illegal actions; all law pairs; exact caps; pre-action workshop behavior; duplicate buildings; empty markets/full cities; chair/term parity; both commitment arrival orders; malformed/stale phase IDs; and projection invariance when only an opponent's sealed choice changes. Export safe canonical TV/Jon/Lydia fixtures for the frontend. Add a reproducible lightweight policy-sweep harness comparing economy, Festival, Civic, and efficient-building approaches on mirrored seeds. Use it to expose bugs/outliers, not to claim proven human balance. Do not silently redesign the game based on one bot policy.

Use up to three concurrent subagents if available: rules/catalog; projection/previews/fixtures; adversarial tests/simulation. Assign disjoint files and integrate their work. Persist through implementation and review rather than stopping at scaffolding. Checkpoint coherent work and update your owned report so another session can resume. Do not wait for other streams; your engine and tests are independent.

Create your owned CI workflow to run the new engine/preview/privacy suites and reproducible simulation smoke checks; existing npm test does not discover them automatically. Run your complete owned suite and relevant existing regressions, inspect the final diff, and perform an independent rules review. Document exact commands/results, exported APIs, runtime/browser files, and unresolved balance questions. Do not fabricate human playtests.

Push the branch and open a PR to main titled "WS1: Implement Odd Laws Society rules engine". Inspect remote CI, fix relevant failures, and report the PR URL and tested commit. Do not merge main, mark the game playable, or deploy. If an essential gate is genuinely blocked, finish all reachable work and open a draft PR identifying the precise missing gate; a testable completed engine may be ready for integration before the final UI exists.
```

### WS2 — Private multiplayer and local room platform

```text
You are implementing WS2, the private multiplayer/LAN platform for Sofa Arcade.

Repository: https://github.com/jonathanjie/sofa-arcade
Use a separate clone/worktree and branch feature/local-platform from current main; record its SHA. Implement, test, repair, and deliver a GitHub PR.

Context: Jon and Lydia play a shared TV board with two browser phones. The selected destination is a Tauri Mac app bundling the existing local Node/SQLite host. That host already sends immediate SSE updates after HTTP actions. Sofa Kingdoms must remain playable and compatible. Odd Laws Society adds two simultaneous sealed votes and requires per-viewer state; the current room envelope exposes the entire public Sofa Kingdoms state and cannot be reused unchanged for secrets. No hosted WebSocket service, Pages migration, or deployment is requested.

Read AGENTS.md, docs/DISPATCH_LOCAL.md, docs/LOCAL_IMPLEMENTATION_CONTRACT.md, docs/games/odd-laws-society.md, docs/LAN.md, and current server/transport tests.

WRITE OWNERSHIP: server/rooms.mjs and server/rooms.test.mjs; server/lan.mjs and server/lan.test.mjs; new server/room-*.mjs modules/tests; ui/transport.mjs and ui/transport.test.mjs; new ui/room-client.mjs and ui/room-client.test.mjs; .github/workflows/ws2-platform.yml; docs/workstreams/room-platform.md. Do not edit game engines, registry/catalog, ui/app.js/global styles/audio, desktop, root dependencies, release scripts, or another stream's report.

Generalize action normalization and safe retry identity through the engine contract while preserving legacy Sofa Kingdoms actions and room versions. Introduce per-viewer projection on every outward path: public/host/player GET, join, start/rematch, action success, duplicate retry, errors/history, reconnection, and each LAN stream. Derive viewer identity from credentials, never caller-controlled role parameters. Do not broadcast one shared full-state snapshot to every subscriber.

Implement safe same-phase simultaneous submissions: exact match/phase fencing, immutable own vote, fixed phase budgets, atomic reveal/payment, stable action IDs, and bounded CAS re-evaluation only when the engine explicitly permits it. A delayed city action must never execute on the player's next turn. Preserve strict host/origin checks, credential hashing/redaction, body limits, persistence, room expiry, and existing optimistic Sofa Kingdoms behavior.

Supply the contract's injectable room API seam through both ordinary requests and per-subscriber SSE projection, so tests exercise the real LAN path with a secret-bearing fake engine without waiting for WS1 or editing production registration. Implement createRoomClient for authenticated projected commands, retries, snapshots, cancellation, reconnect, and the specified connection-status shape. Do not predict private outcomes by giving browsers the full engine state. Preserve/verify startLanServer's existing programmatic API for the Tauri owner. Provide a safe explicit seam for new served module entries, or document the exact final serving-list update needed after your handoff; never expose whole private source/test directories.

Use up to three subagents if available: room authority/projection; LAN and client lifecycle; adversarial/concurrency/regression tests. Give them disjoint files. Keep working until the complete owned scope is exercised, fixing discovered issues. Checkpoint and maintain your report; use injected fixtures instead of waiting for other sessions.

Tests must inspect serialized HTTP and SSE payloads, not just screenshots: two seats submitting from one revision, both arrival orders, a lost winning response, changed-content ID reuse, stale phases, forged actors, first-bid balance leakage, reconnect after locking, rematch isolation, unauthorized streams, hostile Origin/Host, and restored database state. Complete an actual three-client LAN API/SSE flow and run relevant existing suites. Add your owned CI workflow covering the new suites explicitly; green legacy tests alone are insufficient. Distinguish a loopback protocol test from physical Wi-Fi/TV testing.

Push and open a PR to main titled "WS2: Add private local multiplayer contracts". Inspect CI and fix relevant failures. Include tested SHA, commands/results, contract examples, serving requirements, and exact remaining gates. Do not merge, enable unfinished games, deploy, or introduce an unrelated protocol rewrite. Essential unverified gates require an explicitly draft PR; complete independent platform work rather than stopping because the full game UI is absent.
```

### WS3 — Odd Laws TV board, phone controllers, tutorial, and motion

```text
You are implementing WS3, the complete TV and phone experience for Odd Laws Society in Sofa Arcade.

Repository: https://github.com/jonathanjie/sofa-arcade
Start an isolated clone/worktree on feature/odd-laws-ui from latest main and record the SHA. Build the working interface, verify it in a browser, fix defects, and open a GitHub PR.

Context: Jon and Lydia play from their living-room sofa. A local-first Tauri app on an Apple Silicon Mac displays/casts the shared board; their two phones are browser controllers. Odd Laws is a deeper two-player city builder: 3×3 boroughs, six sessions, a shared six-stack market, four actions, and two shared laws decided through private influence bids. Instructions belong in an optional tutorial/Help; ordinary TV and phone screens should maximize board and control space. Characters should feel alive and audio should remain composed and restrained.

Read AGENTS.md, docs/DISPATCH_LOCAL.md, docs/LOCAL_IMPLEMENTATION_CONTRACT.md, docs/games/odd-laws-society.md, and relevant existing ui/ files. Implement the new city game, not the old movement prototype.

WRITE OWNERSHIP: ui/games/odd-laws-society/**, .github/workflows/ws3-ui.yml, and docs/workstreams/odd-laws-ui.md only. Keep your fixture harness, tests, fallback vectors, and screenshots there. Do not edit ui/app.js, global styles/audio/motion, transport, server, engine, public final assets, root dependencies, or other reports. WS4 owns final art plus ui/media/odd-laws-society/**; use its manifest contract and local mock assets until available.

Implement mount/update/setConnection/dispose with the contract's injected dispatch, viewer, public rules adapter, assets, sound, and preferences. Use the exact quote/placement result shapes and manifestUrl semantics; call sound.unlock directly in a user gesture before awaiting a command. Build against matching projected fixtures immediately; do not wait for engine/platform PRs or invent a different schema. Include a standalone local browser harness with TV and separate Jon/Lydia contexts. Label fixture behavior honestly; it is not integrated multiplayer.

Deliver council choice/bidding/locked/waiting/reveal, ordinary actions, card inspection, exact-cost Build selection and plot confirmation, full city/exhausted stock, turn transitions, income, results/ties, reconnect/error states, and return/navigation cleanup. Keep the entire future agenda and card catalog in optional drawers. Phone drafts remain private and local until Seal. TV highlights/animations must not reveal a draft vote or the first submitted bid through resource changes.

Create polished layouts and code-native fallback graphics. Use exact live text for prices, law effects, and scores. Animate building placement, coins, street completion, simultaneous envelopes, Lala's stamp, and character reactions from committed public state changes. Repeated snapshots/reconnects must not replay rewards. Preserve reduced-motion behavior and accept legal input without waiting for animations. Do not modify the existing Sofa-specific motion engine.

Create a replayable optional guided tutorial that teaches construction, Work, streets, income, sealed all-pay voting, Lobby, Festival, and score breakdown. It must be skippable/resumable and clearly separate from a real match. Keep most rule prose out of ordinary play.

Use up to three subagents when available: TV board; phone/tutorial flows; browser validation/accessibility/motion review, each owning different files. Continue through complete flows, focused fixes, and independent review. Checkpoint and document APIs, fixture commands, browser-served files, and integration requests in your report.

Test actual rendered TV layouts at 1920×1080 and 1280×720 and phones around 360×800 and 390×844. Exercise every state above, keyboard/focus, large touch targets, icon-plus-color guild meaning, reduced motion, failed-media fallback, offline assets, and teardown. Save representative screenshots from the rendered app. Add meaningful interaction tests for dispatch, privacy, stale snapshots, and lifecycle; run them and headless rendered-browser checks in your owned CI workflow. Keep any test-tool manifests/lockfiles in your owned subtree. Use approved available browser tools; distinguish fixture tests from eventual real-room testing.

Push and open "WS3: Build Odd Laws TV and phone interface" against main, with screenshots, exact tested SHA, commands/results, integration contract, and limitations. Check CI and fix relevant failures. Do not merge, register the game, publish a Site, or generate competing final media. If browser verification is genuinely unavailable, complete other work and open a draft PR naming the missing visual gate; never claim an unobserved screen was tested.
```

### WS4 — Original game artwork, sprites, and composed music

```text
You are implementing WS4, the original art and composed soundtrack for Odd Laws Society in Sofa Arcade.

Repository: https://github.com/jonathanjie/sofa-arcade
Use an isolated clone/worktree and feature/odd-laws-media from current main; record its SHA. Produce actual usable assets, inspect/test them, and open a GitHub PR.

Context: Jon and Lydia are building one local-first living-room game collection: a Tauri Mac host/TV and two quiet browser phones. Odd Laws is a whimsical medium-depth civic city builder with 18 building designs, 12 laws, four guilds, and Lala chairing the council. The look should be warm, illustrated, cohesive, and readable from the sofa. Characters must support dynamic behavior. Music needs a recognizable composed tune, not random piano-like notes.

Read AGENTS.md, docs/DISPATCH_LOCAL.md, docs/LOCAL_IMPLEMENTATION_CONTRACT.md, docs/games/odd-laws-society.md, ui/score.mjs, and ui/audio.js. Inspect the actual images public/assets/characters.png and public/assets/sofa-room.png before designing. The character atlas contains Jon mouse, Lydia mouse, and Lala the orange cat. Do not assume the original human character sheets or this chat's attachments exist in your session.

WRITE OWNERSHIP: public/assets/odd-laws-society/**, ui/media/odd-laws-society/**, .github/workflows/ws4-media.yml, and docs/workstreams/odd-laws-media.md only. Keep manifests, validation tools, provenance, and preview gallery in those areas. Do not edit UI view/styles, shared audio/motion, rules, transport, desktop, root manifests, or existing art.

Create all 18 exact building IDs and all 12 law emblems from the PRD, plus four accessible guild icons. Preserve a consistent camera angle, scale, palette, and visual vocabulary. Keep names, prices, rules, and score numbers as interface text; do not bake them into images. Provide Jon/Lydia civic variants and Lala as Chair using the contract's lowercase characters.*.states keys and guaranteed flat image for each required state. Add layers or extra frames when useful and describe reused poses accurately. Include the six required envelope/stamp/coin/influence/street props.

Use the available image-generation tool for original raster illustrations, with inspected repo references. Use original SVG for precise icons and overlays. If image generation is unavailable, produce a coherent usable vector set and label that medium accurately; do not deliver only generation prompts or claim missing assets exist. Layered cutouts with declared anchors/states are acceptable and can support procedural animation; do not claim frame-by-frame sprites unless delivered. UI owns the animation code.

Deliver the fixed manifest.json contract with manifest-relative URLs, dimensions, alt text, exact state/prop keys, and accurate final/placeholder status. All catalog IDs must exist. Keep optimized shipped assets and necessary sources/provenance/license notes; exclude unrelated oversized intermediates. Never copy commercial board-game art or unverified music.

Compose a complete original AABA chamber-comedy score with a genuine contrasting B section, recurring melody, breaths, and cadences. Supply pure SCORE/eventsForBar in ui/media/odd-laws-society/score.mjs using the existing woodwind/bass/pizzicato/bell vocabulary. Include coherent lobby/council/term/celebration arrangements and predictable fallback behavior. Optional effects use the same event vocabulary and beats at SCORE.bpm, with [] for unknown names. Do not create another global AudioContext, preferences store, or competing scheduler; the integrator connects the shared audio engine.

Create your owned CI workflow to validate every manifest reference, image dimension, catalog/state key, offline preview, and score invariant. Keep any preview/test dependencies inside your owned subtree.

Use up to three subagents when available: buildings/laws; characters/icons/props; composition/audio validation. Assign separate files and have the lead assemble the manifest. Persist through producing, inspecting, correcting, optimizing, and testing the full set. Record exact integration paths and evidence in your report.

Validate IDs, file existence, dimensions, transparency/atlas bounds, and placeholder status. Inspect a rendered gallery/contact sheet at actual board/card sizes and save screenshots. Test score events for valid timing/pitch/levels, safe mode behavior, and repeatable phrasing. Produce an audio preview when tools support it, check clipping/levels, and distinguish actual audition from structural tests. Run relevant existing audio checks.

Push and open "WS4: Add Odd Laws artwork and composed soundtrack" against main. Include previews, manifest validation, audio evidence, provenance, tested SHA, and integration instructions. Inspect CI and fix relevant failures. Do not merge or deploy. A coherent completed vector alternative is valid; missing essential art/audio remains an explicit draft-PR gate rather than being hidden behind placeholders.
```

### WS5 — Tauri Mac app and bundled offline host

```text
You are implementing WS5, the local Tauri Mac application for Sofa Arcade.

Repository: https://github.com/jonathanjie/sofa-arcade
Use a separate clone/worktree and feature/tauri-local from latest main; record the base SHA. Deliver a functioning packaged application, meaningful native tests, and a GitHub PR.

Context: Jon selected Tauri and local play. He uses an Apple Silicon Mac. The Mac app displays/casts the board, and two ordinary phone browsers join over the same LAN. After installation, gameplay must not require internet, a separately installed Node runtime, Terminal, or a phone app. The existing Sofa Kingdoms is playable now, so package and test it immediately; do not wait for Odd Laws. Later integration includes that game through the same shared runtime.

Read AGENTS.md, docs/DISPATCH_LOCAL.md, docs/LOCAL_IMPLEMENTATION_CONTRACT.md, docs/DEPLOYMENT_OPTIONS.md, docs/LAN.md, server/lan.mjs, and scripts/lan-server.mjs.

WRITE OWNERSHIP: desktop/**, .github/workflows/desktop.yml, and docs/workstreams/tauri.md only. Use nested Node/Cargo manifests and lockfiles. Do not edit shared server/UI/game code, root manifests/locks, any other workflow, existing launchers/package scripts, or other reports. Derive app icons from available assets within desktop/. Record integration needs instead of forking the game.

Build an Apple Silicon Tauri shell that supervises a bundled compatible Node runtime and the existing Node/SQLite/SSE host. Reuse startLanServer({root,databasePath,host,port}) and its returned port/origin/urls/close. Put a structured-readiness bootstrap under desktop/host/; wait until the host actually listens before opening its loopback URL. Show phone QR/LAN addresses through the existing game flow. Keep SQLite in writable app data outside the application bundle.

Pin the runtime, verify official checksums/provenance, and test ESM and node:sqlite support; minimum repository requirement is Node 22.13. Implement desktop/runtime-manifest.json exactly as contracted and stage its explicit repo-shaped allowlist, including server/game modules, UI/assets, and migrations. After your tested handoff, WS6 may add final Odd Laws file entries to this manifest and rerun desktop checks; other native files remain yours. Preserve licenses/executable modes. Exclude credentials, checkout state, local databases, development dependencies, and unnecessary sources. Startup must download nothing. Do not commit generated runtimes or release bundles as authored source.

Preserve a stable saved loopback port/origin across launches so browser credentials remain accessible. Handle occupied port, failed startup, duplicate launch, owned-child crash, quit/relaunch, sleep/resume, and LAN-address changes. Never attach to or kill an unrelated process. Use fixed executable paths/argument arrays, bounded readiness records, and no credential logs. Controller pages must not acquire native shell/file capabilities. Do not weaken Host/Origin checks or OS security.

Create reproducible desktop build and native test commands plus desktop-specific GitHub Actions. Verify the selected macOS runner architecture and matching artifact target. Consult current official Tauri testing guidance: https://v2.tauri.app/develop/tests/webdriver/ and https://docs.github.com/en/actions/reference/runners/github-hosted-runners. Native Mac automation is not categorically unavailable; use a supported approach, keeping test drivers out of release builds. A Linux cross-build or ordinary browser screenshot is not a native Mac launch.

Use up to three subagents if available: native lifecycle; runtime/bootstrap/packaging; macOS CI/native validation. Assign separate files. Persist through implementation, packaging failures, actual available tests, repairs, and review. Checkpoint and maintain your owned report. If local execution is Linux, pursue authorized macOS CI instead of stopping there.

Verify packaged startup without Node on PATH; room creation and both seats joining; action and immediate SSE update; persistence/relaunch; safe cleanup; conflict/failure handling; asset completeness; and native collection load. Produce build/test artifacts and screenshots. Distinguish native CI evidence from two physical phones on Jon's Wi-Fi, real internet-disconnected operation, TV casting, and device audio. Missing signing credentials must be documented; do not invent credentials, claim notarization, or disable Gatekeeper.

Push and open "WS5: Package Sofa Arcade as a local Tauri Mac app" against main. Inspect desktop CI and fix relevant failures. Include the exact tested commit, artifact/build links, commands, native evidence, and remaining hardware/distribution gates. Do not merge, deploy, or publish a public release. If native build/runtime verification cannot be obtained, finish all other work and open a draft PR with the exact missing gate; do not label an unlaunched bundle ready.
```

### WS6 — Final integration, whole-game tests, and desktop acceptance

```text
You are WS6, the final integrator and acceptance-test owner for Sofa Arcade's local Tauri release.

Repository: https://github.com/jonathanjie/sofa-arcade
Use a dedicated clone/worktree and feature/local-integration from current main. Record the base SHA. Your goal is a complete tested combination of the five component workstreams, delivered as a final GitHub PR.

Context: Jon and Lydia want one local-first collection on an Apple Silicon Mac/Tauri host, a TV board, and two browser phones on the LAN. Sofa Kingdoms already works; Odd Laws Society is the new six-session strategy city builder. Five parallel sessions deliver WS1 engine, WS2 private multiplayer, WS3 TV/phone UI, WS4 art/music, and WS5 Tauri packaging. This task integrates those components and proves the actual player journey. Do not build another cloud service or publish Sites/Pages.

Read AGENTS.md, docs/DISPATCH_LOCAL.md, docs/LOCAL_IMPLEMENTATION_CONTRACT.md, docs/games/odd-laws-society.md, docs/DEPLOYMENT_OPTIONS.md, and every available docs/workstreams report. Discover component PRs by their WS1–WS5 titles/branches; inspect their changes, tests, and immutable head SHAs rather than trusting summaries.

WRITE OWNERSHIP: shared collection wiring (ui/app.js, ui/index.html, shared styles, shared audio/motion adapters), games/catalog.mjs and games/registry.mjs, root package manifests/lockfiles, existing preparation/local-package/launcher scripts, root test/integration CI excluding desktop.yml and ws1-engine.yml/ws2-platform.yml/ws3-ui.yml/ws4-media.yml, tests/integration/**, generated public module copies/app/route.ts, and shared README/HANDOFF/release documentation. Do not concurrently edit unfinished component-owned modules. After explicit tested owner handoffs, you may update server/lan.mjs serving entries and desktop/runtime-manifest.json runtime entries, rerunning their checks. Other native/component files remain with their owners. Keep your progress/evidence in docs/workstreams/integration.md and tests/integration/**.

Start now by preparing acceptance fixtures, harnesses, and an integration checklist against the frozen contracts. Do not wait idly or replace another stream's unfinished component with your own implementation. Prefer merged components; otherwise fetch exact reviewed ready PR heads into your candidate branch without changing their branches. Record PR numbers/head SHAs and avoid duplicate cherry-picks. The preferred merge order is WS1–WS5, then reconcile WS6 against the resulting main and rerun final acceptance. Until then, label your aggregate PR as dependent on its included component PRs. A still-missing essential component means a draft integration PR, not a claim that the product is complete.

Wire the real engine, per-viewer room state, command sender, injected public rules helpers, TV/phone views, and media manifestUrl. Bridge transport/client status to view.setConnection, including passive disconnects, and supply gesture-based sound.unlock. Connect the new score to the existing audio lifecycle so only the host soundtrack plays by default and saved music/effects/volume controls work. Integrate tutorial, Help, results, reconnect, rematch, collection navigation, and dynamic character effects without permanent instructional clutter. Preserve Sofa Kingdoms rules, old room versions, composed music, and existing controller behavior.

Align production/browser module copying, secure LAN serving, portable local ZIP, and desktop runtime staging. Do not ship server-only secrets, private fixtures, credentials, or databases as public assets. Update catalog description/duration to the new design, but make it playable only after actual end-to-end acceptance. Keep source and derived files coherent. Resolve integration failures; substantive component defects need an owner fix or an explicitly isolated post-handoff correction.

Use up to three subagents when available: shell/registration/audio wiring; multi-client privacy/reliability QA; desktop/package/visual acceptance. Give disjoint files. Persist through assembly, full-game testing, fixes, independent review, and CI. Checkpoint the exact component matrix so a resumed session does not combine arbitrary newer heads.

Run a complete engine-backed Odd Laws match with a TV view and two separate authenticated controller contexts, covering both initial Chairs, sealed bids, both payment outcomes, all actions, full/exhausted states, final scores/ties, tutorial skip/replay, refresh, disconnect/reconnect, duplicate/stale requests, and rematch isolation. Inspect real HTTP/SSE payloads for hidden-data leakage. Verify native app startup, quit/relaunch, saved state, asset availability without external requests, sound unlock/preferences, reduced motion, and Sofa Kingdoms regression. Use meaningful automation and actual rendered screenshots at TV/narrow-phone sizes. Measure local action/update latency where possible, with methodology; do not invent home Wi-Fi/casting benchmarks.

Run the project's relevant test/build/package checks, all component workflows, and desktop macOS CI, fixing failures at the proposed final head. A native CI run does not replace physical-phone/TV testing; report exactly what remains. Add clear local setup/build instructions and an artifact manifest. If components change, revalidate the affected combination.

Push and open "WS6: Integrate and verify local Sofa Arcade" against main. Include component PR/head matrix, exact tested commit, commands/results, native artifact and screenshot links, remaining hardware/signing gates, and recommended merge order. Check remote CI. Do not merge main or publish a release. Mark the PR ready only when essential automated/native gates have passed; otherwise leave an actionable draft with the missing dependency/test clearly identified.
```
