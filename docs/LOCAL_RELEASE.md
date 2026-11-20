# Local Sofa Arcade — build and acceptance guide

This guide follows the WS6 integration candidate. Its authoritative dependency
checkpoint is [`tests/integration/components.json`](../tests/integration/components.json),
and executed results are in [the integration report](workstreams/integration.md).
The candidate remains a draft until every essential component and the complete
automated/native acceptance gates pass. A planned game cannot create a room.

## Play from a source checkout or portable ZIP

The dependency-free LAN host requires **Node.js 22.13 or newer**. It uses Node's
built-in HTTP server and SQLite. You do not need to install the development
dependencies or build the framework to play from a complete checkout.

```sh
node --version
node scripts/lan-server.mjs
# Optional, if the default port is occupied:
node scripts/lan-server.mjs --port 4178
```

On a Mac, the portable ZIP also supplies `start-sofa.command`. Unzip it before
opening that launcher. Leave its Terminal window open for the duration of play.
The launcher checks the installed Node version and prints a useful error when
the runtime is missing. The portable ZIP does not bundle Node.

Use the LAN address printed by the host on the Mac, choose an available game,
and create a room. Scan its QR code on two separate phone browsers. Choose Jon
on one phone and Lydia on the other, then start from the TV/host. The QR contains
a join address and room code; it does not contain either player's credential.
All three devices must reach the Mac on the same local network. Allow incoming
connections for the host if macOS asks. A guest network may isolate devices.

The Mac's browser can be shown on the TV. Casting delay is additional to game
transport time. Local play needs no internet connection after the runtime and
assets have been obtained. Existing public-hosted rooms use a different room
store and do not migrate into the local host.

Refresh preserves a seat in the same browser profile. Relaunching the same
local origin restores the last active room when its saved credential is valid.
Choosing the collection explicitly clears that active-room pointer. Do not
erase browser storage during a match; each phone owns its own credential.

The portable host saves rooms in `.sofa-lan/rooms.sqlite`, outside the download
inputs. Closing the host preserves the database. Rooms still have their normal
24-hour lifetime. Stop with Control+C before moving a saved database; do not
include it in an archive, screenshot bundle, or bug report.

## Native Mac application

The native component is supplied by WS5. Until its ready head is included in
the component matrix, this is a pending delivery path, not a downloadable
accepted release. A completed Tauri app starts its bundled local host itself;
players do not install Node or keep Terminal open. Its saved origin and private
application-data database allow quit/relaunch recovery.

After the tested WS5 handoff is incorporated, use the commands in
`desktop/README.md` on the matching Mac architecture. The owner currently
targets macOS 13.5 or newer, Apple Silicon and Intel, with a pinned Node
24.22.3 runtime and locked nested build dependencies:

```sh
cd desktop
npm ci --ignore-scripts
npm run stage
npm test
npm run test:rust
APPLE_SIGNING_IDENTITY=- npm run build:mac:arm64
# On an Intel Mac, use build:mac:intel instead.
npm run test:native:release -- --app "/absolute/path/Sofa Arcade.app"
```

The ad-hoc signature used for CI/local validation is not Developer ID signing
or notarization. Native acceptance must execute the packaged application and
its bundled Node. A generated app directory or a Linux host test does not prove
a Mac launch. Use a disposable Mac user for the native acceptance scripts;
they refuse to overwrite an existing Sofa Arcade profile.

The separate instrumented native UI build is for acceptance only. It must not
replace the ordinary production app/DMG. The native workflow records the actual
runner architecture, source SHA, signatures, runtime inventory, checksums,
lifecycle evidence and WKWebView screenshots.

## Reproduce the automated checks

Use a clean checkout of the exact SHA named in the PR or evidence report.
Dependency-free rules and protocol checks can run immediately:

```sh
npm test
node --test games/odd-laws-society/tests/*.test.mjs
node games/odd-laws-society/tests/generate-fixtures.mjs --check
node games/odd-laws-society/simulation/sweep.mjs --smoke
node --test server/rooms.test.mjs server/lan.test.mjs \
  server/room-platform.test.mjs server/room-lan-integration.test.mjs \
  ui/transport.test.mjs ui/room-client.test.mjs
node --test tests/integration/protocol/*.test.mjs
```

Build and inspect the browser/portable deliverables before release acceptance:

```sh
npm run install:ci
node scripts/prepare-game.mjs
npm run package:lan
npm run test:integration
npm run build
npm run verify:components
npm run verify:local-release
```

The strict verification commands fail when a component is missing or its
recorded head is absent from the candidate's ancestry. Preparatory dependency
skips are not a release pass. These Node checks are necessary; rendered browser
and macOS native CI must pass separately. The package test also starts a host from an
extracted ZIP, follows its public module/asset graph, and probes forbidden
authority, fixture, credential and database paths.

Rendered acceptance requires Chromium and an environment that permits its
normal process/socket operations:

```sh
npx playwright install --with-deps chromium
SOFA_EVIDENCE_DIR=/absolute/path/to/evidence \
  node tests/integration/browser/sofa-kingdoms.mjs
SOFA_EVIDENCE_DIR=/absolute/path/to/evidence \
  node tests/integration/browser/odd-laws.mjs
```

The Odd Laws final journey requires a playable collection entry. Before initial
enablement, WS6 may set `SOFA_ACCEPTANCE_CANDIDATE=1` solely in the acceptance
driver. This test creates a real authenticated room through an injected game
resolver while retaining the delivered engine, actual HTTP/SSE, SQLite and
phone views. It does not change the shipped catalog. After candidate acceptance,
enable the game and rerun the normal collection-to-results journey without that
flag. `SOFA_ACCEPTANCE_CHAIR` is for a targeted failure investigation; final
acceptance runs both initial Chairs.

Protocol timing measures successful action POST start to the resulting parsed
SSE revision for the host and both seats on loopback. A 60-second heartbeat and
five-second update timeout distinguish immediate pushes from heartbeat polling.
Reports include the exact commit/tree, clean-worktree indicator, runtime,
observed samples and percentile method. Browser reports measure the separate
request-to-render path. Neither establishes home Wi-Fi, physical-phone, TV,
casting or human-input latency.

## Delivery inventory and public/private boundary

| Deliverable | Inventory and verification |
| --- | --- |
| Browser modules | `scripts/runtime-files.mjs` → `BROWSER_FILES`; preparation copies each exact authored source into `public/` and regenerates `app/route.ts` |
| Secure LAN routes | Explicit `SOURCES` entries in `server/lan.mjs`; no source-directory serving or URL-supplied module registration |
| Portable ZIP | `public/downloads/sofa-arcade-local.zip`; explicit `runtimeFiles()` entries, deterministic bytes, executable launcher |
| ZIP member manifest | `sofa-arcade-local/artifact-manifest.json` inside the archive; path, byte count, mode and SHA-256 for every other member |
| Desktop runtime | WS5's `desktop/runtime-manifest.json`; explicit repo-shaped files, checksum-verified bundled Node, staging inventory |
| Native artifacts | CI production `.app.zip`/DMG plus SHA-256 evidence; exact source and architecture named in artifact metadata |
| Acceptance evidence | CI JSON reports/screenshots and `docs/workstreams/integration.md`; failed-run artifacts are identified as diagnostics |

Odd Laws browser code receives only public catalogs/helpers and authenticated
projected room state. Its authority and projection modules belong on the host.
Engine fixtures, simulation harnesses, tests, evidence, package dependencies,
credentials and runtime databases are not browser assets or package members.
The final media manifest must resolve to packaged local files, and its declared
final/placeholder status must be accurate.

## Hardware and distribution sign-off

Record the hardware, operating systems/browsers, network and exact artifact SHA
when Jon and Lydia run physical acceptance. The remaining checks are a real
Mac app launch; two separate phone browsers; TV/fullscreen/casting; both games;
device sound after a gesture; preferences and reduced motion; internet-disconnected
play; sleep/wake and LAN address changes; quit/relaunch recovery; and downloaded
app Gatekeeper behavior. Report Apple Silicon and Intel results separately.
Developer ID signing and notarization require a separate distribution step.

No merge, deployment, or release publication is part of this integration task.
