"""Diagnostic contact sheets from unmodified native game captures."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import sys
report = Path(sys.argv[1]).resolve()
font = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 17)
for output, rooms in [
 ('expanded-world-tests.png', [('hd2d/canopy_hamlet','Lastlight Hamlet'),('hd2d/canopy_archive','The Silent Bell Archive'),('hd2d/canopy_observatory','Emberwatch Observatory'),('hd2d/canopy_gardens','The Drowned Gardens'),('hd2d/canopy_cistern','The Root Cistern'),('hd2d/canopy_moonwell','Moonwell Sanctuary')]),
 ('spell-story-tests.png', [('spells/story_living_words-dialogue','Iri: real story dialogue'),('spells/seedflare-cast','Seedflare: twelve casting poses'),('spells/rootward-protection','Rootward: actual damage reduction'),('spells/moonwell-bloomstep','Bloomstep: collision-safe dash'),('spells/testimony-inventory','Readable testimony inventory'),('hd2d/boss-warning','Boss: committed aiming warning')])]:
    gallery = Image.new('RGB', (1280,1152),'#18232f')
    draw = ImageDraw.Draw(gallery)
    for i,(file,label) in enumerate(rooms):
        x,y = i%2*640,i//2*384
        capture = Image.open(report/'captures'/(file+'.png')).convert('RGB')
        gallery.paste(capture.resize((640,360),Image.Resampling.NEAREST),(x,y+24))
        draw.text((x+10,y+1),label+' - native capture',font=font,fill='#dae2b5')
    gallery.save(report/output)
    print(report/output)
