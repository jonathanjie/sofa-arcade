# Gravity Orchard implementation contract v0.2

This contract describes the local runtime for [Gravity Orchard design v0.2](games/gravity-orchard.md). The game design, desktop release, wire protocol and checkpoint schema have separate version fields. See the [handoff](HANDOFF.md) for the merged source and the open physical-phone checks.

## 1. Product and runtime invariants

Two people sit on a sofa. The Mac/Tauri window owns a shared TV board and an authoritative simulation. Each ordinary phone browser steers one garden tray with comfortable tilt or a touch joystick and has a large held Brake control. There are three 90-second cooperative stages, untimed interludes and optional untimed practice. Normal screens maximize board/control space; explanations belong in optional tutorial, Help and initial setup.

Use 1280 × 720 logical world units. Positive x points right and positive y points down. The board scales uniformly inside the available TV area; the world size is not a requirement to consume 720 CSS pixels plus additional chrome. Never rotate the whole interface to demonstrate gravity.

Runtime settings:

| Concern | Setting |
| --- | --- |
| Simulation | 60 fixed ticks/second |
| Phone transmission | 20 frames/second, latest control value only |
| Public snapshots | 20/second |
| Stale accepted input | 250 ms → neutral vector and Brake |
| Missing valid input | 2 seconds → shared pause |
| Permitted observed-tick lag | 30 ticks; reject future ticks |
| Active fruit | Maximum 8 |
| Fruit schedule | 24 fruit/stage; 210 ticks between spawns; defer at capacity without a later burst |
| Initial speed cap | 220 world units/second |
| Stage duration | 5400 active ticks; countdown does not consume this |
| Resume countdown | 180 ticks |
| Position/velocity rounding | Round to 1/10000 world unit after each simulation tick |
| Input rounding | Round to 1/10000 after validation and unit-circle limiting |

These settings define the simulation and transport. Measure play difficulty and physical latency separately.

## 2. Original component boundaries

The [archived dispatch](archive/DISPATCH_GRAVITY_ORCHARD.md) records the six component assignments. GO7 integrated them at `e0504c1`.

## 3. Pure simulation seam

Required modules under games/gravity-orchard/:

- engine.mjs: private authoritative engine and checkpoint functions.
- catalog.mjs: browser-safe fruit/stage/rules metadata.
- geometry.mjs: browser-safe authored level geometry.
- public.mjs: browser-safe public-view validation and display helpers, with no import of engine or private checkpoints.
- fixtures/: public JSON fixtures and separately named private test fixtures.
- tests/ and a runnable diagnostic renderer within the owned subtree.

Required exports:

    createRun({ seed, matchId, options = { mode: 'campaign' } }) -> State
    normalizeInput(raw) -> { x, y, brake } | null
    step(state, { jon, lydia }) -> State
    applyCommand(state, actor, command) -> { accepted, state, code? }
    pauseForSystem(state, reason) -> State
    project(state, viewer) -> PublicView
    serializeCheckpoint(state) -> JSON-safe Checkpoint
    restoreCheckpoint(checkpoint) -> State

Seed and matchId are non-empty bounded strings supplied by the host. Mode is campaign or practice. actor/viewer is a trusted server-created object: { role: 'host' | 'player' | 'public', playerId: 'jon' | 'lydia' | null }. Never obtain it from client action fields. Unknown/unauthorized commands return a stable error code and the unchanged state.

normalizeInput accepts only finite numeric x/y in [-1,1] and a boolean brake. It rejects missing/wrong types, NaN, Infinity and out-of-range values, limits diagonal magnitude to one, then rounds. It does not accept wire identity/sequence fields. The transport validates its own envelope first. The neutral safe input is { x: 0, y: 0, brake: true }.

State is JSON-serializable. All exports are pure/non-mutating except no-op transitions may return the same object. step advances exactly one fixed tick in countdown/playing; waiting, paused, interlude and finished do not advance time. tick is monotonic across stages within a match and never reset on resume. Only playing advances elapsed stage time. No wall clock, network, DOM, Math.random, file IO, audio, or unseeded IDs in engine code.

Every boundary that pauses, resumes/starts a countdown, changes stage, retries a stage or restores a checkpoint increments runEpoch and clears both control latches/readiness. A readiness command may set its own seat ready; when both are ready the engine starts the countdown and clears readiness again. Coordinator safety checks additionally require usable, current authenticated controllers before allowing that transition. pauseForSystem is a server-only pure export accepting network, host-stall or recovery; it applies the same boundary rules without the coordinator mutating private state. It is never a wire command or browser-served module.

Physics uses a bounded circle/AABB/segment model, stable sorted collider/entity order, fixed iteration limits and seeded supply. Fruit-to-fruit rigid-body pile physics is outside v1. Brake removes the tray's ordinary tilt force and applies strong damping; it is not teleportation or immunity to collisions. Blend both tray fields across the bridge. Define whether gust force also receives Brake damping and test that choice; the PRD requires Brake to be a useful response to forecast gusts. Never consume or duplicate a rejected fruit.

The three level IDs are morning-delivery, switchback-grove, moonlight-picnic. Export LEVELS from geometry.mjs, FRUIT_TYPES/STAGES/RULES from catalog.mjs, and getLevel(id) from geometry.mjs. Geometry is immutable public data:

    {
      id, bounds: { x, y, width, height },
      trays: [{ id: 'jon' | 'lydia', bounds: { x,y,width,height } }],
      bridge: { x,y,width,height },
      baskets: [{ id, fruitType, owner, x,y,radius }],
      bumpers: [{ id, kind: 'circle', x,y,radius }
              | { id, kind: 'rect', x,y,width,height }],
      compost: [{ id, x,y,width,height }],
      gates: [{ id, x,y,width,height, schedule: { periodTicks, openTicks, forecastTicks } }],
      gustSchedule: [{ forecastTick, startTick, durationTicks, x, y }]
    }

Basket IDs equal fruit types: apple, plum (Jon), pear, starfruit (Lydia). The geometry module defines the obstacle coordinates. Circles and axis-aligned rectangles suffice. The engine may keep richer private state, but public geometry and public snapshots must remain compatible with this interface. Gate closure waits until its collision area is clear.

## 4. Public view and command contract

PublicView has these required keys; optional cosmetic metadata must be additive:

    {
      gameId: 'gravity-orchard', schemaVersion: 1,
      matchId, runEpoch, tick,
      phase: 'waiting' | 'countdown' | 'playing' | 'paused' | 'interlude' | 'finished',
      mode: 'campaign' | 'practice',
      stageIndex: 0 | 1 | 2, levelId,
      timeRemainingTicks: number | null,
      countdownTicks: number,
      ready: { jon: boolean, lydia: boolean },
      pauseReason: null | 'requested' | 'help' | 'recenter' | 'network' | 'host-stall' | 'recovery',
      fruits: [{ id, type: 'apple' | 'plum' | 'pear' | 'starfruit', x,y,vx,vy,radius }],
      baskets: {
        apple: { count, capacity: 3 }, plum: { count, capacity: 3 },
        pear: { count, capacity: 3 }, starfruit: { count, capacity: 3 }
      },
      orders: {
        recipes: [{ id, needs: { apple, plum, pear, starfruit } }],
        activeIndex: number, completedIds: string[]
      },
      gateStates: [{ id, state: 'open' | 'forecast' | 'closed', ticksToChange, closureDeferred: boolean }],
      gust: null | { id, phase: 'forecast' | 'active', x,y,ticksRemaining },
      players: {
        jon: { input: { x,y,brake } },
        lydia: { input: { x,y,brake } }
      },
      results: [{ stageIndex, ordersCompleted, composted, stars, elapsedTicks }],
      summary: { ordersCompleted, stars, composted, perfectPicnic, recordEligible },
      events: [{ id, kind, tick, entityId?, playerId?, x?, y?, data? }]
    }

`summary` totals orders, stars and composted fruit across the stage entries in `results`. `recordEligible` is true in campaign mode. `perfectPicnic` is true only for a campaign with three results, twelve completed orders and zero composted fruit.

All numbers are finite and bounded. Fruit IDs are stable throughout their lifetime. Event IDs are stable, unique within a match and unchanged by repeat projection. Keep a bounded recent event ring of at most 64 entries so a 20 Hz consumer can see events between simulation ticks; consumers deduplicate by ID and clear cursors on a new match. Required event kinds: spawn, transfer, catch, reject, compost, order-complete, gate-forecast, gust-forecast, gust-start, stage-complete, phase-change. data is a small public object, never an authority/checkpoint/credential dump.

Snapshots are public for this cooperative game. Projection still excludes raw sensor readings, credential material, internal transport objects, private storage, full future spawn RNG and server diagnostics. Public/coordinator metadata must not leak secrets from other rooms or the two existing games.

Game command kinds and payloads:

| Kind | Payload | Authority / phase |
| --- | --- | --- |
| ready | { value: boolean } | That authenticated player only; waiting, paused or interlude |
| pause | { reason: 'requested' \| 'help' \| 'recenter' } | Either player or host; playing/countdown |
| retry-stage | {} | Host; interlude/finished. Discard the most recently completed stage result and retry that stage from its deterministic stage seed; retain earlier results |
| rematch | { seedMode: 'same' \| 'new' } | Host; finished or paused; coordinator allocates a new matchId and calls createRun |

Interlude both-ready advances to the next stage. The final stage goes to finished instead of interlude. retry-stage returns to waiting for that stage. Practice has no deadline/gust and offers a host restart through rematch. ready from paused returns to the prior active stage, followed by countdown; no real-world pause duration is simulated. System network/stall/recovery pauses use a trusted coordinator path; clients cannot forge system authority.

The engine handles ready, pause and retry-stage. The coordinator creates rematches and handles reliable command replay for the shared room. Do not create a second independent room.

A scheduled closure blocked by overlapping fruit remains in forecast with ticksToChange: 0 and closureDeferred: true. Close only after the area is clear; then set closureDeferred: false. Other gate states use false. This lets the renderer explain a waiting gate without guessing from fruit positions.

## 5. Realtime wire contract

Use an explicit versioned WebSocket endpoint /api/realtime/gravity-orchard. HTTP/WS and optional HTTPS/WSS feed the same coordinator. Browser WebSocket constructors cannot add an arbitrary Authorization header, so this version uses a **bounded first authentication message**, never a bearer in URL/query/subprotocol/QR/log.

Client's first message:

    { type: 'auth', protocol: 1, roomCode, token }

Authorize through an injected server-only callback backed by the existing room credential authority. A public room GET is not proof of the socket's seat. Validate exact permitted Origin/Host before upgrade; reject unknown/cross-room credentials; permit no gameplay before authentication. Impose a 5-second authentication deadline, 4 KiB auth/command frame limits, 512-byte input limit, bounded JSON depth/fields, 40 input frames/second with a burst of eight, and eight sockets per room. See the [protocol limits](../server/realtime/gravity-orchard/lib/protocol.mjs) for message, command and buffer limits.

Server welcome:

    {
      type: 'welcome', protocol: 1,
      viewer: { role, playerId },
      controllerEpoch: string | null,
      snapshot: SnapshotMessage
    }

A new player connection receives a fresh opaque controllerEpoch. A successfully authenticated replacement fences/closes its old player socket and clears its input before accepting the new one. Authenticated hosts can observe but cannot steer. Host credentials do not silently become a player token. Anonymous/public WebSocket observation is outside v1: authorize returns only host/player or null. The public viewer role remains available to trusted projection/HTTP paths under the existing room policy.

Input:

    {
      type: 'input', protocol: 1,
      matchId, runEpoch, controllerEpoch,
      seq, observedTick,
      x, y, brake
    }

seq is a nonnegative safe integer strictly increasing within controllerEpoch. observedTick is the newest received authoritative tick; reject future values and values more than 30 ticks behind. Derive the player from the authenticated socket; reject client-supplied actor/playerId fields. Check exact match/epochs, schema and vector before updating freshness. Invalid/replayed frames do not refresh the deadman timer. Use host monotonic receipt time; no client wall time is authoritative.

At 250 ms without accepted input use neutral+Brake. At two seconds pause both players. On pause, resume, stage change, recovery and replacement, clear latched inputs and fence old run/controller epochs before processing queued frames. Arrival time and browser bufferedAmount alone cannot identify old TCP backlog.

SnapshotMessage:

    {
      type: 'snapshot', protocol: 1, roomCode, serverSeq,
      view: PublicView,
      presence: {
        jon: { connected: boolean, inputFresh: boolean },
        lydia: { connected: boolean, inputFresh: boolean }
      },
      ack: null | { controllerEpoch, seq, appliedTick }
    }

ack is recipient-specific; it reports the latest input actually applied, not merely received. serverSeq increases across snapshot emissions in a coordinator instance. A new welcome starts a new client stream ordering context. Drop stale snapshot order; never overwrite a newer match/epoch with delayed data. Presence is coordinator-owned and does not require engine network dependencies.

Reliable commands and replies:

    { type: 'command', protocol: 1, id, matchId, runEpoch, kind, payload }
    { type: 'command-result', protocol: 1, id, accepted, code?, snapshot? }
    { type: 'ping', protocol: 1, id }
    { type: 'pong', protocol: 1, id }

Bound IDs and error text. Persist/retain command deduplication at the appropriate lifecycle boundary. A retry with identical ID/content returns the original result; reuse with different normalized content fails. Old-match or old-epoch commands do not act on a later stage. Handle a lost command acknowledgment and reconnect without double application. Do not send score-changing or lifecycle commands as unreliable held inputs.

Coordinator export:

    createRealtimeCoordinator({
      authorize, validateUpgrade, loadCheckpoint, saveCheckpoint, simulation, clock, onLifecycle
    }) -> {
      handleUpgrade(request, socket, head),
      startRoom({ roomCode, matchId, seed, options }),
      pauseRoom(roomCode, reason),
      getPublicView(roomCode, viewer),
      closeRoom(roomCode),
      close()
    }

authorize({roomCode,bearer}) asynchronously returns the trusted viewer object or null. validateUpgrade(request) is a synchronous boolean policy callback checking exact allowed Host/Origin and the route; default deny if it is missing. The local host derives HTTP/HTTPS context from the actual listener and request.socket.encrypted, never a caller-supplied forwarded header. The secure listener passes the original request without rewriting its headers. simulation is the engine interface, injected in isolated tests. clock provides monotonic now() plus injected scheduling/cancellation. loadCheckpoint(roomCode) and saveCheckpoint(roomCode, checkpoint) are asynchronous. onLifecycle({roomCode,kind,view}) publishes coarse transitions to existing room GET/SSE/SQLite integration; it must not write on every tick. See the [coordinator implementation](../server/realtime/gravity-orchard/index.mjs) for scheduling and persistence.

Client export in ui/realtime/gravity-orchard/index.mjs:

    createRealtimeClient({
      url, roomCode, token, onSnapshot, onStatus, now, WebSocketImpl
    }) -> {
      connect(), setInput({x,y,brake}), sendCommand(command),
      getStats(), dispose()
    }

setInput replaces a single latest-value latch. The client sends at 20 Hz while active/connected, even when a stationary phone has no changed orientation events. It supplies wire identity, epochs, sequence and observedTick from the authenticated stream. onStatus receives {state:'connecting'|'connected'|'reconnecting'|'offline'|'error',message?}. sendCommand accepts id/kind/payload, binds match/epoch at first submission, returns its acknowledged result and preserves the whole original envelope on uncertain retry; never rebind a pending command to a newer phase. Dispose cancels timers/listeners/reconnects and prevents late callbacks. The collection passes snapshot.presence through the presentation setConnection status as an optional presence field so TV can show both players without contaminating the pure engine view.

Bound WebSocket buffers and frame sizes. Coalesce snapshots, never accumulate an unbounded queue. Pause rather than running a huge catch-up burst after host sleep/stall. Use a short bounded catch-up cap (at most five ticks per scheduler turn); a gap beyond 250 ms causes host-stall pause. Do not implement client authority, continuous SQLite CAS updates, or a cloud relay.

Persist stage boundaries, explicit pause/end, and a bounded periodic checkpoint (initially at most once per five seconds). Periodic checkpoint writes must be serialized/coalesced and off the tick-critical path. Epoch-changing boundaries are infrequent: durably save their new epoch/state before acknowledging or publishing that boundary, so crash recovery cannot reuse an epoch already observed by a client. Do not advance gameplay through a failed boundary save. Restore **paused from the last successful checkpoint**, increment runEpoch and require reconnection/readiness/countdown. Never imply exact recovery of the last displayed frame or fast-forward through sleep. Checkpoint schema migrations/rejection need explicit tests.

## 6. Phone input and presentation

Files live only under ui/games/gravity-orchard/phone/. Required exports:

    createMotionController({
      emitInput, onStatus, environment, now
    }) -> {
      requestPermissionFromGesture(), calibrate(),
      setMode('tilt'|'touch'), setTouchVector(x,y), setBrake(held),
      pause(), resume(), dispose()
    }

    mountPhone(root, {
      playerId, input, onCommand, onExit, assets, reducedMotion
    }) -> { update(view), setConnection(status), dispose() }

The mount owns and disposes its motion controller. It sends normalized x/y and Brake through `setInput` and reliable commands through `onCommand`.

Use relative DeviceOrientation beta/gamma, not compass heading or integrated raw acceleration. First check secure context and availability. Where requestPermission exists, invoke it directly from the user gesture before unrelated awaits; handle denial/errors. Require actual finite initial samples. Expose statuses insecure, unsupported, needs-permission, denied, no-samples, calibrating, ready, paused. Treat permission success and sensor readiness separately.

Neutral calibration uses a comfortable held phone angle. Start with approximately 25° useful tilt, approximately 3° dead zone and a bounded low-pass filter; expose tuning in one owned module. Test orientation angles 0/90/180/270 and wrap discontinuities. Deliberately pause/recenter on screen-orientation change rather than reversing axes unexpectedly. No compulsory shaking, flicking or vigorous gesture.

After initialization, lack of *changed* orientation events is not proof of disconnection. Keep the latest stable vector; transport heartbeat is a separate clock. On page visibility loss, pointer cancellation, Help/recenter or disposal, immediately emit neutral+Brake and attempt shared pause; server deadman safety still covers a lost final message. Do not transmit/store raw motion recordings.

Touch mode must be a complete first-class control path over ordinary HTTP or HTTPS. Large joystick and Brake targets work without precise gestures; include keyboard debug equivalence. Phone audio starts quiet. Normal phone UI is identity/status, tilt gauge or joystick, one large Brake and compact pause/recenter. Setup/tutorial instructions disappear during play.

## 7. TV and tutorial

Required exports:

    mountTV(root, {
      assets, geometry, onCommand, onExit, sound, reducedMotion, now
    }) -> { update(view), setConnection(status), dispose() }

    mountTutorial(root, { onClose, inputMode, reducedMotion }) -> { dispose() }

The collection imports the TV and tutorial modules through the game entry point. Inputs are public views, never private engine state. Render with requestAnimationFrame and interpolate positions between snapshots. Do not advance authoritative score/timer/spawn/physics. Bound interpolation/extrapolation; freeze safely during missing data or pause. Deduplicate effects by stable event ID.

The garden is the dominant surface. Keep active recipe, next-two preview, clock and stage progress compact. Both tray ownerships, bridges, basket identities and controls must be readable from the sofa. Forecast gust/gate direction clearly. Use fruit silhouettes/labels/patterns as well as colour. Animate character lean/brace/cheer and Lala's forecast as local presentation. Reduced motion preserves essential arrows, state and final positions.

The tutorial uses a private scripted fixture and no live room dispatcher. It teaches tilt/touch, Brake, bridge transfer, recipes/buffer planning and pause. Opening Help/recenter during a live run requests shared pause; close alone cannot resume without both ready.

## 8. Media and composed score

Final assets belong under public/assets/gravity-orchard/. Authoring tools/provenance can remain in owned sources/ directories but must not be added to public delivery inventories. Runtime media modules belong in ui/media/gravity-orchard/.

Provide an original cover, three garden environments/terrain pieces, four fruit/basket silhouettes, gate/gust/compost cues, and Jon/Lydia/Lala motion-ready states or atlases. Character style follows the warm existing collection; no text baked into the board/cover UI. Inspect generated art at actual use sizes and optimize it. Preserve useful silhouette/direction/readability in reduced motion.

Required asset manifest: public/assets/gravity-orchard/manifest.json with schemaVersion:1, gameId, assets:{key:{src,width,height,kind,frames?}}, characterStates and runtimeFiles. kind is image or atlas; src is an explicit root-relative asset URL. Atlas frames record rectangle bounds and durationMs. No placeholder=true entries counted as final. Provide manifest.mjs as the browser-safe validated adapter and runtime-files.json as the explicit file inventory.

Required music exports follow the existing shared scheduler:

    score.mjs: SCORE, eventsForBar(barIndex, scene)
    events.mjs: eventsForEffect(name)

Use the current scheduler's inspected event/instrument contract, not an invented replacement AudioContext. Compose recurring melody, harmony, bass and a contrasting section with deliberate cadences; avoid independently random note selection. Scenes: menu, practice, stage1, stage2, stage3, paused, celebrate. Unknown scenes fall back safely; unknown effects return []. Essential cues include catch, reject, compost, order, forecast, countdown and finish, with restrained levels and rate limits. Host-only music/effects, shared settings, gesture unlock and disposal remain intact. Render an audio preview; distinguish actual audition from structural/level tests.

## 9. Trusted LAN and Tauri setup component

Ordinary phone LAN HTTP cannot reliably supply browser motion sensors. Keep it fully playable with touch. The selected tilt route is an **optional trusted local HTTPS/WSS listener**, sharing the same handler/coordinator/database as HTTP. No internet during a run after local setup is the intended acceptance target, not a current guarantee.

Exports:

    createSecureLanServer({
      tlsMaterial, host, port, requestHandler, onUpgrade, onError
    }) -> Promise<{ port, origins, status, close() }>

    mountSecureLanSetup(root, {
      getStatus, provision, exportPublicTrust, remove, onClose
    }) -> { refresh(), dispose() }

tlsMaterial contains host-owned private key/certificate buffers and advertised identities; never serialize it into readiness/UI output. See the [secure LAN modules](../server/secure-lan/) for provisioning and storage. onUpgrade is the same coordinator handler as HTTP; no duplicate room store. Default secure port may be 4178, but persist/validate actual configuration and handle conflicts without attaching to an unrelated process.

Public readiness shape:

    {
      enabled: boolean,
      status: 'disabled'|'needs-setup'|'ready'|'certificate-expired'|'address-mismatch'|'failed',
      controllerOrigins: string[],
      certificateFingerprint?: string,
      validUntil?: string,
      requiresPhoneTrust: boolean
    }

Ready means the host listener/certificate is valid; only a successful phone probe proves that phone's trust. Validate exact HTTPS origins, SAN/address coverage, expiry and allowed local identities. Preserve the existing stable loopback HTTP origin and saved-room behavior.

Use per-install key material, private app-data storage and restrictive permissions. Export only the public root/profile. Certificate generation/provision/removal operations are native/loopback host-authorized capabilities, never public phone routes; exact authorization is implemented in the native bridge. Do not silently install trust, share a global private key, serve private keys, ignore TLS errors, accept certificate-warning bypass as success, or use security-disabling flags.

Explain the one-time phone trust setup, fingerprint check, expiration/address change, removal and touch fallback. Supply a sensor diagnostics page and standalone setup fixture. Apple manual trust and Android/browser behavior require actual device validation. A test CA accepted by a Node test is not proof of Safari/Chrome mobile sensor access. Runtime certificate tooling must be bundled/pinned/declared; no install-time dependency on a developer's Homebrew/Node/Terminal.

## 10. Integration evidence

The [GO7 report](archive/workstreams/gravity-orchard-go7.md) records how the components were assembled and tested. Use the [release guide](LOCAL_RELEASE.md) to reproduce the software checks or record physical sign-off. Compare input acknowledgments and applied ticks on the same clock. Measure home Wi-Fi and TV casting on the actual devices.
