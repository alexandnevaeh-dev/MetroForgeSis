#!/usr/bin/env python3
"""Original 32px Foundry masonry atlas + ability-core pickup.

Hand-authored via Pillow. No third-party packs, paid APIs, or hosted models.
Atlas layout matches TILE_ATLAS (8×6). Brick period divides 32 so autotile
seams meet; structural edges live on edge/corner/beam/duct roles, not as a
frame around every wall cell.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

TS = 32
COLS, ROWS = 8, 6
# Brick 15 + mortar 1 = 16; row 7 + mortar 1 = 8. Both divide 32.
BW, BH = 15, 7
PX, PY = 16, 8

PAL = {
    "mortar": (38, 34, 32, 255),
    "iron_d": (44, 40, 38, 255),
    "iron": (70, 64, 60, 255),
    "iron_l": (96, 82, 70, 255),
    "lip": (126, 108, 84, 255),
    "lip_hi": (168, 130, 82, 255),
    "soot": (28, 26, 26, 255),
    "brass": (138, 104, 64, 255),
    "brass_l": (188, 146, 82, 255),
    "rust": (118, 60, 38, 255),
    "ember": (176, 76, 34, 255),
    "glass_d": (14, 40, 44, 255),
    "glass": (36, 108, 118, 255),
    "glass_l": (78, 168, 178, 255),
    "core": (54, 196, 186, 255),
    "outline": (16, 12, 12, 255),
    "cream": (232, 220, 168, 255),
}


class Tile:
    def __init__(self) -> None:
        self.im = Image.new("RGBA", (TS, TS), PAL["mortar"])
        self.px = self.im.load()

    def put(self, x: int, y: int, c: tuple[int, int, int, int]) -> None:
        if 0 <= x < TS and 0 <= y < TS:
            self.px[x, y] = c

    def fill(self, c: tuple[int, int, int, int]) -> None:
        for y in range(TS):
            for x in range(TS):
                self.px[x, y] = c

    def rect(self, x: int, y: int, w: int, h: int, c: tuple[int, int, int, int]) -> None:
        for j in range(h):
            for i in range(w):
                self.put(x + i, y + j, c)


def brick_field(t: Tile, ox: int = 0, oy: int = 0, stain: tuple[int, int, int, int] | None = None) -> None:
    """Running-bond that tiles. ox/oy shift the bond; stain is a third course, not noise."""
    t.fill(PAL["mortar"])
    for row in range(-1, 6):
        y = oy + row * PY
        shift = (PX // 2) if (row + 200) % 2 else 0
        for col in range(-1, 4):
            x = ox + col * PX + shift
            face = PAL["iron"]
            if stain is not None and (row + col) % 3 == 0:
                face = stain
            t.rect(x, y, BW, BH, face)
            t.rect(x, y, BW, 1, PAL["iron_l"])
            t.rect(x, y + BH - 1, BW, 1, PAL["iron_d"])


def ground() -> Image.Image:
    t = Tile()
    brick_field(t, 0, 4)
    t.rect(0, 0, TS, 4, PAL["lip"])
    t.rect(0, 0, TS, 1, PAL["lip_hi"])
    t.rect(0, 3, TS, 1, PAL["mortar"])
    return t.im


def wall() -> Image.Image:
    """Continuous masonry — no per-cell panel frame (that read as square wallpaper)."""
    t = Tile()
    brick_field(t, 0, 0)
    return t.im


def ceiling() -> Image.Image:
    t = Tile()
    brick_field(t, 0, 0, PAL["soot"])
    t.rect(0, TS - 5, TS, 5, PAL["iron_d"])
    t.rect(0, TS - 5, TS, 1, PAL["iron"])
    t.rect(0, TS - 1, TS, 1, PAL["soot"])
    return t.im


def platform() -> Image.Image:
    t = Tile()
    t.fill((0, 0, 0, 0))
    t.rect(0, 8, TS, 16, PAL["iron"])
    t.rect(0, 8, TS, 3, PAL["lip"])
    t.rect(0, 8, TS, 1, PAL["lip_hi"])
    t.rect(0, 22, TS, 2, PAL["iron_d"])
    t.rect(2, 12, TS - 4, 1, PAL["mortar"])
    return t.im


def left_edge() -> Image.Image:
    t = Tile()
    brick_field(t)
    t.rect(0, 0, 6, TS, PAL["soot"])
    t.rect(4, 0, 2, TS, PAL["iron_l"])
    t.rect(1, 0, 1, TS, PAL["brass"])
    t.rect(2, 0, 1, TS, PAL["brass_l"])
    return t.im


def right_edge() -> Image.Image:
    t = Tile()
    brick_field(t)
    t.rect(TS - 6, 0, 6, TS, PAL["soot"])
    t.rect(TS - 6, 0, 2, TS, PAL["iron_d"])
    t.rect(TS - 2, 0, 1, TS, PAL["brass"])
    t.rect(TS - 3, 0, 1, TS, PAL["brass_l"])
    return t.im


def top_edge() -> Image.Image:
    t = Tile()
    brick_field(t, 0, 4)
    t.rect(0, 0, TS, 6, PAL["lip"])
    t.rect(0, 0, TS, 2, PAL["lip_hi"])
    t.rect(0, 5, TS, 1, PAL["mortar"])
    return t.im


def bottom_edge() -> Image.Image:
    t = Tile()
    brick_field(t)
    t.rect(0, TS - 6, TS, 6, PAL["soot"])
    t.rect(0, TS - 7, TS, 1, PAL["iron_d"])
    return t.im


def corner(kind: str, inset: bool = False) -> Image.Image:
    t = Tile()
    brick_field(t)
    jam = 8 if inset else 6
    if "t" in kind:
        t.rect(0, 0, TS, jam, PAL["lip"])
        t.rect(0, 0, TS, 2, PAL["lip_hi"])
    if "b" in kind:
        t.rect(0, TS - jam, TS, jam, PAL["soot"])
    if "l" in kind:
        t.rect(0, 0, jam, TS, PAL["soot"])
        t.rect(jam - 2, 0, 2, TS, PAL["iron_l"])
        t.rect(1, 0, 1, TS, PAL["brass"])
    if "r" in kind:
        t.rect(TS - jam, 0, jam, TS, PAL["soot"])
        t.rect(TS - jam, 0, 2, TS, PAL["iron_d"])
        t.rect(TS - 2, 0, 1, TS, PAL["brass"])
    return t.im


def platform_end(left: bool) -> Image.Image:
    t = Tile()
    t.im.paste(platform(), (0, 0))
    if left:
        t.rect(0, 8, 4, 16, PAL["soot"])
        t.rect(3, 8, 2, 16, PAL["iron_l"])
    else:
        t.rect(TS - 4, 8, 4, 16, PAL["soot"])
        t.rect(TS - 6, 8, 2, 16, PAL["iron_d"])
    return t.im


def one_way() -> Image.Image:
    t = Tile()
    t.fill((0, 0, 0, 0))
    t.rect(0, 12, TS, 8, PAL["iron"])
    t.rect(0, 12, TS, 2, PAL["lip_hi"])
    t.rect(0, 18, TS, 2, PAL["iron_d"])
    return t.im


def hazard() -> Image.Image:
    t = Tile()
    t.fill(PAL["soot"])
    for x in range(2, TS, 6):
        t.rect(x, 4, 2, TS - 8, PAL["rust"])
        t.rect(x, 4, 1, TS - 8, PAL["ember"])
    t.rect(0, 2, TS, 2, PAL["iron"])
    t.rect(0, TS - 4, TS, 2, PAL["iron"])
    return t.im


def breakable() -> Image.Image:
    t = Tile()
    brick_field(t, 0, 0, PAL["iron_d"])
    for x, y in ((6, 8), (14, 16), (20, 10), (10, 22)):
        t.rect(x, y, 6, 1, PAL["soot"])
        t.rect(x + 2, y + 1, 1, 5, PAL["soot"])
    return t.im


def door() -> Image.Image:
    t = Tile()
    t.fill(PAL["iron_d"])
    t.rect(4, 2, TS - 8, TS - 4, PAL["soot"])
    t.rect(4, 2, TS - 8, 2, PAL["brass"])
    t.rect(4, 2, 2, TS - 4, PAL["brass"])
    t.rect(TS - 6, 2, 2, TS - 4, PAL["brass"])
    t.put(10, 18, PAL["brass_l"])
    return t.im


def beam() -> Image.Image:
    """I-beam that tiles horizontally (decor_a)."""
    t = Tile()
    t.fill((0, 0, 0, 0))
    t.rect(0, 9, TS, 14, PAL["iron"])
    t.rect(0, 9, TS, 3, PAL["iron_l"])
    t.rect(0, 20, TS, 3, PAL["iron_d"])
    t.rect(0, 14, TS, 2, PAL["soot"])
    for x in range(4, TS, 8):
        t.rect(x, 13, 2, 6, PAL["brass"])
    return t.im


def duct() -> Image.Image:
    """Round duct that tiles vertically (decor_b)."""
    t = Tile()
    t.fill((0, 0, 0, 0))
    t.rect(7, 0, TS - 14, TS, PAL["iron"])
    t.rect(9, 0, TS - 18, TS, PAL["iron_d"])
    t.rect(11, 0, 3, TS, PAL["iron_l"])
    t.rect(7, 0, 3, TS, PAL["brass"])
    t.rect(TS - 10, 0, 3, TS, PAL["brass"])
    t.rect(7, 14, TS - 14, 3, PAL["iron"])
    t.rect(8, 15, TS - 16, 1, PAL["brass_l"])
    return t.im


def stained(base: Image.Image, kind: str) -> Image.Image:
    t = Tile()
    t.im.paste(base, (0, 0))
    if kind == "wear":
        t.rect(8, 18, 12, 2, PAL["iron_d"])
        t.rect(18, 10, 8, 1, PAL["iron_d"])
    elif kind == "moss":
        t.rect(4, 22, 10, 2, PAL["rust"])
        t.rect(18, 8, 6, 2, PAL["rust"])
    elif kind == "crack":
        for i in range(10):
            t.put(12 + i // 2, 6 + i, PAL["soot"])
    elif kind == "rare":
        t.rect(10, 10, 4, 4, PAL["brass"])
        t.rect(11, 11, 2, 2, PAL["brass_l"])
    return t.im


def ability_core() -> Image.Image:
    """Forge core: brass housing, dark glass, cyan interior. Not a luminous white bar."""
    im = Image.new("RGBA", (TS, TS), (0, 0, 0, 0))
    px = im.load()

    def put(x: int, y: int, c: tuple[int, int, int, int]) -> None:
        if 0 <= x < TS and 0 <= y < TS:
            px[x, y] = c

    def rect(x: int, y: int, w: int, h: int, c: tuple[int, int, int, int]) -> None:
        for j in range(h):
            for i in range(w):
                put(x + i, y + j, c)

    # Caps
    rect(8, 2, 16, 4, PAL["brass_l"])
    rect(8, 26, 16, 4, PAL["brass"])
    rect(9, 3, 14, 2, PAL["lip_hi"])
    # Canister body
    rect(9, 5, 14, 22, PAL["brass"])
    rect(10, 6, 12, 20, PAL["iron"])
    rect(11, 7, 10, 18, PAL["iron_d"])
    # Recessed glass window with interior form
    rect(12, 8, 8, 16, PAL["glass_d"])
    rect(13, 9, 6, 14, PAL["glass"])
    rect(14, 11, 3, 8, PAL["core"])
    rect(15, 12, 1, 4, PAL["glass_l"])
    rect(16, 14, 1, 2, PAL["cream"])
    # Mid band
    rect(9, 14, 14, 3, PAL["brass"])
    rect(10, 15, 12, 1, PAL["brass_l"])
    # Cream rim baked in so lighting cannot erase the silhouette
    for y in range(2, 30):
        put(7, y, PAL["cream"])
        put(24, y, PAL["cream"])
    for x in range(8, 24):
        put(x, 2, PAL["cream"])
        put(x, 29, PAL["cream"])
    return im


def build_atlas() -> Image.Image:
    atlas = Image.new("RGBA", (COLS * TS, ROWS * TS), PAL["mortar"])
    g, w, c, p = ground(), wall(), ceiling(), platform()
    makers = {
        (0, 0): g,
        (1, 0): w,
        (2, 0): c,
        (3, 0): p,
        (4, 0): left_edge(),
        (5, 0): right_edge(),
        (6, 0): top_edge(),
        (7, 0): bottom_edge(),
        (0, 1): corner("tl"),
        (1, 1): corner("tr"),
        (2, 1): corner("bl"),
        (3, 1): corner("br"),
        (4, 1): corner("tl", inset=True),
        (5, 1): corner("tr", inset=True),
        (6, 1): corner("bl", inset=True),
        (7, 1): corner("br", inset=True),
        (0, 2): platform_end(True),
        (1, 2): platform_end(False),
        (2, 2): one_way(),
        (3, 2): hazard(),
        (4, 2): breakable(),
        (5, 2): door(),
        (6, 2): beam(),
        (7, 2): duct(),
        (0, 3): stained(g, "wear"),
        (1, 3): stained(w, "wear"),
        (2, 3): stained(c, "wear"),
        (3, 3): stained(p, "wear"),
        (4, 3): stained(g, "crack"),
        (5, 3): stained(w, "crack"),
        (0, 4): stained(g, "moss"),
        (1, 4): stained(w, "moss"),
        (2, 4): stained(c, "moss"),
        (3, 4): stained(p, "moss"),
        (4, 4): stained(g, "rare"),
        (5, 4): stained(w, "rare"),
    }
    for (col, row), im in makers.items():
        atlas.paste(im, (col * TS, row * TS))
    return atlas


def main() -> None:
    out = Path(__file__).resolve().parent
    atlas = build_atlas()
    atlas.save(out / "source.png")
    ability_core().save(out / "ability.png")
    print("wrote", out / "source.png", atlas.size)
    print("wrote", out / "ability.png")


if __name__ == "__main__":
    main()
