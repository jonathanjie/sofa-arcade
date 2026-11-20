# WS2 — Private local multiplayer platform

## Scope and baseline

- Repository: `jonathanjie/sofa-arcade`.
- Branch: `feature/local-platform` in an isolated clone.
- Base: `e34b0015399cb9791b175987adf1fab1b542565a`, fetched from `main` on 20 November 2026.
- Scope: room authority and viewer projection, safe command retry/concurrency, local HTTP/SSE transport, authenticated browser command lifecycle, focused platform CI, and this report.
- Production engine/catalog registration, shell routing, generated browser copies, desktop packaging, release scripts, and deployment remain with their assigned owners.

## Handoff status

Ready for WS6 handoff. Implementation, local protocol verification, the production build, the actual browser runtime gate, and all three platform CI matrix jobs have passed. [PR #7](https://github.com/jonathanjie/sofa-arcade/pull/7) identifies the exact tested head and current CI results; this report intentionally does not contain its own future commit hash.

The component uses an injected fixture to complete independent platform work. Actual Odd Laws registration, its real engine/view combination, and whole-product acceptance belong to WS6. Nothing here enables a planned game or publishes a deployment.

## Authority and engine adapter

`createRoomApi({ resolveGame, resolveEngine })` returns an async `(request, env) => Response` handler. Existing `handleApi(request, env)` remains the production entry point, backed by the current catalog/registry. Resolvers are trusted server configuration; requests cannot select an implementation or viewer.

New adapters must provide `playerIds`, `create`, `apply`, `normalizeAction`, `actionKey`, `project`, and `canRebaseAction` as contracted. Incomplete private adapters fail closed with `503 invalid_engine`. The existing registered Sofa Kingdoms engine is the only legacy public-state exception; restoring its v1/v2 rooms preserves their rules until a v3 rematch.

Room envelopes keep `code, gameId, revision, phase, state, players, expiresAt`. Every outward state is freshly projected for the authenticated viewer. The same path covers public/player/host GET, join/rejoin, start/rematch, action success, duplicate acknowledgment, and each stream snapshot. Join returns the newly authenticated seat's projection plus its newly issued token. Errors expose only safe codes/messages and no state/history. Credentials stay hashed in storage and out of URLs, histories, and broadcast payloads.

New matches receive fresh match IDs from the authority. Private commands are normalized through the engine; retry identity combines its `actionKey` with stable serialization of every normalized field. Reordered JSON keys remain equivalent; changed choice, bid, coordinates, match or phase cannot reuse a committed ID.

### Concurrent sealed commands

The existing body stays `{ revision, actionId, action }`. For example, both phones may submit the same room revision and council phase:

```js
{
  revision: 3,
  actionId: 'one-stable-random-id-per-command',
  action: {
    type: 'commitCouncil',
    matchId: '<current-match-id>',
    phaseId: '<current-council-phase-id>',
    choiceId: 'keep',
    bid: 1,
  },
}
```

After authentication and normalization, the authority rejects a future revision, checks known retry identity, and fences new commands to the exact match and phase. A stale revision or lost compare-and-swap can be re-evaluated only for `commitCouncil`, only when the engine explicitly returns `true`, and for at most four apply attempts. Every reload authenticates again. City actions never rebase, even with an incorrectly permissive adapter.

The engine owns fixed phase budgets, vote immutability, and reveal/payment rules. The platform commits the entire resulting state, phase, and retry receipt in one CAS. The fixture proves both arrival orders and a deliberately forced CAS collision accept two valid submissions from one revision, preserve pre-bid public balances, and reveal/deduct once. Delayed city commands cannot execute during the same player's later turn because each turn has a separate phase ID.

Known identical retries return current projected authority even after the original phase or match-winning action has completed. A rematch clears old receipts and changes the match ID, so old commands remain fenced out. Projector failures are checked before starting, rotating a seat token, or committing an action; raw diagnostic text never reaches private clients.

## LAN and desktop API

```js
const api = createRoomApi({ resolveGame, resolveEngine });
const host = await startLanServer({
  root,
  databasePath,
  host: '0.0.0.0',
  port: 4177,
  heartbeatMs: 10_000,
  roomApi: api,                 // optional; defaults to production handleApi
  browserModules: [],           // optional explicit trusted file entries
});
// Existing result: { port, origin, urls, databasePath, close }
await host.close();
```

The callable `roomApi` is used for ordinary HTTP requests and every SSE subscriber's own authenticated GET. The LAN adapter never loads or caches a full engine state. It never broadcasts an action/join response to other viewers. Credentials are rechecked on each push; rotated credentials and expired rooms terminate their old streams.

Immediate mutation pushes survive a failed HTTP response write. A second authenticated read closes the initial subscription registration race. Slow-client buffering is bounded. Shutdown closes streams, waits for outstanding authority operations (including abandoned HTTP sockets), then closes SQLite; repeated `close()` calls share the same completion promise.

Host validation rejects unknown addresses, malformed authorities, userinfo, paths/fragments and duplicate Host headers. Foreign, empty and `null` Origin values are rejected when supplied. Body limits, 24-hour expiry, SQLite persistence/permissions, throttled presence, and the existing return object remain intact. No schema migration or additional runtime dependency is needed.

## Browser client and status contract

```js
const client = createRoomClient({
  code, token, playerId,
  initialRoom,                 // authenticated projected snapshot; optional
  fetcher: fetch,              // optional injection
  onRoom: room => view.update(room),
  onStatus: status => view.setConnection(status),
});
const stopStream = subscribeRoom({
  code, token,
  onRoom: client.receive,
  onStatus: status => view.setConnection(status),
});

await client.submit(normalizedAction);
// Optional explicit recovery after a network interruption:
await client.reconnect();
// Leaving the room:
stopStream();
client.dispose();
```

`submit(action): Promise<RoomEnvelope>`, `receive(room)`, and `dispose()` implement the frozen contract. Additive `reconnect()` resolves an uncertain already-sent command with its original identity before fetching the current authenticated snapshot. If `initialRoom` is omitted, the client fetches it with its bearer header.

The module also exports `RoomClientError`, with a fixed safe `message`, a bounded public `code`, and an optional HTTP `status`. Unknown server codes map to a generic rejection rather than reflecting server text. Existing transport exports `readTransportConfig` and `createEventDecoder`, and authority constants `ROOM_TTL_MS` and `MAX_BODY_BYTES`, remain available.

Commands are copied and serialized per seat. IDs use Web Crypto `getRandomValues`, which works on ordinary HTTP phone origins without `randomUUID`. Retries preserve the original ID, revision, action and phase. Lost, malformed or otherwise unverifiable successful responses retain that identity. After bounded retry exhaustion, another distinct command is blocked until the uncertain command resolves; resubmitting the same action or calling `reconnect()` resumes it.

Snapshots are copied; lower revisions, foreign rooms/games, retired matches, and equal-revision phase regressions are ignored. A queued city command is fenced again immediately before first send. Once sent, its duplicate acknowledgment can still be recovered after a newer SSE state arrives. Disposal aborts requests, cancels readers/timers, rejects waiters, and suppresses late callbacks. Responses are bounded to 1 MiB. Neither this client nor its tests import a private game engine for prediction. `ui/action-queue.mjs` remains Sofa Kingdoms' separate optimistic path.

`onStatus` supplies `{state:'connecting'|'connected'|'reconnecting'|'offline'|'error', message?:safeText}`. `subscribeRoom` adds this callback while retaining legacy `onConnection(string)`. It reports passive stream loss, terminal credential/expiry failures, reconnect, and a silent-stream watchdog. The shell must connect both status sources to the view, and dispose both client and subscription on navigation.

Optional timing controls for tests/recovery are `retryMs=250`, `maxRetries=3`, and `requestTimeoutMs=10_000` on the client; stream defaults remain `retryMs=500` with `idleTimeoutMs=30_000`.

## Exact runtime and serving handoff

| Kind | Files |
| --- | --- |
| Changed server runtime | `server/rooms.mjs`, `server/lan.mjs` |
| Changed browser runtime | `ui/transport.mjs` |
| New browser runtime | `ui/room-client.mjs` |
| New server runtime helpers | None |
| Test-only modules | `server/room-platform-fixture.mjs`, `server/room-platform.test.mjs`, `server/room-lan-integration.test.mjs`, `server/room-browser.test.mjs`, `ui/room-client.test.mjs` |

The default LAN allowlist now maps **`/room-client.mjs` to `ui/room-client.mjs`**. Existing routes retain their meanings. `browserModules` supplies the safe extension seam for final WS1/WS3/WS4 wiring:

```js
browserModules: [
  { url: '/games/odd-laws-society/catalog.mjs', source: 'games/odd-laws-society/catalog.mjs' },
  { url: '/games/odd-laws-society/preview.mjs', source: 'games/odd-laws-society/preview.mjs' },
  // Add each actual public UI/media module by exact filename after its owner's handoff.
]
```

These sample entries are valid only after the named files exist. Accepted source paths are explicit `.js`, `.mjs` or `.css` files under `ui/games/<slug>/` or `ui/media/<slug>/`, and the exact public engine helpers `games/<slug>/catalog.mjs` and `games/<slug>/preview.mjs`. URLs must be explicit module paths under `/games/`, `/media/`, `/ui/games/`, or `/ui/media/`. There is a 128-entry limit. Wildcards, traversal, dot components, test/spec/fixture/private components, collisions, missing files and symlink aliases are rejected, including aliases to private files elsewhere inside the checkout. Serving checks symlinks again after startup.

WS6's exact additional shared updates for **this component** are:

1. Add `room-client.mjs` to the authored UI copy loop in `scripts/prepare-game.mjs`, generating `public/room-client.mjs`; regenerate the existing `public/transport.mjs` from the modified source.
2. Add `ui/room-client.mjs` to the explicit `runtime` array in `scripts/package-lan.mjs` and regenerate the portable archive at release assembly.
3. Add `{ "path": "ui/room-client.mjs" }` to `desktop/runtime-manifest.json` after WS5's handoff. Existing entries for `server/rooms.mjs`, `server/lan.mjs`, and `ui/transport.mjs` must use this component's tested versions.
4. Wire the real engine and projected client/view through the shared shell and register Odd Laws only after combined acceptance. Supply each completed public game/media module through `browserModules` or transfer the exact serving-list additions after this handoff.

No private engine, server source, test fixture, test directory, credential or database should enter browser serving. The test-only fixture has deliberately inspectable full private state and is never production registration.

## Verification and evidence

Baseline `npm test`: **66/66 passed** on Linux, Node **v24.22.3**, before WS2 changes. At the current local checkpoint, the focused command passes **79/79** and the expanded legacy command passes **81/81**, with no failures/skips. Counts overlap because both include existing room/LAN/transport tests.

```sh
node --test server/rooms.test.mjs server/lan.test.mjs \
  server/room-platform.test.mjs server/room-lan-integration.test.mjs \
  ui/transport.test.mjs ui/room-client.test.mjs
npm test
git diff --check
```

The focused suite includes 18 adversarial API tests and four actual three-client LAN tests. Serialized JSON and SSE frame assertions cover both first-voter orders, same-revision and forced CAS submissions, locked-vote reconnect, changed-content IDs, lost final responses, stale phases, forged actors, pre-reveal balance privacy, prior revealed history, rematch isolation, unauthorized/rotated streams, hostile Host/Origin, restored SQLite and expiry. The live stream test uses a 60-second heartbeat and requires mutation delivery within three seconds, so a heartbeat cannot masquerade as immediate push.

`.github/workflows/ws2-platform.yml` explicitly runs all new protocol suites on Node 22.13.0/Linux, Node 24/Linux and Node 24/macOS 15, plus the legacy regression command. It records the actual runtime and architecture. The original macOS 14 job was cancelled before execution with `The configuration 'macos-14-arm64-us-default' is not supported`; the workflow now uses the supported `macos-15` label from [GitHub's runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners). Its separate browser job installs pinned Playwright 1.62.1 under a temporary tool directory without changing root dependencies and runs:

```sh
SOFA_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
  node --test server/room-browser.test.mjs
```

That browser test uses three isolated Chromium contexts on a non-loopback HTTP origin, checks the real insecure-context crypto APIs, imports the actual served client/transport modules, exercises locked reconnect and a complete fixture match, loses/retries the final acknowledgment, and rejects an old command after rematch. An optional `SOFA_CHROMIUM_EXECUTABLE` selects an installed Chromium. The local managed workspace denies interface enumeration and Chromium's required socket operation, so this gate was obtained from the dedicated CI job; no local browser pass is claimed.

Verified remote evidence at the implementation checkpoint: [all four owned CI jobs passed](https://github.com/jonathanjie/sofa-arcade/actions/runs/44701040516), as did [the existing Game checks workflow](https://github.com/jonathanjie/sofa-arcade/actions/runs/44701040624). Both Linux versions passed **79/79** focused tests and **81/81** legacy tests. [The macOS job](https://github.com/jonathanjie/sofa-arcade/actions/runs/44701040516/job/136169213900) recorded `{"node":"v24.22.3","platform":"darwin","arch":"arm64"}` and passed the same two commands. [The actual Chromium job](https://github.com/jonathanjie/sofa-arcade/actions/runs/44701040516/job/136169213558) passed **1/1** browser scenario; the installed browser was Chrome 151.0.7922.34. The final head's repeated CI links are in the PR. `npm run build` also passed all five Vinext/Vite production build stages in a separate checkout with matching package and lockfile hashes; generated copies were not committed from this component branch.

Evidence is reproducible in the named test files and the PR's linked workflow jobs. Protocol tests are loopback/same-machine evidence, and the browser suite is a same-machine browser test. Neither establishes physical home Wi-Fi latency, TV casting, audio behavior, packaged Tauri execution, or a complete production Odd Laws match.

## Remaining gates and dependency requests

- No independent WS2 component gate remains. Any later runtime or contract change requires its affected tests and owned CI to be revalidated at the new head.
- WS6: connect the real WS1 engine and WS3 views, apply the exact preparation/package entries above, register only after acceptance, and rerun the combined games/desktop tests.
- WS5/WS6: validate the packaged Mac lifecycle and explicit runtime manifest with this host API.
- Hardware acceptance: two actual phone browsers on Jon's Wi-Fi, TV/casting, real disconnect/resume behavior, and audio. These remain separate from protocol CI.

No root dependency changes, new database migrations, hosted transport, merge, deployment or public release is requested by this component.
