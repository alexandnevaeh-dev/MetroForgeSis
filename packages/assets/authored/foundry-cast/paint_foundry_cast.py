#!/usr/bin/env python3
"""Foundry cast: clamp-mite, valve hopper, cooling crawler, crane drone, pouring-crane boss.

64px enemies / 160px boss. Four key poses per clip — silhouette and mechanism first.
"""
from __future__ import annotations
from pathlib import Path
from PIL import Image, ImageDraw

E, B = 64, 160
P = {
    "iron_d": (34, 30, 28, 255), "iron": (58, 50, 44, 255), "iron_l": (92, 78, 62, 255),
    "brass": (148, 108, 58, 255), "brass_l": (196, 150, 78, 255),
    "glass_d": (16, 48, 54, 255), "glass": (36, 140, 148, 255), "glass_l": (110, 214, 214, 255),
    "slag": (204, 108, 52, 255), "slag_l": (232, 168, 72, 255),
    "soot": (16, 14, 14, 255), "vine": (48, 96, 44, 255), "leaf": (78, 132, 56, 255),
    "cool": (28, 120, 132, 255), "outline": (10, 8, 8, 255),
}


class C:
    def __init__(self, size=E):
        self.s = size
        self.im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        self.px = self.im.load()
        self.d = ImageDraw.Draw(self.im)

    def put(self, x, y, c):
        if 0 <= x < self.s and 0 <= y < self.s:
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


def sheet(frames):
    im = Image.new("RGBA", (frames[0].s * len(frames), frames[0].s), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        im.paste(f.im, (i * f.s, 0))
    return im


def mite(kind: str, frame: int) -> C:
    """Clamp/ladle mite: slag-glass core, forward pincers, stubby foundry legs."""
    c = C()
    # Body bob / lunge
    bob = [0, -3, 1, -2][frame] if kind == "walk" else 0
    if kind == "attack":
        bob = [-3, 4, 2, 0][frame]
    if kind == "hurt":
        bob = -3
    if kind == "death":
        bob = 6
    by = 30 + bob
    bx = 0
    if kind == "walk":
        bx = [0, 2, 0, -2][frame]
    if kind == "attack":
        bx = [ -2, 6, 4, 0][frame]
    # Core
    c.ell(16 + bx, by - 4, 30, 22, P["iron"])
    c.ell(18 + bx, by - 2, 26, 18, P["iron_d"])
    c.ell(24 + bx, by + 2, 14, 12, P["glass"] if kind != "death" else P["iron_d"])
    c.ell(27 + bx, by + 4, 6, 5, P["glass_l"] if kind != "hurt" else P["slag_l"])
    if kind == "hurt":
        c.ell(22, by, 18, 16, P["slag"])
    # Legs — walk plants one pair
    lifts = {
        "walk": [(0, 6, 1, 5), (5, 0, 5, 1), (6, 1, 0, 4), (1, 5, 4, 0)][frame],
        "attack": (0, 0, 0, 0),
        "hurt": (2, 2, 2, 2),
        "death": (8, 10, 9, 11),
        "idle": [(0, 1, 0, 1), (0, 0, 0, 0), (1, 0, 1, 0), (0, 0, 0, 0)][frame],
    }.get(kind, (0, 0, 0, 0))
    legs = [(14, 48), (24, 50), (34, 50), (44, 48)]
    for i, (lx, ly) in enumerate(legs):
        lift = lifts[i] if isinstance(lifts, tuple) else 0
        if kind == "death":
            c.rect(lx - 2 + (i - 1) * 2, ly - 2, 5, 4, P["iron_d"])
        else:
            c.rect(lx, ly - lift, 5, 12 + lift, P["iron_d"])
            c.rect(lx, ly + 8, 7, 4, P["brass"])
    # Pincers — the clamp
    open_amt = {
        "walk": [3, 9, 5, 7][frame],
        "idle": [5, 6, 5, 4][frame],
        "attack": [12, 1, 2, 6][frame],
        "hurt": 8,
        "death": 14,
    }.get(kind, 5)
    if isinstance(open_amt, int):
        oa = open_amt
    else:
        oa = open_amt
    # upper / lower jaws from the head
    hx, hy = 44 + bx, by + 4
    if kind == "death":
        c.rect(8, by + 8, 18, 5, P["iron_l"])
        c.rect(38, by + 10, 18, 5, P["iron_l"])
    else:
        # upper jaw
        c.rect(hx, hy - oa // 2 - 2, 16, 4, P["iron_l"])
        c.rect(hx + 12, hy - oa // 2 - 4, 6, 4, P["brass"])
        # lower jaw
        c.rect(hx, hy + oa // 2 + 2, 16, 4, P["iron_l"])
        c.rect(hx + 12, hy + oa // 2 + 4, 6, 4, P["brass"])
        if kind == "attack" and frame in (1, 2):
            c.rect(hx + 8, hy, 10, 3, P["slag"])
    # visor ridge
    c.rect(20 + bx, by - 6, 20, 3, P["brass"])
    return c


def hopper(kind: str, frame: int) -> C:
    """Quench valve hopper: tank body, side wheel, snout that spits coolant.

    Idle stays planted. Walk is the airborne hop cycle (EnemyController hops with
    velocity.y = -260; walk plays only while off the floor).
    """
    c = C()
    by = 30
    feet = 58
    if kind == "walk":
        # Airborne: tuck, stretch, prepare land. Feet leave the canvas contact line.
        by = [22, 18, 20, 26][frame]
        feet = [50, 44, 48, 54][frame]
    if kind == "attack":
        by = [32, 28, 30, 30][frame]
    if kind == "hurt":
        by = 26
    if kind == "death":
        by = 38
        feet = 60
    c.ell(14, by, 32, 28, P["iron"])
    c.ell(18, by + 4, 24, 20, P["iron_d"])
    c.ell(22, by + 8, 16, 12, P["cool"] if kind != "death" else P["iron_d"])
    mouth = 6 if kind == "attack" and frame in (1, 2) else 3
    if kind == "attack" and frame == 0:
        mouth = 2
    c.rect(40, by + 8, 14, mouth + 6, P["iron_l"])
    c.rect(46, by + 10, 10, mouth + 2, P["glass"] if kind != "death" else P["soot"])
    if kind == "attack" and frame in (1, 2):
        c.disc(58, by + 10 + frame, 3 + frame, P["glass_l"])
        c.rect(54, by + 12, 8, 3, P["cool"])
    wx, wy = 18, by + 12
    spin = frame * 4 if kind != "idle" else frame
    c.disc(wx, wy, 8, P["brass"])
    c.disc(wx, wy, 4, P["iron_d"])
    c.rect(wx - 8, wy - 1 + (spin % 3), 16, 2, P["brass_l"])
    c.rect(wx - 1 + (spin % 3), wy - 8, 2, 16, P["brass_l"])
    # Spring legs. Idle plants both pads; walk tucks them.
    if kind == "death":
        c.rect(12, 50, 40, 8, P["iron_d"])
    else:
        pad = 4 if kind != "walk" else [6, 8, 7, 5][frame]
        c.rect(22, feet - 8, 5, 8, P["iron_l"])
        c.rect(38, feet - 8, 5, 8, P["iron_l"])
        c.rect(20, feet, 9, pad, P["brass"])
        c.rect(36, feet, 9, pad, P["brass"])
        if kind == "idle":
            c.put(28 + (frame % 2), by + 12, P["glass_l"])
    return c


def crawler(kind: str, frame: int) -> C:
    """Cooling-yard crawler: low finned hull, many legs, burst vents."""
    c = C()
    y = 38 if kind != "death" else 46
    c.ell(6, y, 52, 18, P["iron"])
    c.ell(10, y + 2, 44, 12, P["iron_d"])
    # cooling fins
    for i in range(5):
        c.rect(12 + i * 8, y - 6, 5, 8, P["iron_l"])
        if kind == "attack" and frame in (1, 2) and i in (1, 3):
            c.rect(13 + i * 8, y - 12, 3, 8, P["slag"])
    # vegetation on hull
    c.rect(16, y + 4, 3, 8, P["vine"])
    c.disc(22, y + 6, 2, P["leaf"])
    # legs wave — planted vs lifted, not a uniform bob
    phase = frame if kind == "walk" else 0
    for i, lx in enumerate([10, 20, 30, 40, 50]):
        lift = (6 if (i + phase) % 2 == 0 else 0) if kind == "walk" else 0
        if kind == "attack":
            lift = 2 if i % 2 == frame % 2 else 0
        if kind == "death":
            c.rect(lx, 58, 4, 4, P["iron_d"])
        else:
            c.rect(lx, 52 - lift, 4, 10 + lift, P["iron_d"])
            c.rect(lx - 1, 60 - (0 if lift else 0), 6, 3, P["brass"])
    c.ell(46, y + 2, 14, 12, P["iron_l"])  # head
    c.rect(56, y + 6, 6, 3, P["brass"])
    if kind == "hurt":
        c.ell(20, y, 24, 14, P["slag"])
    return c


def drone(kind: str, frame: int) -> C:
    """Overhead crane drone: traveller + hanging tongs, beam attack."""
    c = C()
    bob = [0, -3, 0, 3][frame] if kind in ("walk", "idle", "fly") else 0
    slide = 0
    if kind in ("walk", "fly"):
        slide = [-6, 0, 6, 0][frame]
        bob = [0, -4, 0, 4][frame]
    if kind == "hurt":
        bob = 4
        slide = 4
    if kind == "death":
        bob = 18
        slide = 8
    y = 14 + bob
    c.rect(4, 8, 56, 6, P["iron_d"])
    c.rect(4, 8, 56, 2, P["brass"])
    tx = 4 + slide
    c.rect(tx, y, 48, 8, P["iron"])
    c.rect(tx, y, 48, 2, P["brass_l"])
    c.rect(tx + 14, y + 6, 20, 10, P["iron_l"])
    spread = [4, 8, 4, 6][frame] if kind != "attack" else [12, 2, 3, 6][frame]
    if kind == "death":
        spread = 12
    if kind in ("idle",):
        spread = [3, 4, 3, 5][frame]
    c.rect(tx + 20 - spread, y + 16, 4, 22, P["iron_d"])
    c.rect(tx + 24 + spread, y + 16, 4, 22, P["iron_d"])
    c.rect(tx + 18 - spread, y + 36, 8, 4, P["brass"])
    c.rect(tx + 22 + spread, y + 36, 8, 4, P["brass"])
    if kind == "attack":
        if frame == 0:
            c.rect(tx + 22, y + 18, 4, 8, P["glass"])
        if frame in (1, 2):
            c.rect(tx + 22, y + 16, 4, 36, P["glass_l"])
            c.rect(tx + 20, y + 50, 8, 6, P["glass"])
    c.disc(tx + 24, y + 10, 3, P["glass"] if kind != "death" else P["soot"])
    return c


def boss(kind: str, frame: int) -> C:
    """Pouring-crane boss: rail, traveller, slag ladle — not a scaled mite."""
    c = C(B)
    slide = [-8, 0, 8, 0][frame] if kind in ("walk", "idle") else 0
    tip = 0
    pour = False
    burst = False
    if kind == "telegraph":
        tip = [-10, -16, -18, -14][frame]
        slide = [-4, 0, 4, 0][frame]
    elif kind == "attack":
        tip = [0, 18, 22, 8][frame]
        pour = frame in (1, 2)
    elif kind == "attack_projectile":
        tip = [6, 14, 16, 10][frame]
        pour = frame in (1, 2)
        slide = [8, 12, 10, 6][frame]
    elif kind == "attack_burst":
        tip = [10, 20, 24, 12][frame]
        pour = frame in (1, 2)
        burst = frame in (1, 2)
    elif kind == "recovery":
        tip = [12, 6, 2, 0][frame]
    elif kind == "hurt":
        tip = -6
        slide = 6
    elif kind == "death":
        tip = 40
        slide = 12
    # rail
    c.rect(8, 18, 144, 12, P["iron"])
    c.rect(8, 18, 144, 3, P["brass_l"])
    for x in range(16, 150, 22):
        c.rect(x, 20, 4, 8, P["brass"])
    # gantry legs
    if kind != "death":
        c.rect(18, 30, 10, 118, P["iron_d"])
        c.rect(132, 30, 10, 118, P["iron_d"])
        c.rect(12, 142, 22, 10, P["iron"])
        c.rect(126, 142, 22, 10, P["iron"])
    else:
        c.rect(10, 130, 40, 14, P["iron_d"])
        c.rect(120, 136, 36, 12, P["iron_d"])
    # traveller
    tx = 56 + slide
    c.rect(tx, 14, 48, 22, P["iron_l"])
    c.rect(tx, 14, 48, 5, P["brass"])
    c.rect(tx + 20, 34, 8, 18 + max(0, tip), P["iron"])
    # ladle
    lx, ly = tx + 24, 56 + tip
    c.ell(lx - 36, ly, 72, 44, P["iron"])
    c.ell(lx - 28, ly + 8, 56, 28, P["iron_d"])
    slag = P["slag"] if kind != "death" else P["iron_d"]
    if kind == "telegraph":
        slag = P["slag_l"]
    if kind == "recovery":
        slag = P["iron_d"]
    c.ell(lx - 20, ly + 12, 40, 18, slag)
    if pour:
        c.rect(lx - 4, ly + 36, 8, 40, P["slag"])
        c.ell(lx, ly + 78, 14, 16, P["glass"])
        if burst:
            c.ell(lx - 18, ly + 70, 36, 22, P["slag_l"])
            c.rect(lx - 22, ly + 82, 44, 8, P["slag"])
    if kind == "hurt":
        c.ell(lx - 10, ly + 8, 20, 12, P["slag_l"])
    if kind == "telegraph":
        c.rect(tx + 16, 10, 16, 4, P["brass_l"])
        c.disc(lx, ly + 16, 6, P["slag_l"])
    c.rect(tx + 18, 34, 12, 4, P["brass_l"])
    return c


def main():
    out = Path(__file__).resolve().parent
    actors = {
        "enemy_000": mite,
        "enemy_001": hopper,
        "enemy_002": crawler,
        "enemy_003": drone,
    }
    clips = ("idle", "walk", "attack", "hurt", "death")
    for name, fn in actors.items():
        still = fn("idle", 0)
        still.im.save(out / f"{name}.png")
        for clip in clips:
            frames = [fn(clip, i) for i in range(4)]
            sheet(frames).save(out / f"{name}_{clip}.png")
        # fly alias for the drone
        if name == "enemy_003":
            sheet([fn("fly", i) for i in range(4)]).save(out / f"{name}_fly.png")
    bstill = boss("idle", 0)
    bstill.im.save(out / "boss_final.png")
    for clip in clips:
        frames = [boss(clip, i) for i in range(4)]
        sheet(frames).save(out / f"boss_final_{clip}.png")
    sheet([boss("telegraph", i) for i in range(4)]).save(out / "boss_final_telegraph.png")
    sheet([boss("recovery", i) for i in range(4)]).save(out / "boss_final_recovery.png")
    sheet([boss("attack_projectile", i) for i in range(4)]).save(out / "boss_final_attack_projectile.png")
    sheet([boss("attack_burst", i) for i in range(4)]).save(out / "boss_final_attack_burst.png")
    print("wrote cast", out)


if __name__ == "__main__":
    main()
