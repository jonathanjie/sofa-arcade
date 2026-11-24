# Local Sofa Arcade — build and acceptance guide

This guide follows the WS6 integration candidate. Its dependency checkpoint is
archived at [`docs/archive/local-release-components.json`](archive/local-release-components.json)
and is no longer enforced. Executed results are in [the integration report](archive/workstreams/integration.md).
The candidate remains a draft until every essential component and the complete
automated/native acceptance gates pass. All five components are included; Odd
Laws is enabled after the complete browser candidate passed at `4695643`.
The enabled collection path and combined native artifacts are being revalidated.
A planned game cannot create a room.

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

Refresh preserves a seat in the same browser profile at the same origin
(protocol, address and port). Relaunching that origin restores the last active
room when its saved credential is valid. Choosing the collection explicitly
clears that active-room pointer. Do not erase browser storage during a match;
each phone owns its own credential.

If the Mac's LAN address or host port changes, phones reach a different browser
origin. Scanning its new QR does not transfer their credentials or reclaim the
occupied seats in an existing room. Restore the previous LAN address and port
to continue that saved match, or create a new room and join both seats there.
Use the same browser profile that originally joined. When only the Mac's LAN
address changes, the native app keeps its separate loopback origin and saved
host state; it cannot transfer a phone's browser identity across LAN origins.

The portable host saves rooms in `.sofa-lan/rooms.sqlite`, outside the download
inputs. Closing the host preserves the database. Rooms still have their normal
24-hour lifetime. Stop with Control+C before moving a saved database; do not
include it in an archive, screenshot bundle, or bug report.

## Native Mac application

The tested WS5 component is included in the component matrix. The combined
Mac artifacts must still pass final acceptance before becoming an accepted
release. The Tauri app starts its bundled local host itself;
players do not install Node or keep Terminal open. Its saved origin and private
application-data database allow quit/relaunch recovery.

Once a tested native artifact is available, open **Sofa Arcade.app**, choose an
available game and **Host on the TV**. Both phones scan the room QR and choose
different seats. **View → Full Screen** controls the board window.
**Connection → Refresh Network** refreshes the Mac's advertised LAN addresses
and reloads its board at the same loopback origin. The phone-origin limitation
above still applies. **Connection → Retry Local Host** retries a failed host.
If another application occupies the saved port, close that application only
after identifying it, then retry; Sofa Arcade does not attach to or stop it.

Quit Sofa Arcade to stop its owned host. The native database lives in
`~/Library/Application Support/com.sofaarcade.desktop/rooms.sqlite`, with the
normal 24-hour room lifetime. `config.json` stores the selected port and public
room route. Host and phone credentials remain in their respective webview or
browser storage. The portable `.sofa-lan` store and native application-data
store are separate; switching packages does not migrate an in-progress room.

For the incorporated tested WS5 component, use the commands in
`desktop/README.md` on the matching Mac architecture. The owner currently
targets macOS 13.5 or newer, Apple Silicon and Intel, with a pinned Node
24.22.3 runtime and locked nested build dependencies. Development requires
Xcode Command Line Tools, Rust 1.100.0 and Node 24.22.3. Initial installation,
runtime staging and dependency downloads require internet access. The installed
app obtains its runtime and assets from its bundle.

From the repository root on an Apple Silicon Mac:

```sh
cd desktop
npm ci --ignore-scripts
npm run stage
npm test
node scripts/verify-runtime.mjs
RUSTUP_TOOLCHAIN=1.100.0 npm run test:rust
RUSTUP_TOOLCHAIN=1.100.0 APPLE_SIGNING_IDENTITY=- npm run build:mac:arm64
# On an Intel Mac, use build:mac:intel instead.
mkdir -p artifacts/production
ditto "src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Sofa Arcade.app" \
  "artifacts/production/Sofa Arcade.app"
npm run test:native:release -- --app "$PWD/artifacts/production/Sofa Arcade.app"
```

The Intel target path is `x86_64-apple-darwin`. Build and execute each artifact
on its matching native architecture. These commands do not create a universal
binary. The `.app` and `.dmg` outputs are under
`desktop/src-tauri/target/<target>/release/bundle/`.

The ad-hoc signature used for CI/local validation is not Developer ID signing
or notarization. Native acceptance must execute the packaged application and
its bundled Node. A generated app directory or a Linux host test does not prove
a Mac launch. Use a disposable Mac user for the native acceptance scripts;
they refuse to overwrite an existing Sofa Arcade profile.

Preserve the production bundle before building the separate instrumented
application, because both build variants use the target's bundle directory.
From `desktop/`, on Apple Silicon:

```sh
RUSTUP_TOOLCHAIN=1.100.0 APPLE_SIGNING_IDENTITY=- npm run build:native:arm64
SOFA_APP_PATH="$PWD/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Sofa Arcade.app" \
  npm run test:native:ui
```

Use `build:native:intel` and the Intel target path on an Intel Mac. The
instrumented build enables the native test driver and is for acceptance only.
The production app/DMG omits that driver. WS6's separate
`tests/integration/native/run.mjs` verifies the combined Odd Laws runtime in
WKWebView and must pass after the final runtime manifest is assembled; the
component's Sofa Kingdoms native run does not cover that combination.

### Choose and verify a native test download

Until the final integrated native gates pass, GitHub Actions artifacts are
evaluation builds, not an accepted release. Follow the final integration PR's
artifact links for its exact tested commit. An older WS5-only artifact proves
its own component checkpoint, not the completed Odd Laws collection.

Choose `aarch64-apple-darwin` for an Apple Silicon Mac or
`x86_64-apple-darwin` for an Intel Mac. The desktop workflow's artifact name is
`sofa-arcade-<target>-<tested-commit>`. It retains artifacts for 14 days. Extract
the downloaded GitHub artifact archive, then inspect these files within it:

| Artifact member | Acceptance check |
| --- | --- |
| `evidence/tested-commit.txt`, `evidence/runner.txt` | Exact intended source SHA, actual macOS version and runner/binary architecture |
| `evidence/production-sha256.txt` | SHA-256 values for the production `.app.zip` and `.dmg` files in `artifacts/` |
| `evidence/native-production.json` | `passed: true`, `cleanupVerified: true`, completed production checks and stated limitations |
| `evidence/native-ui.json`, `evidence/native-ui-first.json`, `evidence/native-ui-relaunch.json` | Successful actual WKWebView sessions, with the accompanying screenshots |
| `stage/runtime-inventory.json` | Explicit staged runtime paths, byte sizes, file modes and SHA-256 values |
| `stage/licenses/NODE-PROVENANCE.json` | Pinned Node archive/checksum provenance and the verified runtime capabilities |
| `evidence/signature.txt`, entitlement JSON and `signed-node-probe.json` | Actual packaged signatures, limited JIT entitlement and execution of the signed bundled Node |

From the extracted artifact directory on the Mac, verify the production files
before opening them:

```sh
shasum -a 256 -c evidence/production-sha256.txt
```

Every listed file must report `OK`. Open the matching `.dmg` and copy the app
to Applications, or extract the matching production `.app.zip`. Check the
separate WS6 `local-native-<target>-<tested-commit>` evidence artifact for the
integrated Odd Laws checks and screenshots at that same commit. A failed or
missing native report is an unresolved gate, even if the workflow uploaded a
bundle.

CI artifacts use ad-hoc signing. `codesign --verify --deep --strict` checks a
bundle's signature integrity; it does not establish Developer ID identity,
notarization or downloaded-app Gatekeeper acceptance. Signed distribution
requires the owner's Developer ID/notarization credentials and a separately
verified downloaded artifact. A blocked test download remains a distribution
gate; do not remove quarantine or disable Gatekeeper to record a pass.

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

Use Node **24.22.3** for committed ZIP regeneration, matching release CI. The
playable host still supports the wider runtime range above; pinning the packager
also pins compression output for byte-for-byte archive checks.

```sh
npm run install:ci
node scripts/prepare-game.mjs
npm run package:lan
node scripts/check-derived.mjs
npm run test:integration
npm run build
node tests/integration/package/production.mjs
```

`check-derived.mjs` requires regenerated browser assets and the ZIP to match
the committed checkout, including newly introduced public files. When authoring
a change, review and commit those derived files before running that clean-tree
gate. CI must not silently repair a stale committed download.

The strict verification commands fail when a component is missing or its
recorded head is absent from the candidate's ancestry. Preparatory dependency
skips are not a release pass. These Node checks are necessary; rendered browser
and macOS native CI must pass separately. The postbuild checker compares the
actual `dist/client` bytes with the declared modules/assets/ZIP and rejects
authoring sources, private paths and undeclared browser files. The package
test also starts a host from an
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
| Acceptance evidence | CI JSON reports/screenshots and `docs/archive/workstreams/integration.md`; failed-run artifacts are identified as diagnostics |

Odd Laws browser code receives only public catalogs/helpers and authenticated
projected room state. Its authority and projection modules belong on the host.
Engine fixtures, simulation harnesses, tests, evidence, package dependencies,
credentials and runtime databases are not browser assets or package members.
The final media manifest must resolve to packaged local files, and its declared
final/placeholder status must be accurate.

## Hardware and distribution sign-off

Record the hardware, operating systems/browsers, network and exact artifact SHA
when Jon and Lydia run physical acceptance. Native CI evidence does not test
their Mac, home Wi-Fi, phone browsers, television or speakers. The remaining
checks are a real Mac app launch; two separate phone browsers; TV/fullscreen/
casting; both games; device sound after a gesture; saved preferences and reduced
motion; internet-disconnected play while the local network remains connected;
physical sleep/wake; quit/relaunch recovery; and downloaded-app Gatekeeper
behavior. Report Apple Silicon and Intel results separately.

For a LAN-address-change test, confirm that **Refresh Network** presents the
new reachable address and the Mac retains its room. A phone's old seat is
restorable only at its original origin with its original saved browser
identity. Record restoration at that origin or successful joining of a new
room at the new origin; do not label a refreshed QR as credential recovery.
Retain private databases and browser stores on the devices rather than in
screenshots, CI artifacts or bug reports. Developer ID signing and notarization
require a separate distribution step.

No merge, deployment, or release publication is part of this integration task.

### Public delivery boundary

`BROWSER_FILES` and `ASSET_FILES` in `scripts/runtime-files.mjs` name every
shipped browser module and static asset. The framework copies only those files
and the named portable ZIP into its generated public directory. LAN serving
uses the same explicit paths. Authoring `sources/`, preview recordings,
fixtures, galleries, credentials, databases and engine authority modules are
not public delivery inputs. The Odd Laws media inventory remains the owner's
57 runtime files, plus its distribution provenance notice.
