# GO2 — Gravity Orchard realtime transport and authority adapter

Copy this entire prompt into a new coding session. Implement the work, test it, push a branch and open a GitHub PR. Do not stop at a plan. Do not self-merge or deploy.

## Context and source of truth

Repository: **https://github.com/jonathanjie/sofa-arcade**. GitHub `main` is canonical. Sofa Arcade is one collection in one repository: Sofa Kingdoms and The Odd Laws Society already exist. The chosen product is a local Tauri Mac host, a shared living-room TV, and Jon and Lydia controlling from two ordinary phone browsers over LAN. Keep existing games working and the existing Site identity intact; this task does not publish the Site or migrate hosting.

The new game is **Gravity Orchard v0.2**, a real-time cooperative orchard, superseding the old turn-based grid draft. Each player tilts their own floating garden tray in two dimensions. Fruit crosses the center bridge and must reach the correct baskets. The initial run has three authored 90-second stages, a shared score, continuously held brake controls and at most eight live fruit. No shake/shoot ability or raw sensor transport is needed. Jon, Lydia and Lala retain the warm illustrated character direction. Ordinary game screens should remain uncluttered; instruction text belongs in optional tutorial/Help.

Your assignment is the continuous-input transport and authoritative runtime adapter. You do not implement the final game physics, phone sensor processing, TV art, or native certificate setup. Build a tested component with a useful independent visual fixture, without waiting for those other components.

## Start correctly

1. Fetch current GitHub `main` and use your own clean worktree/clone. Record the exact base SHA. Create `feature/gravity-orchard-realtime` or a collision-free branch with that prefix.
2. Start from main containing this packet. If the reviewed packet has not merged, explicitly pin the exact reviewed packet commit identified by `docs/DISPATCH_GRAVITY_ORCHARD.md` and record that dependency; do not wait unnecessarily or follow a moving branch tip. Read `AGENTS.md`, `README.md`, `docs/HANDOFF.md`, `docs/GITHUB_WORKFLOW.md`, `docs/DISPATCH_GRAVITY_ORCHARD.md`, `docs/GRAVITY_ORCHARD_CONTRACT.md`, `docs/GRAVITY_ORCHARD_TECHNICAL_NOTES.md`, and the v0.2 `docs/games/gravity-orchard.md`. Reconcile a stale checkout rather than implementing the superseded turn-based draft.
3. Inspect the actual current `server/rooms.mjs`, `server/lan.mjs`, `ui/transport.mjs`, relevant tests, and pinned Node/runtime versions. Older handoff prose is not proof of current behavior.
4. This dispatch's exclusive paths supersede older broad WS ownership descriptions. Up to three subagents may work inside your session if that capacity is available. Give each a disjoint subdirectory or file set before edits; you own final integration, testing and the PR. Do not assume a universal account concurrency limit.

## Exclusive write set

You may create or modify only:

- `server/realtime/gravity-orchard/**`
- `ui/realtime/gravity-orchard/**`
- `.github/workflows/go2-realtime.yml`
- `docs/workstreams/gravity-orchard-go2.md`

Keep tests, fixtures, evidence indexes and any nested package manifests/lockfiles inside those owned directories. GO7 alone owns shared `server/rooms.mjs`, `server/lan.mjs`, root manifests/locks, catalog/registry, shell routing, runtime allowlists, generated copies, native production wiring and final acceptance. Do not edit them, even for a convenient import or test command. Do not update global handoff/design documents as a progress journal. Report requested shared changes in your workstream handoff.

Other ownership: GO1 pure simulation; GO3 phone/sensors; GO4 TV/tutorial; GO5 media; GO6 secure-LAN/Tauri setup; GO7 integration. Do not import unmerged owner branches. Use injected mocks implementing the frozen contract and finish independently.

## Deliver the runtime and browser client

Implement dependency-injected factories that GO7 can compose into its existing authority. Use the exact export names and schemas in `docs/GRAVITY_ORCHARD_CONTRACT.md`; do not create competing versions. At minimum, the runtime adapter must accept an injected server-side authenticator, checkpoint load/save hooks, pure simulation adapter, monotonic clock/scheduler and lifecycle callback. Its public API must support binding/starting one room runtime, reliable commands, authenticated snapshots, safe pause/recovery, diagnostics and complete disposal. Provide an injected Node HTTP upgrade handler or attachment factory; it must not create a second production HTTP server or database.

The exact coordinator factory is `createRealtimeCoordinator({ authorize, validateUpgrade, loadCheckpoint, saveCheckpoint, simulation, clock, onLifecycle })`. Its public methods are `handleUpgrade(req, socket, head)`, `startRoom({ roomCode, matchId, seed, options })`, `pauseRoom(roomCode, reason)`, `getPublicView(roomCode, viewer)`, `closeRoom(roomCode)` and `close()`, with the detailed return shapes/lifecycle in the canonical contract. `authorize({ roomCode, bearer })` returns trusted `{ role:'host'|'player', playerId:null|'jon'|'lydia' }` or null, derived from the existing room authority. Validate the role/seat pairing: hosts have null player IDs and players have one of the two allowed seats.

`validateUpgrade(request)` is the injected synchronous exact Host/Origin/route policy. Deny before upgrade when it is missing, throws or does not return boolean true. GO7 supplies the policy using the actual listener or `request.socket.encrypted`, never untrusted forwarded headers. GO6 passes the original request. Your fixture supplies an explicit strict policy and tests both HTTP and HTTPS paths without rewriting headers.

The exact browser factory is `createRealtimeClient({ url, roomCode, token, onSnapshot, onStatus, now, WebSocketImpl })`, returning `connect()`, `setInput({ x, y, brake })`, `sendCommand(command)`, `getStats()` and `dispose()`. Follow the contract's exact synchronous/async return and callback semantics. The client fills wire identifiers, epochs, sequence and observed tick from authenticated welcome/snapshots; GO3 supplies control intent only. Fully document exported arguments, return values, messages, errors and lifecycle rules in your report. Internal implementation details may vary without changing the frozen interface.

The browser client owns socket lifecycle, first-message authentication, sequence/epoch bookkeeping, latest-input coalescing, reliable-command retry identity, snapshot delivery and diagnostics. GO3 supplies normalized control intent; it must not have to implement protocol sequencing or a second socket. GO4 consumes authoritative snapshots and connection state through injection.

### Authentication and authority

- Serve the explicit endpoint `/api/realtime/gravity-orchard`. The first WebSocket message is exactly `{ type:'auth', protocol:1, roomCode, token }`, never a claimed role/seat. After authorization, welcome contains the authenticated viewer, server-assigned controller epoch and current snapshot. Enforce the five-second authentication deadline and reject all gameplay messages before successful authorization. Never put credentials in URLs, QR codes, subprotocol strings, logs, diagnostic fixtures or error dumps.
- Authenticate through the injected existing-room authority. Record the returned role and seat in server connection context. A host may observe/perform only permitted host commands; a player controls only its authenticated seat. Never accept a claimed role/player ID from the client. V1 has no anonymous/public WebSocket observer: the public role is reserved for trusted projection/HTTP paths under existing policy.
- `server/rooms.mjs` currently has a private authenticator inside `createRoomApi`; a projected successful room GET does not prove player identity. Specify the exact GO7 auth seam you need, and test it using injected authority. Do not modify that shared file yourself.
- Call `validateUpgrade` before accepting an upgrade; no wildcard CORS or silent origin relaxation. Missing/nonbrowser-origin policy must be explicit and tested, not an accidental bypass. A valid origin is not authentication: the bounded first-message bearer check is still required.
- Define revocation/expiry and duplicate-seat takeover behavior. A fresh controller epoch invalidates the older socket. The old socket cannot keep steering while its close handshake drains.
- Keep one writer and one ticker per room. Existing room lifecycle/projections and realtime snapshots must eventually use this same authority; your handoff must describe the GO7 bridge precisely.

### Frozen input and timing

The wire input is exactly the versioned contract:

```ts
type GravityInput = {
  type: 'input';
  protocol: 1;
  matchId: string;
  runEpoch: number;
  controllerEpoch: string;
  seq: number;
  observedTick: number;
  x: number;
  y: number;
  brake: boolean;
};
```

Require finite `x,y` in `[-1,1]`, actual booleans, bounded identifiers and safe integer counters; `seq` is nonnegative and strictly increasing within its controller epoch. Reject malformed/unknown actor fields. Validate the wire envelope before passing only `{x,y,brake}` to the injected simulation's `normalizeInput`, which limits diagonal magnitude and rounds as frozen in the contract. Invalid or replayed frames never refresh the deadman. There is no client-selected seat or authoritative client timestamp.

Start with 60Hz fixed simulation, 20Hz input transmission and 20Hz snapshots. Treat these as tuning hypotheses and measure them; do not claim latency from configured rates. Keep only the newest valid input per seat, applied on ticks. Use deterministic injected time in tests and a monotonic production clock with bounded catch-up.

- After 250ms without valid control input, use neutral axes plus brake.
- After two seconds without valid input/connectivity, pause the shared run.
- Reject an `observedTick` in the future or more than 30 simulation ticks behind. Receipt time alone lets an old TCP backlog look fresh; this guard and epochs are required.
- Increment `runEpoch` and clear all latches on pause/resume, stage changes and recovery. Use a new match ID for a new run and a server-assigned controller epoch per connection/takeover.
- Require fresh readiness/countdown before resuming as specified in the contract. Do not replay cached pre-pause steering after reconnect.
- Allow at most five simulation ticks of catch-up per scheduler turn. A gap beyond 250ms produces a trusted `host-stall` pause; it must not fast-forward many seconds of gameplay.

The reliable command kinds are exactly `ready`, `pause`, `retry-stage` and `rematch`, with their payloads/authority/phase rules in contract section 4. There is no separate wire `resume` or `restart` kind: both-ready resumes through countdown; host retry/rematch follow the explicit rules. The command envelope has `type:'command'`, `protocol:1`, `id`, `matchId`, `runEpoch`, `kind` and `payload`. Preserve the original ID, normalized content and captured match/epoch across uncertain retries; never retarget an old pending command to the latest match. Reuse of an ID with different content fails. A successful duplicate must not start a second match, advance a stage twice or spend time twice.

GO1 applies ordinary commands and transitions; GO2 creates a fresh run for `rematch`. System pauses call the server-only pure `simulation.pauseForSystem(state, reason)`, accepting only `network`, `host-stall` or `recovery`. It is never a wire command or browser module. Do not mutate private engine state or accept client-forged system reasons.

### Bounded transport and persistence

Use the contract's starting bounds: 4KiB auth/command frames, 512-byte input frames, 40 input frames/second with a short bounded burst, bounded JSON depth/fields and a documented per-room socket cap. Bound outgoing buffered data too. Specify safe error codes with no credential/state dumps. Use an established WebSocket implementation if required; do not write a novel frame parser. Nested pinned dependencies/locks are allowed only inside your owned subtree. Hand GO7 the complete dependency/license/runtime inventory; do not assume packaging can omit a runtime dependency merely because tests have it installed.

Use latest-value coalescing and `bufferedAmount` handling; never queue all sensor samples. Closing a socket does not erase already queued frames, so validate epochs on every message. Slow readers must be bounded/disconnected or recover cleanly rather than consuming unbounded memory. Dispose sockets, timers and references when a room/client closes.

Persist stage boundaries, explicit pause/end and the contract's bounded periodic checkpoint, initially no more than once per five seconds. Do not call SQLite/checkpoint save per input or frame. The injected store owns durability; serialize/coalesce checkpoint writes off the tick-critical path and define failure behavior. Restore a schema-validated checkpoint paused, increment the run epoch, then require reauthentication/readiness/countdown. Test checkpoint migrations/rejection. Do not promise exact crash-frame recovery from an older checkpoint.

Use the exact `SnapshotMessage` wrapper from contract section 5. Its recipient-specific acknowledgment reports the latest input actually applied, not merely received. Preserve increasing server sequence within a coordinator stream, reset ordering on a new welcome, and discard late snapshots/results that would overwrite a newer match or epoch. Do not broadcast a controller's private epoch in another recipient's acknowledgment. Keep coordinator-owned `presence` outside the pure engine view; GO7 forwards it as the optional presentation `setConnection(status).presence` field.

Expose useful diagnostics: connection/reconnect state, input acknowledgment RTT, accepted tick age, coalesced/dropped messages, tick overruns and buffer depth. Do not subtract unsynchronized phone/host clocks to claim one-way latency. A 60fps renderer is not proof of 60Hz networking or low screen-cast latency.

## Independent fixture and meaningful visuals

Build a runnable local fixture wholly inside your owned paths. It must use your actual socket server/client, an injected fake authenticator/checkpoint store and a tiny deterministic mock simulation matching the public contract. The fixture must not import GO1/GO3/GO4/GO6 code that has not landed.

Show a clean, labeled diagnostic board with two visually distinct trays/markers, live held input/brake indicators, actual connection state and measured transport counters. Provide two controller contexts or links and controls to trigger loss, pause, reconnect, stale input, slow delivery and host time jumps. Code-native Canvas/SVG/CSS graphics are appropriate; make it understandable rather than a wall of JSON. Label it a transport fixture, not the completed game. Support small phone-sized controls and a TV-sized board, readable contrast, keyboard input and reduced motion. Keep test credentials ephemeral/in memory and out of captured logs.

The fixture may use plain HTTP/touch. It must clearly state that this does not validate phone sensors; secure motion is GO3/GO6 plus final hardware acceptance. Capture screenshots and a short evidence narrative for healthy and interrupted connections. A visual demo alone does not replace protocol tests.

## Tests and CI

Add your owned workflow `.github/workflows/go2-realtime.yml`. It must actually run the new suites, not merely the legacy root `npm test` list. Follow existing repository action-pinning conventions. Exercise the supported local Node baseline and the pinned desktop runtime where practical, with Linux and a macOS job for platform-sensitive behavior. Use pinned nested test dependencies if needed. Provide a reproducible command that runs all GO2 component tests from a fresh checkout.

Required meaningful tests include:

- Real WebSocket handshake/authentication, five-second timeout, wrong room/token, forbidden host input, forged seat/role and rejected origins. Test missing/throwing/false/nonboolean upgrade policies, exact HTTP/HTTPS origins and untrusted forwarded-header spoofing.
- Malformed/oversized input, NaN/Infinity/out-of-range values, duplicate/reordered sequence, old/future ticks and wrong protocol/epochs.
- Exactly one live controller per seat, takeover fencing, auth revocation/expiry, socket drop and recovery.
- Latest-value coalescing, bounded slow readers, flood behavior and no latent input replay after pause/restart/stage change.
- Exact 250ms and two-second boundary behavior with fake monotonic time; bounded catch-up and host sleep.
- Reliable command idempotency, checkpoint ordering/errors, paused restore, and no per-input persistence.
- Public snapshots and diagnostics free of credentials; actor isolation and no stale independent authority.
- Client disposal, duplicate mounts, reconnect cancellation, old-room callback fencing and timer/listener cleanup.
- Browser fixture journeys using two isolated player contexts plus a host, including interruption/recovery and useful screenshots.

Run relevant unchanged root regression tests as well. Run the repository production build when its dependencies/environment are available; generated outputs are GO7-owned and must not be committed. Explain any environment limitation, exact command/exit status and remaining gate instead of claiming an unrun pass. Do not broaden testing indefinitely after concrete risks are covered.

## Handoff and tested PR

Write `docs/workstreams/gravity-orchard-go2.md` with scope/base SHA, exact exported interfaces, protocol/error/state diagrams where useful, all runtime/browser files, dependency/license inventory, reproducible fixture/test commands, actual test results, evidence paths, performance observations, limitations, GO7 wiring instructions and component readiness. Distinguish simulated tests, browser tests and real hardware evidence. Do not place the report's own future commit hash inside itself; identify the tested committed head in the PR.

Fetch current main before the final PR, resolve conflicts only in your owned paths, review the complete diff for scope and secrets, rerun affected tests, commit and push your feature branch, then open a PR against `main`. The PR must explain why the component is needed, what it supplies, how it was tested, exact tested SHA and what GO7 must wire. No self-merge, deployment, hosted service, catalog enablement, root manifest edits or unrelated cleanup.

If actual phones or a packaged Mac are unavailable, finish this component and its PR, recording those final integration gates as unverified. A tested component fixture is a valid handoff; it is not a claim that the assembled game or tilt mode is released.
