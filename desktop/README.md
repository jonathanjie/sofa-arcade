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
change gives the Mac a different address, the refreshed QR reaches that new
origin, but it cannot recover an already-claimed phone seat: credentials and
the original client identity remain under the previous browser origin, and
the shared host correctly rejects a new identity with `seat_taken`. To continue
the saved match, restore the original LAN origin; otherwise create a new room
and join both seats there. Secure controller recovery across a changed origin
is a shared platform/UI integration request. The Mac's loopback origin and
saved room state remain stable.

## Optional trusted local access

The Gravity Orchard integration adds **Trusted phone access** inside the native
host. Ordinary HTTP remains available for complete touch controls. Setup creates
this installation's certificate material in private application data and starts
one additional HTTPS/WSS listener around the existing room database and realtime
coordinator. The Mac window continues using its stable loopback HTTP origin.

Use setup before joining a room from the phones. Exporting the public root or
Apple profile creates a new file in **Downloads** and reveals it in Finder.
Transfer that public file to each phone, compare the displayed fingerprint, and
follow the explicit phone trust instructions. The app never installs trust or
exports a private key. A ready host listener does not establish phone trust,
motion permission or usable sensor readings. Keep touch available until each
phone's diagnostic succeeds without a certificate warning.

**Turn trusted access off** persists across relaunch and keeps the root for
later use. **Remove this installation's certificates** also deletes the local
material; remove the matching profile/root on each phone separately. A changed
LAN address requires an explicit certificate refresh. The native host alone has
these setup capabilities; no phone HTTP route accepts provisioning or export
commands, paths or native operations.

The integration's actual WKWebView acceptance runner is
`node tests/gravity-orchard-integration/native/run.mjs`, with `SOFA_APP_PATH`
pointing to the separate `native-e2e` build. It requires the root's locked test
dependencies and `desktop` WebDriver tooling. That build exposes the planned
game as an explicit integration candidate; production builds do not inherit
the test flag. Physical iOS/Android trust and motion, home Wi-Fi, casting and
WAN-disconnected cold startup remain separate checks.

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
APPLE_SIGNING_IDENTITY=- npm run build:mac:arm64
```

On Intel use `APPLE_SIGNING_IDENTITY=- npm run build:mac:intel`. Build scripts stage the matching official
Node runtime, collect third-party notices from the locked native Rust graph,
then build `.app` and `.dmg` artifacts. Tauri receives Cargo's `--locked` option.
Build outputs are under `desktop/src-tauri/target/<target>/release/bundle/` and
are deliberately ignored by Git.

The Node pin is `node-runtime.json`. Staging validates the archive against the
pinned official SHA-256 and pinned official checksum documents, executes ESM
and `node:sqlite` with no Node on `PATH`, and preserves Node's license and
provenance. The signed checksum document is retained for independent OpenPGP
verification; the script does not claim to verify that signature itself.

The example uses local ad-hoc signing, as CI does. Hardened runtime remains
enabled; the sole entitlement permits Node/V8's JIT. Native acceptance verifies
the actual post-sign entitlements and executes optimized JavaScript, ESM, and
SQLite using the bundled executable. No broader debugging or library-loading
exceptions are granted.

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
APPLE_SIGNING_IDENTITY=- npm run build:mac:arm64
npm run test:native:release -- --app "/absolute/path/to/Sofa Arcade.app"
```

The harness refuses to overwrite an existing app-data profile. It launches the
actual packaged executable with Node absent from `PATH`, exercises native
process lifecycle and real rooms, and records safe JSON evidence. It does not
publish room credentials or databases.

For native WKWebView interaction and screenshots, preserve the production
bundle first, then build the separate instrumented application:

```sh
APPLE_SIGNING_IDENTITY=- npm run build:native:arm64
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
Developer ID signatures or notarization. The desktop check workflow publishes
no release. Tagged releases come only from `release.yml` (see "Automatic
updates"). No workflow disables Gatekeeper or alters macOS security
settings. Downloaded-app distribution needs the owner's signing/notarization
credentials and a separate Gatekeeper acceptance check.

Native CI cannot establish behavior on Jon's physical Mac, two phones, home
Wi-Fi, TV casting, or device speakers. Real internet-disconnected play and
physical sleep/wake also remain hardware acceptance checks. See the
[WS5 report](../docs/workstreams/tauri.md) and the PR for actual completed
evidence and remaining gates.

## Automatic updates

The installed app updates itself from GitHub Releases.

**How it works**

1. **At each launch, before the local host starts,** the app downloads `latest.json` from the newest release of `jonathanjie/sofa-arcade`. This check has a 5-second limit.
2. **If the release is newer than the installed version,** the status window says "Installing the latest Sofa Arcade". The app downloads the update for its architecture and checks it against the public key in `src-tauri/tauri.conf.json`. It then replaces itself and reopens.
3. **Any failure is ignored, and the app starts normally.** Failures include being offline, having no release yet, a read-only install location (for example, running from the DMG) and a bad signature. Local play never depends on the internet.

The check happens only at launch, so an update never interrupts a room. Saved rooms and settings in Application Support are not touched.

**When the check is skipped:** end-to-end test builds (`native-e2e` feature) never check. `SOFA_DISABLE_UPDATER=1` also skips the check, and the packaged-app test sets it.

**Publish a release**

1. Set the version everywhere and commit it:

   ```bash
   node desktop/scripts/set-version.mjs 0.2.0
   ```

2. Tag the commit and push the tag:

   ```bash
   git tag v0.2.0
   ```

   ```bash
   git push origin v0.2.0
   ```

3. `.github/workflows/release.yml` builds both Mac architectures and signs the update bundles. It writes `latest.json` with `scripts/updater-manifest.mjs` and creates the GitHub Release with the DMGs, update bundles, signatures and manifest. The workflow fails if the tag does not match every version field.

**One-time setup: the signing key.** The release workflow needs the repository secret `TAURI_SIGNING_PRIVATE_KEY`. It holds the private key whose public half is in `tauri.conf.json`. The key has no password; set `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` only if you replace it with a password-protected key. Keep an offline backup of the private key. Without it, no installed app will accept a future update, and every app would have to be reinstalled by hand with a new public key.

**Code signing.** Releases are ad-hoc signed, not Developer ID signed or notarized. A downloaded DMG still needs the usual right-click → Open the first time. macOS may ask again for local-network permission after an update, because an ad-hoc signature changes with every build. A Developer ID certificate and notarization would remove both prompts.

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
