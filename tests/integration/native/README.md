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
   Driver-mediated button clicks must start the actual WKWebView WebAudio
   context with the Odd Laws score. Music and effects remain independent, and
   supported range value input sets the saved volume to 27 percent through
   the real slider's input/change handling.
2. After a real native process exit, an explicit navigation to the bare local
   `/` restores the saved host role, credential, room revision and city without
   supplying a room query or bearer to the new document. The process ID changes
   and the local origin remains stable. Saved music/effects/volume controls
   retain their values, and the audio control starts music again. Exiting
   through the component returns to the collection and disposes its styles.
3. After another native process exit, the collection remains open and a fresh
   bare-root document does not resurrect the exited game.

Use the [desktop build recipe](../../../desktop/README.md#reproducible-tests) for the instrumented app on the matching Mac architecture. Follow the [collection-level acceptance steps](../../../docs/LOCAL_RELEASE.md#native-mac-application). Set `SOFA_TEST_COMMIT` to the tested checkout SHA when supplying it. The gate exercises the playable Odd Laws entry with the shipped runtime.

Upload `tests/integration/evidence/native/**` on success **and failure**. The
machine reports are `integration-native.json` and per-phase JSON; screenshots
are prefixed `integration-native-`. The fixture contains a public host projection,
a room code and a random marker only. It contains no bearer or database.

The normal desktop workflow still owns production app/DMG builds, signature
inspection, bundled-Node provenance, actual production launch/quit/failure
tests, both architectures, and its native Sofa Kingdoms regression. This
instrumented extension is additional combined-product evidence, not a replacement
for those gates or a production distributable. Physical phones, home Wi-Fi,
internet-disconnected hardware, trusted physical audio-unlock gestures, device
audio, sleep/wake, TV casting, Developer
ID/notarization and downloaded-app Gatekeeper behavior remain separately reported.

The [20 November integration report](../../../docs/archive/workstreams/integration.md) records the original native acceptance.

The locked `tauri-plugin-wdio-webdriver` 1.5.1 implements clicks and key/value
input with evaluated DOM operations. This suite does not describe them as
trusted operating-system input. Its range value operation is supported;
synthetic Home/Arrow keys do not invoke the browser's native range defaults.
Actual running AudioContext state and saved controls are functional checks,
while physical gesture unlocking and audible output remain separate gates.
