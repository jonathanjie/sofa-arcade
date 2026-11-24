# Gravity Orchard — v0.2 product and game design

**Status:** implementation brief; not implemented or enabled by this document. **Catalog ID:** `gravity-orchard`. **Mode:** real-time cooperation for two players. **Target session:** 6–10 minutes, plus optional practice. **Design version:** `0.2`.

This version supersedes the [archived v0.1 turn-based rivalry](../archive/games/gravity-orchard-v0.1.md). Do not combine that draft's planting turns, ownership scoring or discrete 5×5 settling rules with this game. Jon asked for a less turn-based game that uses phone motion. Both players now steer at the same time toward a shared result.

Read [the implementation contract](../GRAVITY_ORCHARD_CONTRACT.md) and [the seven-stream dispatch plan](../archive/DISPATCH_GRAVITY_ORCHARD.md) before writing code. The contract owns exact API signatures, wire schemas, file ownership and compatibility rules. This PRD owns the player experience and starting rules. Resolve an inconsistency explicitly instead of implementing a private interpretation.

All durations, rates and difficulty values below are initial engineering/design hypotheses. No physical-phone playtest, human balance result or measured home-network latency is claimed.

## 1. The game in one paragraph

Lala has ordered an extravagant picnic. Jon and Lydia each hold one half of a floating orchard: tilt a phone to send fruit rolling through your own garden, pass fruit across the connecting bridge, and fill the shared picnic orders before teatime. A large Brake button steadies your fruit when a handoff becomes awkward. The challenge is to anticipate the next recipe, choose safe or short routes and communicate about incoming fruit. Misses become compost rather than eliminating a player. After three short orchards, celebrate the harvest and try the same seed or a new one.

## 2. Product goals and boundaries

The game should give both people continuous, visible responsibility. Each controls a full two-dimensional tray, rather than one person owning only the horizontal axis of a single ball. Passing fruit across the bridge becomes a useful cooperative action.

The normal experience is seated play while looking mainly at the TV. Gentle tilting and a thumb button must be sufficient. Vigorous shaking, throwing gestures, precise compass headings and fast repeated taps are outside v1.

The game belongs in the existing Sofa Arcade repository and collection, using the local Tauri Mac host and ordinary phone browsers. Preserve Sofa Kingdoms and Odd Laws Society. Do not create a replacement Site, cloud authority, external account requirement, online leaderboard or separate mobile app as the default path.

Touch controls are a complete supported way to play. Tilt becomes available only when the browser has a working secure context, permission and live sensor readings. The interface must distinguish those conditions instead of treating an API name or a granted permission as proof of working hardware.

Keep ordinary TV and phone screens spacious. Explanations belong in setup, the optional tutorial and Help. Phone audio starts quiet; music and game effects belong on the host. Preserve independent music/effects preferences, gesture-based unlocking and reduced-motion settings.

### Not in v1

- Competitive scoring between Jon and Lydia, hidden actions, drafting or turn rotation.
- A general rigid-body sandbox, stacking, fruit-to-fruit pile physics or destructible terrain.
- Procedural terrain that has not been validated for reachable routes.
- An upgrade tree, persistent currency, inventory management, combat or a level editor.
- Mandatory shake/flick gestures, haptic dependencies or sensor-only controls.
- Automatic trust installation, certificate-warning bypasses or browser-security flags.

## 3. Board, baskets and control regions

Use a fixed **1280×720 logical world**, scaled to the available TV play area without changing physical coordinates. The world contains a left garden tray for Jon and a right garden tray for Lydia, joined by a central bridge. GO1 owns the exact authored collision geometry and its public representation. Decorative images are not collision maps.

Each tray responds to that player's two-dimensional normalized input. The frame and labels remain visually stable. Small decorative rocking, leaning characters and force arrows may communicate tilt, but do not spin the entire TV interface or silently rotate the coordinate system.

Fruit crossing the central bridge passes continuously from one player's influence to the other. Blend the two force fields across the authored bridge region; do not switch acceleration discontinuously at one arbitrary pixel. The public geometry identifies the blend region so the TV can explain the handoff with a subtle outline or glow.

Four permanent destination baskets are divided as follows:

| Player's tray | Basket | Fruit ID | Non-colour distinction |
| --- | --- | --- | --- |
| Jon, left | Apple basket | `apple` | Round apple silhouette and leaf |
| Jon, left | Plum basket | `plum` | Oval plum silhouette and split-leaf emblem |
| Lydia, right | Pear basket | `pear` | Pear silhouette and tapered neck |
| Lydia, right | Starfruit basket | `starfruit` | Five-point cut-face silhouette |

Baskets and fruit use matching silhouettes, labels and patterns as well as colour. They are team destinations, not individually owned points. A concise character badge identifies which player can steer the surrounding region.

Correct fruit entering its basket is captured and removed from the active world exactly once. A wrong basket or a full basket rejects the fruit with a bounded, visible bounce. It must not secretly discard fruit, accept the wrong type or produce a reward event.

A compost opening removes a fruit exactly once and records it as composted. Stage one has no compost openings. Later stages use clearly marked openings with generous approaches; decorative shadows must not masquerade as holes.

## 4. Inputs and Brake

Both players act simultaneously. Each phone supplies a continuous `x`/`y` vector in `[-1, 1]` and a held `brake` boolean. The network layer obtains the player identity from the authenticated connection, not from a claimed actor field in the payload.

The **Brake** control is large enough to hold with a thumb while watching the TV. While held, the tray stops applying its ordinary tilt force and strongly damps the velocity of fruit in its region. Releasing restores ordinary steering. The first implementation has no brake charge, cooldown or hidden stamina. The stage clock keeps running while Brake is held, so stopping forever cannot complete orders.

Brake is a continuous state rather than a rapid fire-and-forget command. Lost release messages must not cause an old command to remain authoritative indefinitely. Input expiry, reconnect epochs and pause transitions are specified in the contract.

Use comfortable neutral-position calibration rather than demanding a perfectly flat phone. Ask the player to hold the phone naturally, obtain stable readings and show which movement maps to each axis. Relative orientation is sufficient; compass/magnetometer heading is unnecessary. Screen-orientation changes deliberately pause for recentering and a tested axis remap, never unexpectedly reverse control.

Touch mode supplies the same normalized vector from a large thumbstick or drag pad. It retains the same Brake button and authority rules. A keyboard fixture is required for development and accessible local practice; it must not become a separate easier ruleset.

## 5. Orders, basket buffers and fruit supply

One recipe is active. Show the next two recipes in a compact queue so the team can prepare without filling the screen with every future instruction. Each basket buffers at most **three fruit** of its own type.

On a valid capture, add the fruit to its basket buffer. If the active recipe is satisfied, consume exactly its ingredients, record that recipe once and make the next one active. Repeat this bounded check if already buffered fruit also satisfies subsequent recipes. At most the four recipes in this stage can resolve. Do not create an unbounded event loop or award the same recipe again on retries/reconnect.

The starting four-recipe set is:

| Recipe ID | Apples | Plums | Pears | Starfruit | Total |
| --- | --- | --- | --- | --- | --- |
| `apple-picnic` | 2 | 0 | 1 | 0 | 3 |
| `plum-picnic` | 0 | 2 | 0 | 1 | 3 |
| `sunlit-mix` | 1 | 0 | 1 | 1 | 3 |
| `moonlit-mix` | 0 | 1 | 1 | 1 | 3 |
| **Stage demand** | **3** | **3** | **3** | **3** | **12** |

Every recipe needs both sides. Stage one uses this displayed order. Stages two and three may use a seeded permutation of the same four recipes; the selected sequence is public and stable for a same-seed retry.

Each stage has a seeded queue of **six four-fruit bags**: one apple, plum, pear and starfruit in each bag, for 24 fruit in total. Within every bag, exactly two deliveries begin locally and two begin across the bridge, including one cross delivery in each direction. An implementation can choose one of Jon's two fruit types and one of Lydia's two fruit types to spawn on the opposite tray, then shuffle the four entries deterministically. This provides two spawns per tray per bag and prevents a shortage in the scheduled type counts; route and control feasibility still require validation.

Starting spawn cadence is **210 ticks at 60 Hz**, or 3.5 seconds. The first spawn occurs when active play begins after the countdown. There may be at most **eight active fruit**. If the world is full, defer the next entry without consuming it; do not accumulate a burst of missed spawns. After a deferred spawn succeeds, schedule the next spawn from that actual spawn tick.

Fruit still in the queue when the stage ends is unspawned, not composted. Fruit in the world or a basket at stage end is accounted for as remaining, not silently converted into completed recipes. A conservation report must distinguish unspawned, active, buffered, consumed-in-orders, composted and remaining-at-end fruit IDs.

### Supply and timing feasibility

The six bags supply six of every type against a demand of three of every type. The first three complete bags already contain every required ingredient. There are four crossing assignments per bag (choose one of two Jon types and one of two Lydia types) and 24 orders of those four entries: **96 valid bag layouts**, each with two spawns per tray and one crossing in each direction.

With no capacity deferral, fruit 12 appears at **38.5 seconds**, leaving **51.5 seconds** before the deadline; fruit 24 appears at **80.5 seconds**, leaving **9.5 seconds**. A delivery into a basket removes a fruit from the active count even before a recipe consumes it. To spawn the first twelve on schedule under the eight-fruit limit, at least one fruit must have left the active world by the ninth spawn at 28 seconds, and at least four by the twelfth spawn. A deliberately held backlog can therefore reduce the remaining supply window.

An independent inventory check during design enumerated all 24 orders within each of the first three bags against all 24 recipe permutations: **331,776 combinations**. Assuming immediate successful delivery of each entry, every combination completes all four recipes and needs no per-type buffer larger than three. This establishes inventory consistency, not physical route solvability, simultaneous-control difficulty or a human playtest. GO1 must retain a reproducible check and demonstrate reachable baskets and full-stage completion through real normalized inputs on its authored geometry. GO7 must assess difficulty with the integrated controls; the 9.5-second final reserve is not a guarantee that a late replacement fruit is recoverable.

## 6. Run structure and results

A standard harvest run has **three authored stages**, each with **90 seconds / 5,400 active simulation ticks**. A stage finishes as soon as all four recipes are complete, or when its active timer expires. Paused time and the initial countdown do not consume the stage budget.

Interludes are untimed. Both players confirm readiness before a three-second countdown. Clear active fruit, buffers and latched controls between stages. Retain completed-stage results, controller preferences and calibration where still valid. Any change requiring recalibration is shown explicitly before readiness.

Players are never eliminated. A timeout still advances to the stage result and then the next orchard. Suggested stage stars are:

| Completed recipes | Stars |
| --- | --- |
| 0 | 0 |
| 1–2 | 1 |
| 3 | 2 |
| 4 | 3 |

The final screen shows completed orders out of twelve, stars out of nine and composted fruit. A **Perfect Picnic** badge requires all twelve recipes and no compost. Treat time remaining as a secondary descriptive result, not an incentive to delay an otherwise completed recipe for farming points.

During interlude or finished, the host may retry the **most recently completed stage**. Discard its result, retain earlier stage results, restore that stage's deterministic seed/recipe sequence, and return to waiting for both players. Reset its clock, queue, buffers and live fruit; fence obsolete presentation/input work with a new run epoch. Never reuse event IDs within the same match. A same-seed whole-run rematch or fresh-seed run is available to the host when paused or finished; GO2 allocates a new match identity and calls the engine constructor even when the seed is reused. There is no persistent currency, unlock system or leaderboard in v1.

Provide **untimed practice** using the same core controls and physics, with the deadline and Lala gusts disabled. Use the contract's `mode: 'practice'`; do not introduce independent stage-unlock or hazard-option APIs. The host can restart through the normal rematch path. Practice cannot write normal-run records or secretly modify a live match; the tutorial's separate scripted fixture is not a campaign checkpoint.

## 7. The three authored stages

### Morning Delivery — `morning-delivery`

Use broad routes, soft bumpers and a generous bridge. There are no compost openings or Lala gusts. This stage teaches independent tray control, Brake, recipe buffers and bridge handoffs. The first tutorial deliveries are scripted in an isolated practice fixture, not by rigging a live match's seed.

### Switchback Grove — `switchback-grove`

Introduce hedges and two meaningful routes: a longer safe path and a shorter path beside clearly marked compost openings. Add one forecast bridge gate. Starting schedule: six seconds scheduled open, three seconds scheduled closed, repeating in active simulation time.

A gate must defer closure while any fruit overlaps its collision region. It closes when the region clears and the schedule still requests closure. Never crush, teleport or forcefully eject fruit to match the timer. Show an about-to-close/blocked cue. Exact route and gate geometry are authored and tested by GO1, then consumed by the renderer.

### Lala's Moonlight Picnic — `moonlight-picnic`

Lala announces a directional gust **three seconds** before it arrives. Starting schedule: gust starts at active seconds 22.5, 45 and 67.5; each lasts **1.5 seconds**. Directions come from a seeded rotation of a fixed cardinal sequence and are revealed by the forecast. No surprise camera shake is required.

The gust applies a bounded extra force to both trays. Brake suppresses ordinary tilt and reduces the gust response, with its exact coefficient documented in the engine's public tuning data. Players can prepare a handoff, finish a delivery or stop safely, rather than merely reacting at the last instant.

This stage may combine already learned routing and gate ideas, but must retain a reachable safe route and generous warning. The first release should contain three complete polished stages rather than many untested maps.

## 8. Physics and simulation requirements

Use a small deterministic two-dimensional model: circular fruit against authored static walls, bumpers, basket mouths, compost openings and the bridge gate. Fruit-to-fruit pile collisions are outside v1. Overlapping fruit may separate visually with a small cosmetic offset; that visual must not alter authoritative coordinates or scoring.

The initial simulation budget is a fixed **60 Hz**, at most eight active fruit, and **220 logical units/second** maximum fruit speed. The contract fixes position/velocity and normalized-input rounding at 1/10000 after its specified validation steps. GO1 chooses and records acceleration, damping, restitution, radius, collision substeps and event-order constants within those requirements. Keep tuning in one versioned public record so controller previews and TV effects describe the same behavior.

The host advances exactly one engine tick at a time during countdown or playing. Only playing consumes stage time; waiting, paused, interlude and finished do not advance ticks. The tick remains monotonic within a match across stages and resumes. Do not accept a client-provided delta time, collision result, fruit position, score or stage time. No wall clock or `Math.random()` belongs in pure game logic. Seed all stochastic choices and make collision/entity iteration order stable.

Define how corners, repeated contacts, overlapping starting fixtures and a gate waiting to close resolve. Bound the number of collision iterations per tick and provide a safe finite resolution. High-speed motion must not tunnel through a thin wall or basket mouth. A preview/debug harness should expose geometry, forces and entity IDs without changing the game rules.

## 9. Real-time control and recovery

The exact protocol is owned by the implementation contract. Its input frame includes `type: 'input'`, the current match and run/controller epochs, an increasing sequence number, the last host tick observed by the controller, finite normalized `x`/`y` values and a boolean `brake`.

Initial rates are **20 input updates/second** and **20 public snapshots/second**, with 60 Hz simulation and display-frame interpolation. These are starting values to measure, not a claim of a particular phone-to-TV latency. Keep only the latest unsent input; do not build a queue of obsolete tilt commands. Authority validates freshness, sequence, epochs and payload size before updating its accepted input.

The observed-host-tick field prevents a delayed network backlog from being treated as fresh simply because it has just arrived. Reject future host ticks and stale input according to the contract. Client timestamps are diagnostics, not trusted freshness authority.

Initial connection behavior:

- After 250 ms without a valid accepted input, use neutral tilt plus Brake for that player.
- After two seconds of sustained controller loss, pause the shared run.
- A hidden/locked phone stops sensor capture and attempts an immediate neutral/Brake update and pause request; host expiry remains necessary because page shutdown delivery is not guaranteed.
- Pause, resume, stage changes, restoration and restart clear input latches and fence earlier input with the contract's epoch mechanism.
- Resume requires both players to be ready and a fresh countdown. An old socket or delayed pre-pause frame cannot move fruit after resume.

Keep continuous input and periodic simulation snapshots separate from the existing durable turn-action/CAS path. The discrete command kinds are `ready`, `pause`, `retry-stage` and `rematch`; resume is both players becoming ready, not a separate wire command. Host and player capabilities follow the contract. System network/stall/recovery pauses use the trusted `pauseForSystem` engine seam, never a client-forged system command. Preserve the authority and credential rules of the two existing games.

GO2 owns checkpoint mechanics; GO1 supplies serializable deterministic state. Document the checkpoint interval and recovery boundary. After a host restart, restore paused from the last durable safe checkpoint, require controller reconnect/readiness and do not simulate all elapsed sleep time. Do not promise zero rollback of every ephemeral tick unless the implementation actually establishes it.

## 10. Secure motion setup

Ordinary `http://<Mac LAN address>` must remain a supported touch-control route. It is not a reliable phone-motion origin. Motion/orientation delivery requires a secure context and working sensor permissions; a phone's localhost exception does not make a remote Mac's private IP a secure origin. Some browsers require a permission request made directly from a user gesture. Receiving a granted permission does not prove that usable readings arrive.

The planned local motion route is an **optional trusted HTTPS/WSS gateway**. Its one-time phone certificate-trust onboarding is explicit, and certificates/keys are generated per installation rather than committed or shared across users. Keep private keys and credentials out of public routes, QR codes, logs, screenshots and artifacts. The optional gateway must not break the existing HTTP host or games.

No cloud relay, Internet-dependent controller page, browser security flag, wildcard trust bypass or ignored certificate error qualifies as the default offline-motion implementation. If real phone trust/permissions/readings cannot be checked in the available environment, state that limit and preserve the complete touch experience. Do not mark a synthetic browser sensor test as a physical-phone pass.

Primary technical references for this constraint:

- [W3C Device Orientation and Motion](https://www.w3.org/TR/orientation-event/): secure-context delivery, permissions and active/visible-document requirements.
- [MDN DeviceOrientationEvent.requestPermission](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static): transient user activation and browser availability.

These sources support the browser constraint. The gateway architecture and its enrollment flow are project design decisions to validate, not capabilities established by those sources alone.

## 11. Screens, tutorial and accessibility

### TV

The orchard fills the available play area at 1280×720 and 1920×1080. Keep the active recipe, next-two preview, time/stage progress and player connection/readiness compact. Basket buffers show fruit counts with silhouettes. Force/Brake cues make control ownership legible without a permanent paragraph of instructions.

Use public state only. Interpolation may smooth known authoritative positions but must not invent a basket capture, completed order, collision or score. Reconnect snapshots replace obsolete trajectories. Stable event IDs prevent repeated rewards, sounds and celebrations.

### Phone

Show player identity, compact connection/input-mode status, Brake, pause and recenter access. Touch mode gets a large steering surface. Motion mode gets a small live tilt indicator and generous Brake area. Keep primary controls at least 48 CSS pixels high and verify them at 360px and 390px widths.

Show setup states for insecure origin, permission needed, permission denied, unavailable API, granted-but-no-readings, calibration, ready, disconnected and paused. Each has a usable next action. Never strand a player behind a permission prompt loop.

### Tutorial and Help

Provide a short optional guided practice covering: natural grip/recenter; steer your own tray; Brake; pass fruit across the bridge; match a basket; fill a recipe; recognize compost/gate/gust cues; pause and reconnect. Controller sensor permission/calibration belongs to GO3. GO4 owns TV/tutorial presentation and isolated practice fixtures. GO7 wires the shared entry point.

Tutorial fixtures cannot mutate a live room or silently change a normal seed. Opening Help or recentering during an active match requests a shared pause; resumption follows the normal readiness/countdown path.

Support touch, keyboard practice, reduced motion, colour-independent symbols, readable contrast and non-audio warning cues. Optional vibration is supplementary only. Do not make high-precision tilt or sound perception a prerequisite to completing a run.

## 12. Art, animation and sound direction

Use the established warm illustrated Jon/Lydia/Lala identity from current repository assets. The orchard adds suspended wooden garden trays, soft foliage, picnic baskets and expressive fruit. Inspect the existing delivered character assets before inventing a different character design.

A wide cover should communicate two connected gardens, both players cooperating, rolling fruit and Lala's picnic. It must remain legible as a collection thumbnail. Keep title typography as a separate UI layer so it stays sharp and localizable; decorative art must not contain baked-in instructions.

Required motion vocabulary includes gardener idle/lean/brace/cheer, Lala idle/forecast/gust/pleased, fruit roll/soft impact/capture/compost, and basket acceptance/rejection/full. These may combine real sprite states with code-driven transforms, but are actual reusable deliverables, not a mood board. Reduced motion keeps outcomes and cues clear.

The score must be composed: a recognizable returning melody, harmonic movement, phrasing, rests, a contrasting section and a deliberate loop transition. A light plucked/marimba/woodwind palette can suit the orchard, with sparse host-menu/practice, ordinary play, final-stage and results arrangements. Avoid random note selection and excessive layering.

Deliver music through the existing shared scheduler contract, not a second AudioContext or timer loop. Host-only defaults and independent preferences remain intact. Event cues are restrained, deterministic and deduplicated by event identity. A missed fruit should sound gently comic rather than punitive.

## 13. Acceptance and completion

### Rules and engine

- Replaying the same normalized input and command transcript from the same seed, initial match identity and options produces the same state/events under the documented deterministic contract. Same-seed rematches deliberately receive a different match identity.
- Every fruit ID is conserved across the queue, active world, buffers, consumed recipes, compost and stage-end remainder.
- All basket combinations, buffer caps, recipe chains, spawn deferrals, stage timeouts, successful finishes, retries and rematches are covered by hand-checked fixtures.
- Collision fixtures cover walls/corners, bridge handoff, thin obstacles, gate closure overlap, compost edges and maximum speed; no NaN, unbounded speed or unbounded collision loop.
- Pause and countdown do not consume active stage time; stale controls cannot survive lifecycle boundaries.

### Input, platform and UI

- Two authenticated controllers steer different regions while the host remains read-only for continuous steering.
- Unknown/oversized/nonfinite/future/stale/old-epoch input cannot change the simulation. Rate and buffer bounds are exercised.
- Permission denial, insecure context, no readings, orientation change, backgrounding and reconnect retain a clear supported path to touch or recovery.
- Full three-stage rendered journeys include handoffs, buffered recipes, hazards, timeout, perfect/ordinary results, same-seed rematch and reduced motion.
- The TV fits at 720p and 1080p; narrow phones retain all primary controls without hidden overflow.
- Tutorial/help/calibration flows are isolated or pause the match correctly. Browser screenshots are inspected rather than merely generated.

### Media and delivery

- All declared final assets exist, decode, have dimensions/alternatives and render in a gallery; no placeholder status is treated as finished art.
- Scores/cues are finite, deterministic, bounded and compatible with the current scheduler. Offline rendering and listening checks are reported separately.
- Production, LAN, portable and native inventories include exactly required runtime files and exclude private keys, credentials, test fixtures, source-art working files and development dependencies.
- Sofa Kingdoms and Odd Laws regression journeys continue to pass.
- Final acceptance distinguishes browser fixtures, two real rendered controller contexts, matching-architecture macOS CI and physical phone/Wi-Fi/TV/speaker checks. No one substitutes one category for another.

The seven streams deliver tested PRs. GO7 integrates exact reviewed component heads, runs combined browser/native/package acceptance and opens the final PR. Do not enable the game from a partial scaffold or claim fully validated phone tilt from touch-only/emulated evidence. No stream self-merges or deploys unless separately authorized.

## Appendix: public presentation data and ownership

This game has no secret player information. Public presentation needs the current phase/stage, match/epoch/tick identity, active time, both tray forces and Brake states, authored geometry, fruit IDs/types/positions, basket capacities/buffers, active/preview recipes, forecast hazards, player connection/readiness, stable event IDs and results. Do not include credentials, private certificate material, raw sensor recordings or internal socket handles.

The exact public-view object and mount arguments are defined in `docs/GRAVITY_ORCHARD_CONTRACT.md`; this semantic list is not an alternate schema. The exact phases are `waiting`, `countdown`, `playing`, `paused`, `interlude` and `finished`. Presence belongs to the coordinator's snapshot envelope; calibration/permission details belong to the phone component. Public events use the contract's stable IDs and bounded recent ring, never a private state or full future supply dump.

| Owner | Core runtime exports/files |
| --- | --- |
| GO1 | `games/gravity-orchard/engine.mjs`; browser-safe `catalog.mjs`, `geometry.mjs`, `public.mjs`; safe projected fixtures |
| GO2 | `server/realtime/gravity-orchard/**` and `ui/realtime/gravity-orchard/**`; transport/session/checkpoint factories |
| GO3 | `ui/games/gravity-orchard/phone/**`; phone view, motion permission/calibration, touch fallback |
| GO4 | `ui/games/gravity-orchard/tv/index.mjs` exporting `mountTV`; `tutorial/index.mjs` exporting `mountTutorial` |
| GO5 | `public/assets/gravity-orchard/**`; `ui/media/gravity-orchard/manifest.mjs`, `score.mjs`, `events.mjs` |
| GO6 | Additive `server/secure-lan/**` and `desktop/secure-lan/**` factories and enrollment support |
| GO7 | Shared registry/catalog/shell/native wiring, `ui/games/gravity-orchard/index.mjs`, root configuration, allowlists, generated delivery and final acceptance |
