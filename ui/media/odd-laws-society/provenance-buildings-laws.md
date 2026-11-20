# Building illustration provenance and visual review

The eighteen building illustrations in `public/assets/odd-laws-society/buildings/` are original AI-generated raster illustrations made for Sofa Arcade with the built-in `image_gen.imagegen` tool on 20 November 2026. They are final flat cutouts, not placeholders or animation frames. Law emblems are documented separately in `provenance-laws.md`.

## Inspected source references

Before generation, both repository reference images were visually inspected at base commit `e34b0015399cb9791b175987adf1fab1b542565a`:

- `public/assets/characters.png`: Jon mouse, Lydia mouse, and Lala orange tabby. It was used only as a project character/style reference; the human reference sheets were not available and were not assumed.
- `public/assets/sofa-room.png`: warm watercolor and colored-pencil texture, cream surfaces, umber contours, sage furnishings, amber illumination.

The first generated Corner Shop established the front/right three-quarter camera and architectural palette for subsequent illustrations. Every other building used that actual inspected image as an additional reference. No commercial board-game images, stock illustrations, downloaded music, or third-party artist references were supplied.

The exact per-image prompt, tool name, original output filename, reference hashes, original PNG SHA-256, optimized WebP SHA-256, source dimensions, and shipped byte size are recorded in `public/assets/odd-laws-society/sources/buildings/generation-log.json`. Original high-resolution outputs are excluded from the Git deliverable to avoid unrelated oversized intermediates. The optimized files are the authoritative shipped artwork; regeneration from a prompt is not expected to be byte-identical.

## Shipped image properties

All eighteen files are 512×512 WebP images with real alpha transparency. The complete generated canvas is mechanically resized to fit 464×464 and padded by 24 transparent pixels on each side, so no generated subject is cropped. WebP quality is 87 with full alpha quality. Combined shipped building bytes: **1,197,818**. Every file is under 82 KiB.

The four guild accents remain amber, coral, teal, and plum over cream/umber architecture. The buildings share a common camera, footprint, warmth, and painting texture while retaining distinguishing silhouettes: canopy stall, garden, open bandstand, bridge, clock tower, courthouse, dome, opera palace, and cat monument. Small carved cat ornaments recur on later civic architecture as decorative motifs only. They do not imply rules, resources, scores, or extra character positions. Clock faces use tick marks, not numerals. Names, prices, rules, and scores are absent from every shipped image.

Each manifest fragment entry declares the actual dimensions, alt text, `status: final`, medium, transparency, and a normalized baseline anchor `{x:0.5,y:0.92}`. The anchor is a convenient common alignment reference for procedural placement, not a claim that moving body parts or atlas frames exist. Buildings have one flat image each. UI owns any fold-in, bob, glow, or other motion.

## Verification and evidence

Every original generation was visually inspected. The final optimized set was also rendered and inspected at **96×96** and **144×144** pixel display sizes. At those sizes the broad architecture and signature motifs remain distinguishable, with no clipped roofs, bases, baked labels, or conspicuous edge halos.

- `public/assets/odd-laws-society/sources/buildings/evidence/contact-sheet-96.png`
- `public/assets/odd-laws-society/sources/buildings/evidence/contact-sheet-144.png`
- `public/assets/odd-laws-society/sources/buildings/evidence/image-checks.json`

The contact sheets place labels outside each image for review; the source artwork contains no text. These are exact-size image renders, not a claim that the completed game has been tested on a physical sofa/TV.

Re-run the image checks and contact sheets after installing the isolated WS4 dependencies:

```sh
npm ci --prefix ui/media/odd-laws-society
node public/assets/odd-laws-society/sources/buildings/inspect.cjs
```

`optimize.cjs` is a portable mechanical packing recipe using the same nested `sharp` dependency. To reproduce the optimized files from retained original generator outputs, pass a directory containing the filenames recorded in `generation-log.json`; it verifies the recorded source hashes first. No runtime dependency on generator outputs, source scripts, or evidence images exists.

## Use and attribution

This pack was generated specifically for use and modification in Sofa Arcade. No separate commercial-stock license or attribution requirement was introduced by this work. The original repository references remain governed by their existing provenance; this report does not assert exclusive copyright in AI outputs or replace the repository owner's licensing decisions. See the pack's `LICENSE-NOTES.md` for the consolidated asset notes.
