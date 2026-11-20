# GO2 — Gravity Orchard realtime transport

## Scope and source

Base: `6c6eb9343958da591b4488366c2ada4000e3ba08` from canonical GitHub `main`, fetched before creating the isolated worktree. Branch: `feature/gravity-orchard-realtime`. The v0.2 dispatch pack was already merged. The worktree preserves the existing checkout and the other worktrees.

This component supplies an injected Node coordinator, a browser transport client, a loopback diagnostic fixture, adversarial tests and an owned CI workflow. It follows [the frozen contract](../GRAVITY_ORCHARD_CONTRACT.md) and [GO2 assignment](../prompts/gravity-orchard/GO2-realtime.md). The fixture uses a deterministic mock simulation; it does not claim to implement the orchard physics, final UI, phone sensors or native trust setup.

Only the two GO2 subtrees, this report and `.github/workflows/go2-realtime.yml` change. No shared room, LAN, desktop, dependency manifest, registry, catalog, runtime allowlist or generated source is changed. There is no deployment or self-merge.

## Runtime inventory and dependencies

| Runtime file | Purpose |
| --- | --- |
| `server/realtime/gravity-orchard/index.mjs` | Coordinator, upgrade handler, one writer/ticker per room, bounded sockets/checkpoint/lifecycle queues |
| `server/realtime/gravity-orchard/lib/protocol.mjs` | Wire validation, limits, safe errors and trusted-viewer validation |
| `server/realtime/gravity-orchard/lib/checkpoint.mjs` | Versioned checkpoint envelope, migration, validation and command journal |
| `ui/realtime/gravity-orchard/index.mjs` | Browser connection, input latch, reliable commands, ordering and RTT measurement |
| `ui/realtime/gravity-orchard/lib/protocol.mjs` | Browser-safe validation and constants; no authoritative engine import |

Production Node dependency: **`ws@8.23.0` (MIT)**, pinned with integrity in the nested `server/realtime/gravity-orchard/package-lock.json`. It implements WebSocket framing; GO2 does not implement a frame parser. Compression and optional native accelerators are not required. Node built-ins used are `node:crypto` and `node:perf_hooks`. Runtime baseline is Node **22.13.0+**; the desktop pin tested by CI is **24.22.3**. The browser modules have no npm dependency and use standard WebSocket, timers, URL, TextEncoder and performance APIs.

GO7 must ship the `ws` runtime, its `package.json`, `wrapper.mjs`, `index.js`, `lib/**`, and its MIT `LICENSE` in an ESM-resolvable dependency tree, or use a verified bundle retaining the license. Merely copying GO2 source without its dependency is insufficient. Node resolution can use the current nested production install or a GO7-owned root production dependency. Do not ship optional `bufferutil`/`utf-8-validate` modules unless deliberately assembled and tested.

Test-only dependency: **`playwright@1.62.1` (Apache-2.0)** and its pinned transitive test tooling, recorded in the same nested lockfile. OpenSSL is invoked only by the TLS adversarial test to create a temporary test certificate; the certificate/key are removed afterwards. It is not a production runtime prerequisite. Tests also exercise an injected real in-memory SQLite store through Node's `node:sqlite`.

**Exclude from production delivery:** `fixture/**`, `tests/**`, `evidence/**`, nested development dependencies, `ui/realtime/gravity-orchard/fixture/**`, and `ui/realtime/gravity-orchard/tests/**`. The loopback fixture's role picker is intentionally fake authority. It must never be registered as a production endpoint or bundled as a phone entrypoint.

## Coordinator API

Import `createRealtimeCoordinator` from `server/realtime/gravity-orchard/index.mjs`.

```js
const coordinator = createRealtimeCoordinator({
  authorize, validateUpgrade, loadCheckpoint, saveCheckpoint,
  simulation, clock, onLifecycle,
});
```

| Injection | Exact behavior required of caller |
| --- | --- |
| `authorize({ roomCode, bearer })` | Async trusted `{role:'host', playerId:null}` or `{role:'player', playerId:'jon'|'lydia'}`, otherwise `null`. Derive identity from existing credentials and room expiry. Must not return public authority. |
| `validateUpgrade(request)` | Synchronous exact Host/Origin/route policy. Only literal `true` permits an upgrade. Missing, throwing, Promise-returning or truthy nonboolean callbacks deny. Preserve the original request; derive scheme from the actual listener/TLS socket. |
| `loadCheckpoint(roomCode)` | Async persisted coordinator envelope or `null`. Unknown/corrupt checkpoints fail closed; they do not silently start a new match. |
| `saveCheckpoint(roomCode, checkpoint)` | Async durable write. Resolve only after committing the supplied complete envelope. Must not log it or its private engine state. |
| `simulation` | The eight frozen GO1 exports: `createRun`, `normalizeInput`, `step`, `applyCommand`, `pauseForSystem`, `project`, `serializeCheckpoint`, `restoreCheckpoint`. |
| `clock` | `{ now(): number, setTimeout(callback, milliseconds), clearTimeout(handle) }`. `now` is finite monotonic milliseconds. Default is Node `performance.now` with normal timers. Scheduler handles may be numbers or objects. |
| `onLifecycle({roomCode, kind, view})` | Optional coarse public notification, synchronous or async. At most one callback runs per room; one latest pending notification replaces obsolete pending notifications. This is a latest public-state feed, **not** a lossless event log or the durable checkpoint store. Exceptions increment safe counters. |

The factory creates no HTTP listener and opens no database. All callbacks are trusted server injections. Configuration errors throw an `Error` with a bounded `.code`; no injected exception text is exposed on the wire.

| Method | Return and lifecycle |
| --- | --- |
| `handleUpgrade(request, socket, head)` | Synchronous boolean indicating whether the upgrade was handed to `ws`; rejected upgrades receive HTTP 403. Attach the same method to existing HTTP and HTTPS listeners. |
| `startRoom({roomCode, matchId, seed, options})` | `Promise<SnapshotMessage>`. Options default to `{mode:'campaign'}`; `practice` is supported. Restore or create, durably save, then expose one runtime. Duplicate start of the same match is idempotent. A different live match rejects with `room_already_started`; commands own rematches. |
| `pauseRoom(roomCode, reason='network')` | `Promise<SnapshotMessage|null>`. Missing room returns null; an inactive phase is a no-op snapshot. System reasons are `network`, `host-stall`, `recovery`; host-side `requested`, `help`, `recenter` use ordinary engine commands. |
| `getPublicView(roomCode, viewer)` | Synchronous cloned PublicView or null for initializing/missing/closed/faulted room. Viewer defaults to trusted public and is validated. This method is a server seam, not authentication for an HTTP request. |
| `closeRoom(roomCode)` | `Promise<void>`. Fence and close sockets, stop ticker, clear latches, drain outstanding work with a five-second bound. The room code remains leased until actual prior writes/notifications settle, preventing a late old write from overwriting a new runtime. |
| `close()` | Idempotent `Promise<void>`; closes every room, pending handshake, socket and internal timer. Detaching listeners and closing the HTTP/TLS server remain the host's responsibility. |

Additional server-only exports are `ENDPOINT`, `LIMITS`, and `readCoordinatorDiagnostics(coordinator, roomCode?)`. Diagnostics include counts, bounded queue depths, accepted observed-tick lag, buffer bytes, tick overruns and checkpoint outcomes. They exclude tokens, controller epochs and private engine state. Keep this diagnostic export behind a host/debug capability, not a public HTTP route.

Room identifiers permit 1–64 ASCII letters, digits, `_` or `-`; the existing six-character room codes fit. Match/seed/command/controller identifiers permit 1–128 letters, digits, `.`, `_`, `:`, `-`. Tokens are bounded non-whitespace printable ASCII, up to 2048 bytes; existing generated credentials fit without changes.

## Browser API

Import `createRealtimeClient` from `ui/realtime/gravity-orchard/index.mjs`.

```js
const input = createRealtimeClient({
  url, roomCode, token,
  onSnapshot(snapshot) { /* authoritative wrapper, including presence */ },
  onStatus(status) { /* {state, message?}; safe local strings */ },
  now: () => performance.now(),
  WebSocketImpl: WebSocket,
});
input.connect();
```

`url` must resolve to `ws:` or `wss:` and exactly `/api/realtime/gravity-orchard`, with no userinfo, query or fragment. Token is sent only in the first authentication message. Optional callbacks default to no-ops; `now` and `WebSocketImpl` have browser defaults.

| Method | Exact semantics |
| --- | --- |
| `connect()` | Synchronous void, idempotent while connected/connecting. A transient disconnect retries from 250ms up to 5s. A replaced mount does not automatically reclaim the seat. An explicit connect may reclaim an offline replacement; revoked/protocol-error credentials require a new mount. |
| `setInput({x,y,brake})` | Synchronous boolean. Reject invalid shape/nonfinite/out-of-range inputs; otherwise normalize/round and replace one latch. Steering is retained only while authenticated and playing. Other phases send neutral+Brake. |
| `sendCommand({id,kind,payload})` | Promise resolving to the server's `command-result`, including `accepted:false`. Capture match/epoch once. Retry the exact envelope; never retarget. Reusing an ID with identical normalized content returns its existing Promise; different content rejects locally. |
| `getStats()` | Fresh, credential-free diagnostic object: viewer, match/epoch/tick, connection state, counters, input/command queue depth, buffer bytes, applied-ack RTT, ping RTT and tick-age diagnostics. |
| `dispose()` | Synchronous, idempotent; closes socket, cancels timers/reconnect, removes handlers, clears credential/latch/maps and rejects pending commands. Generation fences block callbacks already queued from an old socket or room. |

Local command errors use `.code`: `invalid_command`, `command_conflict`, `not_connected`, `command_queue_full`, `disposed`, `connection_ended`. Invalid factory configuration throws `invalid_configuration`. Unknown server result codes are mapped to safe `server_rejected`, not displayed verbatim.

The phone supplies only normalized intent and lifecycle commands. It does not construct protocol envelopes or own another socket. Input is sent every 50ms even when stationary. Pending reliable commands are bounded at 32, settled command identities at 64, timing receipts at 64 and retired match IDs at 32. Commands use a bounded 8/s client token bucket. Client socket buffering stops sends at 16KiB, closes at 64KiB or after two seconds of backpressure, and keeps no sensor-sample FIFO.

## Authentication, ordering and reliable commands

The exact wire shapes remain in contract section 5: `auth`, `welcome`, `input`, `snapshot`, `command`, `command-result`, `ping` and `pong`. Auth contains only type/protocol/roomCode/token, never a claimed actor. No WebSocket subprotocol or credential-bearing URL is accepted. The first-message deadline is five seconds, including an unresolved authenticator. Pre-auth gameplay, binary messages, invalid JSON and unsupported envelopes cannot enter the simulation.

After authentication the coordinator assigns a new opaque controller epoch. Replacement fences the old connection immediately, clears its input/readiness and pauses an active run; its graceful close is bounded at 250ms. Closed sockets cannot continue steering while their handshake drains. The host cannot send continuous steering. Every input rechecks trusted seat, current connection, protocol, match, run/controller epochs, strictly increasing safe sequence, valid vector and observed tick. Future ticks and lag greater than 30 ticks reject without refreshing the deadman.

Authorization is rechecked every second and before each reliable command. Rechecks have a one-second deadline; a connection is unusable once its last verification is two seconds old. The number of unresolved authority callbacks is capped, including callbacks that outlive their socket. Rotation, expiry, identity change, null or exceptions close the old capability. Callback implementations should still bound their own external I/O; the coordinator cannot cancel an arbitrary Promise supplied by the host.

Reliable kinds are exactly `ready`, `pause`, `retry-stage`, `rematch`. Both controllers must have current authenticated neutral/input heartbeats before a readiness transition can enter countdown. GO1 applies ordinary commands; GO2 allocates a new match identity for every rematch, including same-seed rematch. System pause reasons cannot arrive as wire commands.

Accepted lifecycle commands and their dedup journal are committed atomically with the checkpoint **before acknowledgment or public publication**. A retry after a lost result, reconnect, rematch or restart returns the original retained scalar result, without reapplying. Command results intentionally omit the optional snapshot; the committed snapshot arrives through the normal stream. This avoids retaining obsolete views or another connection's acknowledgment. Rejected normalized commands retain their result too; changed-content reuse returns `command_conflict`.

The journal holds at most 256 entries per room, scoped to trusted actor and command ID. Current-epoch records are never evicted to make an old same-epoch command executable again. Entries from older matches/epochs may be pruned; their envelopes then fail the current identity fence. A saturated current epoch rejects new commands with `command_capacity`. Rejections need no immediate write because they do not change gameplay; the next durable boundary/checkpoint includes them. Recovery changes epoch, so an unpersisted rejection cannot become an old command acting on the recovered run.

Socket close codes are bounded and contain safe fixed reasons: `4401` auth/expiry, `4409` replacement, `4400` malformed protocol, `4429` rate/capacity/slow reader, `4410` room/coordinator closed, `1011` storage/simulation failure and `1013` temporary busy. Native framing errors may use `1002`/`1009`. The browser never presents arbitrary peer close text.

## Fixed time, safety and persistence

The coordinator owns one fixed-step ticker and serialized mutation queue per room. A monotonic accumulator supplies 60 simulation ticks/s, capped at five catch-up ticks per scheduler turn. A gap beyond 250ms requests a trusted `host-stall` pause instead of fast-forwarding. The 50ms snapshot deadline stays phase-locked so timer rounding does not accidentally reduce steady-state delivery to approximately 15Hz.

Each seat stores only its latest accepted input. At 250ms it becomes neutral axes plus Brake. At two seconds without valid control the whole active run pauses. Invalid/replayed frames cannot keep it alive. Pause, countdown/stage/retry boundaries and recovery clear latches and old applied acknowledgments; sequence remains increasing inside the same controller epoch. New connections reset the sequence under a fresh controller epoch. Public presence lives only in the snapshot wrapper.

Acknowledgments are recipient-specific and contain the newest input **actually passed to a simulation tick**, its sequence, controller epoch and applied tick. Receipt alone produces no ack. Public observers/hosts receive null; other controllers never see that epoch. Global server sequence increases with emissions; a new welcome establishes a new ordering stream. The browser rejects old sequence, retired match, old epoch, invalid ack and detached-connection callbacks.

Periodic checkpoints are serialized off the tick path, at most once per five seconds while active; an in-flight periodic write suppresses another periodic copy. Lifecycle boundaries pause mutation until their save resolves. No input handler calls SQLite or checkpoint save. At most one store write runs per room; a boundary can wait behind that operation. A failed/timed-out save freezes and faults the runtime, stops its ticker and closes its sockets; it never acknowledges an unsaved new epoch or proceeds through the failure. Recovery requires closing the failed runtime and loading the last successful checkpoint.

Coordinator envelopes have `coordinatorSchema:1`, game/room/match/run identity, seed/options, the private GO1 engine checkpoint and the command journal. Maximum envelope size is 1MiB. One explicit migration accepts `coordinatorSchema:0` with no command journal and adds an empty journal. Unknown future schema, wrong room, mismatched identity, corrupt commands and invalid engine checkpoints reject. Engine schema migration remains GO1's responsibility.

Restore requires a paused `recovery` view with cleared readiness and a strictly greater epoch. If GO1's restore already applies that boundary, GO2 does not increment it again; otherwise it invokes the trusted recovery seam. The new recovery boundary is saved before welcome. Players reauthenticate, send fresh input, and both become ready before countdown. The last displayed frame can roll back to the last successful checkpoint; no exact crash-frame recovery or sleep fast-forward is claimed.

Additional starting bounds: 4KiB auth/command frame, 512-byte input, JSON depth 4/32 fields, 16 WebSocket fragments/64 buffered chunks, 40 inputs/s with burst 8, 80 total messages/s with burst 24, 10 commands/s with burst 8, 16 pending commands/room, 8 sockets/room, 32 rooms, 32 pending authentications and 128 global sockets. Server output coalesces into at most one pending snapshot/connection; soft buffer 32KiB, hard buffer 128KiB, maximum frame 64KiB and two-second slow-reader deadline. Native ping/pong traffic shares the bounded message budget. There is no unbounded sensor, snapshot, auth or lifecycle queue.

## Standalone fixture and reproduction

From the repository root:

```sh
npm ci --prefix server/realtime/gravity-orchard --ignore-scripts
node server/realtime/gravity-orchard/tests/run.mjs
node server/realtime/gravity-orchard/fixture/server.mjs
```

Open `http://127.0.0.1:4182/` for the host and the linked Jon/Lydia controller pages. `GO2_FIXTURE_PORT` selects another port. The fixture binds only loopback, uses an exact static allowlist and strict origin policy, and creates short-lived random credentials through a same-origin POST. Tokens remain in page memory and never appear in URLs, markup, diagnostic output or evidence. Its two colored/patterned trays use different marker shapes, labeled forces/Brake/presence, keyboard/touch steering, compact counters and fault controls. It supports 360/390px controls, TV layouts and reduced motion. Failure controls cover socket drop/reconnect, stale observed ticks, delayed coalesced delivery, pause and host clock jump.

Rendered browser reproduction:

```sh
node server/realtime/gravity-orchard/node_modules/playwright/cli.js install --with-deps chromium
node server/realtime/gravity-orchard/tests/run.mjs --browser
```

`GO2_EVIDENCE_DIR` selects screenshot/report output. `SOFA_PLAYWRIGHT_MODULE` and `SOFA_CHROMIUM_PATH` optionally select an existing test installation/browser. Missing browser tooling fails the test; it is never reported as a skipped pass. The journey creates three isolated browser contexts, drives the real client/server, checks pause/reconnect/stale input/host stall/rematch and saves healthy/interrupted TV and controller screenshots plus a credential-free JSON report. Browser traces/network dumps are not captured.

Real timer/socket measurement:

```sh
node server/realtime/gravity-orchard/tests/measure.mjs
```

The committed [loopback sample](../../server/realtime/gravity-orchard/evidence/loopback-measurements.json) measured a six-second playing interval using the actual browser client implementation under Node and actual WebSockets. It observed **59.74 simulation ticks/s**, **19.80 host snapshots/s**, **19.80/19.97 player inputs/s**, **239 accepted inputs**, **one checkpoint write**, and no tick overruns. Applied-input acknowledgment RTT medians were **32.61/28.88ms**; p95 was **48.84/48.03ms** for Jon/Lydia. These are one Linux loopback sample, not home-network or rendering guarantees.

RTT subtracts the client's own monotonic input-send time from that same client's ack-receive time. It includes simulation scheduling and snapshot cadence. `observedTickAgeAtApply` compares applied tick with the input's observed tick; `appliedInputAgeTicks` compares snapshot tick with applied tick. Exact receipt lag is a separate server diagnostic. No unsynchronized phone/host clocks are subtracted to claim one-way latency.

## Verification and evidence

The owned workflow runs all newly discovered GO2 coordinator, protocol, client and fixture suites on Linux Node 22.13.0, Linux Node 24.22.3 and macOS Node 24.22.3; a separate Chromium job runs the three-context rendered journey. Actions follow the repository's pinned-SHA convention. All jobs check the exact PR head and retain rendered evidence. Existing broad repository workflows remain unchanged.

Local verification completed during implementation:

- **78 coordinator/client/fixture/adversarial Node tests passed** on Node 24.22.3 Linux/x64, including real TLS with explicit test-CA trust and original Host/Origin validation, private actor/ack identity, malformed/flooded messages, exact deadman thresholds, takeover/revocation, bounded catch-up, stale TCP input and full disposal.
- A real paused TCP reader exercises coalescing and bounded disconnect; this is not a patched `bufferedAmount` test alone.
- Deferred save/authorization/lifecycle probes cover durable-before-ack ordering, lost command results, checkpoint restoration, old-writer close/reopen races, slow hooks and rejected-command replay.
- An actual in-memory SQLite checkpoint hook receives at most two periodic writes for 240 input samples across six simulated seconds, with no per-input persistence.
- `npm test`: **81 unchanged regression tests passed**. Private projection/LAN/client suites: **38 additional tests passed**.
- `npm run build`: **exit 0**, run in an isolated source export with the unchanged root lockfile's already-installed dependencies. Generated copies/build output were excluded from the GO2 worktree.

Local Chromium could not start: its process-singleton socket operation was denied before page load. A shared-browser attempt was also denied by the environment's URL policy. Neither is counted as a rendered pass, and no policy or certificate bypass was used. Remote CI supplied the rendered acceptance path: [run 44776568487](https://github.com/jonathanjie/sofa-arcade/actions/runs/44776568487), at `2dfe82ae176d6aec4cdb6a0028665a57b213d8cf`, passed the three-context browser journey and both Linux protocol/runtime jobs. Final-head results, including the macOS job, are recorded in the PR rather than predicting a future commit hash here.

### Captured browser evidence

The committed [browser evidence report](../../server/realtime/gravity-orchard/evidence/browser/browser-evidence.json) identifies that exact source commit, Node 24.22.3, Chromium 151.0.7922.34, assertions and safe counters. All eight screenshots were visually inspected. The downloaded artifact's SHA-256 matched GitHub's digest: `d7632d9aa4da1342695224fe67e4313dc71ee70da06764223eb7f8e7a6f91445`.

| Evidence | Observed result |
| --- | --- |
| [Healthy TV, 1280×720](../../server/realtime/gravity-orchard/evidence/browser/healthy-tv-1280x720.png) | Separate round/diamond markers visibly steer in different directions; both seats and live transport counters are legible. |
| [Jon, 360×800](../../server/realtime/gravity-orchard/evidence/browser/controller-jon-360x800.png) and [Lydia, 390×844](../../server/realtime/gravity-orchard/evidence/browser/controller-lydia-390x844.png) | Touch pad, held Brake and Ready/Pause controls fit the phone widths; measured ACK RTT uses each controller's own clock. |
| [Requested shared pause](../../server/realtime/gravity-orchard/evidence/browser/requested-pause-tv-1280x720.png) | The shared board reports the requested pause and both inputs show Brake. |
| [Network-paused TV](../../server/realtime/gravity-orchard/evidence/browser/interrupted-tv-1280x720.png) and [interrupted controller](../../server/realtime/gravity-orchard/evidence/browser/interrupted-controller-360x800.png) | Jon is offline, the shared run pauses, both inputs are neutral with Brake, and the controller exposes interruption/reconnect controls. |
| [Host stall, 720p](../../server/realtime/gravity-orchard/evidence/browser/host-stall-tv-1280x720.png) and [1080p](../../server/realtime/gravity-orchard/evidence/browser/host-stall-tv-1920x1080.png) | A deliberate one-second clock jump pauses the run with the `host-stall` reason; both TV sizes retain readable board/presence controls. |

Screenshot review found that the interrupted controller's cached mini-board still used the word “Live,” despite its correct interruption overlay. The follow-up fixture repair labels it “Offline · last received frame” and the cached presence “Last seen,” with explicit browser assertions. The committed captures remain unchanged evidence of their recorded source commit; the final CI artifact captures the repaired labels.

At the healthy browser checkpoint, the two controllers observed approximately 20 snapshots/s and 60 ticks/s; applied-input ACK RTT EWMA was 32.29ms for Jon and 9.98ms for Lydia. Across the fault journey the coordinator recorded 561 accepted inputs, 20 stale-tick rejections, 82 input coalesces, 789 ticks, zero tick overruns, one injected host stall, and 14 checkpoint writes across eight accepted lifecycle commands. Delayed delivery replaced five of six pending snapshots in its measured window. These are rendered Chromium loopback observations, separate from the six-second Node sample above, and do not establish Wi-Fi, phone-sensor, screen-cast or packaged-Mac performance.

## Exact GO7 wiring required

1. **Expose a server-only authority seam inside `createRoomApi`.** Reuse existing room lookup/expiry checks and bearer-hash matching. Verify `gameId === 'gravity-orchard'`; return normalized host/null-player or player/seat identity, or null. `authenticate` is currently private, and successful projected room GET does not prove identity. Do not put this helper in browser modules or turn public GET into authorization.
2. **Construct one coordinator beside the existing authority/store.** Inject GO1's reviewed pure exports and one checkpoint table/key per existing room. Never run the old per-action CAS simulation and the realtime simulation as independent writers for the same Gravity Orchard room.
3. **Share the upgrade callback.** Attach `coordinator.handleUpgrade` to the existing HTTP server and pass that same callback to GO6's `createSecureLanServer`. Validate exact allowed host/port/origin/route against the actual request socket/listener; do not trust forwarded headers. Keep existing SSE and old-game HTTP routes unchanged.
4. **Bridge coarse lifecycle and live reads.** Initial start binds the existing room/match to `startRoom`. Existing Gravity Orchard GET/SSE paths read `getPublicView` after their normal viewer authentication, and use lifecycle notifications to publish/update coarse room metadata. The callback is coalesced latest state, so do not depend on observing every intermediate transition. Durable state belongs in `saveCheckpoint`; existing revision metadata must not become a competing live state. Preserve old-game secret projections.
5. **Mount one client per host/phone.** Build the WebSocket URL from validated LAN metadata, pass the current credential in memory, route only `setInput` to GO3 and `sendCommand` to phone/TV command controls. Deliver `snapshot.view` to the presentation and `snapshot.presence` as optional `setConnection(status).presence`. Dispose the old client before leaving/rejoining/changing seats. Use new IDs for new user commands and the same ID for an uncertain retry.
6. **Package explicit runtime closure.** Add the five source modules and `ws` production dependency/license to the shared Node/native/portable inventories; add only the two browser modules to public allowlists/generated copies. Exclude every fixture, test, checkpoint and diagnostic artifact. Validate production exports cannot serve private engine/checkpoint code.
7. **Own shutdown and recovery.** On deliberate native shutdown, pause active rooms and await durable saves before closing coordinator/listeners/store. Close all related resources in order. A faulted store must be repaired before reopening that room. A timed-out injected write cannot be safely cancelled by GO2; its room lease stays reserved until it settles. Hooks must return their actual Promise, and GO7 must not replace the coordinator while its old writer is still outstanding.

## Remaining acceptance boundary

GO2's independently testable implementation is ready for GO7 composition after the PR's final-head CI gates pass. It does not enable the game. GO7 still must integrate the exact reviewed GO1/GO3/GO4/GO5/GO6 heads, real room authentication/persistence/GET/SSE and native packaging. Actual iOS Safari/Android Chrome motion and trust, two physical phones on Wi-Fi, TV casting, packaged Mac execution and WAN-disconnected cold start remain separate unverified hardware/integration gates. No synthetic browser or localhost measurement substitutes for them.
