# Gravity Orchard simulation lab

This is an executable **development harness**, with the real GO1 engine and diagnostic code-native graphics. It is intentionally absent from the production/browser runtime inventory. It does not wire a room, enable the catalog card, impersonate authenticated phone controllers, or load final art/music.

## Run

From the repository root, Node 22.13 or newer:

```sh
node games/gravity-orchard/harness/server.mjs --port=4181
```

Open `http://127.0.0.1:4181/harness/`. The listener binds only loopback, checks Host, and serves an explicit development file list. The manual harness has **no npm or network dependency**. Its engine import is deliberate in this local diagnostic; `engine.mjs`, physics, supply, validation, and harness files are not part of the game's browser-safe public closure.

| Control | Jon | Lydia |
| --- | --- | --- |
| Steer | W A S D | Arrow keys |
| Hold Brake | Space | Either Shift |
| Ready both / resume | R | R |
| Pause together | P | P |

The buttons expose separate readiness, pause, host retry, new match, and campaign/practice selection. Opening Help pauses the run. Focus loss clears keys and requests pause. New run allocates a new diagnostic match ID, including when the seed is reused. Practice has no deadline or gust. The three normal stages each retain the contracted 5,400 active-tick limit.

## What the board shows

- Four baskets with matching fruit silhouettes, their capture radius, and actual buffer counts.
- Both tray force regions, ordinary tilt/Brake arrows, and a continuous bridge blend.
- Exact circle/rectangle/segment collision geometry, plus recent contact normals from authoritative diagnostics.
- Stable fruit IDs, velocity arrows, recipe progress, time, global tick, epoch, active-fruit count, collision-work counters, and the bounded event ring.
- Gate forecasts/deferred closure and seeded gust direction/countdown.

The optional **Route demo** is a feedback controller. Its only game input is the public view; it outputs the same normalized controls as a phone or keyboard. It cannot edit state, choose the next fruit, teleport an entity, disable a collision, or award a recipe. A gold path is a plan; only actual engine captures change baskets/orders. The companion route proof replays the emitted inputs and compares the full authoritative checkpoint digest.

## Browser evidence

Browser-only test dependencies are locked under this folder:

```sh
npm ci --prefix games/gravity-orchard/harness
node games/gravity-orchard/harness/node_modules/playwright/cli.js install --with-deps chromium
GO1_BROWSER_EVIDENCE=/tmp/gravity-orchard-browser-evidence \
  node games/gravity-orchard/harness/browser-check.mjs
```

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` only when using an already installed, supported Chromium. The test launches a local headless browser and a same-process loopback server. No certificate bypass, web-security override, or sensor emulation is needed. It checks a real keyboard basket capture, both gardeners' controls, held Brake, pause/resume time conservation, Help, a full rendered three-stage campaign, retry, and untimed practice. Captures cover 1280×720 and 1920×1080; inspect them visually as well as checking the assertions.

`window.orchardLab` is a test-only API for bounded fixed-tick advancement, controls, commands, public views, diagnostics, and transcript export. It contains no state setter. `advance(n)` accelerates elapsed **wall time**, not the fixed physics interval. The normal rAF scheduler advances at 60 Hz, caps catch-up to five ticks, and pauses on a host gap above 250 ms.

Browser screenshots or automated routes do not establish physical-phone tilt, home Wi-Fi latency, casting performance, accessibility on real hardware, or human balance. Those remain integration/human validation tasks.
