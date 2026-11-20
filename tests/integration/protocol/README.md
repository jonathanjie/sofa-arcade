# Local protocol acceptance

These tests start the real Node HTTP/SQLite/SSE LAN host on `127.0.0.1` with an isolated database. The TV, Jon and Lydia have three separate authenticated HTTP/SSE sessions. They never receive the full private engine state. Raw HTTP response text and individual SSE JSON payloads are examined before any test reconstruction.

```sh
node --test tests/integration/protocol/*.test.mjs
SOFA_INTEGRATION_REQUIRE_COMPONENTS=1 node --test tests/integration/protocol/*.test.mjs
```

The first command supports harness preparation: unavailable WS1 engine files or the WS2 injection factory produce **named skips**. Those skips do not establish Odd Laws acceptance. The second command is the required release mode and fails if those dependencies are missing. Once the components are present, both commands execute the same complete scenarios.

## What is exercised

| Suite | Evidence |
| --- | --- |
| Sofa Kingdoms match | Complete ten-round real-room match, three pushed views, unchanged v3 opening bonus, duplicate retry, changed-content ID rejection, lost final response, rematch isolation |
| Sofa persistence | Real on-disk SQLite, host close/restart on the same origin, same saved credentials/state/revision, phone stream refresh |
| Sofa v1/v2 | Explicit historical state fixtures in a temporary database, historical banking/toy/winner behavior, migration only on a new v3 match |
| Odd Laws full matches | Both initial Chairs, all six councils and all 36 city turns, all four actions, finite term stocks, all-pay bids, both arrival orders, identical choices/ties/zero bids, phase/revision/actor fencing, non-tie winner accounting and rematch |
| Odd Laws edge matches | Legal action sequences that exhaust stocks and fill both cities; separate full Work match with exact shared victory and no extra final income |
| Odd Laws concurrency | Racing same-revision votes through separate HTTP requests, exactly-once reveal/payment and concurrent retries |
| Odd Laws confidentiality | Change only one seat's hidden choice/bid in two deterministic matches; require equality of the entire serialized public/host/opponent projections over both HTTP and SSE |
| Odd Laws restart | Save a sealed vote, stop/restart SQLite host, restore that commitment only to its authenticated seat, finish the original council without a second deduction |
| Odd Laws command recovery | Drop a real committed command's acknowledgment, exhaust the real client's retries, advance by authenticated SSE, remount the view for reduced motion while retaining the authenticated client, recover the same request identity, then accept the next city action without a duplicate bid payment |
| Registry error compatibility | The production server adapter preserves real engine results and maps only known typed rule codes to the platform's fixed safe messages; real invalid-bid, locked-vote and low-coin errors leave authority unchanged and never disclose sealed choices |
| Public delivery boundary | Stage only declared browser copies, runtime assets and the named ZIP; exclude source/authority/database canaries without deleting authored files; reject missing/symlinked inputs and escaped staging parents; request actual WS4 source files from the checkout LAN host and require 404 |

The deterministic Odd Laws test setup overrides only the engine's setup seed through the platform's explicit injection seam, allowing mirrored Chair tests without probabilistic retries. The server still uses the real engine transitions, validation, projection, credentials, compare-and-swap, persistence, and per-subscriber streaming. This test seam does not enable the game in the production catalog. Normal production registration and browser journeys are separate integration gates.

The command-recovery test uses the production room client and shell bridge against the real host. Its mounted view records lifecycle callbacks without a browser DOM; the rendered browser suite owns visual evidence. Reducing that client's retries to zero deliberately reaches the same exhausted-request path promptly. The simulated loss occurs only after the authority has committed. A reduced-motion preference remount must retain the one client and uncertain command, while dispatch from the retired view fails without a request or sound gesture. Recovery is held long enough to assert that repeated connection callbacks share one retry and do not report a completed connection prematurely.

The candidate server resolves the same `oddLawsRoomEngine` adapter used by the shared production registry. The adapter translates codes on known typed action failures, rebuilding those errors without their original text or diagnostic properties. Unknown errors remain subject to the platform's existing generic redaction. Its named server-only export permits candidate testing while the catalog remains planned; both the registry and private engine remain unavailable over static HTTP. The low-coin error case is reached by real Council, Build and Work commands, without inserting game state.

`fixtures/odd-laws-scenarios.mjs` contains public decision plans only. `fixtures/odd-laws-policy.mjs` exports `phaseAction`, `councilCommitments`, and `choosePublicAction(view, playerId, publicRules, policy)` for protocol and rendered-browser acceptance. The rich policy deliberately substitutes one final-session Lobby for Lydia's Festival to exercise a winning result; the separate all-Work policy guarantees a shared victory. These are coverage fixtures, not strategy recommendations. `fixtures/legacy-sofa.mjs` is an explicitly isolated historical-state fixture, inserted only while its temporary server is stopped. None of these fixtures belongs in served assets, the portable player archive, or the desktop runtime.

## Latency methodology

The diagnostic JSON measures `performance.now()` immediately before submitting each successful city action by HTTP. The endpoint is the timestamp when each authenticated subscriber has parsed the resulting revision from SSE. It reports sample count, median, nearest-rank p95 and maximum in milliseconds. The heartbeat interval is 60 seconds while update waits are five seconds, so successful short runs exercise mutation-triggered push rather than heartbeat polling. No latency threshold is used to claim product performance; the timeout detects missing delivery.

These are same-process loopback measurements, affected by test load, Node version, and the CI host. They include HTTP submission, SQLite/rule work, projection, stream delivery and JSON parsing. They exclude phone rendering, actual LAN/Wi-Fi, sleep on physical devices, AirPlay/casting, TV refresh and human input. Native lifecycle, physical phone/TV and audio/visual acceptance require their own evidence.

### CI artifacts

Set `SOFA_EVIDENCE_DIR` to save the observed timings as structured JSON:

```sh
SOFA_EVIDENCE_DIR=/tmp/sofa-evidence node --test tests/integration/protocol/*.test.mjs
```

Successful full matches write one `*-latency.json` file each. The file contains per-viewer samples and statistics, method/exclusions, the actual Node/platform/architecture, and Git commit/tree identities captured before and after the match. Optional GitHub run/SHA metadata is included when available. A dirty or changed checkout is explicitly labeled as local diagnostic evidence rather than evidence for an immutable release commit. Put the evidence directory outside the checkout, or in an ignored artifact directory, to avoid evidence files themselves dirtying the source check.

Only allowlisted scalar source fields, numeric samples, and known scenario IDs are serialized. Room codes, credentials, client IDs, actions, snapshots, private state, raw HTTP bodies and raw SSE bodies never enter these artifacts. The in-memory assertions still inspect the real serialized payloads.
