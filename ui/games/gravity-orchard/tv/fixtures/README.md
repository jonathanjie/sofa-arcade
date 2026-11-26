# GO4 public presentation fixture

This is an explicitly injected, loopback-only diagnostic surface. It mounts the
real TV and tutorial components with public snapshots and public geometry. It
does not import the game engine, connect to a room, simulate fruit, request phone
sensors, or create audio contexts. This fixture uses diagnostic geometry. The integrated game uses the authored level geometry.

From `ui/games/gravity-orchard/tv`:

```sh
npm ci
npm test
npx playwright install --with-deps chromium
npm run test:browser
npm run fixture
```

The fixture opens at `http://127.0.0.1:4194/tv/fixtures/`. Its header identifies it
as **GO4 · PUBLIC FIXTURE**, offers every lifecycle/hazard scenario, and advances
a three-stage transcript one explicit frame at a time. `?scene=dense` selects an
initial scenario. The test-only `clean=1` query hides the fixture toolbar so the
component is measured in the entire requested 1280×720 or 1920×1080 viewport.

## Test seams

`window.fixture` is available only from this fixture page:

- `show(name)` injects a fresh match for one named diagnostic scenario.
- `update(view)` delivers a supplied snapshot to the mounted TV. It records the
  delivered object separately; it does not assert that the TV accepted it.
- `view()` returns a copy of the last delivered snapshot.
- `setConnection(status)` passes coordinator-owned status/presence separately.
- `advance(ms)` advances the injected presentation clock. It never changes a
  snapshot's gameplay clock, fruit, recipes, score, or phase.
- `commands`, `commandResults`, `sounds`, and `exits` record injected callbacks.
- `setAutoApply(false)`, `holdNext()`, `releaseNext()`, and `rejectNext()` support
  authoritative command acknowledgment/snapshot tests. When enabled, automatic
  fixture responses are explicit cloned pause/retry/rematch snapshots, not TV
  prediction or a second simulation.
- `remount(options)`, `dispose()`, and `mountTutorial(options)` exercise lifecycle
  cleanup, missing assets, and the tutorial's isolated API.
- `makeJourney({perfect,matchId})` supplies a monotonic three-stage transcript.

The fixture server serves an explicit list of browser-safe component modules.
Requests for engine/transport/server sources, installed tooling, checkout data,
or unlisted paths return 404. It is not a production server or room authority.

## Evidence

Rendered tests attach screenshots to the HTML report in `../tests/report/` and
write stable evidence names under `evidence/`. Raw Playwright traces/failures
are under `../tests/artifacts/`; the machine-readable run is
`../tests/results.json`. CI retains all of these as one run artifact. Screenshots
must be visually inspected; generation alone is not a visual review.

These fixtures verify browser presentation and isolated interactions. They do
not establish real phone sensor delivery, LAN latency, Tauri/WKWebView behavior,
TV casting, physical audio, native packaging, or full engine/transport gameplay.
