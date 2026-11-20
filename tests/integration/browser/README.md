# Rendered local acceptance

Run from the repository root after installing the pinned root dependencies and
preparing the release files:

```sh
npx playwright install --with-deps chromium
node tests/integration/browser/sofa-kingdoms.mjs
node tests/integration/browser/odd-laws.mjs
```

The runner creates a real local HTTP/SQLite/SSE server at an unused loopback port
and three isolated Chromium contexts. Host/seat credentials are obtained through
the rendered interface and remain in the temporary browser profiles. The runner
blocks and records external HTTP(S) page requests. It records page exceptions,
missing static resources, screenshot sizes, checked journeys, and the source SHA.
Screenshots and a machine-readable report go to `tests/integration/evidence/`.
The database and browser contexts are removed after the run.
Normal screenshots capture the viewport, and the report records both viewport
and actual PNG dimensions. On failure, an overflowing document also gets a
separately named full-page image; that image never substitutes for the viewport
fit assertion.

`SOFA_CHROMIUM` may point to an existing Chromium executable. The default uses
Playwright's installed browser. `SOFA_EVIDENCE_DIR` changes the evidence directory;
`SOFA_ACCEPTANCE_ROOT` runs an extracted repo-shaped runtime while retaining this
checkout's test driver. No runtime dependencies are installed in the extracted
package by the test.

The Sofa Kingdoms journey covers host plus two independently authenticated
phones, ten rounds through actual controls, results and a fresh rematch,
controller refresh, a passive network disconnect/reconnect, all eight optional
tutorial lessons and skip/replay without changing the live room, saved
music/effects/volume settings, quiet default phone audio, gesture audio unlock,
reduced motion, collection navigation, and persistence after stopping/restarting
the local host and opening a fresh root document at the same origin. Root launch
must restore the saved host role/room; an explicit collection exit must clear that
restoration. Screenshots cover 1920×1080 and 1280×720 TV
viewports, plus 360×800 and 390×844 controller viewports.

The Odd Laws driver runs a full rich-action match with each initial Chair, then
two full rematches: one deliberately tied and one that fills both cities. The
seed is fixed at the real engine's creation boundary; game states and decisions
are never inserted into the authority. Actual controller buttons submit every
Council, Build, Work, Lobby and Festival command. The driver checks both all-pay
outcomes, sealed per-viewer HTTP projections, replay of captured duplicate/stale
commands, exact public score accounting, disabled full/exhausted purchases,
private refresh, browser disconnect/reconnect, SQLite restart, bare-root role
restoration and old-match isolation. A lost-acknowledgment case commits the real
command, drops four responses, holds its recovery response while live SSE moves
to the next phase, and requires the controller to wait for that acknowledgment
before another action. It completes all ten guided lessons,
skip/resume/replay, Help/agenda/almanac, host-only default music, persisted audio
controls, reduced-motion animation properties, live OS motion-preference changes
without losing the room/role/state, and collection exit. Screenshots
show councils, private seals, Build previews, unavailable purchases and results.

Before the collection is enabled, run the candidate gate with:

```sh
SOFA_ACCEPTANCE_CANDIDATE=1 node tests/integration/browser/odd-laws.mjs
```

That explicit mode uses WS2's real `createRoomApi` injection seam only to allow
the planned game and fix its creation seed. A real API response creates the room
and delivers its host credential to temporary browser storage; subsequent
joining, starting and the entire journey use the real UI. Evidence records this
exception and the unchanged catalog status. Once it passes and the catalog is
enabled, rerun without the flag: the final gate must create the room through the
playable collection card. Missing delivered modules are a failure, never a skip.
`SOFA_ACCEPTANCE_CHAIR=jon` or `lydia` may narrow a diagnostic rerun; final acceptance
must cover both. The report records the exact seed and source revision.

Rendered latency uses a monotonic clock from actual browser POST emission to
matching visible resources/city/turn/readiness or results in each context. It
includes browser rendering, driver scheduling and up to 40ms observation
granularity. The report retains individual samples and median/p95/maximum by
viewer. Median averages the middle two samples when even; p95 uses nearest rank.
It makes no claim about a home network or physical screen.

These checks establish Chromium/local-server behavior only. They do not establish
macOS WKWebView, native startup/quit, actual phone browsers, home Wi-Fi/casting
latency, audio output quality, or signed/notarized installation. Desktop CI and
physical-device checks remain distinct gates. A runner launch failure is a failed
gate, never substituted with a screenshot from a fixture or an older build.
