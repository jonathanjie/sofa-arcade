# Odd Laws Society collection cover

Created 20 November 2026 for the collection shelf and game detail page. The title stays in accessible HTML; the image contains no baked-in interface text.

- Final runtime asset: `public/assets/odd-laws-cover.webp`.
- Method: OpenAI built-in image generation (`image_gen.imagegen`), one original composition informed by the existing Odd Laws mouse-character and building artwork.
- Composition: Lala chairs a whimsical town council; Jon and Lydia present proposals; the town behind them represents Civic, Craft, Commerce and Culture.
- Canvas: 1586 × 992 pixels, opaque landscape artwork.
- Delivery: WebP quality 84, effort 6, 501,500 bytes. Conversion optimizes file delivery; it does not alter the composition.
- Placement: collection card and Odd Laws detail page only. Gameplay boards and phone controllers retain their working space.
- Inventory: declared in `scripts/runtime-files.mjs`, the LAN static allowlist, and `desktop/runtime-manifest.json`. The in-match transparent-cutout media manifest is unchanged.

## Generation prompt

```text
Use case: illustration-story.
Asset type: finished cover illustration for the original living-room strategy board game "The Odd Laws Society"; used as a wide main-menu game tile and a large detail-page hero. Landscape composition about 16:10, crisp at small sizes. Full-bleed opaque artwork, NO lettering, NO words, NO logos or watermarks; the application renders the title separately.

Primary request: a warm, delightful, premium illustrated storybook cover showing a tiny whimsical city council presided over by Lala, a friendly but slightly bossy female orange tabby cat, with two charming adult mouse citizens Jon and Lydia.
Characters: Lala central and largest, round face, orange-and-cream striped fur, cream muzzle/chest, green-and-burgundy civic sash with a little round gold clasp, one paw holding a wooden approval stamp over a parchment. Jon on the left is a small tan anthropomorphic mouse with tousled dark-brown hair, blue rectangular glasses, cream shirt, charcoal waistcoat with brass buttons and teal scarf. Lydia on the right is a small tan anthropomorphic mouse with long chestnut-brown hair tied low, round dark glasses, cream cardigan and coral scarf. They have warm expressive faces and are busy proposing plans, one showing a sealed envelope and one a rolled city blueprint. Keep both as mouse characters, not human people.

Scene: the three around a curving polished wooden council desk in the foreground, with a charming miniature walkable town rising behind: teal-roof civic library and tiny clock tower, terracotta-roof button workshop, ochre market awnings, plum theatre banners, leafy garden and cobbled lanes. The humorous council looks kindly serious, not chaotic. A few gold coins, tidy law cards with simple nonverbal pictograms, wax seals, and a tiny teacup reinforce city-building and secret council decisions. Cozy sunlight, warm honey highlights, parchment ivory, deep forest-teal shadows, muted coral and plum accents.
Style: rich hand-drawn storybook board-game illustration; confident soft brown ink outlines, carefully painted gouache/watercolour textures, sculptural readable forms, gentle shading, charming rounded proportions, detailed enough to feel collectible but clean enough to read on a television. Similar to a premium illustrated family strategy game box, not photorealistic, not a screenshot, not 3D plastic.
Composition: strong triangular grouping of Lala plus Jon and Lydia; all faces, hands, and key desk props stay inside the central 70% so the artwork survives a square-ish tile crop. Whimsical town forms a soft halo behind Lala. A framing arch of leaves and bunting in the top corners gives depth. Leave breathing room around faces and silhouettes, balanced visual hierarchy. Do not put a title banner or blank text panel in the art.
```

## Verification

The generated image was visually inspected before conversion. Browser acceptance checks decode the actual served cover on the collection card and detail page and capture both placements. Existing delivery/package checks verify the declared asset is available in the browser build, LAN archive and native runtime inventory. See the associated feedback PR for executed results.

