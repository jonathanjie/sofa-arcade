# GO6 — trusted local HTTPS/WSS and setup components

## Scope and source

Base: `6c6eb9343958da591b4488366c2ada4000e3ba08`, fetched from GitHub `main`.
Branch: `feature/gravity-orchard-secure-lan`, isolated worktree.
Implementation/research date: 21 November 2026 (Singapore).

This component adds optional per-install HTTPS/WSS and an explicit phone trust
setup. It preserves the ordinary HTTP/touch path. It does not enable Gravity
Orchard, create a second room/database/coordinator, or integrate the native bridge.
Only `server/secure-lan/**`, `desktop/secure-lan/**`, the GO6 workflow and this
report are changed. Shared native/server/shell sources and manifests remain GO7's.

The PR body and CI artifacts identify the exact tested committed head; this
report intentionally does not contain its own future commit SHA. The workflow
checks out the PR head explicitly, not GitHub's synthetic merge revision.

## Exported interfaces

### Exact frozen listener factory

From `server/secure-lan/index.mjs`:

```ts
createSecureLanServer({
  tlsMaterial, host = '0.0.0.0', port = 4178,
  requestHandler, onUpgrade?, onError?
}) -> Promise<{
  port: number;
  origins: readonly string[];
  status: SecureControllerStatus; // live getter
  close(): Promise<void>;        // idempotent, same promise
}>

type TlsMaterial = {
  key: Buffer; cert: Buffer; ca: Buffer; identities: string[];
}; // host-only; store-produced material refuses JSON serialization
```

`requestHandler(request, response)` and `onUpgrade(request, socket, head)` receive
the original Node objects. Their return may be void or a promise. The listener
does not rewrite `Host`, `Origin`, forwarded headers, or raw header pairs. GO7
injects the same application handler and GO2 coordinator as HTTP. Missing upgrade
handlers reject upgrades. Handler failures emit fixed codes and safe responses;
no request, credential, key or native error dump crosses `onError({code})`.

The factory validates material before binding, uses TLS 1.2 or newer with Node's
modern default ciphers, disables renegotiation, and returns actual bound ports
and reachable configured origins. Port `0` is permitted for isolated tests. It
rejects stale numeric advertised addresses on wildcard binds. `.local` aliases
are an explicit native configuration assertion, not a claim of phone DNS success.

The listener tracks raw TCP handshakes, TLS sockets and upgrades. `close()` stops
accepting first, allows 250 ms grace, destroys remaining owned connections and
has a 1 second completion deadline. It never closes the shared coordinator or
database. Expiry is rechecked in at-most-60-second chunks; expiry closes the
listener and sets `certificate-expired`. Existing established connections cannot
keep the service advertised ready after its certificate expires.

`SecureLanListenerError` is exported with a fixed message, safe `.code` and safe
`.status`. Codes include `configuration_invalid`, `material_invalid`,
`certificate_expired`, `address_mismatch`, `port_in_use`, `bind_failed`,
`listener_failed`, `close_failed`. `onError` can additionally report bounded
`request_failed`, `request_rejected`, `upgrade_failed`, `tls_client_rejected`.
A rejected phone TLS handshake is not itself a host-listener failure.

### Exact safe status

```ts
type SecureControllerStatus = {
  enabled: boolean;
  status: 'disabled' | 'needs-setup' | 'ready' |
    'certificate-expired' | 'address-mismatch' | 'failed';
  controllerOrigins: string[];
  certificateFingerprint?: string; // public ROOT SHA-256, colon-separated hex
  validUntil?: string;             // leaf expiry as ISO-8601 UTC
  requiresPhoneTrust: boolean;
};
```

Only `ready` advertises join origins. Host readiness never asserts phone trust,
secure-context eligibility, permission or physical sensor readings. The setup
view leaves each phone's trust **not checked**. No private bytes, private paths,
bearer credentials or root-replacement internals are added to this status.

### Certificate store and validation helpers

From `server/secure-lan/certificates/index.mjs`:

```ts
normalizeIdentity(value: string) -> string
normalizeIdentities(values: string[]) -> readonly string[]
validateTlsMaterial(material: TlsMaterial, {now = Date.now()} = {})
  -> {identities, certificateFingerprint, validUntil} // synchronous

createCertificateStore({appDataDir, now = () => Date.now()}) -> {
  inspect({identities?} = {}): Promise<MaterialInspection>;
  provision({identities, port = 4178, renewLeaf = false, replaceRoot = false})
    : Promise<MaterialInspection>;
  loadTlsMaterial({identities?} = {}): Promise<TlsMaterial>;
  exportPublicTrust({format = 'pem'} = {}): Promise<PublicTrustExport>;
  remove(): Promise<{removed: boolean}>;
}

type MaterialInspection = {
  state: 'missing' | 'valid' | 'certificate-expired' | 'address-mismatch' | 'failed';
  identities: readonly string[];
  port?: number;
  certificateFingerprint?: string;
  validUntil?: string;
  rootReplacementRequired: boolean;
}; // internal host metadata; 'valid' is NOT listener-ready

type PublicTrustExport = {
  filename: string;
  mediaType: 'application/x-x509-ca-cert' | 'application/x-apple-aspen-config';
  contents: string; // exactly public root PEM or CA-only Apple profile
  certificateFingerprint: string;
  validUntil: string; // ROOT expiry for the exported trust material
};
```

`inspect()` returns a safe failed inspection on corrupt/inaccessible storage.
Mutations/material loading reject `SecureLanCertificateError` with fixed messages,
safe `.code`, `.status`, `.rootReplacementRequired`, and a safe JSON form. Codes
include `MATERIAL_MISSING`, `MATERIAL_INVALID`, `CERTIFICATE_EXPIRED`,
`CERTIFICATE_NOT_YET_VALID`, `ADDRESS_MISMATCH`, `INVALID_IDENTITIES`,
`INVALID_CONFIGURATION`, `ROOT_REPLACEMENT_REQUIRED`, `STORAGE_UNSAFE`,
`STORAGE_UNAVAILABLE`, `STORE_BUSY`, `PROVISION_FAILED`. No error retains the
underlying filesystem or crypto error. Other certificate submodules are internal
implementation, not phone APIs.

### Host-only composition and authorization

From `server/secure-lan/host-capabilities.mjs`:

```ts
createSecureLanHost({
  certificateStore, getIdentities, authorizeHost,
  host = '0.0.0.0', port?, requestHandler, onUpgrade?, onError?,
  createServer = createSecureLanServer // host test injection
}) -> {
  getStatus(): Promise<SecureControllerStatus>;
  start(context): Promise<SecureControllerStatus>; // valid existing material only
  provision(context, {replaceRoot = false} = {}): Promise<SecureControllerStatus>;
  exportPublicTrust(context, {format = 'pem'} = {}): Promise<PublicTrustExport>;
  remove(context, {mode = 'remove'} = {}): Promise<SecureControllerStatus>;
  close(): Promise<void>;
}

createLoopbackHostAuthorizer({origin, verifyHost})
  -> async (originalNodeRequest, operation) => boolean
```

`getIdentities()` supplies trusted current native/network identities; it is never
populated from a request body. `authorizeHost(context, operation)` must explicitly
resolve `true`; absent, throwing, false or truthy non-boolean results deny before
any privileged IO. A native adapter may use an unforgeable internal caller
context. The optional loopback authorizer additionally requires a real loopback
socket, the exact HTTP loopback Host/Origin, POST at `/api/host/secure-lan`, no
query, and `verifyHost({request, operation}) === true`. This helper registers no
route. Loopback alone, forwarded headers and a player bearer are insufficient.

The facade serializes mutations. `start` never creates a missing root or silently
repairs an invalid one. Explicit `provision` renews the leaf and retains the root
unless `replaceRoot:true` is confirmed. A failed setup leaves HTTP available.
Safe reads detect expired, corrupt or changed-address material and stop the old
listener without issuing certificates. GO7 calls status refresh on network/wake
notifications. A `port:0` development bind persists the returned real port.

`remove({mode:'disable'})` closes HTTPS while retaining material; `remove` deletes
only owned material. `close()` marks the facade disposed synchronously and closes
live network resources immediately, even while unrelated async callbacks are
blocked. Late starts are fenced and closed. It does not cancel already-started
filesystem work, and no queue may start a later service. Native shutdown retains
its existing bounded child-process fallback. GO7 persists the enabled preference
in its own configuration; this facade deliberately does not edit that shared file.

Safe host errors include `HOST_FORBIDDEN`, `HOST_CLOSED`, `INVALID_OPTIONS`,
`INVALID_HOST_CONFIGURATION`, `INVALID_HOST_ORIGIN`, `PROVISION_FAILED`,
`EXPORT_FAILED`, `REMOVE_FAILED`. Setup failures reject with a safe code; `start`
and `getStatus` return actionable safe status. Host operations accept no arbitrary
address, path, output filename, native command or private-export format from UI.

### Scheme-aware validation hook for GO7

`server/secure-lan/request-policy.mjs` exports:

```ts
createRequestPolicy({httpOrigins = [], httpsOrigins = [],
  upgradePath = '/api/realtime/gravity-orchard'} = {}) -> {
  validateRequest(request):
    {ok:true, origin:string, scheme:'http'|'https', url:URL} |
    {ok:false, status:400|403|421, code:string};
  validateUpgrade(request): boolean; // synchronous, for GO2
}
```

Native-owned origin sets must contain the actual bound ports. The policy checks
the actual `request.socket.encrypted` property, exact Host/Origin and duplicate
raw headers. It ignores forwarded headers rather than trusting or altering them.
Origin-less GET/HEAD navigation is allowed; all other methods require exact
same-origin Origin. WebSocket upgrades additionally require GET, an exact route
without query/hash, and correct upgrade headers. Authentication still follows
GO2's bounded first message; Origin checking never establishes a player seat.

The current `server/lan.mjs` constructs `http://${suppliedHost}`, compares one
HTTP port and builds HTTP join metadata. GO7 must extract/adapt that shared
handler deliberately. Passing the old handler unchanged into HTTPS would reject
legitimate HTTPS Origins. Rewriting incoming headers to bypass that rejection is
not an acceptable adaptation.

### Exact setup factory and callbacks

From `desktop/secure-lan/index.mjs`, with `setup.css`:

```ts
mountSecureLanSetup(root, {
  getStatus, provision, exportPublicTrust, remove, onClose
}) -> {refresh(): Promise<void>, dispose(): void}
```

| Callback | Input | Resolution |
| --- | --- | --- |
| `getStatus` | None | Exact safe status |
| `provision` | `{replaceRoot:false}`; true only after explicit root replacement confirmation | Exact safe status |
| `exportPublicTrust` | `{format:'pem'|'mobileconfig'}` | Public export object above |
| `remove` | `{mode:'disable'|'remove'}` | Exact safe status |
| `onClose` | `{mode:'touch'|'close'}` | Synchronous navigation/disposal notification |

GO7 wraps these callbacks around native context, e.g.
`provision: options => secureHost.provision(nativeContext, options)`. The browser
view gets no broad bridge, filesystem handle or host token. `{code:'CANCELLED'}`
is reserved for genuine user cancellation; other errors display fixed copy.
Refresh failure shows a safe failed state. Disposal/repeated mounting fences late
callbacks and revokes Blob URLs, without claiming to undo a host operation already
underway. Exports are bounded, filename/MIME/structure checked public downloads.

The setup is responsive, keyboard accessible, reduced-motion aware, and separate
from the game HUD. It offers immediate touch play, manual phone instructions,
fingerprint comparison, safe join links, diagnostic links and explicit removal.
The diagram is authored SVG/CSS; no generated art dependency or credential QR is
introduced. Phone examples in the fixture are marked simulated.

### Diagnostic contract

`desktop/secure-lan/diagnostic.mjs` exports `createSensorDiagnostic({environment =
globalThis, onStatus = () => {}, source = 'browser', timeoutMs = 8000})`, returning
`{startFromGesture(), stop(), getState(), dispose()}`. The full status type and
callback semantics are in [the UI README](../../desktop/secure-lan/README.md).

It reports HTTPS loading, `isSecureContext`, permission, finite sample count and
evidence separately. `requestPermission` is feature-detected and called directly
inside the gesture before async work. Null/nonfinite/invalid angle samples cannot
pass. Synthetic DOM events cannot establish browser evidence; tests explicitly
label simulation. It stores/transmits no raw readings. Visibility, disposal,
late permission completion and BFCache restoration are handled. This is a probe,
not GO3's calibration or controller implementation. Browser-dispatched events
still do not prove physical phone hardware, and the page cannot inspect the OS
trust store or detect a person bypassing a certificate warning.

## Certificate lifecycle and storage decisions

- Each explicit fresh installation receives a new random installation identity,
  P-256 ECDSA/SHA-256 CA and separate leaf key. Roots last five years (1825 days);
  leaves are issued for 90 days, never beyond root expiry. Not-before has a bounded
  five-minute backdate. No global signing key or pre-generated certificate exists.
- Root constraints are critical CA/pathLen 0 with certificate-sign/CRL-sign usage;
  leaves are non-CA, digital-signature, serverAuth only. Validation checks key
  pairing, issuer/signature, SAN exact-set coverage, AKI/SKI and extensions, dates,
  algorithms and bounded validity. A matching CommonName is insufficient.
- Allowed identities are explicit private/link-local/loopback IPs and `localhost`
  or valid `.local` names, at most 16. Wildcards, public names/IPs, zones, URLs,
  credentials, traversal and ambiguous strings are rejected. Numeric IP join
  links avoid making unproved mDNS assumptions.
- GO7 supplies an existing physical canonical app-data directory outside served
  resources. Use `realpath` on macOS's native path first. The store creates only
  `secure-lan-v1/` with mode 0700, writes mode-0600 regular single-link files and
  refuses unsafe owner/mode/symlink/ancestor conditions. It does not chmod unrelated
  parents. Another native process already running as the same user is outside
  this filesystem isolation boundary; Node has no portable `openat` facility.
- One bounded private envelope contains the root, leaf and configuration and is
  committed using exclusive temporary creation, fsync and atomic rename. A public
  identity witness prevents loss of the private envelope from silently minting a
  replacement root. Explicit rotation temporarily witnesses old and candidate
  identities so a failed private commit leaves the old installation usable.
- Cross-instance in-process serialization and an exclusive live-PID lock prevent
  concurrent mutation. Only provably dead lock owners are recovered; reused/live
  PIDs remain busy. Failed lock writes remove their exact owned inode. Cleanup
  is restricted to known files and staging names, never a recursive app-data delete.
- Renewal/address refresh preserves the existing root. A corrupt/expired root
  needs explicit replacement and new phone trust. Disabling preserves material.
  Removing local files does not remove profiles from phones or securely erase
  copies/backups; remove only this installation's phone certificate separately.
- PEM export contains one public CA certificate. The Apple profile contains one
  public root payload, no keys, credentials, VPN/MDM payload, filesystem archive
  or configuration authority. Profile installation/full trust is always manual.

The CA is not cryptographically name-constrained: the issuer code allows only
local identities, but phone OS trust can authenticate certificates signed by the
installation key generally. The setup explains that broader trust decision.
Private keys are PKCS#8 in protected app data; encrypted-at-rest key storage is
not claimed. Protecting the host account and separately removing phone trust are
part of the explicit setup/removal model.

## Runtime and dependency inventory

[Server inventory](../../server/secure-lan/runtime-files.json) lists every host
source and every locked production package/version/license/integrity hash.
[UI inventory](../../desktop/secure-lan/runtime-files.json) separates the host
setup view from the four public diagnostic files. Inventory tests check local
import closure, exact installed versions and exclusion of private/fixture code.

Production host source consists of the listener, request policy, host facade and
six certificate modules. The public phone surface consists only of
`diagnostic.html`, `diagnostic.mjs`, `diagnostic-page.mjs`, `diagnostic.css` at the
four explicit `/secure-lan/diagnostic*` routes. `index.mjs`/`setup.css` are host
setup assets. Never broadly serve `server/secure-lan`, native source or app data.

| Package set | Exact version | License | Purpose |
| --- | --- | --- | --- |
| `@peculiar/x509` | 3.1.0 | MIT | Established X.509 issuance/parsing using Node WebCrypto |
| `reflect-metadata` | 0.2.2 | Apache-2.0 | Explicit dependency required by the X.509 library |
| Twelve `@peculiar/asn1-*` packages listed in inventory | 3.1.0 | MIT | ASN.1 schemas; preserve locked transitive closure |
| `@peculiar/utils` | 4.1.1 | MIT | Dependency utilities |
| `asn1js` | 4.1.0 | BSD-3-Clause | ASN.1 parsing/encoding |
| `tsyringe` | 4.10.0 | MIT | Library dependency injection |
| `tslib` | 1.14.1 | 0BSD | Library emitted helpers |
| `ws` | 8.23.0 | MIT | **Development only**, standalone echo fixture and WSS tests |
| `playwright`, `playwright-core` | 1.62.1 | Apache-2.0 | **Development only**, UI test runner |

The production dependency closure is 18 packages, 599 files, 1,390,068 installed
bytes (about 1.33 MiB) in this checkout. All are JavaScript; no native addon,
OpenSSL CLI, mkcert, Homebrew, shell install, public DNS, hosted relay, external
account or startup download is required at player runtime. The already-bundled
desktop Node remains 24.22.3. GO6 also checks the repository Node 22.13.0 baseline.
No Rust/native dependency is added by this component.

At **packaging time**, GO7 can run
`npm ci --prefix server/secure-lan --omit=dev --ignore-scripts` and preserve that
nested module layout, or bundle the identical locked dependency closure. Include
all dependency license notices in the existing native inventory. Do not ship the
development-only `ws`, Playwright, fixtures, tests, screenshots, test key material,
temporary app-data directory or arbitrary checkout node_modules. Production
packages and source are build inputs, not phone routes. Root/desktop manifest
and final runtime-allowlist changes are deliberately not in this PR.

## Reproducible validation and evidence

From the repository root:

```sh
npm ci --prefix server/secure-lan --ignore-scripts
npm ci --prefix desktop/secure-lan --ignore-scripts
node --test server/secure-lan/certificates/tests/*.test.mjs server/secure-lan/tests/*.test.mjs desktop/secure-lan/tests/diagnostic.test.mjs
node --test server/lan.test.mjs server/room-lan-integration.test.mjs ui/transport.test.mjs
npm test
npm run install:ci
npm run build
```

Local Node 24.22.3 results: **74/74** component tests pass; the unchanged LAN/private
room/transport set passes **22/22**; `npm test` passes **81/81**; the production
build passes. Generated/shared build outputs are not committed.

Component tests cover unique roots, restart persistence, renewable leaf/address
changes, expiry/corruption/SAN/key/purpose rejection, atomic refresh and root
rotation failure, lock retry/concurrency, restrictive storage, public export
redaction, real CA-verifying HTTPS, wrong root/hostname/expired peer failures,
real WSS data, shared authority, original headers, spoofed/duplicate headers,
host authorization rejection, port conflicts, actual socket shutdown, lifecycle
races, static-route rejection and runtime import/dependency closure. Tests create
all certificates in temporary private directories and never modify a trust store.

For the standalone actual listener + simulated setup fixture:

```sh
node server/secure-lan/fixture.mjs
```

It prints only safe public URLs/fingerprint. `/secure-lan/setup` renders injected
safe host stubs; `/secure-lan/diagnostic` is also available over the real HTTPS
listener. One deterministic toy authority is shared by HTTP and HTTPS/WSS. It is
not a game/room store. Public download is a deliberately enabled, cached,
development-only root/profile response at `/fixture/public-trust`; no request
can invoke provisioning or choose a filesystem path. Shutdown removes only its
fresh temporary directory. For a manual LAN fixture, explicit `--host=0.0.0.0`,
`--identity=<actual-LAN-IP>`, `--http-port=...`, `--https-port=...` are available.
Do not bypass warnings; ephemeral fixture trust, if manually installed, must be
removed by the tester afterwards.

For browser checks and screenshots:

```sh
node desktop/secure-lan/node_modules/playwright/cli.js install --with-deps chromium
node desktop/secure-lan/tests/browser.mjs
```

The local managed shell blocks Chromium's Unix-domain socket creation. Its
granular approval policy also rejected an outside-sandbox launch; no bypass or
security flag was used. The GO6 workflow therefore runs browser flows and captures
screenshots on GitHub Actions, alongside TLS/storage checks on Linux Node 22.13
and 24.22.3 and macOS ARM/Intel Node 24.22.3. Its `go6-setup-<head-SHA>` artifact
contains `browser-results.json`, `tested-sha.txt` and nine PNGs: initial, ready,
missing-trust, permission-denied, expired, address-changed, failed, narrow setup,
and HTTP-loopback diagnostic. Screenshots are UI evidence; simulated host/phone
states and loopback secure-context eligibility do not prove phone trust/sensors.

The executor also denies interface enumeration (`uv_interface_addresses` EPERM).
The production wildcard listener fails closed in that case. Only address-discovery
unit tests stub the interface list; TLS, hostname verification, HTTP/WSS and socket
cleanup tests use real loopback sockets. No physical device or wildcard LAN
reachability claim is inferred from those tests.

## Concrete GO7 composition checklist

1. Extract the existing application handler around one `DB`/room API/SSE state;
   preserve that one authority. Adapt its scheme and actual per-listener ports,
   metadata and exact Host/Origin validation explicitly. Keep loopback host HTTP
   stable. Do not instantiate `startLanServer` a second time for HTTPS.
2. Instantiate GO2 once. Inject its `handleUpgrade` into both listeners, and the
   synchronous policy's `validateUpgrade` into GO2. Existing bearer authorization
   resolves the actual host/player; neither a public GET nor client seat fields
   establish authority. Both channels retain one checkpoint/database path.
3. Resolve native app data physically, create the certificate store and host
   facade, and provide current validated network identities. Use actual bound
   origins in policy. On a changed address, pause/reconnect appropriately, refresh
   status and require explicit leaf refresh; use the updated credential-free
   secure join URL. Prefer numeric IPs unless phone mDNS resolution is verified.
4. Register narrowly scoped privileged native commands for status, provision,
   public export and remove/disable. Retain existing native/host authority and
   exact origin/window validation. Never expose arbitrary invoke/filesystem APIs
   or trust-store operations in a phone route. Wrap the setup callbacks around
   trusted native context. If using HTTP IPC, require the loopback authorizer plus
   existing host credential verification; same-LAN and loopback alone do not pass.
5. Add the exact safe status as additive readiness metadata in both JS and Rust
   protocol parsing. Existing `deny_unknown_fields` means the native parser must
   be deliberately extended; do not serialize TLS material or replace the saved
   loopback host origin. Persist only validated port/enabled/public navigation
   metadata, never keys or private paths in readiness/log output.
6. Include the exact host/dependency and browser inventories above in native,
   portable and serving inventories. The diagnostic is public and capability-free;
   setup remains host-only. No generated trust material belongs in packages.
7. On shutdown, stop/fence new work and controllers, close both listeners and
   coordinator, settle shared pending authority/checkpoint operations, then close
   the one database. GO6 closes its sockets, not injected shared resources. Retain
   the native parent's bounded child termination fallback and existing quit path.
8. Run combined old-game/native/two-phone acceptance and the hardware checks below
   before describing integrated tilt or WAN-disconnected gameplay as verified.

## Primary-source verification

These sources were checked for this implementation, rather than assuming old
blanket browser/TLS behavior:

- [W3C Device Orientation and Motion, 18 November 2026 draft](https://www.w3.org/TR/2026/CRD-orientation-event-20261118/) and [Secure Contexts](https://www.w3.org/TR/secure-contexts/): secure-context restrictions, relative orientation permission and user-activation requirements; implementation differences still require devices.
- [Apple manual certificate trust](https://support.apple.com/en-us/102390): manual profile installation needs a separate full SSL/TLS trust action on the phone. [Apple TLS requirements](https://support.apple.com/en-us/103769): SHA-2, SAN and serverAuth EKU/validity requirements; the issued P-256/SHA-256 90-day leaf meets the relevant structural constraints.
- [Chromium verifier FAQ](https://chromium.googlesource.com/chromium/src/net/+/HEAD/data/ssl/chrome_root_store/faq.md): local trust decisions apply to TCP TLS; Android Chrome must still be tested, separately from native Android app certificate configuration.
- [Google certificate settings](https://support.google.com/pixelphone/answer/2844832?hl=en): per-device settings/removal guidance. Its Wi-Fi example is not treated as universal Chrome website-CA onboarding; the UI explicitly distinguishes those uses.
- [Chrome Local Network Access](https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access): current Chrome has certain HTTPS-to-local-WS mixed-content exemptions, including recognizable local IPs and `.local`. This is not extrapolated to Safari or used to introduce a hosted controller.
- [mkcert author documentation](https://github.com/FiloSottile/mkcert): separate mobile root installation and private CA-key secrecy; mkcert is not shipped as a consumer runtime prerequisite.
- [Node HTTP](https://nodejs.org/download/release/latest-v24.x/docs/api/http.html) and [Node TLS](https://nodejs.org/docs/latest-v22.x/api/tls.html): original raw headers, actual TLS socket identity, and explicit tracking of upgraded connections during close.
- [Peculiar certificate issuance](https://peculiarventures.github.io/x509/docs/examples/certificates/issue-certificate/) and [library requirements](https://github.com/PeculiarVentures/x509/blob/master/README.md): established issuance, explicit reflect metadata, Node/WebCrypto APIs and pinned runtime compatibility.

The technical notes' [Let's Encrypt challenges](https://letsencrypt.org/docs/challenge-types/),
[WebRTC connections](https://webrtc.org/getting-started/peer-connections),
[data channels](https://webrtc.org/getting-started/data-channels), and
[WHATWG WebSockets](https://websockets.spec.whatwg.org/) were also reviewed.
DNS issuance/renewal and WebRTC signaling/ICE are not hidden substitutes for the
selected local factory.

## Remaining native and device checks

This is a component handoff, not final integrated-game acceptance. No real phone
or packaged GO6 Tauri bridge was available in this session. Node acceptance of
an explicit test CA establishes chain/identity behavior only.

Record exact Mac/iOS/Android/browser versions and tested committed SHA for:

- iOS Safari: public profile transfer, fingerprint, install, separate full trust,
  no-warning HTTPS join, `isSecureContext`, gesture permission and finite actual
  motion samples; denial, revoked profile/trust and re-enrollment.
- Android Chrome: manufacturer-specific website CA installation, no-warning HTTPS
  and WSS, secure context and physical samples; missing/revoked trust and permission
  denial. Managed-phone policy may make touch the available route.
- Wrong SAN, expired leaf/root, changed Wi-Fi/IP, mDNS if used, background/lock,
  reconnect and wake. Trusted certificates do not imply network reachability.
- Integrated packaged ARM/Intel Mac lifecycle, host-only bridge authorization,
  one database/coordinator, two controllers, ordinary HTTP touch fallback, quit
  cleanup, and a cold start with WAN disconnected after setup.

No system or phone trust was altered automatically; no TLS error was ignored;
no browser security setting was disabled; no PR was self-merged or deployed.
