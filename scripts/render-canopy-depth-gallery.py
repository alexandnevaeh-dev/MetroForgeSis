"""Arrange unmodified native captures for a same-camera, same-renderer comparison."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import sys
report = Path(sys.argv[1]).resolve()
font = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 17)
gallery = Image.new('RGB', (1280, 768), '#18232f')
draw = ImageDraw.Draw(gallery)
for row, room in enumerate(['canopy_bridge', 'canopy_gardens']):
    for column, stage in enumerate(['before', 'after']):
        x, y = column * 640, row * 384
        capture = Image.open(report / stage / 'captures' / (room + '.png')).convert('RGB')
        gallery.paste(capture.resize((640, 360), Image.Resampling.NEAREST), (x, y + 24))
        draw.text((x + 10, y + 1), stage.title() + ' - ' + room.replace('canopy_', '').title() + ' - native capture', font=font, fill='#dae2b5')
gallery.save(report / 'terrain-comparison.png')
print(report / 'terrain-comparison.png')
