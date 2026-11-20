# WS5 — local Tauri Mac application

## Scope and checkpoint

Branch: `feature/tauri-local`.

Base: `e34b0015399cb9791b175987adf1fab1b542565a`, verified as the remote
`main` head before creating this isolated checkout on 20 November 2026.

Owned paths are `desktop/**`, `.github/workflows/desktop.yml`, and this report.
The desktop packages the existing Sofa Kingdoms collection and shared LAN host.
It does not fork game rules or change shared runtime code. Odd Laws will enter
through the same runtime after the component handoffs and WS6 integration.

**Current checkpoint: implementation and native validation in progress.** This
report will be updated with executed checks before handoff. No Mac launch,
signed distribution, physical phone test, or offline hardware test is claimed
by this checkpoint. The PR records the exact tested head rather than embedding
this report's future commit hash in itself.

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
  `{ "schemaVersion": 1, "files": [{ "path": "...", "mode": "..." }] }`.
  Paths are explicit repository-relative files; `mode` is optional. This file
  is the desktop integration seam for WS6 after the tested handoff.
- Build-time preparation pins Node 24.22.3 LTS, verifies official archive
  checksums and provenance, and stages the executable independently from
  repo-shaped game resources. Runtime startup performs no downloads. Node's
  license and the QR dependency's license travel with the package.
- The parent preserves its saved port/origin so WKWebView storage remains
  accessible. An occupied port is an error requiring a retry after the conflict
  is resolved, not permission to attach to or stop the unrelated process.

## Ownership within WS5

| Area | Files |
| --- | --- |
| Native lifecycle and safe window | `desktop/src-tauri/**`, `desktop/shell/**` |
| Runtime pin, stage, bootstrap and host checks | `desktop/host/**`, `desktop/scripts/**`, `desktop/runtime-manifest.json`, `desktop/node-runtime.json`, `desktop/tests/host*.mjs`, `desktop/tests/runtime*.mjs` |
| Native validation and CI | `.github/workflows/desktop.yml`, `desktop/tests/native/**`, `desktop/wdio*.mjs` |
| Build dependencies, icons and handoff | `desktop/package*.json`, `desktop/icons/**`, desktop documentation, this report |

## Verified baseline

Executed in Linux x86-64 using Node 24.22.3:

```sh
npm test
```

Result: **66 tests passed, 0 failed**, including real HTTP/SSE updates, both
controller seats, strict Host/Origin rejection, credential handling, and SQLite
persistence. This verifies the starting shared runtime; it is not a native Mac
launch. Desktop test results and artifacts are recorded below once executed.

## Native validation plan and source basis

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

- Complete implementation, lockfiles, host/package tests, and native build.
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

## Handoff state

Not yet ready. Native evidence, final test commands, CI/artifact URLs, complete
file lists, and the tested head will be added before delivery. If native launch
evidence cannot be obtained, the PR remains draft with that exact gate.
