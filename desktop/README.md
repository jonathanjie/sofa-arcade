# Sofa Arcade for Mac

This package wraps the existing Sofa Arcade collection in Tauri and bundles its
Node/SQLite LAN host. The game, room authority, UI, music, and artwork remain in
their existing repository locations. The first packaged game is Sofa Kingdoms.

## Playing

Open **Sofa Arcade.app**, choose **Sofa Kingdoms**, then **Host on the TV**. Both
phones use ordinary browsers to scan the room QR and select different seats.
Keep the Mac and phones on the same local network. The application supplies its
own Node runtime and starts it automatically; playing does not require Terminal,
an installed Node runtime, a phone app, or a cloud service.

The Mac window opens only after its owned host reports that it is listening.
**View → Full Screen** controls the board window. **Connection → Refresh
Network** refreshes LAN addresses and reloads the board at the same loopback
origin. **Connection → Retry Local Host** retries a failed host. If the saved
port is occupied, quit the other application using that port and retry. Sofa
Arcade never attaches to or stops an unrelated listener.

Quit the app to stop its host. Saved rooms remain in
`~/Library/Application Support/com.sofaarcade.desktop/rooms.sqlite`, subject to
the shared runtime's existing 24-hour room lifetime. `config.json` keeps the
port and public room route; credentials remain in WKWebView/browser storage.
The app does not place credentials in QR URLs or logs.

Phone browsers store their credentials under the Mac's LAN origin. If a Wi-Fi
change gives the Mac a different address, rescan the refreshed QR; credentials
stored under the previous phone-browser origin do not automatically transfer
to the new one. Recovery across a changed phone origin is a shared platform/UI
integration consideration. The Mac's loopback origin remains stable.

## Build requirements

- A matching native Mac: Apple Silicon for `aarch64-apple-darwin`, or an Intel
  Mac for `x86_64-apple-darwin`. These are separate artifacts, not a universal
  binary. The build verifies the staged runtime on its native architecture.
- macOS 13.5 or newer for the bundled Node 24 runtime.
- Xcode Command Line Tools, Rust 1.100.0, and Node 24.22.3 for development.
- Internet access during dependency installation and initial runtime staging.
  The installed app does not run package managers or download its runtime.

Dependencies and lockfiles are nested in `desktop/`. Do not change the root
package files to build this application.

From the repository root, on Apple Silicon:

```sh
cd desktop
npm ci --ignore-scripts
npm run build:mac:arm64
```

On Intel use `npm run build:mac:intel`. Build scripts stage the matching official
Node runtime, collect third-party notices from the locked native Rust graph,
then build `.app` and `.dmg` artifacts. Tauri receives Cargo's `--locked` option.
Build outputs are under `desktop/src-tauri/target/<target>/release/bundle/` and
are deliberately ignored by Git.

The Node pin is `node-runtime.json`. Staging validates the archive against the
pinned official SHA-256 and pinned official checksum documents, executes ESM
and `node:sqlite` with no Node on `PATH`, and preserves Node's license and
provenance. The signed checksum document is retained for independent OpenPGP
verification; the script does not claim to verify that signature itself.

## Reproducible tests

Portable staged-host and native protocol tests can run on Linux or macOS:

```sh
cd desktop
npm ci --ignore-scripts
npm run stage
npm test
node scripts/verify-runtime.mjs
npm run test:rust
```

These tests use the **staged bundled Node**, real SQLite, real HTTP requests,
and authenticated SSE. They cover both seats, asset completeness, immediate
pushes, saved state, cleanup, port conflicts, invalid startup, bounded protocol
records, allowlist safety, and stable origins. Running them on Linux is not
evidence of a Mac launch.

Run native production acceptance on a **disposable macOS user account** with no
existing Sofa Arcade data:

```sh
cd desktop
npm run build:mac:arm64
npm run test:native:release -- --app "/absolute/path/to/Sofa Arcade.app"
```

The harness refuses to overwrite an existing app-data profile. It launches the
actual packaged executable with Node absent from `PATH`, exercises native
process lifecycle and real rooms, and records safe JSON evidence. It does not
publish room credentials or databases.

For native WKWebView interaction and screenshots, preserve the production
bundle first, then build the separate instrumented application:

```sh
npm run build:native:arm64
SOFA_APP_PATH="/absolute/path/to/instrumented/Sofa Arcade.app" npm run test:native:ui
```

Use the `:intel` build variants on Intel. `native-e2e` enables the supported
embedded WebDriver plugin only for that separate acceptance build. Production
builds omit the driver, its endpoints, and any native shell/file capabilities.
The native UI harness runs two app sessions to exercise real WKWebView storage
and host-credential recovery.

`.github/workflows/desktop.yml` builds and launches both architectures on
matching macOS runners. Its artifacts identify the exact tested source commit,
runner architecture, bundle hashes, production lifecycle results, native UI
results, and screenshots. Read completed check results; a created bundle alone
is not a passing native launch.

## Distribution status

CI uses local ad-hoc code signatures for test artifacts. These are **not**
Developer ID signatures or notarization. No public release is published by
this workflow, and it does not disable Gatekeeper or alter macOS security
settings. Downloaded-app distribution needs the owner's signing/notarization
credentials and a separate Gatekeeper acceptance check.

Native CI cannot establish behavior on Jon's physical Mac, two phones, home
Wi-Fi, TV casting, or device speakers. Real internet-disconnected play and
physical sleep/wake also remain hardware acceptance checks. See the
[WS5 report](../docs/workstreams/tauri.md) and the PR for actual completed
evidence and remaining gates.

## Runtime integration contract

`runtime-manifest.json` contains only explicit repository-relative paths. It
preserves the repository's shape so server and game imports resolve unchanged.
No glob, traversal, symlink, checkout metadata, credential, local database,
development dependency, or generated release bundle belongs in it.

After the WS5 tested handoff, WS6 may add the final Odd Laws files to this
manifest and rerun staging, tests, and the native workflow. Shared serving
allowlists must also be updated by their owner/integrator. Native changes remain
with WS5 unless a separate post-handoff fix is agreed. The exact runtime
inventory and source hashes are generated at build time, not manually copied.
