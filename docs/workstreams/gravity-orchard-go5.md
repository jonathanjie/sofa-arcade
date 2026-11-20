# GO5 — Gravity Orchard final media

## Source and scope

- Repository: `jonathanjie/sofa-arcade`.
- Branch: `feature/gravity-orchard-media` in an isolated worktree.
- Base: `6c6eb9343958da591b4488366c2ada4000e3ba08`, fetched from current `main` before production.
- Ownership: only `public/assets/gravity-orchard/**`, `ui/media/gravity-orchard/**`, this report and `.github/workflows/go5-media.yml`.
- GO7 owns game registration, media injection, host audio wiring, production allowlists and packaging. This component does not enable the game, alter other games or deploy.

## Delivery status

**GO5 is ready for GO7 component integration.** All 49 required final visual assets are delivered, decoded and validated. The corrected gallery and complete shared-scheduler audio renders passed on `288a5975a2a59da909959f5246f178a83290f31b` ([run 44780762995](https://github.com/jonathanjie/sofa-arcade/actions/runs/44780762995)): 16 media tests, 81 baseline tests, actual browser rendering, motion/fallback checks and audio playback. Local production build also passes.

Downloaded screenshots were visually inspected at 1280×720 and 1920×1080 TV viewports and 360×800 and 390×844 phone viewports. Review led to corrections for thumbnail proportions, moonlight label placement/contrast, dark character captions and truthful missing-file status. The corrected captures were inspected again and passed. Eleven representative original PNGs, source hashes and browser/asset reports are retained in [`sources/evidence/review/`](../../ui/media/gravity-orchard/sources/evidence/review/README.md); the four rendered MP3s and their matching source-hashed audio report are under `sources/audio/`. No missing essential asset is counted as complete.

This executor blocks Chromium's required Unix sockets and isolates loopback servers from the managed browser, so actual browser checks run in the owned GitHub CI. The final tested head and its complete CI artifact are recorded in the PR, avoiding a self-referential commit hash in this file. The retained screenshot report records its original capture commit, and `evidence.json` hashes the gallery/runtime source so later evidence-only commits remain auditable.

## Final visual inventory

| Deliverable | Count | Runtime keys |
| --- | ---: | --- |
| Original wide cover | 1 | `cover` |
| Morning, grove and moonlight backdrops | 3 | `environment-{levelId}` |
| Fruit silhouettes | 4 | `fruit-{type}` |
| Ordinary, accepting, rejecting and full baskets | 16 | `basket-{type}-{state}` |
| Tray, bridge, hedge and bumper materials for each stage | 12 | `{tray|bridge|hedge|bumper}-{levelId}` |
| Open, forecast and closed gate | 3 | `gate-{state}` |
| Forecast and active directional gust | 2 | `gust-{state}` |
| Compost opening | 1 | `compost` |
| Impact, capture, compost and order feedback | 4 | `effect-{kind}` |
| Jon, Lydia and Lala atlases | 3 | `character-{actor}` |

Fruit types are exactly `apple`, `plum`, `pear`, `starfruit`. Level IDs are exactly `morning-delivery`, `switchback-grove`, `moonlight-picnic`. The original cover depicts both bespectacled mice cooperating over a bridge between floating gardens, with picnic Lala. All artwork is free of UI text; the gallery title and labels are separate HTML/canvas layers.

The apple has a round shape and one leaf; plum has an oval shape, split leaves and a seam; pear has a tapered neck and dotted belly; starfruit has a five-point cut face. Baskets repeat the matching fruit emblem and use check/cross/striped-closure marks for feedback. The gallery displays both bright and dark surfaces and a grayscale comparison at 32 pixels.

The three environment images are quiet peripheral illustrations. Tray/bridge/hedge/bumper art is decorative: **clip it to GO1's public geometry and draw the authoritative boundary above it**. Image pixels never define collision authority. The gallery's arrangement is a media fixture, not a duplicate authored stage or simulation.

## Exact manifest and adapter

Canonical JSON: `public/assets/gravity-orchard/manifest.json`. Required fields are `schemaVersion:1`, `gameId:'gravity-orchard'`, `assets`, `characterStates`, `runtimeFiles`. Asset URLs are explicit root-relative local URLs. Every entry specifies `kind`, `width`, `height`, `src` and descriptive `alt`.

`ui/media/gravity-orchard/manifest.mjs` exports:

- `MANIFEST` (also default and `manifest`): validated, deeply frozen canonical data.
- `ASSETS`, `CHARACTER_STATES`, `RUNTIME_FILES`.
- `FRUIT_TYPES`, `STAGE_IDS`, `REQUIRED_STATES`.
- `validateManifest(value)`: rejects missing essentials, unsafe URLs, unfinished assets, bad atlas bounds/durations/pivots and authoring delivery.
- `getAsset(key)`: an asset or `null` for an unknown key.
- `getCharacterFrame(actor,state,elapsedMs,{reducedMotion})`: a source-pixel frame rectangle plus source URL, dimensions and pivot; unknown state falls back to idle, unknown actor returns `null`.

The browser-safe `manifest-data.mjs` is generated from the same canonical JSON, avoiding JSON-module browser differences and asynchronous fetch dependencies. Tests require byte/content agreement and exact import closure.

Each 1024×512 transparent WebP atlas contains eight distinct 256×256 drawings. Frames have `{x,y,width,height,durationMs,pivot:{x:128,y:240}}`. Character state records have `{asset,frames,reducedMotionFrame,loop}`. Jon/Lydia expose `idle`, `lean`, `brace`, `cheer`; Lala exposes `idle`, `forecast`, `gust`, `pleased`. Each state has two drawings and an explicit still frame. Runtime drawings have safe transparent gutters and a registered baseline. These are two-pose flipbooks, not skeletal rigs.

`fallbacks.mjs` exports `fallbackSvg(key)` and `fallbackDataUrl(key)` for error-only native symbols. They do not make missing final assets valid. The gallery records a required-image decode failure and fails completeness while keeping a useful fallback view.

## Runtime versus authoring

`ui/media/gravity-orchard/runtime-files.json` lists the exact **55** runtime files, byte counts, SHA-256 hashes and total bytes. `MANIFEST.runtimeFiles` is the same explicit repo-relative list. There are no production dependencies. Runtime delivery consists of the canonical JSON, 49 image/atlas files, and five browser modules: `manifest.mjs`, `manifest-data.mjs`, `fallbacks.mjs`, `score.mjs`, `events.mjs`.

Measured payload: **996,092 bytes** (about 973 KiB). The inventory is authoritative. The cover/backdrops account for 439,132 bytes and the three character atlases for 424,056 bytes. Runtime does not download audio recordings; the score is synthesized by the existing shared scheduler.

Exclude all `ui/media/gravity-orchard/sources/**`, test files, nested package/lock files, `audio-preview.mjs`, `runtime-files.json`, development dependencies and this report from production delivery. `runtime-files.json` is packaging metadata; it need not be browser-served. Do not recursively copy either entire owned subtree. The public asset subtree itself contains only explicitly inventoried final media plus its manifest.

## Provenance and original sources

The existing `public/assets/characters.png`, Odd Laws cover and existing Jon/Lydia/Lala states were inspected before creating new artwork. Built-in image generation produced the cover, three environments and character pose sheets. Source prompts, reference hashes, correction decisions, selected originals and licensing notes are retained exclusively under `sources/environments/` and `sources/characters/`.

Jon's original generated background was corrected to true alpha. Lydia's second lean frame was corrected to preserve the stance direction across the animation. Character source sheets and final 80/128-pixel contacts were visually inspected. Environment originals are retained losslessly; optimized 1280×720 WebP outputs and a 320×180 cover contact were inspected.

The 42 vector assets are original deterministic SVG drawings, reproduced by `sources/symbols/build.mjs`. The authoring-only `sources/symbols/inspect.mjs` renders a retained 32/64-pixel fruit and 76-pixel basket contact sheet on bright/dark surfaces, including grayscale recognition. No third-party art, icon fonts, external fonts, recordings or clip-art libraries were introduced. Scope and provenance notes are in each lane's authoring directory; no new repository-wide license is asserted.

## Original composition and cue contract

**Over the Little Bridge** is a new D-major, 4/4 theme at 104 BPM, 32 bars in AABA form (about 73.85 seconds per loop). Its recurring F♯–A–B–A–F♯–E invitation has a separate answering phrase. The B section moves to B minor, uses a higher, longer melodic line and returns through Em7–A7–D. Written rests and cadences leave a clear breath at the loop boundary. Bass and plucked harmony support the melody; there is no random note selection.

- `score.mjs`: `SCORE`, `eventsForBar(barIndex,scene)`; also re-exports `eventsForEffect` for `audio.setScore` compatibility.
- `events.mjs`: `eventsForEffect(name)`, `EFFECT_NAMES`, `CUE_POLICY`.
- Exact scenes: `menu`, `practice`, `stage1`, `stage2`, `stage3`, `paused`, `celebrate`.
- Unknown scenes use the menu arrangement; unknown effects, including prototype keys, return `[]`.
- Events contain only `{instrument,pitch,beat,duration,level}`. Instruments are the inspected shared scheduler's `woodwind`, `bass`, `pizzicato`, `bell`.
- Ten cues: `catch`, `reject`, `compost`, `order`, `forecast`, `gate-warning`, `gust`, `countdown`, `stage-result`, `finish`. Aliases match the public event vocabulary (`order-complete`, `gate-forecast`, `gust-forecast`, `gust-start`, `stage-complete`) and basket-full/final-celebration use cases.
- Spawn, transfer and high-frequency impacts deliberately have no repeated jingle.

### GO7 host integration

```js
import * as orchardMusic from './media/gravity-orchard/score.mjs';
audio.setScore('gravity-orchard', orchardMusic);
audio.setContext({ role: 'host', view: 'game', scoreScene: 'stage1' });
// audio.unlock() remains directly inside the existing user gesture.
```

The existing `audio.setScene` whitelist does not yet include Gravity Orchard's scene names. GO7 can extend that shared whitelist or use the existing `setContext({scoreScene})` seam demonstrated above. The shared scheduler already changes arrangements at four-bar boundaries without resetting the melody. Do not call `setScore` on every catch, create another AudioContext/clock or replace independent saved music/effects settings.

The host maps practice to `practice`, ordinary stage play to `stage1`–`stage3`, waiting/detail to `menu`, shared pause to `paused`, and results to `celebrate`. Phone role/defaults remain quiet through the existing scheduler.

Deduplicate stable public event IDs per match before requesting cues; clear event cursors when `matchId` changes and fence obsolete epoch presentation work. Apply the exported per-cue `CUE_POLICY` cooldowns in the host adapter after deduplication, keyed by canonical cue name. Mark suppressed events seen as well. Prefer order/forecast/result cues over a simultaneous ingredient catch. Countdown ticks need a derived ID including match, epoch and countdown second, rather than emitting a cue on every snapshot. This data pack owns no hidden timers or gameplay event dispatch.

## Reproduction and verification

```sh
npm ci --prefix ui/media/gravity-orchard --no-audit --no-fund
node ui/media/gravity-orchard/sources/symbols/build.mjs
node ui/media/gravity-orchard/sources/assemble.mjs
node ui/media/gravity-orchard/node_modules/playwright/cli.js install --with-deps chromium
node ui/media/gravity-orchard/sources/audio/render.mjs --write --encode
npm test --prefix ui/media/gravity-orchard
node ui/media/gravity-orchard/sources/browser-check.mjs
npm test
npm run build
```

Open the review locally with `npm run preview --prefix ui/media/gravity-orchard` (loopback port 4195). The gallery covers collection-card size, 32-pixel fruit, all baskets on bright/dark backgrounds, three terrain arrangements, all 24 poses, normal/reduced motion, actual missing-URL fallback and the live/recorded audio preview. The preview has a strict explicit file allowlist and makes no external requests.

The audio renderer uses an authoring-only OfflineAudioContext facade to exercise the unchanged shared scheduler and synthesis graph. It checks two full loops for each scene, phrase-boundary transitions, all cues, cue/music overlap, pre-compressor and final peaks/RMS, DC offset, clipping, voice bounds, quiet phone defaults, MP3 decoding and source hashes. It does not install a runtime audio engine. Saved MP3s and the report are review-only.

### Measured audio acceptance

The retained `sources/audio/render-report.json` records Chromium 157.0.8103.0, 32 kHz rendered samples, nine matching source hashes and four matching preview-file hashes. These are numerical and browser playback checks, not a claim of human listening.

| Check | Result |
| --- | --- |
| Seven arrangements | Two complete loops each; one context and one scheduler interval |
| Music peaks before shared compressor | −29.44 to −18.67 dBFS |
| Music output peaks at full volume | −25.15 to −14.38 dBFS |
| Stage 1 at the actual 45% default | Peak −22.33 dBFS; RMS −32.05 dBFS |
| Music/effect overlap stress | Raw peak −17.43 dBFS; output peak −13.14 dBFS |
| Oscillator concurrency | Music ≤5; individual cues ≤6; overlap ≤8 |
| Clipping and finite samples | All 22 captures: zero clipped or non-finite samples before and after compression |
| Loop boundary | All seven pre-compressor jumps below 10⁻⁹ at report precision; quiet preceding tails |
| Scene changes | Stage 2 at bar 9; stage 3 at 17; paused at 25; celebrate at 29; cursor preserved |
| Phone defaults | Zero scheduled bars/effects/voices and zero output; music unavailable, effects off |

The retained full-loop Stage 1, Stage 3 and transition MP3s each decode to 73.891156 seconds (the 73.846-second score plus the scheduler's 45 ms start offset). The ten-cue reel is 16.353844 seconds. Their combined size is 2,384,096 bytes, excluded from runtime delivery. Browser checks also exercise live shared-scheduler unlocking, MP3 playback and seeking to 40 seconds.

The owned CI installs locked nested tooling, checks reproducible assembly, runs actual audio renders, executes asset/score/baseline tests, captures browser evidence at 1280×720, 1920×1080, 360×800 and 390×844, and retains evidence against the exact head. It first checks for a working installed Chromium/Chrome binary and explicitly selects the same binary for audio and gallery rendering; otherwise it installs Playwright's Chromium. Actual browser versions are recorded rather than described as pinned. An initial browser-download stall motivated this installation fallback; the complete updated job passed. No essential missing-media gate is replaced with a success flag.

## Honest boundaries

Component gallery/score acceptance is distinct from GO7's actual TV/phone integration and native packaging. No physical phone, home Wi-Fi, television, casting or speaker test is claimed. No human listening session has been performed; finite waveforms, decoding, timing, level and playback checks are documented separately from musical listening. No Site/Pages deployment or self-merge is part of GO5.
