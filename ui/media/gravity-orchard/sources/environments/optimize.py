#!/usr/bin/env python3
"""Encode the retained image-generation originals and create review evidence.

Authoring only. Pillow is not a production/runtime dependency. Run from any cwd:
    python ui/media/gravity-orchard/sources/environments/optimize.py
The raw lossless WebP files preserve every source pixel from the generated PNGs.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageStat

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
DEST = ROOT / 'public/assets/gravity-orchard'
SIZE = (1280, 720)
NAMES = {
    'cover': ('Gravity Orchard', 'Jon and Lydia cooperate across two floating orchard trays while Lala prepares a picnic.'),
    'morning-delivery': ('Morning Delivery', 'Pale morning clouds with delicate orchard blossoms around a quiet center.'),
    'switchback-grove': ('Switchback Grove', 'Warm afternoon sage mist framed by small orchard branches.'),
    'moonlight-picnic': ("Lala’s Moonlight Picnic", 'Soft teal twilight clouds with a crescent moon and warm fireflies at the edges.'),
}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    (DEST / 'environments').mkdir(parents=True, exist_ok=True)
    (HERE / 'evidence').mkdir(exist_ok=True)
    assets, metrics = {}, []
    for identifier, (title, alt) in NAMES.items():
        source = HERE / 'raw' / f'{identifier}.webp'
        image = Image.open(source).convert('RGB')
        # The generated ratio differs from exact 16:9 by less than 0.06%; this
        # direct resize is deliberate and preserves the complete composition.
        resized = image.resize(SIZE, Image.Resampling.LANCZOS)
        relative = 'cover.webp' if identifier == 'cover' else f'environments/{identifier}.webp'
        destination = DEST / relative
        resized.save(destination, 'WEBP', quality=87 if identifier == 'cover' else 82, method=6)
        decoded = Image.open(destination)
        decoded.load()
        assert decoded.size == SIZE
        assert decoded.mode == 'RGB'
        key = 'cover' if identifier == 'cover' else f'environment-{identifier}'
        assets[key] = {
            'src': '/assets/gravity-orchard/' + relative,
            'width': SIZE[0],
            'height': SIZE[1],
            'kind': 'image',
            'alt': alt,
            'label': title,
            'layer': 'cover' if identifier == 'cover' else 'backdrop',
            'transparent': False,
        }
        center = decoded.crop((256, 144, 1024, 576)).convert('L')
        stat = ImageStat.Stat(center)
        metrics.append({
            'id': identifier,
            'runtimeFile': str(destination.relative_to(ROOT)),
            'bytes': destination.stat().st_size,
            'width': decoded.width,
            'height': decoded.height,
            'format': decoded.format,
            'mode': decoded.mode,
            'sha256': digest(destination),
            'rawSha256': digest(source),
            'alphaRequired': False,
            'decoded': True,
            'centerLumaMean': round(stat.mean[0], 3),
            'centerLumaStddev': round(stat.stddev[0], 3),
        })
    (HERE / 'fragment.json').write_text(json.dumps({'assets': assets}, indent=2) + '\n')
    (HERE / 'evidence' / 'image-checks.json').write_text(json.dumps({
        'runtimeSize': list(SIZE),
        'pixelChecks': metrics,
        'totalRuntimeBytes': sum(item['bytes'] for item in metrics),
        'visualInspection': 'See REVIEW.md; numerical checks do not replace rendered review.',
        'sourcesShipped': False,
    }, indent=2) + '\n')

    font = ImageFont.load_default(size=18)
    small = ImageFont.load_default(size=14)
    sheet = Image.new('RGB', (1328, 968), '#f5eddb')
    draw = ImageDraw.Draw(sheet)
    draw.text((24, 16), 'Gravity Orchard · finished illustration review', font=font, fill='#29483d')
    draw.text((24, 42), 'Runtime 1280 x 720 · two backgrounds shown at half scale; cover at collection-card scale', font=small, fill='#66563e')
    cover = Image.open(DEST / 'cover.webp').convert('RGB')
    sheet.paste(cover.resize((640, 360), Image.Resampling.LANCZOS), (24, 92))
    sheet.paste(cover.resize((320, 180), Image.Resampling.LANCZOS), (692, 92))
    draw.text((692, 286), '320 x 180 collection thumbnail', font=small, fill='#29483d')
    draw.text((24, 470), 'Morning Delivery', font=font, fill='#29483d')
    draw.text((692, 470), 'Switchback Grove', font=font, fill='#29483d')
    sheet.paste(Image.open(DEST / 'environments/morning-delivery.webp').resize((640, 360)), (24, 504))
    sheet.paste(Image.open(DEST / 'environments/switchback-grove.webp').resize((608, 342)), (692, 504))
    draw.text((24, 900), 'Night backdrop is inspected separately at 1280 x 720. Art contains no interface text.', font=small, fill='#66563e')
    sheet.save(HERE / 'evidence' / 'cover-and-day-review.webp', 'WEBP', quality=88, method=6)
    # Exact 720p copies are encoded runtime files, not oversized generated art.
    print(json.dumps({'assets': len(assets), 'runtimeBytes': sum(x['bytes'] for x in metrics), 'files': metrics}, indent=2))


if __name__ == '__main__':
    main()
