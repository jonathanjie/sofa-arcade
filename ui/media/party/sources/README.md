# Party game covers

Six original painted covers were supplied as separate PNG files for the Party shelf.
The lossless WebP files in `raw/` retain the supplied 1672 × 941 pixel images.
They contain no game titles or interface labels; the shelf renders those in HTML.

## Conversion

The Gravity Orchard art uses Pillow for authoring; Pillow was not installed on
the conversion host. These covers use the installed `cwebp` (1.6.0).

Run the script from any working directory to regenerate the optimized source
files from the retained artwork:

```sh
bash ui/media/party/sources/optimize.sh
```

To import new PNGs before regeneration, add the path to their directory as an
argument. Name each PNG with its game ID. The original lossless WebP preserves
every pixel; ImageMagick's absolute-error comparison reported zero changed
pixels for all six imports.

The script resizes the full image without removing any of its composition.
The original aspect ratio differs from 16:9 by less than 0.06%.

| File | Dimensions | WebP quality |
| --- | --- | --- |
| `cover.webp` | 1280 × 720 | 87 |
| `cover-560.webp` | 560 × 315 | 84 |

Both use compression method 6. The twelve files together occupy about 1.9 MiB.
All files decoded at their target dimensions; the compact covers were visually
inspected together to check faces and composition.

## Delivery

Optimized files are under `ui/media/party/covers/<game-id>/`.
`server/party-delivery.mjs` declares the exact paths for local play and the
browser preparation script, which copies them into `public/assets/party/`.
The same authored files go into the portable ZIP and the desktop runtime.
The `sources/` directory is not part of any runtime inventory.
