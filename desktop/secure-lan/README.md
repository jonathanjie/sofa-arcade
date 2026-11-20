# GO6 setup and phone diagnostic

These browser modules are standalone components. They do not register a Tauri
command, import the native bridge, provision a server over HTTP, or replace the
game’s controller. The GO7 host supplies safe, authorized callbacks.

## Host setup view

Load `setup.css`, then import `mountSecureLanSetup` from `index.mjs`:

```js
const view = mountSecureLanSetup(root, {
  getStatus,
  provision,
  exportPublicTrust,
  remove,
  onClose,
});
await view.refresh();
// On host navigation:
view.dispose();
```

| Callback | Input | Resolution |
| --- | --- | --- |
| `getStatus` | None | Exact `SecureControllerStatus` from the frozen contract |
| `provision` | `{replaceRoot:false}` normally; `{replaceRoot:true}` only after the view’s explicit replacement confirmation | Exact status after the host operation |
| `exportPublicTrust` | `{format:'pem'}` or `{format:'mobileconfig'}` | `{filename,mediaType,contents,certificateFingerprint,validUntil?}` with string public contents only |
| `remove` | `{mode:'disable'}` or `{mode:'remove'}` | Exact status after the host operation |
| `onClose` | `{mode:'touch'}` or `{mode:'close'}` | Synchronous notification; GO7 navigates back and disposes the view |

The host chooses private storage, current addresses and the actual port. None is
accepted from a form or passed in the view’s callback options. All callbacks are
capabilities and must be wrapped by GO7’s authenticated native/host boundary.
The view must not receive arbitrary filesystem or native invoke access.

Callbacks can reject `{code:'CANCELLED'}` for a user-cancelled operation. Every
other rejection uses fixed, safe retry text. The view never displays
`error.message`, stack traces, unknown status properties, private paths, or
callback result dumps. Closing/disposal ignores late completions; it cannot undo
an operation already running in the host. `refresh()` resolves without a value
and displays a safe failure state if the status callback fails. `dispose()` is
idempotent; mounting again on the same root disposes the prior instance.

Status accepts only exact canonical HTTPS origins with local names or local IPs,
no path/query/hash/userinfo, finite valid dates, and a SHA-256 fingerprint in
colon-delimited hexadecimal form. Returned origins are host metadata, not proof
that a phone can resolve or reach that address. All callback text enters through
`textContent`; the only `innerHTML` is a static authored garden SVG.

The public download is a browser Blob. Filenames, MIME types, maximum size,
fingerprint consistency and public-only PEM/profile structure are checked before
download. The host remains responsible for cryptographic validation and public
export construction. Blob URLs are revoked on replacement/disposal. The view
never exports a directory, key, token or raw callback object.

Host readiness is deliberately distinct from both phones’ trust state. The
production setup view always labels phone trust **not checked**; the frozen safe
status does not contain a phone probe channel. GO7 can show actual diagnostics
separately without inventing evidence or extending this status with secrets.

## Phone diagnostic

Serve only the four diagnostic entries from `runtime-files.json` at their stated
routes. `diagnostic.html` loads `diagnostic-page.mjs`, `diagnostic.mjs` and
`diagnostic.css`. Use restrictive CSP, no sniffing, no referrer, and no privileged
host API from those routes. This page makes no network requests after its static
assets load. It stores/transmits no raw sensor values.

Additional diagnostic API:

```js
createSensorDiagnostic({
  environment = globalThis,
  onStatus = () => {},
  source = 'browser',        // 'simulated' only in explicit test harnesses
  timeoutMs = 8000,          // 1..30000; test seam
}) -> {
  startFromGesture(),       // Promise<DiagnosticStatus>
  stop(),                   // synchronous; page-visible restart needs a new tap
  getState(),               // fresh DiagnosticStatus object
  dispose(),                // idempotent
}
```

The injected environment supplies `isSecureContext`, `location.protocol`,
`DeviceOrientationEvent`, event registration, timers, and optional document
visibility events. It is a test seam, never populated from a URL or HTTP body.
The production page uses the actual browser environment and has no simulation
query flag.

`DiagnosticStatus` is exactly:

```ts
{
  schemaVersion: 1;
  source: 'browser' | 'simulated';
  httpsLoaded: boolean;
  secureContext: boolean;
  permission: 'unrequested' | 'unavailable' | 'not-required' |
              'granted' | 'denied' | 'error';
  status: 'idle' | 'insecure' | 'unsupported' | 'awaiting-permission' |
          'waiting' | 'samples-received' | 'no-samples' | 'denied' |
          'paused' | 'error' | 'disposed';
  evidence: 'none' | 'browser-dispatched' | 'synthetic';
  sampleCount: number; // 0..9999; no angles or raw recording
}
```

`requestPermission()` is called synchronously in the gesture stack before
callbacks, promises or other async work. A granted permission alone never counts
as a sample. Both beta and gamma must be finite numbers in their valid ranges.
DOM-dispatched synthetic events cannot establish browser evidence; unit test
environments are explicitly marked simulated. `isTrusted` does not prove a
physical sensor rather than a browser-level virtual sensor, so physical device
testing remains separate even for browser-dispatched events.

The page reports HTTPS loading independently of secure-context eligibility.
Loopback HTTP may be a secure context on the test computer; that says nothing
about private-IP HTTP on a phone. It cannot inspect the trust store or determine
whether a person bypassed a browser warning. The documented acceptance path must
open without certificate warnings. Visibility loss and disposal stop owned
listeners/timers and fence delayed permission results.

## Fixtures, tests and dependencies

`fixtures/assets.mjs` exports both `SECURE_LAN_FIXTURE_ASSETS` (frozen entries with
`route`, repo-relative `file`, and `type`) and `FIXTURE_ASSETS` (URL-to-file map).
Match exact URL paths and load only those files. Do not serve the repository root.
The parent server fixture provides a temporary public root at the explicitly
enabled `/fixture/public-trust?format=pem|mobileconfig` endpoint.

The fixture’s privileged callbacks are in-memory stubs. Phone states have an
explicit **simulated** label, separate from the actual setup component. Initial,
host-ready, missing-trust, permission-denied, expiry, address-change, failed/retry
and disabled states can be selected in the fixture toolbar.

```sh
npm ci --prefix desktop/secure-lan
node --test desktop/secure-lan/tests/diagnostic.test.mjs
npm ci --prefix server/secure-lan
npm exec --prefix desktop/secure-lan -- playwright install chromium
node desktop/secure-lan/tests/browser.mjs
```

The browser runner can use `GO6_CHROMIUM_EXECUTABLE` for a preinstalled compatible
Chromium or the Playwright-installed browser. `GO6_EVIDENCE_DIR` selects its
artifact directory. It never uses ignored certificate errors or disables web
security. It writes full-page PNGs and `browser-results.json` after successful
checks. Those screenshots prove rendering and callback flows over loopback HTTP,
not trusted phone HTTPS or motion.

There are no production dependencies in this subtree. The nested development
package pins `playwright@1.62.1` and its locked `playwright-core@1.62.1`, both
Apache-2.0. Browser binaries and these test packages are not shipped. Production
allowlists are in `runtime-files.json`; all fixtures, tests, evidence, and nested
test packages are excluded.

## Primary references and device limits

- [W3C Device Orientation and Motion, 18 November 2026](https://www.w3.org/TR/2026/CRD-orientation-event-20261118/): secure context, relative orientation, feature-detected permission, and gesture requirements. Parts of permission integration still have incomplete implementation experience.
- [Apple manual profile trust](https://support.apple.com/en-us/102390): manually installed roots require explicit full TLS trust in Certificate Trust Settings.
- [Google certificate settings](https://support.google.com/pixelphone/answer/2844832?hl=en): certificate settings and per-certificate removal; its Wi-Fi installation instructions are not a promise about every browser’s CA trust. The setup copy distinguishes CA website trust from Wi-Fi configuration and labels manufacturer menus variable.

Pending hardware checks: actual iOS Safari and Android Chrome versions; manual
root/profile trust and revocation; no-warning secure join; secure context;
user-gesture permission and finite physical sensor readings; denied access;
background/lock and return; changed LAN address; expiration; and cold launch
with WAN disconnected. This component does not claim those checks are complete.
