> Historical report. The dispatch ended on 21 November 2026 at `e0504c1`. Follow-up observations extend through 22 November at `0560ca7`.

# GO7 — Gravity Orchard collection integration and acceptance

## Pre-merge candidate status

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

The merge at `e0504c1` records all CI passing on reviewed head `856fd76`. See the [handoff](../../HANDOFF.md) for later changes and open checks.

## Reviewed components and dependency order

| Stream | PR | Exact tested head | Owner CI inspected |
| --- | --- | --- | --- |
| GO1 simulation and stages | [#15](https://github.com/jonathanjie/sofa-arcade/pull/15) | `5aa3b0ec090b373e41526cebee0d5a4a729cea52` | 44779385753, passed |
| GO2 realtime coordinator/client | [#12](https://github.com/jonathanjie/sofa-arcade/pull/12) | `a5ff02c61ad84808d07a38b1e6d346b7f0b45683` | 44777922848, passed |
| GO3 phone motion/touch | [#11](https://github.com/jonathanjie/sofa-arcade/pull/11) | `7adf500e435cfcf4589150f2852622be8731a647` | 44778154482, passed |
| GO4 TV/tutorial | [#14](https://github.com/jonathanjie/sofa-arcade/pull/14) | `76b2a529d35fe8eb9415d5f2cff28d72c0b1e82c` | 44779164338, passed |
| GO5 final art/composed score | [#13](https://github.com/jonathanjie/sofa-arcade/pull/13) | `1bdd9c4ee9d6ab2712ea34f48662b77b6f946c77` | 44782268391, passed |
| GO6 trusted local HTTPS/WSS | [#16](https://github.com/jonathanjie/sofa-arcade/pull/16) | `33d36dc15f7174dec2066e4144b3f07c551fbc4f` | 44780325601, passed, including both Mac targets |

At this pre-merge checkpoint, the instructions were to review/merge the component PRs first, preferably GO1 then GO2–GO6 in reviewed
order, and GO7 last. The integration branch assembles those immutable commits
without changing `main`. Reconcile any newer `main` deliberately before merge.
The former machine-checked lock was `tests/gravity-orchard-integration/components.json`.

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
  the 12 GO7 bridge tests pass locally. All 23 actual Chromium cases passed
  at `5bc5960` in run 44839463603; corrected final-asset screenshots also passed
  the complete integrated browser journey at that exact head.

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
| GO7 protocol/UI/native host/package suites | 35 passed, zero skipped after the shared phone-setup link and private runtime-timing regressions; same-client restart and runtime/package checks retained |
| Existing root rules/rooms/LAN/controller/music | 81 passed |
| Existing portable delivery/source closure | 5 passed |
| Production build and public inventory | Passed; 182 declared public files |
| Rust non-GUI protocol/configuration/Quit | 20 passed |
| Rendered collection TV + two phone contexts | Complete 18/18 journey passed at `1d67f9a`; local Chromium remains unavailable because of AF_UNIX restrictions |
| Actual packaged macOS ARM64 | Complete setup/export and three-process WKWebView run passed at `1d67f9a`, job 136656564754; screenshot-discovered phone-link correction requires another exact-head run |
| Actual packaged macOS Intel | `1d67f9a` failed on a second observed host-stall, preserving the one-recovery cap; the next planned candidate adds bounded timing and native foreground evidence |
| GO1–GO6 assembled component suites | 282 tests passed at `1d67f9a`; fixture regeneration and GO4's 23 rendered cases also passed |

### Native-acceptance follow-up candidate `1d67f9a`

The planned follow-up at `1d67f9a48389448963ee40670998f4fbed13d691`
(tree `a3ca07f3b552affcb71f203b837e37b971909728`) includes the independently
reviewed bounded native host-stall recovery, actual setup/export UI acceptance,
and fail-closed production dependency guards described below. It changes no
runtime bundle or portable bytes from `5bc5960`. All Linux checks and the
complete rendered journey pass; the actual Mac results are recorded separately
before catalog activation.

| Exact-head software evidence | Result / source |
| --- | --- |
| Strict GO7 and legacy component locks | Passed, no errors; [GO7 run 44843179897](https://github.com/jonathanjie/sofa-arcade/actions/runs/44843179897) |
| Node 22.13 and 24.22.3 | Each passed 81 core tests and 32 GO7 authority/TLS/native-host/package tests, no skipped tests |
| All six assembled components | 282 tests and 13 projected fixtures passed; each separate GO1–GO6 workflow also passed |
| Full rendered GO7 | 18/18; [browser artifact 14681384571](https://github.com/jonathanjie/sofa-arcade/actions/runs/44843179897/artifacts/14681384571) |
| Focused GO4 TV/tutorial | 23/23, no skipped/flaky cases; [artifact 14681563338](https://github.com/jonathanjie/sofa-arcade/actions/runs/44843180215/artifacts/14681563338) |
| Existing rendered collection | Sofa Kingdoms 15, menu music 10, Odd Laws Chair Jon 13 / Chair Lydia 9 checks passed; [artifact 14682175484](https://github.com/jonathanjie/sofa-arcade/actions/runs/44843179895/artifacts/14682175484) |
| Existing privacy / package / production | 53 integration tests, both-seat private HTTP/SSE invariance and sealed restore, production build, 182-file public boundary, and unchanged generated closure passed |
| Actual GO7 macOS ARM / Intel | ARM passed the complete setup/export and three-process run (job 136656564754); Intel failed on a second observed host-stall (job 136656564794). Screenshot inspection also exposed the phone-link correction below, so activation remains deferred |
| Existing production desktop and native collection | Both ARM and Intel passed production packaging, all 14 production checks and inherited WKWebView phases in [Desktop run 44843179923](https://github.com/jonathanjie/sofa-arcade/actions/runs/44843179923); both native collection jobs also passed in [local integration run 44843179895](https://github.com/jonathanjie/sofa-arcade/actions/runs/44843179895) |

The current rendered campaign completed 12 orders/nine stars/zero compost in
130.279 s, with nine transfers each way. Its same-fruit full/wrong-basket exercise
took 55.537 s. Lost ACK/stale epoch, real pagehide/Back, phone reload, live
same-client host restart, retries/rematches, practice, host-only composition and
disposal passed. The deliberately injected 350 ms event-loop stall is recorded
separately from the campaign and correctly paused the run. All final screenshots
were inspected at 720p/1080p TV and 360/390 phone sizes; no new visual defect,
browser exception, failed asset response or external runtime request was found.

| Current rendered loopback measurement | Jon | Lydia |
| --- | --- | --- |
| Applied-input ACK samples | 2,642 | 2,774 |
| ACK RTT median / p95 | 31.5 / 51.2 ms | 25.8 / 49.9 ms |
| ACK RTT p99 / maximum | 56.1 / 134.8 ms | 59.9 / 147.3 ms |
| Observed-to-applied tick age p95 / maximum | 4 / 10 ticks | 4 / 10 ticks |
| Maximum browser socket buffer | 265 bytes | 265 bytes |

The campaign/rematch sample recorded 5,994 inputs, 55 checkpoints and 144 changed
SQLite rows; zero tick overruns, skipped catch-up ticks or unplanned host stalls.
All pages' visible-playing rAF p95 was 16.7 ms and maximum 16.8 ms, with no gap
above 25 ms. This measures callback scheduling, not GPU duration, paint completion,
one-way input delay, physical Wi-Fi or casting. The older `5bc5960` run's two
overruns and nine skipped ticks remain recorded below; the current zero count is
not a general performance guarantee.

The clean real-clock TCP
[artifact 14682171202](https://github.com/jonathanjie/sofa-arcade/actions/runs/44843179897/artifacts/14682171202)
(SHA-256 `2fdd5a4ab6f1dfb12f267b19562c146aa55a2d882bf193f6292a6d61a0067e07`)
records 134.158 s, 12 orders/nine stars, ten transfers each way, 5,330 inputs,
36 checkpoints and 102 changed rows. ACK RTT p95 was 48.19/48.25 ms, maximum
66.44/66.53 ms; observed-to-applied age p95 three ticks, maximum four. The
six-second healthy sample measured 59.830 ticks/s and 19.832 snapshots/s with
238 inputs/one checkpoint/two changed rows. Actual slow-reader pressure ran
39.529 s at 60.006 ticks/s and 19.985 snapshots/s, coalesced 41 snapshots and
retained at most one pending snapshot/two inputs. It removed the nonreading
spectator while all three healthy clients stayed playing. The 200-frame flood
closed 4429 after 20.88 ms; fresh-epoch recovery and zero-work/timer cleanup
passed. These are unchanged-public-pilot Linux loopback measurements using an
in-memory database; they do not rule out disk-backed SQLite delays on the Mac.

The inherited Odd Laws Chair-Jon fault journey also retained a measurable tail:
TV n=95, median 34.18 ms, p95 216.03 ms, maximum 373.65 ms; phone p95 about
213.9 ms and maxima about 374.2 ms. That sample includes deliberate recovery and
driver scheduling. Chair-Lydia's TV p95 was 58.43 ms, maximum 84.73 ms. These
values are not home-network or physical-display measurements.

The preceding `5bc5960` Desktop Intel retry passed production app/DMG/signature
and all 14 native production checks, then the newer push cancelled it during the
instrumented build. No inherited WKWebView pass is credited to that cancelled
attempt. [Artifact 14681796085](https://github.com/jonathanjie/sofa-arcade/actions/runs/44839463628/artifacts/14681796085)
preserves the completed production evidence. The complete inherited production
and native suites subsequently passed on both architectures at `1d67f9a`;
Gravity Orchard's Intel failure remains separate and unresolved.

### Native setup phone-link correction

The actual `1d67f9a` ARM
[artifact 14681689311](https://github.com/jonathanjie/sofa-arcade/actions/runs/44843179897/artifacts/14681689311)
passed all 12 orders/nine stars/zero compost in a 142.119 s control interval
that also includes the same-seed rematch and subsequent pause checkpoint,
both transfer directions, 49 decoded images, no external runtime requests and
all three owned-process Quit/relaunch checks. It recorded no host-stall recovery.
The actual setup screen provisioned and exported one 749-byte public CRT and
one 2,081-byte Apple profile, each matching the displayed CA fingerprint with
mode 0600; no trust installation was attempted.

Inspection of those new native screenshots found a real integration defect
that the preceding callback tests could not reveal: GO6's “Open on each phone”
list and first-origin motion-check link included the Mac's loopback identities.
Opening `127.0.0.1` or `localhost` on a phone targets the phone itself. The shared
QR already selected a LAN address, but `openSecureSetup()` forwarded raw native
status to the setup factory.

The bounded GO7 correction adds `phoneSetupStatus()` in `ui/transport.mjs` and
uses it only for the setup view's callback results in `ui/app.js`. It filters
canonical HTTPS local origins, excludes loopback/wildcard/malformed addresses,
deduplicates, and prefers the current phone join hostname. The native status,
certificate SANs, HTTPS listener and validation allowlist stay intact. If no
usable phone origin exists, the view shows its connection-failure state while
retaining certificate export/disable management. GO6's protected source is
unchanged; the exact legacy WS2 transport blob and reason are recorded.

All 13 bridge tests pass, including frozen-original-state checks, preferred LAN
ordering, canonical rejection, and no-LAN/disabled/error cases. The full local
GO7 suite passes 33/33, existing core 81/81, and production build/182-file public
boundary checks pass. The regenerated 200-file ZIP is 8,967,165 bytes with SHA-256
`628d8e4f52b15277981cf015efa5b61a82db9da898fb1b4cbc3200ace065500b`. Independent
review found no authority or contract change. Actual Mac acceptance now also
requires every rendered phone URL to be a canonical non-loopback member of the
native listener's validated origins, its first host to match served phone join
metadata, and the diagnostic URL to use that first origin. Corrected actual-Mac
screenshots and full acceptance remain required before catalog activation.

### Second Intel stall and bounded native timing evidence

The actual `1d67f9a` Intel
[artifact 14683076373](https://github.com/jonathanjie/sofa-arcade/actions/runs/44843179897/artifacts/14683076373)
(SHA-256 `501083d9f07022da76e47ecc73633359db189fe011fbdaf12948b5d47001b96f`)
failed the explicit assertion that a second observed host-stall must fail native
acceptance. At 89.607 s from controller creation, stage two paused at tick 5,313,
epoch four. Both clients remained connected and neutral; Jon-only readiness
kept it paused, then Lydia's readiness started epoch five and play resumed.
The 366 ms recorded interval is the observed-pause-to-readiness sequence, not
the duration of the scheduler delay. Stage three entered countdown at 109.957 s,
tick 6,490, epoch seven; another host-stall appeared at 110.996 s, tick 6,509,
epoch eight. No stage-three game time had elapsed. Both clients remained connected
without drops, retries, callback errors or invalid messages, and owned Quit passed.

Those observations do not identify the cause of either delay. GO2's existing
250 ms stall guard, one permitted recovery and the 15/115/420-second acceptance
deadlines remain unchanged. The next planned candidate adds optional observations
around the same SQLite object and existing realtime clock, separating callback
duration from timer lateness and checkpoint projection/stringification. Fixed
operation labels and numeric timings contain no SQL, bindings, paths, credentials,
room state or checkpoint contents. Observer failures cannot change database
results, authority decisions or shutdown. Two focused tests exercise actual
disk-backed SQLite, default and injected clocks, and throwing-observer isolation.

Only the explicit native acceptance build enables the bounded recorder. It keeps
aggregate timings and at most 128 slow observations in memory, then writes a
private `0600` file after owned shutdown, capped at 128 KiB. Production does not
receive the diagnostic switch; no additional play-time file writes, HTTP route
or stdout records are introduced. The native runner removes only its fixed
previous diagnostic before each launch and preserves the fresh report even on
acceptance failure. A real child-process regression checks privacy, the public
404 boundary, bounded output and EOF shutdown.

A dedicated acceptance helper verifies the exact owned PID, executable and
bundle before observing AppKit active/hidden/frontmost state. It records state
before and after public certificate exports, returns once from Finder to the
game, and requires foreground state before starting the campaign. Stall and
failure observations never reactivate the app. No global power setting or App
Nap override is introduced, and foreground state is not claimed as the proven
cause of the prior delay. Wall-clock anchors correlate controller and native
observations with the host report. Actual Mac compilation and acceptance of
this evidence path remain required.

The instrumentation candidate passes all 81 shared tests, 35 GO7 tests and 20
non-GUI Rust tests locally. These checks establish the observation boundaries;
they do not replace the unresolved Intel campaign or corrected setup screenshots.
Its regenerated 200-file portable ZIP is 8,968,192 bytes, SHA-256
`78e1bd456c1b9a45b98f8d891e0e7147f53edcc558728ff56cbb6111c7533c24`.
The 19-dependency private bundle remains byte-identical. The production build
and 182-file public-delivery boundary pass after regeneration.

### Complete rendered candidate and native follow-up

At `5bc5960573530044f113875f27875444f758879f`,
[GO7's full rendered journey](https://github.com/jonathanjie/sofa-arcade/actions/runs/44839463661/job/136644087524)
passed all 18 acceptance checks with a clean tree.
[Artifact 14679819040](https://github.com/jonathanjie/sofa-arcade/actions/runs/44839463661/artifacts/14679819040)
contains the inspected 720p/1080p TV, 360/390 phone, practice, recovery and reduced-motion
screenshots. The campaign completed 12 orders/nine stars/zero compost and nine
transfers each way in 128.25 seconds. The full/wrong-basket exercise took 55.58 s
and retained the same rejected fruit. Surviving TV/phone pages recovered after
host restart at a fresh paused epoch; both-ready, a real 350 ms host stall,
final assets, silent phones, menu return and disposal all passed. Browser errors,
external runtime requests and failed asset responses were empty.

| Rendered same-machine measurement at `5bc5960` | Jon | Lydia |
| --- | --- | --- |
| ACK RTT median / p95 | 29.1 / 49.7 ms | 29.5 / 49.5 ms |
| ACK RTT p99 / maximum | 53.3 / 170.0 ms | 78.2 / 219.3 ms |
| Observed-to-applied tick age p95 / maximum | 3 / 9 ticks | 3 / 10 ticks |
| Maximum browser socket buffer | 265 bytes | 401 bytes |

That rendered campaign accepted 5,916 inputs with 55 checkpoints and recorded
**two tick overruns and nine skipped catch-up ticks**, with zero unplanned host
stalls. All pages' visible rAF interval p95 was 16.7 ms; the TV maximum was
66.8 ms, with three intervals over 25 ms. These are callback scheduling measurements,
not GPU duration, one-way latency, physical Wi-Fi or display/casting delay.
The separate clean TCP/stress
[artifact 14680176625](https://github.com/jonathanjie/sofa-arcade/actions/runs/44839463661/artifacts/14680176625)
completed 12 orders/nine stars in 131.934 s with 5,237 inputs/36 checkpoints and
ACK p95 49.24/49.46 ms. Its six-second healthy sample measured 59.998 simulation
Hz and 19.999 snapshot Hz, 238 inputs/one checkpoint/two changed SQLite rows.
Real slow-reader pressure coalesced 42 snapshots, retained at most one pending
snapshot and removed the reader after 39.16 s; a 200-frame flood closed with 4429
after 22.35 ms. Recovery and zero-timer shutdown passed.

The exact head's Apple Silicon
[native artifact 14680107935](https://github.com/jonathanjie/sofa-arcade/actions/runs/44839463661/artifacts/14680107935)
records 12 orders/nine stars/zero compost, with 145.413 s covering campaign control,
the same-seed rematch and its pause checkpoint, transfers both ways,
49 decoded final images, no external runtime requests, and all three real app
processes and normal Quit checks passing. Each authenticated Node controller
sent 2,806 inputs and received 2,907 snapshots without drops or errors. The
corrected native paused-relaunch screen keeps both character badges visible.
These controllers are Node clients, with rendered phones established separately
by the full browser journey.

Intel's actual app compiled, launched and entered the game, then its screenshot
showed a host-stall safety pause with 1:28 remaining in stage one. The original
native harness waited for an interlude without performing the mandatory both-ready
resumption. It failed its unchanged 115-second stage deadline; this is not a
completed Intel campaign. The next planned candidate explicitly accepts at most
one observed host-stall recovery, verifies frozen ticks and cleared input/readiness,
uses both authenticated ready commands, and records the pause. Other/repeated
pauses fail. No simulation, rate, threshold, stage deadline or result criterion
is relaxed. Pre-disposal failure snapshots and controller statistics make future
failures diagnosable before teardown changes presence.

The native acceptance now also exercises the real shared-shell setup screen and
its provision/public-CRT/Apple-profile buttons. It verifies newly written public
CA files and the completed WKWebView export UI without installing trust. This
closes the gap between the earlier native callback test and the composed setup
screen; it remains a required actual-Mac gate.

Intel CI exposed a separate gate defect: its runner has no `rg`, and an `if rg`
condition silently treated command-not-found as an absent test driver. GO7 and
the inherited Desktop workflow now read the production graph with installed Node,
failing on a missing/empty graph or a native test-driver dependency. Positive and
driver/empty/missing negative cases pass; the exact Desktop workflow correction
is recorded in the legacy WS5 lock. A separate Intel DMG attempt failed after
successful app compilation/signing because `hdiutil` could not eject a busy
temporary image; only that failed job was retried at the same source head.

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

### One stall recovery per stage run (post-merge, PR 18)

Intel run 44919586108 (commit `574ba40`) failed the one-recovery cap again.
The game paused for `host-stall` in stage one (epoch two, tick 825) and in
stage three (epoch eight, tick 6,359). It recovered correctly from the first
pause. The host timing evidence now shows the cause. The realtime timer was
up to 289 ms late, but the late callbacks took less than 1 ms. SQLite and
checkpoint work stayed below 43 ms. The whole host process was waiting, which
points to scheduling on the shared runner, not to game or storage work.
This is the same pattern as the earlier `1d67f9a` failure: two stalls in
different stages.

The native acceptance now allows one recovery per stage run instead of one per
campaign. A second stall in a run that already resumed from a stall still
fails, as does a pause during the recovery countdown. The run epoch changes at
every stage boundary, so the test identifies a stage run by its resumed epoch.
The 250 ms stall guard, the stage deadlines and the result checks are
unchanged.

### Intermittent Apple Silicon setup failure (post-merge, PR 18)

The Apple Silicon native acceptance failed about half the time with "That did
not work" after **Set up tilt**, and the host recorded no setup error. The
cause was a race in the Mac app, not in certificate setup. The setup screen
shows its buttons while its first status check is still in progress. The
native shell accepts one setup command at a time and rejects a second command
at once, without passing it to the host. The test clicks immediately, so its
setup command often arrived during the status check. A fast person could see
the same failure.

`desktop/native-bridge.js` now sends setup commands one after another, with at
most four waiting. A command waiting when the page closes is cancelled and
never sent. A simulated one-command host reproduced the failure with the old
bridge and passed with the new one.

### Reproduce the software checks

See the [current release commands](../../LOCAL_RELEASE.md).

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
