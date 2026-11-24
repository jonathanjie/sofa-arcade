# Gravity Orchard: local motion and realtime notes

Browser and certificate research dates from 20 November 2026. The [local realtime contract](GRAVITY_ORCHARD_CONTRACT.md) describes the implemented transport. Physical tilt, trust and latency checks remain open.

## Decision

Use one authoritative local simulation on the Mac, a continuous-input WebSocket channel, and an optional trusted local HTTPS/WSS listener for phone tilt. Keep immediate touch controls available through the existing HTTP LAN route. The Tauri host and both listeners must share one room authority and one checkpoint store.

This preserves the requested product: the Mac runs locally, the TV shows the game, and Jon and Lydia use ordinary phone browsers on the same network. No paid cloud service, account, internet connection during configured local play, or native phone app is a hidden prerequisite.

There is a real setup tradeoff: reliable browser motion requires a secure context. A phone opening `http://<Mac LAN IP>` does not inherit the Mac's localhost exception. Local tilt therefore needs a certificate trusted by that phone, or a separately implemented secure-origin alternative. Touch mode remains useful before trust setup and when permission or hardware is unavailable. See the [W3C secure-context model](https://www.w3.org/TR/secure-contexts/) and [Device Orientation and Motion draft](https://www.w3.org/TR/2026/CRD-orientation-event-20261118/).

## Repository evidence

The original research used `a96fd47`. In the merged host, `server/lan.mjs` and `server/gravity-orchard-host.mjs` connect the HTTP/WS and optional HTTPS/WSS listeners to one room authority. The coordinator receives the room authenticator and a request policy that checks the actual listener, Host and Origin. The native host owns certificate setup. See the [local release guide](LOCAL_RELEASE.md) for device setup and acceptance.

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

## Realtime design

A stationary phone may send no new orientation events. Its network heartbeat therefore sends the latest held vector. A delayed TCP backlog can make old input appear recent. The coordinator checks the observed simulation tick and connection identity before applying it. A lost controller causes a shared pause, and both players confirm readiness to resume.

The [wire contract](GRAVITY_ORCHARD_CONTRACT.md#5-realtime-wire-contract) defines authentication, fields, rates, limits and checkpoint recovery.

## Secure-controller status

A ready listener reports that the Mac has usable certificate material. Each phone must establish trust and supply usable motion readings. The [trusted LAN contract](GRAVITY_ORCHARD_CONTRACT.md#9-trusted-lan-and-tauri-setup-component) defines the public status fields.

## Acceptance and honest evidence

Automated checks must cover deterministic replay, malformed/flooded frames, authority and projection, sequence/epoch fencing, stale TCP input, duplicate connections, bounded queues, disposal, checkpoint recovery and host time jumps. Preserve existing Sofa Kingdoms and Odd Laws tests. Sensor fixtures must cover permission denial, unsupported APIs, null readings, calibration, rotations and touch fallback.

Manual acceptance requires real iOS Safari and Android Chrome, finite sensor readings, correctly directed axes, background/lock/reconnect behavior, and a cold start with WAN disconnected after trust setup. Test missing trust, wrong SAN/hostname, expiry and changed LAN addresses. Validate the actual packaged Mac host and server shutdown. Record device/browser versions and the exact tested commit.

Synthetic events, HTTP screenshots and browser runs that ignore certificate errors do not prove phone motion support. Record physical results in the [release sign-off](LOCAL_RELEASE.md#hardware-and-distribution-sign-off).

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
