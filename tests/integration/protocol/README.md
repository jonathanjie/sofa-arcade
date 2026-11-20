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
| Odd Laws full matches | Both initial Chairs, all six councils and all 36 city turns, all four actions, finite term stocks, all-pay bids, both arrival orders, identical choices/ties/zero bids, phase/revision/actor fencing, score accounting and rematch |
| Odd Laws edge matches | Legal action sequences that exhaust stocks and fill both cities; separate full Work match with exact shared victory and no extra final income |
| Odd Laws concurrency | Racing same-revision votes through separate HTTP requests, exactly-once reveal/payment and concurrent retries |
| Odd Laws confidentiality | Change only one seat's hidden choice/bid in two deterministic matches; require equality of the entire serialized public/host/opponent projections over both HTTP and SSE |
| Odd Laws restart | Save a sealed vote, stop/restart SQLite host, restore that commitment only to its authenticated seat, finish the original council without a second deduction |

The deterministic Odd Laws test setup overrides only the engine's setup seed through the platform's explicit injection seam, allowing mirrored Chair tests without probabilistic retries. The server still uses the real engine transitions, validation, projection, credentials, compare-and-swap, persistence, and per-subscriber streaming. This test seam does not enable the game in the production catalog. Normal production registration and browser journeys are separate integration gates.

`fixtures/odd-laws-scenarios.mjs` contains public decision plans only. `fixtures/legacy-sofa.mjs` is an explicitly isolated historical-state fixture, inserted only while its temporary server is stopped. Neither fixture belongs in served assets, the portable player archive, or the desktop runtime.

## Latency methodology

The diagnostic JSON measures `performance.now()` immediately before submitting each successful city action by HTTP. The endpoint is the timestamp when each authenticated subscriber has parsed the resulting revision from SSE. It reports sample count, median, nearest-rank p95 and maximum in milliseconds. The heartbeat interval is 60 seconds while update waits are five seconds, so successful short runs exercise mutation-triggered push rather than heartbeat polling. No latency threshold is used to claim product performance; the timeout detects missing delivery.

These are same-process loopback measurements, affected by test load, Node version, and the CI host. They include HTTP submission, SQLite/rule work, projection, stream delivery and JSON parsing. They exclude phone rendering, actual LAN/Wi-Fi, sleep on physical devices, AirPlay/casting, TV refresh and human input. Native lifecycle, physical phone/TV and audio/visual acceptance require their own evidence.
