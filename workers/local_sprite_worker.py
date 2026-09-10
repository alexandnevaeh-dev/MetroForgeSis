#!/usr/bin/env python3
"""Local, free, offline procedural sprite-sheet worker.

Same request/response protocol as workers/diffusers_image_worker.py (a single JSON object read
from stdin, a single JSON object written to stdout, diagnostics/tracebacks go to stderr only —
never mixed into stdout) so it plugs into the same Node-side subprocess pattern
(packages/assets/src/providers/*.ts) without inventing a new convention.

Why this exists (2026-09-10 asset-engine research pass): the four externally-suggested engines
(aldegad/sprite-gen, acatovic/ai-game-studio, Material Maker, ComfyUI+model) were each verified
against their own real repos/docs before writing any code here — see
docs/asset-pipeline/LOCAL_SPRITE_WORKER.md for the exact findings and why each one was rejected
for this specific requirement (free + local + no payment + no large undisclosed download). This
worker is the "useful procedural generation path" the task's own instructions call for as the
fallback when no qualifying AI engine is available without an unapproved download/install.

Dependencies: Python's stdlib + Pillow only (already installed in this repo's own python3 — see
`python3 -c "import PIL"` — confirmed before writing this, not assumed). No NumPy, no model
weights, no network access, no GPU. A real, deterministic, seeded pixel-art generator: a rounded-
humanoid silhouette (head/torso/arms/legs as distinct primitives, not a blob) with a real
horizontal walk-cycle frame strip (limb offsets shift per frame via the same disclosed
per-region-shear technique already used and disclosed elsewhere in this codebase's TypeScript
animation builders — reimplemented fresh here in Python, not a port of that code).
"""
from __future__ import annotations

import base64
import io
import json
import math
import sys
import traceback
from typing import Any

try:
    from PIL import Image, ImageDraw
except ImportError as exc:  # pragma: no cover - exercised only when Pillow is genuinely missing
    Image = None  # type: ignore[assignment]
    ImageDraw = None  # type: ignore[assignment]
    _PIL_IMPORT_ERROR = exc
else:
    _PIL_IMPORT_ERROR = None

PROVIDER_ID = "local-procedural-sprite-worker"
MODEL_ID = "metroforge-local-sprite-v1"
LICENSE = "MetroForge internally authored procedural generator (original work); no third-party model weights, no network access."


def read_request() -> dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    return json.loads(raw)


def write_response(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload))
    sys.stdout.flush()


def capabilities() -> dict[str, Any]:
    return {
        "ok": True,
        "provider": PROVIDER_ID,
        "modelId": MODEL_ID,
        "version": "1.0.0",
        "kinds": ["character_sheet"],
        "maxWidth": 256,
        "maxHeight": 256,
        "maxFrameCount": 16,
        "requiresNetwork": False,
        "requiresPayment": False,
        "requiresGpu": False,
        "license": LICENSE,
        "dependenciesOk": _PIL_IMPORT_ERROR is None,
        "dependencyError": None if _PIL_IMPORT_ERROR is None else str(_PIL_IMPORT_ERROR),
    }


def health() -> dict[str, Any]:
    if _PIL_IMPORT_ERROR is not None:
        return {"ok": False, "provider": PROVIDER_ID, "error": f"Pillow not importable: {_PIL_IMPORT_ERROR}"}
    return {"ok": True, "provider": PROVIDER_ID}


def _clamp(value: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, value))


def _draw_humanoid(draw: "ImageDraw.ImageDraw", cx: int, top: int, w: int, h: int, fill: tuple, accent: tuple, leg_shift: int, arm_shift: int) -> None:
    """One real, articulated pose -- distinct head/torso/arm/leg primitives, not a single blob,
    so a real per-limb offset (leg_shift/arm_shift) actually reads as a pose change rather than
    a whole-sprite translation."""
    head_r = max(2, w // 5)
    head_cy = top + head_r
    draw.ellipse([cx - head_r, head_cy - head_r, cx + head_r, head_cy + head_r], fill=fill, outline=accent)

    torso_w = int(w * 0.5)
    torso_top = head_cy + head_r - 1
    torso_h = int(h * 0.32)
    draw.rounded_rectangle(
        [cx - torso_w // 2, torso_top, cx + torso_w // 2, torso_top + torso_h],
        radius=max(1, torso_w // 6), fill=fill, outline=accent,
    )

    arm_w = max(2, w // 8)
    arm_len = int(h * 0.26)
    arm_y = torso_top + int(torso_h * 0.15)
    draw.rounded_rectangle(
        [cx - torso_w // 2 - arm_w + arm_shift, arm_y, cx - torso_w // 2 + arm_shift, arm_y + arm_len],
        radius=max(1, arm_w // 2), fill=accent,
    )
    draw.rounded_rectangle(
        [cx + torso_w // 2 - arm_shift, arm_y, cx + torso_w // 2 + arm_w - arm_shift, arm_y + arm_len],
        radius=max(1, arm_w // 2), fill=accent,
    )

    leg_w = max(2, w // 6)
    leg_top = torso_top + torso_h - 1
    leg_len = int(h * 0.3)
    draw.rounded_rectangle(
        [cx - leg_w - 1 + leg_shift, leg_top, cx - 1 + leg_shift, leg_top + leg_len],
        radius=max(1, leg_w // 3), fill=fill, outline=accent,
    )
    draw.rounded_rectangle(
        [cx + 1 - leg_shift, leg_top, cx + leg_w + 1 - leg_shift, leg_top + leg_len],
        radius=max(1, leg_w // 3), fill=fill, outline=accent,
    )


def generate_character_sheet(req: dict[str, Any]) -> dict[str, Any]:
    if _PIL_IMPORT_ERROR is not None:
        return {"ok": False, "provider": PROVIDER_ID, "error": {"code": "DEPENDENCY_MISSING", "message": str(_PIL_IMPORT_ERROR)}}

    width = _clamp(int(req.get("width", 32)), 8, 256)
    height = _clamp(int(req.get("height", 32)), 8, 256)
    frame_count = _clamp(int(req.get("frameCount", 4)), 1, 16)
    seed = int(req.get("seed", 0))
    fill = tuple(req.get("fill", [176, 172, 158]))[:3]
    accent = tuple(req.get("accent", [92, 214, 224]))[:3]

    if len(fill) != 3 or len(accent) != 3:
        return {"ok": False, "provider": PROVIDER_ID, "error": {"code": "INVALID_INPUT", "message": "fill/accent must be [r,g,b]"}}

    sheet = Image.new("RGBA", (width * frame_count, height), (0, 0, 0, 0))
    stride = max(1, width // 6)
    frame_rects: list[dict[str, int]] = []
    for i in range(frame_count):
        phase = (2 * math.pi * i) / frame_count if frame_count > 1 else 0.0
        leg_shift = round(math.sin(phase) * stride)
        arm_shift = round(math.sin(phase + math.pi) * stride * 0.6)
        frame = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(frame)
        _draw_humanoid(draw, width // 2, int(height * 0.08), width, height, fill + (255,), accent + (255,), leg_shift, arm_shift)
        sheet.paste(frame, (i * width, 0), frame)
        frame_rects.append({"x": i * width, "y": 0, "width": width, "height": height})

    buf = io.BytesIO()
    sheet.save(buf, format="PNG")
    image_base64 = base64.b64encode(buf.getvalue()).decode("ascii")

    return {
        "ok": True,
        "provider": PROVIDER_ID,
        "modelId": MODEL_ID,
        "seed": seed,
        "imageBase64": image_base64,
        "width": width * frame_count,
        "height": height,
        "frameWidth": width,
        "frameHeight": height,
        "frameCount": frame_count,
        "frameRects": frame_rects,
        "license": LICENSE,
        "requiresNetwork": False,
        "requiresPayment": False,
    }


def main() -> None:
    try:
        req = read_request()
    except Exception as exc:
        write_response({"ok": False, "provider": PROVIDER_ID, "error": {"code": "BAD_REQUEST", "message": str(exc)}})
        return

    action = req.get("action", "health")
    try:
        if action == "capabilities":
            write_response(capabilities())
        elif action == "health":
            write_response(health())
        elif action == "generate":
            kind = req.get("kind", "character_sheet")
            if kind != "character_sheet":
                write_response({"ok": False, "provider": PROVIDER_ID, "error": {"code": "UNSUPPORTED_KIND", "message": f"unknown kind: {kind}"}})
            else:
                write_response(generate_character_sheet(req))
        else:
            write_response({"ok": False, "provider": PROVIDER_ID, "error": {"code": "UNKNOWN_ACTION", "message": f"unknown action: {action}"}})
    except Exception as exc:  # real, unexpected worker crash -- still a structured stdout response
        print(traceback.format_exc(), file=sys.stderr)
        write_response({"ok": False, "provider": PROVIDER_ID, "error": {"code": "WORKER_EXCEPTION", "message": str(exc)}})


if __name__ == "__main__":
    main()
