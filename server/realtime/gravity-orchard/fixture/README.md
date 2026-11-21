# GO2 transport fixture

This is an independent diagnostic application using the real GO2 coordinator and browser client. Its two deterministic markers demonstrate authenticated seat ownership and applied input; they are **not** the final orchard engine, assets, scoring, or phone sensor implementation.

From the repository root:

```sh
npm ci --prefix server/realtime/gravity-orchard --ignore-scripts --no-audit --no-fund
node server/realtime/gravity-orchard/fixture/server.mjs
```

Open `http://127.0.0.1:4182/`. The TV view links to Jon and Lydia controllers. The role selector is deliberately fake fixture authority; this server binds only to loopback and must not become a production route. Each controller obtains a random, short-lived, in-memory credential through a same-origin POST and authenticates it in the first WebSocket message. Credentials never enter the links, DOM, screenshots, console, or diagnostic evidence.

The default port is 4182; `GO2_FIXTURE_PORT=0` requests an available port. The exported `createFixtureServer({ port, simulation, roomCode })` returns `{ origin, roomCode, coordinator, diagnostics, close }`. `diagnostics()` returns copied, credential-free counters. The fixture accepts a mock simulation override for fast component tests and creates an untimed practice run by default.

## What to try

1. Open the two phone views, tap **Ready** on each, and wait for the 180-tick countdown.
2. Drag each steering pad or use arrows/WASD. Hold the large **Brake** button or Space. The round Jon marker and diamond Lydia marker show the server's applied input; releasing steering returns to neutral plus Brake.
3. Request a shared pause. Reconnection alone does not resume: both controllers must become ready again.
4. **Drop socket · 3s** closes that browser's actual socket and temporarily rejects its reconnection attempts. Watch the stale-input brake and subsequent shared network pause. **Reconnect** removes the injected outage and permits the normal retry.
5. **Send stale input · 1s** changes only the outgoing observed tick to zero. The authoritative stale-tick guard rejects those frames; they cannot refresh input freshness. This is an invalid-input experiment, not client authority.
6. **Delay snapshots · 500ms** delays browser delivery while keeping only one newest pending snapshot. The counter shows the replaced snapshots. Real TCP slow-reader and server-output bounds are separately exercised by the adversarial suite; this button does not pretend to stop the browser's TCP reader.
7. **Jump host clock +1s** advances the injected monotonic host clock. The coordinator must pause with `host-stall` instead of simulating the whole gap. This fixture-only control requires the fake host credential.

The monitor reports client-measured acknowledgment or ping round-trip, observed-to-applied tick difference, actual received snapshot rate, socket buffered bytes, reconnections, and host checkpoint counts. Observed-to-applied tick difference includes tick scheduling; it is not exact accepted-at-receipt age or one-way clock latency. Measurements are local to the fixture, not home Wi-Fi or TV casting results.

## Checks and evidence

```sh
node --test server/realtime/gravity-orchard/tests/fixture.test.mjs
node server/realtime/gravity-orchard/node_modules/playwright/cli.js install chromium
node server/realtime/gravity-orchard/tests/run.mjs --browser
```

The browser test launches three isolated contexts, uses the actual sockets and UI, and writes eight screenshots plus `browser-evidence.json` under `server/realtime/gravity-orchard/evidence/browser/` by default. Set `GO2_EVIDENCE_DIR` for CI output, `SOFA_PLAYWRIGHT_MODULE` for an existing pinned Playwright module, or `SOFA_CHROMIUM_PATH` for an explicitly available Chromium executable. No network traces or authentication-frame recordings are collected.

The browser evidence records the checkout SHA and measured counters. Its limitations explicitly exclude real iOS Safari, Android Chrome, phone motion, certificate trust, home Wi-Fi, TV casting, and packaged Mac operation. The workstream report records which commands actually passed and where screenshots were inspected; the existence of this fixture is not evidence that a browser or physical-phone test passed.

## Runtime boundaries

The fixture imports only owned GO2 modules and Node built-ins. `simulation.mjs` exports the frozen simulation seam plus `createMockSimulation({ countdownTicks, stageTicks })`; it has no IO, random IDs, clocks, transport, or final game logic. `upgrade-policy.mjs` demonstrates exact Host/Origin/route validation using the original request's TLS flag and rejects forwarded-header scheme spoofing. It is a fixture policy, not a production advertised-origin decision.

The static server allowlist contains only the fixture page/styles/application and the two browser runtime modules. Private simulation/checkpoints/server code, source trees, root manifests, and arbitrary paths are not served. GO7 must exclude the entire fixture, tests, and evidence from production/browser/native delivery.
