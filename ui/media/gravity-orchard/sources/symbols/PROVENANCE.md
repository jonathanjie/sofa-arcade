# Original orchard symbols and terrain

All fruit, basket states, terrain tiles, gate/gust/compost cues and outcome symbols in this directory's fragment are original deterministic SVG drawings authored for Jon's Sofa Arcade in November 2026. No third-party icons, clip art, fonts, textures or traced photographs are embedded. Source: `build.mjs`.

The four identities follow the public PRD: round apple with a single leaf; oval plum with split leaves and a seam; tapered pear with belly dots; five-point starfruit with a cut-face inset. Each basket repeats the exact fruit emblem. Acceptance has a check, rejection a cross and outward arrow, and full has a closed striped mouth plus three dots. They remain distinct in grayscale.

The artwork may be used, modified and distributed with Sofa Arcade. No attribution or license payment is required by this original authored contribution. Existing collection assets are visual references only and are not copied into these SVGs. Generated raster and character provenance is recorded in the other authoring subdirectories.

`build.mjs` reproduces the delivered SVG bytes and fragment without network access or installed dependencies. It is an authoring script, not a runtime import.

Terrain is decorative material, never collision authority. Clip each tray, bridge, hedge and bumper to GO1's corresponding public geometry and render the authoritative geometry outline above it. Do not infer game routes or collision sizes from an image's pixels. Gust art faces +x and is rotated to the public gust vector; reduced motion leaves the directional arrow visible.
