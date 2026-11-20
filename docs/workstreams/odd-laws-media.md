# WS4 — Odd Laws Society artwork and composed soundtrack

## Scope and source

- Repository: `jonathanjie/sofa-arcade`
- Branch: `feature/odd-laws-media`
- Base: **`e34b0015399cb9791b175987adf1fab1b542565a`**, fetched from `origin/main`
  before implementation on 20 November 2026.
- Isolated clone; writes restricted to `public/assets/odd-laws-society/**`,
  `ui/media/odd-laws-society/**`, `.github/workflows/ws4-media.yml`, and this report.
- Existing `characters.png` and `sofa-room.png` were inspected. They depict Jon
  mouse, Lydia mouse, and Lala the orange tabby. No missing human character
  sheets or previous chat attachments were assumed.

## Delivered media

All **54 required images are final**, with no placeholders or missing catalog
IDs. The manifest and generated runtime inventory refer to files that exist
and decode successfully.

| Asset group | Count | Shipped format | Combined bytes |
| --- | ---: | --- | ---: |
| Buildings, all three terms | 18 | 512×512 transparent WebP | 1,197,818 |
| Jon, Lydia, and Lala states | 14 | 512×512 transparent WebP | 756,364 |
| Law emblems | 12 | 256×256 original SVG | 17,274 |
| Guild symbols and required props | 10 | Original SVG, declared dimensions | 10,313 |

The **57-file runtime inventory is 2,013,494 bytes**, including the manifest,
54 images, score, and effects modules. Review MP3s, screenshots, provenance,
generation records, source tools, and nested development dependencies are
excluded from that inventory.

The eighteen buildings share a front/right three-quarter camera, cream and
umber architecture, watercolor texture, and amber/coral/teal/plum accents.
The four guilds have distinct shop, tools, book/seal, and mask silhouettes so
color is not their only distinction. Labels, prices, rules, and score numbers
remain interface text; the clock illustration uses unnumbered tick marks.

Jon and Lydia each have `idle`, `thinking`, `acting`, `celebrate`, and
`disappointed`; Lala has `idle`, `thinking`, `stamp`, and `celebrate`.
These are fourteen distinct flat state illustrations with normalized anchors.
No pose reuse, body-part rig, atlas, or frame-by-frame animation is claimed.
The six prop keys are `envelope-sealed`, `envelope-open`, `stamp`, `coin`,
`influence`, and `street-glow`.

## Interfaces and integration

`public/assets/odd-laws-society/manifest.json` uses schema version 1 and the
contract's exact `buildings`, `laws`, `guilds`, lowercase `characters.*.states`,
and `props` sections. Every final leaf includes a manifest-relative `src`,
decoded `width`/`height`, descriptive `alt`, and `status`. Resolve URLs with
`new URL(entry.src, manifestUrl)`. Normalized anchors use the complete image
canvas, not its alpha crop.

The score module exports **`SCORE`** and **`eventsForBar(index, mode='play')`**;
the effects module exports **`eventsForEffect(name)`**. Runtime data is pure:
no DOM, preferences, timers, network, audio context, or scheduler. The authored
piece, **“Lala Calls the House,”** is a 32-bar F-major AABA miniature in 4/4 at
100 BPM, lasting 76.8 seconds per cycle. B visits D minor with its own melodic
contour, longer note values, and A7/C♯. Scene arrangements retain the melody.

WS6 integrates this data into the shared sound engine with its own tempo/meter
selection, one active soundtrack, four-bar arrangement boundaries, quiet phones,
gesture unlock, saved independent settings, and visibility lifecycle. The
required scenes are `lobby`, `council`, `term1`, `term2`, `term3`, `celebrate`;
unknown modes use `play`. Finite bar indices are floored and wrapped; other
indices select bar zero. Unknown effects return a fresh `[]`.

The explicit runtime inventory is retained at
`ui/media/odd-laws-society/runtime-files.json`. The integrator must align
production copies, secure LAN routes, portable ZIP entries, and desktop staging.
Development galleries, evidence, source tooling, encoded listening previews,
tests, and nested dependencies do not belong in the packaged runtime.

## Verification commands

```sh
npm ci --prefix ui/media/odd-laws-society
node ui/media/odd-laws-society/assemble-manifest.mjs
npm test --prefix ui/media/odd-laws-society
node ui/media/odd-laws-society/validate-manifest.mjs
node ui/media/odd-laws-society/audio-preview.mjs --verify
node ui/media/odd-laws-society/browser-check.mjs
npm test
npm run build
```

Preview: `npm run preview --prefix ui/media/odd-laws-society`, then
`http://127.0.0.1:4188/`. All assets and system fonts are local. The browser
check blocks external requests and saves board/card-size screenshots.

## Verification evidence

- **54/54 images:** decoded dimensions, safe manifest-relative references,
  exact PRD catalog IDs and lowercase state keys, alt text, final status,
  nonblank alpha, transparent margins, valid anchors, and bounded atlas metadata
  where present. The shipped set uses flat files, not atlases.
- **16 new tests pass:** five manifest/inventory regression tests and eleven
  score/effect tests. The manifest tests include missing-flat-state, placeholder,
  dimension, path, casing, nested-layer, and atlas-bound failures.
- **66 existing Node tests pass**, including the five existing audio checks;
  the existing production framework build also passes.
- **Seven arrangement renders and ten effect cues pass** numeric synthesis
  validation. No nonfinite samples or clipped samples. Before the shared music
  bus gain, the loudest arrangement peaks at **−12.735 dBFS**. The decoded
  review MP3s peak at **−16.835 dBFS** (full score), **−19.789 dBFS** (council),
  and **−20.601 dBFS** (effects). Exact source hashes, synthesis assumptions,
  and both maximum and default volume levels are in
  `audio-evidence/render-report.json`.
- Original generations and optimized contact sheets were visually inspected.
  Buildings were reviewed at **96 px and 144 px**; character states at 144 px;
  law and guild symbols at their small display sizes. Saved contact sheets are
  in `public/assets/odd-laws-society/sources/{buildings,characters,laws,icons-props}/`.
- The owned GitHub workflow passed its isolated **Chromium 151.0.7922.34**
  review: 1920 px and 1280 px TV fixtures, 390 px and 360 px phone layouts,
  **105 displayed image instances decoded**, zero external requests or browser
  errors, keyboard tabs, dark alpha surfaces, native MP3 playback, and seeking
  into B. Both music files decode to 77.4 seconds including their release tails.
- All **nine browser screenshots were visually inspected** with no material
  layout, clipping, missing-image, label-overlap, or cohesion defects. Evidence
  is retained in `ui/media/odd-laws-society/evidence/review/`, including
  `browser-validation.json`, `manifest-validation.json`, and `review-run.json`.
  The latter pins the source commit, CI merge checkout, artifact digest, and
  each retained file's hash.

The local environment could not launch Chromium, and its shared browser could
not reach the loopback review server. Those attempts are not counted as passing
browser tests. The successful remote browser run is
[WS4 media run 44703645565](https://github.com/jonathanjie/sofa-arcade/actions/runs/44703645565),
testing source **`e4767f14b666a244057ad4c69d39ee3ebc64941b`** through PR merge
checkout `30bee84d497eb3430716bbd4f64145e0873c68d8`. The existing Game checks
workflow also passed. Subsequent report/evidence additions do not change the
runtime pack or review code; the PR pins the final tested head and CI result.

### Saved visual previews

- `evidence/review/board-1920.png`: two 3×3 boroughs, laws, Lala, and six-card market.
- `evidence/review/board-1280.png`: the narrower desktop review layout.
- `evidence/review/catalog-144px.png`: all eighteen buildings at card size.
- `evidence/review/character-states.png` and `alpha-on-dark.png`: all fourteen states.
- `evidence/review/symbols.png`: all laws, guilds, and props.
- `evidence/review/phone-390.png` and `phone-360.png`: narrow responsive catalog views.
- `evidence/review/soundtrack.png`: score form and native playback controls.

Paths above are relative to `ui/media/odd-laws-society/`.

## Provenance and limitations

Artwork provenance is recorded in the owned `sources/`, `provenance-*.md`,
and `public/assets/odd-laws-society/LICENSE-NOTES.md`. The musical form,
arrangements, synthesis method, source hashes, and exact preview levels are in
`ui/media/odd-laws-society/COMPOSITION.md` and `audio-evidence/render-report.json`.

These are flat illustrated states and optional procedural anchors, not a
frame-by-frame animation atlas. The UI owns animation. The offline synthesizer
approximates the inspected shared timbres; numeric levels and decoded playback
do not establish actual listening quality on Jon's Mac, TV, or home speakers.
Physical-phone/TV testing and final shared-engine audition belong to WS6.

The essential artwork, audio, manifest, offline preview, and CI gates are
complete. This media pack is ready for WS6 integration. No merge, deployment,
or catalog enablement is part of WS4.
