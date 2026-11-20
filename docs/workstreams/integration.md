# WS6 — local collection integration and acceptance

## Current checkpoint

Work is on `feature/local-integration` in a dedicated clone. Base `main` is
`e34b0015399cb9791b175987adf1fab1b542565a` (20 November 2026).

**Status: assembling reviewed components; not a complete local release.** WS1
is included at its explicitly ready, tested head. WS2, WS3 and WS5 have draft
PRs with outstanding owner CI gates; WS4 has not published a handoff. No component
code is copied from an unfinished working tree. Odd Laws Society remains planned
until real end-to-end acceptance passes.

The machine-readable checkpoint is
[`tests/integration/components.json`](../../tests/integration/components.json).
Only an explicitly reviewed, tested owner handoff may fill a component's PR and
immutable head. A later head is a new candidate requiring affected checks again.

| Component | Expected branch | PR / immutable head | Integration state |
| --- | --- | --- | --- |
| WS1 engine | `feature/odd-laws-engine` | #4 — `a9d55b76c3c7d1da43836c350a0f7ce63820cecb` | Included; ready handoff and owned CI verified |
| WS2 private platform | `feature/local-platform` | #7 — observed `adeefd5bd019e459f3f7a3fc4a921073cce3ec46` | Draft; not incorporated |
| WS3 TV/phone UI | `feature/odd-laws-ui` | #5 — observed `777bb73055e8c1b3214a7e94dd949886c2fde625` | Draft; not incorporated |
| WS4 media/music | `feature/odd-laws-media` | Not published at initial inspection | Awaiting tested handoff |
| WS5 Tauri | `feature/tauri-local` | #6 — observed `d989530000828f1132388e487950f99cfd62190d` | Draft; not incorporated |

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

### Combination and distribution

- [x] Record current `main` and use an isolated branch/clone.
- [x] Inspect frozen contracts, full v0.2 rules and existing delivery scripts.
- [x] Run baseline regressions: `npm test` — **66 passed, 0 failed** on the base
  source, Linux x64 / Node v24.22.3. This is existing Sofa Kingdoms evidence only.
- [ ] Review all five PR diffs, tests, owner reports and immutable heads.
- [ ] Assemble exact reviewed heads without duplicate patches or owner-branch edits.
- [ ] Align production copies, LAN serving, portable ZIP and desktop staging.
- [ ] Check transitive runtime imports and manifest assets from a clean package.
- [ ] Confirm public assets exclude authority modules, private fixtures,
  credentials, databases and development dependencies.
- [ ] Run full relevant suites, production build and every component workflow at
  the proposed integration head.

### Odd Laws actual player journey

- [ ] Host TV plus two separate authenticated phone browser contexts.
- [ ] Complete six sessions with each initial Chair, all four actions, finite
  market turnover, full city, exhausted stock, final score components and a tie.
- [ ] Sealed votes in both arrival orders; own lock and public readiness;
  different/same choices, winning/losing payment, tied/zero bids.
- [ ] Inspect serialized HTTP and SSE on first lock, reveal, retry/error and
  reconnect; no secret choice, amount, balance change or private history leak.
- [ ] Refresh, passive disconnect/reconnect and restored own commitment.
- [ ] Duplicate, changed-content duplicate, stale/future requests and rematch
  isolation; an old room response never replaces a new match.
- [ ] Tutorial skip, resume/replay, Help, results and collection navigation.
- [ ] Gesture unlock, one host soundtrack, quiet phones and persisted independent
  music/effects/volume settings; no external audio or asset requests.
- [ ] Reduced motion, readable 1920×1080 / 1280×720 TV and 360×800 / 390×844
  phone layouts with actual rendered screenshot evidence.
- [ ] Measure action-to-SSE latency with stated local methodology; no Wi-Fi or
  casting performance inference from loopback.
- [ ] Preserve Sofa Kingdoms full game, controller prediction and v1/v2 rooms.

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
