# Party arcade implementation contract v0.1

Party play runs on the portable LAN host and the Mac host. The TV hosts a room for 2–16 phone controllers. The hosted collection lists party games as **Local host only**. A party room uses a separate in-memory authority. Stopping the host ends its parties. The two-seat API and SQLite store have their own lifetime and credentials.

## Join and round flow

1. On the TV, open **Party → Tap Race → Host on the TV**.
2. Each guest scans the QR code, or opens **Join a party** on the same host and enters the six-character code. They type a name, choose one of the free looks, and tap **Ready**. The phone joins and sends Ready as soon as the socket authenticates.
3. The TV can start when the selected game's minimum number of connected players are ready. Start locks the roster for a three-second countdown and one round. Players who become ready after this point wait for the next round.
4. The TV can remove a guest from the lobby wall. After a round, **Players** returns to that wall. A kick revokes the seat credential and frees the look. A disconnected phone keeps its name, look, readiness, and place in the current round for 30 seconds after the host sees the disconnect. A replacement socket uses the same seat and has its own input sequence.
5. The TV shows the podium and full rankings. **Next round** starts another round with the guests who are connected and ready. **Next game** appears when multiple party games are registered. It keeps the guests and opens the selected game's lobby.

Tap Race starts each runner at zero. Each accepted tap moves the mouse one step. The first input that brings a runner to 40 steps ends the race. If nobody finishes within 20 seconds, the furthest runners share first place. A race processes accepted inputs in host receipt order. Kicked or expired players lose their score eligibility and stop sending inputs. A runner on an away seat can still finish in the rankings while its seat is held.

## Routes and credentials

| Method | Path | Body or purpose |
| --- | --- | --- |
| GET | `/?party=join&code=ABCDEF` | Phone entry. Omit `code` to type one. This is the QR URL. |
| GET | `/?party=host&game=tap-race` | Start the TV flow. The client replaces this URL with `/?party=host&code=ABCDEF` after create. |
| POST | `/api/party/rooms` | Create a room. Body `{"gameId":"tap-race","requestId":"<random-retry-key>"}`. |
| GET | `/api/party/rooms/ABCDEF` | Look up one room. Reply `{"code":"ABCDEF","gameId":"tap-race","occupiedLooks":[0,4]}`. |
| POST | `/api/party/rooms/ABCDEF/join` | Create a seat. Body `{"name":"Pip","look":1,"requestId":"<random-retry-key>"}`. |
| GET upgrade | `/api/realtime/party` | Authenticated WebSocket on the same HTTP or HTTPS host. No query or subprotocol. |

Create and join return HTTP 201 with `{"code":"ABCDEF","token":"<opaque-token>"}`. Join includes `"playerId":"p1"`. The browser keeps these credentials in the private tab session. Put no credential or retry key in URLs, QR codes, logs, error messages, or game state. The first socket message carries the bearer. Reconnect sends that message with the same bearer. A room code alone grants only the public lookup.

Use 32–64 base64url characters for each random request key. The client generates 24 random bytes. Reuse the same key and normalized body if a response is lost. Identical requests return the same credential while the room or seat exists. A changed body returns `retry_mismatch`. Kicked or expired joins return `seat_lost` for the original key. The server retains hashed credentials and retry identifiers in memory. Names are normalized to NFC, stripped of Unicode control and format characters and line/paragraph separators, trimmed, and limited to 12 Unicode code points. Looks are exclusive integers 0–15.

POST requests use the host's existing LAN policy. Send exactly one same-origin `Origin` and one `Content-Type: application/json` header. The scheme, host, and port must match the listener's configured authority. WebSocket upgrades require that same exact Origin. Forwarding headers grant no authority. HTTP errors use `{"code":"look_taken","error":"That look is taken. Choose another."}` or the shared LAN error shape. Party routes reject queries.

## WebSocket messages

All application messages are JSON text. Authenticate first with the following shape. Replace the placeholder with the token returned by create or join.

```json
{"type":"auth","protocol":1,"code":"ABCDEF","token":"<opaque-token>"}
```

The first server message is `welcome` with the same projected `view` as a `snapshot`. `round` starts at 0. Each accepted start increases it. `phase` is `lobby`, `countdown`, `playing`, or `results`. `ms` is the time left in the countdown or round. `notice` can be `host_stall`, `time_limit`, or null.

### Phone snapshot

```json
{"type":"snapshot","view":{"phase":"playing","round":1,"ms":13900,"notice":null,"gameId":"tap-race","self":{"id":"p1","name":"Pip","look":1,"ready":true},"waiting":false,"state":{"distance":17,"target":40},"place":null}}
```

### TV countdown snapshot

```json
{"type":"snapshot","view":{"phase":"countdown","round":1,"ms":2900,"notice":null,"gameId":"tap-race","minPlayers":2,"players":[{"id":"p1","name":"Pip","look":1,"ready":true,"connected":true},{"id":"p2","name":"Juniper","look":2,"ready":true,"connected":true}],"roster":[{"id":"p1","name":"Pip","look":1},{"id":"p2","name":"Juniper","look":2}],"scene":{"target":40,"runners":[{"playerId":"p1","distance":0},{"playerId":"p2","distance":0}]},"results":[]}}
```

| Sender | Example | Effect |
| --- | --- | --- |
| Phone | `{"type":"ready","value":true}` | Set that seat's readiness. Use false to sit out the next round. |
| Phone | `{"type":"input","round":1,"seq":8,"input":{"kind":"tap"}}` | Send one input to the current round. `seq` is a strictly increasing nonnegative safe integer per socket. |
| Phone | `{"type":"clock-ping","id":0}` | Request a clock sample after authentication. `id` is a nonnegative safe integer. The reply is `{"type":"clock-pong","id":0,"serverAt":1234.5}`. |
| TV | `{"type":"start","round":0}` | Start from lobby or results using the last observed round number. Replays cannot start twice. |
| TV | `{"type":"kick","playerId":"p1"}` | Remove one seat. Repeating the same removal has no effect. |
| TV | `{"type":"select","round":1,"gameId":"tap-race"}` | Select a registered game from lobby or results. Set the lobby phase. |

The transport binds phone input to the authenticated seat. Invalid, duplicate, over-budget, or stale-round inputs have no effect. The phone receives shared phase/timer/notice events plus its own identity, projected state and final place. A waiting phone has `state:null`. The TV receives public seat status, the locked roster, the game scene and results with `{"playerId":"p1","score":40,"place":1}` entries. Keep secrets and raw input out of both projectors. TV-only scores or events stay in the TV projector. Administrative errors use `{"type":"error","code":"not_enough_ready","message":"Wait for more players to get ready."}`.

Close code 4403 means the credential or seat is gone. Close code 4409 means a new socket replaced this one. The browser stops reconnecting for these codes. It retries other network closes from 250 ms up to 2 seconds. Policy violations use 1008; oversize frames use the WebSocket library's 1009. A timed-out heartbeat closes with 4000. An oversized outgoing phone packet or backed-up sender closes with 1011.

## Limits and timing

| Limit | Value and reason |
| --- | --- |
| Seats and storage | 16 seats per room, 8 party rooms per process. Idle rooms with no connections are reclaimed after 30 minutes. 256 seat assignments per room bound revoked retry records. |
| Create attempts | Uses the LAN six-per-peer limit per 60-second window, with its own budget and up to 1,024 tracked peers. Loopback is exempt. |
| Transport admission | Uses the existing HTTP cap of 64 sockets with 8 reserved for loopback. The HTTPS listener has a 64-socket cap. A second shared admission gate allows 40 party upgrades across HTTP and HTTPS, with 4 reserved for loopback. It covers 17 active connections, 17 replacements, and 6 spare slots. There is one current connection per credential. |
| HTTP writes | 1,024 bytes for create and join. No game inputs over HTTP. |
| Socket messages | 512 bytes per incoming message, at most 8 fragments and 16 buffered chunks. No compression. Authentication must arrive within 5 seconds. |
| Rate | Each credential gets 30 messages/s with a burst of 12, including authentication and malformed application messages. A phone gets at most 20 input frames/s with a burst of 8. Budgets survive replacement. Command errors are limited to one reply per credential per second. |
| Clock replies | Each phone credential gets one clock reply per second with a burst of three. The host ignores invalid or excess probes. The reply uses the host's monotonic clock and the usual socket send limits. |
| Presence | The host pings every 5 seconds and disconnects after 10 seconds without a pong. After disconnect or initial unclaimed join, reserve that seat for 30 seconds. Replaced or closing sockets get 150 ms for the close frame before termination. |
| Send bounds | TV snapshots at up to 20 Hz. Phone snapshots at up to 5 Hz and 320 JSON bytes each. Close a sender with more than 16 KiB queued. The integration harness measures rolling 1-second phone traffic and asserts below 2,000 B/s during racing. |
| Simulation | One fixed 50 ms tick. For scheduler gaps through 1 second, run at most 5 catch-up ticks and discard any extra whole ticks. The round still uses its wall-clock deadline. A gap above 1 second returns active rounds to the lobby with `host_stall`. Clear queued input on that boundary. |

Limits live in [LAN admission](../server/lan.mjs), [party room authority](../server/party/rooms.mjs), [protocol](../server/realtime/party/protocol.mjs) and [round timing](../server/realtime/party/round.mjs).

## Game module

Register one object in [the server registry](../games/party/registry.mjs). Use a stable lowercase game ID. Party capacity is 16. Choose the range and maximum duration to match the game.

| Member | Contract |
| --- | --- |
| `id`, `minPlayers`, `maxPlayers`, `durationMs` | Registry key, player range and wall-clock play budget. If more eligible guests are ready than the game supports, take the first `maxPlayers` in seating order. |
| `createRound(players, seed, gameRound, match)` | Create private state from the locked `[{id,name,look}]` roster and server seed. The two optional arguments are the 1-based game round and the match context below. |
| `normalizeInput(input)` | Return a new bounded, canonical input or null. Validate exact keys, types and finite ranges. The runtime checks the envelope, active roster and socket identity. |
| `step(state, inputs, dt, context)` | Return next state. `inputs` contains ordered `{playerId,input,receivedMs}` records. `receivedMs` is the host’s time since the start of play when it accepted the input. `dt` is 50 ms. Optional `context.departures` lists permanent seat removals for this tick. `context.elapsedMs` is the host’s time since the start of play at this tick, rounded to the 50 ms grid. It can advance by more than one tick after a short stall. |
| `projectForPhone(state, playerId)` | Return only that player's safe JSON state. Fit it inside the 320-byte packet limit, including the envelope and a maximum-length name. |
| `projectForTv(state)` | Return the complete scene the TV may show. Exclude hidden information even if it would be convenient for rendering. |
| `isRoundOver(state)` | Return true when the game ends by its own rules. The platform can also end at the wall-clock deadline. |
| `scores(state)` | Return `[{playerId,score}]` in best-first order. Use finite numeric scores. Equal scores share a place. |

- `gameRound` counts accepted starts since room creation or the last explicit game selection. A host stall consumes its start number. `match` contains `{roomRound, gameId, startsAt, previousResults}`. `roomRound` is the room-wide sequence in socket snapshots. `startsAt` is the scheduled end of countdown in host-monotonic milliseconds. `previousResults` is a copy of the last completed round's ranked `[{playerId,score,place}]`, or an empty array after room creation or game selection. A completed round may have gaps in its roster compared with a new round.
- `context.departures` is an array of `{playerId, reason}` in removal order. `reason` is `'kicked'` or `'expired'`. Apply departures before simulating the tick, for example by removing bodies and collision shapes. The host drops pending inputs from those seats and delivers each departure once on the next simulation tick. A countdown removal arrives on the first play tick. An ordinary disconnect or replacement sends no departure. The original TV roster stays available for identity and layout.
- Record the seed, round context, tick context and ordered input records for deterministic replays. Games with a host-clock schedule should use `context.elapsedMs` and `receivedMs` so discarded ticks do not shift that schedule. `match.startsAt` stays on the host clock.
- The phone projector can use the third argument `{now, tickAt}` to anchor cues to the host’s monotonic clock. `now` is the projection time. `tickAt` is the wall-clock position of the most recent simulation tick, or the scheduled start during countdown.

## UI kit

- `createArcadeLoop(draw, onMotionChange)` runs one TV animation loop. It combines the OS preference with `setReducedMotion(value)`. Call `dispose()` on phase exit or replacement.
- `createTimeline({intervalMs})` accepts `push(scene, roundKey, arrivalTime)`. Call `sample(now, interpolate, reduced)` to draw between the previous and current scenes. Define `interpolate(previous, current, amount, lerp)` for your scene. It never extrapolates, and a new round key clears the previous scene.
- `compileSprite(document, rows, palette)` compiles a letter grid with transparent dots. `drawSprite(ctx, sprite, x, y, scale, scaleY)` rounds positions and scales to integer pixels and turns smoothing off. [Shared looks](../ui/party/looks.mjs) provide `runner`, `portrait`, `badge`, and `cat`.
- `compileStack(document, layers, palette)` takes equal-size letter grids, bottom first. It returns native slice canvases, width, height and depth. Compile each look on demand with the same grids and a different palette.
- `drawStack(ctx, stack, x, y, {angle = 0, scale = 1, sliceGap = 1, shade = true} = {})` anchors the model at its ground centre. Angle is in radians. Scale rounds to a whole pixel. Each slice rises by `sliceGap * scale` screen units before the host transform. The first draw bakes a shadow and the slices into a frame. Later draws copy one bitmap. Each palette variant retains up to 64 frames in insertion order across 32 headings, scales, gaps and shading settings. Use small art grids and a fixed set of looks and scales. The kit has no idle animation. Callers freeze decorative spin, bobbing and light changes under reduced motion.
- `fitSpriteScale(sprite, playerCount, area, {columns, gap} = {})` returns the largest whole-number scale that fits equal cells in `area`. Pass native sprite `{width,height}`, area `{width,height}`, and an optional gap in the same units as the area. Set `columns` to use a fixed grid. With no column count, the helper tries all layouts. It returns 0 when the sprites cannot fit at scale 1. At 1920×1080, keep the visible height of each player character at least 64 CSS px for TV viewing from 3 m. Count opaque pixels after any canvas scaling.
- The TV shows a slim game name, round, timer and menu during countdown and play. The menu holds Settings and End party. The stage spans the viewport below the bar. Implement optional `resize({width, height, safe})` on the TV renderer to receive the full stage size in CSS pixels. The frame calls it before the first active `push` and when the stage changes size. `safe` is a canvas-relative `{x,y,width,height}` rectangle with about 3% overscan clearance at the TV sides and bottom. The bar clears the top edge. Keep characters, targets and labels in `safe`. Adaptive games set their canvas size and may paint background through the full stage. Fixed-size games use aspect-fit within the shared safe area. The lobby and podium use the original frame.
- `createJuice()` provides `impact({x,y,colour,label,id,time,strong})`, `frozen(time)`, `offset(time)`, `squash(id,time)` and `draw(ctx,time)`. Clear it at round boundaries. Forward the combined reduced-motion value through `setReducedMotion` to clear and suppress effects. Derive effects from a new scene change, not each redraw.
- `createSoundHooks(sound, cues)` maps a game event name to an existing audio effect cue. Call it from the TV. Use the host's gesture, music, effects, and volume controls. Phone modules have no audio hook.
- Phone controls live in [controls.mjs](../ui/party/phone/controls.mjs). Use `mountButton(root,{label,onPress})`, `mountStick(root,{label,onInput})`, `mountSlide(root,{label,onInput})`, or `mountTilt(root,{onInput})`. Stick and tilt report `{x,y}`; slide reports a scalar. Axes range from −1 to 1. Analog changes coalesce at 50 ms. Tilt needs a secure context and uses a visible permission button. Touch remains active until a valid sensor sample arrives. The user can return to touch at any time. Add game-specific stale-input handling for continuous controls. Every widget has `setEnabled(value)` and `dispose()`.
- `serverNow()` in the phone mount options returns estimated host-monotonic milliseconds, or `null` until the first accepted sample. Each connection takes up to three samples, one at a time, and repeats the set 30 seconds later. The kit rejects round trips of 350 ms or more and uses the lowest round trip in each set to estimate the host time at the midpoint. Error is approximately half the difference between the outbound and return delays, plus clock drift between samples. An estimate can shift on refresh or reconnect. Use a host clock anchor such as `match.startsAt` in the game projection when needed. Validate claimed input timing against authoritative game state and allow for network and display delay.

### Ink figures on TV and phone

Import from [ink.mjs](../ui/party/kit/ink.mjs). Use one canvas transform to fit the design area to the display. Figure dimensions and stroke widths scale together.

- `drawPaper(ctx, area)` fills a rectangle with dotted cream paper. Use `{x,y,width,height}` for all areas. Cache static paper when redrawing the board. `drawGround(ctx,left,right,y,seed=0)` draws a fixed wobbly baseline. `inkShape(ctx,fill,width)` fills and outlines the current path. `palette` supplies paper, dot, ink, far, goon and butter colours.
- Start with `P.stand`, `ready`, `crouch`, `leap`, `cheer`, `wince`, `phew` or `punch`. Use `mk(overrides,base=P.stand)` for a new pose. Treat shared poses and coordinate pairs as read-only. `pathPose(poses,fraction)` samples a nonempty path. `new Actor(pose)` starts a queue. Call `push({pose,d,ez}, {path,d}, {fn})` with the steps you need. Durations and `update(dt)` use seconds. Read `pose` or `idle`, and use `clear()` to cancel. Easing supports soft (default), lin, in, out and io.
- `drawFigure(ctx,actorOrPose,x,y,options)` faces right, with standing feet near local y = −8. Options include `scale`, `lw`, `flip`, `goon`, `look` (seat look index or shared look object), `badge`, and `style`. The default is chunky. Other styles are classic, doodle, doodleshirt, sketch and googly. Each look adds a coloured headband. Use `seed` and explicit `time` in milliseconds for sketch lines. Pass `reducedMotion` to suppress sketch redraw and breathing. The return value includes head, chest, hip and hand positions in figure space.
- `layoutNameTags(count,area,columns?)` returns one rectangle per roster slot, in row order. Use fixed seat order across frames. `drawNameTag(ctx,name,look,rect)` fits the name and badge to the slot. `playerLook(indexOrLook)` resolves the shared look and `drawBadge(ctx,look,x,y,size)` draws its pattern.
- `drawPopup(ctx,text,x,y,area)` fits a message within the safe area. `createInkEffects()` provides `impact({x,y,colour,label,time,strong})`, `offset(time)`, `draw(ctx,time,area)`, `setReducedMotion(value)` and `clear()`. Use milliseconds. Apply the shake offset to the world, restore the transform, then draw effects. Forward the combined motion preference. Reduced motion keeps static messages and suppresses particles and shake.

The figure renderer and drawing helpers adapt [goofyfish](https://github.com/nilbuild/goofyfish) under its [MIT license](third-party/goofyfish-LICENSE.txt).

## Add a party game

1. Implement the server module and add it to [the party registry](../games/party/registry.mjs). Add a replay test with a fixed seed, tick log, scoring, and end conditions.
2. Add a `category: 'party'`, `status: 'local-only'` card to [the collection catalog](../games/catalog.mjs). Keep the legacy engine registry independent.
3. Register `mountTv(canvas,{art,sound})` and `mountPhone(root,{input,serverNow})` in [the UI registry](../ui/party/games/registry.mjs). The TV returns `push(view)`, optional `resize(playArea)`, `setReducedMotion(value)`, and `dispose()`. The phone returns `update(state,enabled,{practice,round})` and `dispose()`. Set `practiceWhileWaiting: true` on the renderer to show local practice controls while a phone waits for the next round. `round` gives the room-wide round number. Shared frames handle join, countdown, results, and navigation.
4. Add the TV, phone, and server files to [party-delivery.mjs](../server/party-delivery.mjs) and [the desktop manifest](../desktop/runtime-manifest.json). Run `node scripts/prepare-game.mjs` and `npm run package:lan` using the pinned release toolchain. Verify the static and portable closures.
5. Call `runPartyRounds(t,{gameId,drive,assertResults})` from [the shared harness](../tests/party/harness.mjs). Provide a legal per-tick driver and scoring assertions. Exercise 2, 8, and the game's maximum supported seats where applicable. Use `launchPartyHarness` directly if the game needs a different round flow.
6. Verify that phone packets exclude every other player's private fields and remain below the bandwidth cap. Run Chromium at 1920×1080 for the TV and 390×844 for the phone. Inspect countdown, play and podium screenshots. Check reduced motion, console output, CSP, route responses, and frame time.

### Use the shared round harness

`runPartyRounds` uses real LAN sockets and an injected clock. It connects and replaces every seat, disconnects and restores a phone, then kicks the last phone and adds a late guest. It checks that the late guest waits for round two. The optional `playerCount` defaults to 16. Supply a value in your game's supported range. `drive(phones, tick, round, tvView)` runs before each 50 ms tick of play. Use `phone.input(gameInput)` to send a game input with the correct round and sequence. `assertResults(tvView, phones, round)` runs after each round. Use each phone's `view` and `packets` to check projections and downstream size.

`partyPlayTicks(game)` gives the play wait budget from `game.durationMs`, plus 10 ticks for result delivery. It defaults to 500 ticks (25 simulated seconds) if the duration is missing or invalid. `launchPartyHarness().until(predicate)` also accounts for countdown and keeps a minimum budget of 500 ticks. Supply `{ticks}` to override it. Each tick advances the injected clock.

See [the Tap Race test](../tests/integration/party/tap-race.test.mjs) for both the driver's input pattern and the rolling one-second traffic check.

## Contract changes after review

- The TV can send the optional command `{"type":"end"}` in any phase. The host immediately releases the room and closes its authenticated sockets with 4403. This command has no fields other than `type`.
- Party admission also caps non-loopback peers at four simultaneous upgrades (including unauthenticated and closing sockets), two open room creations, two held phone seats per room, and 16 seat assignments per room. Join attempts are limited to 24 per peer per 60 seconds. A capacity response has HTTP status 429. Budgets apply across HTTP and HTTPS. Reconnect still uses the existing bearer and no IP binding.
- Authentication counts toward the credential's message budget. Administrative error replies share their one-per-second budget across replacements. Snapshots keep the same layout and send limits.
- The round harness accepts optional `playerCount` and supplies `round` as the third driver argument. Existing harness calls, game modules and UI kit calls use their original signatures.
