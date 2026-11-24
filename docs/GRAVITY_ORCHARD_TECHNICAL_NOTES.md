# Gravity Orchard: local motion and realtime notes

Research baseline: 20 November 2026. These are design findings and acceptance requirements, not a claim that the proposed transport or sensor support is already implemented. Read the [v0.2 game PRD](games/gravity-orchard.md), [implementation contract](GRAVITY_ORCHARD_CONTRACT.md), and [dispatch packet](archive/DISPATCH_GRAVITY_ORCHARD.md) together. The old turn-based Gravity Orchard draft is superseded by the two-tray cooperative game.

## Decision

Use one authoritative local simulation on the Mac, a continuous-input WebSocket channel, and an optional trusted local HTTPS/WSS listener for phone tilt. Keep immediate touch controls available through the existing HTTP LAN route. The Tauri host and both listeners must share one room authority and one checkpoint store.

This preserves the requested product: the Mac runs locally, the TV shows the game, and Jon and Lydia use ordinary phone browsers on the same network. No paid cloud service, account, internet connection during configured local play, or native phone app is a hidden prerequisite.

There is a real setup tradeoff: reliable browser motion requires a secure context. A phone opening `http://<Mac LAN IP>` does not inherit the Mac's localhost exception. Local tilt therefore needs a certificate trusted by that phone, or a separately implemented secure-origin alternative. Touch mode remains useful before trust setup and when permission or hardware is unavailable. See the [W3C secure-context model](https://www.w3.org/TR/secure-contexts/) and [Device Orientation and Motion draft](https://www.w3.org/TR/2026/CRD-orientation-event-20261118/).

## Repository evidence

Inspected baseline: main `a96fd477d2a3239d715421ed711682648e16eccc`. Inspect current source again before implementation; this note does not override newer code.

| Source | Existing behavior | Required integration consequence |
| --- | --- | --- |
| `server/lan.mjs` | Node HTTP listener, exact Host/Origin validation, HTTP join metadata and authenticated SSE | Compose an explicit HTTPS listener around a shared handler. Do not change a scheme string and assume origin handling is complete. |
| `server/rooms.mjs` | Bearer authentication and SQLite compare-and-swap writes for turn-based actions | Continuous input must bypass per-action persistence. Add a server-only authentication/lifecycle seam during GO7 integration. |
| `ui/transport.mjs` | Explicit LAN configuration and authenticated fetch/SSE; join-origin parsing already accepts HTTP or HTTPS | Reuse configuration conventions; add a separate realtime client. |
| `desktop/host/lifecycle.mjs` | Readiness requires loopback HTTP plus HTTP IPv4 controller URLs on the same port | Add secure-controller metadata without weakening existing URL validation. |
| `desktop/host/entry.mjs` | Starts the shared LAN server and owns process shutdown/network refresh | Keep one owned host process and close both listeners with it. |
| `desktop/src-tauri/src/protocol.rs` | Validates child readiness records | Extend the native protocol deliberately; do not trust arbitrary URLs from readiness output. |
| `desktop/src-tauri/src/config.rs` | Persists a validated loopback HTTP origin and public route | Keep credentials out of saved navigation and avoid replacing the host origin with an arbitrary controller URL. |

The room API's `authenticate` function is private inside `createRoomApi`. A successful projected GET does not identify the requesting player to a new socket handler. GO7 must inject an authenticator that returns the actual existing host/player authority. Client-provided seat names never establish ownership.

GO2 and GO6 do not edit those shared sources. They deliver isolated factories and tested fixtures; GO7 owns all production composition, registry, root dependency, native protocol and runtime-allowlist changes.

The coordinator receives an injected synchronous `validateUpgrade(request)` policy and denies upgrades if it is absent or does not explicitly accept. GO7 derives the scheme from the actual listener or `request.socket.encrypted`, then checks exact Host/Origin. GO6 passes the original request; untrusted forwarded headers and header rewriting must not disguise HTTP as HTTPS. Origin validation does not replace first-message bearer authentication.

## Phone motion behavior

Use calibrated relative orientation for two-dimensional tilt. Absolute compass heading is unnecessary. The current W3C draft describes accelerometer and gyroscope permissions for relative orientation and additional magnetometer permission for absolute orientation. It also identifies incomplete implementation experience around parts of permission integration. Feature detection and actual devices are necessary; do not treat the draft as a universal browser compatibility promise. [Primary specification](https://www.w3.org/TR/2026/CRD-orientation-event-20261118/).

The controller must:

- Check `window.isSecureContext` and the relevant constructors/events.
- If `DeviceOrientationEvent.requestPermission` exists, call it directly inside the enabling tap before awaiting networking or other asynchronous work.
- Handle denial, rejection, unavailable APIs, and initial null/nonfinite samples with immediate touch controls.
- Require usable finite readings before displaying tilt as ready.
- Calibrate a comfortable resting position; transform axes for the current screen orientation and test 0, 90, 180 and 270 degrees. Pause/recenter deliberately on an orientation change rather than reversing active axes unexpectedly.
- Apply bounded smoothing and a dead zone before emitting normalized finite axes.
- Continue a foreground network heartbeat of the latest held vector. An unmoving device may stop emitting changed orientation readings; sample silence after initialization is not by itself a network disconnect.
- On visibility loss, attempt neutral plus brake and a pause request, then stop active control. The host deadman must work when that final message never arrives.
- Dispose event handlers, timers and pending callbacks on navigation or seat change.

Permission UI, calibration and connection explanations belong in setup, tutorial or Help. The ordinary phone screen should prioritize the tilt indicator, brake, pause and connection state.

## HTTPS and trust choices

| Option | Practical implication | v1 position |
| --- | --- | --- |
| Existing local HTTP and touch | No additional trust setup; dependable browser controls without a motion promise | Always available |
| Local HTTPS/WSS with a per-install CA | Requires explicit root/profile installation and trust on each phone; works without WAN after configuration while certificates are valid | Preferred tilt route |
| Owned domain with a publicly trusted certificate | DNS and certificate issuance/renewal are operational dependencies; local name resolution still matters | Future convenience option |
| Hosted HTTPS controller and Chrome Local Network Access | Can keep gameplay traffic local but has browser, permission, cache and cross-origin constraints | Optional experiment |
| Hosted/cached HTTPS controller and WebRTC | Can carry direct LAN data, but signaling, ICE, caching and reconnects must be implemented | Future option |
| Native/Capacitor phone controller | Requires phone installation/distribution and OS permission work | Outside ordinary-browser v1 |

### Local certificates

Apple explicitly states that a manually installed certificate profile is not automatically trusted for SSL/TLS. The user must enable full trust in Certificate Trust Settings. The mkcert author also documents separate mobile-root installation; installing a root on the Mac does not configure either phone. [Apple instructions](https://support.apple.com/en-us/102390), [mkcert documentation](https://github.com/FiloSottile/mkcert).

Chrome's certificate verifier considers local trust decisions for TCP TLS connections. Actual Android Chrome testing is still required, and Android native-app trust configuration should not be confused with browser behavior. [Chromium verifier FAQ](https://chromium.googlesource.com/chromium/src/net/+/HEAD/data/ssl/chrome_root_store/faq.md).

Provision per-install material through an established certificate implementation. Keep CA and leaf private keys outside served and packaged assets, with restrictive permissions. Export only the public root/profile. Never ship one shared CA/private key, silently install trust, bypass certificate errors, or tell players to disable browser security. mkcert is useful for development but is not a complete consumer onboarding or certificate-lifecycle product.

Certificate SANs must match advertised addresses. Account for expiry and LAN-address changes. A stable hostname is useful only when both phones can actually resolve it. A user-facing certificate setup should include a public fingerprint, explicit trust instructions, a secure-origin probe, and removal instructions. Removing local certificate files does not automatically remove a previously installed profile from a phone.

Privileged provision/remove/export operations belong to a native or explicitly authenticated loopback host seam. A phone route must not create keys, choose filesystem paths, operate the host trust store, or export secrets. A deliberately exposed public root download may contain only public trust material and must not become a general file-serving endpoint.

### Current Chrome is more nuanced than blanket mixed-content advice

Current Chrome documentation describes Local Network Access permissions and a mixed-content exemption for HTTPS pages opening `ws://` connections to recognizable private/loopback IP literals or `.local` names. A non-`.local` custom hostname needs WSS in that documented case. The WebSocket constructor takes a URL and optional subprotocol, not a `targetAddressSpace` options object. Chrome's fetch behavior and permission-query names must be feature-detected. This documentation does not establish matching Safari behavior. [Chrome Local Network Access guidance](https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access).

Do not ship a blanket statement that HTTPS can never talk to local WS. Equally, do not advertise a hosted controller as universally offline and certificate-free based only on Chrome documentation.

### Alternatives do not remove operational requirements

DNS-01 can prove control of a real domain without exposing the game server publicly, but initial issuance and renewal require network/DNS operations. Local DNS, certificate expiry and unique private keys still need ownership. Do not bundle a shared wildcard private key. [Let's Encrypt challenge types](https://letsencrypt.org/docs/challenge-types/).

WebRTC needs offer/answer and ICE candidate exchange outside its data channel. QR/manual exchange can replace a cloud signaling service but needs a two-way pairing and reconnect design. Direct LAN candidates may work without internet services; that must be proved on actual networks. STUN/TURN fallback is an internet dependency unless deliberately supplied locally. [WebRTC peer connections](https://webrtc.org/getting-started/peer-connections), [data channels](https://webrtc.org/getting-started/data-channels).

## Realtime starting contract

The [canonical contract](GRAVITY_ORCHARD_CONTRACT.md) owns exact interfaces. These initial values are tuning hypotheses, not measured performance claims:

| Concern | Starting value |
| --- | --- |
| Authoritative fixed simulation | 60 ticks/second |
| Latest controller inputs | 20 messages/second |
| Public snapshots | 20/second |
| Input stale threshold | 250ms: neutral plus brake |
| Shared-pause threshold | 2 seconds without valid control/connectivity |
| Maximum observed-tick lag | 30 simulation ticks |
| Maximum live fruit | 8 |

Input fields are `type:'input'`, `protocol:1`, `matchId`, `runEpoch`, `controllerEpoch`, `seq`, `observedTick`, finite normalized `x,y` in `[-1,1]`, and boolean `brake`. After wire validation, the pure input normalizer limits diagonal magnitude and rounds as specified in the contract. The server supplies the player from authenticated connection context. No client actor field is accepted. The first message is exactly `{type:'auth',protocol:1,roomCode,token}`, with the contract's five-second deadline and bounded frame; credentials never appear in URLs, QR codes or logs.

`matchId` changes for a new run. `runEpoch` changes and all input latches clear on pause/resume, stage changes and recovery. `controllerEpoch` is server-assigned on connection/takeover, fencing older sockets. Sequence numbers increase within that connection. Reject future ticks and inputs beyond the observed-tick lag limit.

Receipt time alone is insufficient: an old TCP backlog can arrive later and look newly received. `observedTick`, epochs and bounded buffers limit accepted input age and fence obsolete connections/runs. Local monotonic measurements support diagnostics; no additional client timestamp is part of the frozen input envelope or defines authoritative freshness/game time.

Keep only the latest valid input per player. Bound payload size, unauthenticated lifetime, message rate and output queues. Coalesce snapshots and check browser `bufferedAmount`; it does not include all OS/network buffering. Closing a WebSocket does not discard messages queued before the close handshake, so stale-epoch rejection is still necessary. [WHATWG WebSockets standard](https://websockets.spec.whatwg.org/).

Use a monotonic clock, at most five catch-up ticks per scheduler turn, and a trusted host-stall pause after a gap beyond 250ms. Reliable wire command kinds are `ready`, `pause`, `retry-stage` and `rematch`; both-ready resumes through countdown rather than a separate resume command. Capture a command's match/epoch when first sent and retain that identity on retries. System pauses call the pure server-only `pauseForSystem(state, reason)` for `network`, `host-stall` or `recovery`, never a wire command. Persist stage boundaries, explicit pause/end and bounded periodic checkpoints initially no more than once per five seconds, not each input or frame. Recover paused from the last durable checkpoint and require both controllers ready before resuming.

The existing room projection and realtime frames must describe the same authority. Do not leave one live world in memory and a separate conflicting world exposed through GET/SSE. Checkpoint schema/version and recovery semantics belong in the integration handoff.

WebSocket v1 authenticates only existing host/player credentials; there is no anonymous/public observer connection. A trusted public projection role may still be used by existing HTTP/server paths. Presence stays in the coordinator snapshot wrapper, with GO7 forwarding it to presentation connection status rather than adding networking state to the pure simulation.

## Secure-controller status

The setup view and native integration share this safe status. It contains no private material:

```ts
type SecureControllerStatus = {
  enabled: boolean;
  status: 'disabled' | 'needs-setup' | 'ready' |
    'certificate-expired' | 'address-mismatch' | 'failed';
  controllerOrigins: string[];
  certificateFingerprint?: string;
  validUntil?: string;
  requiresPhoneTrust: boolean;
};
```

Host `ready` means the listener/certificate are ready, not that either phone has trusted the root or granted sensor access. Those are phone-side checks.

## Acceptance and honest evidence

Automated checks must cover deterministic replay, malformed/flooded frames, authority and projection, sequence/epoch fencing, stale TCP input, duplicate connections, bounded queues, disposal, checkpoint recovery and host time jumps. Preserve existing Sofa Kingdoms and Odd Laws tests. Sensor fixtures must cover permission denial, unsupported APIs, null readings, calibration, rotations and touch fallback.

Manual acceptance requires real iOS Safari and Android Chrome, finite sensor readings, correctly directed axes, background/lock/reconnect behavior, and a cold start with WAN disconnected after trust setup. Test missing trust, wrong SAN/hostname, expiry and changed LAN addresses. Validate the actual packaged Mac host and server shutdown. Record device/browser versions and the exact tested commit.

Synthetic events, HTTP screenshots and browser runs that ignore certificate errors do not prove phone motion support. A session without hardware should complete its component, publish the tested PR and clearly record hardware gates as unverified; it must not claim release readiness. GO7 owns combined hardware/native acceptance.

Measure input acknowledgment RTT, accepted-input tick age, host overruns, frame delivery and rendering separately. Never subtract unsynchronized phone and host clocks to claim one-way delay. Screen-casting adds another path that needs separate physical observation. Tauri provides packaging, lifecycle and local setup; it does not by itself prove lower phone-to-TV latency.

## Primary-source reading list

- [W3C Device Orientation and Motion, 18 November 2026 draft](https://www.w3.org/TR/2026/CRD-orientation-event-20261118/)
- [W3C Secure Contexts](https://www.w3.org/TR/secure-contexts/)
- [Chrome Local Network Access](https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access)
- [Apple manual certificate-profile trust](https://support.apple.com/en-us/102390)
- [Chromium certificate verifier FAQ](https://chromium.googlesource.com/chromium/src/net/+/HEAD/data/ssl/chrome_root_store/faq.md)
- [mkcert author documentation](https://github.com/FiloSottile/mkcert)
- [Let's Encrypt validation challenges](https://letsencrypt.org/docs/challenge-types/)
- [WebRTC peer connections](https://webrtc.org/getting-started/peer-connections)
- [WebRTC data channels](https://webrtc.org/getting-started/data-channels)
- [WHATWG WebSockets](https://websockets.spec.whatwg.org/)
