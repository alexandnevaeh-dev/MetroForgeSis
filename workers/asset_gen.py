#!/usr/bin/env python3
"""Lightweight local asset worker for MetroForge.

TypeScript orchestrates generation. This process handles ComfyUI HTTP (optional),
chroma-key knockout, and sprite-sheet slicing, then writes engine-ready PNGs.

Reads one JSON object from stdin, writes one JSON object to stdout.

Actions: health, knockout, slice, process, generate

Pillow is required for image work. ComfyUI generate uses stdlib urllib only.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from io import BytesIO
from pathlib import Path
from typing import Any

MAGENTA = (255, 0, 255)


def read_request() -> dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        raise ValueError("empty stdin")
    return json.loads(raw)


def write_response(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload))
    sys.stdout.flush()


def _pillow_ok() -> tuple[bool, str | None]:
    try:
        from PIL import Image  # noqa: F401

        return True, None
    except ImportError as exc:
        return False, str(exc)


def health_check() -> dict[str, Any]:
    pillow, pillow_error = _pillow_ok()
    comfy = os.environ.get("COMFYUI_BASE_URL", "http://127.0.0.1:8188").rstrip("/")
    comfy_ok = False
    try:
        with urllib.request.urlopen(f"{comfy}/system_stats", timeout=2) as res:
            comfy_ok = 200 <= res.status < 300
    except (urllib.error.URLError, TimeoutError, OSError):
        comfy_ok = False
    return {
        "ok": True,
        "provider": "asset_gen",
        "pillow": pillow,
        "pillow_error": pillow_error,
        "comfyui": comfy_ok,
        "comfyui_url": comfy,
    }


def _load_rgba(req: dict[str, Any]):
    from PIL import Image

    if req.get("image_base64"):
        import base64

        raw = base64.b64decode(req["image_base64"])
        img = Image.open(BytesIO(raw))
    else:
        path = req.get("image_path")
        if not path:
            raise ValueError("image_path or image_base64 required")
        img = Image.open(path)
    return img.convert("RGBA")


def _save_png(img, path: str | None) -> bytes:
    from PIL import Image

    buf = BytesIO()
    img.save(buf, format="PNG")
    data = buf.getvalue()
    if path:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        Path(path).write_bytes(data)
    return data


def knockout(img) -> Any:
    """Punch magenta and flood-fill a studio backdrop from the top-left pixel."""
    pixels = img.copy()
    w, h = pixels.size
    px = pixels.load()
    bg = px[0, 0][:3]
    chroma_tol = 48
    flood_tol = 36

    def dist(a: tuple[int, ...], b: tuple[int, ...]) -> int:
        return abs(a[0] - b[0]) + abs(a[1] - b[1]) + abs(a[2] - b[2])

    def is_chroma(rgb: tuple[int, ...]) -> bool:
        return dist(rgb, MAGENTA) <= chroma_tol

    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_chroma((r, g, b)):
                px[x, y] = (r, g, b, 0)

    luma = 0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]
    sat = max(bg) - min(bg)
    studio = luma < 28 or luma > 200 or sat < 36 or dist(bg, MAGENTA) < 90
    if not studio:
        return pixels

    visited = [[False] * w for _ in range(h)]
    stack = [(0, 0)]
    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= w or y >= h or visited[y][x]:
            continue
        visited[y][x] = True
        r, g, b, a = px[x, y]
        if a == 0:
            continue
        if dist((r, g, b), bg) > flood_tol:
            continue
        px[x, y] = (r, g, b, 0)
        stack.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return pixels


def slice_sheet(img, rows: int, cols: int, output_dir: str) -> list[str]:
    w, h = img.size
    rows = max(1, int(rows))
    cols = max(1, int(cols))
    cell_w, cell_h = w // cols, h // rows
    if cell_w < 1 or cell_h < 1:
        raise ValueError("sheet smaller than requested grid")
    dest = Path(output_dir)
    dest.mkdir(parents=True, exist_ok=True)
    saved: list[str] = []
    for r in range(rows):
        for c in range(cols):
            box = (c * cell_w, r * cell_h, (c + 1) * cell_w, (r + 1) * cell_h)
            cell = img.crop(box)
            path = dest / f"sprite_{r}_{c}.png"
            cell.save(path)
            saved.append(str(path))
    return saved


def process_image(req: dict[str, Any]) -> dict[str, Any]:
    ok, err = _pillow_ok()
    if not ok:
        return {"ok": False, "error": f"Pillow required: {err}", "provider": "asset_gen"}
    img = _load_rgba(req)
    if req.get("knockout", True):
        img = knockout(img)
    out_path = req.get("output_path")
    png = _save_png(img, out_path)
    slices: list[str] = []
    rows = int(req.get("rows") or 0)
    cols = int(req.get("cols") or 0)
    if rows > 0 and cols > 0:
        slices = slice_sheet(img, rows, cols, req.get("output_dir") or str(Path(out_path).parent))
    import base64

    return {
        "ok": True,
        "provider": "asset_gen",
        "saved_to": out_path,
        "slices": slices,
        "width": img.size[0],
        "height": img.size[1],
        "image_base64": base64.b64encode(png).decode("ascii"),
    }


def _load_workflow(prompt: str, width: int, height: int, seed: int) -> dict[str, Any]:
    here = Path(__file__).resolve().parent
    candidates = [
        os.environ.get("ASSET_GEN_WORKFLOW"),
        str(here.parent / "packages" / "assets" / "workflows" / "comfyui-txt2img.json"),
        str(here / "workflows" / "comfyui-txt2img.json"),
    ]
    for path in candidates:
        if path and Path(path).is_file():
            text = Path(path).read_text(encoding="utf-8")
            text = (
                text.replace("{{PROMPT}}", json.dumps(prompt)[1:-1])
                .replace("{{WIDTH}}", str(width))
                .replace("{{HEIGHT}}", str(height))
                .replace("{{SEED}}", str(seed))
            )
            return json.loads(text)
    raise FileNotFoundError("ComfyUI workflow JSON not found")


def generate_comfy(req: dict[str, Any]) -> dict[str, Any]:
    base = (req.get("comfyui_url") or os.environ.get("COMFYUI_BASE_URL") or "http://127.0.0.1:8188").rstrip(
        "/"
    )
    prompt = req.get("prompt")
    if not prompt:
        return {"ok": False, "error": "prompt required", "provider": "asset_gen"}
    seed = int(req.get("seed") or 1)
    width = int(req.get("width") or 512)
    height = int(req.get("height") or 512)
    try:
        workflow = _load_workflow(prompt, width, height, seed)
    except Exception as exc:
        return {"ok": False, "error": str(exc), "provider": "asset_gen"}
    body = json.dumps({"prompt": workflow}).encode("utf-8")
    request = urllib.request.Request(
        f"{base}/prompt",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as res:
            queued = json.loads(res.read().decode("utf-8"))
    except Exception as exc:
        return {"ok": False, "error": f"ComfyUI queue failed: {exc}", "provider": "asset_gen"}
    prompt_id = queued.get("prompt_id")
    if not prompt_id:
        return {"ok": False, "error": "ComfyUI returned no prompt_id", "provider": "asset_gen"}
    filename = None
    subfolder = ""
    kind = "output"
    for _ in range(60):
        time.sleep(2)
        try:
            with urllib.request.urlopen(f"{base}/history/{prompt_id}", timeout=5) as res:
                history = json.loads(res.read().decode("utf-8"))
        except Exception:
            continue
        entry = history.get(prompt_id) or {}
        outputs = entry.get("outputs") or {}
        for node in outputs.values():
            images = node.get("images") or []
            if images:
                filename = images[0].get("filename")
                subfolder = images[0].get("subfolder") or ""
                kind = images[0].get("type") or "output"
                break
        if filename:
            break
    if not filename:
        return {"ok": False, "error": "ComfyUI generation timed out", "provider": "asset_gen"}
    view = f"{base}/view?filename={urllib.request.quote(filename)}&subfolder={urllib.request.quote(subfolder)}&type={kind}"
    try:
        with urllib.request.urlopen(view, timeout=30) as res:
            png = res.read()
    except Exception as exc:
        return {"ok": False, "error": f"ComfyUI image fetch failed: {exc}", "provider": "asset_gen"}
    import base64

    tmp = {
        "image_base64": base64.b64encode(png).decode("ascii"),
        "knockout": req.get("knockout", True),
        "rows": req.get("rows") or 0,
        "cols": req.get("cols") or 0,
        "output_path": req.get("output_path"),
        "output_dir": req.get("output_dir"),
    }
    processed = process_image(tmp)
    processed["model_id"] = "comfyui-local"
    processed["seed"] = seed
    return processed


def main() -> int:
    try:
        req = read_request()
    except Exception as exc:
        write_response({"ok": False, "error": str(exc), "provider": "asset_gen"})
        return 1
    action = req.get("action") or "process"
    try:
        if action == "health":
            write_response(health_check())
            return 0
        if action == "generate":
            write_response(generate_comfy(req))
            return 0
        if action in ("knockout", "slice", "process"):
            if action == "slice":
                req.setdefault("knockout", False)
            write_response(process_image(req))
            return 0
        write_response({"ok": False, "error": f"unknown action {action}", "provider": "asset_gen"})
        return 1
    except Exception as exc:
        write_response({"ok": False, "error": str(exc), "provider": "asset_gen"})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
