# Integrated native WKWebView gate

This extension owns no desktop source or workflow. It runs a separate spec using
the delivered `desktop/wdio.native.mjs` configuration, its pinned tooling, and
the existing native-e2e application. It must execute on an actual macOS runner
with a fresh disposable application profile. The runner refuses existing Sofa
Arcade app data and never resets a user's saved games to make a test pass.

The three distinct native application processes verify:

1. The enabled collection creates an actual Odd Laws room through WKWebView.
   Two independent authenticated HTTP controller seats join. The native TV
   renders a private first seal, public reveal, and an engine-backed Build.
   Actual browser imports load the public catalog/helpers, command client, view
   and composed score. WKWebView resolves and decodes every final manifest image
   from its local host with exact declared dimensions and no external resource
   requests recorded. The native inspector uses the injected quote helpers.
2. After a real native process exit, an explicit navigation to the bare local
   `/` restores the saved host role, credential, room revision and city without
   supplying a room query or bearer to the new document. The process ID changes
   and the local origin remains stable. Exiting through the component returns
   to the collection and disposes its styles.
3. After another native process exit, the collection remains open and a fresh
   bare-root document does not resurrect the exited game.

Example Apple Silicon job commands, from the repository root:

```sh
npm --prefix desktop ci --ignore-scripts
rustup toolchain install 1.100.0 --profile minimal --target aarch64-apple-darwin
RUSTUP_TOOLCHAIN=1.100.0 APPLE_SIGNING_IDENTITY=- npm --prefix desktop run build:native:arm64
SOFA_APP_PATH="$GITHUB_WORKSPACE/desktop/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Sofa Arcade.app" \
SOFA_TEST_COMMIT="$GITHUB_SHA" \
SOFA_EVIDENCE_DIR="$GITHUB_WORKSPACE/tests/integration/evidence/native" \
node tests/integration/native/run.mjs
```

For an Intel runner, substitute target `x86_64-apple-darwin` and build script
`build:native:intel`. Verify `uname -m`, `node -p process.arch`, Rust host target,
and the exact checked-out PR head before building. Use the desktop handoff's
pinned Node version. `SOFA_TEST_COMMIT` must equal that exact checkout, not the
synthetic pull-request merge SHA. Final runtime staging must already include
the complete WS1–WS4 closure and the catalog must be playable. This gate does
not inject a planned game into the native host.

Upload `tests/integration/evidence/native/**` on success **and failure**. The
machine reports are `integration-native.json` and per-phase JSON; screenshots
are prefixed `integration-native-`. The fixture contains a public host projection,
a room code and a random marker only. It contains no bearer or database.

The normal desktop workflow still owns production app/DMG builds, signature
inspection, bundled-Node provenance, actual production launch/quit/failure
tests, both architectures, and its native Sofa Kingdoms regression. This
instrumented extension is additional combined-product evidence, not a replacement
for those gates or a production distributable. Physical phones, home Wi-Fi,
internet-disconnected hardware, device audio, sleep/wake, TV casting, Developer
ID/notarization and downloaded-app Gatekeeper behavior remain separately reported.

Current preparation was source-reviewed against WS5 draft
`792b52cc9cd1826a8c23c810baf576ecd89e122a`; syntax checks pass. A prepared test is
not a native pass. Recheck the delivered WS5 setup contract and run this suite
at the proposed final integration commit before counting acceptance.
