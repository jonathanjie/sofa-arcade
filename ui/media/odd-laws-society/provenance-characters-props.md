# Civic characters, guild marks and council props

Created for Odd Laws Society on 20 November 2026 from base
`e34b0015399cb9791b175987adf1fab1b542565a`. These files belong to WS4;
the game view and its animation code remain with the UI/integration workstreams.

## Actual reference material

The only identity/style references were the repository's existing
[`characters.png`](../../../public/assets/characters.png) and
[`sofa-room.png`](../../../public/assets/sofa-room.png), both opened and visually
inspected before generation. The atlas identifies Jon and Lydia as mice and
Lala as an orange tabby. No human portrait sheet or earlier chat attachment was
assumed available.

Jon retains cream fur, swept dark hair, navy rectangular glasses and a teal
scarf. His civic variation uses a waistcoat seal pin and a blank folio or plan.
Lydia retains her round glasses, chestnut ponytail, coral scarf, cream cardigan
and satchel; her civic variation adds a small leaf pin and blank folio. Lala
retains her orange stripes and cream face/chest/paws, with a restrained teal and
plum Chair sash. No prices, names, rules, bids or scoring numbers are baked into
the art.

## Delivered character representation

Fourteen **independent flat state illustrations** are supplied as transparent
512 × 512 WebP files. Every required state has its own generated pose and
expression. `poseReuse` is false for each; no file is aliased to another state.
These are state cutouts, **not a frame-by-frame sprite animation**. There are no
hidden body-part layers or promised-but-missing animation frames.

| Character | State keys | Distinct pose choices |
| --- | --- | --- |
| `jon` | `idle`, `thinking`, `acting`, `celebrate`, `disappointed` | Relaxed folio; paw at chin; presenting plan; raised happy paws; lowered gaze with folio |
| `lydia` | `idle`, `thinking`, `acting`, `celebrate`, `disappointed` | Attentive folio; paw at chin; presenting open folio; applause; small resigned shrug |
| `lala` | `idle`, `thinking`, `stamp`, `celebrate` | Proud seated Chair; deliberating; pressing a real rubber stamp on blank paper; raised joyful paws |

The first generated Jon image was requested as idle but visibly used a
paw-to-chin gesture. It was correctly assigned to `thinking`, and a new relaxed
idle was generated. The exact prompt and this reassignment are retained in the
generation record.

Every state entry has manifest-relative `src`, `width`, `height`, `alt`,
`status: "final"`, `poseId`, `poseReuse` and normalized `anchors`. `foot` is a
ground/transform origin and `face` is a coarse facial focus point. Lala's stamp
state adds a rubber-base contact anchor, `stamp`. These anchors support
whole-image translation, tilt, squash or crossfade in the UI; they are not
anatomical joints. Independent generated states have small natural registration
differences, so a brief crossfade is appropriate when swapping poses.

Use the normal flat image directly:

```js
const entry = manifest.characters.lala.states.stamp;
image.src = new URL(entry.src, manifestUrl).href;
image.alt = entry.alt;
image.width = entry.width;
image.height = entry.height;
// Optional UI-owned motion origin:
image.style.transformOrigin = entry.anchors.foot.map(x => `${x * 100}%`).join(' ');
```

Animations must remain cosmetic and must not expose sealed council choices.
Reduced-motion behavior belongs to the view. The files also work with no
animation or custom rig at all.

## Guild icons and props

The four original SVG guild marks use both **shape and color**: an amber shop,
coral crossed tools, teal open book/seal and plum theatre mask. They remain
distinguishable without interpreting color, and each contains a title and
description in addition to the manifest alt text. UI should still display the
guild name alongside its icon.

The six exact prop keys are `envelope-sealed`, `envelope-open`, `stamp`, `coin`,
`influence`, and `street-glow`. The coin is round and embossed with a sprout;
influence is a plum hexagonal quill seal. Envelopes use the same paw-stamp
vocabulary as Lala's illustrated stamp. The street overlay connects three
horizontal plots and does not imply a column or diagonal rule.

All ten SVGs are self-contained editable source. They embed no font, linked
image, external URL, script, filter dependency or rendered text. Their
`<title>`/`<desc>` content is accessibility metadata, not baked interface copy.

## Reproducibility and evidence

The art was generated with the available **built-in `image_gen.imagegen`**
tool, one image per distinct pose. The CLI/API fallback was not used. Final
raster processing only resized, padded and WebP-encoded the returned RGBA
illustrations; it did not paint new content, recolor them or synthesize poses.
The output keeps a 16-pixel transparent canvas margin at 512 × 512.

Sources and records:

- `public/assets/odd-laws-society/sources/characters/generation-prompts.json`:
  all exact prompts, reference relationships and original output identifiers.
- `public/assets/odd-laws-society/sources/characters/validation.json`:
  SHA-256 hashes for original references, generated sources and optimized
  outputs; original/shipped dimensions; alpha coverage; transparent-border
  checks and file sizes.
- `public/assets/odd-laws-society/sources/characters/optimize-characters.mjs`:
  technical conversion and evidence generation using the pinned nested Sharp
  dependency. Raw intermediate inputs are intentionally not shipped.
- `public/assets/odd-laws-society/sources/icons-props/build-icons.mjs`:
  original SVG geometry and generated manifest fragments.
- `public/assets/odd-laws-society/sources/icons-props/inspect-icons.mjs` and
  `validation.json`: SVG dimensions, alpha/bounds, self-containment and hashes.
- `public/assets/odd-laws-society/sources/characters/contact.png`: all 14 poses
  rendered at 144 px on light/dark backgrounds for board-size inspection.
- `public/assets/odd-laws-society/sources/icons-props/contact.png`: guilds at
  96 px and 32 px; council/resource props at 128 px, with the wide street
  overlay proportionally fitted.

Commands from the repo root:

```sh
npm ci --prefix ui/media/odd-laws-society
node public/assets/odd-laws-society/sources/icons-props/build-icons.mjs
node public/assets/odd-laws-society/sources/icons-props/inspect-icons.mjs
# Re-encoding only, when the recorded raw generation outputs are available:
node public/assets/odd-laws-society/sources/characters/optimize-characters.mjs /path/to/generated-originals
```

Validation completed on 20 November 2026 with Sharp 0.35.5: **14 unique character
images, 756,364 bytes total**, all decoded at 512 × 512 with true alpha and zero
nontransparent border pixels; **10 SVG icons/props, 10,313 bytes total**, all
decoded at declared dimensions with transparent borders and zero external
dependencies. Every full-size generated character image was visually inspected,
then the committed 144 px character contact and 96/32 px icon contact were
inspected for readable expressions, silhouettes and clipping. The contact sheets
are rendered asset inspections, not evidence of a physical TV or phone test.

The optimized raster files are the committed artwork; hashes and prompts do not
claim that a stochastic image generator will recreate identical pixels. SVG
regeneration is deterministic. The lead's manifest/browser checks validate the
committed files without requiring any generation service or raw intermediate.

See the pack's
[`LICENSE-NOTES.md`](../../../public/assets/odd-laws-society/LICENSE-NOTES.md).
No external illustration, commercial board-game image, stock icon or font was
used. This provenance note does not change repository licensing terms.
