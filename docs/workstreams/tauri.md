# WS5 — local Tauri Mac application

## Scope and checkpoint

Branch: `feature/tauri-local`.

Base: `e34b0015399cb9791b175987adf1fab1b542565a`, verified as the remote
`main` head before creating this isolated checkout on 20 November 2026.

Owned paths are `desktop/**`, `.github/workflows/desktop.yml`, and this report.
The desktop packages the existing Sofa Kingdoms collection and shared LAN host.
It does not fork game rules or change shared runtime code. Odd Laws will enter
through the same runtime after the component handoffs and WS6 integration.

**Current checkpoint: implementation complete; native macOS validation in
progress.** [PR #6](https://github.com/jonathanjie/sofa-arcade/pull/6) is draft
until native launch and WKWebView evidence pass. Portable checks have passed
locally and in CI. Both native runners have verified their architecture and
started the production build. No successful Mac launch, signed distribution,
physical phone test, or offline hardware test is claimed by this checkpoint.
The PR records the exact tested head rather than embedding this report's future
commit hash in itself.

## Architecture and interfaces

- A Tauri native parent supervises a private bundled Node child. It resolves
  executable and resource paths from the app bundle, passes argument arrays,
  waits for bounded structured readiness, and opens only the ready loopback
  origin. The game receives ordinary web APIs and no shell/file permissions.
- `desktop/host/entry.mjs` reuses
  `startLanServer({ root, databasePath, host, port })` and its returned
  `port`, `origin`, `urls`, and `close`. SQLite lives in writable application
  data, outside immutable application resources.
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

## Remaining gates at this checkpoint

- Obtain an actual macOS package launch, native UI screenshots, and lifecycle
  results from the desktop workflow; repair relevant failures.
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
a different LAN address, the fresh QR can join that new origin, but credentials
stored under the old phone origin do not transfer automatically. The Mac keeps
its stable loopback origin and storage. Any cross-origin phone-seat recovery
belongs in the shared room/UI protocol, without weakening authentication.

## Handoff state

Not yet ready. Native evidence, final test commands, CI/artifact URLs, complete
file lists, and the tested head will be added before delivery. If native launch
evidence cannot be obtained, the PR remains draft with that exact gate.
