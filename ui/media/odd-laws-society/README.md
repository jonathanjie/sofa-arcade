# Odd Laws Society media pack

This is the isolated WS4 artwork, score data, and review harness. The game view,
shared sound engine, LAN routes, and desktop packaging were integrated in the local release.

## Review locally

Requires Node 22.13 or newer. Preview and image-check dependencies are isolated
here; no root dependency changes are needed.

```sh
npm ci --prefix ui/media/odd-laws-society
npm run preview --prefix ui/media/odd-laws-society
```

Open **http://127.0.0.1:4188/**. This development server listens only on loopback
and serves an explicit list of media and preview files. The gallery uses local
system fonts and assets; it makes no external requests. Native audio controls
play the retained review renders and never create another audio context.

The gallery includes two boroughs at **96 px** per building, a complete six-card
market at **144 px**, all eighteen buildings, all fourteen character states,
the twelve law emblems, four guild symbols, six props, and the score previews.
Use **Dark ink** or **Alpha grid** to inspect cutout edges. The view tabs support
arrow keys, Home, and End. This is a media fixture, not a playable game screen.

## Verify

```sh
node ui/media/odd-laws-society/assemble-manifest.mjs
npm test --prefix ui/media/odd-laws-society
node ui/media/odd-laws-society/validate-manifest.mjs
node ui/media/odd-laws-society/audio-preview.mjs --verify
node ui/media/odd-laws-society/node_modules/playwright/cli.js install chromium
node ui/media/odd-laws-society/browser-check.mjs
npm test
```

If using an already installed Chromium, set `CHROMIUM_PATH` to its executable
for `browser-check.mjs`. This is a test-only option. Browser evidence is written
to the ignored `evidence/latest/` directory; pass a different directory as the
script's first argument when retaining a reviewed run.

Validation rejects missing catalog images, wrong lowercase state keys, unsafe
URLs, missing/undecodable files, inaccurate dimensions, blank/opaque/clipped
cutouts, invalid anchors, out-of-bounds atlas frames, undisclosed identical
character poses, and placeholders. It checks PRD IDs independently. Browser
tests block non-loopback requests, decode every flat image, capture TV/phone
contact sheets, check actual CSS sizes, and verify audio playback and seeking
into the contrasting section. CI runs these checks in `.github/workflows/ws4-media.yml`.

## Runtime handoff

- **Image manifest:** `public/assets/odd-laws-society/manifest.json`
- **Expected served manifest URL:** `/assets/odd-laws-society/manifest.json`
- **Score module:** `ui/media/odd-laws-society/score.mjs`
- **Optional effects:** `ui/media/odd-laws-society/effects.mjs`

All image URLs are relative to the manifest. Resolve them against the complete
manifest URL, including its filename:

```js
const imageUrl = new URL(entry.src, manifestUrl).href;
```

Every required character state has a flat image. Anchors are normalized `[x,y]`
coordinates in that full image, with the top-left at `[0,0]`. They support
procedural transforms and prop placement; no timeline or frame-by-frame sprite
animation is implied. The interface owns motion and reduced-motion behavior.

The score supplies authored events in **beats**, not seconds. The shared scheduler uses its
tempo, meter, and loop length in the existing scheduler: **100 BPM, four beats
per bar, 32 bars**. Select arrangements at four-bar phrase boundaries. Retain
gesture unlock, independent saved music/effects settings, host-only music,
quiet phone defaults, hidden-page pause, and one active soundtrack. See
[COMPOSITION.md](COMPOSITION.md) for the exact scene/effect names and fallbacks.

Ship only the manifest and its referenced image files plus `score.mjs` and
`effects.mjs`. The preview, fragments, tests, source/provenance tooling, encoded
audio review files, evidence, and nested dependencies are development material.
`runtime-files.json` is the explicit repository-relative handoff inventory.

For scope, tested commands, visual evidence, and remaining integrated-device
checks, see `docs/archive/workstreams/odd-laws-media.md` and the PR's pinned head SHA.
