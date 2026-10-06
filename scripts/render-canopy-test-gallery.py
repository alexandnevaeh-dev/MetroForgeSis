from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import sys

report = Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parents[1] / 'reports/game-tests/20260930-ruined-canopy'
rooms = [('overworld', 'Rootbound Entrance'), ('canopy_clearing', 'Mosslight Clearing'),
         ('canopy_bridge', 'Overlook Bridge'), ('dungeon_000_r1', 'Shrine of the First Seed'),
         ('dungeon_000_r2', 'Vine-Choked Gate'), ('dungeon_000_r3', 'The Hollow Crown')]
gallery = Image.new('RGB', (1280, 1152), '#18232f')
draw = ImageDraw.Draw(gallery)
font = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 17)
for index, (filename, label) in enumerate(rooms):
    x, y = (index % 2) * 640, (index // 2) * 384
    screenshot = Image.open(report / (filename + '.png')).convert('RGB')
    gallery.paste(screenshot.resize((640, 360), Image.Resampling.NEAREST), (x, y + 24))
    draw.text((x + 10, y + 1), label + ' — native test capture', font=font, fill='#dae2b5')
gallery.save(report / 'room-tests.png')
print(report / 'room-tests.png')
