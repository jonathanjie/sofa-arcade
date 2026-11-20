# GO3 — Gravity Orchard phone controls

## Source and scope

- Repository: <https://github.com/jonathanjie/sofa-arcade>
- Branch: `feature/gravity-orchard-phone`
- Fetched base: `6c6eb9343958da591b4488366c2ada4000e3ba08` (`main`, Gravity Orchard v0.2 dispatch merged).
- Scope: the phone subtree, `go3-phone.yml`, and this report. The motion controller and mounted phone consume injected interfaces. GO7 owns shared wiring and delivery.

This work implements the frozen v0.2 contract. Browser sensor fixtures are software evidence; physical iOS Safari and Android Chrome trust, permissions, sensor delivery and comfort remain separate checks.

## Component and integration boundary

The phone has a real mounted interface, relative orientation input, comfortable-pose calibration, a complete two-dimensional touch joystick, held Brake, keyboard equivalents, Help, readiness and shared-pause handling. It renders the six public phases without advancing a local game clock, simulation, score or recipe. Phone code creates no audio context, effects, vibration, network connection or sensor recording.

GO2 supplies the 20 Hz latest-value sender and reliable command handling. A quiet stationary sensor is not a disconnected transport. GO5 may inject final character artwork; the component has readable initials and code-native leaf/control symbols. GO6 supplies optional trusted HTTPS; ordinary LAN HTTP works with touch. GO7 supplies public views, connection/presence status, navigation, registry and runtime packaging. This component does not mark the game playable or alter the existing two games.

## Exact APIs

Import both named exports from `ui/games/gravity-orchard/phone/index.mjs`, or import the motion factory directly from `motion.mjs`.

```js
createMotionController({ emitInput, onStatus, environment, now })
// Returns:
{
  requestPermissionFromGesture(), calibrate(),
  setMode('tilt' | 'touch'), setTouchVector(x, y), setBrake(held),
  pause(), resume(), dispose()
}

mountPhone(root, {
  playerId, input, onCommand, onExit, assets, reducedMotion
})
// Returns: { update(publicView), setConnection(status), dispose() }
```

The notation above describes signatures, not executable object literals.

### Input, commands and notifications

`playerId` is `jon` or `lydia`, selected by the authenticated shell. The mounted view never includes a claimed seat, match identity, sequence, epoch, raw angles or clock in its input output.

```js
const phone = mountPhone(root, {
  playerId,
  input: {
    setInput: value => realtime.setInput(value),
    onStatus: status => { /* optional local sensor/setup notification */ },
  },
  onCommand: command => realtime.sendCommand(command),
  onExit: leaveController,
  assets: orchardManifest,
  reducedMotion: undefined, // follow the device preference
});
phone.update(snapshot.view);
phone.setConnection({ ...transportStatus, presence: snapshot.presence });
```

`input.setInput` receives only `{ x, y, brake }`, with finite normalized axes, positive right/down and a boolean held Brake. The safe value is `{ x: 0, y: 0, brake: true }`. `onCommand` receives `{ id, kind, payload }`; IDs are unique within a mount and bounded. Phone commands are `ready` with `{ value: boolean }` and `pause` with `{ reason: 'requested' | 'help' | 'recenter' }`. The callback may return a promise; an explicit `{ accepted: false }` or rejection produces an actionable failure state. GO2 owns authentication, match/epoch binding and retry envelopes.

Sensor status is `{ state, mode, calibrated, message, reason?, requestPause?, progress? }`. States are `insecure`, `unsupported`, `needs-permission`, `denied`, `no-samples`, `calibrating`, `ready`, `paused`. `requestPause` is a notification for the mounted view, not a wire message. No raw orientation values are included. Permission success begins calibration; calibration success leaves steering paused. `resume()` returns whether controls could be armed. `pause()` preserves an established neutral pose and clears held input. Calls after disposal cannot restart capture or emit new input.

`setConnection` accepts GO2's `{ state: 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'error', message?, presence? }`. Connection status is distinct from sensor status. The interface only steers during authoritative `playing`, after explicit readiness has armed the new countdown epoch. Old countdown-to-playing snapshots cannot clear a local safety hold.

### Test injection and assets

Production can omit `environment` and `now`; motion then uses the mounted document's window and its monotonic clock. Fixtures pass `input.environment` and `input.now` through the mount. The window-like environment has `isSecureContext`, `DeviceOrientationEvent`, `document`, `screen.orientation`, optional legacy `orientation`, event listener methods, timers and optional `performance.now`. It does not need a real WebSocket or game engine.

`assets` accepts the manifest-style `assets` and `characterStates` records. An idle key from `characterStates[playerId].idle` is resolved through the asset map, with `gardener-<playerId>` / `<playerId>` fallback keys. Only same-host root-relative image sources are accepted. Missing or failed images retain the identity badge. GO7 should adapt GO5's final idle key if its adapter shape differs; no final artwork is duplicated here.

The component links `phone.css` relative to `index.mjs`, reference-counts the link per document, and removes it after the last mount is disposed. Its selectors are scoped to `.go3-phone`. Dynamic external text is assigned with `textContent`; the static markup template contains only enumerated player names and owned symbols.

## Motion model and initial tuning

All tuning is versioned in `tuning.mjs`. These are engineering starting values, not measured human comfort or balance results.

| Setting | Value |
| --- | ---: |
| Usable tilt | 25 degrees |
| Dead zone | 3 degrees |
| Stable calibration hold | 600 ms |
| Calibration tolerance | 2.5 degrees |
| First usable sample timeout | 3 seconds |
| Calibration attempt deadline | 8 seconds |
| Low-pass time constant | 75 ms |
| Filter interval / maximum time step | 16 ms / 50 ms |
| Input precision | 1/10000 |

The adapter converts beta/gamma into the alpha-free direction `(cos(beta) sin(gamma), sin(beta), cos(beta) cos(gamma))`, averages a bounded stable calibration window, and measures angular departure in an orthonormal tangent frame around that neutral. It uses no compass heading or acceleration integration. This avoids subtracting discontinuous Euler angles, including equivalent beta/gamma branches. At a vertical-gravity pole it chooses a finite tangent; twisting around gravity itself remains unobservable without heading. A comfortably reclined grip or touch avoids that limit.

| Screen angle | Screen vector from calibrated axes |
| --- | --- |
| 0° | `(x, y)` |
| 90° | `(y, -x)` |
| 180° | `(-x, -y)` |
| 270° | `(-y, x)` |

The low-pass filter settles the latest target, then stops scheduling work. Once initialized, a stationary device retains that vector indefinitely. Calibration can finish after a finite sample and an unchanged stable hold; a foreground recenter can reuse a retained sample only when sensor capture was uninterrupted. Hidden/blur/pagehide/rotation detach capture, clear the old pose and require a fresh reading. Null/nonfinite readings never count as calibration; explicit invalid readings after readiness pause safely.

### Permission and lifecycle safety

- Secure context and API availability are checked before requesting access. Where present, the platform `requestPermission()` call runs synchronously inside the initiating tap, before unrelated awaits or network work.
- Denial/rejection never creates a prompt loop. Permission granted without usable readings has its own timeout and touch/recenter actions. A late permission result cannot change a later touch session or disposed mount.
- Help, recenter, visibility/focus loss, rotation, pointer cancellation/lost capture and disposal neutralize input with Brake and attempt shared pause. Safety also withdraws existing or pending readiness.
- Opening Help does not resume on close. Only explicit readiness followed by the authoritative new countdown epoch can rearm play. Snapshots and command results are fenced across lifecycle boundaries.
- Rejected pause requests leave an explicit retry action. A reconnect can retry the pause while retaining safe input. There is no unbounded automatic command loop.
- All listeners, capture, timers and stylesheet ownership are disposed. The host deadman remains necessary because the browser cannot guarantee final input or command delivery.

## Runtime inventory for GO7

`ui/games/gravity-orchard/phone/runtime-files.json` is the machine-readable inventory. Add these exact mappings to the shared browser/static/package inventories; do not glob the phone subtree.

| Authored file | Served URL |
| --- | --- |
| `ui/games/gravity-orchard/phone/index.mjs` | `/games/gravity-orchard/phone/index.mjs` |
| `ui/games/gravity-orchard/phone/motion.mjs` | `/games/gravity-orchard/phone/motion.mjs` |
| `ui/games/gravity-orchard/phone/tuning.mjs` | `/games/gravity-orchard/phone/tuning.mjs` |
| `ui/games/gravity-orchard/phone/icons.mjs` | `/games/gravity-orchard/phone/icons.mjs` |
| `ui/games/gravity-orchard/phone/phone.css` | `/games/gravity-orchard/phone/phone.css` |

Production dependencies: **none**. The isolated development dependency is Playwright 1.62.1, with its nested lockfile. Exclude fixture/test sources, screenshots, traces, normalized test logs, nested manifests/lockfile, installed dependencies and the inventory file itself from production browser delivery.

The runtime-closure test copies only these five files to a clean temporary directory, imports the exported factories there and exercises touch without DOM/engine/transport/framework dependencies. The loopback-only fixture server uses an explicit file allowlist and rejects private source and dependency paths.

## Verification and reproduction

From the repository root:

```sh
npm test
cd ui/games/gravity-orchard/phone
npm ci --no-audit --no-fund
npm test
npx playwright install --with-deps chromium
npm run test:browser
# Interactive fixture: npm run fixture
```

The fixture is a genuine mounted component with public snapshots, synthetic sensor/lifecycle injection and normalized-input recording. Its diagnostic garden displays the emitted vector, not authoritative fruit movement. It does not measure network latency. Test-only snapshots are frozen to detect client mutation.

The browser runner covers setup, permissions, touch/tilt, all six game phases, natural-pose calibration, screen rotations, stationary hold, joystick/Brake combinations, keyboard/focus, visibility/reconnect, Help/readiness races, rejected pause recovery, pointer cancellation, disposal, target geometry, 360/390 portrait, 800×360/844×390 landscape and reduced motion. It records the tested Git SHA, dirty state, runtime SHA256 hashes, normalized input evidence, screenshots and traces under ignored `test-results/`.

The owned workflow checks out the exact PR head, installs the nested locked dependencies, runs the Node/browser suites and uploads evidence named `go3-phone-<head SHA>`. Existing `npm test` does not discover the new phone subtree; the dedicated workflow is required.

### Current evidence checkpoint

- Existing root suite: **81/81 passed** on the implementation worktree.
- New Node suite: **35/35 passed** (33 sensor/input checks and two closure/fixture checks).
- JavaScript syntax and `git diff --check`: passed.
- Browser verification: **pending CI** at this initial draft checkpoint. The local command sandbox denied Chromium's Unix socket creation; elevated launch was rejected by the environment approval policy. The supported shared browser could not reach the isolated command's loopback server. No local browser or physical-phone pass is claimed.

The PR remains draft until its real browser checks and screenshot inspection complete. Final CI heads, reviewed screenshots and build evidence will be added after the run.

## Physical-device checklist — unverified

Record exact PR head, device model, OS/browser version, origin and date for each real device. None of the following is established by synthetic events or desktop Chromium screenshots.

1. iOS Safari and Android Chrome each open the ordinary LAN HTTP route and complete full two-dimensional touch play, simultaneous Brake, pointer cancellation and reload/reconnect.
2. After GO6's explicit enrollment, each phone opens the trusted HTTPS URL without a certificate warning; no bypass or silent trust changes. Confirm the public fingerprint, address/SAN and expiration.
3. Tilt permission is requested from a tap; allow, deny and subsequent browser settings flows stay actionable. Confirm real finite beta/gamma readings before displaying ready.
4. Calibrate a natural seated grip, hold motionless, use Brake, recenter without forced shaking, and verify both axes at 0/90/180/270 screen angles. Check gentle-control sensitivity and the vertical-pose limit.
5. Lock/unlock, background/foreground, open/close Help, rotate, interrupt a touch, disconnect/reconnect Wi-Fi and leave the controller. Confirm shared pause and fresh both-ready countdown, with no retained force.
6. Check 360/390-width real viewport, browser chrome, safe-area insets, zoom, keyboard/screen-reader focus, text/icon status, target comfort and reduced-motion settings.
7. GO7 verifies both controllers with the packaged Mac host, actual three-stage gameplay, Wi-Fi/TV behavior and cold start with WAN disconnected after setup. These are integrated hardware gates, not GO3 fixture claims.

## Primary browser references

- [W3C Device Orientation and Motion](https://www.w3.org/TR/orientation-event/): secure-context/permission/visibility requirements, device coordinates, changed-event semantics and Euler rotation model.
- [MDN requestPermission](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static): transient user activation, feature detection and permission result handling.
- [W3C Screen Orientation](https://www.w3.org/TR/screen-orientation/): orientation angle semantics.

These references inform the implementation. They do not establish successful sensor delivery or certificate trust on Jon's or Lydia's phones.
