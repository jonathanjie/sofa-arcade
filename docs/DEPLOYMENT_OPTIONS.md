# Sofa Arcade: web hosting and a Mac app

Status: proposed architecture, 20 November 2026. The existing Site and Node LAN host are implemented. A GitHub Pages build, a separate hosted push service, and a Tauri app are not implemented by this document. GitHub remains the canonical source for every delivery mode.

**Selected direction:** Jon chose Tauri and local play after reviewing these options. The active implementation is the [six-workstream local dispatch plan](DISPATCH_LOCAL.md), with [shared contracts](LOCAL_IMPLEMENTATION_CONTRACT.md). Desktop packaging starts immediately using the existing Sofa Kingdoms while Odd Laws engine, UI, media, and private multiplayer work proceed in parallel. Pages and hosted push remain future alternatives, not active deployment tasks.

## Decision

ChatGPT Sites is convenient hosting, not a requirement of the game design. GitHub Pages can serve the collection, artwork, music, TV interface, and phone interface. It cannot execute the present room API or host its database: Pages serves static HTML/CSS/JavaScript [1, 2]. Online multiplayer therefore still needs a separate authoritative room service, or a larger change to browser-hosted authority with a pairing/signaling mechanism.

A Tauri Mac app is a good future packaging option for local play. Its main benefit is a double-click application that starts the local room host and opens the board without requiring Terminal or a separate Node installation. It does not inherently make the existing web graphics faster, remove screencasting latency, or fix the public Site's polling path. On macOS, Tauri renders web content through WKWebView [3, 4].

Both a Sites page and a Pages page can be WebSocket clients connecting to an authorized `wss://` room service. That is distinct from the host supplying the WebSocket server and shared room coordinator. Pages supplies neither; the inspected Sites configuration exposes Worker/D1 but does not establish support for provisioning the required coordinator. See the explicit distinction below.

Current priority: package the existing local host into Tauri and develop the deeper game against the shared engine/protocol in parallel, then integrate and verify the combined local collection. Keep the functioning hosted and browser/LAN paths compatible. Hosting independence and online latency work can follow separately; game rules stay independent of the delivery adapter.

## What exists today

The current application has separable layers, although deployment configuration still assumes one web origin:

| Layer | Repository source | Existing runtime |
| --- | --- | --- |
| TV, controller, tutorial, music, motion | `ui/`, public assets | Browser JavaScript and Web Audio |
| Game rules | `game/engine.mjs`, `games/registry.mjs` | Shared JavaScript; server is authoritative in multiplayer |
| Room protocol | `server/rooms.mjs` | Credentials, revisions, retry IDs, legal-action validation |
| Hosted service | `app/api/[...path]/route.ts` | Cloudflare Worker and D1 through Sites |
| Local service | `server/lan.mjs` | Node HTTP, built-in SQLite, authenticated SSE |

Hosted clients currently poll for state with a 250 ms target interval. The LAN server immediately pushes accepted state changes. Both execute the same room rules. The current local host requires Node 22.13 or newer, uses no third-party runtime dependencies, and needs no framework build. See [LAN.md](LAN.md) and [NETWORKING.md](NETWORKING.md).

## WebSockets and other ways to remove polling

| Delivery option | Can its browser frontend connect to a WebSocket service? | Can this hosting setup itself run the coordinated room service? |
| --- | --- | --- |
| GitHub Pages | Yes, using the browser's WebSocket API and a permitted `wss://` endpoint | No; a separate backend is required |
| Current ChatGPT Site | Yes, with endpoint configuration and any required connect policy | Not established by the current deployment contract; verify support or use a separate backend |
| Independently deployed Cloudflare Worker plus Durable Objects | Yes | Yes; one Durable Object can coordinate the room's clients [8, 9] |
| Persistent Node room server | Yes | Yes; one room coordinator can serialize actions and broadcast state |
| Current Mac LAN host | Could add WebSockets | Already removes ordinary poll wait using HTTP actions plus SSE updates |

Cloudflare Workers supports WebSocket upgrades, and Cloudflare specifically recommends a single coordinating entity when multiple connections share a game [8]. The installed Sites skill describes a Worker fetch handler and D1/R2 binding declarations; the checked-in manifest declares only D1. Neither demonstrates that Sites provisions Durable Object namespaces, deploys their classes/migrations, or preserves every needed upgrade path. Do not add undocumented manifest fields or treat a per-isolate `Map` of sockets as a global room coordinator.

An explicit alternative is **GitHub Pages plus a separately deployed Worker/Durable Object room service**, all developed in this repository. The same service could also support the existing Sites frontend during a migration. It would accept authenticated commands, persist the accepted revision, and push the appropriate state projection to each connected device. Long-lived bearer credentials must remain out of WebSocket URLs; use an initial authentication message or a short-lived single-use ticket and validate the browser Origin independently of HTTP CORS.

WebSockets are not mandatory for responsive turn-based play. SSE is a persistent server-to-client event stream [10]. Sending a turn as an ordinary authenticated HTTP request and immediately streaming the result to the TV also removes the intentional polling wait; that is the existing LAN arrangement. WebSockets put both directions on one persistent connection and are a sensible hosted room interface. Neither transport guarantees a particular end-to-end latency, and neither eliminates display/casting delay.

A hosted SSE implementation still needs cross-request room coordination and deployment support for long-lived responses. Having each stream repeatedly read D1 would shift the polling work to the server instead of producing true immediate room broadcasts. The choice should be based on a working coordinator and measured behavior, not the protocol name alone.

## GitHub Pages: possible, with a backend decision

### Supported product configurations

| Configuration | Multiplayer authority | What it provides |
| --- | --- | --- |
| Existing Sites | Existing Worker/D1 service | Working online play today |
| Pages plus a separate room service | Node service or supported Worker/coordinator deployment | Online play without Sites; static frontend and dynamic backend have separate deployments |
| Pages plus the existing Sites API | Existing service after deliberate cross-origin support | Transitional static hosting, still dependent on Sites |
| Pages-only static export | None | Practice/tutorial can run in one browser after export work; current two-phone room flow cannot |
| Pages plus future WebRTC | Host browser, with explicit pairing/signaling and possible relay | A different authority/transport design; not supplied by switching hosting |

The dependency-free browser engine makes a practice build feasible. The normal framework build is not already a Pages-compatible export: it includes dynamic API routes and serves the root document from a route handler.

### Required migration work

1. **Create a static build target.** Emit an actual `index.html` and an explicit asset/module manifest. Keep source assets shared with the Site and LAN distributions. Do not publish server code, secrets, databases, or private game state as browser assets.
2. **Handle the Pages base path.** Project sites normally live under the repository path [1]. Current `ui/index.html`, styles, artwork references, engine imports, download links, and `/api/...` calls include root-relative paths. Introduce a tested asset base instead of relying on the domain root. Include query-string room entry and refreshed deep links in the test flow.
3. **Choose and configure the room endpoint.** The current browser API helper calls the same origin. Add an explicit deployment configuration for API/stream origins; do not infer the backend from arbitrary user input. Keep LAN endpoints injected by the local host.
4. **Handle origins deliberately.** `server/rooms.mjs` currently rejects a supplied Origin that differs from the request URL's origin. The LAN host also validates Origin and Host. A Pages frontend cannot simply call the existing hosted API unchanged. A split deployment needs exact allowed frontend origins, appropriate CORS/preflight responses, and the same credential checks. Do not replace these checks with an unrestricted wildcard.
5. **Keep authority and reconnection intact.** Preserve seat credentials, action IDs, revisions, serialization, match IDs, and role-specific state projection. Implement persistent push in the room service to remove intentional polling wait. Moving unchanged polling to a different domain does not remove that wait.
6. **Publish coherent versions.** Build both distributions from the same reviewed GitHub commit. Version the client/server protocol and show a refresh/update path when incompatible versions meet. GitHub Actions can publish the static artifact; backend deployment needs its own supported workflow.

Online rooms belong to their backend, not their frontend URL. A new backend must either deliberately migrate compatible records or start new rooms; room codes should not imply that old sessions transferred automatically. Keep the existing public Site available until the replacement has passed real joins, actions, reconnects, and hidden-state checks.

The existing LAN flow remains self-contained: phones open the Mac's LAN URL directly. It should not require a public Pages page to reach into a local host.

## Tauri: package the local host

### Proposed user experience

Open **Sofa Arcade.app**, choose a game, and scan the QR code with both phones. The app starts its bundled local server, displays the board, retains local rooms, and shuts its own server down when the app quits. Phones continue using ordinary browsers. After installation, all gameplay assets and room traffic are local; no external CDN, music stream, or authentication service should be required.

Tauri supports bundled external binaries, including Node sidecars. Its documentation describes either packaging a Node program or embedding a Node runtime with JavaScript resources, removing the user's separate Node-install requirement [5, 6]. For this repository, the lowest-risk first version is a pinned compatible Node runtime plus the current server/engine/assets. The packaging tool must be verified with ESM and `node:sqlite`; an example binary-packaging tutorial is not evidence that every packager supports our runtime.

### Proposed implementation boundary

- Add a small desktop package in this same repository. The native shell owns startup, shutdown, window/menu behavior, local data location, and release updates. It does not fork the game rules.
- Start the sidecar from the native process using fixed bundled paths and explicit arguments. Wait for a structured ready message containing its selected port; handle startup failure and port conflicts visibly. The current `startLanServer()` accepts `root`, `databasePath`, `host`, and `port`, which can support this adapter.
- Put immutable assets under app resources and SQLite data in the app's writable user-data directory. Never try to write the database into a signed application bundle. Preserve save compatibility across updates.
- Open the host window at the sidecar's loopback HTTP URL. Serve phone pages and API from the same host on the LAN address. The existing QR-origin logic already distinguishes the Mac's localhost address from the address a phone needs.
- Retain authenticated room access, strict Host/Origin checks, allowed static paths, body-size limits, and credentials outside URLs. Do not expose native shell/file privileges to controller pages. The game window can use the ordinary web API; native lifecycle management need not grant broad JavaScript-to-shell access.
- Manage one host instance, stop its child process cleanly on quit, and handle sleep/resume and network-address changes. Preserve room state through an app restart and make stale QR addresses recoverable.
- Bundle and test binaries for the supported Mac architectures. Tauri sidecars have platform-specific packaging requirements [5]. Plan signing/notarization for normal downloaded distribution; a local development build and a distributable application have different release requirements [7].

A Rust HTTP host is another possible implementation, but porting the existing JavaScript engine or embedding a JS runtime adds another maintenance boundary. Do that only for a measured need or a separate product requirement. A thin wrapper around the existing Node host preserves one engine and the tested room semantics.

### Performance expectations

| Change | Expected effect | What still needs measurement |
| --- | --- | --- |
| Hosted polling to existing LAN SSE | Removes the remote round trip and the connected client's scheduled poll wait | Phone-to-Mac response on the actual Wi-Fi |
| Browser plus LAN host to Tauri plus the same host | Easier startup and controlled app lifecycle | Frame pacing, startup time, memory, audio, and sleep behavior in WKWebView |
| JavaScript rules to native code | Potentially changes CPU execution cost | Whether rule execution is a material bottleneck at all |
| Mac-to-TV screencasting | Remains a separate frame-transport stage | Delay compared with the Mac display or a wired display |

A board game with discrete turns can become much richer without requiring native execution. The intended complexity adds decisions and interactions; it does not by itself establish a high CPU load. More ambitious animation should be profiled independently of rule processing. These are engineering expectations, not benchmark results.

### Acceptance before calling the app ready

Verify a fresh Mac installation without separately installed Node, with internet disconnected after installation. Both phones must join, play, background/resume, and reconnect. Check sound after a user gesture, reduced motion, window fullscreen, casting, app quit/relaunch, occupied port, sleeping Mac, changed Wi-Fi address, and saved-room recovery. Repeat the server's authorization/idempotency/state-projection tests against the packaged host. Compare the same game and hardware in browser-LAN and Tauri-LAN modes before claiming a performance improvement.

## Delivery plan

1. **Local app now:** add the Tauri shell and bundled host, using Sofa Kingdoms for immediate packaging/native validation. The browser remains supported and phones need no app.
2. **Deeper game in parallel:** implement Odd Laws rules, private multiplayer, interface, and media in their separate workstreams, using fixtures where dependencies are not yet integrated.
3. **Combined acceptance:** integrate reviewed PR heads, verify TV/two-phone gameplay and native lifecycle, and produce a tested local artifact plus a final integration PR.
4. **Later online options:** if requested separately, add the persistent hosted room service and/or Pages static export described above and in [NETWORKING.md](NETWORKING.md). Do not let those tasks block the selected local release.

This plan keeps one repository and shared game engines. No Tauri build is created merely by documenting this decision; track implementation evidence in the workstream PRs.

## Sources

Official documentation accessed 20 November 2026. Recommendations above combine those documented capabilities with inspection of the repository; they are not vendor performance guarantees.

1. GitHub, [What is GitHub Pages?](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) — static hosting and project-site base paths.
2. GitHub, [Creating a GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site) — static publishing/build workflows and no server-side language runtime.
3. Tauri, [Architecture](https://v2.tauri.app/concept/architecture/) — web frontend and native core.
4. Tauri, [Webview versions](https://v2.tauri.app/reference/webview-versions/) — WKWebView on macOS.
5. Tauri, [Embedding external binaries](https://v2.tauri.app/develop/sidecar/) — sidecar execution and architecture-specific bundles.
6. Tauri, [Node.js as a sidecar](https://v2.tauri.app/learn/sidecar-nodejs/) — bundling a Node program/runtime and IPC options.
7. Tauri, [macOS code signing](https://v2.tauri.app/distribute/sign/macos/) — signing, notarization, and development/distribution distinctions.
8. Cloudflare, [Workers WebSockets](https://developers.cloudflare.com/workers/runtime-apis/websockets/) — upgrades, connection lifecycle, and coordination requirements.
9. Cloudflare, [Durable Object WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) — one coordinator for multiple clients and connection hibernation.
10. WHATWG, [Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html) — the event-stream protocol and persistent server-to-client connection.
