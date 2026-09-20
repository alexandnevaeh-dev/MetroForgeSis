#!/usr/bin/env python3
"""Quench-tunnel and cooling-yard 32px atlases + far/mid plates.

Same 8x6 TILE_ATLAS roles as foundry-masonry. Distinct materials, not a hue shift.
"""
from __future__ import annotations
from pathlib import Path
from PIL import Image

TS, COLS, ROWS = 32, 8, 6

QUENCH = {
    "mortar": (22, 32, 36, 255),
    "iron_d": (28, 40, 46, 255),
    "iron": (48, 68, 74, 255),
    "iron_l": (78, 108, 112, 255),
    "lip": (90, 140, 148, 255),
    "lip_hi": (140, 200, 196, 255),
    "soot": (14, 18, 22, 255),
    "brass": (64, 110, 118, 255),
    "brass_l": (120, 188, 186, 255),
    "rust": (48, 86, 92, 255),
    "ember": (36, 160, 170, 255),
    "glass_d": (12, 48, 58, 255),
    "glass": (28, 120, 132, 255),
    "glass_l": (90, 210, 214, 255),
    "outline": (8, 12, 16, 255),
}
COOL = {
    "mortar": (36, 34, 28, 255),
    "iron_d": (42, 40, 32, 255),
    "iron": (72, 68, 48, 255),
    "iron_l": (110, 102, 68, 255),
    "lip": (92, 108, 62, 255),
    "lip_hi": (148, 160, 84, 255),
    "soot": (22, 24, 18, 255),
    "brass": (118, 92, 48, 255),
    "brass_l": (168, 132, 64, 255),
    "rust": (86, 92, 40, 255),
    "ember": (64, 120, 52, 255),
    "glass_d": (28, 48, 28, 255),
    "glass": (52, 96, 48, 255),
    "glass_l": (96, 148, 72, 255),
    "outline": (14, 16, 12, 255),
}


class Tile:
    def __init__(self, pal):
        self.pal = pal
        self.im = Image.new("RGBA", (TS, TS), pal["mortar"])
        self.px = self.im.load()

    def put(self, x, y, c):
        if 0 <= x < TS and 0 <= y < TS:
            self.px[x, y] = c

    def fill(self, c):
        for y in range(TS):
            for x in range(TS):
                self.px[x, y] = c

    def rect(self, x, y, w, h, c):
        for j in range(h):
            for i in range(w):
                self.put(x + i, y + j, c)


def plate_field(t: Tile, stain=None, grate=False):
    t.fill(t.pal["mortar"])
    for y in range(0, TS, 8):
        shift = 4 if (y // 8) % 2 else 0
        for x in range(-4, TS, 16):
            xx = x + shift
            face = t.pal["iron"]
            if stain is not None and ((x + y) // 8) % 3 == 0:
                face = stain
            t.rect(xx, y, 14, 7, face)
            t.rect(xx, y, 14, 1, t.pal["iron_l"])
            t.rect(xx, y + 6, 14, 1, t.pal["iron_d"])
    if grate:
        for x in range(2, TS, 6):
            t.rect(x, 0, 1, TS, t.pal["soot"])


def atlas_for(pal, kind: str) -> Image.Image:
    def T():
        return Tile(pal)

    def ground():
        t = T()
        plate_field(t, grate=(kind == "quench"))
        t.rect(0, 0, TS, 4, pal["lip"])
        t.rect(0, 0, TS, 1, pal["lip_hi"])
        if kind == "quench":
            t.rect(0, 14, TS, 5, pal["glass_d"])
            t.rect(0, 15, TS, 3, pal["glass"])
            t.rect(0, 16, TS, 1, pal["glass_l"])
        else:
            t.rect(4, 18, 8, 3, pal["ember"])
            t.rect(18, 10, 6, 4, pal["glass"])
            t.rect(20, 22, 9, 2, pal["rust"])
        return t.im

    def wall():
        t = T()
        plate_field(t, pal["rust"] if kind == "cool" else pal["glass_d"])
        if kind == "quench":
            t.rect(12, 0, 8, TS, pal["iron_d"])
            t.rect(14, 0, 4, TS, pal["glass"])
            t.rect(15, 4, 2, 8, pal["glass_l"])
        else:
            for y in range(2, TS, 6):
                t.rect(0, y, TS, 2, pal["soot"])
            t.rect(8, 8, 4, 12, pal["ember"])
        return t.im

    def ceiling():
        t = T()
        plate_field(t, pal["soot"])
        t.rect(0, TS - 5, TS, 5, pal["iron_d"])
        return t.im

    def platform():
        t = T()
        t.fill((0, 0, 0, 0))
        t.rect(0, 8, TS, 16, pal["iron"])
        t.rect(0, 8, TS, 3, pal["lip"])
        t.rect(0, 22, TS, 2, pal["iron_d"])
        if kind == "quench":
            t.rect(4, 14, TS - 8, 3, pal["glass"])
        else:
            t.rect(6, 14, 6, 6, pal["ember"])
        return t.im

    def edge(left=True):
        t = T()
        plate_field(t)
        if left:
            t.rect(0, 0, 6, TS, pal["soot"])
            t.rect(2, 0, 2, TS, pal["brass_l"])
        else:
            t.rect(TS - 6, 0, 6, TS, pal["soot"])
            t.rect(TS - 4, 0, 2, TS, pal["brass"])
        return t.im

    def top_edge():
        t = T()
        plate_field(t)
        t.rect(0, 0, TS, 6, pal["lip"])
        return t.im

    def bottom_edge():
        t = T()
        plate_field(t)
        t.rect(0, TS - 6, TS, 6, pal["soot"])
        return t.im

    def corner(kind_c, inset=False):
        t = T()
        plate_field(t)
        jam = 8 if inset else 6
        if "t" in kind_c:
            t.rect(0, 0, TS, jam, pal["lip"])
        if "b" in kind_c:
            t.rect(0, TS - jam, TS, jam, pal["soot"])
        if "l" in kind_c:
            t.rect(0, 0, jam, TS, pal["soot"])
        if "r" in kind_c:
            t.rect(TS - jam, 0, jam, TS, pal["soot"])
        return t.im

    def platform_end(left):
        t = T()
        t.im.paste(platform(), (0, 0))
        if left:
            t.rect(0, 8, 4, 16, pal["soot"])
        else:
            t.rect(TS - 4, 8, 4, 16, pal["soot"])
        return t.im

    def one_way():
        t = T()
        t.fill((0, 0, 0, 0))
        t.rect(0, 12, TS, 8, pal["iron"])
        t.rect(0, 12, TS, 2, pal["lip_hi"])
        return t.im

    def hazard():
        t = T()
        t.fill(pal["soot"])
        for x in range(2, TS, 6):
            t.rect(x, 4, 2, TS - 8, pal["ember"])
            t.rect(x, 4, 1, TS - 8, pal["glass_l"])
        t.rect(0, 2, TS, 2, pal["iron"])
        t.rect(0, TS - 4, TS, 2, pal["iron"])
        return t.im

    def breakable():
        t = T()
        plate_field(t, pal["iron_d"])
        t.rect(8, 10, 12, 2, pal["soot"])
        t.rect(14, 10, 1, 10, pal["soot"])
        return t.im

    def door():
        t = T()
        t.fill(pal["iron_d"])
        t.rect(6, 4, TS - 12, TS - 8, pal["soot"])
        t.rect(6, 4, TS - 12, 2, pal["brass"])
        return t.im

    def beam():
        t = T()
        t.fill((0, 0, 0, 0))
        t.rect(0, 10, TS, 12, pal["iron"])
        t.rect(0, 10, TS, 3, pal["iron_l"])
        t.rect(0, 19, TS, 3, pal["iron_d"])
        if kind == "quench":
            t.rect(0, 14, TS, 4, pal["glass"])
        return t.im

    def duct():
        t = T()
        t.fill((0, 0, 0, 0))
        t.rect(8, 0, TS - 16, TS, pal["iron"])
        t.rect(10, 0, TS - 20, TS, pal["iron_d"])
        t.rect(12, 0, 4, TS, pal["glass"] if kind == "quench" else pal["ember"])
        t.rect(8, 14, TS - 16, 3, pal["brass"])
        return t.im

    def stained(base, how):
        t = T()
        t.im.paste(base, (0, 0))
        if how == "wear":
            t.rect(8, 18, 12, 2, pal["iron_d"])
        elif how == "moss":
            t.rect(4, 22, 10, 2, pal["ember"])
        elif how == "crack":
            for i in range(10):
                t.put(12 + i // 2, 6 + i, pal["soot"])
        else:
            t.rect(10, 10, 4, 4, pal["brass_l"])
        return t.im

    g, w, c, p = ground(), wall(), ceiling(), platform()
    makers = {
        (0, 0): g, (1, 0): w, (2, 0): c, (3, 0): p,
        (4, 0): edge(True), (5, 0): edge(False), (6, 0): top_edge(), (7, 0): bottom_edge(),
        (0, 1): corner("tl"), (1, 1): corner("tr"), (2, 1): corner("bl"), (3, 1): corner("br"),
        (4, 1): corner("tl", True), (5, 1): corner("tr", True), (6, 1): corner("bl", True), (7, 1): corner("br", True),
        (0, 2): platform_end(True), (1, 2): platform_end(False), (2, 2): one_way(), (3, 2): hazard(),
        (4, 2): breakable(), (5, 2): door(), (6, 2): beam(), (7, 2): duct(),
        (0, 3): stained(g, "wear"), (1, 3): stained(w, "wear"), (2, 3): stained(c, "wear"), (3, 3): stained(p, "wear"),
        (4, 3): stained(g, "crack"), (5, 3): stained(w, "crack"),
        (0, 4): stained(g, "moss"), (1, 4): stained(w, "moss"), (2, 4): stained(c, "moss"), (3, 4): stained(p, "moss"),
        (4, 4): stained(g, "rare"), (5, 4): stained(w, "rare"),
    }
    atlas = Image.new("RGBA", (COLS * TS, ROWS * TS), pal["mortar"])
    for (col, row), im in makers.items():
        atlas.paste(im, (col * TS, row * TS))
    return atlas


def _rect(px, w, h, x, y, ww, hh, c):
    for j in range(hh):
        for i in range(ww):
            xx, yy = x + i, y + j
            if 0 <= xx < w and 0 <= yy < h:
                px[xx, yy] = c


def _disc(px, w, h, cx, cy, r, c):
    rr = r * r
    for j in range(-r, r + 1):
        for i in range(-r, r + 1):
            if i * i + j * j <= rr:
                xx, yy = cx + i, cy + j
                if 0 <= xx < w and 0 <= yy < h:
                    px[xx, yy] = c


def plate(kind: str, w=960, h=540) -> Image.Image:
    if kind == "quench":
        bg = (8, 18, 22, 255)
        im = Image.new("RGBA", (w, h), bg)
        px = im.load()
        R = lambda *a: _rect(px, w, h, *a)
        D = lambda *a: _disc(px, w, h, *a)
        # Receding tunnel mouth, not a flat hall.
        R(0, 0, w, 70, (6, 12, 16, 255))
        R(180, 70, 600, 230, (12, 28, 34, 255))
        R(240, 90, 480, 200, (10, 22, 28, 255))
        R(320, 110, 320, 170, (8, 16, 22, 255))
        # Coolant flood
        R(0, 310, w, 230, (14, 38, 46, 255))
        R(0, 304, w, 8, (48, 128, 138, 255))
        R(0, 308, w, 3, (90, 190, 196, 255))
        # Asymmetric tanks
        tanks = [(28, 96, 54, 220), (110, 140, 40, 176), (700, 88, 70, 228), (810, 160, 46, 156), (880, 120, 36, 196)]
        for x, y, tw, th in tanks:
            R(x, y, tw, th, (34, 52, 58, 255))
            R(x + 6, y + 18, tw - 12, int(th * 0.42), (24, 120, 132, 255))
            R(x + 10, y + 24, tw - 20, 8, (80, 200, 204, 255))
            R(x + tw // 2 - 4, 48, 8, y - 48, (46, 66, 72, 255))
        # Fractured glass-metal conduits, including a broken diagonal
        R(40, 200, 860, 14, (36, 56, 62, 255))
        R(44, 204, 852, 6, (28, 140, 150, 255))
        R(200, 214, 8, 96, (36, 56, 62, 255))
        R(202, 214, 4, 96, (90, 210, 214, 255))
        for i in range(18):
            R(430 + i * 3, 188 + i * 2, 10, 4, (28, 140, 150, 255) if i % 3 else (12, 28, 34, 255))
        # Valve assemblies
        for cx, cy, r in [(160, 248, 22), (560, 236, 28), (760, 252, 18)]:
            D(cx, cy, r, (48, 70, 76, 255))
            D(cx, cy, r - 6, (22, 36, 40, 255))
            R(cx - r, cy - 3, r * 2, 6, (120, 188, 186, 255))
            R(cx - 3, cy - r, 6, r * 2, (120, 188, 186, 255))
            D(cx, cy, 4, (90, 210, 214, 255))
        # Drowned mold equipment at the waterline
        beds = [70, 150, 240, 390, 470, 610, 690, 840]
        for i, x in enumerate(beds):
            R(x, 430 + (i % 3) * 8, 52, 20, (32, 50, 54, 255))
            R(x + 6, 434 + (i % 3) * 8, 40, 10, (20, 86, 96, 255))
            if i % 2:
                R(x + 16, 418 + (i % 3) * 8, 8, 16, (46, 66, 72, 255))
        # Mineral crust
        for x, y in [(96, 180), (300, 160), (640, 148), (900, 200)]:
            D(x, y, 7, (70, 140, 150, 255))
            D(x + 6, y + 4, 4, (140, 200, 196, 255))
        # Steam
        for x in range(0, w, 5):
            for y in range(240, 318):
                if (x * 11 + y * 5) % 37 == 0:
                    px[x, y] = (180, 220, 220, 150)
        return im

    bg = (16, 20, 12, 255)
    im = Image.new("RGBA", (w, h), bg)
    px = im.load()
    R = lambda *a: _rect(px, w, h, *a)
    D = lambda *a: _disc(px, w, h, *a)
    # Open-yard dusk + shed mass, not a forest wall.
    R(0, 0, w, 90, (12, 16, 10, 255))
    R(620, 90, 280, 170, (28, 32, 22, 255))
    R(640, 110, 80, 90, (10, 14, 10, 255))
    R(760, 130, 70, 70, (10, 14, 10, 255))
    R(0, 408, w, 132, (30, 34, 22, 255))
    R(0, 398, w, 12, (48, 44, 30, 255))
    # Abandoned cooling racks: posts + fins, some buckled/collapsed.
    racks = [
        (40, 210, 0), (118, 168, 1), (210, 240, 0), (290, 120, 2),
        (390, 200, 0), (470, 150, 1), (560, 230, 0), (820, 180, 0), (900, 130, 2),
    ]
    iron = (62, 58, 40, 255)
    iron_l = (92, 84, 52, 255)
    vine = (48, 96, 44, 255)
    leaf = (72, 128, 56, 255)
    for x, hgt, state in racks:
        top = 408 - hgt
        lean = 8 if state == 1 else 0
        if state == 2:
            # Collapsed: short posts and fallen fins.
            R(x, 380, 8, 28, iron)
            R(x + 26, 388, 8, 20, iron)
            for k in range(3):
                R(x - 4 + k * 2, 372 + k * 6, 40, 4, iron_l)
            D(x + 18, 400, 6, vine)
            continue
        R(x + lean, top, 8, hgt, iron)
        R(x + 28 + lean, top, 8, hgt, iron)
        for r in range(10, hgt, 16):
            R(x - 6 + lean, 408 - r, 48, 5, iron_l)
        R(x - 8 + lean, top - 8, 52, 8, (98, 86, 50, 255))
        if state == 1:
            # Vegetation shaped around the rack, not a green stripe tree.
            R(x + 34, top + 20, 3, hgt - 40, vine)
            for ly in range(top + 28, 400, 22):
                D(x + 38, ly, 5, leaf)
                D(x + 42, ly + 8, 4, vine)
        else:
            R(x + 4, top + 40, 3, 24, vine)
    # Root-split machinery block
    R(650, 300, 90, 98, (70, 64, 44, 255))
    R(662, 312, 66, 50, (28, 48, 28, 255))
    R(690, 300, 6, 98, (14, 16, 12, 255))
    R(688, 250, 4, 60, vine)
    D(700, 268, 8, leaf)
    D(678, 256, 6, leaf)
    # Buckled conduit stack
    R(500, 250, 22, 158, (78, 72, 48, 255))
    R(508, 220, 8, 40, (78, 72, 48, 255))
    R(492, 270, 38, 8, iron_l)
    R(496, 330, 30, 8, iron_l)
    return im


def main():
    out = Path(__file__).resolve().parent
    q = atlas_for(QUENCH, "quench")
    c = atlas_for(COOL, "cool")
    q.save(out / "quench_source.png")
    c.save(out / "cooling_source.png")
    qfar = plate("quench")
    cfar = plate("cool")
    qfar.save(out / "quench_far.png")
    cfar.save(out / "cooling_far.png")
    qfar.crop((0, 80, 960, 400)).resize((960, 320), Image.NEAREST).save(out / "quench_mid.png")
    cfar.crop((0, 120, 960, 440)).resize((960, 320), Image.NEAREST).save(out / "cooling_mid.png")
    print("wrote biomes", out)


if __name__ == "__main__":
    main()
