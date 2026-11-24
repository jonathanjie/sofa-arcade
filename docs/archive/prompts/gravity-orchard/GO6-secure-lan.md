> Historical record. This assignment ended on 21 November 2026 at `e0504c1`.

# GO6 — Secure local phone access and Tauri setup components

Copy this entire prompt into a new coding session. Implement the work, test it, push a branch and open a GitHub PR. Do not stop at a plan. Do not self-merge or deploy.

## Context and source of truth

Repository: **https://github.com/jonathanjie/sofa-arcade**. GitHub `main` is canonical. Sofa Arcade keeps all games in one repository. Jon and Lydia play on a living-room TV using a local Tauri Mac host and two ordinary phone browsers on their LAN. Existing Sofa Kingdoms and The Odd Laws Society must keep working. The existing hosted Site is a separate delivery path; this assignment does not publish it or create a replacement service.

The new game is **Gravity Orchard v0.2**, replacing the earlier turn-based grid concept. It is a real-time cooperative game with two linked floating garden trays, one controlled by each phone's two-dimensional tilt, a center bridge, fruit deliveries and a held brake. The initial run is three authored 90-second stages. Warm illustrated Jon, Lydia and Lala characters and dynamic motion should feel at home in the collection. Regular TV and phone play remains uncluttered; explanations belong in setup/tutorial/Help.

Your assignment is the secure-local-access component and host setup experience, enabling browser sensors honestly. Plain `http://<Mac LAN IP>` is not a reliable secure context for phone motion. A certificate trusted only on the Mac does not establish trust on either phone. Deliver an optional trusted HTTPS/WSS route with explicit phone setup and a dependable HTTP/touch fallback, without adding a paid cloud dependency, mandatory internet during configured local play, or a native phone app.

## Start correctly

1. Fetch current GitHub `main`, use your own clean worktree/clone, record the exact base SHA, and create `feature/gravity-orchard-secure-lan` or a collision-free branch with that prefix.
2. Start from main containing this packet. If the reviewed packet has not merged, explicitly pin the exact reviewed packet commit identified by `docs/archive/DISPATCH_GRAVITY_ORCHARD.md` and record that dependency; do not wait unnecessarily or follow a moving branch tip. Read `AGENTS.md`, `README.md`, `docs/HANDOFF.md`, `docs/GITHUB_WORKFLOW.md`, `docs/archive/DISPATCH_GRAVITY_ORCHARD.md`, `docs/GRAVITY_ORCHARD_CONTRACT.md`, `docs/GRAVITY_ORCHARD_TECHNICAL_NOTES.md` and the v0.2 `docs/games/gravity-orchard.md`. Reconcile a stale checkout rather than using the superseded turn-based draft.
3. Inspect current `server/lan.mjs`, `desktop/host/entry.mjs`, `desktop/host/lifecycle.mjs`, `desktop/src-tauri/src/protocol.rs`, `desktop/src-tauri/src/config.rs`, native/runtime tests and pinned Node/Rust versions. Those shared sources remain read-only to you.
4. This dispatch's ownership overrides older broad WS assignments. You may use up to three subagents if that capacity is available, assigning disjoint files before edits. You retain responsibility for assembly, tests and the PR. Do not assume a universal account concurrency limit.

## Exclusive write set

You may create or modify only:

- `server/secure-lan/**`
- `desktop/secure-lan/**`
- `.github/workflows/go6-secure-lan.yml`
- `docs/archive/workstreams/gravity-orchard-go6.md`

Tests, fixtures, test-only certificate generation, evidence indexes and any nested manifests/lockfiles must stay inside those owned directories. Do not commit runtime private material or installed dependencies.

GO7 owns all shared production wiring, including `server/lan.mjs`, `server/rooms.mjs`, `desktop/host/**`, `desktop/src-tauri/**`, desktop/root manifests and locks, native command registration, readiness records, global UI/shell, runtime inventories and packaging. Do not edit those files even if it would make a full-app demonstration easier. Export components GO7 can compose and describe the exact integration changes in your report.

GO2 owns the realtime coordinator; GO3 phone/sensors; GO4 TV/tutorial; GO5 media; GO1 simulation. Do not wait for or import their unmerged work. Your fixture injects safe handlers/upgrade callbacks and host operations. Finish a component PR independently.

## Architecture and public seams

Keep the current HTTP listener and loopback host origin available. Add an optional HTTPS listener serving the same application authority; WSS must reach the same coordinator. This component must never create a second database, room API or simulation authority.

Export the exact TLS listener factory `createSecureLanServer({ tlsMaterial, host, port, requestHandler, onUpgrade, onError })`, returning `Promise<{ port, origins, status, close() }>` as frozen in the canonical contract. `tlsMaterial` contains host-owned private key/certificate buffers and advertised identities; never serialize it to UI/readiness output. Pass the original Node request/socket to the injected handlers. GO7 derives secure scheme from the actual listener or `request.socket.encrypted` and injects GO2's synchronous `validateUpgrade(request)` policy; forwarded headers never establish trust. Return actual bound addresses and an idempotent bounded close operation. Do not rewrite incoming headers to make an HTTP-only handler silently believe a different origin; document the explicit GO7 shared-handler adaptation needed.

Export the exact setup view `mountSecureLanSetup(root, { getStatus, provision, exportPublicTrust, remove, onClose })`, returning `{ refresh(), dispose() }` as frozen in the canonical contract. It receives safe host callbacks; document their exact tested return/error behavior in your handoff. It does not embed a broad native bridge or filesystem API into phone content.

The safe status is exactly:

```ts
type SecureControllerStatus = {
  enabled: boolean;
  status: 'disabled' | 'needs-setup' | 'ready' |
    'certificate-expired' | 'address-mismatch' | 'failed';
  controllerOrigins: string[];
  certificateFingerprint?: string;
  validUntil?: string;
  requiresPhoneTrust: boolean;
};
```

Host `ready` means the certificate and listener are usable. It does not mean either phone trusts the root or has granted motion permission. Phone-side trust/secure-context/sensor probes establish those separate facts. Do not add secret bytes, private key paths, credentials or unredacted errors to status records.

Where the canonical contract fixes export names/signatures, follow it exactly. Publish exact interfaces and types for every additional store/helper in your report. Use injection for missing shared wiring rather than changing the interface to accommodate a fixture.

## Certificate lifecycle and privilege boundaries

Implement the needed provisioning/storage helpers inside your owned subtree using an established certificate implementation. Generate unique per-install material and a leaf certificate with the correct advertised hostname/IP SANs, modern accepted TLS algorithms, appropriate usage and bounded validity. Use pinned dependencies and document their licenses/runtime footprint. Do not hand-roll cryptographic primitives or quietly require a developer to have Homebrew/openssl commands installed at player runtime. If an external tool is necessary for a developer harness, label it explicitly and separate it from the intended packaged runtime.

The installed app's private data directory is supplied by GO7. Never infer it from a request, expose arbitrary path inputs, write into the checkout, or save secrets in served assets. Use restrictive permissions, atomic writes, serialization and safe handling of symlinks/path traversal. Preserve a valid installation identity across restarts and leaf refreshes. Do not silently replace the root CA and strand already trusted phones.

Required behavior:

- Explicit setup creates per-install CA/leaf material and starts or prepares the optional secure listener.
- Missing/invalid material produces a safe status and leaves HTTP/touch play available.
- Expired certificates and advertised-address mismatches produce actionable statuses; never tell the browser to ignore them.
- Leaf renewal/address changes preserve the installation's existing root where valid and appropriate. Root replacement is explicit, with instructions to update phone trust.
- Disable stops secure service without destroying unrelated data. An explicit removal action removes only this installation's own material and explains that phone profiles require separate removal.
- Public export contains only the CA certificate or public configuration profile, suggested filename, fingerprint and safe metadata. It must never include a CA key, leaf key, token, database or broad directory archive.
- Listener shutdown closes owned connections/resources and does not leave an orphan service after host disposal.

Provision, remove and privileged export initiation belong only to an explicit native or authenticated loopback host seam. Loopback location alone is not authorization: retain Host/Origin checks and existing host authority. Ordinary phone routes cannot provision, request arbitrary files, mutate certificates, invoke OS trust operations or export secrets. A deliberately enabled public root-download route may serve only the exact public certificate/profile and must not become general filesystem access.

Never automatically install OS or phone trust, manipulate unrelated trust entries, use shared signing keys, commit private material, disable TLS verification, request browser-security flags, or add a compulsory hosted relay. Manual phone trust is a real user action; provide clear instructions rather than pretending code can grant it.

## Setup experience and meaningful visuals

Build a polished, compact setup view inside `desktop/secure-lan/**`, with injected host callbacks. It should explain in plain language that tilt needs one-time trust setup on each phone, allow immediate touch play, and guide the user through public-certificate transfer, phone trust, secure join and a diagnostic check. Explain the scope of trusting this installation and how to remove it. Do not bury this in a permanently visible game HUD.

Use readable code-native graphics for the Mac/TV and two-phone connection diagram, concise per-device states, a visible public fingerprint and a safe join URL/QR if an existing injectable QR utility is available. Do not bake credentials into a QR or require a new image-generation dependency for backend diagrams. Distinguish host listener ready, phone HTTPS connected, secure context confirmed and motion samples received. A setup mock must label simulated device states.

Add a standalone runnable fixture with your actual TLS listener, an injected deterministic HTTP handler and a minimal upgrade echo/test handler. It must serve only a small explicit asset list, not the repository root. Include a setup-view fixture with fake privileged callbacks that records only safe operation results. Show healthy, not configured, expired/mismatched, permission-denied and retry states. Keep keyboard access, visible focus, narrow layouts and reduced-motion behavior. Capture screenshots of representative states.

Do not implement the final phone sensor/calibration UI owned by GO3. Supply a safe diagnostic contract/page fixture sufficient to check secure-origin eligibility and report whether a sensor probe is real or simulated. Do not report an HTTP fixture as evidence of working browser tilt.

## Research constraints to preserve

Read the primary links in the technical notes and verify any changed platform behavior before relying on it:

- W3C Device Orientation and Motion restricts the API to secure contexts; permission APIs differ across implementations. Feature-detect and test actual devices.
- Apple requires explicit full SSL/TLS trust for manually installed root profiles. A certificate generated on the Mac is not automatically trusted by phones.
- mkcert documents separate mobile-root installation and warns against exposing the private CA key. It is a development tool, not a complete consumer setup flow.
- Current Chrome documents a Local Network Access mixed-content exemption for HTTPS-to-local WebSockets in certain URL forms. Do not repeat blanket outdated mixed-content claims, but do not extrapolate Chrome behavior to Safari or make a hosted controller the unrequested default.
- Owned public DNS/certificates require issuance/renewal and resolution; WebRTC still requires signaling/ICE/caching. Those optional architectures do not replace this scoped local factory.

Do not introduce an unrelated PWA, cloud service, public DNS automation, WebRTC stack or native phone app as a substitute for completing the local HTTPS component.

## Tests and CI

Add `.github/workflows/go6-secure-lan.yml` to run all new component suites. Follow repository action pinning and lockfile conventions. Cover Linux and macOS where relevant, plus the pinned desktop Node baseline. Use nested dependencies/locks inside your own directories if needed; list the exact runtime additions GO7 must package. No root/desktop manifest or lockfile edits.

Required meaningful tests:

- Fresh unique installation identities, restart persistence, valid leaf renewal, atomic write failure, restrictive permissions, inaccessible directories and safe cleanup.
- Wrong hostname/SAN, expiry, corrupted/missing certificate material and address refresh yield the defined statuses.
- Real HTTPS requests using an explicit trusted test CA succeed; wrong root/hostname/expired certificates fail. Do not use `rejectUnauthorized:false` or ignored browser certificate errors as passing acceptance evidence.
- Real WSS upgrade/data through the injected upgrade handler; both request and upgrade paths reach injected authority rather than a second store.
- Original request preservation, exact scheme-aware Host/Origin validation through injected handlers/policy, rejection of unexpected hosts/origins and no public privileged operations. Test spoofed forwarded headers, phone/LAN contexts attempting provision/remove/private export, and loopback without host authorization.
- Static-route allowlists and export redaction: no key, private filesystem path, room token or database appears in response, status, QR, logs or packaged fixture assets.
- Port conflicts, partial start failure, repeated start/close, active socket shutdown, host disposal and changed address behavior.
- Setup-view browser flows, cancellation, retry, callback failures, keyboard navigation, narrow layouts and dispose/repeated mounting.
- Runtime/source inventory identifies every nested runtime dependency, safe browser module and public asset; secrets and test certificate fixtures are excluded from production packaging.

Generate test certificates in temporary storage for tests. Do not modify the runner's or user's actual trust store just to make a test pass. An explicit CA in a test TLS client proves chain/hostname handling; it does not prove the user's phone trust settings.

Run relevant unchanged LAN/native regressions as feasible and the repository production build when dependencies/environment permit. Shared generated build artifacts remain GO7-owned and must not be committed. Report exact commands and outcomes; do not relabel an unavailable Mac test as successful native acceptance.

## Hardware and integrated acceptance

If real devices are available, record exact device/browser/OS versions and test both iOS Safari and Android Chrome: explicit public-root trust, secure join, `isSecureContext`, user-gesture motion permission and finite readings. Test denial, revoked trust, wrong certificate, background/lock, reconnect and changed LAN address. Confirm a cold local launch with WAN disconnected after configuration. No browser-security flags or ignored certificate errors may be used.

GO7 owns actual Tauri bridge registration, packaged Mac lifecycle, source/runtime allowlists and combined two-phone gameplay. Your component fixture does not claim those integrations already exist. If the necessary hardware is unavailable, finish automated/fixture work and open the tested component PR with a precise pending hardware checklist. Do not wait indefinitely for another lane or claim universal phone support.

## Handoff and tested PR

Write `docs/archive/workstreams/gravity-orchard-go6.md` containing scope/base SHA, exact exported interfaces/status and callback contracts, certificate lifecycle/security decisions, all runtime/browser files, dependency/license inventory, reproducible commands, actual test results, safe screenshot/evidence paths, hardware evidence or explicit gaps, known limitations and component readiness.

Give GO7 concrete composition instructions: which request/upgrade callbacks to inject, how to retain one authority/database, required scheme-aware Host/Origin handling, additive secure-controller readiness metadata, native privileged callbacks, private storage location requirements, shutdown ordering and runtime inventory additions. Shared files stay unchanged in your branch.

Fetch latest main, resolve only your owned-file conflicts, review the complete diff for scope and secrets, rerun affected tests, commit and push your feature branch, then open a PR to `main`. The PR must identify its exact tested committed head, explain the user-facing behavior and setup tradeoff, summarize actual validation and list remaining integration/hardware gates. Do not embed the report's own future SHA inside the report. No self-merge, deployment, root manifest edits, public service or unrelated cleanup.
