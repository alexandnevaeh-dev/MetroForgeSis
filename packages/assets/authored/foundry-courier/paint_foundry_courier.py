#!/usr/bin/env python3
"""Original 64px Foundry courier pixel art (player Wanderer + shrine tender NPC).

Hand-authored pixel construction via Pillow. No third-party sprites, no paid APIs,
no hosted models. Palette: soot-iron / brass with a restrained visor glint.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

SIZE = 64
SHEET_FRAMES = 4

# Avoid near-white / magenta / hot-red in the lower 38% (Godot sprite_foot_clean).
PAL = {
    "outline": (16, 12, 14, 255),
    "void": (20, 16, 18, 255),
    "iron_d": (34, 30, 28, 255),
    "iron": (52, 46, 42, 255),
    "iron_l": (78, 68, 60, 255),
    "coat_d": (40, 32, 28, 255),
    "coat": (62, 48, 38, 255),
    "coat_l": (92, 70, 50, 255),
    "brass_d": (92, 66, 34, 255),
    "brass": (138, 104, 64, 255),
    "brass_l": (188, 146, 82, 255),
    "visor_d": (28, 78, 86, 255),
    "visor": (52, 140, 152, 255),
    "visor_l": (120, 196, 204, 255),
    "rust": (152, 68, 44, 255),
    "ember": (204, 108, 52, 255),
    "ember_l": (232, 168, 72, 255),
    "skin": (168, 124, 90, 255),
    "skin_d": (120, 86, 64, 255),
    "boot": (30, 26, 24, 255),
    "boot_l": (50, 42, 36, 255),
    "steel_d": (68, 70, 74, 255),
    "steel": (118, 122, 128, 255),
    "pack_d": (48, 36, 28, 255),
    "pack": (72, 54, 38, 255),
    "pack_l": (104, 78, 50, 255),
    "apron_d": (36, 32, 30, 255),
    "apron": (54, 46, 40, 255),
    "apron_l": (76, 62, 48, 255),
    "cloth": (86, 64, 52, 255),
    "cloth_d": (58, 44, 36, 255),
    "flash": (210, 92, 84, 255),
}


class Canvas:
    def __init__(self) -> None:
        self.im = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        self.px = self.im.load()

    def put(self, x: int, y: int, c: tuple[int, int, int, int]) -> None:
        if 0 <= x < SIZE and 0 <= y < SIZE:
            self.px[x, y] = c

    def get(self, x: int, y: int) -> tuple[int, int, int, int]:
        if 0 <= x < SIZE and 0 <= y < SIZE:
            return self.px[x, y]
        return (0, 0, 0, 0)

    def rect(self, x: int, y: int, w: int, h: int, c: tuple[int, int, int, int]) -> None:
        for j in range(h):
            for i in range(w):
                self.put(x + i, y + j, c)

    def shade_rect(
        self,
        x: int,
        y: int,
        w: int,
        h: int,
        dark: tuple[int, int, int, int],
        mid: tuple[int, int, int, int],
        light: tuple[int, int, int, int],
    ) -> None:
        span = max(1, w + h)
        for j in range(h):
            for i in range(w):
                k = i + j
                if k <= span // 5:
                    col = light
                elif k >= span - span // 5:
                    col = dark
                else:
                    col = mid
                    if (i + j * 2) % 7 == 0:
                        col = light if j < h // 2 else dark
                self.put(x + i, y + j, col)

    def ellipse(self, x: int, y: int, w: int, h: int, c: tuple[int, int, int, int]) -> None:
        draw = ImageDraw.Draw(self.im)
        draw.ellipse([x, y, x + w - 1, y + h - 1], fill=c)

    def disc(self, cx: int, cy: int, r: int, c: tuple[int, int, int, int]) -> None:
        for j in range(-r, r + 1):
            for i in range(-r, r + 1):
                if i * i + j * j <= r * r:
                    self.put(cx + i, cy + j, c)

    def thick_line(
        self,
        x0: int,
        y0: int,
        x1: int,
        y1: int,
        r: int,
        c: tuple[int, int, int, int],
    ) -> None:
        steps = max(abs(x1 - x0), abs(y1 - y0), 1)
        for s in range(steps + 1):
            t = s / steps
            x = round(x0 + (x1 - x0) * t)
            y = round(y0 + (y1 - y0) * t)
            self.disc(x, y, r, c)

    def outline(self, color: tuple[int, int, int, int] = PAL["outline"]) -> None:
        marked: list[tuple[int, int]] = []
        for y in range(SIZE):
            for x in range(SIZE):
                if self.get(x, y)[3] > 0:
                    continue
                hit = False
                for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    n = self.get(x + dx, y + dy)
                    if n[3] > 0 and n[:3] != color[:3]:
                        hit = True
                        break
                if hit:
                    marked.append((x, y))
        for x, y in marked:
            self.put(x, y, color)


def _tint(
    c: tuple[int, int, int, int], dr: int, dg: int, db: int
) -> tuple[int, int, int, int]:
    return (
        max(0, min(255, c[0] + dr)),
        max(0, min(255, c[1] + dg)),
        max(0, min(255, c[2] + db)),
        c[3],
    )


def draw_boot(c: Canvas, heel_x: int, sole_y: int, facing: int, flash: bool) -> None:
    boot = PAL["flash"] if flash else PAL["boot"]
    lip = PAL["flash"] if flash else PAL["boot_l"]
    # Facing right: toe extends +x.
    if facing >= 0:
        c.rect(heel_x, sole_y - 4, 8, 5, boot)
        c.rect(heel_x + 6, sole_y - 3, 3, 4, boot)
        c.rect(heel_x + 1, sole_y - 4, 5, 1, lip)
        c.put(heel_x + 8, sole_y - 1, boot)
    else:
        c.rect(heel_x - 7, sole_y - 4, 8, 5, boot)
        c.rect(heel_x - 8, sole_y - 3, 3, 4, boot)
        c.rect(heel_x - 5, sole_y - 4, 5, 1, lip)
        c.put(heel_x - 8, sole_y - 1, boot)


def draw_leg(
    c: Canvas,
    hip: tuple[int, int],
    foot: tuple[int, int],
    trousers: tuple[tuple[int, int, int, int], ...],
    flash: bool,
    facing: int,
) -> None:
    hx, hy = hip
    fx, fy = foot
    knee = ((hx * 2 + fx) // 3, (hy + fy) // 2)
    thigh_c, shin_c, _ = trousers
    if flash:
        thigh_c = shin_c = PAL["flash"]
    c.thick_line(hx, hy, knee[0], knee[1], 3, thigh_c)
    c.thick_line(knee[0], knee[1], fx, fy - 3, 2, shin_c)
    c.disc(hx, hy + 1, 3, thigh_c)
    c.disc(knee[0], knee[1], 2, _tint(shin_c, 12, 8, 4))
    draw_boot(c, fx, fy, facing, flash)


def draw_arm(
    c: Canvas,
    shoulder: tuple[int, int],
    hand: tuple[int, int],
    sleeve: tuple[int, int, int, int],
    flash: bool,
    glove: tuple[int, int, int, int] = PAL["iron_d"],
) -> None:
    col = PAL["flash"] if flash else sleeve
    g = PAL["flash"] if flash else glove
    mx, my = (shoulder[0] + hand[0]) // 2, (shoulder[1] + hand[1]) // 2 + 1
    c.thick_line(shoulder[0], shoulder[1], mx, my, 2, col)
    c.disc(shoulder[0], shoulder[1], 2, col)
    c.thick_line(mx, my, hand[0], hand[1], 2, col)
    c.disc(hand[0], hand[1], 2, g)


def draw_sword(c: Canvas, mode: str, origin: tuple[int, int], flash: bool) -> None:
    ox, oy = origin
    steel = PAL["flash"] if flash else PAL["steel"]
    steel_d = PAL["flash"] if flash else PAL["steel_d"]
    brass = PAL["brass_l"] if flash else PAL["brass"]
    if mode == "sheathed":
        # Ladle-hook on the pack: shaft + slag bowl. Ingot-runner kit, not a generic sword.
        c.thick_line(ox - 1, oy - 4, ox + 3, oy + 14, 1, steel_d)
        c.rect(ox - 3, oy + 12, 8, 5, brass)
        c.rect(ox - 2, oy + 13, 6, 3, PAL["ember"])
        c.put(ox + 1, oy + 14, PAL["ember_l"])
        c.rect(ox - 2, oy - 6, 5, 3, brass)
    elif mode == "draw":
        c.thick_line(ox + 4, oy - 2, ox + 14, oy - 10, 1, steel)
        c.rect(ox + 2, oy - 1, 4, 3, brass)
    elif mode == "slash":
        c.thick_line(ox + 6, oy + 2, ox + 22, oy - 2, 1, steel)
        c.put(ox + 23, oy - 2, PAL["brass_l"] if not flash else PAL["ember_l"])
        c.put(ox + 22, oy - 3, PAL["ember"])
        c.rect(ox + 4, oy + 1, 4, 3, brass)
    elif mode == "high":
        c.thick_line(ox + 2, oy - 4, ox + 8, oy - 18, 1, steel)
        c.rect(ox, oy - 3, 4, 3, brass)
    elif mode == "down":
        c.thick_line(ox + 4, oy + 4, ox + 10, oy + 18, 1, steel_d)
        c.rect(ox + 2, oy + 2, 4, 3, brass)


def draw_lantern(c: Canvas, hx: int, hy: int, bright: bool) -> None:
    c.rect(hx - 1, hy - 6, 3, 3, PAL["brass_d"])
    c.put(hx, hy - 7, PAL["brass"])
    c.rect(hx - 3, hy - 4, 7, 7, PAL["brass_d"])
    c.rect(hx - 2, hy - 3, 5, 5, PAL["ember"] if bright else PAL["rust"])
    c.put(hx, hy - 1, PAL["ember_l"] if bright else PAL["ember"])
    c.put(hx + 1, hy - 2, PAL["brass_l"])
    c.rect(hx - 3, hy + 3, 7, 1, PAL["brass"])


def draw_player(pose: dict) -> Image.Image:
    c = Canvas()
    lift = int(pose.get("lift", 0))
    lean = int(pose.get("lean", 0))
    hip_dy = int(pose.get("hip_dy", 0))
    flash = bool(pose.get("flash"))
    kneel = int(pose.get("kneel", 0))
    facing = 1

    base_x = 32 + lean
    hip_y = 44 + hip_dy + kneel - lift
    hip = (base_x - 1, hip_y)
    twist = int(pose.get("torso_twist", 0))
    head_counter = -lean + int(pose.get("head_dx", 0))

    coat = (PAL["coat_d"], PAL["coat"], PAL["coat_l"])
    if flash:
        coat = (PAL["flash"], PAL["flash"], _tint(PAL["flash"], 20, 10, 8))

    l_foot = (
        hip[0] - 6 + int(pose.get("l_foot_x", 0)),
        min(63, 63 - lift + int(pose.get("l_foot_y", 0))),
    )
    r_foot = (
        hip[0] + 5 + int(pose.get("r_foot_x", 0)),
        min(63, 63 - lift + int(pose.get("r_foot_y", 0))),
    )
    trousers = (PAL["coat_d"], PAL["iron"], PAL["boot"])
    back_hand = (
        hip[0] - 10 + int(pose.get("back_hand_x", 0)),
        hip[1] - 8 + int(pose.get("back_hand_y", 0)),
    )
    front_hand = (
        hip[0] + 10 + int(pose.get("front_hand_x", 0)),
        hip[1] - 6 + int(pose.get("front_hand_y", 0)),
    )
    sword = pose.get("sword", "sheathed")

    # Painter's order: back limb, far leg, pack, near leg, torso, head, front limb.
    draw_arm(c, (hip[0] - 6 - twist, hip[1] - 18), back_hand, coat[1], flash)
    draw_leg(c, (hip[0] - 3, hip[1] + 1), l_foot, trousers, flash, facing)

    px, py = hip[0] - 12, hip[1] - 18
    c.shade_rect(px, py, 10, 16, PAL["pack_d"], PAL["pack"], PAL["pack_l"])
    c.rect(px + 1, py + 3, 8, 1, PAL["brass_d"])
    c.rect(px + 2, py + 8, 6, 5, PAL["pack_d"])
    c.put(px + 7, py + 10, PAL["brass"])
    if sword == "sheathed":
        draw_sword(c, "sheathed", (px + 3, py + 2), flash)

    draw_leg(c, (hip[0] + 3, hip[1] + 1), r_foot, trousers, flash, facing)

    tx, ty = hip[0] - 7, hip[1] - 20
    flare = int(pose.get("coat_flare", 0))
    c.shade_rect(tx, ty, 15, 20, coat[0], coat[1], coat[2])
    c.rect(tx - flare, ty + 16, 15 + flare * 2, 8, coat[0])
    c.rect(tx + 1 - flare, ty + 17, 13 + flare * 2, 5, coat[1])
    c.rect(tx + 1, ty, 8, 1, coat[2])
    c.rect(tx, ty + 13, 15, 3, PAL["iron_d"] if not flash else PAL["flash"])
    c.rect(tx + 6, ty + 13, 3, 3, PAL["brass"])
    c.rect(tx + 1, ty + 15, 4, 4, PAL["pack_d"])
    c.rect(tx + 10, ty + 15, 4, 4, PAL["pack_d"])
    c.put(tx + 2, ty + 16, PAL["brass_d"])
    c.put(tx + 12, ty + 16, PAL["brass_d"])
    c.rect(tx + 4, ty - 2, 8, 3, PAL["cloth_d"] if not flash else PAL["flash"])
    c.rect(tx + 5, ty - 1, 6, 2, PAL["cloth"])

    hx, hy = hip[0] + 1 + head_counter, hip[1] - 32
    c.ellipse(hx - 6, hy - 2, 14, 14, PAL["iron"] if not flash else PAL["flash"])
    c.rect(hx - 5, hy, 12, 8, PAL["iron_d"] if not flash else PAL["flash"])
    c.rect(hx - 4, hy + 3, 11, 4, PAL["brass_d"] if not flash else PAL["flash"])
    c.rect(hx - 2, hy + 4, 8, 2, PAL["visor_d"])
    c.rect(hx + 2, hy + 4, 5, 2, PAL["visor"])
    c.put(hx + 6, hy + 4, PAL["visor_l"])
    c.rect(hx - 3, hy - 3, 8, 2, PAL["brass"])
    c.put(hx + 1, hy - 4, PAL["brass_l"])
    c.rect(hx - 1, hy + 8, 5, 2, PAL["skin_d"] if not flash else PAL["flash"])

    draw_arm(c, (hip[0] + 7 + twist, hip[1] - 17), front_hand, coat[2], flash, PAL["brass_d"])
    if sword != "sheathed":
        draw_sword(c, sword, front_hand, flash)

    c.rect(tx + 12, ty + 2, 3, 8, PAL["rust"] if not flash else PAL["flash"])
    c.put(tx + 14, ty + 9, PAL["ember"])

    c.outline()
    return c.im


def draw_npc(pose: dict) -> Image.Image:
    c = Canvas()
    lift = int(pose.get("lift", 0))
    lean = int(pose.get("lean", 0))
    hip_dy = int(pose.get("hip_dy", 0))
    flash = bool(pose.get("flash"))
    kneel = int(pose.get("kneel", 0))

    base_x = 31 + lean
    hip_y = 45 + hip_dy + kneel - lift
    hip = (base_x, hip_y)

    # stockier legs
    l_foot = (
        hip[0] - 7 + int(pose.get("l_foot_x", 0)),
        min(63, 63 - lift + int(pose.get("l_foot_y", 0))),
    )
    r_foot = (
        hip[0] + 6 + int(pose.get("r_foot_x", 0)),
        min(63, 63 - lift + int(pose.get("r_foot_y", 0))),
    )
    trousers = (PAL["apron_d"], PAL["iron_d"], PAL["boot"])
    back_hand = (
        hip[0] - 11 + int(pose.get("back_hand_x", 0)),
        hip[1] - 6 + int(pose.get("back_hand_y", 0)),
    )
    front_hand = (
        hip[0] + 12 + int(pose.get("front_hand_x", 0)),
        hip[1] - 4 + int(pose.get("front_hand_y", 0)),
    )
    draw_arm(c, (hip[0] - 7, hip[1] - 16), back_hand, PAL["iron"], flash)
    draw_leg(c, (hip[0] - 4, hip[1] + 1), l_foot, trousers, flash, 1)

    sx, sy = hip[0] - 11, hip[1] - 12
    c.shade_rect(sx, sy, 8, 10, PAL["pack_d"], PAL["pack"], PAL["brass_d"])
    c.rect(sx + 2, sy + 3, 4, 1, PAL["brass"])

    draw_leg(c, (hip[0] + 4, hip[1] + 1), r_foot, trousers, flash, 1)

    tx, ty = hip[0] - 9, hip[1] - 19
    body = (PAL["iron_d"], PAL["iron"], PAL["iron_l"])
    if flash:
        body = (PAL["flash"], PAL["flash"], PAL["flash"])
    c.shade_rect(tx, ty, 19, 20, body[0], body[1], body[2])
    c.rect(tx + 1, ty + 8, 17, 14, PAL["apron_d"] if not flash else PAL["flash"])
    c.rect(tx + 2, ty + 9, 15, 12, PAL["apron"] if not flash else PAL["flash"])
    c.rect(tx + 3, ty + 10, 4, 8, PAL["apron_l"])
    c.put(tx + 12, ty + 14, PAL["void"])
    c.put(tx + 13, ty + 15, PAL["iron_d"])
    c.put(tx + 8, ty + 18, PAL["void"])
    c.put(tx + 6, ty + 16, PAL["rust"])
    c.rect(tx, ty + 7, 19, 2, PAL["brass_d"])
    c.rect(tx + 8, ty + 7, 3, 2, PAL["brass"])
    c.rect(tx + 16, ty + 10, 2, 9, PAL["steel_d"])
    c.rect(tx + 15, ty + 18, 4, 2, PAL["steel"])

    hx, hy = hip[0] + int(pose.get("head_dx", 0)), hip[1] - 31
    c.ellipse(hx - 7, hy - 1, 15, 13, PAL["skin_d"] if not flash else PAL["flash"])
    c.rect(hx - 6, hy + 1, 13, 8, PAL["cloth_d"] if not flash else PAL["flash"])
    c.rect(hx - 5, hy, 11, 4, PAL["cloth"])
    c.rect(hx - 4, hy + 5, 9, 3, PAL["skin"] if not flash else PAL["flash"])
    c.put(hx + 3, hy + 7, PAL["iron_d"])
    c.put(hx - 2, hy + 6, PAL["void"])
    c.rect(hx + 1, hy + 4, 5, 3, PAL["brass_d"])
    c.rect(hx + 2, hy + 5, 3, 2, PAL["ember"])
    c.put(hx + 4, hy + 5, PAL["ember_l"])

    draw_arm(c, (hip[0] + 8, hip[1] - 16), front_hand, PAL["apron_l"], flash, PAL["brass_d"])
    if pose.get("lantern", True):
        draw_lantern(
            c,
            front_hand[0] + 1,
            front_hand[1] + 1,
            bright=bool(pose.get("lantern_bright", False)) and not flash,
        )

    c.outline()
    return c.im


PLAYER_POSES: dict[str, dict] = {
    "idle": {
        "l_foot_x": -2,
        "r_foot_x": 2,
        "front_hand_x": -2,
        "front_hand_y": 2,
        "back_hand_x": 2,
        "back_hand_y": 4,
        "sword": "sheathed",
    },
    "idle0": {
        "l_foot_x": -2,
        "r_foot_x": 3,
        "lean": 0,
        "front_hand_y": 2,
        "back_hand_y": 4,
        "sword": "sheathed",
    },
    "idle1": {
        "l_foot_x": -2,
        "r_foot_x": 3,
        "lean": 1,
        "torso_twist": 1,
        "front_hand_y": 1,
        "back_hand_y": 5,
        "coat_flare": 1,
        "sword": "sheathed",
    },
    "idle2": {
        "l_foot_x": -3,
        "r_foot_x": 2,
        "lean": 0,
        "front_hand_y": 3,
        "back_hand_y": 3,
        "sword": "sheathed",
    },
    "idle3": {
        "l_foot_x": -3,
        "r_foot_x": 2,
        "lean": -1,
        "torso_twist": -1,
        "front_hand_y": 2,
        "back_hand_y": 4,
        "sword": "sheathed",
    },
    # Walk: contact R, passing, contact L, passing. One planted foot per contact.
    "walk0": {
        "l_foot_x": -8,
        "l_foot_y": -2,
        "r_foot_x": 7,
        "r_foot_y": 0,
        "front_hand_x": 8,
        "front_hand_y": -2,
        "back_hand_x": -7,
        "back_hand_y": 6,
        "torso_twist": 4,
        "lean": 2,
        "coat_flare": 1,
        "head_dx": -1,
        "sword": "sheathed",
    },
    "walk1": {
        "l_foot_x": 1,
        "l_foot_y": -11,
        "r_foot_x": 2,
        "r_foot_y": 0,
        "front_hand_x": 2,
        "front_hand_y": -6,
        "back_hand_x": 1,
        "back_hand_y": 2,
        "torso_twist": 2,
        "lean": 2,
        "coat_flare": 1,
        "sword": "sheathed",
    },
    "walk2": {
        "l_foot_x": 7,
        "l_foot_y": 0,
        "r_foot_x": -8,
        "r_foot_y": -2,
        "front_hand_x": -7,
        "front_hand_y": 6,
        "back_hand_x": 8,
        "back_hand_y": -2,
        "torso_twist": -4,
        "lean": 2,
        "coat_flare": 1,
        "head_dx": 1,
        "sword": "sheathed",
    },
    "walk3": {
        "l_foot_x": 2,
        "l_foot_y": 0,
        "r_foot_x": 1,
        "r_foot_y": -11,
        "front_hand_x": -2,
        "front_hand_y": 2,
        "back_hand_x": 2,
        "back_hand_y": -6,
        "torso_twist": -2,
        "lean": 2,
        "coat_flare": 1,
        "sword": "sheathed",
    },
    "run0": {
        "lean": 5,
        "l_foot_x": -10,
        "l_foot_y": -3,
        "r_foot_x": 9,
        "r_foot_y": 0,
        "front_hand_x": 10,
        "front_hand_y": -6,
        "back_hand_x": -9,
        "back_hand_y": 8,
        "torso_twist": 5,
        "coat_flare": 2,
        "head_dx": -2,
        "sword": "sheathed",
    },
    "run1": {
        "lean": 5,
        "l_foot_x": 2,
        "l_foot_y": -14,
        "r_foot_x": 1,
        "r_foot_y": 0,
        "front_hand_x": 3,
        "front_hand_y": -10,
        "back_hand_x": 0,
        "back_hand_y": 3,
        "torso_twist": 3,
        "coat_flare": 2,
        "sword": "sheathed",
    },
    "run2": {
        "lean": 5,
        "l_foot_x": 9,
        "l_foot_y": 0,
        "r_foot_x": -10,
        "r_foot_y": -3,
        "front_hand_x": -9,
        "front_hand_y": 8,
        "back_hand_x": 10,
        "back_hand_y": -6,
        "torso_twist": -5,
        "coat_flare": 2,
        "head_dx": 1,
        "sword": "sheathed",
    },
    "run3": {
        "lean": 5,
        "l_foot_x": 1,
        "l_foot_y": 0,
        "r_foot_x": 2,
        "r_foot_y": -14,
        "front_hand_x": -1,
        "front_hand_y": 3,
        "back_hand_x": 3,
        "back_hand_y": -10,
        "torso_twist": -3,
        "coat_flare": 2,
        "sword": "sheathed",
    },
    "run": {
        "lean": 5,
        "l_foot_x": 10,
        "r_foot_x": -9,
        "r_foot_y": -8,
        "front_hand_x": 9,
        "front_hand_y": -6,
        "back_hand_x": -8,
        "back_hand_y": 8,
        "torso_twist": 5,
        "coat_flare": 2,
        "sword": "sheathed",
    },
    "jump_start": {
        "kneel": 9,
        "lean": -2,
        "l_foot_x": -4,
        "r_foot_x": 5,
        "front_hand_x": -9,
        "front_hand_y": 10,
        "back_hand_x": -6,
        "back_hand_y": 8,
        "torso_twist": -3,
        "coat_flare": 3,
        "sword": "sheathed",
    },
    "jump_start0": {
        "kneel": 4,
        "lean": -1,
        "l_foot_x": -3,
        "r_foot_x": 4,
        "front_hand_x": -6,
        "front_hand_y": 8,
        "back_hand_x": -4,
        "back_hand_y": 6,
        "coat_flare": 1,
        "sword": "sheathed",
    },
    "jump_start1": {
        "kneel": 11,
        "lean": -3,
        "l_foot_x": -5,
        "r_foot_x": 6,
        "front_hand_x": -10,
        "front_hand_y": 12,
        "back_hand_x": -7,
        "back_hand_y": 10,
        "torso_twist": -4,
        "coat_flare": 4,
        "sword": "sheathed",
    },
    "jump_start2": {
        "kneel": 5,
        "lift": 3,
        "lean": 1,
        "l_foot_x": -2,
        "l_foot_y": -6,
        "r_foot_x": 3,
        "front_hand_x": -4,
        "front_hand_y": 2,
        "back_hand_x": -3,
        "back_hand_y": 1,
        "coat_flare": 2,
        "sword": "sheathed",
    },
    "jump": {
        "lift": 8,
        "lean": 3,
        "l_foot_x": 1,
        "l_foot_y": -16,
        "r_foot_x": -2,
        "r_foot_y": -15,
        "front_hand_x": 4,
        "front_hand_y": -14,
        "back_hand_x": -5,
        "back_hand_y": -10,
        "torso_twist": 2,
        "coat_flare": 1,
        "sword": "sheathed",
    },
    "jump0": {
        "lift": 7,
        "lean": 2,
        "l_foot_x": -2,
        "l_foot_y": -10,
        "r_foot_x": 3,
        "r_foot_y": -6,
        "front_hand_x": 2,
        "front_hand_y": -8,
        "back_hand_x": -4,
        "back_hand_y": -4,
        "coat_flare": 3,
        "sword": "sheathed",
    },
    "jump1": {
        "lift": 10,
        "lean": 3,
        "l_foot_x": 2,
        "l_foot_y": -18,
        "r_foot_x": -3,
        "r_foot_y": -16,
        "front_hand_x": 5,
        "front_hand_y": -16,
        "back_hand_x": -6,
        "back_hand_y": -12,
        "torso_twist": 2,
        "coat_flare": 1,
        "sword": "sheathed",
    },
    "jump2": {
        "lift": 9,
        "lean": 1,
        "l_foot_x": -1,
        "l_foot_y": -14,
        "r_foot_x": 1,
        "r_foot_y": -15,
        "front_hand_x": 3,
        "front_hand_y": -12,
        "back_hand_x": -3,
        "back_hand_y": -8,
        "head_dx": 1,
        "sword": "sheathed",
    },
    "jump3": {
        "lift": 8,
        "lean": 2,
        "l_foot_x": -4,
        "l_foot_y": -8,
        "r_foot_x": 5,
        "r_foot_y": -7,
        "front_hand_x": 6,
        "front_hand_y": -6,
        "back_hand_x": -6,
        "back_hand_y": -4,
        "coat_flare": 2,
        "sword": "sheathed",
    },
    "fall": {
        "lift": 7,
        "lean": 1,
        "l_foot_x": -6,
        "l_foot_y": -4,
        "r_foot_x": 7,
        "r_foot_y": -3,
        "front_hand_x": 8,
        "front_hand_y": 2,
        "back_hand_x": -8,
        "back_hand_y": 1,
        "coat_flare": 3,
        "sword": "sheathed",
    },
    "fall0": {
        "lift": 6,
        "lean": 0,
        "l_foot_x": -7,
        "l_foot_y": -2,
        "r_foot_x": 8,
        "r_foot_y": -1,
        "front_hand_x": 9,
        "front_hand_y": 4,
        "back_hand_x": -9,
        "back_hand_y": 3,
        "coat_flare": 4,
        "sword": "sheathed",
    },
    "fall1": {
        "lift": 5,
        "lean": 1,
        "l_foot_x": -5,
        "l_foot_y": -6,
        "r_foot_x": 6,
        "r_foot_y": -5,
        "front_hand_x": 7,
        "front_hand_y": 6,
        "back_hand_x": -6,
        "back_hand_y": 5,
        "head_dx": 2,
        "coat_flare": 3,
        "sword": "sheathed",
    },
    "fall2": {
        "lift": 3,
        "kneel": 3,
        "lean": 2,
        "l_foot_x": -4,
        "r_foot_x": 5,
        "front_hand_x": 4,
        "front_hand_y": 8,
        "back_hand_x": -5,
        "back_hand_y": 7,
        "coat_flare": 2,
        "sword": "sheathed",
    },
    "land": {
        "kneel": 10,
        "l_foot_x": -5,
        "r_foot_x": 6,
        "front_hand_x": 2,
        "front_hand_y": 11,
        "back_hand_x": -5,
        "back_hand_y": 10,
        "torso_twist": 3,
        "coat_flare": 3,
        "sword": "sheathed",
    },
    "land0": {
        "kneel": 13,
        "lean": 1,
        "l_foot_x": -6,
        "r_foot_x": 7,
        "front_hand_x": 1,
        "front_hand_y": 12,
        "back_hand_x": -6,
        "back_hand_y": 11,
        "torso_twist": 4,
        "coat_flare": 4,
        "sword": "sheathed",
    },
    "land1": {
        "kneel": 8,
        "l_foot_x": -5,
        "r_foot_x": 6,
        "front_hand_x": 2,
        "front_hand_y": 8,
        "back_hand_x": -4,
        "back_hand_y": 7,
        "torso_twist": 2,
        "coat_flare": 2,
        "sword": "sheathed",
    },
    "land2": {
        "kneel": 3,
        "l_foot_x": -3,
        "r_foot_x": 4,
        "front_hand_x": -1,
        "front_hand_y": 4,
        "back_hand_x": 1,
        "back_hand_y": 5,
        "sword": "sheathed",
    },
    "wall_slide0": {
        "lean": 5,
        "kneel": 2,
        "l_foot_x": -4,
        "l_foot_y": -8,
        "r_foot_x": 8,
        "r_foot_y": -2,
        "front_hand_x": 12,
        "front_hand_y": -10,
        "back_hand_x": 2,
        "back_hand_y": 8,
        "torso_twist": 4,
        "coat_flare": 0,
        "head_dx": 2,
        "sword": "sheathed",
    },
    "wall_slide1": {
        "lean": 6,
        "hip_dy": 1,
        "kneel": 2,
        "l_foot_x": -3,
        "l_foot_y": -10,
        "r_foot_x": 8,
        "r_foot_y": -1,
        "front_hand_x": 13,
        "front_hand_y": -8,
        "back_hand_x": 1,
        "back_hand_y": 9,
        "torso_twist": 5,
        "head_dx": 2,
        "sword": "sheathed",
    },
    "wall_slide2": {
        "lean": 5,
        "hip_dy": 2,
        "kneel": 3,
        "l_foot_x": -5,
        "l_foot_y": -6,
        "r_foot_x": 7,
        "r_foot_y": -3,
        "front_hand_x": 12,
        "front_hand_y": -12,
        "back_hand_x": 2,
        "back_hand_y": 7,
        "torso_twist": 4,
        "coat_flare": 1,
        "head_dx": 1,
        "sword": "sheathed",
    },
    "wall_slide3": {
        "lean": 6,
        "hip_dy": 0,
        "kneel": 2,
        "l_foot_x": -4,
        "l_foot_y": -9,
        "r_foot_x": 8,
        "front_hand_x": 13,
        "front_hand_y": -9,
        "back_hand_x": 0,
        "back_hand_y": 8,
        "torso_twist": 5,
        "head_dx": 2,
        "sword": "sheathed",
    },
    "wall_jump0": {
        "lean": 6,
        "kneel": 6,
        "l_foot_x": -2,
        "r_foot_x": 8,
        "r_foot_y": -4,
        "front_hand_x": 10,
        "front_hand_y": -4,
        "back_hand_x": 4,
        "back_hand_y": 6,
        "torso_twist": 3,
        "coat_flare": 1,
        "sword": "sheathed",
    },
    "wall_jump1": {
        "lift": 4,
        "lean": -3,
        "l_foot_x": 8,
        "l_foot_y": -8,
        "r_foot_x": 10,
        "r_foot_y": -2,
        "front_hand_x": -6,
        "front_hand_y": -8,
        "back_hand_x": 8,
        "back_hand_y": -4,
        "torso_twist": -4,
        "coat_flare": 4,
        "head_dx": -2,
        "sword": "sheathed",
    },
    "wall_jump2": {
        "lift": 9,
        "lean": -2,
        "l_foot_x": -4,
        "l_foot_y": -14,
        "r_foot_x": 6,
        "r_foot_y": -12,
        "front_hand_x": -8,
        "front_hand_y": -12,
        "back_hand_x": 6,
        "back_hand_y": -8,
        "coat_flare": 3,
        "sword": "sheathed",
    },
    "wall_jump3": {
        "lift": 8,
        "lean": 1,
        "l_foot_x": 1,
        "l_foot_y": -16,
        "r_foot_x": -2,
        "r_foot_y": -14,
        "front_hand_x": 3,
        "front_hand_y": -10,
        "back_hand_x": -4,
        "back_hand_y": -8,
        "sword": "sheathed",
    },
    "swim0": {
        "lift": 10,
        "lean": 7,
        "l_foot_x": 8,
        "l_foot_y": -10,
        "r_foot_x": -8,
        "r_foot_y": -6,
        "front_hand_x": 12,
        "front_hand_y": -4,
        "back_hand_x": -10,
        "back_hand_y": 2,
        "torso_twist": 4,
        "coat_flare": 3,
        "head_dx": 2,
        "sword": "sheathed",
    },
    "swim1": {
        "lift": 11,
        "lean": 8,
        "l_foot_x": -6,
        "l_foot_y": -8,
        "r_foot_x": 9,
        "r_foot_y": -12,
        "front_hand_x": 6,
        "front_hand_y": -10,
        "back_hand_x": -8,
        "back_hand_y": -2,
        "torso_twist": 2,
        "coat_flare": 2,
        "head_dx": 2,
        "sword": "sheathed",
    },
    "swim2": {
        "lift": 10,
        "lean": 7,
        "l_foot_x": -9,
        "l_foot_y": -6,
        "r_foot_x": 8,
        "r_foot_y": -10,
        "front_hand_x": -4,
        "front_hand_y": 4,
        "back_hand_x": 10,
        "back_hand_y": -6,
        "torso_twist": -3,
        "coat_flare": 3,
        "head_dx": 1,
        "sword": "sheathed",
    },
    "swim3": {
        "lift": 11,
        "lean": 8,
        "l_foot_x": 7,
        "l_foot_y": -12,
        "r_foot_x": -7,
        "r_foot_y": -8,
        "front_hand_x": 10,
        "front_hand_y": -2,
        "back_hand_x": -6,
        "back_hand_y": -8,
        "torso_twist": 3,
        "coat_flare": 2,
        "head_dx": 2,
        "sword": "sheathed",
    },
    "atk2_0": {
        "lean": -2,
        "kneel": 3,
        "l_foot_x": -4,
        "r_foot_x": 5,
        "front_hand_x": -8,
        "front_hand_y": 6,
        "back_hand_x": 4,
        "torso_twist": -4,
        "sword": "down",
    },
    "atk2_1": {
        "lean": 0,
        "l_foot_x": -2,
        "r_foot_x": 3,
        "front_hand_x": 2,
        "front_hand_y": -14,
        "back_hand_x": -4,
        "torso_twist": 1,
        "sword": "draw",
    },
    "atk2_2": {
        "lean": 3,
        "l_foot_x": 4,
        "r_foot_x": -3,
        "front_hand_x": 6,
        "front_hand_y": -18,
        "back_hand_x": -6,
        "torso_twist": 3,
        "coat_flare": 2,
        "sword": "high",
    },
    "atk2_3": {
        "lean": 4,
        "l_foot_x": 6,
        "r_foot_x": -4,
        "front_hand_x": 10,
        "front_hand_y": -10,
        "back_hand_x": -5,
        "coat_flare": 3,
        "torso_twist": 4,
        "sword": "slash",
    },
    "atk2_4": {
        "lean": 3,
        "kneel": 2,
        "l_foot_x": 5,
        "r_foot_x": -3,
        "front_hand_x": 8,
        "front_hand_y": -4,
        "back_hand_x": -4,
        "torso_twist": 2,
        "sword": "slash",
    },
    "atk2_5": {
        "lean": 1,
        "kneel": 1,
        "l_foot_x": 2,
        "r_foot_x": 2,
        "front_hand_x": 4,
        "front_hand_y": 2,
        "sword": "sheathed",
    },
    "atk3_0": {
        "lean": -1,
        "l_foot_x": -3,
        "r_foot_x": 4,
        "front_hand_x": 4,
        "front_hand_y": -16,
        "back_hand_x": -3,
        "torso_twist": 2,
        "sword": "high",
    },
    "atk3_1": {
        "lean": 2,
        "l_foot_x": 3,
        "r_foot_x": -2,
        "front_hand_x": 6,
        "front_hand_y": -18,
        "back_hand_x": -5,
        "torso_twist": 3,
        "coat_flare": 1,
        "sword": "high",
    },
    "atk3_2": {
        "lean": 4,
        "kneel": 2,
        "l_foot_x": 6,
        "r_foot_x": -5,
        "front_hand_x": 10,
        "front_hand_y": -2,
        "back_hand_x": -6,
        "coat_flare": 3,
        "torso_twist": 4,
        "sword": "slash",
    },
    "atk3_3": {
        "lean": 5,
        "kneel": 8,
        "l_foot_x": 7,
        "r_foot_x": -6,
        "front_hand_x": 11,
        "front_hand_y": 10,
        "back_hand_x": -8,
        "back_hand_y": 6,
        "torso_twist": 5,
        "coat_flare": 4,
        "sword": "down",
    },
    "atk3_4": {
        "lean": 3,
        "kneel": 10,
        "flash": True,
        "l_foot_x": 6,
        "r_foot_x": -5,
        "front_hand_x": 9,
        "front_hand_y": 12,
        "back_hand_x": -6,
        "back_hand_y": 8,
        "coat_flare": 3,
        "sword": "down",
    },
    "atk3_5": {
        "lean": 1,
        "kneel": 4,
        "l_foot_x": 3,
        "r_foot_x": -2,
        "front_hand_x": 5,
        "front_hand_y": 4,
        "sword": "sheathed",
    },
    "dash": {
        "lean": 7,
        "l_foot_x": 9,
        "r_foot_x": -11,
        "r_foot_y": -3,
        "front_hand_x": 12,
        "front_hand_y": -2,
        "back_hand_x": -9,
        "back_hand_y": 5,
        "coat_flare": 3,
        "sword": "sheathed",
    },
    "attack0": {
        "lean": -3,
        "kneel": 2,
        "l_foot_x": -3,
        "r_foot_x": 4,
        "front_hand_x": -6,
        "front_hand_y": -10,
        "back_hand_x": 3,
        "torso_twist": -3,
        "sword": "high",
    },
    "attack1": {
        "lean": 1,
        "front_hand_x": 4,
        "front_hand_y": -12,
        "back_hand_x": -3,
        "torso_twist": 1,
        "sword": "draw",
    },
    "attack2": {
        "lean": 5,
        "l_foot_x": 6,
        "r_foot_x": -4,
        "front_hand_x": 11,
        "front_hand_y": 1,
        "coat_flare": 2,
        "torso_twist": 4,
        "sword": "slash",
    },
    "attack3": {
        "lean": 4,
        "kneel": 3,
        "l_foot_x": 7,
        "r_foot_x": -5,
        "front_hand_x": 10,
        "front_hand_y": 8,
        "back_hand_x": -7,
        "back_hand_y": 4,
        "torso_twist": 5,
        "coat_flare": 3,
        "sword": "down",
    },
    "hurt0": {
        "lean": -4,
        "front_hand_x": -3,
        "back_hand_x": 4,
        "sword": "sheathed",
    },
    "hurt1": {
        "lean": -5,
        "flash": True,
        "front_hand_x": -4,
        "sword": "sheathed",
    },
    "hurt2": {
        "lean": -3,
        "front_hand_x": -2,
        "sword": "sheathed",
    },
    "hurt3": {
        "lean": -1,
        "sword": "sheathed",
    },
    "death0": {
        "lean": -4,
        "kneel": 4,
        "sword": "sheathed",
    },
    "death1": {
        "lean": -6,
        "kneel": 8,
        "flash": True,
        "sword": "sheathed",
    },
    "death2": {
        "lean": -8,
        "kneel": 12,
        "sword": "sheathed",
    },
    "death3": {
        "lean": -10,
        "kneel": 14,
        "sword": "sheathed",
    },
}


NPC_POSES: dict[str, dict] = {
    "idle": {
        "l_foot_x": -1,
        "r_foot_x": 2,
        "front_hand_x": 1,
        "front_hand_y": 1,
        "back_hand_x": 1,
        "back_hand_y": 3,
        "lantern_bright": False,
    },
    "idle0": {
        "l_foot_x": -1,
        "r_foot_x": 2,
        "front_hand_x": 1,
        "front_hand_y": 1,
        "back_hand_x": 1,
        "back_hand_y": 3,
        "lantern_bright": False,
    },
    "idle1": {
        "l_foot_x": -1,
        "r_foot_x": 2,
        "hip_dy": -1,
        "front_hand_x": 1,
        "front_hand_y": 2,
        "back_hand_x": 1,
        "back_hand_y": 4,
        "head_dx": 0,
        "lantern_bright": False,
    },
    "idle2": {
        "l_foot_x": -2,
        "r_foot_x": 1,
        "front_hand_x": 0,
        "front_hand_y": 1,
        "back_hand_x": 2,
        "back_hand_y": 3,
        "lantern_bright": False,
    },
    "idle3": {
        "l_foot_x": -1,
        "r_foot_x": 2,
        "hip_dy": 1,
        "lean": 1,
        "front_hand_x": 2,
        "front_hand_y": 0,
        "back_hand_x": 0,
        "back_hand_y": 3,
        "head_dx": -1,
        "lantern_bright": False,
    },
    "talk0": {
        "lean": 1,
        "front_hand_x": 3,
        "front_hand_y": -4,
        "back_hand_x": 2,
        "back_hand_y": 2,
        "head_dx": 1,
        "lantern_bright": True,
    },
    "talk1": {
        "lean": 2,
        "hip_dy": -1,
        "front_hand_x": 4,
        "front_hand_y": -6,
        "back_hand_x": 3,
        "back_hand_y": 1,
        "head_dx": 1,
        "lantern_bright": True,
    },
    "talk2": {
        "lean": 1,
        "front_hand_x": 3,
        "front_hand_y": -3,
        "back_hand_x": 1,
        "back_hand_y": 3,
        "head_dx": 2,
        "lantern_bright": True,
    },
    "talk3": {
        "lean": 2,
        "hip_dy": 1,
        "front_hand_x": 5,
        "front_hand_y": -5,
        "back_hand_x": 2,
        "back_hand_y": 2,
        "head_dx": 1,
        "lantern_bright": True,
    },
    "listen0": {
        "lean": 2,
        "front_hand_x": 0,
        "front_hand_y": 2,
        "back_hand_x": 1,
        "back_hand_y": 4,
        "head_dx": 2,
        "lantern_bright": False,
    },
    "listen1": {
        "lean": 3,
        "hip_dy": -1,
        "front_hand_x": 0,
        "front_hand_y": 3,
        "back_hand_x": 2,
        "back_hand_y": 4,
        "head_dx": 3,
        "lantern_bright": False,
    },
    "listen2": {
        "lean": 2,
        "front_hand_x": -1,
        "front_hand_y": 2,
        "back_hand_x": 1,
        "back_hand_y": 3,
        "head_dx": 2,
        "lantern_bright": False,
    },
    "listen3": {
        "lean": 3,
        "hip_dy": 1,
        "front_hand_x": 1,
        "front_hand_y": 1,
        "back_hand_x": 0,
        "back_hand_y": 4,
        "head_dx": 3,
        "lantern_bright": False,
    },
    "walk0": {
        "l_foot_x": 6,
        "r_foot_x": -5,
        "front_hand_x": 3,
        "back_hand_x": -2,
        "back_hand_y": 4,
    },
    "walk1": {
        "hip_dy": -2,
        "l_foot_x": 2,
        "r_foot_x": -1,
        "l_foot_y": -4,
        "front_hand_x": 2,
        "front_hand_y": -1,
        "back_hand_x": 1,
        "back_hand_y": 3,
    },
    "walk2": {
        "l_foot_x": -5,
        "r_foot_x": 6,
        "front_hand_x": -1,
        "front_hand_y": 3,
        "back_hand_x": 3,
        "back_hand_y": 2,
    },
    "walk3": {
        "hip_dy": -2,
        "l_foot_x": -1,
        "r_foot_x": 2,
        "r_foot_y": -4,
        "front_hand_x": -1,
        "front_hand_y": 3,
        "back_hand_x": 2,
        "back_hand_y": 0,
    },
}


def brighten(im: Image.Image, amount: int) -> Image.Image:
    out = im.copy()
    px = out.load()
    for y in range(SIZE):
        for x in range(SIZE):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            px[x, y] = (
                min(255, r + amount),
                min(255, g + amount // 2),
                min(255, b + amount // 3),
                a,
            )
    return out


def sheet(frames: list[Image.Image]) -> Image.Image:
    out = Image.new("RGBA", (SIZE * len(frames), SIZE), (0, 0, 0, 0))
    for i, fr in enumerate(frames):
        out.paste(fr, (i * SIZE, 0), fr)
    return out


def unique_colors(im: Image.Image) -> int:
    colors = im.convert("RGBA").getcolors(maxcolors=SIZE * SIZE)
    if not colors:
        return 0
    return sum(1 for _n, c in colors if c[3] > 0)


def feet_opaque(im: Image.Image) -> bool:
    px = im.load()
    return any(px[x, SIZE - 1][3] > 128 for x in range(SIZE))


def write_png(path: Path, im: Image.Image) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, format="PNG", optimize=True)


def preview_grid(images: list[tuple[str, Image.Image]], cols: int = 8, scale: int = 4) -> Image.Image:
    cell = SIZE * scale + 8
    rows = (len(images) + cols - 1) // cols
    grid = Image.new("RGBA", (cols * cell, rows * cell), (24, 20, 18, 255))
    for i, (_name, im) in enumerate(images):
        col, row = i % cols, i // cols
        scaled = im.resize((SIZE * scale, SIZE * scale), Image.Resampling.NEAREST)
        grid.paste(scaled, (col * cell + 4, row * cell + 4), scaled)
    return grid


def main() -> None:
    out = Path(__file__).resolve().parent

    player_idle = draw_player(PLAYER_POSES["idle"])
    player_walk = [draw_player(PLAYER_POSES[f"walk{i}"]) for i in range(4)]
    player_run = [draw_player(PLAYER_POSES[f"run{i}"]) for i in range(4)]
    player_idle_loop = [draw_player(PLAYER_POSES[f"idle{i}"]) for i in range(4)]
    player_attack = [draw_player(PLAYER_POSES[f"attack{i}"]) for i in range(4)]
    player_attack[3] = brighten(player_attack[3], 36)
    player_hurt = [draw_player(PLAYER_POSES[f"hurt{i}"]) for i in range(4)]
    player_death = [draw_player(PLAYER_POSES[f"death{i}"]) for i in range(4)]

    poses = {
        "idle": player_idle,
        "run": draw_player(PLAYER_POSES["run"]),
        "jump_start": draw_player(PLAYER_POSES["jump_start1"]),
        "jump": draw_player(PLAYER_POSES["jump1"]),
        "fall": draw_player(PLAYER_POSES["fall0"]),
        "land": draw_player(PLAYER_POSES["land0"]),
        "dash": draw_player(PLAYER_POSES["dash"]),
    }
    jump_start = [draw_player(PLAYER_POSES[f"jump_start{i}"]) for i in range(3)]
    jump = [draw_player(PLAYER_POSES[f"jump{i}"]) for i in range(4)]
    fall = [draw_player(PLAYER_POSES[f"fall{i}"]) for i in range(3)]
    land = [draw_player(PLAYER_POSES[f"land{i}"]) for i in range(3)]
    wall_slide = [draw_player(PLAYER_POSES[f"wall_slide{i}"]) for i in range(4)]
    wall_jump = [draw_player(PLAYER_POSES[f"wall_jump{i}"]) for i in range(4)]
    swim = [draw_player(PLAYER_POSES[f"swim{i}"]) for i in range(4)]
    attack_2 = [draw_player(PLAYER_POSES[f"atk2_{i}"]) for i in range(6)]
    attack_2[3] = brighten(attack_2[3], 28)
    attack_3 = [draw_player(PLAYER_POSES[f"atk3_{i}"]) for i in range(6)]

    npc_idle = draw_npc(NPC_POSES["idle"])
    npc_walk = [draw_npc(NPC_POSES[f"walk{i}"]) for i in range(4)]
    npc_idle_loop = [draw_npc(NPC_POSES[f"idle{i}"]) for i in range(4)]
    npc_talk = [draw_npc(NPC_POSES[f"talk{i}"]) for i in range(4)]
    npc_listen = [draw_npc(NPC_POSES[f"listen{i}"]) for i in range(4)]

    write_png(out / "player.png", player_idle)
    write_png(out / "player_walk.png", sheet(player_walk))
    write_png(out / "player_run.png", sheet(player_run))
    write_png(out / "player_idle.png", sheet(player_idle_loop))
    write_png(out / "player_attack.png", sheet(player_attack))
    write_png(out / "player_attack_2.png", sheet(attack_2))
    write_png(out / "player_attack_3.png", sheet(attack_3))
    write_png(out / "player_hurt.png", sheet(player_hurt))
    write_png(out / "player_death.png", sheet(player_death))
    write_png(out / "player_jump_start.png", sheet(jump_start))
    write_png(out / "player_jump.png", sheet(jump))
    write_png(out / "player_fall.png", sheet(fall))
    write_png(out / "player_land.png", sheet(land))
    write_png(out / "player_dash.png", sheet([poses["dash"], poses["dash"], poses["run"]]))
    write_png(out / "player_wall_slide.png", sheet(wall_slide))
    write_png(out / "player_wall_jump.png", sheet(wall_jump))
    write_png(out / "player_swim.png", sheet(swim))
    for name, im in poses.items():
        write_png(out / f"player_{name}_pose.png", im)

    write_png(out / "npc_000.png", npc_idle)
    write_png(out / "npc_000_walk.png", sheet(npc_walk))
    write_png(out / "npc_000_idle.png", sheet(npc_idle_loop))
    write_png(out / "npc_000_talk.png", sheet(npc_talk))
    write_png(out / "npc_000_listen.png", sheet(npc_listen))

    previews: list[tuple[str, Image.Image]] = [
        ("player", player_idle),
        ("npc", npc_idle),
        *[(f"walk{i}", fr) for i, fr in enumerate(player_walk)],
        *[(f"atk{i}", fr) for i, fr in enumerate(player_attack)],
        *[(name, im) for name, im in poses.items() if name != "idle"],
        *[(f"nwalk{i}", fr) for i, fr in enumerate(npc_walk)],
    ]
    write_png(out / "preview_4x.png", preview_grid(previews, cols=8, scale=4))

    checks = [
        ("player.png", player_idle, True),
        ("npc_000.png", npc_idle, True),
        ("player_idle_pose.png", poses["idle"], True),
        ("player_run_pose.png", poses["run"], True),
        ("player_land_pose.png", poses["land"], True),
        ("player_jump_pose.png", poses["jump"], False),
        ("player_fall_pose.png", poses["fall"], False),
    ]
    for name, im, grounded in checks:
        n = unique_colors(im)
        assert im.size == (SIZE, SIZE), name
        assert n > 8, f"{name} unique colors {n}"
        if grounded:
            assert feet_opaque(im), f"{name} missing feet-bottom pixels"
    assert unique_colors(player_idle) > 8
    assert player_idle.tobytes() != npc_idle.tobytes()
    walk_bytes = [fr.tobytes() for fr in player_walk]
    assert len(set(walk_bytes)) == 4, "walk frames must be unique poses"
    npc_walk_bytes = [fr.tobytes() for fr in npc_walk]
    assert len(set(npc_walk_bytes)) == 4
    pose_bytes = [im.tobytes() for im in poses.values()]
    assert len(set(pose_bytes)) == len(poses), "locomotion poses must be distinct"
    for label, frames in (
        ("jump_start", jump_start),
        ("jump", jump),
        ("fall", fall),
        ("land", land),
        ("wall_slide", wall_slide),
        ("wall_jump", wall_jump),
        ("swim", swim),
        ("attack_2", attack_2),
        ("attack_3", attack_3),
        ("npc_idle", npc_idle_loop),
        ("npc_talk", npc_talk),
        ("npc_listen", npc_listen),
    ):
        assert len({fr.tobytes() for fr in frames}) == len(frames), f"{label} frames must be unique poses"
    print("authored foundry courier kit ok")
    print(f"  player colors={unique_colors(player_idle)} npc colors={unique_colors(npc_idle)}")
    print(f"  wrote {out}")


if __name__ == "__main__":
    main()
