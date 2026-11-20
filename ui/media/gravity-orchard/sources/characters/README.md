# Gravity Orchard character atlas authoring

Created for Sofa Arcade on 21 November 2026 from repository base
`6c6eb9343958da591b4488366c2ada4000e3ba08`.

## Delivered art

Three transparent WebP atlases each contain eight distinct generated drawings in
a 4-column × 2-row grid. Every frame is 256 × 256 pixels; each atlas is 1024 ×
512. Jon and Lydia each have `idle`, `lean`, `brace`, and `cheer`. Lala has `idle`,
`forecast`, `gust`, and `pleased`. The first variant of each state is in row one;
the second is directly below. The exact rectangles and beat-independent
`durationMs` values are in `fragment.json` for assembly into the canonical
manifest. These are actual different poses, not one portrait under four names.

Use `character-jon`, `character-lydia`, and `character-lala` as asset keys. A
state selects its two named frames, for example `lean-1` and `lean-2`. All
frames have pixel pivot `{ "x": 128, "y": 240 }`, registered to the foot
baseline. Idle is an 1800 ms open-eye frame followed by a 180 ms blink. Other
states use a restrained two-frame pose change. The default reduced-motion
frame is always the named `*-1` frame and remains a useful, visible state.

These are eight-pose flipbook atlases, not a multi-joint anatomical rig or
high-frame-rate hand-drawn animation. Whole-character lean, interpolation,
transition fades, small scarf sway and gust direction mirroring may be added
by the presentation layer. Those transforms are cosmetic. Position, collision
boundaries and gameplay forces remain the simulation's responsibility. Use a
short crossfade when changing states if desired; do not continuously change
the state in response to tiny sensor fluctuations. The fixed pivot and still
frames work without transforms or motion.

Lala's wide tail gives her a shorter drawn height within the same square frame;
this preserves her cat silhouette and keeps the complete gust pose in bounds.
The alpha gutters are at least six pixels and typically substantially wider.
No text, status labels, warnings or interaction instructions are baked in.

## Provenance and license notes

The raster art was produced with the built-in `image_gen.imagegen` tool for
this assignment. The only style/identity references were the repository's
existing `public/assets/characters.png`, `public/assets/odd-laws-cover.webp`,
and its original Odd Laws Jon/Lydia/Lala character cutouts. All were visually
inspected first. Their provenance is retained in the earlier pack's
`public/assets/odd-laws-society/LICENSE-NOTES.md` and
`ui/media/odd-laws-society/provenance-characters-props.md`.

Jon remains a cream mouse with brown hair, blue rectangular glasses and a
teal scarf; Lydia remains a cream mouse with auburn hair, round glasses,
coral scarf and cream cardigan; Lala remains an orange tabby. New orchard poses
remove Jon/Lydia's civic books and Lala's civic sash. No stock illustration,
commercial game art, external character model, downloadable font, or external
icon set was used. These notes record provenance; they do not grant a new
license or replace the owner's existing repository distribution terms.

`generation-prompts.json` retains every exact prompt, reference relationship,
generation identifier and correction decision. The selected source PNGs are
retained here. Image generation is stochastic: the prompts are provenance,
not a promise to reproduce the same pixels. The committed selected PNGs and
packing script allow deterministic technical reconstruction of the final
atlases with the locked Sharp tooling.

The first Jon sheet had a translucent cloudy backdrop. A dedicated generated
background-extraction pass fixed it before shipping. Lydia's first second
lean frame reversed her stance; a sheet-wide correction remained unsuitable,
so the first lean pose was extracted and used as the identity/pose reference
for a focused generated next-frame correction. That selected correction is
`lydia-lean-source.png`. The discarded generations are identified in the log
but are not delivered. Cropping, resizing, alpha-preserving atlas assembly and
WebP encoding are the only subsequent raster operations; the packing code
does not paint poses or replace the generated art with procedural symbols.

## Reproduction and review

From the repository root, after installing the media lane's locked tooling:

```sh
node ui/media/gravity-orchard/sources/characters/build-atlases.mjs
```

The script checks source alpha, eight unique frames per character, bounds,
padding, post-encoding decoding, opaque/transparent pixel coverage, and exact
atlas dimensions. It emits `fragment.json`, an integrity report in
`evidence/atlas-validation.json`, and a labeled contact sheet in
`evidence/character-states-80-128.png`. The labels belong to this review sheet,
not to the runtime images.

The generated full sheets and the final 80/128 px contact sheet were opened
and visually inspected. The inspection checked recognizable identities,
distinct state silhouettes, hands/feet/tails, clipped edges, genuine alpha,
and readable expressions at TV badge scale. This is rendered asset inspection,
not a physical TV/phone test or proof of final game integration.

## Explicit runtime boundary

Only these files from this lane are runtime art:

- `public/assets/gravity-orchard/characters/jon-atlas.webp`
- `public/assets/gravity-orchard/characters/lydia-atlas.webp`
- `public/assets/gravity-orchard/characters/lala-atlas.webp`

Everything in this `sources/characters/` directory is authoring/review material.
Exclude every source PNG, prompt, script, fragment and evidence file from the
public delivery allowlist. The parent media report and exact runtime inventory
are the integration authority.
