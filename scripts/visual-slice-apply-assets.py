"""One-shot visual-slice asset/room patch: knockout pale sprite squares, copy template runtime, hide ColorRect slabs."""
from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parents[1]
GEN = REPO / "apps" / "cli" / "GeneratedGames" / "dusk-glass-lantern-keep"
TPL = REPO / "templates" / "godot-metroidvania"


def color_dist(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2) ** 0.5


def knockout(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    w, h = im.size
    pix = im.load()
    chroma = (255, 0, 255)
    chroma_tol = 48
    flood_tol = 28
    for y in range(h):
        for x in range(w):
            r, g, b, a = pix[x, y]
            if color_dist((r, g, b), chroma) <= chroma_tol:
                pix[x, y] = (r, g, b, 0)
    visited = [[False] * w for _ in range(h)]
    for cx, cy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        r, g, b, a = pix[cx, cy]
        luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
        magentaish = color_dist((r, g, b), chroma) < 90
        if not (luma < 28 or luma > 210 or magentaish):
            continue
        origin = (r, g, b)
        q = [(cx, cy)]
        while q:
            x, y = q.pop()
            if x < 0 or y < 0 or x >= w or y >= h or visited[y][x]:
                continue
            pr, pg, pb, pa = pix[x, y]
            if pa == 0:
                visited[y][x] = True
                continue
            if color_dist((pr, pg, pb), origin) > flood_tol:
                continue
            visited[y][x] = True
            pix[x, y] = (pr, pg, pb, 0)
            q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return im


def bob_sheet(src: Image.Image, frames: int = 4) -> Image.Image:
    src = src.convert("RGBA")
    fw, fh = src.size
    out = Image.new("RGBA", (fw * frames, fh), (0, 0, 0, 0))
    for f in range(frames):
        bob = f % 2
        frame = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
        px_s = src.load()
        px_d = frame.load()
        for y in range(fh):
            sy = y - bob
            if sy < 0 or sy >= fh:
                continue
            for x in range(fw):
                px_d[x, y] = px_s[x, sy]
        out.paste(frame, (f * fw, 0))
    return out


def attack_sheet(src: Image.Image, frames: int = 4) -> Image.Image:
    src = src.convert("RGBA")
    fw, fh = src.size
    out = Image.new("RGBA", (fw * frames, fh), (0, 0, 0, 0))
    max_shift = max(1, fw * 15 // 100)
    px_s = src.load()
    for f in range(frames):
        shift = (max_shift * (f + 1)) // frames
        frame = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
        px_d = frame.load()
        impact = f == frames - 1
        boost = 60 if impact else 0
        for y in range(fh):
            for x in range(fw):
                sx = min(fw - 1, max(0, x - shift))
                r, g, b, a = px_s[sx, y]
                if a == 0:
                    continue
                px_d[x, y] = (min(255, r + boost), min(255, g + boost), min(255, b + boost), a)
        out.paste(frame, (f * fw, 0))
    return out


def hurt_sheet(src: Image.Image, frames: int = 4) -> Image.Image:
    src = src.convert("RGBA")
    fw, fh = src.size
    out = Image.new("RGBA", (fw * frames, fh), (0, 0, 0, 0))
    px_s = src.load()
    for f in range(frames):
        frame = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
        px_d = frame.load()
        flashed = f % 2 == 1
        for y in range(fh):
            for x in range(fw):
                r, g, b, a = px_s[x, y]
                if a == 0:
                    continue
                px_d[x, y] = (255, 90, 90, a) if flashed else (r, g, b, a)
        out.paste(frame, (f * fw, 0))
    return out


def death_sheet(src: Image.Image, frames: int = 4) -> Image.Image:
    src = src.convert("RGBA")
    fw, fh = src.size
    out = Image.new("RGBA", (fw * frames, fh), (0, 0, 0, 0))
    px_s = src.load()
    for f in range(frames):
        t = f / (frames - 1) if frames > 1 else 0
        drop = round(t * fh * 0.25)
        alpha_scale = 1 - t * 0.55
        frame = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
        px_d = frame.load()
        for y in range(fh):
            sy = y + drop
            if sy >= fh:
                continue
            for x in range(fw):
                r, g, b, a = px_s[x, sy]
                if a == 0:
                    continue
                gray = (r + g + b) / 3
                px_d[x, y] = (
                    round(r + (gray - r) * t),
                    round(g + (gray - g) * t),
                    round(b + (gray - b) * t),
                    round(a * alpha_scale),
                )
        out.paste(frame, (f * fw, 0))
    return out


def copy_templates() -> None:
    pairs = [
        ("scripts/world/RoomTileMap.gd", "scripts/world/RoomTileMap.gd"),
        ("scripts/core/AnimatedAssetSprite.gd", "scripts/core/AnimatedAssetSprite.gd"),
        ("scripts/core/QualityPresentation.gd", "scripts/core/QualityPresentation.gd"),
        ("scripts/UI/GameHUD.gd", "scripts/UI/GameHUD.gd"),
        ("scripts/world/RoomTransition.gd", "scripts/world/RoomTransition.gd"),
        ("scenes/world/RoomTransition.tscn", "scenes/world/RoomTransition.tscn"),
        ("scenes/world/PhaseBarrier.tscn", "scenes/world/PhaseBarrier.tscn"),
        ("scripts/test/RuntimeSmokeTest.gd", "scripts/test/RuntimeSmokeTest.gd"),
    ]
    for rel_src, rel_dst in pairs:
        src = TPL / rel_src
        dst = GEN / rel_dst
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        print(f"copied {rel_src}")


def patch_rooms() -> None:
    rooms = (GEN / "scenes" / "rooms").glob("room_*.tscn")
    for path in rooms:
        text = path.read_text(encoding="utf-8")
        text = text.replace(
            '[node name="Ground" type="TileMapLayer" parent="."]\nz_index = -1',
            '[node name="Ground" type="TileMapLayer" parent="."]\nz_index = 1\ntexture_filter = 0',
        )
        text = text.replace(
            '[node name="Background" type="ColorRect" parent="."]\nz_index = -4',
            '[node name="Background" type="ColorRect" parent="."]\nz_index = -20\nvisible = false',
        )
        text = text.replace("color = Color(0.080, 0.120, 0.160, 1)", "color = Color(0.080, 0.120, 0.160, 0)")
        if "visible = false" not in text.split('[node name="FloorVisual"', 1)[-1][:200]:
            text = text.replace(
                '[node name="FloorVisual" type="ColorRect" parent="Floor"]\n',
                '[node name="FloorVisual" type="ColorRect" parent="Floor"]\nvisible = false\n',
            )
        # Layer parallax sprites so they don't sit as one full-room plate.
        text = text.replace(
            '[node name="Sprite" type="Sprite2D" parent="ParallaxBg/far"]\nposition = Vector2(400, 300)',
            '[node name="Sprite" type="Sprite2D" parent="ParallaxBg/far"]\nz_index = -12\ntexture_filter = 0\nposition = Vector2(400, 168)\nmodulate = Color(1, 1, 1, 1)',
        )
        text = text.replace(
            '[node name="Sprite" type="Sprite2D" parent="ParallaxBg/mid"]\nposition = Vector2(400, 300)',
            '[node name="Sprite" type="Sprite2D" parent="ParallaxBg/mid"]\nz_index = -10\ntexture_filter = 0\nposition = Vector2(400, 288)\nmodulate = Color(1, 1, 1, 0.72)',
        )
        text = text.replace(
            '[node name="Sprite" type="Sprite2D" parent="ParallaxBg/near"]\nposition = Vector2(400, 300)',
            '[node name="Sprite" type="Sprite2D" parent="ParallaxBg/near"]\nz_index = -8\ntexture_filter = 0\nposition = Vector2(400, 408)\nmodulate = Color(1, 1, 1, 0.42)',
        )
        path.write_text(text, encoding="utf-8")
        print(f"patched {path.name}")


def patch_characters() -> None:
    roots = [
        GEN / "assets" / "characters",
        GEN / "assets" / "enemies",
        GEN / "assets" / "bosses",
        GEN / "assets" / "npcs",
    ]
    knocked: dict[Path, Image.Image] = {}
    for root in roots:
        if not root.exists():
            continue
        for still in sorted(root.glob("*.png")):
            name = still.name
            if any(k in name for k in ("_walk", "_attack", "_hurt", "_death", "_source")):
                continue
            im = knockout(Image.open(still))
            im.save(still)
            knocked[still] = im
            print(f"knockout {still.relative_to(GEN)}")

        for still, im in list(knocked.items()):
            if still.parent != root:
                continue
            stem = still.stem
            if stem.endswith("_source"):
                continue
            bob_sheet(im, 4 if "boss" not in stem else 3).save(root / f"{stem}_walk.png")
            attack_sheet(im, 4 if "boss" not in stem else 3).save(root / f"{stem}_attack.png")
            hurt_sheet(im, 4 if "boss" not in stem else 3).save(root / f"{stem}_hurt.png")
            death_sheet(im, 4 if "boss" not in stem else 3).save(root / f"{stem}_death.png")
            print(f"resheet {stem}")


def main() -> None:
    if not GEN.exists():
        raise SystemExit(f"missing generated project: {GEN}")
    copy_templates()
    patch_rooms()
    patch_characters()
    print("visual-slice asset apply done")


if __name__ == "__main__":
    main()
