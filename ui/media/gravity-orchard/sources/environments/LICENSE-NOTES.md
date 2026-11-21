# Illustration provenance and license notes

These four illustrations were created for **Sofa Arcade / Gravity Orchard** at
the repository owner's request on 21 November 2026 (Asia/Singapore).

- **Origin:** OpenAI's built-in `image_gen.imagegen` tool, one generation per
  final asset. Exact prompts are in `generation-prompts.json`; generation IDs,
  source hashes and native dimensions are in `provenance.json`.
- **Identity references:** the repository's `public/assets/characters.png` and
  `public/assets/odd-laws-cover.webp` were inspected before writing the prompts.
  Jon and Lydia retain their mouse identities, glasses and scarves; Lala retains
  the orange tabby identity. These references were described in the prompts,
  rather than uploaded as image inputs. No external character art was used.
- **Source pixels:** `raw/*.webp` are lossless encodings of the generated PNGs.
  They preserve the original illustration pixels. The source prompts and raw
  inputs are authoring material; none belong in the runtime delivery inventory.
- **Final files:** the runtime WebP images are resized and encoded by
  `optimize.py`, with dimensions, byte counts and hashes in
  `evidence/image-checks.json`. No font or text is part of those runtime images.
- **No third-party stock illustration, external icon set, photographic texture
  pack, licensed commercial board-game imagery or downloadable font is included.**

This record documents provenance. It does not introduce a new repository
license, transfer the owner's distribution rights, or replace existing project
terms. The owner retains responsibility for choosing distribution terms.
Pillow is an authoring tool only, under its own license; it is not required by
the game runtime. The review sheet uses Pillow's bundled default font only in
authoring evidence, never in runtime artwork.
