# GO7 — Gravity Orchard collection integration and acceptance

## Candidate status

Integration branch: `feature/gravity-orchard-integration`. Fetched `main` base:
`6c6eb9343958da591b4488366c2ada4000e3ba08`. The branch uses an isolated worktree.
All six reviewed component heads are preserved as ancestors; none of their PRs
has been merged or rewritten by GO7. The catalog remains **planned** while the
rendered and actual macOS gates run. This report records implementation and
checkpoints honestly; passing a component fixture is not final native acceptance.

The exact committed candidate is recorded in every workflow checkout, artifact
name, browser report and native `tested-commit.txt`. The integration PR identifies
the latest tested head and links its CI runs. Working-tree diagnostic measurements
below are explicitly distinguished from final committed CI evidence.

## Reviewed components and dependency order

| Stream | PR | Exact tested head | Owner CI inspected |
| --- | --- | --- | --- |
| GO1 simulation and stages | [#15](https://github.com/jonathanjie/sofa-arcade/pull/15) | `5aa3b0ec090b373e41526cebee0d5a4a729cea52` | 44779385753, passed |
| GO2 realtime coordinator/client | [#12](https://github.com/jonathanjie/sofa-arcade/pull/12) | `a5ff02c61ad84808d07a38b1e6d346b7f0b45683` | 44777922848, passed |
| GO3 phone motion/touch | [#11](https://github.com/jonathanjie/sofa-arcade/pull/11) | `7adf500e435cfcf4589150f2852622be8731a647` | 44778154482, passed |
| GO4 TV/tutorial | [#14](https://github.com/jonathanjie/sofa-arcade/pull/14) | `76b2a529d35fe8eb9415d5f2cff28d72c0b1e82c` | 44779164338, passed |
| GO5 final art/composed score | [#13](https://github.com/jonathanjie/sofa-arcade/pull/13) | `1bdd9c4ee9d6ab2712ea34f48662b77b6f946c77` | 44782268391, passed |
| GO6 trusted local HTTPS/WSS | [#16](https://github.com/jonathanjie/sofa-arcade/pull/16) | `33d36dc15f7174dec2066e4144b3f07c551fbc4f` | 44780325601, passed, including both Mac targets |

Review/merge the component PRs first, preferably GO1 then GO2–GO6 in reviewed
order, and GO7 last. The integration branch assembles those immutable commits
without changing `main`. Reconcile any newer `main` deliberately before merge.
The machine-checked lock is `tests/gravity-orchard-integration/components.json`.

The GO6 owner correctly reported an inherited WS5 checkpoint failure in run
44780326031: the legacy lock protected the entire desktop tree, so its 29 new
GO6 files needed explicit records. GO7 records each original GO6 blob in the WS5
correction array while preserving the original WS5 head and verifier. Shared
server/native changes also have exact path/blob/mode/reason/verification records
in `tests/integration/components.json`; the legacy gate is not bypassed.

### Reviewed component corrections after handoff

The original component PRs and tested heads remain intact. The exact GO7 lock
records the following necessary corrections by path, blob, mode, reason and
verification; no broad path exemption is used.

- **GO2 host recovery:** the complete rendered campaign at `8de00c8` reached live
  host recovery, where the original clients stopped reconnecting. Whole-host
  shutdown sent the same terminal `4410` code as explicit room closure. A real
  same-port restart with the same three client instances and credentials first
  reproduced that failure. Global coordinator shutdown now sends reconnectable
  `1012`; explicit `closeRoom()` remains `4410`, and expired, revoked or replaced
  credentials remain terminal. Two focused GO2 tests and the GO7 restart
  regression pass: GO2 80/80 and integrated protocol 11/11. Recovery retains the
  match, fences the old epoch, clears steering and readiness, agrees with HTTP,
  and requires both players to ready again.
- **GO4 screenshot corrections:** final atlas poses now retain an already decoded
  image when only its frame subset changes; simultaneous final-order/stage events
  use one caption at their shared anchor while retaining their sound identities.
  The paused dialog's per-player reconnect guidance suppresses the duplicate
  banner that overlapped Lydia's badge in the actual 1024×684 WKWebView. Host
  reconnect/data warnings remain visible. Three focused rendered cases cover
  these fixes, bringing GO4's browser suite to 23 tests. Its 19 Node tests and
  the 12 GO7 bridge tests pass locally; Chromium execution and corrected final
  screenshots remain required CI gates.

## Integrated authority and lifecycle

`server/gravity-orchard-host.mjs` composes the actual GO1 simulation and GO2
coordinator with the existing room authority and SQLite connection. Its only
new durable table, `sofa_gravity_checkpoints`, lives in the existing room database.
A saved checkpoint and its coarse room row commit in one SQLite transaction.
Continuous input and ticks stay in memory. The existing turn-based action path
rejects realtime actions rather than translating every sample into a CAS write.

`createRoomApi().authorizeRealtime` is a non-enumerable server-only capability.
It reuses existing credential hash comparison, expiry and authenticated roles;
it never treats a projected room GET or a claimed actor as socket ownership.
Unknown/cross-room credentials and host steering fail. Bearers remain in the
first bounded WebSocket authentication message, never URL, QR, subprotocol or
readiness data. The original HTTP/SSE/private council projections remain intact.

GET and each authenticated SSE subscriber project the coordinator's current
public view, rather than a second simulation. Bounded durable transitions update
room revision/phase and notify coarse listeners. Restoration occurs before socket
acceptance, pauses the saved run and fences the old epoch. Invalid checkpoints
fail closed for that orchard while existing games remain available. Shutdown
pauses active runs, drains writes and closes the owned coordinator before SQLite.

HTTP/WS and optional HTTPS/WSS use the same `requestHandler` and `handleUpgrade`.
Host and Origin validation uses the actual socket's encrypted state; forwarded
headers do not confer trust. HTTP compatibility is retained without accepting
duplicate/spoofed Host/Origin or cross-origin upgrades. Secure origins are exact,
validated local HTTPS origins advertised by the owned native listener.

## Collection, views, audio and disposal

`ui/games/gravity-orchard/index.mjs` owns one authenticated realtime client for
each mounted view. It mounts GO3 phones or GO4 TV with public geometry/projections,
passes presence separately, survives rematches without accumulating listeners,
and disposes inputs, sockets, presentation and pending effects on navigation.
Late HTTP/SSE completion cannot rewind the realtime stream.

The bridge maps GO5's final manifest and character-state records to GO4's atlas
interface, resolves basket art and crops the phone portrait to an authored idle
frame. The final cover appears in the shared catalog. Practice creates an untimed
run on the same authority for two phones. Tutorial fixtures remain isolated;
live Help/recenter first pause the shared run and cannot resume it alone.

All music uses the existing shared scheduler and saved preferences. The GO5
score is selected only for the host; phones start quiet. Stable event identities,
canonical cooldowns and cue priority avoid replaying a backlog after pause or
rematch. The existing collection menu and both earlier game scores remain.

## Host-only trusted-access setup

The native main WKWebView receives only `sofaDesktopSecureLan` with four bounded
operations: status, provision, public trust export and removal. Native navigation
messages require the owned main window, validated loopback origin, current host
generation and exact schema. They travel over the owned child's inherited pipe.
No phone-accessible provisioning endpoint or general Tauri/filesystem permission
is registered. A public root/profile export is validated and exclusively written
as a new Downloads file; arbitrary paths/private keys are not exported.

GO6 certificate storage remains per-installation and protected. Explicit enable
and disable survive relaunch; status distinguishes expiry and changed addresses.
Both listeners share lifecycle/refresh and owned-process Quit. The stable HTTP
loopback origin remains the native document origin and saved-room authority.
The existing AppKit Quit retirement/acknowledgment is preserved.

Readiness stays bounded to 4 KiB and validates the additive safe status. A separate
16 KiB bound covers only public-export IPC replies. Browser setup code is served
at `/secure-lan/setup.mjs` plus its stylesheet; the diagnostic is
`/secure-lan/diagnostic`. Merely serving that UI does not provide its native
callbacks to phones. Phone trust remains an explicit manual choice.

## Runtime and delivery inventory

Pinned root production dependencies: `ws@8.23.0`, `@peculiar/x509@3.1.0` and
`reflect-metadata@0.2.2`. `scripts/bundle-runtime.mjs` uses pinned
`esbuild@0.28.0` to assemble reviewed GO2/GO6 sources and their **19-package**
closure into `server/runtime/gravity-orchard-dependencies.mjs`.
`dependency-inventory.json` records every source hash, version, integrity and
license; `THIRD-PARTY-LICENSES.txt` retains notices. Only Node built-ins are
required at runtime. Optional `ws` native accelerators are not shipped or needed.
There is no startup download/npm install, external OpenSSL/mkcert or private key
inside the delivered application.

The builder resolves source imports against the root production lock even when
a developer has installed a component's separate test dependencies. Package-internal
resolution remains standard, and every bundled package must match a root-lock
version and integrity entry. Regeneration was verified byte-identical with and
without GO6's component-local dependency directory present. Verified TLS/WSS,
same-client host recovery and the locked-source inventory pass against that bundle.

The common explicit map in `server/gravity-orchard-delivery.mjs` declares 33 new
browser files, 50 final media assets and the private host closure. It feeds the
LAN and generated/portable inventories. `desktop/runtime-manifest.json` contains
the combined 198-file runtime at this checkpoint. The compiled native bridge is
not a browser/static resource. Authoring sources, fixtures, screenshots, test
drivers, private simulation/checkpoint files and certificates are never public.

The previous native staging regex mistook a third-party diagnostic string
containing `import "reflect-metadata"` for a dependency. Staging now uses pinned
development-only `acorn@8.16.0` to inspect actual JavaScript syntax, preserves
the two existing bounded dynamic import seams, and rejects other nonliteral
imports. This parser does not enter the player runtime. The legacy public-delivery
test has six exact exceptions for GO6's reviewed browser-only files under desktop;
native code and certificate capabilities remain excluded.

## Automated acceptance and current checkpoint

| Gate | Verified checkpoint so far |
| --- | --- |
| GO7 protocol/UI/native host/package suites | 32 passed, zero skipped after the same-client restart regression and regenerated runtime |
| Existing root rules/rooms/LAN/controller/music | 81 passed |
| Existing portable delivery/source closure | 5 passed |
| Production build and public inventory | Passed; 182 declared public files |
| Rust non-GUI protocol/configuration/Quit | 20 passed |
| Rendered collection TV + two phone contexts | CI gate; local Chromium blocked before page load by AF_UNIX restrictions |
| Actual packaged macOS ARM64 | GO7 full three-process WKWebView acceptance passed at `400514d` and `8de00c8`; latest job 136636195772 |
| Actual packaged macOS Intel | Separate running CI gate; ARM and Linux do not establish Intel acceptance |
| GO1–GO6 assembled component suites | 280 tests passed at `400514d`; fixture regeneration also passed |

The first clean committed real-rate CI campaign passed at
`64e417d9dc4b18a3b3e9def6a3232a06d7010134` in
[GO7 run 44834486575](https://github.com/jonathanjie/sofa-arcade/actions/runs/44834486575).
Its [Node 24 evidence artifact](https://github.com/jonathanjie/sofa-arcade/actions/runs/44834486575/artifacts/14678285637)
records 12/12 orders, 9/9 stars, zero compost and nine transfers in each direction
using unchanged GO1 public-only pilot controls and seed `orchard-proof-1`.
No teleport, state/score setter, altered deadline or simulation rate was used.

| Clean CI measurement | Observed value |
| --- | --- |
| Complete campaign wall time | 131.988 seconds |
| Stage active ticks | 2,488 / 2,479 / 2,379 at nominal 60 Hz |
| Accepted input samples / checkpoint writes | 5,236 / 36 |
| ACK RTT median, Jon / Lydia | 27.24 / 28.13 ms |
| ACK RTT p95, Jon / Lydia | 49.29 / 49.10 ms |
| ACK RTT maximum | 66.16 ms |
| Applied-input observed tick-age maximum, Jon / Lydia | 4 / 5 ticks |
| Host tick overruns / stalls / checkpoint errors | 0 / 0 / 0 |
| Healthy six-second sample tick / snapshot rate | 59.83 Hz / 19.83 Hz |
| Healthy six-second input samples / checkpoint writes / changed SQLite rows | 238 / 1 / 2 |

These are actual same-machine TCP loopback measurements on a Linux GitHub runner,
not one-way latency, physical phones, home Wi-Fi, macOS rendering or casting.
The report includes CPU/Node/runtime, raw per-client ACK distributions, event-loop
delay and authoritative queue counters. The earlier dirty-source local diagnostic
also completed the campaign, but is not used as the committed acceptance claim.
Rendered/native outcomes remain separate gates. Deliberate slow-reader and burst
load diagnostics are reported separately from this healthy baseline.

The separate stress diagnostic pauses actual TCP consumption on a fourth
spectator while the TV and two 20 Hz controllers remain healthy. It waits for
unchanged game snapshots to cause genuine backpressure, checks one latest pending
snapshot per connection, and verifies slow-reader removal. It then sends a real
200-frame authenticated input burst, verifies rate-limited closure, both-ready
recovery with cleared steering, and zero coordinator timers after owned shutdown.
The clean committed run at `400514d002321c099a3019581ae6f6e55005342b`
([artifact 14679305747](https://github.com/jonathanjie/sofa-arcade/actions/runs/44835724262/artifacts/14679305747))
observed 42 coalesced snapshots and slow-reader removal after 39.55 s, with at most
one pending snapshot and 4,625 observed buffered bytes. Healthy traffic sustained
59.996 simulation Hz / 19.999 snapshot Hz, 1,571 accepted inputs versus seven
checkpoints, no host/tick overruns, and ACK RTT p95 47.24 / 48.04 ms. The real
200-frame burst closed with code 4429 in 21.88 ms; eight total room inputs were
accepted during that interval, including any healthy player traffic. Recovery
required both-ready and cleared steering; shutdown retained zero sockets, pending
authorization calls or coordinator timers. No bufferedAmount override, payload
inflation or fake latency is used.

Protocol tests also exercise shared verified TLS/WS/WSS, wrong credentials and
origins, stale observed ticks/epochs, controller replacement, lost command ACK,
reliable replay, rematches, host stall, checkpoint restore/schema rejection,
live HTTP/SSE agreement and no per-input SQLite write. The extracted portable
test runs certificate generation and both listeners with no installed runtime
packages, verifies source bytes and rejects private canary routes.

The new workflow runs strict old/new component locks, Node 22.13/24.22 suites,
all six owned component suites, real rendered campaign and both actual macOS
WKWebView targets. Existing workflows retain old-game/private-vote/menu-audio
journeys and production app/DMG builds. Artifacts retain exact source, viewport,
screenshots, rates/RTT/overrun methods and native lifecycle results.

### First published candidate and CI repairs

The first published candidate was `2bf0354e6a987a5feafa424d4120e6a582e19a9a`,
with verified tree `2f5e588300fdef8398a9b0a63b1f1db774bcce82`, identical to
local checkpoint `aad0a36f0a1180cdb5dc26adb5a58fff6abb6e01`. The connected
GitHub Git-data API published the tree and retained all six reviewed component
heads as ordered parents because the shell had no Git push credential. The
original local assembly remains preserved as a checkpoint; no component PR was
rewritten.

CI exposed two acceptance-infrastructure issues. GitHub rejects `runner.temp`
in job-level environment expressions, so GO7 uses an ignored workspace evidence
directory supported in that scope. The legacy shell test extracts polling code
into a VM and needed the new unmounted `orchardGame: null` dependency; its
terminal/transient assertions were retained unchanged. The complete legacy
integration suite then passed all 53 tests. The first candidate's 31 GO7 tests
and both strict component locks passed locally at the published SHA.

The first rendered attempt then exposed a test race: a seat-claim click returned
before the real join response persisted its credential. The helper now waits for
that actual write, without injecting credentials or changing production behavior.
The combined component job also installs GO6's own lockfile before its inventory
checks, because those intentionally verify its local installed dependency tree.
The unchanged GO6 suite passed all 65 tests after that setup correction.

The Apple Silicon GO7 app compiled and rendered into stage two before WDIO's
outer 90-second test wrapper expired. The spec's Mocha timeout did not override
that wrapper, so the GO7 runner now explicitly passes the documented 420-second
CLI timeout required for a full real-time campaign. The failure teardown still
verified normal Mac Quit, both owned processes exiting and supervisor `stopped`.
This partial run is not recorded as full GO7 native acceptance. The inherited
Desktop ARM production build/startup/persistence/relaunch gate passed separately
at `64e417d9` (workflow 44834486614, job 136627492193).

The next full Apple Silicon GO7 run passed at
`400514d002321c099a3019581ae6f6e55005342b`,
[job 136631856038](https://github.com/jonathanjie/sofa-arcade/actions/runs/44835724262/job/136631856038),
including the three real owned app processes on macOS 15.8.2 ARM64.
[Artifact 14678966462](https://github.com/jonathanjie/sofa-arcade/actions/runs/44835724262/artifacts/14678966462)
contains the exact head, eight inspected screenshots and lifecycle reports.
The campaign completed 12 orders and nine stars in 145.129 seconds, with one
composted fruit and transfers in both directions. Each authenticated Node phone
client sent 2,795 inputs and received 2,903 snapshots without dropped/invalid
frames or callback errors. The actual WKWebView decoded 49 final images and made
no external runtime asset request. These phone clients are not rendered browsers
or physical devices; the separate browser and hardware gates remain explicit.

Native setup and denied generic permissions, same-seed rematch, paused checkpoint,
fresh-process restore with a newer epoch, persisted WKWebView state and root
certificate, explicit exit, stale-URL non-resume and persisted secure disable all
passed. Each of the three normal Mac Quit reports confirms parent and child
exited, listener closed and supervisor stopped. The production graph excludes
WDIO. Intel remains separately tracked.

On that candidate, the rendered test passed joining, touch fallback, active-play
layout, host-only audio, recenter, lost ACK retry, stale epochs, Help and socket
reconnect. Playwright's foreground capture made its CDP freeze stimulus
ineffective. The repaired harness uses real `about:blank` navigation and browser
Back, preserves trusted `pagehide` observer evidence, and retains neutral pause,
fresh-epoch and both-ready assertions. It explicitly describes navigation/pagehide
and saved-seat return; physical phone background/lock stays a manual gate.
The 720p/1080p TV and 360/390 phone images were visually inspected, with intact
active-play bounds and final local artwork. This partial browser run is not
claimed as campaign, basket or recovery acceptance.

The subsequent rendered run at `8de00c8227954aaec74a79cd63a73da8f388d885`
([artifact 14678338963](https://github.com/jonathanjie/sofa-arcade/actions/runs/44836968385/artifacts/14678338963))
completed all three stages with 12 orders, nine stars, zero compost and nine
transfers in each direction in 129.38 seconds. It passed genuine pagehide/Back
recovery, lost-ACK replay, stale-epoch fencing, retry/rematches, phone reload,
and the rendered full/wrong-basket exercise. Its 5,963 accepted inputs required
55 checkpoints; ACK RTT p95 was 50.3 / 48.3 ms, with no host stalls or tick
overruns during the campaign. Visible TV frame-callback p95 was 16.7 ms, explicitly
not a GPU/paint or casting-latency measurement. The run then failed live host
restart and exposed the GO2 terminal-close defect documented above. It is partial
browser acceptance, not a full pass. Its 25 screenshots also exposed the three
bounded GO4 visual corrections.

The same head passed the complete Apple Silicon GO7 native gate
([job 136636195772](https://github.com/jonathanjie/sofa-arcade/actions/runs/44836968385/job/136636195772),
[artifact 14679043236](https://github.com/jonathanjie/sofa-arcade/actions/runs/44836968385/artifacts/14679043236)),
including three real app processes, trusted setup, 12 orders/nine stars, all
49 decoded final images, zero external runtime requests, persisted state/certificate,
recovery and all normal Quit checks. Inherited production desktop and old-game
WKWebView acceptance passed separately on both Apple Silicon and Intel. New
runtime and visual corrections require another complete exact-head rerun.

Independent native review also corrected a status-mutex/UI-thread lock inversion
before publication. Rejoin disposal and loopback QR selection corrections are
covered by focused bridge/transport checks. Later integrated acceptance exposed
the GO2 recovery correction recorded above; the strict lock enumerates every
component-source exception while preserving all original handoff heads.

### Reproduce

```sh
npm run install:ci
npm ci --prefix desktop --ignore-scripts
node scripts/bundle-runtime.mjs --check
npm test
npm run test:gravity-orchard
npm run verify:gravity-components
npm run verify:components
SOFA_GO7_EVIDENCE_DIR=/tmp/go7-evidence node tests/gravity-orchard-integration/protocol/campaign.mjs
node tests/gravity-orchard-integration/protocol/measure.mjs --out=/tmp/go7-evidence/transport.json
node tests/gravity-orchard-integration/protocol/stress.mjs --out=/tmp/go7-evidence/stress.json
npx playwright install --with-deps chromium
SOFA_GO7_EVIDENCE_DIR=/tmp/go7-browser npm run test:gravity-browser
node scripts/prepare-game.mjs
npm run package:lan
node scripts/check-derived.mjs
npm run build
node tests/integration/package/production.mjs
```

For an actual matching-architecture Mac, build the instrumented acceptance app
with `npm --prefix desktop run build:native:arm64` (or `:intel`), then run
`tests/gravity-orchard-integration/native/run.mjs` with `SOFA_APP_PATH` pointing
to that `.app`. Production builds use separate `build:mac:*` scripts and exclude
the native test driver. The native suite requires three real owned app processes,
saved state/credential recovery, explicit exit surviving a stale native URL,
and normal Quit stopping the parent, sidecar and both listener ports.

## Remaining physical/device gates

| Gate | Evidence still required |
| --- | --- |
| iOS Safari | Manual root/profile installation and full trust; fingerprint check; no-warning HTTPS/WSS; gesture permission; finite physical readings; orientation/recenter, denial/revocation, lock/background/reconnect |
| Android Chrome | Same checks using Android certificate settings and actual browser/version; do not infer from Node TLS |
| Certificates | Physical wrong-root, expired, address-mismatched and changed-LAN behavior; removal from each phone |
| Offline cold start | Installed Mac app and both configured phones, WAN disconnected before launch; no developer Node/Terminal/install required |
| Home Wi-Fi and TV | Measured physical phone input, real network loss/roaming, casting/display delay, speakers and human comfort |
| Human game acceptance | Seated tilt/touch comfort, cooperative difficulty, visible silhouettes and practical 6–10 minute session |

Synthetic orientation events, numerical audio renders and CI screenshots do not
establish those gates. CI bundles are ad-hoc signed; notarization/downloaded-app
Gatekeeper acceptance is separate distribution work. No Site deployment, Pages
migration, public desktop release, automatic trust change or self-merge occurred.
