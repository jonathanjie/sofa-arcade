# WS5 — local Tauri Mac application

## Scope and checkpoint

Branch: `feature/tauri-local`.

Base: `e34b0015399cb9791b175987adf1fab1b542565a`, verified as the remote
`main` head before creating this isolated checkout on 20 November 2026.

Owned paths are `desktop/**`, `.github/workflows/desktop.yml`, and this report.
The desktop packages the existing Sofa Kingdoms collection and shared LAN host.
It does not fork game rules or change shared runtime code. Odd Laws will enter
through the same runtime after the component handoffs and WS6 integration.

**Ready for WS6 integration of the native component.** Apple Silicon and Intel
production bundles have been built and launched on matching native Mac runners.
Each passed 14 production acceptance checks and two native WKWebView sessions,
including gameplay, child recovery, and saved-credential relaunch. The final
accepted immutable head, exact-head CI status, and downloadable artifacts are
recorded in [PR #6](https://github.com/jonathanjie/sofa-arcade/pull/6). The PR stays
draft while its final delivery checkpoint is being verified; this report does
not embed its own future commit hash.

Developer ID/notarization, downloaded-app Gatekeeper acceptance, and physical
phone/Wi-Fi/TV/audio acceptance remain separate gates. No public release,
merge, or deployment is part of WS5.

## Architecture and interfaces

- A Tauri native parent supervises a private bundled Node child. It resolves
  executable and resource paths from the app bundle, passes argument arrays,
  waits for bounded structured readiness, and opens only the ready loopback
  origin. The game receives ordinary web APIs and no shell/file permissions.
- `desktop/host/entry.mjs` reuses
  `startLanServer({ root, databasePath, host, port })` and its returned
  `port`, `origin`, `urls`, and `close`. SQLite lives in writable application
  data, outside immutable application resources. The desktop bootstrap emits
  protocol-versioned `ready`, `refreshed`, `refresh-request`, or safe `error`
  records bounded to 4096 bytes; stdin accepts only bounded `shutdown`/`refresh`
  commands. A listener is never considered ready from a guessed URL or PID.
- `desktop/runtime-manifest.json` implements exactly the v1 staging contract:
  `{ "schemaVersion": 1, "files": [{ "path": "..." }] }`.
  Paths are explicit repository-relative files; optional `mode` uses numeric
  permission bits (420 for 0644 or 493 for 0755). This file
  is the desktop integration seam for WS6 after the tested handoff.
- Build-time preparation pins Node 24.22.3 LTS, verifies official archive
  checksums and provenance, and stages the executable independently from
  repo-shaped game resources. Runtime startup performs no downloads. Node's
  license and the QR dependency's license travel with the package.
- The parent preserves its saved port/origin so WKWebView storage remains
  accessible. An occupied port is an error requiring a retry after the conflict
  is resolved, not permission to attach to or stop the unrelated process.
- The private app-data directory is
  `~/Library/Application Support/com.sofaarcade.desktop`. `config.json` saves
  the port and a validated public room route; `rooms.sqlite` stores shared room
  state. Credentials remain in the existing browser storage and are never
  copied into readiness records, QR URLs, or reports.
- Duplicate launches focus the existing application before starting a host.
  Native Quit gracefully closes and reaps only the retained child; abrupt
  parent death closes its lifetime pipe. A crashed ready host gets one bounded
  automatic restart. Repeated failure leaves an actionable native Retry view.
- A network/wake change requests a parent-controlled refresh. The parent
  destroys the active network document before acknowledging release of its
  listener, then opens a new document only after same-port readiness. This
  preserves browser storage without leaving timers or SSE against an unowned
  listener. A native Connection menu also provides Refresh Network and Retry.
- Release builds contain no embedded test driver. The separately instrumented
  `native-e2e` build uses the supported macOS WebDriver plugin for screenshots
  and real WKWebView interaction. No shell/file capabilities are granted to
  the game or phone controllers.

## Packaging and provenance

The bundle contains an architecture-matched official Node 24.22.3 executable
and 25 explicit runtime files from the contract manifest: the two desktop host
modules; shared server, game, and registry/catalog modules; UI modules and
styles; artwork, local QR code implementation and its license; favicon/web
manifest; and SQLite migration. It preserves the repository layout and checks
relative import closure. The exact paths are authoritative in
[`desktop/runtime-manifest.json`](../../desktop/runtime-manifest.json).

Preparation rejects traversal, globs, symlinks, credentials, databases, hidden
checkout state, development dependencies, and stale/unlisted staged files. It
checks bytes and executable modes. No Node package manager, build dependency,
generated runtime, or release bundle is committed as authored source.

`desktop/node-runtime.json` pins official per-architecture archive SHA-256
values and the checksum documents. Preparation downloads only at build time,
verifies the cached/downloaded bytes, extracts only Node and its license, then
executes ESM and `node:sqlite` with Node absent from `PATH`. The pinned official
signed checksum document is retained for independent OpenPGP validation; this
implementation does not claim to verify that signature. Each build records a
safe provenance document and file-hash inventory. Third-party notices are
collected from the locked native Cargo dependency graph, with exact pinned
fallback license texts where published crates omit their license files.

Tauri re-signs bundled executable sidecars. The native entitlement file grants
only `com.apple.security.cs.allow-jit` for Node/V8, while retaining hardened
runtime. It does not copy Node's broader CLI/debugging entitlements. Native
acceptance inspects the packaged signature and runs the signed Node executable
directly. CI signatures are ad-hoc and establish no Developer ID identity or
notarization.

### Tested repository-shaped runtime inventory

The initial Sofa Kingdoms handoff includes exactly these authored runtime files;
verified architecture-specific Node binaries and license notices are staged
separately:

```text
desktop/host/entry.mjs
desktop/host/lifecycle.mjs
server/lan.mjs
server/rooms.mjs
game/engine.mjs
games/catalog.mjs
games/registry.mjs
ui/index.html
ui/app.js
ui/styles.css
ui/audio.js
ui/score.mjs
ui/motion.js
ui/motion.css
ui/board-view.mjs
ui/board-view.css
ui/action-queue.mjs
ui/transport.mjs
public/assets/characters.png
public/assets/sofa-room.png
public/assets/qrcode.js
public/assets/qrcode-LICENSE.txt
public/favicon.svg
public/manifest.webmanifest
drizzle/0000_green_thunderbolts.sql
```

The configured minimum macOS version is **13.5**, matching the bundled Node 24
runtime. Apple Silicon and Intel are separate native artifacts; no universal
binary or compatibility with an older macOS version is claimed.

## Ownership within WS5

| Area | Files |
| --- | --- |
| Native lifecycle and safe window | `desktop/src-tauri/**`, `desktop/shell/**` |
| Runtime pin, stage, bootstrap and host checks | `desktop/host/**`, `desktop/scripts/**`, `desktop/runtime-manifest.json`, `desktop/node-runtime.json`, `desktop/tests/host*.mjs`, `desktop/tests/runtime*.mjs` |
| Native validation and CI | `.github/workflows/desktop.yml`, `desktop/tests/native/**`, `desktop/wdio*.mjs` |
| Build dependencies, icons and handoff | `desktop/package*.json`, `desktop/icons/**`, desktop documentation, this report |

## Executed portable checks

Executed in Linux x86-64 using Node 24.22.3:

| Check | Result | What it establishes |
| --- | --- | --- |
| Existing repository `npm test` | 66 passed | Unchanged game/room behavior, strict Host/Origin checks, credentials, real SSE and persistence |
| Desktop `npm test` after staging | 12 passed | Exact runtime allowlist, compatible bundled Node without Node on PATH, both seats and immediate SSE, assets, persistence, cleanup, conflicts, bounded startup failures, refresh handshake and tamper rejection |
| Nested Cargo tests with `--no-default-features` | 11 passed | Native settings, safe saved routes, bounded readiness validation, fixed child arguments/environment and owned-child cleanup |
| Rust clippy for portable native modules | Passed with warnings denied | Static diagnostics for the tested non-GUI native modules |
| Locked macOS dependency/license collection | Passed | Native dependency notices and supplements present before packaging |

These results passed locally. The initial desktop workflow's portable job also
passed all three test suites. Linux execution does not establish a Mac launch.

## Reproducible commands

From the repository root:

```sh
npm test
cd desktop
npm ci --ignore-scripts
npm run stage
npm test
node scripts/verify-runtime.mjs
npm run test:rust
```

On a matching native Apple Silicon Mac:

```sh
cd desktop
npm ci --ignore-scripts
APPLE_SIGNING_IDENTITY=- npm run build:mac:arm64
npm run test:native:release -- --app "/absolute/path/to/production/Sofa Arcade.app"
APPLE_SIGNING_IDENTITY=- npm run build:native:arm64
SOFA_APP_PATH="/absolute/path/to/instrumented/Sofa Arcade.app" npm run test:native:ui
```

Use the `:intel` variants on an Intel Mac. Preserve the production bundle
before the instrumented build. The production harness refuses an existing
Sofa Arcade profile; use a disposable macOS test account. The workflow provides
fresh runners and records the exact checked-out source commit, native runner
and binary architectures, signatures, build hashes, structured test results,
and screenshots. Generated outputs stay outside authored source control.

## Native validation and source basis

The [completed implementation validation run](https://github.com/jonathanjie/sofa-arcade/actions/runs/44703762760)
passed all three desktop jobs. Its production artifacts are preserved before a
separate instrumented build enables the supported embedded test driver.

| Target | Actual native verification | Implementation evidence |
| --- | --- | --- |
| Apple Silicon, `aarch64-apple-darwin` | ARM64 runner and both Mach-O binaries; 14 production checks; first and relaunched native WKWebView sessions passed | [Mac job](https://github.com/jonathanjie/sofa-arcade/actions/runs/44703762760/job/136178210508), [app/DMG and evidence](https://github.com/jonathanjie/sofa-arcade/actions/runs/44703762760/artifacts/14613963189) |
| Intel, `x86_64-apple-darwin` | x86-64 runner and both Mach-O binaries; 14 production checks; first and relaunched native WKWebView sessions passed | [Mac job](https://github.com/jonathanjie/sofa-arcade/actions/runs/44703762760/job/136178210519), [app/DMG and evidence](https://github.com/jonathanjie/sofa-arcade/actions/runs/44703762760/artifacts/14614533067) |

This verifies two separate native builds, without Rosetta or a universal-binary
claim. Apple Silicon remains the initial product assumption; Jon's own Mac
architecture has not been confirmed. Each artifact includes its observed OS,
compiler, Node, architecture, source commit, signature, and hash records. The
PR identifies the final delivery-head rerun; the table above preserves the
completed implementation checkpoint rather than claiming an older run tested
a later commit. GitHub retains these CI artifacts for 14 days.

Production acceptance verifies the signed bundled Node's ESM, SQLite, and
optimized V8 execution with no Node on PATH; exact staged files and licenses;
collection/assets; a real room and both HTTP/SSE phone seats; an immediate
authoritative action; duplicate launch; owned-child crash; native Quit;
persistence/relaunch; abrupt parent cleanup; an unrelated occupied-port
listener receiving no connections; and recoverable database startup failure.
Both production reports set `passed` and `cleanupVerified` to true.

Native WebDriver acceptance runs inside the actual macOS WKWebView. It clicks
through the existing collection and room flow, checks decoded artwork and QR,
joins both seats through ordinary host HTTP APIs, observes the authoritative
SSE change in the native board, denies a native window permission request,
recovers the child and webview, then starts a new native process and reuses the
same browser storage and host credential. Credentials stay inside WKWebView;
only a public room code and non-secret marker enter the test fixture.

The artifact's `evidence/` directory contains:

- `native-production.json`, `native-ui.json`, `native-ui-first.json`, and
  `native-ui-relaunch.json`: named executed checks and limitations.
- `production-collection.png`: a system capture of the actual production Mac
  window; `native-collection.png`, `native-lobby.png`, `native-board.png`,
  `native-child-recovery.png`, and `native-relaunch.png`: real native WebDriver
  screenshots. Collection, lobby, authoritative board, and restored state were
  inspected visually.
- `runner.txt`, `tested-commit.txt`, `signature.txt`,
  `production-sha256.txt`, and `production-dependencies.txt`.
- `signed-node-probe.json`, `app-entitlements.json`, and
  `node-entitlements.json`: the post-sign capability and hardened-runtime proof.

The same artifact includes `artifacts/*.app.zip`, `artifacts/*.dmg`, the generated
runtime inventory, and Node provenance. It excludes databases, browser stores,
credentials, raw driver logs, and the instrumented application from downloads.

Validation caught and repaired Tauri's package-name/binary-name mismatch and a
cached native WebDriver element reference invalidated by the shared UI's SSE
render. The signing review added only the necessary Node/V8 JIT entitlement,
then verified actual optimized execution on both architectures. Earlier failed
or superseded runs are not substituted for the final accepted head's evidence.

The current [Tauri WebDriver guidance](https://v2.tauri.app/develop/tests/webdriver/)
recommends WebdriverIO and `@wdio/tauri-service`. Its embedded driver supports
macOS; the driver is gated to a separate native test build and excluded from
the ordinary application. A Chromium-only test is not accepted as evidence of
the native WKWebView collection load.

The [GitHub runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
currently maps `macos-15` to ARM64 and `macos-15-intel` to Intel. CI must verify
the runner architecture and the packaged Mach-O architectures rather than
trusting labels. Apple Silicon is the initial build assumption. Jon's actual
Mac architecture is not established by this workstream.

The [Node 24.22.3 official release](https://nodejs.org/en/blog/release/v24.22.3)
provides the pinned macOS archives and published checksums. Runtime tests must
exercise ESM and `node:sqlite` using the staged executable.

## Remaining hardware and distribution gates

- Developer ID signing and notarization require credentials not provided here.
  Do not claim notarization or disable Gatekeeper. See
  [Tauri macOS signing](https://v2.tauri.app/distribute/sign/macos/).
- Physical acceptance remains separate: two real phones on Jon's Wi-Fi,
  internet-disconnected play after installation, Mac sleep/wake, changing
  Wi-Fi/LAN addresses, TV casting/fullscreen, and device audio after a gesture.

## Integration requests

After handoff, WS6 may add the final Odd Laws runtime entries to
`desktop/runtime-manifest.json` and rerun desktop checks. It must also reconcile
the shared server's serving allowlist, game registry/catalog, authored UI, and
shared media according to the component contracts. Other native files remain
with WS5 unless a separate post-handoff fix is identified.

The existing UI's optional local-play Help still describes the portable Node
launcher even when it runs inside Tauri. WS6 owns any shared Help-copy update;
desktop must not fork `ui/app.js` merely to change those instructions.

Phone credentials are scoped to their browser's LAN origin. When the Mac gets
a different LAN address, the refreshed QR reaches the new origin but cannot
reclaim seats in the existing match: the original client identity/credential
does not transfer, and `server/rooms.mjs` correctly returns `409 seat_taken`
for a new identity. Restore the old LAN origin to continue that saved match,
or create a new room and join both seats. The Mac retains its loopback origin
and saved state. Secure controller recovery across a changed origin is an
explicit WS2/WS6 shared room/UI request; desktop must not bypass seat ownership
or weaken authentication to simulate that recovery.

## Handoff state

The native component is ready for WS6 to integrate at the immutable accepted
head recorded in PR #6 once its final checkpoint checks are green. The Mac
packages and actual native tests are available; whole-product hardware and
signed-download acceptance are still outstanding as listed above.

After that tested handoff, WS6 may add final Odd Laws file entries to
`desktop/runtime-manifest.json` and must rerun staging, desktop host tests,
native protocol tests, and the matching Mac workflow. Shared serving-list,
registry/catalog, UI, and media wiring remain the integrator's coordinated
work. Other native files remain WS5-owned. Any later native change requires a
new explicitly identified head and renewed validation.
