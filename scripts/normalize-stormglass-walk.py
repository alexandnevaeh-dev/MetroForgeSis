from __future__ import annotations
import json, sys
from pathlib import Path
from PIL import Image

source = Path(sys.argv[1])
target = Path(sys.argv[2])
frames = 8
image = Image.open(source).convert("RGBA")
segments = []
boxes = []
for index in range(frames):
    left = round(index * image.width / frames)
    right = round((index + 1) * image.width / frames)
    frame = image.crop((left, 0, right, image.height))
    alpha = frame.getchannel("A")
    box = alpha.point(lambda value: 255 if value >= 18 else 0).getbbox()
    if box is None:
        raise RuntimeError(f"frame {index} has no subject")
    segments.append(frame.crop(box))
    boxes.append(box)

max_width = max(frame.width for frame in segments)
max_height = max(frame.height for frame in segments)
scale = min(58 / max_height, 60 / max_width)
sheet = Image.new("RGBA", (64 * frames, 64), (0, 0, 0, 0))
normalized = []
for index, frame in enumerate(segments):
    size = (max(1, round(frame.width * scale)), max(1, round(frame.height * scale)))
    reduced = frame.resize(size, Image.Resampling.LANCZOS)
    # A compact fixed palette preserves readable clusters after the large concept reduction.
    alpha = reduced.getchannel("A")
    rgb = reduced.convert("RGB").quantize(colors=48, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGBA")
    rgb.putalpha(alpha.point(lambda value: 0 if value < 24 else value))
    x = index * 64 + (64 - size[0]) // 2
    y = 62 - size[1]
    sheet.alpha_composite(rgb, (x, y))
    normalized.append({"frame": index, "sourceBox": boxes[index], "size": size, "anchor": [32, 62]})

target.parent.mkdir(parents=True, exist_ok=True)
sheet.save(target)
target.with_suffix(".json").write_text(json.dumps({
    "source": str(source), "output": str(target), "frameSize": [64, 64], "frameCount": frames,
    "sharedScale": scale, "bottomCenterAnchor": [32, 62], "frames": normalized,
    "status": "candidate", "productionApproved": False,
}, indent=2), encoding="utf-8")
print(json.dumps({"output": str(target), "scale": scale, "frames": frames}))
