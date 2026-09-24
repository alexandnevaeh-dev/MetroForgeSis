"""Measure texture wrap discontinuities; this is evidence, not an art approval gate."""
import argparse
import json
from pathlib import Path
from PIL import Image


def measure(path):
    with Image.open(path) as image:
        image = image.convert('RGBA')
        width, height = image.size
        if width < 2 or height < 2:
            raise ValueError('Texture must be at least 2x2 pixels')
        pixels = image.load()
        def distance(a, b):
            # Premultiplied RGB plus alpha avoids counting invisible RGB noise.
            return sum(abs(a[c] * a[3] / 255 - b[c] * b[3] / 255) for c in range(3)) / 3, abs(a[3] - b[3])
        def average(pairs):
            rgb = alpha = count = 0
            for a, b in pairs:
                dr, da = distance(a, b)
                rgb += dr
                alpha += da
                count += 1
            return {'rgbMeanAbsoluteDifference': rgb / count, 'alphaMeanAbsoluteDifference': alpha / count}
        return {
            'source': str(Path(path).resolve()), 'width': width, 'height': height,
            'horizontalWrap': average((pixels[0, y], pixels[width-1, y]) for y in range(height)),
            'verticalWrap': average((pixels[x, 0], pixels[x, height-1]) for x in range(width)),
            'horizontalInterior': average((pixels[x-1, y], pixels[x, y]) for y in range(height) for x in range(1, width)),
            'verticalInterior': average((pixels[x, y-1], pixels[x, y]) for y in range(1, height) for x in range(width)),
            'interpretation': '0-255 channel units. Wrap differences must be reviewed against interior contrast and a repeated visual preview. No automatic seamless or production-ready verdict.'
        }

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('image', type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    result = measure(args.image)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result))
