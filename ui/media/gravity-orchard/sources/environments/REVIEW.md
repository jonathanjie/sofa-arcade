# Finished environment artwork review

Reviewed on 21 November 2026 (Asia/Singapore), against base
`6c6eb9343958da591b4488366c2ada4000e3ba08`.

## Runtime deliverables

| Manifest key | File beneath `public/assets/gravity-orchard/` | Dimensions | Bytes |
| --- | --- | --- | ---: |
| `cover` | `cover.webp` | 1280 × 720 | 309,204 |
| `environment-morning-delivery` | `environments/morning-delivery.webp` | 1280 × 720 | 35,722 |
| `environment-switchback-grove` | `environments/switchback-grove.webp` | 1280 × 720 | 53,824 |
| `environment-moonlight-picnic` | `environments/moonlight-picnic.webp` | 1280 × 720 | 40,382 |

Total runtime illustration payload: **439,132 bytes** (about 429 KiB).
All four are intentionally opaque. No cutout transparency is required for a
full-background layer. The complete manifest entry fragment is `fragment.json`.

## Actual inspection

The optimized files were decoded and visually inspected, rather than treating
the generation return as a completed asset. The cover was inspected at a
**320 × 180 collection-card size**, at half-size in a contact sheet, and in its
native generated output. All three optimized environments were inspected at
**1280 × 720**.

The cover clearly shows two floating trays, their connecting bridge, rolling
fruit, Jon with blue rectangular glasses/teal scarf, Lydia with round glasses/
auburn braid/coral scarf, and orange tabby Lala beside the picnic. The four fruit
silhouettes remain distinct at the collection thumbnail size. The composition
includes a few tiny distant orchard islands as background atmosphere; only the
two large foreground trays represent the cooperative game. There is no baked
title, interface text or instructional writing.

The stage images deliberately contain only atmosphere and edge decoration.
Their centers have no baked paths, gates, baskets, holes, fruit or character
positions that could conflict with public geometry. Morning is pale cloud-and-
blossom light, Grove is warmer sage-and-amber afternoon, and Moonlight is soft
teal with a rim crescent and fireflies. On the central 60% rectangle the decoded
luminance standard deviations are 3.89, 4.33 and 6.37 out of 255, respectively;
this quantifies their low-contrast fields without claiming a gameplay
accessibility test.

The review sheet's first export used a multiplication glyph unavailable in the
bundled evidence font. Its authoring labels were corrected to plain `x` and
regenerated. Runtime artwork was unaffected and contains no text.

## Reproduction and provenance

Run `python ui/media/gravity-orchard/sources/environments/optimize.py` with
Pillow installed to regenerate the final encodings, fragment, byte/hash report
and contact sheet from the retained lossless originals. Original generation is
recorded by the exact prompts, generator IDs and original-PNG SHA-256 hashes;
generation itself is not claimed to be deterministic. The retained originals
were checked pixel-for-pixel against the generated PNGs.

`raw/`, `generation-prompts.json`, `provenance.json`, `optimize.py`, this review,
license notes and `evidence/` are authoring/review material and must remain
outside every public/LAN/native runtime allowlist. Only the four runtime images
listed above should be shipped.

Browser gallery decoding and final composition with geometry-owned tray,
bridge, hedge, gate and bumper pieces are performed by the parent GO5 verifier.
These four images do not define collision geometry. No physical TV, phone,
casting or human playtest is claimed by this illustration review.
