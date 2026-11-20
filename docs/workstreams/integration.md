# WS6 — local collection integration and acceptance

## Current checkpoint

Work is on `feature/local-integration` in a dedicated clone. Base `main` is
`e34b0015399cb9791b175987adf1fab1b542565a` (20 November 2026).

**Status: all five reviewed components assembled; browser candidate accepted.**
WS1–WS5 are included at their explicitly ready, tested heads. The complete
browser journeys and corrected 720p results/rematch geometry passed at
`4695643a89f03b7cf33127b9d9c0f5b054a8cca4`. Odd Laws is now enabled. The ordinary
collection-create rerun and combined ARM/Intel native acceptance remain pending,
so the aggregate PR stays draft. No unfinished component branch tip is included.

The machine-readable checkpoint is
[`tests/integration/components.json`](../../tests/integration/components.json).
Only an explicitly reviewed, tested owner handoff may fill a component's PR and
immutable head. A later head is a new candidate requiring affected checks again.

| Component | Expected branch | PR / immutable head | Integration state |
| --- | --- | --- | --- |
| WS1 engine | `feature/odd-laws-engine` | #4 — `a9d55b76c3c7d1da43836c350a0f7ce63820cecb` | Included; ready handoff and owned CI verified |
| WS2 private platform | `feature/local-platform` | #7 — `adeefd5bd019e459f3f7a3fc4a921073cce3ec46` | Included; ready handoff and owned CI verified |
| WS3 TV/phone UI | `feature/odd-laws-ui` | #5 — `87693dd61af1b6a011a26da814fc884f85bca809` | Included; ready handoff and owned CI verified |
| WS4 media/music | `feature/odd-laws-media` | #8 — `be49b175a9e87a6f3e3cb109a48c1d8b2b71ca85` | Included; ready handoff and owned CI verified |
| WS5 Tauri | `feature/tauri-local` | #6 — `618fc837f2f24f55a3aad1477ea9cf35ff478faf` | Included; ready handoff and both native architectures verified |

Preferred review/merge order: WS1, WS2, WS3, WS4, WS5, then WS6. An aggregate WS6
candidate depends on all included component PRs. This session does not merge
`main`, publish a release, or deploy Sites/Pages.

## Ownership and preparation

Three disjoint acceptance tracks run alongside integration:

- Shared collection, private room/view lifecycle, registration and audio.
- Real HTTP/SSE clients, complete matches, privacy, retries, persistence and
  reproducible loopback latency.
- Rendered browser journeys, screenshots, asset closure and package inspection.

WS6 owns shared shell/build/release files and `tests/integration/**`. It does not
edit unfinished component modules. Platform serving entries and desktop runtime
entries can be extended only after the respective tested handoff. Any substantive
component correction must be identified separately and revalidated.

## Acceptance checklist

An unchecked item is a gate still to be exercised, not a passing result.
Checked browser items refer to the accepted `4695643` candidate; final enabled
collection and native checks must also pass at the proposed final head.

### Combination and distribution

- [x] Record current `main` and use an isolated branch/clone.
- [x] Inspect frozen contracts, full v0.2 rules and existing delivery scripts.
- [x] Run baseline regressions: `npm test` — **66 passed, 0 failed** on the base
  source, Linux x64 / Node v24.22.3. This is existing Sofa Kingdoms evidence only.
- [x] Review all five PR diffs, tests, owner reports and immutable heads.
- [x] Assemble exact reviewed heads without duplicate patches or owner-branch edits.
- [x] Align production copies, LAN serving, portable ZIP and desktop staging.
- [x] Check transitive runtime imports and manifest assets from a clean package.
- [x] Confirm public assets exclude authority modules, private fixtures,
  credentials, databases and development dependencies.
- [ ] Run full relevant suites, production build and every component workflow at
  the proposed integration head.

### Odd Laws actual player journey

- [x] Host TV plus two separate authenticated phone browser contexts.
- [x] Complete six sessions with each initial Chair, all four actions, finite
  market turnover, full city, exhausted stock, final score components and a tie.
- [x] Sealed votes in both arrival orders; own lock and public readiness;
  different/same choices, winning/losing payment, tied/zero bids.
- [x] Inspect serialized HTTP and SSE on first lock, reveal, retry/error and
  reconnect; no secret choice, amount, balance change or private history leak.
- [x] Refresh, passive disconnect/reconnect and restored own commitment.
- [x] Duplicate, changed-content duplicate, stale/future requests and rematch
  isolation; an old room response never replaces a new match.
- [x] Tutorial skip, resume/replay, Help, results and collection navigation.
- [x] Gesture unlock, one host soundtrack, quiet phones and persisted independent
  music/effects/volume settings; no external audio or asset requests.
- [x] Reduced motion, readable 1920×1080 / 1280×720 TV and 360×800 / 390×844
  phone layouts with actual rendered screenshot evidence.
- [x] Measure action-to-SSE latency with stated local methodology; no Wi-Fi or
  casting performance inference from loopback.
- [x] Preserve Sofa Kingdoms full game, controller prediction and v1/v2 rooms.

### Native and hardware

- [ ] macOS CI verifies actual runner/target architecture and packaged Node.
- [ ] Build and launch real Tauri app; create/join/play, quit/relaunch and restore
  saved state; verify occupied port and owned-child cleanup.
- [ ] Verify packaged asset availability without external requests or a separate
  Node installation and inspect/upload native artifacts.
- [ ] Inspect remote CI at the final proposed source head.
- [ ] Physical Mac + two phones + TV, home Wi-Fi, casting, sleep/resume and
  address change. This requires hardware evidence beyond hosted CI.
- [ ] Signing/notarization and Intel support reported separately. Apple Silicon
  is the initial target assumption, not a claim about Jon's actual Mac.

## Evidence and reproducibility

Integration fixtures, harnesses and rendered evidence belong under
`tests/integration/`. Full-state/credential-bearing test data must remain outside
served and packaged public assets. Reports may contain aggregate timing or safe
projected state; never bearer tokens or database snapshots.

Commands, exact tested source, artifact manifest and remote CI links will be
recorded here as checks complete. A browser/loopback run does not establish native
Mac or physical-device acceptance. Missing essential components or native gates
keep the final PR in draft with the precise next step.

### Preparation checkpoint

Draft PR: <https://github.com/jonathanjie/sofa-arcade/pull/3>. The initial checklist
commit `79ab7468b2b241966d8076ba9c14eb3c9377d507` passed the existing remote Game
checks: <https://github.com/jonathanjie/sofa-arcade/actions/runs/44699480561>.

Shared integration code now supplies a lazy collection/view/client bridge, one
audio graph/score scheduler with saved preferences, and a LAN-only active-session
pointer for native launches at `/`. The pointer contains no bearer token and is
cleared by explicit collection navigation. Component imports remain lazy and Odd
Laws stays planned while handoffs are unavailable.

Preparation checks on the working candidate:

| Command | Observed result | Scope |
| --- | --- | --- |
| `npm test` | 66 passed | Existing rules, rooms, transport, controllers, score |
| `npm run build` | Passed | Production framework build on Linux, not deployment |
| `node --test tests/integration/protocol/*.test.mjs` | 4 passed; 8 explicit dependency skips | Full Sofa HTTP/SSE match, retries, v1/v2 compatibility, restart; Odd Laws awaits WS1/WS2 |
| Shell/audio integration tests | 9 passed | Mount/teardown, projected status flow, stale snapshots, host-only scheduler/preferences |
| `npm run test:integration` after prepare/package | 16 passed; 1 failed; 9 dependency skips | The failing closure check is `/collection-game.mjs` returning 404 from the pre-handoff LAN allowlist |
| Portable packager | Repeated ZIP bytes identical; private-neighbour exclusion passed | Explicit files, modes, SHA-256 member manifest, canary database/secret/test files excluded |

The combined browser graph failure is intentionally visible until WS2 hands off
serving entries; WS6 has not edited that owner's unfinished file. The committed
portable ZIP will be refreshed with the accepted final combination; CI also
generates an auditable candidate ZIP as an artifact.

Local Chromium could not launch (`socket() failed: Operation not permitted`).
Automatic approval review rejected the supported sandbox escalation request, and
the shared-browser fallback could not reach the isolated server. No screenshots
or browser success are inferred from that attempt. The `rendered-browser` CI job
runs the actual three-context driver and uploads evidence on both success and
failure. Its result remains a gate.

`npm run verify:components` and `npm run verify:local-release` fail explicitly
while an essential handoff is missing. Preparatory skips do not satisfy those
release checks.

### First remote integration run

At `b2ecf4f3b80aec81533e5d04256556a151879606`,
[run 44700066116](https://github.com/jonathanjie/sofa-arcade/actions/runs/44700066116)
passed the production build and existing regressions. The completeness gate
failed because all five tested handoffs are still missing, and package closure
failed at the known pre-handoff LAN entry.

The real Chromium driver successfully created a host and two separately
authenticated phone contexts and captured all four required viewport sizes with
no console error, external request, or missing asset. It then failed its primary
touch-target assertion. The screenshots were inspected; visible controls appear
large enough, so the next run adds atomic named geometry diagnostics and
suppresses unchanged SSE-driven shell rebuilds before accepting that gate.
[Rendered evidence](https://github.com/jonathanjie/sofa-arcade/actions/runs/44700066116/artifacts/14611589059)
is a failed-run diagnostic, not complete browser acceptance.

WS1 published checkpoint `9f630f26844351ad1b23c525585f91a2a5915d4a`.
Independent read-only inspection ran its 89 tests, fixture consistency check,
and six public-policy completions successfully. Its report explicitly says final
simulation/review and workflow are pending. It is therefore recorded as observed
only and **not incorporated**. Public helper closure includes `errors.mjs` in
addition to `catalog.mjs` and `preview.mjs`; authority requires a fresh match ID.

### WS1 reviewed handoff and second browser diagnostic

WS1 PR #4 is explicitly ready at `a9d55b76c3c7d1da43836c350a0f7ce63820cecb`.
Its production engine is unchanged from the independently reviewed checkpoint;
the final delta adds simulation evidence, review tests and its dedicated workflow.
On the assembled candidate, WS6 reran all **95 engine tests**, fixture consistency
(**seven scenarios/eight files**), and the **64-match / 3,072-transition** smoke sweep.
All passed. [Owned Node 22/24 CI](https://github.com/jonathanjie/sofa-arcade/actions/runs/44700753729)
and [legacy CI](https://github.com/jonathanjie/sofa-arcade/actions/runs/44700753722)
were inspected and passed. The component is merged by ancestry, without cherry-picking
or altering its owner branch. The registry contains the real engine, while the
catalog's planned status still blocks public room creation. Only its three public
helper modules enter browser copies; authority/projection stay server-side.

At `123519032e49bfe0f92d5071376c42f095cf25ab`, the next
[rendered run](https://github.com/jonathanjie/sofa-arcade/actions/runs/44700690114)
passed four viewport checks, seven primary phone target measurements (minimum
55 CSS pixels), reduced motion, gesture audio/preferences, all eight Sofa tutorial
lessons with skip/replay, phone refresh, and passive disconnect/reconnect. It then
failed at final results because the TV could restore before its rules module
loaded (`roundStarter` on null). This is a real shared-shell defect, with a fix
being revalidated; it is **not** a completed browser acceptance.
[Diagnostic screenshots and report](https://github.com/jonathanjie/sofa-arcade/actions/runs/44700690114/artifacts/14612378717).

### WS2 reviewed handoff

WS2 PR #7 is explicitly ready at `adeefd5bd019e459f3f7a3fc4a921073cce3ec46`.
WS6 inspected its final diff/report and [four passing owned jobs](https://github.com/jonathanjie/sofa-arcade/actions/runs/44701350370):
Node 22.13/Linux, Node 24/Linux, Node 24/macOS arm64, and a real Chromium
three-context test on ordinary insecure LAN HTTP. The production source is
byte-identical to the separately reviewed `6a9227a` checkpoint; final changes
correct the CI runner and finalize the report.

The exact head is merged by ancestry. Only `server/lan.mjs`'s explicit serving
entries are extended under the owner handoff: shared collection adapters and
WS1's public helper closure including `errors.mjs`. The engine and projector
remain unserved. `room-client.mjs` enters preparation and the portable runtime.
All **79 focused WS2 tests passed after the serving-entry extension**. This
correction is documented in the immutable component matrix and will be retested
with the final UI/media closure.

### Exact WS1 + WS2 candidate and recovery correction

A clean detached worktree at **`ad9dd79848d7714681353566125876599d66010a`**
passed `npm test` (**81/81**), integration protocol (**14/14, zero skips**), and
shared shell/audio (**12/12**). Both initial Chairs completed real six-session
Odd Laws games through authenticated HTTP and three SSE streams; rich-policy
results were **54–51** and **49–46**, with separate full-city/exhaustion and
**4–4 tie** games. Differential serialized privacy checks covered either first
voter, and sealed commitments survived SQLite restart. Legacy Sofa v1/v2
completed with their original rules and rematched into v3.

At that same head, [WS1 CI](https://github.com/jonathanjie/sofa-arcade/actions/runs/44702092032),
[WS2 CI](https://github.com/jonathanjie/sofa-arcade/actions/runs/44702091979),
[Game checks](https://github.com/jonathanjie/sofa-arcade/actions/runs/44702091996),
and the production-build job all passed. The
[integration run](https://github.com/jonathanjie/sofa-arcade/actions/runs/44702091992)
remained incomplete: the package graph now correctly reaches the missing WS4
`/assets/odd-laws-society/manifest.json`, and the strict matrix still lacks
WS3/WS4/WS5. [Protocol artifact](https://github.com/jonathanjie/sofa-arcade/actions/runs/44702091992/artifacts/14613186721).

The [rendered artifact](https://github.com/jonathanjie/sofa-arcade/actions/runs/44702091992/artifacts/14613092750)
proves the Sofa loading correction: a complete ten-round match, final results,
rematch, SQLite restart, bare-root saved-host restoration, and explicit exit all
passed in Chromium. Screenshots of the result and both narrow phones were
visually inspected. No external request, console error or missing asset was
recorded. The subsequent navigation-race test incorrectly compared raw storage
`"null"` with JavaScript `null`; its assertion now parses the stored JSON while
still requiring no active-room pointer. The full rerun remains necessary.

A separate real-client regression then reproduced uncertain-command recovery:
all POST acknowledgments are lost after a vote commits, SSE advances the phase,
and the client must resolve that original request before accepting another. The
shared bridge now calls the same client's `reconnect()` once when transport
recovers, preserves the original request body/ID, retains an honest connection
warning until resolved, and ignores late completion after disposal. The new
regression and complete protocol suite passed **15/15** in the working candidate
(zero skips); it will be revalidated at the next immutable checkpoint. The stricter
privacy assertion also rejects any extra top-level room-envelope field.

Local timing at clean `ad9dd79` used Node v24.22.3/Linux x64, HTTP on 127.0.0.1,
POST start to parsed per-viewer SSE update, and a 60-second heartbeat. Across each
36-action rich match, host medians were **5.904 ms** and **4.502 ms**, with p95
**11.268 ms** and **8.714 ms**; per-phone observations are in the generated JSON.
These are loopback transport measurements, not physical phone, Wi-Fi, browser
paint, native presentation, or casting benchmarks.

WS3 observed head `30a7f07` passes **33 Node + 61 Chromium** component tests;
WS6's independent detached review confirms its unchanged tutorial/export
contract and 12 runtime files. It awaits the final ready-PR handoff before inclusion.
WS5 observed head `792b52c` now builds and passes production native lifecycle
checks on both architectures, but WKWebView creation fails at the expected room
code. It remains draft. WS6 prepares its own separate native combined-view and
bare-root relaunch spec without editing unfinished desktop sources.

### Shared error-code compatibility

The canonical WS1 engine uses typed uppercase rule codes; WS2 deliberately
reflects only its fixed lowercase message allowlist. A shared, server-only
registry adapter now translates 12 explicit typed errors while retaining the
real create/project/rebase/transition behavior. It rebuilds known errors with
fixed text and no diagnostic properties, and lets unknown/untyped failures
remain generically redacted. Invalid bids, sealed votes and insufficient funds
therefore receive useful safe messages. Neither component is altered. Three
new integration tests cover real API rejection, unchanged authority, successful
fallback and differential sealed-error privacy. The strict protocol suite now
passes **18/18, zero skips** on the working candidate; the 79 focused WS2 tests
also pass. The next committed CI run supplies immutable evidence.

The root integration workflow now includes a real Odd Laws browser gate once
WS1–WS4 are included, and separate Apple Silicon/Intel WKWebView integration
jobs after the five-component readiness gate. The latter use the owner's
feature-gated test app without changing native/component files and verify
public modules, all final media, sealed TV projection, Build, and three actual
processes for saved-root restoration and explicit exit. Syntax is verified;
these are pending gates until the complete native combination runs.

### WS3 reviewed handoff

WS3 PR #5 is explicitly ready at `87693dd61af1b6a011a26da814fc884f85bca809`.
Its runtime files are byte-identical to the independently reviewed `30a7f07`;
the final delta adds tutorial screenshot evidence/documentation.
[Final component CI](https://github.com/jonathanjie/sofa-arcade/actions/runs/44703150418)
and [Game checks](https://github.com/jonathanjie/sofa-arcade/actions/runs/44703150367)
were inspected and passed. WS6 reran all 33 component Node tests on the assembled
candidate, and its independent pure-renderer composition exercised canonical
WS1 helpers across both Chairs × rich/tie/fill matches, 294 projected snapshots,
and 20,728 markup renders including all 18 inspections and ten tutorial lessons.
That is helper/renderer compatibility evidence, not a browser journey.

The exact 12 declared UI/CSS files now enter production preparation, explicit LAN
serving and the portable runtime. The game uses the actual mounted view and
component tutorial; no mock catalog, fixture coordinator or component test file
is shipped. The remaining media handoff is required for the complete shared
score/browser journey. The extra shell chrome must be measured with the full
TV layout at 720p in that first combined run.

At exact head `6f3ecbf1b23f677b1748980e404c39835ab2ac0c`, the complete rendered
Sofa regression passed **15 checks with six screenshots**, including all four
delayed create/find/join/start navigation races.
[Passing browser evidence](https://github.com/jonathanjie/sofa-arcade/actions/runs/44703555638/artifacts/14612884134).
Production, WS1, WS2 and legacy checks also passed; only missing-component
package/readiness gates remained red.

A subsequent shared preference fix follows WS3's documented mount-only contract:
system reduced-motion changes remount only the view, preserving the authenticated
client, committed projection, sent request identities and recovery. Retired-view
callbacks are fenced. Unsubmitted local drafts and open game drawers are reset;
saved tutorial progress remains, and standalone guided practice changes its
motion class in place. The shell's explicit Replay control now restarts the
tutorial, while Learn resumes. Sixteen focused shell/audio/recovery tests pass.

The component checkpoint now pins the exact blob and mode of every permitted
post-handoff correction, checks base/head ancestry and owner reports, and rejects
protected working-tree changes. Six temporary-repository tests exercise valid
assembly, unknown bases/heads, report drift, correction drift and uncommitted
changes. No whole-path wildcard exemption remains.

### WS4 reviewed handoff and explicit public delivery

WS4 PR #8 is ready at `be49b175a9e87a6f3e3cb109a48c1d8b2b71ca85`.
[Media CI](https://github.com/jonathanjie/sofa-arcade/actions/runs/44704211495) and
[Game checks](https://github.com/jonathanjie/sofa-arcade/actions/runs/44704211519)
passed at that head. Independent WS6 review recomputed every inventory digest,
decoded 32 transparent 512px WebPs, parsed 22 self-contained SVGs, matched the
actual WS1 catalog IDs, and inspected the retained rendered art/state sheets.
All 16 media tests, seven numeric arrangements and ten effects passed. The exact
57-file component runtime is 2,013,494 bytes; its provenance notice is retained
as one additional distribution file. See
`tests/integration/evidence/ws4-be49b175-review.json`. Numeric render checks do
not establish listening quality or physical speaker behavior.

The complete WS1–WS4 portable package now passes the source/manifest/permission,
determinism/canary, generated-copy and actual extracted HTTP asset-graph checks.
The fifth package gate explicitly skips pending WS5. The exact 54 media images,
manifest and two pure score/effect modules enter the browser, LAN and ZIP lists.
Owner authoring sources, galleries, review recordings and tests remain outside
those lists. LAN serving replaces its broad asset-directory entry with explicit
asset entries while retaining canonicalization, Host/Origin, API and SSE code.
The framework uses a separately staged allowlisted public directory; no authored
files are deleted or moved. These serving-list changes are the permitted WS2
post-handoff correction and are pinned by blob in the component checkpoint.

The next CI checkpoint runs the first complete real Odd Laws browser candidate.
The catalog remains planned until it passes. CI now runs each component suite at
the exact proposed head, and fails if browser/HTML/portable regeneration changes
committed delivery files. Portable compression is reproduced with Node 24.22.3.
At prior integration head `46f2292e5dcdad2ebe836a9aeb242b389dd5dff9`,
[Sofa rendered acceptance and production build](https://github.com/jonathanjie/sofa-arcade/actions/runs/44704790064),
WS1, WS2, WS3 and legacy workflows passed; the missing media/package and
all-components readiness gates correctly remained blocked.

### First composed browser checkpoint — 5d329a4

At `5d329a4ba30c304bb7fd951af96b27f1cc6ea2d7`,
[the exact-head integration run](https://github.com/jonathanjie/sofa-arcade/actions/runs/44706173236)
passed protocol/package, reproducible committed ZIP, production/public-delivery,
Node 22/24 component suites, WS2 insecure-HTTP browser clients, WS4 rendered
media and all 15 Sofa Kingdoms browser checks. All four owner workflows and
legacy Game checks passed. Odd Laws reached the real council with isolated
authenticated TV/phones and no browser errors, missing assets or external
requests, but failed the 1280×720 fit gate: board top 128px, bottom 732px.
[Actual screenshots and reports](https://github.com/jonathanjie/sofa-arcade/actions/runs/44706173236/artifacts/14614837312)
were inspected; this is a genuine 12px shared-shell overflow, not acceptance.
The 1080p bounds passed and narrow-phone voting controls were readable.

The shared short-TV spacing correction preserves component font/card/control
sizes; the next rendered run must prove it. Screenshot output now defaults to
the actual viewport and records PNG dimensions, with explicitly named full-page
failure captures. Later-term markets and results receive the same TV fit gate.
A separate extra WS3 browser job used unsupported Ubuntu 26.04 with the owner's
pinned Playwright; the root job now matches its tested Ubuntu 24.04 environment.

Independent shell review also found terminal polling errors overwrote the
transport's actionable error with Offline/Reconnecting. Shared polling now
preserves terminal status/message for 401/403/404/410, stops retries, and shows
Needs attention while transient failures remain recoverable. Two focused tests
exercise the actual production boundary for both games; 24 combined
shell/audio/recovery/legacy-score checks pass in the working correction.
Optional local Help and release instructions explain that changing the LAN
address/port does not transfer browser-scoped phone seats.

The independent WS5 artifact audit at `3a2bd4e` verified both native architectures,
14 production checks each, actual WKWebView first/relaunch sessions, exact
staged bytes, signatures and absent test-driver binary markers. See
`tests/integration/evidence/ws5-3a2bd4-review.json`. The owner's final checkpoint
`618fc837` is still draft while rerunning native CI and has not been included.

### Rendered correction and observation checkpoint — 4ade372

At `4ade372b912ce500a44a7cf4650fae316a803f4b`, the actual 720p council
measured top **108px**, bottom **712px**; the term-II reveal measured bottom
**710.89px**. Viewport PNGs were inspected and show complete law cards.
The real Odd Laws run also passed reduced-motion changes, host-only soundtrack
controls and saved preferences, all ten tutorial lessons/skip/replay, sealed
refresh, offline/reconnect, SQLite restart and bare-root identity restoration.
It reached session four before Chromium's test protocol could no longer read
one response body; all three screens had already advanced and no navigation,
application exception or failed HTTP response was recorded. This is still an
incomplete full-game acceptance run.

The next harness anchors each command's new ID and exact request bytes, requires
HTTP 200 and exactly one revision advance in the same match/phase, and checks
all three rendered projections. Only the specific CDP response-cache error can
fall back to a fresh authenticated GET; it never replays a command or accepts
an API/JSON error. Such observations are marked in latency evidence, including
the extra GET round trip. Screenshots now wait for visible artwork decoding.
The supported Ubuntu correction passed the exact-head WS3 rendered suite.
Protocol/package, production/public delivery, both Node component matrices,
WS2 browser and WS4 media suites also passed in
[run 44707286793](https://github.com/jonathanjie/sofa-arcade/actions/runs/44707286793).

Native preflight inspected the locked `tauri-plugin-wdio-webdriver` 1.5.1
implementation. Its clicks/key events are scripted DOM operations; synthetic
Home/ArrowRight do not change a range control. The WS6 native spec therefore
uses the driver's supported range-value input and records its input method
accurately. It checks the real WKWebView AudioContext running state and saved
preferences, but does not label scripted events as trusted OS gestures.
Trusted physical gesture unlocking and audible speaker output remain explicit
hardware checks. No component-owned native source was changed.

### Complete gameplay candidate and WS5 tested handoff

At `ab9a2a134b1e37a714d7b91a56695c4b7efd7273`,
[run 44708658794](https://github.com/jonathanjie/sofa-arcade/actions/runs/44708658794)
passed every runnable protocol, package, build, component and browser job.
Independent inspection of
[46 viewport screenshots and three browser reports](https://github.com/jonathanjie/sofa-arcade/actions/runs/44708658794/artifacts/14615953252)
confirmed clean exact source, with no browser exceptions, static failures or
external requests. Both initial Chairs completed rich matches (54–51 and 49–46),
then a 4–4 tie and a 31–31 full-city/exhausted-stock rematch: **144 actual city
actions and 48 council commands**. Each rich match emitted 18 Build, 8 Work,
5 Festival and 5 Lobby commands. The full-city match built 18 plots, worked
18 times and exhausted nine stacks. The dedicated tie used 36 Work actions.
The 191 ordinary command observations record HTTP 200 and exactly one revision
advance; the remaining seal is covered by the explicit four dropped
acknowledgments and one recovery test.

Of those command observations, 176 response bodies were read directly and
15 used the narrowly recorded CDP cache fallback. The 191 browser observations
per viewer measured TV median **31.73 ms / p95 52.03 ms**, Jon **31.27 / 50.41 ms**
and Lydia **31.53 / 49.14 ms**. These include loopback HTTP/SSE, rendering,
driver scheduling, up to 40 ms observation polling and any extra authenticated
GET. They are not device, Wi-Fi or casting measurements.
[Independent protocol evidence](https://github.com/jonathanjie/sofa-arcade/actions/runs/44708658794/artifacts/14615743809)
contains 504 numeric viewer observations on clean Node 24.22.3 / Linux x64;
all statistics recompute. Odd Laws p95 was **6.877–10.445 ms** for POST start to
parsed SSE only. Protocol p50 uses nearest rank; browser median averages the
middle values. The root job passed **81 baseline and 51 integration tests**,
with only the then-missing WS5 manifest skipped. These results do not establish
native acceptance.

Visual inspection caught a gap in the otherwise passing browser gate: it
measured the game board, but the shared final rematch button extended to about
y=733 on 720p. The shared results-only spacing fix recovers 18 px while retaining
the complete button and font size. The next gate measures every visible shared
TV control and requires the final rematch target to remain at least 44×44 px.
The catalog remains planned until that rerun passes.

WS5 PR #6 is now explicitly ready at
`618fc837f2f24f55a3aad1477ea9cf35ff478faf`.
[Final native component CI](https://github.com/jonathanjie/sofa-arcade/actions/runs/44706214389)
and [Game checks](https://github.com/jonathanjie/sofa-arcade/actions/runs/44706214344)
passed. Both matching architecture jobs built and launched production bundles,
passed 14 production checks and two WKWebView sessions.
The [ARM artifact](https://github.com/jonathanjie/sofa-arcade/actions/runs/44706214389/artifacts/14615377834)
and [Intel artifact](https://github.com/jonathanjie/sofa-arcade/actions/runs/44706214389/artifacts/14615508290)
are component evidence; final combined artifacts are still required.

The sole native correction appends 79 explicit runtime entries to
`desktop/runtime-manifest.json`, for **104 total**. Working-candidate Linux
staging, all **12 desktop tests** and runtime verification pass with the
checksum-verified Node 24.22.3 executable, ESM and SQLite, including no Node on
PATH. All **five portable/derived/runtime closure tests** now pass with no skips.
Rust is not installed in this integration container; its 11 tests run in the
exact-head desktop workflow. Native files other than the manifest remain
identical to the owner's accepted head.

The strict release runner and native dependency gate also require Odd Laws to
be enabled after rendered acceptance. Including all five components alone
cannot qualify a game whose acceptance is incomplete as release ready.

The owner Mac workflow's optional dependency-text guard used `rg`, which is not
present on the observed runner. Its separate production binary checks and the
independent artifact inspection passed. The root native workflow adds an
explicit default-production dependency-graph check using the available standard
`grep` before building the separate instrumented app. No owner workflow is
modified; production artifacts still undergo the owner's binary checks.

### All-five browser acceptance and catalog enablement — 4695643

The clean all-five candidate at
**`4695643a89f03b7cf33127b9d9c0f5b054a8cca4`**, tree
`42deeb5a2cca904e81eb5869fd4fc2ea57bcd530`, passed the complete
[rendered browser job](https://github.com/jonathanjie/sofa-arcade/actions/runs/44710085964)
and independent visual/shared-shell review. The
[browser artifact](https://github.com/jonathanjie/sofa-arcade/actions/runs/44710085964/artifacts/14615839487)
has SHA-256 `e86548ef602319ebed5bbac6be6788cdb5b46abf63a4149403faeb52ab811d69`.
All 15 Sofa checks and both Odd Laws journeys (12 and 8 checks) passed. Four
complete Odd Laws games again scored 54–51, 49–46, 4–4 and 31–31; all actual
commands now also deep-equal their public-policy choices. Each final TV board
ends at y=657.703125 and its complete 250.75×50 px rematch control occupies
y=666–716 within 1280×720. The rich and full-city viewport PNGs were inspected.
There were no page errors, external requests or failed static responses.
Five of 191 ordinary command observations used the explicitly tagged CDP
body-cache fallback; the lost-acknowledgment scenario remains separately tested.

The exact-head protocol/package job passed **81 baseline and 52 integration
tests, with zero skips**. Its
[five safe JSON reports](https://github.com/jonathanjie/sofa-arcade/actions/runs/44710085964/artifacts/14617610242)
contain 504 independently recomputed timing observations and clean/stable source
records. The
[portable artifact](https://github.com/jonathanjie/sofa-arcade/actions/runs/44710085964/artifacts/14616991575)
matches the committed 107-file ZIP byte-for-byte: 7,272,443 bytes, SHA-256
`4f2b1086683dc82e6f526d4424ad6f45fb0bb87f450e72242a88106abf4b6965`.
All 106 manifest records, source bytes and executable modes were checked.
Production delivery contains 96 declared files plus 13 framework files and
excludes 17 tracked authoring files. The explicit public/private boundary and
104-entry desktop closure pass. All four component workflows and Game checks
also passed at this source; the combined desktop workflow is separate evidence.

This accepted candidate justifies enabling the Odd Laws catalog card. The next
checkpoint regenerates its derived catalog, portable ZIP and desktop stage,
then runs the ordinary collection-card → host creation → two phones → results
path without the candidate resolver flag. The root native jobs are unblocked
only after enablement and must pass on both matching Mac architectures. The
aggregate PR remains draft until those exact-head gates pass. `main` was checked
again and is still the recorded base; no owner branch was changed or merged
into `main`.

### Merge review: durable explicit exit on native relaunch

The user authorized review and merging of all workstream PRs. WS1 #4, WS2 #7,
WS3 #5, WS4 #8, and WS5 #6 are now merged, ending at
`d4c982dc029f69539622472c72c495858c2bbc90`. Merging that main into the
`6aa4149` integration candidate required no source conflict or content change.
Independent reviews and focused suites passed for all five components; the
strict combined local runner again passed 52 tests with zero skips.

The enabled candidate's [ARM native acceptance run](https://github.com/jonathanjie/sofa-arcade/actions/runs/44711297677)
passed its first-launch and saved-game-restoration processes, then failed its
third-process explicit-exit check. Its diagnostic and screenshot show the old
Odd Laws room actually reopened. The prior phase had verified that Exit cleared
the shell's saved session. Native `config.lastPath` was a second source of
resume routing; its periodically sampled room URL could override the shell's
cleared state on the next launch. The exact sampling/teardown timing was not
captured, so it is not claimed as observed.

The targeted post-handoff correction in `desktop/src-tauri/src/native.rs` opens
new game windows at the stable bare loopback root. The shared shell already
restores both games from its own saved LAN session, and explicitly clearing that
session now remains authoritative. The native stable port, credential storage,
owned-child lifecycle, and security controls are unchanged. The component lock
records this second native correction with its exact blob and mode.

The three-process native regression remains required. Its runner now deliberately
seeds a stale legacy native room URL in the stopped, disposable test profile
before the final launch, proving explicit exit wins without depending on a timing
race. Both architecture acceptance jobs and the production desktop jobs must pass
on this correction before the final integration PR is merged. Physical-device
and signing limitations remain unchanged.

### Merge review: exercise normal Mac Quit before relaunch

At corrected head `52e58122cb389d1051ce2f099400b76e48c1ef1a`, the full browser
journeys, component suites and production build passed. The combined Intel
native gate also passed all three processes. The ARM native gate restored the
expected room, revision, game state and saved host credential, but failed its
assertion for the random browser-storage marker written immediately before the
first process ended. The final explicit-exit process was not reached on ARM.
See [run 44712834050](https://github.com/jonathanjie/sofa-arcade/actions/runs/44712834050),
job `136208792241`, and artifact `14618181967` (SHA-256
`9690524edea81425beeafc978b5ce7979188250f0d2a55e5cbdc79306ec7c8e7`).

Inspection of the integrity-verified, lockfile-pinned `@wdio/tauri-service`
1.5.1 established that its launcher ends the embedded application with SIGTERM,
then SIGKILL if necessary. This bypasses the app's normal Mac Quit lifecycle.
The observed missing newest write is consistent with that teardown, but does
not prove the internal WebKit flush timing or the exclusive cause of the older
explicit-exit failure. No application code deletes the random marker, and the
same-origin authenticated room restoration rules out a general lost-profile
or SQLite-state explanation.

The native test configuration now requests normal Mac Quit through the existing
PID-specific `NSRunningApplication.terminate()` helper before the driver's
fallback process cleanup. The helper is compiled before application startup;
no artificial post-write delay is introduced. The hook validates the native
executable and waits for the owned parent, sidecar and listener to stop. Hook
failure fails acceptance. Pinned WDIO CLI 9.33.1 runs the user `onComplete`
hook before service `onComplete`, after the browser session has ended.

All marker, saved-credential, audio-preference, root-restore and explicit-exit
assertions remain intact. The seeded stale-native-URL regression and separate
forced-crash tests also remain. This changes the acceptance lifecycle, not the
game authority, authentication, native permissions or production shutdown code.
Both native architectures and the production desktop workflow must pass on the
new correction before merging the final integration PR.
