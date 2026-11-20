# WS3 — Odd Laws Society TV and phone experience

## Scope and checkpoint

- Branch: `feature/odd-laws-ui`.
- Base: `e34b0015399cb9791b175987adf1fab1b542565a` from fetched GitHub `main`.
- Ownership: `ui/games/odd-laws-society/**`, `.github/workflows/ws3-ui.yml`, and this report only.
- Component status: implemented; 33 focused Node tests and 61 actual Chromium checks pass. Rendered evidence was captured from `e1aab1a2492da1a4c00e94f583fbb08c387a2c78`; the PR records the final tested head after the documentation/evidence commit.
- No registration, shared shell change, engine/platform import, final-media generation, merge, deployment, or Site publication.

The interface implements the v0.2 city builder, not the obsolete movement prototype. It consumes only the contract's projected room envelope and injected public helpers. Fixtures are explicitly labelled local simulation; they do not establish real-room, LAN, native Tauri, or physical-device acceptance.

## Entry point and integration

```js
import { mount } from './games/odd-laws-society/index.mjs';

const game = mount(root, {
  viewer,                     // authenticated public / host / player
  dispatch,                   // normalized action -> Promise<projected envelope>
  rules: {
    buildings, laws, guilds,
    buildQuote, streetOutcome, civicAward,
  },
  assets: { manifest, manifestUrl },
  sound,                      // unlock(), setScene(scene), effect(name)
  preferences,                // includes reducedMotion
  onExit,
  onHelp,
});
game.update(projectedRoom);
game.setConnection({ state: 'connected' });
// Navigation, room/seat changes, and remount:
game.dispose();
```

Wire WS2 `onRoom` to `update` and `onStatus` to `setConnection`, including passive SSE connection loss. The shell must create a new mount for another room or authenticated viewer. Assets and motion preferences are mount inputs; remount after an explicit preference change so procedural animation uses the new value. `update` ignores equal/older revisions, other room codes, retired match IDs, and invalid schema/game IDs. Phase changes discard old build/bid drafts. Same-phase public readiness updates preserve an unsealed local draft. Async acknowledgements after disposal or a newer phase cannot change detached/new UI. On navigation, the shell must also dispose the WS2 client/SSE subscription and choose the next shared sound scene: view disposal does not own transport or global audio.

`dispatch` receives only `type`, `matchId`, `phaseId`, and the action's normalized additional fields. It never receives a claimed actor or a room credential. `sound.unlock()` is called synchronously within the click/keyboard-generated click before dispatch is awaited. Transport retry identity remains WS2's responsibility.

`rules.buildQuote` and `rules.streetOutcome` are consumed with the contract's exact result fields, including `discount.amount/sourceId`, `influenceGain`, `canPlace`, `completes`, `qualifies`, and `prestige`. Cards show actual prices as live text, with printed price and the applied single discount in confirmation. TV can show different Jon/Lydia prices. During play, score excludes potential Treasury; the final score includes it.

### Browser/runtime allowlist requested from WS6

All files below are relative to `ui/games/odd-laws-society/`:

```text
index.mjs
shared.mjs
graphics.mjs
motion.mjs
drawers.mjs
tv.mjs
phone.mjs
tutorial.mjs
view.css
tv.css
phone.css
tutorial.css
```

`index.mjs` dynamically loads the four CSS files relative to its own module URL. Each document reference-counts those links; disposing the last mount removes them. Styles are scoped to `.ols`; no existing Sofa motion/audio/style files are edited. Add these exact runtime modules to production preparation, LAN serving, portable packaging, and the desktop manifest after component handoff. Do not expose the fixture/test directories as production routes.

### Media and sound

WS4 supplies the manifest. `manifestUrl` must be the complete absolute manifest URL, not an assets directory. Each image uses `new URL(entry.src, manifestUrl)`. The renderer consumes building entries and `characters.*.states`; law, guild, and prop graphics remain code-native icons. Building and character entries are optional: missing, invalid, or failed images retain code-native SVG fallbacks. No rules, costs, names, or scores are baked into graphics. Character states and all required scene/effect names match the contract; the shared shell owns preferences and audio scheduling. No AudioContext is created here.

Motion derives from committed public snapshot changes: district instance IDs, resource deltas, newly evaluated streets, readiness, simultaneous revealed envelopes, the law stamp, turn changes, and results. Repeated revisions do not render or replay effects. The first snapshot, a new match, and the first snapshot after reconnect establish a baseline without replaying rewards. A pending first council vote never drives resource animation. Reduced motion uses brief opacity cues; legal input never waits for animations.

## Experience delivered

- TV: both 3×3 boroughs, six-stack market, exact prices/stock/prestige/abilities, current laws, session/Chair/turn, public proposals/readiness, simultaneous reveal, complete final/tied score breakdown.
- Phones: local law and bid drafts, explicit all-pay Seal, own locked commitment, waiting, four actions, market inspection, exact-cost district/plot confirmation, full-city/exhausted-stock reasons, income/turn updates, errors/reconnect, final scores, and exit cleanup.
- Optional drawers: complete six-session public agenda, 18-card term catalog, score ledger, and Help. They trap focus and return focus on close. Nested card inspection supports Back/Escape and restores both catalog scroll and the selected card; phone panel changes preserve visible keyboard focus. A persistent live region announces turns, simultaneous reveal, and income.
- Guided practice: isolated ten-position interactive tutorial for construction, Work, streets, income, shared law comparison, sealed all-pay voting, Lobby, Festival, and score. Skip/Resume/Replay persist only tutorial progress. It never dispatches a match command or changes the real room.
- Quiet fixture sound adapter records events; composed music audition awaits the shared WS4/WS6 audio integration.

## Standalone fixture harness

```sh
node ui/games/odd-laws-society/harness/server.mjs
```

Default loopback port: `4183`; override with `--port=4184` or `OLS_FIXTURE_PORT=4184`.

```text
http://127.0.0.1:4183/?viewer=host&scene=actions
http://127.0.0.1:4183/?viewer=jon&scene=council
http://127.0.0.1:4183/?viewer=lydia&scene=council
http://127.0.0.1:4183/?table=1
```

The Table mode uses separate TV/Jon/Lydia iframe contexts and a local fixture coordinator. Each view receives its own projection through origin/source-checked messages. This is not network multiplayer, authentication, or a substitute for WS2's serialized HTTP/SSE privacy tests.

Scenes: `council`, `opponent-ready`, `locked`, `actions`, `reveal`, `income`, `full`, `exhausted`, `results`, `tie`. `&media=broken` exercises failed-media fallback; `&reduced=1` forces reduced motion.

Harness-only diagnostics: `window.fixture.snapshot()`, `setScene(name)`, `update(envelope)`, `setConnection(status)`, `commands`, `events`, `rejectNext(message)`, `holdNext()`, `releaseNext()`, `dispose()`, `remount()`, `actAs(playerId, action)`, and `project(viewer)`. They are deliberately absent from the production entry. `actAs` is a labelled fixture control for progressing the other seat in tests. Fixtures/model/catalog/preview mocks stay in this owned subtree and must be replaced by WS1/WS2 injection during integration.

The harness server uses an explicit allowlist for the runtime files above plus its four own files and the public fixture modules. It cannot serve repository metadata, arbitrary source, private workstream tests, or dependencies.

## Verification checkpoint

```sh
npm ci --prefix ui/games/odd-laws-society
npm test --prefix ui/games/odd-laws-society
npm run test:browser --prefix ui/games/odd-laws-society
# Existing system Chromium alternative:
npm run test:browser:local --prefix ui/games/odd-laws-society
```

### Observed results

| Gate | Result | Evidence |
| --- | --- | --- |
| Owned Node tests | **33/33 pass** | Catalog/schema, exact quotes/placement, PRD worked opening, six councils/36 actions/final accounting, private drafts, stale actions, instance identity, tutorial isolation, manifest URLs/fallbacks, motion deduplication and reduced-motion timing |
| Headless Chromium | **61/61 pass** | [WS3 Actions run 44701879120](https://github.com/jonathanjie/sofa-arcade/actions/runs/44701879120); 29.3 seconds; locked Playwright 1.57.0 |
| Existing game checks | **Pass** | [Game checks run 44701879171](https://github.com/jonathanjie/sofa-arcade/actions/runs/44701879171) |
| Existing repository tests | **66/66 pass** | `npm test` in the isolated checkout |
| Existing application build | **Pass** | `npm run install:ci` followed by `npm run build`; no root lockfile or generated tracked file changes |
| Ownership/patch hygiene | **Pass** | `git diff --check`; only the three requested ownership paths |

The rendered matrix covers TV **1920×1080 and 1280×720**, and both Jon/Lydia controllers at **360×800 and 390×844**. All 12 TV state/size checks fit within the viewport. Ordinary phone controls fit within the viewport; inspection, Build detail, and complete results intentionally support vertical scrolling. Touch-target checks require at least 44×44 CSS pixels.

Interaction checks exercise private local choice/bid drafts, normalized Seal dispatch and synchronous sound unlock, locked/waiting/reveal, unchanged public balances after the first Seal, exact-cost Build/plot confirmation, Work/Lobby/Festival, full cities, exhausted market, capped influence, failed command retry, offline/reconnect, stale/repeated snapshots, pending-response disposal/remount, keyboard dialog/panel focus, persistent live announcements, failed images with network-offline assets, and reduced motion without input delay. A rendered fixture completes all six councils, 18 Jon phone actions plus 18 simulated Lydia actions, income transitions, and a tied result. The entire guided practice is exercised for skip/resume/replay and zero real-match dispatches.

The first rendered run caught TV overflow and an independently observed fallback-art sizing defect. Fixes shorten TV plots without removing live rule text, keep both reveal choices/bids visible at 720p, and give phone/tutorial illustrations their intended containers. A privacy assertion was corrected to compare persistent numeric balances instead of including a transient reward label. The subsequent run passed all 61 checks. Independent reviews covered TV layout, phone/tutorial readability, lifecycle/privacy, and the integration contract.

Local Chromium could not launch because this command environment disallows its Unix socket; the Cloud browser could not reach its isolated loopback server. A normal escalation request was automatically rejected because sandbox approvals are disabled. Rendered verification therefore ran on the owned GitHub Actions workflow with actual headless Chromium. No sandbox/security setting was changed. These are **observed browser fixture tests**, not native or integrated multiplayer tests.

### Rendered evidence

Representative, unmodified Chromium PNGs are kept in [`ui/games/odd-laws-society/screenshots/`](../../ui/games/odd-laws-society/screenshots/). Its evidence index identifies the capture commit and viewport for each image. CI additionally retains every layout screenshot and any failure trace in `ws3-ui-browser-evidence` for 14 days. `WS3_CAPTURE_SCREENSHOTS=1 npm run test:browser --prefix ui/games/odd-laws-society` can refresh the selected layout captures locally when Chromium is available; interaction/tutorial captures are in `test-results/`.

## Remaining integration acceptance

WS6 must inject canonical WS1 catalog/previews and WS2 authenticated projected rooms, add the exact serving lists above, supply WS4's manifest/sound adapter, and register the game only after whole-product acceptance. Required later gates include a real-room TV + two-phone match, both council arrival orders through actual transport, reconnect and rematch across seats, the packaged Mac/Tauri build, physical Wi-Fi/casting, composed-audio audition, and human pacing/balance. This component does not claim those gates.
