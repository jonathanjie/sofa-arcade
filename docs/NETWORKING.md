# Sofa Arcade networking design note

Status: research and proposed next work, 19 November 2026. This note does not claim that hosted push or WebRTC has been implemented. The existing hosted and local transports described below were inspected in source; no physical home-network latency was measured.

## Recommendation

Keep the website and browser controllers. Improve the transport before changing the hosting provider: use a persistent, authenticated room connection with immediate broadcasts instead of periodic room reads. An owned server in Singapore could provide that connection, but moving the current polling code unchanged would retain the polling delay. Cloudflare itself also supports this pattern through Durable Objects and WebSockets [6].

For internet-free play now, the Mac/LAN host already implements direct local HTTP commands plus pushed SSE room updates. For an installation-free browser experience later, evaluate WebRTC between the phones and the TV browser, with a hosted signaling service and relay fallback. Treat this as an additional mode with explicit authority and reconnection rules, not a transparent switch that magically makes every session offline.

## What AirConsole actually documents

- **Browser-based does not mean internet-free.** AirConsole's current system requirements include an internet connection, and its current disconnect guidance says that losing internet connectivity is a common reason sessions disconnect [1, 2]. Its recommendation to put devices on the same Wi-Fi is a performance/reliability recommendation, not documentation of an offline mode [3].
- **The developer-facing interface is message-driven.** Controllers call `message()` and the screen receives an `onMessage` event; games do not need to poll a database for each controller change. AirConsole says it supplies hosting, pairing, networking, and game servers [4]. The tutorial establishes the API behavior, not the exact current transport implementation.
- **WebRTC is supported by historical evidence, with a date qualification.** In a February 2016 answer, founder Andrin von Rechenberg described WebRTC as an optional latency improvement, abstracted behind the same API behavior as WebSocket and long polling [5]. This is a first-party historical explanation, not a current promise that all devices use direct peer-to-peer traffic. Do not repeat its old browser-support or transport-specific assertions as present-day facts.
- **Local development is a different concept.** AirConsole lets a developer serve their game assets from a local webserver; the testing instructions still have real phones join through airconsole.com [7]. That is not evidence of fully offline consumer play.

There is no verified current universal AirConsole latency figure in this review. Do not repeat old promotional millisecond claims as measurements applicable to Jon's setup.

## What our current code does

The production game is already browser JavaScript; Sites hosts a Cloudflare Worker with a D1 database. The hosting label alone does not identify the source of input delay.

| Component | Current behavior | Consequence |
| --- | --- | --- |
| `ui/app.js` controller input | Predicts legal actions immediately through `ui/action-queue.mjs`; sends authoritative action requests in sequence | The phone can respond before a round trip, while the server still validates the result |
| Hosted TV/other controller | `poll()` targets 250 ms during visible play; one read can be in flight at a time; a 250 ms timer drives eligibility | The TV can wait for a later read, its network round trip, and rendering; 250 ms is a scheduling target, not an end-to-end promise |
| `app/api/[...path]/route.ts` | Starts each request with `DB.withSession('first-primary')` | Room reads and mutations go through primary-backed sessions for consistency; database geography and query timings require measurement [8] |
| `server/rooms.mjs` | Loads authoritative state, checks credential/revision/idempotency, writes successful moves with compare-and-swap | Correctness is preserved; database work and network distance remain on the authoritative path |
| Mac/LAN host | Reuses the room API with SQLite; `server/lan.mjs` pushes authenticated snapshots immediately after successful mutations | Removes the remote server trip and the normal TV poll wait while connected |
| Rendering | Ordinary pawn moves use a 190 ms animation; larger movements use longer animations | Visible movement has a designed duration, distinct from the time until it starts |
| TV casting | The Mac's rendered frame is separately transported to the television | Casting/display delay is outside the room protocol; compare the Mac screen and television before attributing all delay to networking |

The original hosted version polled every 1,400 ms; v4 already changed this to 250 ms and added phone prediction. Remaining symptoms should be assessed on refreshed v4-or-later clients before comparing architectures.

### Latency to measure separately

1. Tap to first local feedback on the phone.
2. Authoritative command round trip and server processing time.
3. Accepted revision to receipt/render on the Mac host.
4. Mac render to appearance on the cast TV.

Use per-command IDs and monotonic clocks within each device. Report round-trip measurements rather than subtracting unsynchronized phone/TV wall clocks. Cross-device one-way values require a clock-offset model and uncertainty; the cast portion can be measured by filming the Mac and TV together. Diagnostic output must omit credentials and private payloads. Collect p50/p95 and a distribution under the actual device/Wi-Fi setup, not one favorable sample.

## Architecture choices

| Mode | Browser clients | Internet dependency | Main benefit | Tradeoff |
| --- | --- | --- | --- | --- |
| Current hosted HTTP + polling | Yes | During play | Existing deployment, persistence, reconnect | Repeated reads and scheduled wait |
| Hosted room WebSocket | Yes | During play | Immediate push and one persistent session | Requires a coordinating room service and production deployment support |
| Existing Mac local host + SSE | Yes; Mac runs the small host | None during play after installation/assets are available | Direct local path and immediate push | Mac launcher/Node setup; separate local room store |
| Hosted setup + direct WebRTC data channel | Yes | Normally for initial load/pairing; possible relay dependency | Commands can travel directly between phones and TV browser | ICE negotiation, browser/network differences, host lifecycle, fallback complexity |
| Fully offline browser-only launch | Possible in a deliberately engineered flow | No, if assets are cached and signaling is also local/offline | No running server process in ideal supported environments | Requires offline asset lifecycle and an offline offer/answer exchange; not supplied by simply enabling WebRTC |

WebRTC provides data channels for arbitrary messages. Peers must first exchange session descriptions and connectivity candidates through a separate signaling mechanism; the standard does not supply that service [9]. A successfully negotiated local connection can avoid carrying gameplay through a remote server, but a relay candidate or a later reconnection can reintroduce internet dependence. Do not promise a universal direct LAN connection merely because both devices share Wi-Fi.

## Proposed next implementation: hosted push

### Service choice

Either a small persistent Node room service located near the players or a Cloudflare Durable Object per room can own the room connections. Durable Objects are explicitly documented for coordinating multiplayer clients through WebSockets [6]. This is a product architecture choice, not a recommendation to purchase a particular hosting plan.

The current Sites manifest declares D1 only. **Verify supported bindings and upgrade/stream handling before attempting to deploy a Durable Object through Sites.** If unavailable, keep the Site as the frontend and deploy the room service separately, with an explicit allowed-origin configuration and endpoint setting. Do not invent unsupported manifest fields or assume that a Worker-global `Map` of sockets is shared between isolates. A single in-process subscriber map works in the existing one-process LAN host; it is not sufficient for horizontally distributed Worker requests.

### Protocol and correctness

- Preserve the existing `{actionId, revision, action}` command contract and deterministic engine. Keep the server authoritative; do not trust controller predictions.
- On connect, authenticate a seat/host before sending room state. Browser WebSockets cannot be assumed to accept arbitrary Authorization headers; use a bounded initial authentication frame or a short-lived, single-use connection ticket. Keep long-lived bearer credentials out of URLs and logs.
- One room coordinator serializes gameplay commands, checks seat ownership and legality, persists the accepted revision, then broadcasts the result to connected devices. Return an acknowledgment identifying the action and revision. Repeated action IDs remain idempotent.
- Include protocol version and match identifier. Reject stale-match commands and incompatible protocol versions. Bound frame size, queue size, authentication time, and message rate.
- On reconnect, request the current authoritative snapshot and last acknowledged action ID. Never blindly replay old predicted moves into a new match.
- Preserve the existing HTTP API as a fallback until real-device testing confirms reliable push. A new stream/connection must not duplicate mutations if a response is lost.
- Before any secret-information game ships, add role-specific state projection to every read, acknowledgment, broadcast, log, and reconnect path. Current Sofa Kingdoms intentionally exposes the full public board; that envelope cannot be reused for hidden cards or clue answers.

### Work packages

1. **Instrumentation:** add an optional diagnostics view for transport type, command RTT, accepted revision, last push/read age, and reconciliation count. Keep it out of the normal board/phone layout.
2. **Room coordinator:** implement the WebSocket transport adapter with authorization, serial updates, persistence, and resumable snapshots. Share the existing engine and command validation.
3. **Browser transport:** expose one interface for HTTP/polling, SSE, and WebSocket; keep the action queue independent of transport. Add reconnect/backoff and deterministic cleanup on leaving a room.
4. **Deployment:** choose the supported coordinator host, configure origin/endpoint policy and secrets outside Git, then verify upgrade behavior from actual phones.
5. **Validation:** test two simultaneous controllers, rapid taps, background/resume, Wi-Fi interruption, stale revisions, duplicated packets, host refresh, server restart, and secret-state isolation. Compare before/after measurements on the same Mac/phone/Wi-Fi setup. Keep the functioning LAN mode.

Acceptance should be “no intentional polling wait while push is connected, equivalent authoritative behavior, and measured improvement on the real setup,” not an invented sub-10 ms promise. Set a numeric end-to-end target only after measuring display and casting contribution.

## Optional later work: host-browser authority with WebRTC

Use this when eliminating setup and reducing the network path matters enough to justify a larger change. The server handles pairing/signaling, while the TV browser receives each seat's commands and runs the deterministic authoritative match. Use reliable ordered data channels for these discrete board-game commands; attach action IDs and revisions anyway for reconnection and application-level validation. Retain a relay fallback and expose the actual connection type in diagnostics.

This changes the trust model: the host browser has full authoritative state and can inspect future/private information. That may be acceptable for a trusted living-room group, but it needs an explicit design decision for competitive hidden-information games. Handle host refresh, browser sleep, checkpoints, migration, offline asset caching, and loss of signaling before calling it production-ready or offline-capable.

## Primary sources and qualification

1. AirConsole, **System Requirements**: https://airconsole.zendesk.com/hc/en-us/articles/360014511480-System-Requirements — current internet and supported-platform requirements.
2. AirConsole, **Disconnects**, updated 31 Aug 2026: https://airconsole.zendesk.com/hc/en-us/articles/360014580319-Disconnects — losing internet connectivity and same-Wi-Fi guidance.
3. AirConsole, **How to get the best experience**, updated 10 Aug 2026: https://airconsole.zendesk.com/hc/en-us/articles/4405547655186-How-to-get-the-best-experience — stable shared connection; app/browser/display recommendations.
4. AirConsole, **Quick Start** and **Developers**: https://developers.airconsole.com/quick-start and https://developers.airconsole.com/ — `message`/`onMessage`, platform networking/hosting.
5. Andrin von Rechenberg, answer of 4 Feb 2016: https://stackoverflow.com/questions/35171773/how-do-i-distinguish-between-reliable-and-unreliable-messages-on-airconsole — historical first-party WebRTC/fallback explanation. His founder role is confirmed by AirConsole's corporate statement: https://corp.airconsole.com/airconsole-series-a-funding/ . This note deliberately does not adopt the answer's old browser-support claims.
6. Cloudflare, **Use WebSockets**, updated 18 Nov 2026: https://developers.cloudflare.com/durable-objects/best-practices/websockets/ — long-lived connections and multiplayer coordination. Not evidence of the current Sites binding surface.
7. AirConsole, **Testing your game**: https://developers.airconsole.com/testing-your-game — local assets, simulator, and phone join process.
8. Cloudflare, **D1 Database** and **Data location**: https://developers.cloudflare.com/d1/worker-api/d1-database/ and https://developers.cloudflare.com/d1/configuration/data-location/ — session consistency and primary database geography. The production database's actual location was not discovered in this review.
9. WebRTC project, **Data channels** and **Getting started with peer connections**: https://webrtc.org/getting-started/data-channels/ and https://webrtc.org/getting-started/peer-connections — arbitrary data channels, separate signaling, ICE candidates.

All sources accessed 19 November 2026. Recommendations, latency decomposition, and the proposed protocol are engineering inferences from these APIs and the current Sofa Arcade code; they are not claims of completed implementation or measured improvement.
