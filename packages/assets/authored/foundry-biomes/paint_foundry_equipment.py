#!/usr/bin/env python3
"""Foundry architecture, floor props, foreground plates, and phase-barrier.

48×112 wall equipment (not stacked cylinders). 32×32 floor props. 640×360
foregrounds that stay mostly transparent so combat stays readable.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

IRON_D = (34, 30, 28, 255)
IRON = (58, 50, 44, 255)
IRON_L = (92, 78, 62, 255)
BRASS = (148, 108, 58, 255)
BRASS_L = (196, 150, 78, 255)
SLAG = (204, 108, 52, 255)
GLASS = (36, 140, 148, 255)
GLASS_L = (110, 214, 214, 255)
COOL = (28, 120, 132, 255)
VINE = (48, 96, 44, 255)
LEAF = (78, 132, 56, 255)
SOOT = (16, 14, 14, 255)


class C:
    def __init__(self, w: int, h: int):
        self.w, self.h = w, h
        self.im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        self.px = self.im.load()
        self.d = ImageDraw.Draw(self.im)

    def put(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[x, y] = c

    def rect(self, x, y, w, h, c):
        for j in range(h):
            for i in range(w):
                self.put(x + i, y + j, c)

    def disc(self, cx, cy, r, c):
        rr = r * r
        for j in range(-r, r + 1):
            for i in range(-r, r + 1):
                if i * i + j * j <= rr:
                    self.put(cx + i, cy + j, c)

    def ell(self, x, y, w, h, c):
        self.d.ellipse([x, y, x + w - 1, y + h - 1], fill=c)


def pouring_arch(i: int) -> C:
    c = C(48, 112)
    if i == 0:
        # Frozen ladle on a gantry post.
        c.rect(20, 0, 8, 36, IRON)
        c.rect(8, 32, 32, 6, IRON_L)
        c.rect(22, 38, 4, 18, IRON_D)
        c.ell(8, 52, 32, 28, IRON)
        c.ell(12, 58, 24, 18, IRON_D)
        c.ell(16, 62, 16, 10, SLAG)
        c.rect(18, 80, 12, 8, BRASS)
        c.rect(16, 104, 16, 8, IRON)
    elif i == 1:
        # Crucible stack with pour lip.
        c.rect(10, 28, 28, 76, IRON)
        c.rect(12, 32, 24, 64, IRON_D)
        c.ell(8, 18, 32, 22, IRON_L)
        c.ell(12, 22, 24, 14, SLAG)
        c.rect(36, 28, 10, 6, BRASS)
        c.rect(8, 100, 32, 12, IRON)
        c.put(18, 40, BRASS_L)
    elif i == 2:
        # Vertical ingot-mold rack.
        c.rect(6, 8, 8, 96, IRON)
        c.rect(34, 8, 8, 96, IRON)
        for y, filled in ((16, True), (40, True), (64, False), (88, True)):
            c.rect(14, y, 20, 18, IRON_L)
            c.rect(16, y + 3, 16, 12, IRON_D if filled else SOOT)
            if filled:
                c.rect(18, y + 5, 12, 8, GLASS)
        c.rect(4, 104, 40, 8, IRON_D)
    else:
        # Overhead I-beam with hanging clamp.
        c.rect(0, 4, 48, 10, IRON)
        c.rect(0, 4, 48, 3, BRASS_L)
        c.rect(22, 14, 4, 40, IRON_D)
        c.rect(16, 52, 16, 8, BRASS)
        c.rect(14, 60, 6, 22, IRON)
        c.rect(28, 60, 6, 22, IRON)
        c.rect(12, 80, 10, 6, BRASS)
        c.rect(26, 80, 10, 6, BRASS)
        c.rect(8, 104, 32, 8, IRON_D)
    return c


def quench_arch(i: int) -> C:
    c = C(48, 112)
    if i == 0:
        # Quench tank with coolant line.
        c.rect(6, 40, 36, 64, IRON)
        c.rect(10, 48, 28, 48, IRON_D)
        c.rect(10, 72, 28, 22, COOL)
        c.rect(10, 72, 28, 3, GLASS_L)
        c.rect(4, 36, 40, 8, IRON_L)
        c.rect(20, 8, 8, 28, IRON)
        c.disc(24, 20, 8, BRASS)
        c.rect(16, 19, 16, 2, BRASS_L)
    elif i == 1:
        # Valve riser.
        c.rect(20, 8, 8, 96, IRON)
        c.rect(16, 40, 16, 10, COOL)
        c.disc(24, 28, 12, BRASS)
        c.disc(24, 28, 5, IRON_D)
        c.rect(12, 27, 24, 3, BRASS_L)
        c.rect(23, 16, 3, 24, BRASS_L)
        c.rect(12, 100, 24, 12, IRON_D)
    elif i == 2:
        # Burst coolant main.
        c.rect(18, 0, 12, 112, IRON)
        c.rect(22, 0, 4, 112, COOL)
        c.rect(8, 36, 32, 10, IRON_L)
        c.rect(4, 70, 20, 8, IRON)
        c.rect(28, 86, 16, 8, IRON)
        c.disc(12, 74, 6, GLASS)
        c.disc(36, 90, 5, GLASS_L)
        c.rect(8, 104, 32, 8, IRON_D)
    else:
        # Drowned catwalk post.
        c.rect(8, 16, 6, 88, IRON_D)
        c.rect(34, 28, 6, 76, IRON_D)
        c.rect(8, 40, 32, 6, IRON_L)
        c.rect(8, 70, 32, 6, IRON)
        c.rect(0, 100, 48, 4, COOL)
        c.rect(14, 8, 20, 8, BRASS)
    return c


def cooling_arch(i: int) -> C:
    c = C(48, 112)
    if i == 0:
        # Finned cooling rack.
        c.rect(6, 8, 6, 96, IRON)
        c.rect(36, 8, 6, 96, IRON)
        for y in range(16, 100, 14):
            c.rect(2, y, 44, 5, IRON_L)
            c.rect(10, y - 3, 3, 10, IRON)
            c.rect(35, y - 3, 3, 10, IRON)
        c.rect(4, 4, 40, 8, BRASS)
        c.rect(38, 28, 3, 40, VINE)
        c.disc(42, 36, 3, LEAF)
        c.rect(4, 104, 40, 8, IRON_D)
    elif i == 1:
        # Stored conduit U-forms, not bricks.
        c.rect(8, 96, 32, 16, IRON_D)
        for k, x in enumerate((6, 18, 30)):
            y = 20 + (k % 2) * 8
            c.rect(x, y, 10, 76, IRON)
            c.rect(x + 2, y + 6, 6, 64, GLASS if k != 1 else IRON_D)
            c.rect(x, y, 10, 6, BRASS)
            if k == 2:
                c.rect(x + 8, y + 20, 3, 36, VINE)
    elif i == 2:
        # Finned chimney / stack.
        c.rect(14, 8, 20, 96, IRON)
        c.rect(18, 12, 12, 84, IRON_D)
        for y in range(20, 90, 10):
            c.rect(8, y, 32, 4, IRON_L)
        c.rect(20, 0, 8, 12, BRASS)
        c.rect(22, 40, 4, 40, VINE)
        c.disc(28, 48, 4, LEAF)
        c.rect(10, 104, 28, 8, IRON_D)
    else:
        # Collapsed rack: fallen fins + short posts.
        c.rect(8, 72, 6, 32, IRON)
        c.rect(34, 84, 6, 20, IRON)
        c.rect(4, 64, 40, 6, IRON_L)
        c.rect(10, 52, 36, 5, IRON_L)
        c.rect(16, 42, 28, 5, IRON)
        c.disc(28, 90, 6, VINE)
        c.disc(34, 84, 4, LEAF)
        c.rect(4, 104, 40, 8, IRON_D)
    return c


def pouring_prop(i: int) -> C:
    c = C(32, 32)
    if i == 0:
        c.ell(6, 10, 20, 16, IRON)
        c.ell(10, 14, 12, 8, SLAG)
        c.rect(12, 4, 8, 8, BRASS)
    elif i == 1:
        c.rect(8, 18, 16, 10, IRON)
        c.rect(10, 10, 12, 12, GLASS)
        c.rect(10, 8, 12, 4, BRASS)
    elif i == 2:
        c.rect(14, 4, 4, 18, IRON)
        c.ell(10, 18, 12, 10, BRASS)
        c.put(16, 22, SLAG)
    else:
        c.rect(8, 20, 16, 8, IRON_D)
        c.rect(10, 8, 4, 14, IRON)
        c.rect(18, 8, 4, 14, IRON)
        c.rect(8, 6, 16, 4, BRASS)
    return c


def quench_prop(i: int) -> C:
    c = C(32, 32)
    if i == 0:
        c.disc(16, 16, 10, BRASS)
        c.disc(16, 16, 4, IRON_D)
        c.rect(6, 15, 20, 2, BRASS_L)
    elif i == 1:
        c.rect(4, 12, 24, 8, IRON)
        c.rect(6, 14, 20, 4, COOL)
        c.rect(20, 6, 6, 10, IRON_L)
    elif i == 2:
        c.ell(4, 18, 24, 10, COOL)
        c.ell(8, 20, 16, 6, GLASS)
    else:
        c.rect(6, 20, 20, 8, IRON)
        c.rect(8, 22, 16, 4, COOL)
        c.rect(12, 8, 8, 14, IRON_L)
    return c


def cooling_prop(i: int) -> C:
    c = C(32, 32)
    if i == 0:
        c.rect(4, 8, 24, 6, IRON_L)
        c.rect(8, 4, 3, 14, IRON)
        c.rect(21, 4, 3, 14, IRON)
        c.rect(4, 22, 24, 8, IRON_D)
    elif i == 1:
        c.rect(8, 6, 16, 22, IRON)
        c.rect(10, 8, 12, 16, GLASS)
        c.rect(8, 6, 16, 4, BRASS)
    elif i == 2:
        c.rect(10, 8, 12, 18, IRON)
        c.rect(22, 10, 3, 16, VINE)
        c.disc(26, 14, 3, LEAF)
        c.rect(8, 24, 16, 6, IRON_D)
    else:
        c.rect(14, 4, 4, 14, IRON)
        c.ell(10, 16, 12, 10, BRASS)
        c.put(16, 20, SLAG)
    return c


def foreground(kind: str) -> Image.Image:
    im = Image.new("RGBA", (640, 360), (0, 0, 0, 0))
    c = C(640, 360)
    c.im = im
    c.px = im.load()
    c.d = ImageDraw.Draw(im)
    if kind == "pouring":
        # Hanging ladles and mold clamps at the edges only.
        for x, bowl in ((18, True), (610, True), (40, False)):
            c.rect(x, 0, 6, 70, IRON)
            if bowl:
                c.ell(x - 10, 64, 26, 18, IRON_L)
                c.ell(x - 6, 70, 18, 10, SLAG)
        c.rect(0, 0, 640, 8, IRON_D)
        for x in (80, 160, 480, 560):
            for y in range(0, 48, 6):
                if y % 12 < 6:
                    c.rect(x, y, 2, 4, IRON)
        c.rect(8, 300, 18, 60, IRON)
        c.rect(614, 280, 18, 80, IRON)
    elif kind == "quench":
        for x in (12, 620):
            c.rect(x, 0, 10, 200, IRON)
            c.rect(x + 3, 20, 4, 160, COOL)
        c.disc(24, 80, 14, BRASS)
        c.rect(10, 78, 28, 4, BRASS_L)
        c.rect(0, 0, 640, 6, IRON)
        for x in (90, 200, 440, 540):
            for y in range(0, 40, 5):
                if y % 10 < 5:
                    c.rect(x, y, 2, 3, IRON_L)
        c.rect(6, 310, 22, 50, IRON_D)
        c.rect(612, 300, 22, 60, IRON_D)
        c.rect(6, 340, 22, 8, COOL)
    else:
        for x, hgt in ((10, 140), (618, 120)):
            c.rect(x, 220, 6, hgt, IRON)
            c.rect(x + 16, 220, 6, hgt, IRON)
            for y in range(228, 220 + hgt, 16):
                c.rect(x - 4, y, 30, 4, IRON_L)
        c.rect(20, 40, 3, 90, VINE)
        c.disc(24, 70, 5, LEAF)
        c.rect(0, 0, 640, 6, IRON_D)
        for x in (100, 520):
            for y in range(0, 36, 6):
                if y % 12 < 6:
                    c.rect(x, y, 2, 4, IRON)
        c.rect(8, 300, 16, 60, IRON)
        c.rect(616, 290, 16, 70, IRON)
    return im


def phase_barrier() -> C:
    """Glass-metal conduit grate: solid frame, dashable inner slits."""
    c = C(48, 160)
    c.rect(2, 0, 44, 160, IRON)
    c.rect(6, 8, 36, 144, IRON_D)
    c.rect(2, 0, 44, 8, BRASS)
    c.rect(2, 152, 44, 8, BRASS)
    for y in range(16, 148, 18):
        c.rect(10, y, 28, 8, SOOT)
        c.rect(12, y + 2, 24, 4, GLASS)
        c.put(22, y + 3, GLASS_L)
    c.rect(22, 8, 4, 144, BRASS)
    c.rect(8, 76, 32, 4, BRASS_L)
    return c


def main() -> None:
    out = Path(__file__).resolve().parent
    for i in range(4):
        pouring_arch(i).im.save(out / f"pouring_arch_{i}.png")
        quench_arch(i).im.save(out / f"quench_arch_{i}.png")
        cooling_arch(i).im.save(out / f"cooling_arch_{i}.png")
        pouring_prop(i).im.save(out / f"pouring_prop_{i}.png")
        quench_prop(i).im.save(out / f"quench_prop_{i}.png")
        cooling_prop(i).im.save(out / f"cooling_prop_{i}.png")
    foreground("pouring").save(out / "pouring_foreground.png")
    foreground("quench").save(out / "quench_foreground.png")
    foreground("cooling").save(out / "cooling_foreground.png")
    foreground("pouring").save(out / "pouring_near.png")
    foreground("quench").save(out / "quench_near.png")
    foreground("cooling").save(out / "cooling_near.png")
    phase_barrier().im.save(out / "foundry_phase_barrier.png")
    print("wrote equipment", out)


if __name__ == "__main__":
    main()
