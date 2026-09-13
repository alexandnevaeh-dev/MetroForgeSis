#!/usr/bin/env python3
"""Author a cohesive Foundry visual-polish pass for the Godot metroidvania template.

Produces native pixel-art sheets (no bilinear interpolation): 64x64 actor frames with
bottom-center contact, a 32px 8x6 tileset matching RoomTileMap atlas roles, parallax
plates, VFX, props, and HUD chrome. Original player sheets are left in
assets/_baseline_v1/ for rollback.
"""
from __future__ import annotations

import json
import math
import shutil
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
FOUNDRY = Path("/Volumes/DevDrive/Projects/MetroForge/Forged/test-packs/metroforge-foundry-v3")

# Visual constitution — industrial sci-fi Foundry. Gameplay-meaning colors stay fixed.
INK = (16, 28, 41, 255)
SOOT = (19, 30, 44, 255)
STEEL_D = (24, 39, 51, 255)
STEEL_M = (56, 77, 96, 255)
STEEL_L = (169, 195, 203, 255)
STEEL_H = (225, 228, 207, 255)
BODY = (38, 54, 70, 255)
CYAN = (99, 219, 224, 255)
CYAN_D = (42, 132, 142, 255)
CYAN_GLOW = (180, 244, 246, 255)
RUST = (185, 93, 62, 255)
RUST_D = (96, 42, 28, 255)
RUST_L = (227, 155, 88, 255)
AMBER = (239, 189, 97, 255)
AMBER_D = (168, 96, 32, 255)
ASH = (168, 176, 168, 255)
VOID = (0, 0, 0, 0)

FS = 64  # actor frame size — preserved template canvas
TS = 32  # tile size


def blank(w: int, h: int) -> Image.Image:
    return Image.new("RGBA", (w, h), VOID)


def px(img: Image.Image, x: int, y: int, c) -> None:
    if 0 <= x < img.width and 0 <= y < img.height:
        img.putpixel((x, y), c)


def blend(a, b, t: float):
    t = max(0.0, min(1.0, t))
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(4))


def fill_rect(img: Image.Image, x0: int, y0: int, x1: int, y1: int, c) -> None:
    if x1 < x0:
        x0, x1 = x1, x0
    if y1 < y0:
        y0, y1 = y1, y0
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            px(img, x, y, c)


def fill_ellipse(img: Image.Image, cx: int, cy: int, rx: int, ry: int, c) -> None:
    for y in range(cy - ry, cy + ry + 1):
        for x in range(cx - rx, cx + rx + 1):
            dx = (x - cx) / max(rx, 0.5)
            dy = (y - cy) / max(ry, 0.5)
            if dx * dx + dy * dy <= 1.05:
                px(img, x, y, c)


def bevel_rect(img: Image.Image, x0: int, y0: int, x1: int, y1: int, mid, hi, lo) -> None:
    fill_rect(img, x0, y0, x1, y1, mid)
    fill_rect(img, x0, y0, x1, y0, hi)
    fill_rect(img, x0, y0, x0, y1, hi)
    fill_rect(img, x0, y1, x1, y1, lo)
    fill_rect(img, x1, y0, x1, y1, lo)


def outline(img: Image.Image, color=INK) -> None:
    src = img.copy()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            if src.getpixel((x, y))[3] < 12:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and src.getpixel((nx, ny))[3] >= 12:
                        px(img, x, y, color)
                        break


def sheet(frames: list[Image.Image]) -> Image.Image:
    if not frames:
        raise ValueError("no frames")
    w, h = frames[0].size
    out = blank(w * len(frames), h)
    for i, fr in enumerate(frames):
        out.paste(fr, (i * w, 0), fr)
    return out


def save_sheet(path: Path, frames: list[Image.Image]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet(frames).save(path)
    print(f"wrote {path.relative_to(ROOT)}  ({len(frames)} x {frames[0].size[0]})")


# ---------------------------------------------------------------------------
# Articulated courier (player) — compact armored biped, cyan visor + blade
# ---------------------------------------------------------------------------

class Pose:
    __slots__ = (
        "bob", "lean", "crouch", "squash_x", "squash_y",
        "l_lift", "r_lift", "l_fwd", "r_fwd", "l_bend", "r_bend",
        "arm_back", "arm_raise", "reach", "blade",
        "head_tilt", "visor", "pack", "flash", "scatter",
        "hide_blade", "antenna", "cable", "rear_arm", "blade_drop",
    )

    def __init__(self, **kw):
        self.bob = 0
        self.lean = 0
        self.crouch = 0
        self.squash_x = 1.0
        self.squash_y = 1.0
        self.l_lift = 0
        self.r_lift = 0
        self.l_fwd = 0
        self.r_fwd = 0
        self.l_bend = 0
        self.r_bend = 0
        self.arm_back = 0
        self.arm_raise = 0
        self.reach = 0
        self.blade = 1
        self.head_tilt = 0
        self.visor = 1.0
        self.pack = 0
        self.flash = 0
        self.scatter = 0
        self.hide_blade = False
        self.antenna = 0
        self.cable = 0
        self.rear_arm = 0
        self.blade_drop = 0
        for k, v in kw.items():
            setattr(self, k, v)


def _stroke(img, x0: int, y0: int, x1: int, y1: int, c, thick: int = 1) -> None:
    steps = max(abs(x1 - x0), abs(y1 - y0), 1)
    r2 = thick * thick
    for i in range(steps + 1):
        t = i / steps
        x = int(round(x0 + (x1 - x0) * t))
        y = int(round(y0 + (y1 - y0) * t))
        for dy in range(-thick, thick + 1):
            for dx in range(-thick, thick + 1):
                if dx * dx + dy * dy <= r2:
                    px(img, x + dx, y + dy, c)


def _leg(img, hip, foot, mid, lo, hi, bend: int, thick: int = 3) -> None:
    hx, hy = hip
    fx, fy = foot
    planted = fy >= 60
    kx = (hx + fx) // 2 + (1 if fx >= hx else -1)
    ky = (hy + fy) // 2 + bend
    bevel_rect(img, hx - thick, hy, hx + thick, ky, mid, hi, lo)
    shin_x0 = min(kx, fx) - thick + 1
    shin_x1 = max(kx, fx) + thick - 1
    bevel_rect(img, shin_x0, ky, shin_x1, fy - 3, mid, hi, lo)
    foot_w = 4 if planted else 2
    fill_rect(img, fx - foot_w, fy - 3, fx + foot_w + (1 if planted else 0), fy, lo)
    fill_rect(img, fx - foot_w, fy - 4, fx + (1 if planted else -1), fy - 3, hi)
    if planted:
        px(img, fx + foot_w, fy, INK)
        fill_rect(img, fx - foot_w + 1, fy - 1, fx + 1, fy - 1, hi)


def draw_courier(p: Pose) -> Image.Image:
    img = blank(FS, FS)
    cx = 32 + int(p.lean)
    ground = 62
    crouch = int(p.crouch)
    bob = int(p.bob)
    hip_y = 46 + crouch + bob
    torso_top = 24 + crouch + bob
    head_cy = 20 + crouch + bob + int(p.head_tilt)

    # Backpack / cable (secondary motion, lagged from bob)
    pack_x = cx - 11 + int(p.pack)
    bevel_rect(img, pack_x, torso_top + 2, pack_x + 6, hip_y - 4, STEEL_D, STEEL_M, INK)
    fill_rect(img, pack_x + 1, torso_top + 4, pack_x + 2, torso_top + 10, CYAN_D)
    cable_y = hip_y - 1 + int(p.cable)
    _stroke(img, pack_x + 2, hip_y - 4, pack_x - 1, cable_y, CYAN_D, 1)
    px(img, pack_x - 1, cable_y, CYAN)

    # Rear (left) arm — opposes the sword arm so the run reads as a stride, not a slide
    rear = int(p.rear_arm)
    rax, ray = cx - 9, torso_top + 5
    _stroke(img, rax, ray, rax - 3 - rear, ray + 6 + abs(rear) // 2, STEEL_D, 2)
    fill_ellipse(img, rax - 3 - rear, ray + 7 + abs(rear) // 2, 2, 2, STEEL_M)

    # Rear (left) leg
    _leg(
        img,
        (cx - 5, hip_y),
        (cx - 6 + int(p.l_fwd), ground - int(p.l_lift)),
        STEEL_D, INK, STEEL_M, int(p.l_bend),
    )
    # Front (right) leg
    _leg(
        img,
        (cx + 4, hip_y),
        (cx + 6 + int(p.r_fwd), ground - int(p.r_lift)),
        STEEL_M, STEEL_D, STEEL_L, int(p.r_bend),
    )

    # Pelvis
    bevel_rect(img, cx - 6, hip_y - 3, cx + 6, hip_y + 2, BODY, STEEL_L, STEEL_D)

    # Torso plates
    bevel_rect(img, cx - 8, torso_top, cx + 8, hip_y - 2, BODY, STEEL_L, STEEL_D)
    fill_rect(img, cx - 6, torso_top + 3, cx + 6, torso_top + 4, STEEL_L)
    fill_rect(img, cx - 5, torso_top + 8, cx + 5, torso_top + 9, STEEL_D)
    # Chest core (cyan — player identity)
    fill_rect(img, cx - 2, torso_top + 10, cx + 2, torso_top + 14, CYAN_D)
    fill_rect(img, cx - 1, torso_top + 11, cx + 1, torso_top + 13, CYAN)

    # Rear shoulder
    fill_ellipse(img, cx - 8, torso_top + 4, 3, 3, STEEL_D)

    # Sword arm
    shx, shy = cx + 8, torso_top + 5
    reach = int(p.reach)
    raise_ = int(p.arm_raise)
    back = int(p.arm_back)
    ex = shx + 6 + reach - back
    ey = shy + 4 - raise_ + crouch
    bevel_rect(img, shx - 1, shy - 2, shx + 4, shy + 3, STEEL_M, STEEL_L, STEEL_D)
    bevel_rect(img, shx + 2, shy, ex, ey + 2, STEEL_M, STEEL_L, STEEL_D)
    if not p.hide_blade:
        blade_len = 10 + int(p.blade * 6)
        drop = int(p.blade_drop)
        bx0, by0 = ex + 1, ey
        bx1, by1 = ex + blade_len, ey + drop
        _stroke(img, bx0, by0, bx1, by1, CYAN_D, 2)
        _stroke(img, bx0, by0, bx1 - 1, by1 - (1 if drop else 0), CYAN, 1)
        px(img, bx1, by1, CYAN_GLOW)
        fill_rect(img, ex - 1, ey - 2, ex + 1, ey + 2, STEEL_L)

    # Head / visor — forward snout so the silhouette reads as a courier helm, not a box
    bevel_rect(img, cx - 7, head_cy - 8, cx + 6, head_cy + 4, BODY, STEEL_L, STEEL_D)
    fill_rect(img, cx + 5, head_cy - 4, cx + 10, head_cy + 2, BODY)
    fill_rect(img, cx + 5, head_cy - 4, cx + 10, head_cy - 4, STEEL_L)
    fill_rect(img, cx - 6, head_cy - 7, cx + 5, head_cy - 6, STEEL_H)
    vg = blend(CYAN_D, CYAN_GLOW, p.visor)
    fill_rect(img, cx - 2, head_cy - 3, cx + 9, head_cy + 1, vg)
    fill_rect(img, cx - 2, head_cy - 3, cx + 9, head_cy - 3, CYAN_GLOW)
    fill_rect(img, cx + 3, head_cy - 8, cx + 6, head_cy - 5, STEEL_L)
    ant = int(p.antenna)
    fill_rect(img, cx - 1, head_cy - 12 + ant, cx, head_cy - 8, STEEL_M)
    px(img, cx - 1, head_cy - 13 + ant, CYAN)

    if p.flash > 0:
        overlay = blank(FS, FS)
        for y in range(FS):
            for x in range(FS):
                if img.getpixel((x, y))[3] > 12:
                    overlay.putpixel((x, y), (STEEL_H[0], STEEL_H[1], STEEL_H[2], int(140 * p.flash)))
        img = Image.alpha_composite(img, overlay)

    if p.scatter > 0:
        # Death breakup — offset chunks without changing pivot
        bits = img.copy()
        img = blank(FS, FS)
        ox = int(p.scatter * 4)
        img.paste(bits, (ox, int(p.scatter * 2)), bits)

    if p.squash_x != 1.0 or p.squash_y != 1.0:
        nw = max(8, int(round(FS * p.squash_x)))
        nh = max(8, int(round(FS * p.squash_y)))
        scaled = img.resize((nw, nh), Image.NEAREST)
        out = blank(FS, FS)
        out.paste(scaled, (int(32 - 32 * p.squash_x), int(62 - 62 * p.squash_y)), scaled)
        img = out

    outline(img)
    return img


def lerp_pose(a: Pose, b: Pose, t: float) -> Pose:
    p = Pose()
    for name in Pose.__slots__:
        va, vb = getattr(a, name), getattr(b, name)
        if isinstance(va, bool):
            setattr(p, name, vb if t >= 0.5 else va)
        else:
            setattr(p, name, va + (vb - va) * t)
    return p


def stride_cycle(run: bool) -> list[Pose]:
    """Hand-keyed 8-frame contact cycle. Planted feet hold, passing pose is high,
    opposing arm/blade, antenna lags the bounce. Not a sine slide."""
    # r_fwd, r_lift, r_bend, l_fwd, l_lift, l_bend, bob, lean, arm_back, reach, rear_arm
    if run:
        keys = [
            (6, 0, 0, -5, 8, 2, 1, 2, 4, -2, -3),   # 0 R contact
            (3, 0, 2, -1, 4, 1, 3, 2, 3, -1, -2),   # 1 R down / squash
            (-1, 3, 1, 4, 9, 3, 0, 3, -1, 2, 1),    # 2 passing (L high)
            (-5, 7, 3, 6, 2, 0, -2, 2, -4, 3, 3),   # 3 L reaching down
            (-5, 8, 2, 6, 0, 0, 1, 2, -4, 2, 3),    # 4 L contact
            (-1, 4, 1, 3, 0, 2, 3, 2, -2, 0, 2),    # 5 L down
            (4, 9, 3, -1, 3, 1, 0, 3, 2, -2, -1),   # 6 passing (R high)
            (6, 2, 0, -5, 7, 3, -2, 2, 4, -1, -3),  # 7 R reaching
        ]
        blade = 0.55
    else:
        keys = [
            (4, 0, 0, -3, 5, 1, 1, 0, 2, -1, -2),
            (2, 0, 1, 0, 2, 0, 2, 0, 1, 0, -1),
            (0, 2, 1, 3, 6, 2, 0, 1, -1, 1, 1),
            (-3, 4, 2, 4, 1, 0, -1, 1, -2, 2, 2),
            (-3, 5, 1, 4, 0, 0, 1, 0, -2, 1, 2),
            (0, 2, 0, 2, 0, 1, 2, 0, -1, 0, 1),
            (3, 6, 2, 0, 2, 1, 0, 1, 1, -1, -1),
            (4, 1, 0, -3, 4, 2, -1, 1, 2, -1, -2),
        ]
        blade = 0.45
    frames = []
    for i, k in enumerate(keys):
        rf, rl, rb, lf, ll, lb, bob, lean, ab, reach, rear = k
        frames.append(Pose(
            r_fwd=rf, r_lift=rl, r_bend=rb,
            l_fwd=lf, l_lift=ll, l_bend=lb,
            bob=bob, lean=lean, crouch=1 if bob >= 3 else 0,
            arm_back=ab, reach=reach, rear_arm=rear,
            blade=blade, blade_drop=1 if ab > 0 else 0,
            pack=1 if i % 4 == 1 else (-1 if i % 4 == 3 else 0),
            cable=1 if i % 2 else 0,
            antenna=-1 if bob >= 2 else (1 if bob < 0 else 0),
            visor=0.85 if i % 2 == 0 else 0.7,
            head_tilt=-1 if lean > 1 else 0,
        ))
    return frames


def walk_cycle(n: int, amp: float, speed_bend: float) -> list[Pose]:
    # Kept for swim / melee fallbacks that still want a compact generator.
    if n == 8 and amp >= 1.5:
        return stride_cycle(True)
    if n == 8:
        return stride_cycle(False)
    frames = []
    for i in range(n):
        ph = (i / n) * math.tau
        frames.append(Pose(
            lean=amp * 0.35,
            bob=round(math.sin(ph * 2) * amp * 0.35),
            l_fwd=round(math.sin(ph) * amp * 3),
            r_fwd=round(math.sin(ph + math.pi) * amp * 3),
            l_lift=max(0, round(math.sin(ph) * amp * 3)),
            r_lift=max(0, round(math.sin(ph + math.pi) * amp * 3)),
            l_bend=round((1 - math.cos(ph)) * speed_bend),
            r_bend=round((1 - math.cos(ph + math.pi)) * speed_bend),
            arm_back=round(math.sin(ph + math.pi) * amp * 2),
            reach=round(math.sin(ph) * amp),
            rear_arm=round(math.sin(ph) * amp * 2),
            pack=round(math.sin(ph * 2 + 0.4) * amp * 0.6),
            antenna=round(math.sin(ph * 2 + 1.2) * amp),
            visor=0.75 + 0.15 * math.sin(ph),
        ))
    return frames


def idle_cycle() -> list[Pose]:
    frames = []
    for i in range(6):
        ph = (i / 6) * math.tau
        weight = 1 if i in (1, 2) else (-1 if i in (4, 5) else 0)
        frames.append(Pose(
            bob=round(math.sin(ph) * 1),
            pack=round(math.sin(ph + 0.9) * 1),
            cable=round(math.sin(ph + 1.4) * 1),
            antenna=round(math.sin(ph + 0.4) * 2),
            visor=0.65 + 0.35 * (0.5 + 0.5 * math.sin(ph)),
            blade=0.35,
            blade_drop=2,
            arm_back=1,
            rear_arm=round(math.sin(ph) * 1),
            l_fwd=weight,
            r_fwd=-weight,
            head_tilt=1 if i >= 3 else 0,
        ))
    return frames


def author_player() -> None:
    dest = ASSETS / "characters"
    clips: dict[str, list[Pose]] = {
        "idle": idle_cycle(),
        "walk": stride_cycle(False),
        "run": stride_cycle(True),
        "jump_start": [
            Pose(crouch=5, squash_x=1.14, squash_y=0.86, arm_back=5, blade=0.15, blade_drop=3, rear_arm=2, antenna=2, pack=2),
            Pose(crouch=7, squash_x=1.22, squash_y=0.78, arm_back=6, blade=0.1, blade_drop=4, rear_arm=3, antenna=3, pack=3),
            Pose(crouch=1, l_lift=10, r_lift=6, l_fwd=-2, r_fwd=3, bob=-3, arm_raise=5, reach=3, blade=0.7, rear_arm=-2, antenna=-2, pack=-2),
        ],
        "jump": [
            Pose(bob=-4, l_lift=16, r_lift=10, l_fwd=-4, r_fwd=5, l_bend=4, r_bend=2, arm_raise=6, reach=1, pack=-2, antenna=-2, blade=0.45, blade_drop=-2, rear_arm=-3),
            Pose(bob=-5, l_lift=17, r_lift=12, l_fwd=-3, r_fwd=4, l_bend=3, r_bend=2, arm_raise=7, pack=-2, antenna=-3, blade=0.5, visor=1.0, rear_arm=-2),
            Pose(bob=-4, l_lift=14, r_lift=11, l_bend=2, arm_raise=5, pack=-1, antenna=-1, blade=0.5, rear_arm=-1),
        ],
        "fall": [
            Pose(bob=1, l_lift=3, r_lift=8, l_fwd=-4, r_fwd=3, arm_raise=-2, reach=4, pack=2, antenna=2, blade=0.6, blade_drop=4, rear_arm=3, visor=0.7),
            Pose(bob=2, l_lift=2, r_lift=9, l_fwd=-5, r_fwd=2, arm_raise=-3, reach=5, pack=3, antenna=3, blade=0.7, blade_drop=5, rear_arm=4, visor=0.55),
            Pose(bob=2, l_lift=5, r_lift=6, l_fwd=-2, r_fwd=4, arm_raise=-1, reach=3, pack=2, antenna=2, blade=0.5, blade_drop=3, rear_arm=2),
        ],
        "land": [
            Pose(crouch=6, squash_x=1.2, squash_y=0.8, l_fwd=-3, r_fwd=3, arm_raise=-3, pack=3, antenna=3, blade=0.15, blade_drop=4, rear_arm=2),
            Pose(crouch=3, squash_x=1.08, squash_y=0.92, arm_back=2, pack=1, antenna=1, blade=0.3, blade_drop=2),
            Pose(crouch=1, bob=1, blade=0.4, blade_drop=1, antenna=0),
        ],
        "attack": [
            # Hitbox is 0.15s from press (frames 0-2 at 18fps). F0 is a committed swing, not a rest pose.
            Pose(crouch=2, lean=-1, arm_back=3, reach=2, blade=0.9, blade_drop=-2, rear_arm=3, pack=1, antenna=1),
            Pose(crouch=1, lean=2, arm_back=0, reach=6, blade=1.6, blade_drop=0, visor=1.0, rear_arm=-1, pack=-1),
            Pose(lean=4, reach=9, blade=2.1, blade_drop=1, visor=1.0, flash=0.25, rear_arm=-2, pack=-2, antenna=-1),  # impact hold
            Pose(lean=3, reach=7, blade=1.7, blade_drop=3, arm_raise=1, rear_arm=-1, pack=0),  # follow-through
            Pose(lean=1, reach=3, blade=0.9, blade_drop=4, arm_back=1, rear_arm=1, pack=1, antenna=1),
            Pose(arm_back=2, blade=0.5, blade_drop=3, rear_arm=1, pack=1),
        ],
        "attack_2": [
            Pose(crouch=2, arm_raise=7, blade=0.5, blade_drop=-6, lean=-1, rear_arm=2, pack=2),
            Pose(arm_raise=3, reach=4, blade=1.4, blade_drop=-2, lean=2, crouch=1, visor=1.0),
            Pose(reach=8, blade=2.0, blade_drop=3, lean=3, crouch=1, visor=1.0, flash=0.2, pack=-1),
            Pose(reach=6, blade=1.3, blade_drop=5, lean=2, arm_raise=-2, pack=1),
            Pose(reach=2, blade=0.7, blade_drop=3),
            Pose(arm_back=1, blade=0.4, blade_drop=2),
        ],
        "dash": [
            Pose(lean=4, crouch=2, reach=6, blade=1.2, l_lift=2, r_lift=0, pack=-2),
            Pose(lean=5, reach=8, blade=1.6, l_lift=3, pack=-2, visor=1.0),
            Pose(lean=5, reach=7, blade=1.4, pack=-1),
            Pose(lean=3, reach=4, blade=0.8),
            Pose(lean=1, blade=0.4),
        ],
        "air_dash": [
            Pose(bob=-3, lean=4, l_lift=8, r_lift=6, reach=6, blade=1.2, pack=-2),
            Pose(bob=-3, lean=5, reach=8, blade=1.6, visor=1.0),
            Pose(bob=-3, lean=4, reach=7, blade=1.3),
            Pose(bob=-2, lean=3, reach=4, blade=0.8),
            Pose(bob=-2, lean=1, blade=0.4, l_lift=6, r_lift=5),
        ],
        "wall_slide": [
            Pose(lean=-3, crouch=1, l_fwd=-4, r_fwd=-2, l_lift=2, arm_back=2, pack=1, blade=0.2),
            Pose(lean=-3, crouch=1, l_fwd=-4, r_fwd=-2, l_lift=3, pack=2, visor=0.7),
            Pose(lean=-3, crouch=1, l_fwd=-4, r_fwd=-2, l_lift=2, pack=1),
            Pose(lean=-3, crouch=1, l_fwd=-4, r_fwd=-2, l_lift=1, pack=0, visor=0.9),
        ],
        "wall_jump": [
            Pose(lean=-2, crouch=3, l_lift=2, arm_back=3),
            Pose(lean=2, bob=-3, l_lift=10, r_lift=8, reach=3, arm_raise=3),
            Pose(lean=3, bob=-4, l_lift=11, r_lift=9, reach=4),
            Pose(lean=2, bob=-3, l_lift=8, r_lift=7, reach=2),
        ],
        "double_jump": [
            Pose(bob=-2, l_lift=6, r_lift=8, arm_raise=2, pack=-1),
            Pose(bob=-5, l_lift=12, r_lift=10, arm_raise=5, visor=1.0, pack=-2),
            Pose(bob=-4, l_lift=10, r_lift=9, arm_raise=4),
            Pose(bob=-3, l_lift=8, r_lift=7, arm_raise=2),
        ],
        "hurt": [
            Pose(lean=-3, crouch=2, flash=0.8, visor=0.3, arm_back=3, blade=0.1),
            Pose(lean=-4, crouch=3, flash=0.4, visor=0.2, pack=2),
            Pose(lean=-2, crouch=1, flash=0.15, visor=0.5),
        ],
        "death": [
            Pose(crouch=1, visor=0.8),
            Pose(lean=-2, crouch=2, visor=0.5, flash=0.4),
            Pose(lean=-3, crouch=4, visor=0.3, l_bend=3, r_bend=3),
            Pose(lean=-4, crouch=6, visor=0.15, hide_blade=True),
            Pose(lean=-5, crouch=8, scatter=0.4, visor=0.1, hide_blade=True),
            Pose(lean=-6, crouch=9, scatter=0.7, visor=0.05, hide_blade=True),
            Pose(lean=-6, crouch=10, scatter=1.0, visor=0.0, hide_blade=True),
            Pose(lean=-6, crouch=10, scatter=1.2, visor=0.0, hide_blade=True),
            Pose(lean=-6, crouch=10, scatter=1.3, visor=0.0, hide_blade=True),
            Pose(lean=-6, crouch=10, scatter=1.4, visor=0.0, hide_blade=True),
        ],
        "swim": walk_cycle(6, 0.7, 0.6),
        "swim_idle": idle_cycle()[:5],
        "ground_slam_start": [
            Pose(crouch=2, arm_raise=6, blade=0.3),
            Pose(crouch=1, arm_raise=8, bob=-1, blade=0.4, visor=1.0),
            Pose(bob=-2, arm_raise=4, l_lift=4, blade=0.6),
        ],
        "ground_slam_fall": [
            Pose(bob=1, l_lift=6, r_lift=6, arm_raise=-2, blade=1.0, pack=2),
            Pose(bob=2, l_lift=8, r_lift=8, arm_raise=-3, blade=1.2),
            Pose(bob=3, l_lift=9, r_lift=9, arm_raise=-3, blade=1.4, visor=1.0),
        ],
        "ground_slam_impact": [
            Pose(crouch=6, squash_x=1.22, squash_y=0.78, flash=0.5, blade=0.2),
            Pose(crouch=5, squash_x=1.15, squash_y=0.85, flash=0.25),
            Pose(crouch=3, squash_x=1.08, squash_y=0.92),
            Pose(crouch=2),
            Pose(crouch=1, blade=0.4),
        ],
        "grapple": [
            Pose(arm_raise=4, reach=2, blade=0.2),
            Pose(arm_raise=6, reach=5, blade=0.1, lean=1),
            Pose(arm_raise=7, reach=7, visor=1.0),
            Pose(arm_raise=6, reach=6),
            Pose(arm_raise=4, reach=3, blade=0.3),
        ],
        "phase": [
            Pose(visor=0.4, flash=0.2, pack=1),
            Pose(visor=0.2, flash=0.5, lean=1),
            Pose(visor=0.1, flash=0.7),
            Pose(visor=0.3, flash=0.3),
            Pose(visor=0.8, flash=0.0),
        ],
        "respawn": [
            Pose(scatter=1.2, visor=0.0, hide_blade=True, crouch=8),
            Pose(scatter=0.9, visor=0.1, hide_blade=True, crouch=7),
            Pose(scatter=0.5, visor=0.3, crouch=5),
            Pose(scatter=0.2, visor=0.5, crouch=3, flash=0.3),
            Pose(crouch=2, visor=0.8, flash=0.5),
            Pose(crouch=1, visor=1.0, flash=0.2),
            Pose(bob=-1, visor=1.0),
            Pose(bob=0, visor=0.9, blade=0.4),
        ],
        "interact": [
            Pose(arm_raise=2, reach=2, blade=0.1),
            Pose(arm_raise=3, reach=4, visor=1.0),
            Pose(arm_raise=3, reach=3),
            Pose(arm_raise=1, reach=1, blade=0.3),
        ],
        "ability_acquire": [
            Pose(bob=-1, arm_raise=2, visor=0.8),
            Pose(bob=-2, arm_raise=4, visor=1.0, flash=0.2),
            Pose(bob=-3, arm_raise=6, visor=1.0, flash=0.5),
            Pose(bob=-3, arm_raise=7, flash=0.7),
            Pose(bob=-2, arm_raise=6, flash=0.4),
            Pose(bob=-1, arm_raise=4, flash=0.2),
            Pose(arm_raise=2, visor=1.0),
            Pose(blade=0.4, visor=0.9),
        ],
    }
    # Swim uses the walk generator but lift both feet (no ground plant).
    for p in clips["swim"] + clips["swim_idle"]:
        p.l_lift = max(p.l_lift, 4)
        p.r_lift = max(p.r_lift, 3)
        p.bob -= 1

    for name, poses in clips.items():
        frames = [draw_courier(p) for p in poses]
        save_sheet(dest / f"player_{name}.png", frames)


# ---------------------------------------------------------------------------
# Melee walker — rust, hunched, distinct silhouette from the courier
# ---------------------------------------------------------------------------

def draw_melee(p: Pose) -> Image.Image:
    img = blank(FS, FS)
    cx = 32 + int(p.lean)
    ground = 62
    crouch = int(p.crouch)
    bob = int(p.bob)
    hip_y = 48 + crouch + bob
    torso_top = 30 + crouch + bob
    head_cy = 24 + crouch + bob + int(p.head_tilt)

    pack_x = cx - 13 + int(p.pack)
    bevel_rect(img, pack_x, torso_top, pack_x + 7, hip_y - 2, RUST_D, RUST, INK)

    _leg(img, (cx - 6, hip_y), (cx - 8 + int(p.l_fwd), ground - int(p.l_lift)), RUST_D, INK, RUST, int(p.l_bend))
    _leg(img, (cx + 5, hip_y), (cx + 8 + int(p.r_fwd), ground - int(p.r_lift)), RUST, RUST_D, RUST_L, int(p.r_bend))

    bevel_rect(img, cx - 9, hip_y - 2, cx + 9, hip_y + 3, RUST_D, RUST, INK)
    bevel_rect(img, cx - 10, torso_top, cx + 10, hip_y - 1, RUST, RUST_L, RUST_D)
    fill_rect(img, cx - 7, torso_top + 4, cx + 7, torso_top + 5, RUST_L)
    fill_rect(img, cx - 3, torso_top + 9, cx + 3, torso_top + 14, AMBER_D)
    fill_rect(img, cx - 1, torso_top + 10, cx + 1, torso_top + 13, AMBER)

    # Claw arm — bulkier, lower than courier blade
    shx, shy = cx + 10, torso_top + 6
    reach = int(p.reach)
    back = int(p.arm_back)
    raise_ = int(p.arm_raise)
    ex = shx + 5 + reach - back
    ey = shy + 6 - raise_
    bevel_rect(img, shx - 2, shy - 3, shx + 4, shy + 4, RUST, RUST_L, RUST_D)
    bevel_rect(img, shx + 2, shy, ex + 2, ey + 3, RUST, RUST_L, RUST_D)
    # Three-finger claw
    fill_rect(img, ex, ey - 2, ex + 6, ey - 1, RUST_L)
    fill_rect(img, ex + 1, ey, ex + 8, ey + 1, AMBER)
    fill_rect(img, ex, ey + 3, ex + 5, ey + 4, RUST_D)

    # Heavy helm — no visor slit like the player; glowing amber eyes
    bevel_rect(img, cx - 8, head_cy - 7, cx + 8, head_cy + 5, RUST, RUST_L, RUST_D)
    fill_rect(img, cx - 7, head_cy - 6, cx + 7, head_cy - 5, RUST_L)
    fill_rect(img, cx - 5, head_cy - 1, cx - 2, head_cy + 1, AMBER)
    fill_rect(img, cx + 2, head_cy - 1, cx + 5, head_cy + 1, AMBER)
    fill_rect(img, cx - 2, head_cy + 2, cx + 2, head_cy + 4, RUST_D)

    if p.flash > 0:
        overlay = blank(FS, FS)
        for y in range(FS):
            for x in range(FS):
                if img.getpixel((x, y))[3] > 12:
                    overlay.putpixel((x, y), (AMBER[0], AMBER[1], AMBER[2], int(120 * p.flash)))
        img = Image.alpha_composite(img, overlay)
    if p.scatter > 0:
        bits = img.copy()
        img = blank(FS, FS)
        img.paste(bits, (int(p.scatter * 3), int(p.scatter * 4)), bits)
    outline(img)
    return img


def author_enemy() -> None:
    dest = ASSETS / "enemies"
    idle = []
    for i in range(6):
        ph = (i / 6) * math.tau
        idle.append(Pose(
            bob=round(math.sin(ph) * 1),
            crouch=2,
            pack=round(math.sin(ph + 0.5)),
            cable=round(math.sin(ph + 1.1)),
            visor=0.8,
            arm_back=1,
            rear_arm=round(math.sin(ph)),
            l_fwd=1 if i < 3 else -1,
        ))
    walk = stride_cycle(False)
    for p in walk:
        p.crouch = 2
        p.blade = 0
        p.hide_blade = True
        p.lean = max(p.lean, 1)
    attack = [
        Pose(crouch=3, arm_back=6, lean=-2, pack=2),
        Pose(crouch=3, arm_back=7, lean=-3, pack=2),  # telegraph hold
        Pose(reach=8, lean=4, crouch=1, visor=1.0, flash=0.2),  # strike
        Pose(reach=9, lean=5, visor=1.0),  # impact hold
        Pose(reach=4, lean=2, crouch=2),
        Pose(arm_back=1, lean=0, crouch=2),
    ]
    hurt = [
        Pose(lean=-3, crouch=2, flash=0.8),
        Pose(lean=-4, crouch=3, flash=0.4),
        Pose(lean=-2, crouch=1, flash=0.15),
    ]
    death = [
        Pose(crouch=1),
        Pose(lean=-2, crouch=3, flash=0.4),
        Pose(lean=-4, crouch=6, scatter=0.3),
        Pose(lean=-5, crouch=8, scatter=0.7, flash=0.2),
        Pose(lean=-6, crouch=10, scatter=1.1),
        Pose(lean=-6, crouch=10, scatter=1.4),
        Pose(lean=-6, crouch=10, scatter=1.5),
        Pose(lean=-6, crouch=10, scatter=1.6),
    ]
    clips = {
        "idle": idle,
        "walk": walk,
        "attack": attack,
        "hurt": hurt,
        "death": death,
    }
    for name, poses in clips.items():
        save_sheet(dest / f"enemy_000_{name}.png", [draw_melee(p) for p in poses])
    meta = {
        "idle": {"frameCount": 6, "fps": 8, "loop": True},
        "walk": {"frameCount": 8, "fps": 10, "loop": True},
        "attack": {"frameCount": 6, "fps": 12, "loop": False},
        "hurt": {"frameCount": 3, "fps": 14, "loop": False},
        "death": {"frameCount": 8, "fps": 10, "loop": False},
    }
    (dest / "enemy_000_animations.json").write_text(json.dumps(meta, indent=2) + "\n")


def draw_ranged(p: Pose) -> Image.Image:
    """Tall thin rust cannon-walker — not a claw melee recolor."""
    img = blank(FS, FS)
    cx = 32 + int(p.lean)
    ground = 62
    crouch = int(p.crouch)
    bob = int(p.bob)
    hip_y = 50 + crouch + bob
    torso_top = 22 + crouch + bob
    head_cy = 16 + crouch + bob + int(p.head_tilt)

    _leg(img, (cx - 4, hip_y), (cx - 5 + int(p.l_fwd), ground - int(p.l_lift)), RUST_D, INK, RUST, int(p.l_bend), 2)
    _leg(img, (cx + 3, hip_y), (cx + 5 + int(p.r_fwd), ground - int(p.r_lift)), RUST, RUST_D, RUST_L, int(p.r_bend), 2)

    bevel_rect(img, cx - 5, hip_y - 2, cx + 5, hip_y + 2, RUST_D, RUST, INK)
    bevel_rect(img, cx - 6, torso_top, cx + 6, hip_y - 1, RUST, RUST_L, RUST_D)
    fill_rect(img, cx - 3, torso_top + 6, cx + 3, torso_top + 12, RUST_D)
    fill_rect(img, cx - 1, torso_top + 8, cx + 1, torso_top + 11, AMBER_D)

    # Shoulder cannon
    shx, shy = cx + 6, torso_top + 4
    reach = int(p.reach)
    back = int(p.arm_back)
    raise_ = int(p.arm_raise)
    barrel_x = shx + 4 + reach - back
    barrel_y = shy - raise_
    bevel_rect(img, shx - 2, shy - 3, shx + 3, shy + 3, RUST, RUST_L, RUST_D)
    fill_rect(img, shx + 2, barrel_y - 2, barrel_x + 8, barrel_y + 2, RUST_D)
    fill_rect(img, shx + 3, barrel_y - 1, barrel_x + 7, barrel_y + 1, RUST_L)
    if p.flash > 0:
        fill_rect(img, barrel_x + 8, barrel_y - 2, barrel_x + 12, barrel_y + 2, AMBER)
        px(img, barrel_x + 13, barrel_y, AMBER)

    # Narrow helm, single amber optic
    bevel_rect(img, cx - 5, head_cy - 6, cx + 5, head_cy + 3, RUST_D, RUST, INK)
    fill_rect(img, cx - 2, head_cy - 2, cx + 4, head_cy + 1, AMBER if p.visor > 0.6 else AMBER_D)
    fill_rect(img, cx + 2, head_cy - 7, cx + 4, head_cy - 5, RUST_L)

    if p.scatter > 0:
        bits = img.copy()
        img = blank(FS, FS)
        img.paste(bits, (int(p.scatter * 3), int(p.scatter * 3)), bits)
    outline(img)
    return img


def draw_flyer(p: Pose) -> Image.Image:
    """Hovering rust chassis — rotors, no walk cycle, exhaust wash."""
    img = blank(FS, FS)
    cx = 32 + int(p.lean)
    bob = int(p.bob)
    body_y = 34 + bob

    # Rotor disks
    spin = int(p.reach)
    fill_ellipse(img, cx - 14, body_y - 8, 7 + (spin % 2), 2, RUST_D)
    fill_ellipse(img, cx + 14, body_y - 8, 7 + ((spin + 1) % 2), 2, RUST_D)
    fill_rect(img, cx - 16, body_y - 8, cx - 12, body_y - 8, RUST_L)
    fill_rect(img, cx + 12, body_y - 8, cx + 16, body_y - 8, RUST_L)

    # Struts
    _stroke(img, cx - 10, body_y - 6, cx - 6, body_y, RUST, 1)
    _stroke(img, cx + 10, body_y - 6, cx + 6, body_y, RUST, 1)

    bevel_rect(img, cx - 9, body_y - 4, cx + 9, body_y + 10, RUST, RUST_L, RUST_D)
    fill_rect(img, cx - 4, body_y, cx + 4, body_y + 6, AMBER_D)
    fill_rect(img, cx - 2, body_y + 1, cx + 2, body_y + 5, AMBER if p.visor > 0.5 else AMBER_D)

    # Chin optic
    fill_rect(img, cx - 3, body_y + 8, cx + 3, body_y + 11, RUST_D)
    fill_rect(img, cx - 1, body_y + 9, cx + 1, body_y + 10, AMBER)

    # Exhaust
    wash = 3 + abs(int(p.pack))
    fill_ellipse(img, cx - 4, body_y + 14, 2, wash, (RUST_L[0], RUST_L[1], RUST_L[2], 90))
    fill_ellipse(img, cx + 4, body_y + 14, 2, wash, (RUST_L[0], RUST_L[1], RUST_L[2], 90))
    if p.flash > 0:
        fill_ellipse(img, cx, body_y + 4, 6, 4, (AMBER[0], AMBER[1], AMBER[2], int(100 * p.flash)))

    if p.scatter > 0:
        bits = img.copy()
        img = blank(FS, FS)
        img.paste(bits, (int(p.scatter * 4), int(p.scatter * -2)), bits)
    outline(img)
    return img


def draw_npc_actor(p: Pose) -> Image.Image:
    """Stocky steel lantern-keeper — not a cyan courier recolor."""
    img = blank(FS, FS)
    cx = 32 + int(p.lean)
    ground = 62
    crouch = int(p.crouch)
    bob = int(p.bob)
    hip_y = 48 + crouch + bob
    torso_top = 28 + crouch + bob
    head_cy = 22 + crouch + bob + int(p.head_tilt)

    _leg(img, (cx - 6, hip_y), (cx - 7 + int(p.l_fwd), ground - int(p.l_lift)), STEEL_D, INK, STEEL_M, int(p.l_bend))
    _leg(img, (cx + 5, hip_y), (cx + 7 + int(p.r_fwd), ground - int(p.r_lift)), STEEL_M, STEEL_D, STEEL_L, int(p.r_bend))

    bevel_rect(img, cx - 8, hip_y - 2, cx + 8, hip_y + 3, STEEL_D, STEEL_M, INK)
    bevel_rect(img, cx - 9, torso_top, cx + 9, hip_y - 1, BODY, STEEL_L, STEEL_D)
    fill_rect(img, cx - 5, torso_top + 4, cx + 5, torso_top + 5, STEEL_L)
    # Tool belt, not a cyan core
    fill_rect(img, cx - 6, hip_y - 1, cx + 6, hip_y + 1, AMBER_D)
    px(img, cx - 3, hip_y, ASH)
    px(img, cx + 3, hip_y, ASH)

    # Lantern arm
    shx, shy = cx + 9, torso_top + 5
    lx = shx + 3 + int(p.reach)
    ly = shy + 8 - int(p.arm_raise) + int(p.blade_drop)
    _stroke(img, shx, shy, lx, ly, STEEL_M, 2)
    fill_ellipse(img, lx, ly + 3, 3, 4, AMBER_D)
    fill_ellipse(img, lx, ly + 3, 2, 2, AMBER if p.visor > 0.5 else AMBER_D)
    px(img, lx, ly - 1, STEEL_L)

    # Rounder helm, no snout, no visor slit
    fill_ellipse(img, cx, head_cy - 1, 8, 7, STEEL_M)
    fill_ellipse(img, cx, head_cy - 2, 6, 5, STEEL_L)
    fill_rect(img, cx - 4, head_cy, cx + 4, head_cy + 2, STEEL_D)
    px(img, cx - 2, head_cy, ASH)
    px(img, cx + 2, head_cy, ASH)
    # Small lamp on helm
    px(img, cx, head_cy - 9 + int(p.antenna), AMBER)

    outline(img)
    return img


def _write_actor_meta(path: Path, meta: dict) -> None:
    path.write_text(json.dumps(meta, indent=2) + "\n")


def author_npc() -> None:
    dest = ASSETS / "npcs"
    idle = []
    for i in range(6):
        ph = (i / 6) * math.tau
        look = 1 if i in (2, 3) else (-1 if i in (4, 5) else 0)
        idle.append(Pose(
            bob=round(math.sin(ph)),
            head_tilt=look,
            reach=round(math.sin(ph + 0.6)),
            blade_drop=round(math.sin(ph + 0.6) * 2),
            visor=0.6 + 0.4 * (0.5 + 0.5 * math.sin(ph)),
            antenna=round(math.sin(ph + 1.2)),
            l_fwd=1 if i < 3 else -1,
            r_fwd=-1 if i < 3 else 1,
        ))
    talk = [
        Pose(bob=0, reach=1, arm_raise=1, visor=0.8, head_tilt=0),
        Pose(bob=-1, reach=2, arm_raise=3, visor=1.0, head_tilt=-1),
        Pose(bob=0, reach=3, arm_raise=2, visor=1.0, head_tilt=1),
        Pose(bob=0, reach=2, arm_raise=1, visor=0.9, head_tilt=0),
    ]
    walk = stride_cycle(False)
    for p in walk:
        p.blade = 0
        p.hide_blade = True
        p.lean = 0
        p.crouch = 1
    save_sheet(dest / "npc_000_idle.png", [draw_npc_actor(p) for p in idle])
    save_sheet(dest / "npc_000_walk.png", [draw_npc_actor(p) for p in walk])
    save_sheet(dest / "npc_000_talk.png", [draw_npc_actor(p) for p in talk])
    _write_actor_meta(dest / "npc_000_animations.json", {
        "idle": {"frameCount": 6, "fps": 6, "loop": True},
        "walk": {"frameCount": 8, "fps": 8, "loop": True},
        "talk": {"frameCount": 4, "fps": 8, "loop": True},
    })


def author_ranged() -> None:
    dest = ASSETS / "enemies"
    idle = []
    for i in range(6):
        ph = (i / 6) * math.tau
        idle.append(Pose(
            bob=round(math.sin(ph)),
            arm_back=round(math.sin(ph) * 1),
            visor=0.5 + 0.5 * (0.5 + 0.5 * math.sin(ph * 2)),
            crouch=0,
        ))
    walk = stride_cycle(False)
    for p in walk:
        p.crouch = 0
        p.lean = 1
        p.blade = 0
    attack = [
        Pose(arm_back=2, crouch=1, lean=-1),
        Pose(arm_back=1, reach=2, visor=1.0),
        Pose(reach=4, flash=0.9, visor=1.0, lean=1),  # muzzle
        Pose(reach=3, arm_back=-2, flash=0.3, lean=2),  # recoil
        Pose(reach=1, arm_back=0, lean=1),
        Pose(arm_back=1),
    ]
    hurt = [
        Pose(lean=-3, crouch=1, flash=0.7),
        Pose(lean=-4, crouch=2, flash=0.3),
        Pose(lean=-2, flash=0.1),
    ]
    death = [
        Pose(),
        Pose(lean=-2, crouch=2, flash=0.4),
        Pose(lean=-3, crouch=4, scatter=0.3),
        Pose(lean=-4, crouch=6, scatter=0.7),
        Pose(lean=-5, crouch=8, scatter=1.1),
        Pose(lean=-5, crouch=8, scatter=1.4),
        Pose(lean=-5, crouch=8, scatter=1.5),
        Pose(lean=-5, crouch=8, scatter=1.6),
    ]
    clips = {"idle": idle, "walk": walk, "attack": attack, "hurt": hurt, "death": death}
    for name, poses in clips.items():
        save_sheet(dest / f"enemy_001_{name}.png", [draw_ranged(p) for p in poses])
    _write_actor_meta(dest / "enemy_001_animations.json", {
        "idle": {"frameCount": 6, "fps": 8, "loop": True},
        "walk": {"frameCount": 8, "fps": 10, "loop": True},
        "attack": {"frameCount": 6, "fps": 12, "loop": False},
        "hurt": {"frameCount": 3, "fps": 14, "loop": False},
        "death": {"frameCount": 8, "fps": 10, "loop": False},
    })


def author_flyer() -> None:
    dest = ASSETS / "enemies"
    fly = []
    for i in range(6):
        ph = (i / 6) * math.tau
        fly.append(Pose(
            bob=round(math.sin(ph) * 2),
            pack=round(math.sin(ph * 2) * 2),
            reach=i % 2,
            visor=0.6 + 0.4 * (0.5 + 0.5 * math.sin(ph)),
            lean=round(math.sin(ph) * 1),
        ))
    attack = [
        Pose(bob=2, pack=1, visor=0.8),
        Pose(bob=-1, lean=2, pack=0, visor=1.0),  # dip
        Pose(bob=-2, lean=3, flash=0.8, visor=1.0, pack=3),  # spit
        Pose(bob=0, lean=1, flash=0.3, pack=2),
        Pose(bob=1, pack=1),
        Pose(bob=2, pack=1),
    ]
    hurt = [
        Pose(lean=-3, bob=-1, flash=0.8),
        Pose(lean=-4, bob=1, flash=0.4, pack=3),
        Pose(lean=-2, flash=0.15),
    ]
    death = [
        Pose(bob=0),
        Pose(lean=2, bob=2, flash=0.4),
        Pose(lean=3, scatter=0.4, bob=3),
        Pose(lean=4, scatter=0.8, bob=4),
        Pose(scatter=1.2, bob=5),
        Pose(scatter=1.5, bob=6),
        Pose(scatter=1.6, bob=7),
        Pose(scatter=1.7, bob=8),
    ]
    clips = {"idle": fly, "walk": fly, "fly": fly, "attack": attack, "hurt": hurt, "death": death}
    for name, poses in clips.items():
        save_sheet(dest / f"enemy_002_{name}.png", [draw_flyer(p) for p in poses])
    _write_actor_meta(dest / "enemy_002_animations.json", {
        "idle": {"frameCount": 6, "fps": 10, "loop": True},
        "walk": {"frameCount": 6, "fps": 10, "loop": True},
        "fly": {"frameCount": 6, "fps": 10, "loop": True},
        "attack": {"frameCount": 6, "fps": 12, "loop": False},
        "hurt": {"frameCount": 3, "fps": 14, "loop": False},
        "death": {"frameCount": 8, "fps": 10, "loop": False},
    })


BS = 160  # boss canvas — constitution silhouette, collision stays 80x96


def draw_boss(p: Pose, kind: str = "idle") -> Image.Image:
    """Wide furnace hulk. Amber core is the gameplay tell. Not a scaled courier."""
    img = blank(BS, BS)
    cx = 80 + int(p.lean)
    ground = 152
    crouch = int(p.crouch)
    bob = int(p.bob)
    hip_y = 118 + crouch + bob
    torso_top = 58 + crouch + bob
    head_cy = 48 + crouch + bob + int(p.head_tilt)

    # Piston legs
    def boss_leg(hx, fx, fy, mid, lo, hi):
        bevel_rect(img, hx - 7, hip_y, hx + 7, (hip_y + fy) // 2, mid, hi, lo)
        bevel_rect(img, min(hx, fx) - 6, (hip_y + fy) // 2, max(hx, fx) + 6, fy - 6, mid, hi, lo)
        fill_rect(img, fx - 10, fy - 6, fx + 10, fy, lo)
        fill_rect(img, fx - 10, fy - 7, fx + 4, fy - 5, hi)

    lf = cx - 22 + int(p.l_fwd)
    rf = cx + 22 + int(p.r_fwd)
    boss_leg(cx - 18, lf, ground - int(p.l_lift), STEEL_D, INK, STEEL_M)
    boss_leg(cx + 16, rf, ground - int(p.r_lift), STEEL_M, STEEL_D, STEEL_L)

    # Pelvis / hopper
    bevel_rect(img, cx - 28, hip_y - 8, cx + 28, hip_y + 8, STEEL_D, STEEL_M, INK)

    # Torso — wide furnace
    bevel_rect(img, cx - 32, torso_top, cx + 32, hip_y - 6, BODY, STEEL_L, STEEL_D)
    fill_rect(img, cx - 26, torso_top + 8, cx + 26, torso_top + 10, STEEL_L)
    fill_rect(img, cx - 24, torso_top + 18, cx + 24, torso_top + 20, STEEL_D)
    # Amber core
    core = AMBER if p.visor > 0.55 else AMBER_D
    fill_ellipse(img, cx, torso_top + 28, 10, 12, AMBER_D)
    fill_ellipse(img, cx, torso_top + 28, 7, 9, core)
    fill_ellipse(img, cx - 2, torso_top + 25, 3, 3, STEEL_H if p.visor > 0.8 else AMBER)
    if p.flash > 0:
        overlay = blank(BS, BS)
        for y in range(BS):
            for x in range(BS):
                if img.getpixel((x, y))[3] > 12:
                    overlay.putpixel((x, y), (AMBER[0], AMBER[1], AMBER[2], int(110 * p.flash)))
        img = Image.alpha_composite(img, overlay)

    # Shoulder stacks + hanging cables
    bevel_rect(img, cx - 38, torso_top + 4, cx - 26, torso_top + 22, STEEL_M, STEEL_L, STEEL_D)
    bevel_rect(img, cx + 26, torso_top + 4, cx + 38, torso_top + 22, STEEL_M, STEEL_L, STEEL_D)
    cab = int(p.cable)
    _stroke(img, cx - 32, torso_top + 22, cx - 36, torso_top + 40 + cab, CYAN_D, 1)
    _stroke(img, cx + 32, torso_top + 22, cx + 38, torso_top + 38 - cab, INK, 1)

    # Weapon arm
    shx, shy = cx + 34, torso_top + 14
    raise_ = int(p.arm_raise)
    reach = int(p.reach)
    back = int(p.arm_back)
    wx = shx + 10 + reach - back
    wy = shy + 18 - raise_ + crouch
    bevel_rect(img, shx - 4, shy - 6, shx + 10, shy + 8, STEEL_M, STEEL_L, STEEL_D)
    bevel_rect(img, shx + 4, shy, wx, wy + 6, STEEL_M, STEEL_L, STEEL_D)
    if kind == "projectile":
        fill_rect(img, wx, wy - 4, wx + 22, wy + 4, STEEL_D)
        fill_rect(img, wx + 2, wy - 2, wx + 20, wy + 2, RUST_L)
        if p.flash > 0:
            fill_rect(img, wx + 22, wy - 3, wx + 30, wy + 3, AMBER)
    elif kind == "burst":
        fill_ellipse(img, cx, torso_top + 28, 18, 16, (AMBER[0], AMBER[1], AMBER[2], 80))
        fill_rect(img, cx - 40, torso_top + 20, cx - 28, torso_top + 26, AMBER)
        fill_rect(img, cx + 28, torso_top + 20, cx + 40, torso_top + 26, AMBER)
    else:
        # Hammer slab
        fill_rect(img, wx - 4, wy - 6, wx + 18, wy + 10, STEEL_D)
        fill_rect(img, wx - 2, wy - 4, wx + 16, wy + 8, STEEL_M)
        fill_rect(img, wx, wy - 2, wx + 14, wy + 2, AMBER_D if kind == "telegraph" else STEEL_L)

    # Heavy helm
    bevel_rect(img, cx - 16, head_cy - 14, cx + 16, head_cy + 8, BODY, STEEL_L, STEEL_D)
    fill_rect(img, cx - 14, head_cy - 12, cx + 14, head_cy - 10, STEEL_H)
    fill_rect(img, cx - 10, head_cy - 4, cx - 4, head_cy + 2, AMBER)
    fill_rect(img, cx + 4, head_cy - 4, cx + 10, head_cy + 2, AMBER)
    fill_rect(img, cx - 4, head_cy + 3, cx + 4, head_cy + 6, STEEL_D)

    if p.scatter > 0:
        bits = img.copy()
        img = blank(BS, BS)
        img.paste(bits, (int(p.scatter * 6), int(p.scatter * 8)), bits)
    outline(img)
    return img


def author_boss() -> None:
    dest = ASSETS / "bosses"
    idle = []
    for i in range(6):
        ph = (i / 6) * math.tau
        idle.append(Pose(
            bob=round(math.sin(ph)),
            cable=round(math.sin(ph + 0.8) * 2),
            visor=0.55 + 0.45 * (0.5 + 0.5 * math.sin(ph)),
            crouch=1 if math.sin(ph) > 0.3 else 0,
            pack=round(math.sin(ph + 1.2)),
        ))
    walk = []
    for i, key in enumerate(stride_cycle(False)):
        walk.append(Pose(
            l_fwd=key.l_fwd * 2,
            r_fwd=key.r_fwd * 2,
            l_lift=key.l_lift,
            r_lift=key.r_lift,
            bob=key.bob,
            lean=key.lean,
            visor=0.7,
            cable=key.pack,
            crouch=1,
        ))
    telegraph = [
        Pose(crouch=2, arm_back=4, arm_raise=2, visor=0.7, cable=1),
        Pose(crouch=3, arm_back=6, arm_raise=6, visor=0.9, flash=0.15, cable=2),
        Pose(crouch=3, arm_back=8, arm_raise=10, visor=1.0, flash=0.35, cable=2),
        Pose(crouch=3, arm_back=8, arm_raise=11, visor=1.0, flash=0.5, cable=1),
    ]
    slam = [
        Pose(crouch=2, arm_raise=18, arm_back=2, visor=1.0),
        Pose(crouch=1, arm_raise=10, reach=4, visor=1.0),
        Pose(crouch=7, reach=12, arm_raise=-10, flash=0.45, visor=1.0),
        Pose(crouch=5, reach=8, arm_raise=-6, flash=0.2),
        Pose(crouch=3, reach=3, arm_raise=-2),
        Pose(crouch=1, visor=0.6),
    ]
    proj = [
        Pose(arm_back=2, visor=0.8),
        Pose(reach=4, arm_raise=2, visor=1.0),
        Pose(reach=8, flash=0.7, visor=1.0),
        Pose(reach=6, arm_back=-2, flash=0.3),
        Pose(reach=2),
        Pose(visor=0.6),
    ]
    burst = [
        Pose(crouch=1, visor=0.8),
        Pose(crouch=2, visor=1.0, flash=0.2),
        Pose(crouch=1, visor=1.0, flash=0.8, reach=4),
        Pose(flash=0.4, reach=2),
        Pose(visor=0.7),
        Pose(visor=0.55),
    ]
    recovery = [
        Pose(crouch=4, pack=2, visor=0.4, cable=2),
        Pose(crouch=3, pack=1, visor=0.5, cable=1),
        Pose(crouch=2, visor=0.55),
        Pose(crouch=1, visor=0.6),
    ]
    hurt = [
        Pose(lean=-4, crouch=3, flash=0.8, visor=0.3),
        Pose(lean=-5, crouch=4, flash=0.4, visor=0.25),
        Pose(lean=-2, crouch=2, flash=0.15, visor=0.5),
    ]
    death = [
        Pose(crouch=1, visor=0.8),
        Pose(crouch=3, lean=-2, visor=0.5, flash=0.4),
        Pose(crouch=6, lean=-4, visor=0.3),
        Pose(crouch=10, lean=-5, scatter=0.3, visor=0.15),
        Pose(crouch=14, lean=-6, scatter=0.7, visor=0.05),
        Pose(crouch=16, scatter=1.1, visor=0.0),
        Pose(crouch=16, scatter=1.4, visor=0.0),
        Pose(crouch=16, scatter=1.6, visor=0.0),
    ]

    def dump(name: str, poses: list[Pose], kind: str = "idle") -> None:
        frames = [draw_boss(p, kind) for p in poses]
        save_sheet(dest / f"boss_final_{name}.png", frames)

    dump("idle", idle)
    dump("walk", walk)
    dump("locomotion", walk)
    dump("telegraph", telegraph, "telegraph")
    dump("attack", slam)
    dump("attack_projectile", proj, "projectile")
    dump("attack_burst", burst, "burst")
    dump("recovery", recovery)
    dump("hurt", hurt)
    dump("death", death)
    _write_actor_meta(dest / "boss_final_animations.json", {
        "idle": {"frameCount": 6, "fps": 6, "loop": True},
        "walk": {"frameCount": 8, "fps": 6, "loop": True},
        "locomotion": {"frameCount": 8, "fps": 6, "loop": True},
        "telegraph": {"frameCount": 4, "fps": 8, "loop": True},
        "attack": {"frameCount": 6, "fps": 12, "loop": False},
        "attack_projectile": {"frameCount": 6, "fps": 12, "loop": False},
        "attack_burst": {"frameCount": 6, "fps": 12, "loop": False},
        "recovery": {"frameCount": 4, "fps": 8, "loop": True},
        "hurt": {"frameCount": 3, "fps": 12, "loop": False},
        "death": {"frameCount": 8, "fps": 8, "loop": False},
    })


# ---------------------------------------------------------------------------
# Tileset 8x6 x 32px — roles consumed by RoomTileMap / tile-layout.ts
# ---------------------------------------------------------------------------

class TilePalette:
    def __init__(self, mid, hi, lo, stain=None, growth=None):
        self.mid = mid
        self.hi = hi
        self.lo = lo
        self.stain = stain
        self.growth = growth


PAL_FOUNDRY = TilePalette(STEEL_M, STEEL_L, STEEL_D)
PAL_FLOOD = TilePalette((45, 84, 86, 255), (159, 199, 194, 255), (22, 44, 48, 255), stain=(36, 70, 78, 255))
PAL_GROWTH = TilePalette((48, 68, 44, 255), (138, 168, 96, 255), (24, 36, 22, 255), growth=(74, 110, 52, 255))


def steel_panel(wear: float = 0.0, moss: float = 0.0, crack: bool = False, platform: bool = False, pal: TilePalette | None = None) -> Image.Image:
    pal = pal or PAL_FOUNDRY
    img = blank(TS, TS)
    base = blend(pal.mid, pal.lo, wear * 0.45)
    hi = blend(pal.hi, pal.mid, wear * 0.3)
    lo = blend(pal.lo, INK, 0.2)
    bevel_rect(img, 0, 0, TS - 1, TS - 1, base, hi, lo)
    fill_rect(img, 1, 10, TS - 2, 10, lo)
    fill_rect(img, 1, 21, TS - 2, 21, lo)
    fill_rect(img, 10, 1, 10, TS - 2, lo)
    fill_rect(img, 21, 1, 21, TS - 2, lo)
    for rx, ry in ((3, 3), (28, 3), (3, 28), (28, 28), (15, 3), (15, 28)):
        px(img, rx, ry, hi)
        px(img, rx + 1, ry + 1, lo)
    if pal.stain is not None:
        for y in range(18, TS):
            for x in range(TS):
                if (x * 5 + y * 3) % 7 < 2:
                    r, g, b, a = img.getpixel((x, y))
                    img.putpixel((x, y), blend((r, g, b, a), pal.stain, 0.45))
        fill_rect(img, 4, 2, 6, 8, blend(hi, pal.stain, 0.6))
    if platform:
        fill_rect(img, 0, 0, TS - 1, 4, pal.hi)
        fill_rect(img, 0, 0, TS - 1, 1, STEEL_H if pal is PAL_FOUNDRY else pal.hi)
        fill_rect(img, 0, 5, TS - 1, 6, INK)
        for y in range(8, TS):
            for x in range(TS):
                pix = img.getpixel((x, y))
                img.putpixel((x, y), blend(pix, SOOT, 0.55))
    if crack:
        for i in range(8):
            px(img, 14 + (i // 4), 6 + i * 2, INK)
            px(img, 15 + (i // 4), 7 + i * 2, pal.lo)
    grow = moss + (1.4 if pal.growth else 0)
    if grow > 0:
        gcol = pal.growth or (int(pal.mid[0] * 0.7), min(255, int(pal.mid[1] * 1.05 + 18)), int(pal.mid[2] * 0.75), 255)
        for y in range(TS):
            for x in range(TS):
                n = (x * 13 + y * 7) % 11
                if n < grow * 3 and (y > 16 or pal.growth):
                    r, g, b, a = img.getpixel((x, y))
                    img.putpixel((x, y), blend((r, g, b, a), gcol, 0.55 if pal.growth else 0.4))
        if pal.growth:
            for x in range(0, TS, 7):
                _stroke(img, x + 2, 0, x + 1, 8, pal.growth, 1)
    return img


def edge_mask_tile(mask: int, pal: TilePalette | None = None) -> Image.Image:
    pal = pal or PAL_FOUNDRY
    img = blank(TS, TS)
    panel = steel_panel(pal=pal)
    img.paste(panel, (0, 0))
    n, e, s, w = mask & 1, mask & 2, mask & 4, mask & 8
    if not n:
        fill_rect(img, 0, 0, TS - 1, 2, pal.hi)
    if not s:
        fill_rect(img, 0, TS - 3, TS - 1, TS - 1, pal.lo)
    if not w:
        fill_rect(img, 0, 0, 2, TS - 1, pal.hi)
    if not e:
        fill_rect(img, TS - 3, 0, TS - 1, TS - 1, pal.lo)
    return img


def author_tileset(biome_id: str = "biome_0", pal: TilePalette | None = None) -> None:
    pal = pal or PAL_FOUNDRY
    atlas = blank(TS * 8, TS * 6)
    roles = {
        (0, 0): steel_panel(pal=pal),
        (1, 0): steel_panel(wear=0.15, pal=pal),
        (2, 0): steel_panel(wear=0.1, pal=pal),
        (3, 0): steel_panel(platform=True, pal=pal),
        (4, 0): edge_mask_tile(2 | 4 | 8, pal),
        (5, 0): edge_mask_tile(1 | 4 | 8, pal),
        (6, 0): edge_mask_tile(2 | 4 | 8, pal),
        (7, 0): edge_mask_tile(1 | 2 | 8, pal),
        (0, 1): steel_panel(pal=pal),
        (1, 1): steel_panel(pal=pal),
        (2, 1): steel_panel(pal=pal),
        (3, 1): steel_panel(pal=pal),
        (4, 1): steel_panel(pal=pal),
        (5, 1): steel_panel(pal=pal),
        (6, 1): steel_panel(pal=pal),
        (7, 1): steel_panel(pal=pal),
        (0, 2): steel_panel(platform=True, pal=pal),
        (1, 2): steel_panel(platform=True, pal=pal),
        (2, 2): steel_panel(platform=True, pal=pal),
        (3, 2): steel_panel(pal=pal),
        (4, 2): steel_panel(crack=True, pal=pal),
        (5, 2): steel_panel(pal=pal),
        (6, 2): steel_panel(wear=0.4, pal=pal),
        (7, 2): steel_panel(moss=1.0, pal=pal),
        (0, 3): steel_panel(wear=0.55, pal=pal),
        (1, 3): steel_panel(wear=0.55, pal=pal),
        (2, 3): steel_panel(wear=0.4, pal=pal),
        (3, 3): steel_panel(platform=True, wear=0.4, pal=pal),
        (4, 3): steel_panel(crack=True, pal=pal),
        (5, 3): steel_panel(crack=True, wear=0.3, pal=pal),
        (0, 4): steel_panel(moss=1.2, pal=pal),
        (1, 4): steel_panel(moss=1.0, wear=0.2, pal=pal),
        (2, 4): steel_panel(moss=0.8, pal=pal),
        (3, 4): steel_panel(platform=True, moss=0.8, pal=pal),
        (4, 4): steel_panel(wear=0.7, crack=True, pal=pal),
        (5, 4): steel_panel(wear=0.7, moss=0.6, pal=pal),
    }
    haz = roles[(3, 2)]
    for x in range(TS):
        band = AMBER if (x // 4) % 2 == 0 else INK
        fill_rect(haz, x, 0, x, 3, band)
    door = roles[(5, 2)]
    fill_rect(door, 10, 4, 21, 28, SOOT)
    fill_rect(door, 11, 5, 20, 27, pal.lo)
    fill_rect(door, 18, 16, 19, 18, CYAN)
    for (c, r), tile in roles.items():
        atlas.paste(tile, (c * TS, r * TS))
    path = ASSETS / "tilesets" / biome_id / "source.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(path)
    print(f"wrote {path.relative_to(ROOT)}")


def _stack_skyline(img: Image.Image, xs, base_y: int, fill, window, widths=None) -> None:
    d = ImageDraw.Draw(img)
    for i, x in enumerate(xs):
        w = (widths[i] if widths else 54 + (i * 17) % 36)
        h = 90 + (i * 47) % 140
        x1 = min(img.width - 1, x + w)
        d.rectangle((x, base_y - h, x1, base_y), fill=fill)
        cap_h = 12 + (i % 3) * 8
        d.rectangle((x + 6, base_y - h - cap_h, x + 18, base_y - h), fill=fill)
        if i % 2 == 0:
            d.rectangle((x + w // 3, 40, x + w // 3 + 3, base_y - h), fill=fill)
        for wy in range(base_y - h + 10, base_y - 12, 14):
            for wx in range(x + 6, x1 - 6, 10):
                if (wx + wy + i) % 3 == 0:
                    d.rectangle((wx, wy, wx + 3, wy + 4), fill=window)


def author_backgrounds() -> None:
    dest = ASSETS / "backgrounds" / "biome_0"
    dest.mkdir(parents=True, exist_ok=True)
    src = FOUNDRY / "background" / "backdrop.png"
    far0 = blank(960, 540)
    d = ImageDraw.Draw(far0)
    d.rectangle((0, 0, 959, 539), fill=(12, 18, 28, 255))
    for y in range(0, 220):
        fill_rect(far0, 0, y, 959, y, blend((18, 24, 34, 255), (12, 18, 28, 255), y / 220))
    _stack_skyline(
        far0,
        (20, 110, 210, 330, 450, 560, 680, 790, 880),
        430,
        (22, 32, 44, 255),
        (AMBER[0], AMBER[1], AMBER[2], 90),
    )
    d.rectangle((0, 400, 959, 539), fill=(16, 24, 34, 255))
    for x in range(0, 960, 48):
        d.rectangle((x, 410, x + 20, 539), fill=(20, 30, 42, 255))
        d.rectangle((x + 6, 418, x + 10, 430), fill=(CYAN_D[0], CYAN_D[1], CYAN_D[2], 70))
    if src.exists():
        plate = Image.open(src).convert("RGBA")
        plate = plate.resize((960, 320), Image.NEAREST)
        far0.paste(plate, (0, 220), plate)
    far0.save(dest / "far.png")
    mid = blank(960, 320)
    d = ImageDraw.Draw(mid)
    for i, x in enumerate((30, 170, 310, 470, 620, 760, 890)):
        h = 150 + (i * 41) % 90
        d.rectangle((x, 320 - h, x + 64, 319), fill=(22, 32, 44, 210))
        d.rectangle((x + 8, 320 - h - 36, x + 22, 320 - h), fill=(18, 26, 36, 220))
        if i % 2 == 0:
            d.rectangle((x + 28, 70, x + 32, 320 - h), fill=(30, 42, 54, 180))
        for y in range(320 - h + 16, 300, 18):
            d.rectangle((x + 10, y, x + 16, y + 6), fill=(STEEL_L[0], STEEL_L[1], STEEL_L[2], 40))
    d.rectangle((0, 268, 959, 319), fill=(16, 24, 34, 160))
    mid.save(dest / "mid.png")
    near = blank(960, 320)
    d = ImageDraw.Draw(near)
    for x in (18, 908):
        d.rectangle((x, 0, x + 22, 319), fill=(8, 12, 18, 200))
        for y in range(0, 320, 14):
            d.rectangle((x + 5, y, x + 16, y + 8), fill=(28, 38, 48, 210))
    d.rectangle((0, 292, 959, 319), fill=(10, 16, 24, 90))
    near.save(dest / "near.png")

    flood = ASSETS / "backgrounds" / "biome_1"
    flood.mkdir(parents=True, exist_ok=True)
    far1 = blank(960, 540)
    d = ImageDraw.Draw(far1)
    d.rectangle((0, 0, 959, 539), fill=(16, 31, 34, 255))
    for y in range(180, 540):
        t = (y - 180) / 360
        fill_rect(far1, 0, y, 959, y, blend((16, 31, 34, 255), (8, 22, 28, 255), t))
    _stack_skyline(
        far1,
        (40, 160, 290, 430, 570, 710, 840),
        470,
        (28, 52, 56, 255),
        (70, 140, 148, 80),
        (70, 48, 88, 56, 74, 50, 66),
    )
    d.rectangle((0, 430, 959, 539), fill=(12, 28, 34, 220))
    for x in range(0, 960, 36):
        d.ellipse((x, 470 + (x % 5), x + 28, 510), fill=(40, 80, 88, 50))
    far1.save(flood / "far.png")
    mid1 = blank(960, 320)
    d = ImageDraw.Draw(mid1)
    for x in (50, 180, 340, 500, 660, 820):
        d.rectangle((x, 70, x + 26, 319), fill=(32, 58, 62, 200))
        for y in range(90, 310, 16):
            d.ellipse((x - 8, y, x + 34, y + 10), fill=(48, 90, 96, 70))
        d.rectangle((x + 8, 50, x + 14, 80), fill=(20, 40, 44, 180))
    d.rectangle((0, 250, 959, 319), fill=(18, 40, 46, 140))
    mid1.save(flood / "mid.png")
    near1 = blank(960, 320)
    d = ImageDraw.Draw(near1)
    for x in (14, 922):
        d.rectangle((x, 0, x + 24, 319), fill=(10, 24, 28, 210))
        for y in range(0, 320, 10):
            d.ellipse((x + 4, y, x + 20, y + 7), fill=(70, 120, 124, 90))
    near1.save(flood / "near.png")

    grow = ASSETS / "backgrounds" / "biome_2"
    grow.mkdir(parents=True, exist_ok=True)
    far2 = blank(960, 540)
    d = ImageDraw.Draw(far2)
    d.rectangle((0, 0, 959, 539), fill=(22, 36, 26, 255))
    for y in range(0, 180):
        fill_rect(far2, 0, y, 959, y, blend((18, 28, 20, 255), (22, 36, 26, 255), y / 180))
    _stack_skyline(
        far2,
        (30, 150, 280, 420, 560, 700, 830),
        460,
        (36, 54, 34, 255),
        (120, 180, 80, 70),
        (62, 80, 48, 90, 54, 72, 60),
    )
    for i, x in enumerate((70, 240, 410, 590, 760)):
        d.polygon([(x, 320), (x + 22, 240 - (i % 3) * 20), (x + 44, 320)], fill=(42, 68, 38, 255))
    far2.save(grow / "far.png")
    mid2 = blank(960, 320)
    d = ImageDraw.Draw(mid2)
    for x in (80, 240, 400, 580, 740, 880):
        d.rectangle((x, 36, x + 18, 319), fill=(48, 72, 40, 200))
        d.polygon([(x - 10, 90), (x + 9, 36), (x + 28, 100)], fill=(58, 88, 48, 170))
        for y in range(110, 300, 24):
            d.polygon([(x + 4, y), (x + 28, y + 8), (x + 4, y + 16)], fill=(70, 108, 52, 120))
    d.rectangle((0, 262, 959, 319), fill=(28, 44, 26, 150))
    mid2.save(grow / "mid.png")
    near2 = blank(960, 320)
    d = ImageDraw.Draw(near2)
    for x in (20, 914):
        d.rectangle((x, 0, x + 16, 319), fill=(16, 24, 16, 200))
        for y in range(8, 300, 26):
            d.polygon([(x + 2, y), (x + 24, y + 10), (x + 2, y + 18)], fill=(70, 108, 52, 150))
    near2.save(grow / "near.png")
    print("wrote backgrounds/biome_{0,1,2}/{far,mid,near}.png")


def spark_tex(color, w=16, h=16) -> Image.Image:
    img = blank(w, h)
    cx, cy = w // 2, h // 2
    for y in range(h):
        for x in range(w):
            dist = math.hypot(x - cx + 0.5, y - cy + 0.5) / (w * 0.5)
            if dist < 1:
                a = int(255 * (1 - dist) ** 2)
                px(img, x, y, (color[0], color[1], color[2], a))
    fill_rect(img, cx - 1, cy, cx + 1, cy, (255, 255, 255, 220))
    return img


def author_vfx() -> None:
    dest = ASSETS / "vfx"
    dest.mkdir(parents=True, exist_ok=True)
    mapping = {
        "hit_spark": CYAN,
        "death_puff": RUST_L,
        "dash_trail": CYAN_GLOW,
        "pickup_spark": AMBER,
        "ability_unlock": CYAN,
        "boss_phase_shift": AMBER,
        "area_burst": AMBER,
        "slam_shock": AMBER,
        "landing_dust": ASH,
    }
    for name, col in mapping.items():
        spark_tex(col).save(dest / f"{name}.png")
    # Projectile bolt — rust-amber enemy shot, readable against both biomes
    bolt = blank(24, 10)
    fill_rect(bolt, 2, 3, 20, 6, AMBER_D)
    fill_rect(bolt, 4, 4, 18, 5, AMBER)
    fill_rect(bolt, 16, 3, 21, 6, RUST_L)
    px(bolt, 22, 4, STEEL_H)
    px(bolt, 22, 5, STEEL_H)
    outline(bolt)
    bolt.save(dest / "projectile.png")
    bolt.save(dest / "ranged_projectile.png")
    trail = blank(32, 8)
    for x in range(32):
        a = int(180 * (1 - x / 31))
        fill_rect(trail, x, 3, x, 4, (AMBER[0], AMBER[1], AMBER[2], a))
        if x < 20:
            fill_rect(trail, x, 2, x, 5, (RUST_L[0], RUST_L[1], RUST_L[2], a // 2))
    trail.save(dest / "projectile_trail.png")
    print("wrote assets/vfx/*")


def author_props() -> None:
    dest = ASSETS / "props" / "interact"
    dest.mkdir(parents=True, exist_ok=True)
    # Pickup crystal
    crystal = blank(20, 24)
    fill_rect(crystal, 8, 2, 11, 20, CYAN)
    fill_rect(crystal, 6, 6, 13, 16, CYAN_D)
    px(crystal, 9, 3, CYAN_GLOW)
    outline(crystal)
    crystal.save(dest / "pickup.png")
    # Ability shrine gem
    gem = blank(24, 28)
    fill_ellipse(gem, 12, 14, 8, 10, CYAN_D)
    fill_ellipse(gem, 12, 12, 5, 6, CYAN)
    px(gem, 10, 10, CYAN_GLOW)
    outline(gem)
    gem.save(dest / "ability.png")
    # Save shrine
    shrine = blank(32, 40)
    bevel_rect(shrine, 8, 18, 23, 38, STEEL_M, STEEL_L, STEEL_D)
    fill_rect(shrine, 14, 4, 17, 20, STEEL_L)
    fill_ellipse(shrine, 16, 8, 5, 5, CYAN_D)
    fill_ellipse(shrine, 16, 8, 3, 3, CYAN)
    outline(shrine)
    shrine.save(dest / "save_shrine.png")

    biome = ASSETS / "props" / "biome_0"
    biome.mkdir(parents=True, exist_ok=True)
    for src_name, dst_name in (
        ("prop_monitor.png", "biome_0_prop_0.png"),
        ("prop_hazard_crate.png", "biome_0_prop_1.png"),
        ("prop_canister.png", "biome_0_prop_2.png"),
        ("prop_panel.png", "biome_0_prop_3.png"),
    ):
        src = FOUNDRY / "props" / src_name
        if src.exists():
            shutil.copy2(src, biome / dst_name)
    # Hanging chain (industrial "foliage")
    env = ASSETS / "environment"
    env.mkdir(parents=True, exist_ok=True)
    chain = blank(16, 48)
    for y in range(0, 48, 6):
        fill_rect(chain, 5, y, 10, y + 4, STEEL_M)
        fill_rect(chain, 6, y + 1, 9, y + 3, STEEL_L)
        fill_rect(chain, 7, y + 4, 8, y + 5, STEEL_D)
    outline(chain)
    chain.save(env / "hanging_chain.png")
    # Steam puff frames
    steam_frames = []
    for i in range(4):
        fr = blank(24, 24)
        fill_ellipse(fr, 12, 18 - i * 3, 4 + i, 3 + i, (STEEL_L[0], STEEL_L[1], STEEL_L[2], 140 - i * 25))
        steam_frames.append(fr)
    save_sheet(env / "steam.png", steam_frames)
    # Water strip
    water = blank(64, 32)
    for y in range(32):
        t = y / 31
        c = blend((18, 48, 58, 160), (40, 90, 100, 90), t)
        fill_rect(water, 0, y, 63, y, c)
    fill_rect(water, 0, 0, 63, 1, (160, 220, 220, 180))
    fill_rect(water, 8, 0, 20, 0, (220, 245, 245, 220))
    water.save(env / "water.png")

    # Flooded props + drips / bubbles
    flood_props = ASSETS / "props" / "biome_1"
    flood_props.mkdir(parents=True, exist_ok=True)
    valve = blank(28, 28)
    bevel_rect(valve, 6, 6, 21, 21, PAL_FLOOD.mid, PAL_FLOOD.hi, PAL_FLOOD.lo)
    fill_ellipse(valve, 14, 14, 6, 6, PAL_FLOOD.lo)
    fill_rect(valve, 13, 4, 15, 23, PAL_FLOOD.hi)
    outline(valve)
    valve.save(flood_props / "biome_1_prop_0.png")
    pipe = blank(32, 16)
    bevel_rect(pipe, 0, 4, 31, 11, PAL_FLOOD.mid, PAL_FLOOD.hi, PAL_FLOOD.lo)
    fill_rect(pipe, 8, 4, 9, 11, PAL_FLOOD.lo)
    pipe.save(flood_props / "biome_1_prop_1.png")
    crate = blank(24, 24)
    bevel_rect(crate, 2, 6, 21, 22, PAL_FLOOD.lo, PAL_FLOOD.mid, INK)
    outline(crate)
    crate.save(flood_props / "biome_1_prop_2.png")
    grate = blank(32, 16)
    bevel_rect(grate, 0, 0, 31, 15, PAL_FLOOD.mid, PAL_FLOOD.hi, PAL_FLOOD.lo)
    for x in range(4, 28, 6):
        fill_rect(grate, x, 3, x + 1, 12, INK)
    grate.save(flood_props / "biome_1_prop_3.png")
    drip_frames = []
    for i in range(4):
        fr = blank(8, 24)
        fill_rect(fr, 3, 2 + i * 3, 4, 6 + i * 4, (90, 160, 168, 200 - i * 30))
        px(fr, 3, 8 + i * 4, (140, 200, 204, 180))
        drip_frames.append(fr)
    save_sheet(env / "drip.png", drip_frames)
    bubble_frames = []
    for i in range(4):
        fr = blank(16, 16)
        fill_ellipse(fr, 8, 12 - i * 2, 2 + i // 2, 2 + i // 2, (120, 180, 184, 140 - i * 20))
        bubble_frames.append(fr)
    save_sheet(env / "bubble.png", bubble_frames)
    kelp = blank(16, 48)
    for y in range(0, 48, 5):
        ox = 2 if (y // 5) % 2 == 0 else -2
        fill_rect(kelp, 6 + ox, y, 10 + ox, y + 4, PAL_FLOOD.mid)
        fill_rect(kelp, 7 + ox, y + 1, 9 + ox, y + 3, PAL_FLOOD.hi)
    outline(kelp)
    kelp.save(env / "kelp.png")

    # Overgrown props + vines / spores
    grow_props = ASSETS / "props" / "biome_2"
    grow_props.mkdir(parents=True, exist_ok=True)
    coil = blank(28, 28)
    bevel_rect(coil, 4, 8, 23, 24, PAL_GROWTH.lo, PAL_GROWTH.mid, INK)
    fill_ellipse(coil, 14, 12, 7, 5, PAL_GROWTH.growth)
    outline(coil)
    coil.save(grow_props / "biome_2_prop_0.png")
    pod = blank(20, 24)
    fill_ellipse(pod, 10, 14, 7, 8, PAL_GROWTH.growth)
    fill_ellipse(pod, 10, 12, 4, 4, (168, 204, 92, 255))
    outline(pod)
    pod.save(grow_props / "biome_2_prop_1.png")
    stump = blank(32, 20)
    bevel_rect(stump, 4, 8, 27, 19, PAL_GROWTH.mid, PAL_GROWTH.hi, PAL_GROWTH.lo)
    fill_rect(stump, 10, 2, 21, 10, PAL_GROWTH.lo)
    stump.save(grow_props / "biome_2_prop_2.png")
    panel_g = blank(24, 24)
    bevel_rect(panel_g, 2, 2, 21, 21, PAL_GROWTH.mid, PAL_GROWTH.hi, PAL_GROWTH.lo)
    fill_rect(panel_g, 6, 6, 17, 8, PAL_GROWTH.growth)
    panel_g.save(grow_props / "biome_2_prop_3.png")
    vine = blank(16, 48)
    for y in range(0, 48, 6):
        ox = 3 if (y // 6) % 2 == 0 else -2
        fill_rect(vine, 6 + ox, y, 9 + ox, y + 5, PAL_GROWTH.growth)
        px(vine, 10 + ox, y + 2, (168, 204, 92, 255))
    outline(vine)
    vine.save(env / "vine.png")
    spore_frames = []
    for i in range(4):
        fr = blank(16, 16)
        fill_ellipse(fr, 8, 10 - i, 2 + (i % 2), 2, (168, 204, 92, 140 - i * 20))
        spore_frames.append(fr)
    save_sheet(env / "spore.png", spore_frames)
    print("wrote props/environment")


def author_ui() -> None:
    dest = ASSETS / "ui"
    dest.mkdir(parents=True, exist_ok=True)
    frame = blank(320, 56)
    bevel_rect(frame, 0, 0, 319, 55, STEEL_D, STEEL_M, INK)
    fill_rect(frame, 3, 3, 316, 52, SOOT)
    fill_rect(frame, 4, 4, 315, 5, STEEL_M)
    fill_rect(frame, 4, 4, 5, 51, CYAN_D)
    frame.save(dest / "hud_frame.png")
    meter = blank(128, 16)
    bevel_rect(meter, 0, 0, 127, 15, STEEL_D, STEEL_M, INK)
    fill_rect(meter, 2, 2, 125, 13, SOOT)
    meter.save(dest / "health_meter.png")
    panel = blank(256, 320)
    bevel_rect(panel, 0, 0, 255, 319, STEEL_D, STEEL_M, INK)
    fill_rect(panel, 6, 6, 249, 313, SOOT)
    fill_rect(panel, 7, 7, 248, 10, STEEL_M)
    fill_rect(panel, 7, 7, 10, 312, CYAN_D)
    panel.save(dest / "menu_panel.png")
    btn = blank(200, 28)
    bevel_rect(btn, 0, 0, 199, 27, STEEL_M, STEEL_L, INK)
    fill_rect(btn, 2, 2, 197, 25, STEEL_D)
    fill_rect(btn, 2, 2, 4, 25, CYAN_D)
    btn.save(dest / "menu_button.png")
    portraits = dest / "portraits"
    portraits.mkdir(parents=True, exist_ok=True)
    specs = {
        "player": (CYAN, CYAN_D, STEEL_L, "visor"),
        "merchant": (RUST_L, RUST, STEEL_M, "goggles"),
        "lore": (STEEL_L, STEEL_M, AMBER, "lantern"),
        "quest_giver": (AMBER, AMBER_D, STEEL_L, "lamp"),
        "neutral": (STEEL_L, STEEL_M, CYAN_D, "helm"),
    }
    for name, (hi, mid, accent, kind) in specs.items():
        bust = blank(72, 72)
        bevel_rect(bust, 2, 2, 69, 69, STEEL_D, STEEL_M, INK)
        fill_rect(bust, 4, 4, 67, 67, SOOT)
        fill_ellipse(bust, 36, 44, 18, 22, BODY)
        fill_ellipse(bust, 36, 28, 14, 14, mid)
        fill_rect(bust, 22, 26, 50, 34, hi)
        if kind == "visor":
            fill_rect(bust, 24, 28, 48, 33, CYAN)
            fill_rect(bust, 26, 29, 46, 31, CYAN_GLOW)
        elif kind == "goggles":
            fill_ellipse(bust, 28, 30, 5, 4, RUST_L)
            fill_ellipse(bust, 44, 30, 5, 4, RUST_L)
            fill_rect(bust, 32, 29, 40, 31, INK)
        elif kind == "lantern":
            fill_rect(bust, 52, 38, 62, 58, accent)
            fill_rect(bust, 54, 40, 60, 54, (255, 220, 140, 255))
        elif kind == "lamp":
            fill_ellipse(bust, 36, 22, 8, 6, accent)
            fill_rect(bust, 34, 16, 38, 22, STEEL_L)
        fill_rect(bust, 18, 50, 54, 66, STEEL_D)
        fill_rect(bust, 20, 52, 24, 64, accent)
        outline(bust)
        bust.save(portraits / f"{name}.png")
    ornament = blank(160, 8)
    fill_rect(ornament, 0, 3, 159, 4, CYAN_D)
    for x in range(8, 160, 24):
        fill_rect(ornament, x, 1, x + 2, 6, CYAN)
        px(ornament, x + 1, 0, STEEL_H)
    ornament.save(dest / "dialogue_ornament.png")
    print("wrote assets/ui/*")


def author_contact_sheet() -> None:
    dest = ASSETS / "_polish_preview"
    dest.mkdir(parents=True, exist_ok=True)
    rows = []
    for name in ("player_idle", "player_run", "player_jump", "player_fall", "player_land", "player_attack"):
        p = ASSETS / "characters" / f"{name}.png"
        if p.exists():
            rows.append(Image.open(p).convert("RGBA"))
    if not rows:
        return
    w = max(im.width for im in rows)
    h = sum(im.height + 4 for im in rows)
    out = Image.new("RGBA", (w, h), (10, 14, 20, 255))
    y = 0
    for im in rows:
        out.paste(im, (0, y), im)
        y += im.height + 4
    out.save(dest / "player_core_contact.png")
    enemy = ASSETS / "enemies" / "enemy_000_walk.png"
    if enemy.exists():
        Image.open(enemy).save(dest / "enemy_walk_contact.png")
    for extra in (
        "enemies/enemy_001_walk.png",
        "enemies/enemy_002_idle.png",
        "npcs/npc_000_idle.png",
        "bosses/boss_final_idle.png",
        "bosses/boss_final_attack.png",
        "tilesets/biome_1/source.png",
        "tilesets/biome_2/source.png",
    ):
        src = ASSETS / extra
        if src.exists():
            Image.open(src).save(dest / extra.replace("/", "_"))
    print("wrote assets/_polish_preview/")


def backup_pass1() -> None:
    dest = ASSETS / "_baseline_foundry_pass1" / "characters"
    dest.mkdir(parents=True, exist_ok=True)
    if (dest / "player_run.png").exists():
        return
    src = ASSETS / "characters"
    for p in src.glob("player_*.png"):
        shutil.copy2(p, dest / p.name)
    print("backed up pass-1 player sheets -> assets/_baseline_foundry_pass1/")


def write_provenance() -> None:
    note = {
        "pass": "visual-polish-pass-2",
        "direction": "Industrial sci-fi Foundry: compact cyan armored courier, rust enemies, amber telegraphs. 64x64 actors bottom-center, 160px boss, 32px steel terrain.",
        "canvas": "64x64 actors, 160x160 boss, bottom-center contact, 32px tiles, nearest-neighbor",
        "baseline": "assets/_baseline_v1/ box-courier; assets/_baseline_foundry_pass1/ first Foundry pass",
        "implemented": [
            "Hand-keyed courier stride (contact/passing/squash), jump-fall-land spacing, attack impact hold",
            "160px boss idle/locomotion/telegraph/slam/projectile/burst/hurt/death/recovery",
            "Distinct ranged cannon-walker, flying rotor chassis, lantern NPC",
            "Flooded-utility and overgrown-reactor tilesets, parallax, props, ambient strips",
            "Projectile/trail, menu panel chrome",
        ],
        "placeholdersRemaining": [
            "Hand-painted far parallax unique to each biome (current plates are authored pixel silhouettes)",
            "NPC portrait set and dialogue UI ornaments",
        ],
        "copied": [
            "test-packs/metroforge-foundry-v3/background/backdrop.png -> backgrounds/biome_0/far.png",
            "foundry props -> props/biome_0/",
        ],
    }
    path = ASSETS / "_polish_preview" / "provenance.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(note, indent=2) + "\n")


def main() -> None:
    backup_pass1()
    author_player()
    author_enemy()
    author_npc()
    author_ranged()
    author_flyer()
    author_boss()
    author_tileset("biome_0", PAL_FOUNDRY)
    author_tileset("biome_1", PAL_FLOOD)
    author_tileset("biome_2", PAL_GROWTH)
    author_backgrounds()
    author_vfx()
    author_props()
    author_ui()
    author_contact_sheet()
    write_provenance()
    print("visual polish authoring complete")


if __name__ == "__main__":
    main()
