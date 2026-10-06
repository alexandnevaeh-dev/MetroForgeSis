"""Normalize the approved Stormglass Gothic enemy lineup into 64 px runtime strips.

The source stays preserved beside the normalized files.  Connected-component masks isolate
overlapping weapons and wings without baking neighbouring characters into a frame.  Motion is
deliberately restrained: the authored anatomy remains intact while idle breathing, locomotion,
attack anticipation, hit recoil and death settle produce stable animation contracts.
"""
from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path
from PIL import Image

FRAME = 64
ALPHA_THRESHOLD = 24
FAMILIES = ("000", "004", "008", "012", "016")
COUNTS = {"idle": 6, "walk": 8, "attack": 8, "hurt": 3, "death": 8}


def components(image: Image.Image) -> list[tuple[int, tuple[int, int, int, int], set[int]]]:
    alpha = image.getchannel("A")
    width, height = image.size
    pixels = alpha.load()
    seen = bytearray(width * height)
    found: list[tuple[int, tuple[int, int, int, int], set[int]]] = []
    for y in range(height):
        for x in range(width):
            start = y * width + x
            if seen[start] or pixels[x, y] < ALPHA_THRESHOLD:
                continue
            queue = [(x, y)]
            seen[start] = 1
            indices: set[int] = set()
            min_x = max_x = x
            min_y = max_y = y
            while queue:
                px, py = queue.pop()
                index = py * width + px
                indices.add(index)
                min_x, max_x = min(min_x, px), max(max_x, px)
                min_y, max_y = min(min_y, py), max(max_y, py)
                for nx, ny in ((px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1)):
                    if 0 <= nx < width and 0 <= ny < height:
                        ni = ny * width + nx
                        if not seen[ni] and pixels[nx, ny] >= ALPHA_THRESHOLD:
                            seen[ni] = 1
                            queue.append((nx, ny))
            if len(indices) > 100:
                found.append((len(indices), (min_x, min_y, max_x + 1, max_y + 1), indices))
    return found


def isolate_family(source: Image.Image) -> list[Image.Image]:
    width, height = source.size
    comps = components(source)
    bodies = sorted((entry for entry in comps if entry[0] > 50_000), key=lambda entry: entry[1][0])
    if len(bodies) != 5:
        raise RuntimeError(f"expected five enemy bodies, found {len(bodies)}")
    results: list[Image.Image] = []
    for family_index, (_, bounds, indices) in enumerate(bodies):
        selected = set(indices)
        # The Acolyte's three orbiting shards are intentionally detached from its robe.
        if family_index == 3:
            for size, shard_bounds, shard_indices in comps:
                sx0, sy0, sx1, _ = shard_bounds
                if 3_000 < size < 12_000 and 1320 <= sx0 <= 1665 and sy0 < 370:
                    selected.update(shard_indices)
                    bounds = (min(bounds[0], sx0), min(bounds[1], sy0), max(bounds[2], sx1), bounds[3])
        masked = Image.new("RGBA", source.size, (0, 0, 0, 0))
        src_pixels = source.load()
        dst_pixels = masked.load()
        for index in selected:
            x, y = index % width, index // width
            dst_pixels[x, y] = src_pixels[x, y]
        crop = masked.crop(bounds)
        results.append(crop)
    return results


def fitted(actor: Image.Image, family_index: int) -> Image.Image:
    max_width = 60 if family_index in (2, 4) else 56
    max_height = 57 if family_index != 4 else 43
    scale = min(max_width / actor.width, max_height / actor.height)
    return actor.resize((max(1, round(actor.width * scale)), max(1, round(actor.height * scale))), Image.Resampling.LANCZOS)


def transform(actor: Image.Image, action: str, frame: int, count: int, family_index: int) -> Image.Image:
    t = frame / max(1, count - 1)
    phase = frame / count * 6.283185307
    import math
    bob = 0
    x_shift = 0
    angle = 0.0
    scale_x = 1.0
    scale_y = 1.0
    if action == "idle":
        bob = round(math.sin(phase) * (2 if family_index == 2 else 1))
        scale_y = 1.0 + math.sin(phase) * 0.012
    elif action == "walk":
        bob = -abs(round(math.sin(phase) * 2))
        x_shift = round(math.sin(phase) * 2)
        angle = math.sin(phase) * (2.8 if family_index == 4 else 1.4)
    elif action == "attack":
        arc = math.sin(t * math.pi)
        x_shift = round(arc * (10 if family_index in (1, 4) else 7))
        scale_x = 1.0 + arc * 0.07
        scale_y = 1.0 - arc * 0.035
        angle = -arc * (4 if family_index in (0, 3) else 2)
    elif action == "hurt":
        x_shift = (-5, 3, 0)[frame]
        angle = (5.0, -2.0, 0.0)[frame]
    elif action == "death":
        angle = t * (78 if family_index != 2 else 52)
        x_shift = round(t * 7)
        bob = round(t * 13)
        scale_y = 1.0 - t * 0.22

    resized = actor.resize(
        (max(1, round(actor.width * scale_x)), max(1, round(actor.height * scale_y))),
        Image.Resampling.BICUBIC,
    )
    rotated = resized.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
    frame_image = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    x = (FRAME - rotated.width) // 2 + x_shift
    y = FRAME - rotated.height - 3 + bob
    frame_image.alpha_composite(rotated, (x, y))
    return frame_image


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    args.destination.mkdir(parents=True, exist_ok=True)
    source = Image.open(args.source).convert("RGBA")
    source.save(args.destination / "stormglass-gothic-enemy-lineup-v1.png")
    for family_index, (enemy_id, actor) in enumerate(zip(FAMILIES, isolate_family(source))):
        base = fitted(actor, family_index)
        base.save(args.destination / f"enemy_{enemy_id}_source.png")
        for action, count in COUNTS.items():
            strip = Image.new("RGBA", (FRAME * count, FRAME), (0, 0, 0, 0))
            for frame in range(count):
                strip.alpha_composite(transform(base, action, frame, count, family_index), (FRAME * frame, 0))
            strip.save(args.destination / f"enemy_{enemy_id}_{action}.png")
        transform(base, "idle", 0, COUNTS["idle"], family_index).save(
            args.destination / f"enemy_{enemy_id}.png"
        )


if __name__ == "__main__":
    main()
