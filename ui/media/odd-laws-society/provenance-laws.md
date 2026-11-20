# Law emblem provenance

## Authorship and medium

All twelve law emblems are **original SVG illustrations**, authored directly as
new path geometry for Odd Laws Society on 20 November 2026. They are final assets,
not raster-generation placeholders. SVG is used here for precise, legible symbols
at small card sizes. No commercial board-game artwork, external icon pack, tracing,
font outline, or remotely linked resource is present.

The inspected style references were the current workstream's original guild and
prop contact sheet at
`public/assets/odd-laws-society/sources/icons-props/contact.png` and its editable
`build-icons.mjs`. The emblems retain that kit's warm umber outline (`#46392f`),
parchment (`#fff4d9`), amber, coral, teal and plum. The principal stroke is 10
source pixels on a 256-pixel canvas, with rounded caps and joins. The shared
medallion border has at least 12 pixels of transparent canvas around it.

Law names appear only in SVG accessibility metadata (`title`/`desc`) and the
external preview labels. No name, price, rules, score number, font, or visible
text is baked into a shipped emblem. Color is reinforced with distinct objects
and silhouettes. The design meaning follows the exact v0.2 law catalog in
`docs/games/odd-laws-society.md`; numerical effects remain interface text.

## Inventory and visual meanings

| Exact ID | Distinct symbol | Meaning |
| --- | --- | --- |
| `small-shop-supremacy` | Crowned amber shop | Commerce building subsidy |
| `workshop-week` | Calendar and coral hammer | Craft building subsidy |
| `public-grants` | Grant coin above an open teal book | Civic building subsidy |
| `everything-is-art` | Plum palette and broad brush | Culture building subsidy |
| `open-tender` | Unrolled plan and open doorway | Open bidding for the first construction |
| `honest-wages` | Open hand receiving a sprout coin | Payment for Work |
| `shop-local` | Heart over two neighborhood shops | Recognition of established Commerce |
| `industrial-pride` | Gear, hammer and pride ribbon | Recognition of established Craft |
| `public-service-day` | Book-bearing civic pennant and laurel | Recognition of established Civic |
| `mandatory-applause` | Clapping paws and golden rays | Recognition of established Culture |
| `fashionable-streets` | Three distinct facades on a lit horizontal street | Qualifying street completion |
| `diversity-parade` | Four differently shaped pennants | Representation of all four guilds |

The coin's sprout and the shop's striped awning deliberately echo the same
project's guild/prop vocabulary. They are not copied from a third-party source.
The four parade pennants have rounded, pointed, rectangular and forked ends, so
hue is not their only differentiator. The paired Commerce and Craft laws have
separate compositions (crown versus neighborhood heart; calendar versus gear
ribbon) to avoid being confused at small sizes.

## Editable sources and evidence

- Shipped vectors: `public/assets/odd-laws-society/laws/<id>.svg`.
- Manifest fragment: `ui/media/odd-laws-society/fragments/laws.json`.
- Reproducible source: `public/assets/odd-laws-society/sources/laws/build-laws.mjs`.
- Inspected contact sheet: `public/assets/odd-laws-society/sources/laws/contact-80-32.png`.
- Decoded dimensions, alpha bounds, byte counts and hashes:
  `public/assets/odd-laws-society/sources/laws/validation.json`.

Generate the vectors and fragment with Node alone:

```sh
node public/assets/odd-laws-society/sources/laws/build-laws.mjs
```

Add `--contact` to render the development contact sheet and its evidence using
`sharp` from the already isolated WS4 dependency subtree:

```sh
node public/assets/odd-laws-society/sources/laws/build-laws.mjs --contact
```

All twelve images decoded at **256 × 256**, retained transparent exterior pixels,
and had zero visible pixels touching the canvas edge. The contact sheet was
visually inspected at **80 px and 32 px** per emblem. Each icon has a distinct
readable central object; detailed line work naturally simplifies at 32 px. UI
labels and alt text remain necessary for the precise law names and effects.

The source, contact sheet and validation evidence are development material.
Only the twelve referenced SVGs belong in the runtime pack. This document adds
no third-party license requirement and does not change repository-wide licensing.
