# Sofa Arcade application icon

`source.svg` is a copy of the repository's `public/favicon.svg` at the WS5 base
commit. It retains the existing illustrated Lala mark; no external artwork or
font is required. `icon.png`, the three PNG sizes, and `icon.icns` are derived
application assets, rather than a new game-art source.

To reproduce with Inkscape and Pillow available:

```sh
inkscape desktop/icons/source.svg --export-type=png --export-filename=desktop/icons/icon.png --export-width=1024 --export-height=1024
python - <<'PY'
from pathlib import Path
from PIL import Image
root = Path('desktop/icons')
image = Image.open(root / 'icon.png').convert('RGBA')
image.save(root / 'icon.icns', sizes=[(16, 16), (32, 32), (64, 64), (128, 128), (256, 256), (512, 512), (1024, 1024)])
for size in (32, 128, 256):
    image.resize((size, size), Image.Resampling.LANCZOS).save(root / f'{size}x{size}.png')
PY
```

These tools are needed only when changing the icon, never when launching or
building from the checked-in icon files.
