> Historical record. This assignment ended on 21 November 2026 at `e0504c1`.

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

## Runtime inventory supplied at handoff (21 November 2026)

The [integration report](gravity-orchard-go7.md) records the completed wiring and reviewed corrections.

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

### Tested implementation and evidence

The complete runtime and test implementation was tested at **`adf261d6f3af17cdb34eb004d5cd5efb10be3894`**, with a clean checkout. [GO3 CI run 44777390436](https://github.com/jonathanjie/sofa-arcade/actions/runs/44777390436) passed both the controller/browser job and production build. [Game checks](https://github.com/jonathanjie/sofa-arcade/actions/runs/44777390443) also passed at that source. The later handoff commit adds only this report and copied evidence; its exact PR head is checked again by the same workflow. The [PR](https://github.com/jonathanjie/sofa-arcade/pull/11) records that final tested head.

| Verification | Result |
| --- | --- |
| Existing root `npm test` | **81/81 passed** locally; Game checks passed in CI |
| New Node suite | **35/35 passed**: 33 sensor/input checks and two runtime-closure/fixture checks |
| Real rendered Chromium suite | **14/14 passed**; Chromium **151.0.7922.34**, Node **v22.23.5** |
| Existing collection production build | **Passed** in the owned CI workflow |
| JavaScript syntax, whitespace and owned-path review | **Passed** |
| Physical iOS Safari / Android Chrome sensors and trust | **Unverified**; exact checklist below |

The 14 browser cases cover Jon at 360px; Lydia at 390px with real independent touch pointers; pointer cancel/epoch fencing; Help focus and no automatic resume; permission/fallback states; tilt calibration, stationary hold and recenter; all four screen orientations; hidden/resume/disposal; authoritative phases and connection states; narrow/landscape reduced motion; unready boundaries and command failure; countdown/Help/readiness races; no-prompt permission and invalid late readings; and the graphical diagnostic fixture.

The first rendered run found a real resume-order bug: a synchronous sensor-status callback could resume inside a public-view boundary before that boundary's final safe input write. `update()` now settles nested updates atomically before synchronizing controls. Existing resume/readiness assertions caught it and now pass. The multi-touch helper also initially released the wrong pointer ID; it was repaired, and explicit DOM release-identity assertions now verify independent Brake and joystick release. No safety assertions were removed. Final screenshot review removed visible steering/Brake instructions during live play while retaining accessible descriptions and setup/Help guidance.

The local command environment denied Chromium's Unix socket creation, and its approval policy rejected an elevated launch. The supported shared browser could not reach the isolated command's loopback fixture. Rendered verification therefore ran in GitHub Actions; the downloaded screenshots were inspected directly. There is no claimed local-browser or physical-phone pass.

### Reviewed screenshots and normalized controls

The selected captures below are copied without alteration from that successful run. [Evidence metadata](../../../ui/games/gravity-orchard/phone/screenshots/evidence.json) records the exact tested SHA, clean status, browser version, runtime SHA256 hashes, all case results, measured targets, pointer-release identities, artifact provenance and screenshot hashes. [Normalized controls](../../../ui/games/gravity-orchard/phone/screenshots/normalized-controls.json) retain only synthetic fixture output/status/command evidence, not raw phone sensor recordings.

| Capture | Review |
| --- | --- |
| [360px insecure setup](../../../ui/games/gravity-orchard/phone/screenshots/360-insecure-setup.png) | Readable identity/status, wrapped setup copy and prominent complete touch fallback |
| [360px touch play](../../../ui/games/gravity-orchard/phone/screenshots/360-touch-playing.png) | Joystick, large Brake and both utility controls visible together; no live instructional captions |
| [390px tilt play](../../../ui/games/gravity-orchard/phone/screenshots/390-tilt-playing.png) | Compact relative-tilt gauge and generous Brake |
| [390px simultaneous touch and Brake](../../../ui/games/gravity-orchard/phone/screenshots/390-touch-brake-combination.png) | Lydia's identity, directional feedback and held Brake are clear |
| [800×360 landscape / reduced motion](../../../ui/games/gravity-orchard/phone/screenshots/800x360-reduced-touch.png) | All active controls remain visible in the two-column layout |
| [390px Help](../../../ui/games/gravity-orchard/phone/screenshots/390-help-paused.png) | Legible guidance, focus-managed dialog and explicit shared-readiness requirement |
| [800×360 Help](../../../ui/games/gravity-orchard/phone/screenshots/800x360-help.png) | Title and close control remain visible; later options use intentional panel scrolling |
| [390px no sensor samples](../../../ui/games/gravity-orchard/phone/screenshots/390-setup-no-samples.png) | Distinguishes missing readings from transport connection and offers recenter/touch |
| [390px results](../../../ui/games/gravity-orchard/phone/screenshots/390-phase-finished.png) | Quiet shared totals and TV-directed next action |
| [Graphical fixture](../../../ui/games/gravity-orchard/phone/screenshots/diagnostic-fixture.png) | Actual mounted phone, normalized-vector diagnostic and explicit synthetic-data limitations |

Measured active-control layouts are **360×800**, **390×844**, **800×360** and **844×390** CSS pixels. Each has five active targets, a minimum of **48×48 CSS pixels**, and document width equal to viewport width. The portrait Brake is 122px high; portrait touch surfaces are 214px high. Focus trapping/restoration, keyboard controls, scrolling and reduced-motion assertions passed. CSS uses safe-area insets; real notches, browser chrome and physical comfort remain hardware checks.

The full CI artifact contains **38 screenshots**, per-case Playwright traces, normalized controls and the source/hash summary. Its name is `go3-phone-adf261d6f3af17cdb34eb004d5cd5efb10be3894`, artifact ID `14649044190`, ZIP SHA256 `daeec60a98dc6174eb9e075295b279612c74c294e7190c8864e2cd142ce0898e`. CI retains full artifacts for 14 days; the selected images and compact evidence above remain tracked. All evidence stays outside the five-file production inventory.

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
