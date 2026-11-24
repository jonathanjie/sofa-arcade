# Local Sofa Arcade — build and acceptance guide

Use this guide for the merged local collection. Choose a CI artifact for a specific tested commit or a GitHub Release for a tagged Mac build. The [source handoff](HANDOFF.md) identifies the desktop tag and the later Gravity Orchard merge.

## Toolchain

| Task | Required version |
| --- | --- |
| Root project and portable play | Node.js 22.13 or newer |
| Reproduce committed ZIP bytes | Node.js 24.22.3, as in the Gravity integration workflow |
| Build a Mac artifact | Node.js 24.22.3, Rust 1.100.0, Xcode Command Line Tools and a matching Mac architecture. See the [desktop build recipe](../desktop/README.md#build-requirements). |

## Player setup and reconnection

Use the [LAN instructions](LAN.md) for the portable host and the [play instructions](../README.md#play) for room creation and both phones. The portable host, native app and hosted Site each have their own room store.

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

## Native Mac application

Open **Sofa Arcade.app** and host the board. The app starts its bundled Node host. Use **View → Full Screen** for the board and **Connection → Refresh Network** to update the advertised LAN addresses. **Connection → Retry Local Host** retries a failed launch. If the saved port is occupied, identify the other application before closing it.

Quit stops the owned host. The native database is `~/Library/Application Support/com.sofaarcade.desktop/rooms.sqlite`. The app retains its saved loopback port. The webview’s saved session controls room restoration. An explicit exit to the collection takes precedence over any stale native route.

Use the [desktop build and smoke tests](../desktop/README.md#reproducible-tests) on the matching Mac architecture. Preserve the production app before building the instrumented app, since they use the same output directory. On a disposable Mac user account, set `SOFA_APP_PATH` to the instrumented app and run each collection journey from the repository root:

```sh
node tests/integration/native/run.mjs
node tests/gravity-orchard-integration/native/run.mjs
```

The first runner checks Odd Laws in WKWebView. The second checks the Gravity Orchard campaign, trusted-access setup and native lifecycle. Keep the reports for each architecture and commit.

### Choose and verify a native test download

Use the desktop workflow for the intended commit. Match the artifact and acceptance evidence to the same SHA.

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
separate `local-native-<target>-<tested-commit>` evidence artifact for the
integrated Odd Laws checks and `go7-native-<target>-<tested-commit>` for the
Gravity Orchard WKWebView checks. Match `tested-commit.txt` to the build and
check the reports and screenshots in each artifact, including
`go7-native.json` for Gravity Orchard. A failed or missing native report is an
unresolved gate, even if the workflow uploaded a bundle.

CI artifacts use ad-hoc signing. `codesign --verify --deep --strict` checks a
bundle's signature integrity; it does not establish Developer ID identity,
notarization or downloaded-app Gatekeeper acceptance. Signed distribution
requires the owner's Developer ID/notarization credentials and a separately
verified downloaded artifact. A blocked test download remains a distribution
gate; do not remove quarantine or disable Gatekeeper to record a pass.

## Reproduce the automated checks

Use a clean checkout of the exact SHA named in the PR or evidence report.
Install root dependencies with `npm run install:ci` for full coverage. The unit runner discovers eligible `*.test.mjs` source files and reports skips for unavailable static imports. Browser tests and the nested secure-LAN inventory have separate commands.

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

Run `npm ci --prefix desktop --ignore-scripts` for the desktop tooling used by integration CI. Use these suites on the assembled checkout:

| Check | Command |
| --- | --- |
| Local room protocol, package and integration | `npm run test:integration` |
| Gravity Orchard integration | `npm run test:gravity-orchard` |
| Room and realtime fixture browser tests | `npm run test:browser` |
| Gravity Orchard TV and two phones in three browser contexts | `npm run test:gravity-browser` |
| Secure-LAN component including its dependency inventory | `npm ci --prefix server/secure-lan`, then `npm test --prefix server/secure-lan` |

Install Chromium with `npx playwright install chromium` before the browser suites. Linux CI uses `npx playwright install --with-deps chromium` to install system dependencies too. The Gravity browser journey starts its own loopback host on a free port with a temporary SQLite database. Set `SOFA_GO7_EVIDENCE_DIR` to select the report and screenshot directory. Run the two turn-based collection journeys separately:

```sh
SOFA_EVIDENCE_DIR=/absolute/path/to/evidence node tests/integration/browser/sofa-kingdoms.mjs
SOFA_EVIDENCE_DIR=/absolute/path/to/evidence node tests/integration/browser/odd-laws.mjs
```

Run the Gravity campaign and transport measurements on loopback as in the [Gravity CI workflow](../.github/workflows/go7-integration.yml):

```sh
export SOFA_GO7_EVIDENCE_DIR=/absolute/path/to/evidence
mkdir -p "$SOFA_GO7_EVIDENCE_DIR"
node tests/gravity-orchard-integration/protocol/campaign.mjs
node tests/gravity-orchard-integration/protocol/measure.mjs --out="$SOFA_GO7_EVIDENCE_DIR/transport.json"
node tests/gravity-orchard-integration/protocol/stress.mjs --out="$SOFA_GO7_EVIDENCE_DIR/stress.json"
```
Check skip counts and retain separate browser and matching-architecture native results. The [delivery checks](#delivery-inventory-and-publicprivate-boundary) verify the built files and extracted ZIP.

Run the Odd Laws collection-to-results journey with the normal catalog and both initial Chairs. `SOFA_ACCEPTANCE_CANDIDATE=1` injects an optional pre-enablement fixture into the acceptance driver. `SOFA_ACCEPTANCE_CHAIR` selects a Chair for diagnosis.

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
| Browser assets | `ASSET_FILES` in `scripts/runtime-files.mjs` lists the public assets to stage alongside the modules and ZIP. |
| Explicit LAN static routes | `SOURCES` for authored modules and `ASSETS` for public assets in `server/lan.mjs`. Keep requests limited to the declared routes. |
| Portable ZIP | `public/downloads/sofa-arcade-local.zip`; explicit `runtimeFiles()` entries, deterministic bytes, executable launcher |
| ZIP member manifest | `sofa-arcade-local/artifact-manifest.json` inside the archive; path, byte count, mode and SHA-256 for every other member |
| Desktop runtime | `desktop/runtime-manifest.json`; explicit repo-shaped files, checksum-verified bundled Node, staging inventory |
| Native artifacts | CI production `.app.zip`/DMG plus SHA-256 evidence; exact source and architecture named in artifact metadata |
| Acceptance evidence | CI JSON reports/screenshots and `docs/archive/workstreams/integration.md`; failed-run artifacts are identified as diagnostics |

Update `scripts/runtime-files.mjs`, the LAN mappings and the desktop manifest when their delivered files change. Gravity’s browser, asset and host entries are shared in `server/gravity-orchard-delivery.mjs`. Framework preparation and portable packaging consume the shared inventory. The framework stages only declared public files and the portable ZIP.

Odd Laws exposes public catalog/preview helpers and the authenticated viewer’s projection. Keep private engine modules and the Gravity dependency bundle on the host. Exclude credentials, runtime databases, checkout metadata, installed development dependencies, fixtures, evidence and authoring sources from release packages. Retain runtime artwork and license notices.

If a change affects an import in `scripts/runtime-dependencies-entry.mjs`, its transitive sources or locked dependencies, run `npm run bundle:runtime`. Retain the generated host bundle, license notices and dependency inventory. Check reproducibility with `node scripts/bundle-runtime.mjs --check`.

After changing included source, assets or portable instructions, use the ZIP toolchain above and regenerate before release:

```sh
node scripts/prepare-game.mjs
npm run package:lan
```

Review and commit the regenerated files. Run `node scripts/check-derived.mjs` after clean regeneration to detect any drift in the tracked browser files, route or ZIP. Run `npm run test:integration` to exercise the extracted package, then `npm run build` and `node tests/integration/package/production.mjs` to check the staged production files.

## Hardware and distribution sign-off

Record the hardware, operating systems/browsers, network and exact artifact SHA
when Jon and Lydia run physical acceptance. Native CI evidence does not test
their Mac, home Wi-Fi, phone browsers, television or speakers. The remaining
checks include a Mac app launch, two physical phones and all three local games. For Gravity Orchard, check touch over HTTP, certificate trust on iOS Safari and Android Chrome, motion permission, finite tilt readings, rotation, recenter and recovery after locking a phone. Record phone-to-Mac response and the additional TV casting delay separately.

Check fullscreen and casting, sound after a gesture, saved preferences, reduced motion, WAN-disconnected cold start, physical sleep/wake, quit/relaunch, and Gatekeeper behavior for a downloaded app. Evaluate actual playtime, balance and seated comfort with both players. Report Apple Silicon and Intel results separately.

During a LAN address change, verify the refreshed address on the Mac and follow the [seat recovery procedure](#player-setup-and-reconnection) on each phone. Keep private databases and browser stores out of screenshots and reports.
