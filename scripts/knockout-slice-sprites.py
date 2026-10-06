"""Knock out pale/studio backgrounds on slice character sprites, then rebuild bob sheets."""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image

ROOT = Path(
    r"C:\Users\alexa\OneDrive\Documents\Metroidvania\Forged"
    r"\apps\cli\GeneratedGames\dusk-glass-lantern-keep\assets"
)
CHROMA = (255, 0, 255)
CHROMA_TOL = 48
FLOOD_TOL = 28


def dist(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def knockout(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    w, h = im.size
    pix = im.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = pix[x, y]
            if dist((r, g, b), CHROMA) <= CHROMA_TOL:
                pix[x, y] = (r, g, b, 0)
    visited = [[False] * w for _ in range(h)]
    for cx, cy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        r, g, b, a = pix[cx, cy]
        luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
        magentaish = dist((r, g, b), CHROMA) < 90
        if not (luma < 28 or luma > 210 or magentaish):
            continue
        origin = (r, g, b)
        q = [(cx, cy)]
        visited[cy][cx] = True
        if a != 0 and dist((r, g, b), origin) <= FLOOD_TOL:
            pix[cx, cy] = (r, g, b, 0)
        while q:
            x, y = q.pop()
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if nx < 0 or ny < 0 or nx >= w or ny >= h or visited[ny][nx]:
                    continue
                nr, ng, nb, na = pix[nx, ny]
                if na == 0:
                    visited[ny][nx] = True
                    continue
                if dist((nr, ng, nb), origin) > FLOOD_TOL:
                    continue
                visited[ny][nx] = True
                pix[nx, ny] = (nr, ng, nb, 0)
                q.append((nx, ny))
    return im


def sheet_from_still(still: Image.Image, frames: int, kind: str) -> Image.Image:
    still = still.convert("RGBA")
    fw, fh = still.size
    out = Image.new("RGBA", (fw * frames, fh), (0, 0, 0, 0))
    src = still.load()
    dst = out.load()
    for f in range(frames):
        for y in range(fh):
            for x in range(fw):
                if kind == "walk":
                    src_y = y - (f % 2)
                    if src_y < 0 or src_y >= fh:
                        continue
                    r, g, b, a = src[x, src_y]
                elif kind == "hurt":
                    r, g, b, a = src[x, y]
                    if a == 0:
                        continue
                    if f % 2 == 1:
                        r, g, b = 255, 90, 90
                elif kind == "attack":
                    max_shift = fw * 15 // 100
                    shift = (max_shift * (f + 1)) // frames
                    src_x = min(fw - 1, max(0, x - shift))
                    r, g, b, a = src[src_x, y]
                    if a == 0:
                        continue
                    if f == frames - 1:
                        r, g, b = min(255, r + 60), min(255, g + 60), min(255, b + 60)
                else:  # death
                    t = f / (frames - 1) if frames > 1 else 0
                    drop = round(t * fh * 0.25)
                    src_y = y + drop
                    if src_y >= fh:
                        continue
                    r, g, b, a = src[x, src_y]
                    if a == 0:
                        continue
                    gray = (r + g + b) / 3
                    r = round(r + (gray - r) * t)
                    g = round(g + (gray - g) * t)
                    b = round(b + (gray - b) * t)
                    a = round(a * (1 - t * 0.55))
                dst[f * fw + x, y] = (r, g, b, a)
    return out


def process_family(still_path: Path, frame_count: int) -> None:
    still = knockout(Image.open(still_path))
    still.save(still_path)
    print(f"knockout {still_path.relative_to(ROOT)} {still.size}")
    stem = still_path.stem
    parent = still_path.parent
    for kind, suffix, count in (
        ("walk", "_walk.png", frame_count),
        ("attack", "_attack.png", frame_count),
        ("hurt", "_hurt.png", frame_count),
        ("death", "_death.png", frame_count),
    ):
        dest = parent / f"{stem}{suffix}" if stem != "player" else parent / f"player{suffix}"
        if stem == "player":
            dest = parent / f"player{suffix}"
        else:
            dest = parent / f"{stem}{suffix}"
        if dest.exists() or True:
            sheet_from_still(still, count, kind).save(dest)
            print(f"  wrote {dest.name}")


def main() -> None:
    families = [
        (ROOT / "characters" / "player.png", 4),
        (ROOT / "npcs" / "npc_000.png", 4),
        (ROOT / "bosses" / "boss_final.png", 3),
    ]
    for enemy in sorted((ROOT / "enemies").glob("enemy_*.png")):
        if any(s in enemy.stem for s in ("_walk", "_attack", "_hurt", "_death", "_source")):
            continue
        families.append((enemy, 4))
    for still, count in families:
        if still.exists():
            process_family(still, count)
        else:
            print(f"missing {still}")


if __name__ == "__main__":
    main()
