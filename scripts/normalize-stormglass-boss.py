from __future__ import annotations

import json
import sys
from collections import deque
from pathlib import Path

from PIL import Image


source = Path(sys.argv[1])
target = Path(sys.argv[2])
frames = int(sys.argv[3]) if len(sys.argv) > 3 else 8
frame_size = 160
image = Image.open(source).convert("RGBA")
segments: list[Image.Image] = []
boxes = []


def remove_neighbor_bleed(frame: Image.Image) -> Image.Image:
    """Remove small alpha components entering from an adjacent generated cell."""
    alpha = frame.getchannel("A")
    solid = alpha.point(lambda value: 255 if value >= 18 else 0)
    pixels = solid.load()
    seen: set[tuple[int, int]] = set()
    components: list[list[tuple[int, int]]] = []
    for y in range(frame.height):
        for x in range(frame.width):
            if pixels[x, y] == 0 or (x, y) in seen:
                continue
            queue = deque([(x, y)])
            seen.add((x, y))
            component: list[tuple[int, int]] = []
            while queue:
                px, py = queue.popleft()
                component.append((px, py))
                for nx, ny in ((px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1)):
                    if 0 <= nx < frame.width and 0 <= ny < frame.height and pixels[nx, ny] and (nx, ny) not in seen:
                        seen.add((nx, ny))
                        queue.append((nx, ny))
            components.append(component)
    if not components:
        return frame
    largest = max(components, key=len)
    keep = set(largest)
    for component in components:
        touches_side = any(x <= 1 or x >= frame.width - 2 for x, _ in component)
        # Preserve detached spell/chain pieces inside the intended cell, but reject
        # partial neighboring figures entering through an equal-width segment edge.
        if not touches_side:
            keep.update(component)
    cleaned = frame.copy()
    cleaned_alpha = cleaned.getchannel("A")
    alpha_pixels = cleaned_alpha.load()
    for y in range(frame.height):
        for x in range(frame.width):
            if (x, y) not in keep:
                alpha_pixels[x, y] = 0
    cleaned.putalpha(cleaned_alpha)
    return cleaned


for index in range(frames):
    left = round(index * image.width / frames)
    right = round((index + 1) * image.width / frames)
    frame = remove_neighbor_bleed(image.crop((left, 0, right, image.height)))
    alpha = frame.getchannel("A")
    box = alpha.point(lambda value: 255 if value >= 18 else 0).getbbox()
    if box is None:
        raise RuntimeError(f"frame {index} has no subject")
    segments.append(frame.crop(box))
    boxes.append(box)

max_width = max(frame.width for frame in segments)
max_height = max(frame.height for frame in segments)
scale = min(154 / max_height, 156 / max_width)
sheet = Image.new("RGBA", (frame_size * frames, frame_size), (0, 0, 0, 0))
normalized = []
for index, frame in enumerate(segments):
    size = (max(1, round(frame.width * scale)), max(1, round(frame.height * scale)))
    reduced = frame.resize(size, Image.Resampling.LANCZOS)
    alpha = reduced.getchannel("A")
    rgb = reduced.convert("RGB").quantize(
        colors=96,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    ).convert("RGBA")
    rgb.putalpha(alpha.point(lambda value: 0 if value < 24 else value))
    x = index * frame_size + (frame_size - size[0]) // 2
    y = 156 - size[1]
    sheet.alpha_composite(rgb, (x, y))
    normalized.append({"frame": index, "sourceBox": boxes[index], "size": size, "anchor": [80, 156]})

target.parent.mkdir(parents=True, exist_ok=True)
sheet.save(target)
target.with_suffix(".json").write_text(json.dumps({
    "source": str(source),
    "output": str(target),
    "frameSize": [frame_size, frame_size],
    "frameCount": frames,
    "sharedScale": scale,
    "bottomCenterAnchor": [80, 156],
    "frames": normalized,
    "status": "candidate",
    "productionApproved": False,
}, indent=2), encoding="utf-8")
print(json.dumps({"output": str(target), "scale": scale, "frames": frames}))
