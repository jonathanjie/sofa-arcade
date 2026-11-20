# Rendered local acceptance

Run from the repository root after installing the pinned root dependencies and
preparing the release files:

```sh
npx playwright install --with-deps chromium
node tests/integration/browser/sofa-kingdoms.mjs
```

The runner creates a real local HTTP/SQLite/SSE server at an unused loopback port
and three isolated Chromium contexts. Host/seat credentials are obtained through
the rendered interface and remain in the temporary browser profiles. The runner
blocks and records external HTTP(S) page requests. It records page exceptions,
missing static resources, screenshot sizes, checked journeys, and the source SHA.
Screenshots and a machine-readable report go to `tests/integration/evidence/`.
The database and browser contexts are removed after the run.

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
the local host at the same origin. Screenshots cover 1920×1080 and 1280×720 TV
viewports, plus 360×800 and 390×844 controller viewports.

These checks establish Chromium/local-server behavior only. They do not establish
macOS WKWebView, native startup/quit, actual phone browsers, home Wi-Fi/casting
latency, audio output quality, or signed/notarized installation. Desktop CI and
physical-device checks remain distinct gates. A runner launch failure is a failed
gate, never substituted with a screenshot from a fixture or an older build.
