#!/usr/bin/env python3
"""Original 64px Spore Scout + 32px fungal underdark atlas (hand-authored Pillow).

Luminous fungal underdark — NOT industrial foundry. Soft organic silhouettes,
cyan/magenta bioluminescence, lichen basalt. No rivets, no cyan robot courier.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
SIZE = 64
TS = 32
COLS, ROWS = 8, 6

# Keep lower 38% free of near-white / hot-red / magenta stitch (sprite_foot_clean).
PAL = {
    "outline": (18, 14, 28, 255),
    "void": (22, 18, 36, 255),
    "basalt_d": (36, 32, 52, 255),
    "basalt": (54, 48, 72, 255),
    "basalt_l": (78, 70, 98, 255),
    "lichen_d": (42, 68, 62, 255),
    "lichen": (64, 110, 92, 255),
    "lichen_l": (96, 148, 118, 255),
    "myc_d": (70, 78, 88, 255),
    "myc": (120, 132, 128, 255),
    "myc_l": (168, 178, 162, 255),
    "cloak_d": (40, 34, 58, 255),
    "cloak": (62, 52, 86, 255),
    "cloak_l": (92, 78, 120, 255),
    "hood_d": (48, 42, 70, 255),
    "hood": (74, 64, 102, 255),
    "skin": (156, 118, 98, 255),
    "skin_d": (118, 86, 72, 255),
    "boot": (34, 30, 44, 255),
    "boot_l": (52, 46, 64, 255),
    "glow_d": (28, 90, 110, 255),
    "glow": (52, 180, 186, 255),
    "glow_l": (120, 220, 210, 255),
    "mag_d": (98, 42, 88, 255),
    "mag": (176, 72, 140, 255),
    "mag_l": (220, 120, 180, 255),
    "staff": (72, 60, 48, 255),
    "staff_l": (110, 90, 64, 255),
    "enemy_d": (48, 36, 58, 255),
    "enemy": (78, 58, 88, 255),
    "enemy_l": (118, 88, 120, 255),
}


class Canvas:
    def __init__(self, w: int = SIZE, h: int = SIZE) -> None:
        self.w, self.h = w, h
        self.im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        self.px = self.im.load()

    def put(self, x: int, y: int, c: tuple[int, int, int, int]) -> None:
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[x, y] = c

    def rect(self, x: int, y: int, w: int, h: int, c: tuple[int, int, int, int]) -> None:
        for j in range(h):
            for i in range(w):
                self.put(x + i, y + j, c)

    def ellipse(self, cx: int, cy: int, rx: int, ry: int, c: tuple[int, int, int, int]) -> None:
        for y in range(cy - ry, cy + ry + 1):
            for x in range(cx - rx, cx + rx + 1):
                if rx == 0 or ry == 0:
                    continue
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0:
                    self.put(x, y, c)

    def outline_pass(self) -> None:
        src = self.im.copy().load()
        for y in range(self.h):
            for x in range(self.w):
                if src[x, y][3] < 128:
                    continue
                for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    nx, ny = x + dx, y + dy
                    if not (0 <= nx < self.w and 0 <= ny < self.h) or src[nx, ny][3] < 40:
                        self.put(nx, ny, PAL["outline"])


def paint_scout(npc: bool = False) -> Image.Image:
    c = Canvas()
    # Legs first (clear separation so blitArticulatedSheet can stride without cloak smear).
    c.rect(23, 46, 7, 14, PAL["boot"])
    c.rect(35, 46, 7, 14, PAL["boot"])
    c.rect(23, 56, 7, 5, PAL["boot_l"])
    c.rect(35, 56, 7, 5, PAL["boot_l"])
    # Compact torso cloak — stops above boots so hip/leg bands stay readable.
    c.ellipse(31, 34, 11, 12, PAL["cloak_d"])
    c.ellipse(33, 32, 10, 11, PAL["cloak"])
    c.ellipse(34, 30, 7, 8, PAL["cloak_l"])
    # Arms (slightly lighter than cloak so opposition reads in walk sheets)
    c.rect(17, 28, 6, 16, PAL["cloak_l"])
    c.rect(42, 28, 6, 16, PAL["cloak_l"])
    c.rect(17, 40, 6, 4, PAL["cloak"])
    c.rect(42, 40, 6, 4, PAL["cloak"])
    # Hood + face
    c.ellipse(32, 18, 11, 10, PAL["hood_d"])
    c.ellipse(32, 18, 9, 8, PAL["hood"])
    c.ellipse(32, 20, 6, 5, PAL["skin"])
    c.rect(28, 19, 3, 2, PAL["skin_d"])
    c.rect(34, 19, 3, 2, PAL["skin_d"])
    # Spore lantern staff (right)
    c.rect(48, 12, 3, 38, PAL["staff"])
    c.rect(49, 12, 1, 38, PAL["staff_l"])
    c.ellipse(49, 10, 6, 6, PAL["glow_d"])
    c.ellipse(49, 10, 4, 4, PAL["glow"])
    c.ellipse(49, 9, 2, 2, PAL["glow_l"])
    if npc:
        # Tender: softer magenta accents, no combat staff tip
        c.ellipse(49, 10, 5, 5, PAL["mag"])
        c.ellipse(22, 38, 4, 4, PAL["lichen_l"])
    else:
        # Scout shoulder lichen + mycelium sash
        c.ellipse(22, 26, 5, 4, PAL["lichen"])
        c.ellipse(22, 25, 3, 2, PAL["lichen_l"])
        c.rect(26, 36, 14, 3, PAL["myc"])
        c.rect(28, 35, 10, 1, PAL["myc_l"])
    c.outline_pass()
    return c.im


def paint_enemy(kind: int) -> Image.Image:
    c = Canvas()
    if kind == 0:  # spore mite crawler
        c.ellipse(32, 42, 18, 10, PAL["enemy_d"])
        c.ellipse(32, 40, 16, 8, PAL["enemy"])
        c.ellipse(46, 36, 7, 6, PAL["enemy_l"])
        c.ellipse(48, 34, 3, 3, PAL["glow"])
        for x in (16, 26, 36, 44):
            c.rect(x, 48, 3, 10, PAL["boot"])
    elif kind == 1:  # glowcap beetle
        c.ellipse(32, 36, 14, 14, PAL["enemy"])
        c.ellipse(32, 28, 12, 8, PAL["mag_d"])
        c.ellipse(32, 26, 10, 6, PAL["mag"])
        c.ellipse(32, 24, 5, 3, PAL["mag_l"])
        c.rect(20, 44, 4, 12, PAL["boot"])
        c.rect(40, 44, 4, 12, PAL["boot"])
    elif kind == 2:  # myconid guardian
        c.ellipse(32, 18, 14, 8, PAL["lichen"])
        c.ellipse(32, 16, 12, 6, PAL["lichen_l"])
        c.rect(26, 24, 12, 22, PAL["myc"])
        c.rect(24, 46, 6, 12, PAL["boot"])
        c.rect(34, 46, 6, 12, PAL["boot"])
        c.ellipse(32, 34, 4, 4, PAL["glow"])
    else:  # floating spore wisp
        c.ellipse(32, 28, 10, 12, PAL["glow_d"])
        c.ellipse(32, 26, 8, 10, PAL["glow"])
        c.ellipse(32, 24, 4, 5, PAL["glow_l"])
        c.ellipse(22, 40, 4, 6, PAL["mag"])
        c.ellipse(42, 40, 4, 6, PAL["mag"])
    c.outline_pass()
    return c.im


def paint_boss() -> Image.Image:
    c = Canvas()
    c.ellipse(32, 36, 22, 18, PAL["enemy_d"])
    c.ellipse(32, 32, 18, 16, PAL["enemy"])
    c.ellipse(32, 14, 16, 10, PAL["mag_d"])
    c.ellipse(32, 12, 14, 8, PAL["mag"])
    c.ellipse(32, 10, 8, 4, PAL["mag_l"])
    c.ellipse(18, 28, 6, 6, PAL["glow"])
    c.ellipse(46, 28, 6, 6, PAL["glow"])
    c.rect(20, 48, 8, 12, PAL["boot"])
    c.rect(36, 48, 8, 12, PAL["boot"])
    c.outline_pass()
    return c.im


class Tile:
    def __init__(self) -> None:
        self.im = Image.new("RGBA", (TS, TS), PAL["basalt_d"])
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

    def ellipse(self, cx: int, cy: int, rx: int, ry: int, c: tuple[int, int, int, int]) -> None:
        for y in range(cy - ry, cy + ry + 1):
            for x in range(cx - rx, cx + rx + 1):
                if rx == 0 or ry == 0:
                    continue
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0:
                    self.put(x, y, c)

    def speckles(self, color: tuple[int, int, int, int], n: int = 18, seed: int = 1) -> None:
        s = seed * 1103515245 + 12345
        for _ in range(n):
            s = (s * 1103515245 + 12345) & 0x7FFFFFFF
            x = s % TS
            s = (s * 1103515245 + 12345) & 0x7FFFFFFF
            y = s % TS
            self.put(x, y, color)


def basalt_field(t: Tile, glow: bool = False) -> None:
    t.fill(PAL["basalt_d"])
    for row in range(0, TS, 8):
        shift = 4 if (row // 8) % 2 else 0
        for col in range(-1, 5):
            x = col * 10 + shift
            y = row
            t.rect(x, y, 9, 7, PAL["basalt"])
            t.rect(x, y, 9, 1, PAL["basalt_l"])
            t.rect(x, y + 6, 9, 1, PAL["basalt_d"])
    t.speckles(PAL["lichen"], 14, 3)
    if glow:
        t.speckles(PAL["glow"], 8, 9)


def ground() -> Image.Image:
    t = Tile()
    basalt_field(t, glow=True)
    t.rect(0, 24, TS, 8, PAL["lichen_d"])
    t.rect(0, 26, TS, 4, PAL["lichen"])
    t.speckles(PAL["glow_l"], 6, 11)
    return t.im


def wall() -> Image.Image:
    t = Tile()
    basalt_field(t)
    for y in range(4, TS, 10):
        t.rect(14, y, 4, 8, PAL["myc_d"])
        t.rect(15, y + 1, 2, 6, PAL["myc"])
    t.speckles(PAL["glow"], 5, 7)
    return t.im


def ceiling() -> Image.Image:
    t = Tile()
    basalt_field(t)
    t.rect(0, 0, TS, 10, PAL["basalt_d"])
    for x in (6, 16, 26):
        t.rect(x, 8, 2, 10, PAL["myc"])
        t.ellipse(x + 1, 18, 3, 3, PAL["glow"])
    return t.im


def platform() -> Image.Image:
    t = Tile()
    t.fill((0, 0, 0, 0))
    t.rect(0, 10, TS, 10, PAL["myc_d"])
    t.rect(0, 10, TS, 3, PAL["lichen_l"])
    t.rect(0, 13, TS, 5, PAL["myc"])
    t.speckles(PAL["glow"], 5, 4)
    return t.im


def edge(side: str) -> Image.Image:
    t = Tile()
    basalt_field(t)
    if side == "left":
        t.rect(0, 0, 6, TS, PAL["lichen"])
    elif side == "right":
        t.rect(TS - 6, 0, 6, TS, PAL["lichen"])
    elif side == "top":
        t.rect(0, 0, TS, 6, PAL["lichen"])
    else:
        t.rect(0, TS - 6, TS, 6, PAL["lichen"])
    return t.im


def corner(kind: str) -> Image.Image:
    t = Tile()
    basalt_field(t)
    if "tl" in kind:
        t.rect(0, 0, 10, 10, PAL["lichen"])
    if "tr" in kind:
        t.rect(TS - 10, 0, 10, 10, PAL["lichen"])
    if "bl" in kind:
        t.rect(0, TS - 10, 10, 10, PAL["lichen"])
    if "br" in kind:
        t.rect(TS - 10, TS - 10, 10, 10, PAL["lichen"])
    return t.im


def hazard() -> Image.Image:
    t = Tile()
    t.fill(PAL["void"])
    t.ellipse(16, 18, 10, 8, PAL["mag_d"])
    t.ellipse(16, 16, 7, 6, PAL["mag"])
    t.speckles(PAL["glow_l"], 8, 2)
    return t.im


def door() -> Image.Image:
    t = Tile()
    basalt_field(t)
    t.rect(8, 4, 16, 28, PAL["cloak_d"])
    t.rect(10, 6, 12, 24, PAL["cloak"])
    t.ellipse(16, 16, 3, 3, PAL["glow"])
    return t.im


def decor(kind: int) -> Image.Image:
    t = Tile()
    t.fill((0, 0, 0, 0))
    if kind == 0:
        t.ellipse(16, 22, 8, 6, PAL["lichen"])
        t.ellipse(16, 18, 6, 4, PAL["glow"])
    else:
        t.rect(14, 8, 4, 20, PAL["myc"])
        t.ellipse(16, 8, 5, 5, PAL["mag"])
    return t.im


ROLES = [
    ("ground", ground),
    ("wall", wall),
    ("ceiling", ceiling),
    ("platform", platform),
    ("left_edge", lambda: edge("left")),
    ("right_edge", lambda: edge("right")),
    ("top_edge", lambda: edge("top")),
    ("bottom_edge", lambda: edge("bottom")),
    ("outside_tl", lambda: corner("tl")),
    ("outside_tr", lambda: corner("tr")),
    ("outside_bl", lambda: corner("bl")),
    ("outside_br", lambda: corner("br")),
    ("inside_tl", lambda: corner("tl")),
    ("inside_tr", lambda: corner("tr")),
    ("inside_bl", lambda: corner("bl")),
    ("inside_br", lambda: corner("br")),
    ("platform_left", platform),
    ("platform_right", platform),
    ("one_way", platform),
    ("hazard", hazard),
    ("breakable", wall),
    ("door", door),
    ("decor_a", lambda: decor(0)),
    ("decor_b", lambda: decor(1)),
    ("ground_wear", ground),
    ("wall_wear", wall),
    ("ceiling_wear", ceiling),
    ("platform_wear", platform),
    ("ground_crack", ground),
    ("wall_crack", wall),
    ("ground_moss", ground),
    ("wall_moss", wall),
    ("ceiling_moss", ceiling),
    ("platform_moss", platform),
    ("ground_rare", ground),
    ("wall_rare", wall),
]


def paint_atlas(variant: str = "galleries") -> Image.Image:
    atlas = Image.new("RGBA", (COLS * TS, ROWS * TS), (0, 0, 0, 0))
    # Variant tint via glow density on first cells only — structure stays organic.
    for idx, (_name, fn) in enumerate(ROLES):
        col, row = idx % COLS, idx // COLS
        tile = fn()
        if variant == "terraces" and idx % 3 == 0:
            px = tile.load()
            for y in range(TS):
                for x in range(TS):
                    r, g, b, a = px[x, y]
                    if a > 200 and g > r:
                        px[x, y] = (min(255, r + 18), g, min(255, b + 12), a)
        if variant == "depths" and idx % 2 == 0:
            px = tile.load()
            for y in range(TS):
                for x in range(TS):
                    r, g, b, a = px[x, y]
                    if a > 200:
                        px[x, y] = (max(0, r - 8), max(0, g - 6), min(255, b + 16), a)
        atlas.paste(tile, (col * TS, row * TS), tile)
    return atlas


def paint_prop(kind: int) -> Image.Image:
    c = Canvas(48, 48)
    if kind == 0:
        c.ellipse(24, 30, 10, 8, PAL["lichen"])
        c.ellipse(24, 22, 8, 8, PAL["glow"])
    elif kind == 1:
        c.rect(22, 10, 4, 28, PAL["myc"])
        c.ellipse(24, 10, 8, 6, PAL["mag"])
    elif kind == 2:
        c.ellipse(24, 28, 14, 10, PAL["basalt"])
        c.ellipse(24, 24, 6, 6, PAL["glow_l"])
    else:
        c.rect(10, 20, 28, 16, PAL["cloak"])
        c.ellipse(24, 18, 8, 6, PAL["lichen_l"])
    c.outline_pass()
    return c.im


def paint_arch(kind: int) -> Image.Image:
    c = Canvas(64, 96)
    c.rect(8, 16, 12, 80, PAL["basalt"])
    c.rect(44, 16, 12, 80, PAL["basalt"])
    c.ellipse(32, 28, 28, 18, PAL["basalt_l"])
    if kind % 2 == 0:
        c.ellipse(32, 20, 10, 8, PAL["glow"])
    else:
        for x in (18, 32, 46):
            c.rect(x, 40, 3, 40, PAL["myc"])
    return c.im


def paint_bg(layer: str) -> Image.Image:
    w, h = 256, 144
    im = Image.new("RGBA", (w, h), PAL["void"])
    px = im.load()
    for y in range(h):
        for x in range(w):
            t = y / h
            if layer == "far":
                r = int(22 + t * 18)
                g = int(16 + t * 22)
                b = int(40 + t * 40)
            elif layer == "mid":
                r = int(28 + t * 20)
                g = int(24 + t * 30)
                b = int(48 + t * 36)
            else:
                r = int(34 + t * 16)
                g = int(40 + t * 28)
                b = int(52 + t * 24)
            px[x, y] = (r, g, b, 255)
    # Soft glow orbs
    c = Canvas(w, h)
    c.im = im
    c.px = px
    for cx, cy, rad, col in (
        (40, 40, 14, PAL["glow_d"]),
        (180, 50, 18, PAL["mag_d"]),
        (120, 70, 10, PAL["glow"]),
    ):
        if layer != "far" or rad > 12:
            c.ellipse(cx, cy, rad, rad // 2 + 4, col)
    return im


def paint_ability() -> Image.Image:
    c = Canvas(32, 32)
    c.ellipse(16, 16, 12, 12, PAL["basalt"])
    c.ellipse(16, 16, 8, 8, PAL["glow"])
    c.ellipse(16, 16, 4, 4, PAL["glow_l"])
    c.outline_pass()
    return c.im


def save(im: Image.Image, name: str) -> None:
    path = ROOT / name
    im.save(path)
    print(f"wrote {path.name} {im.size}")


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    save(paint_scout(False), "player.png")
    save(paint_scout(True), "npc_000.png")
    save(paint_ability(), "ability.png")
    save(paint_atlas("galleries"), "source.png")
    save(paint_atlas("galleries"), "galleries_source.png")
    save(paint_atlas("terraces"), "terraces_source.png")
    save(paint_atlas("depths"), "depths_source.png")
    for i in range(4):
        save(paint_enemy(i), f"enemy_{i:03d}.png")
    save(paint_boss(), "boss_final.png")
    for stem in ("galleries", "terraces", "depths"):
        for i in range(4):
            save(paint_prop(i), f"{stem}_prop_{i}.png")
            save(paint_arch(i), f"{stem}_arch_{i}.png")
        save(paint_bg("far"), f"{stem}_far.png")
        save(paint_bg("mid"), f"{stem}_mid.png")
        save(paint_bg("near"), f"{stem}_near.png")
        save(paint_bg("near"), f"{stem}_foreground.png")
    save(paint_bg("mid"), "phase_barrier.png")
    # Provenance
    (ROOT / "PROVENANCE.md").write_text(
        "# Spore Scout authored kit\n\nOriginal MetroForge pixel construction via Pillow. "
        "Luminous fungal underdark — not foundry/courier industrial art.\n",
        encoding="utf-8",
    )
    (ROOT / "LICENSE").write_text("Original-MetroForge (commercial OK)\n", encoding="utf-8")


if __name__ == "__main__":
    main()
