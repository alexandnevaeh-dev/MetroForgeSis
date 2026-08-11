#!/usr/bin/env python3
"""Local SDXL image generation worker for MetroForge AI.

Reads JSON from stdin, writes JSON to stdout.
Actions: health, generate

Requires: pip install -r workers/requirements-diffusers.txt
"""

from __future__ import annotations

import base64
import json
import sys
from io import BytesIO
from typing import Any


PROFILE_PREFIXES: dict[str, str] = {
    "CHARACTER": "pixel art game character sprite, side view,",
    "ENEMY": "pixel art game enemy creature, side view,",
    "BOSS": "pixel art game boss creature, imposing,",
    "TILE_SOURCE": "seamless pixel art game tileset texture, top-down,",
    "ENVIRONMENT": "pixel art game environment background, parallax,",
    "ICON": "pixel art game item icon, centered,",
}


def read_request() -> dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        raise ValueError("empty stdin")
    return json.loads(raw)


def write_response(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload))
    sys.stdout.flush()


def health_check() -> dict[str, Any]:
    try:
        import torch  # noqa: F401
        import diffusers  # noqa: F401

        cuda = False
        try:
            import torch

            cuda = torch.cuda.is_available()
        except Exception:
            cuda = False
        return {"ok": True, "cuda": cuda, "provider": "diffusers"}
    except ImportError as exc:
        return {"ok": False, "error": str(exc), "provider": "diffusers"}


_pipeline = None


def get_pipeline(model_id: str):
    global _pipeline
    if _pipeline is not None:
        return _pipeline

    import torch
    from diffusers import AutoPipelineForText2Image

    dtype = torch.float16 if torch.cuda.is_available() else torch.float32
    pipe = AutoPipelineForText2Image.from_pretrained(model_id, torch_dtype=dtype)
    if torch.cuda.is_available():
        pipe = pipe.to("cuda")
    else:
        pipe.enable_model_cpu_offload()
    _pipeline = pipe
    return _pipeline


def generate_image(req: dict[str, Any]) -> dict[str, Any]:
    model_id = req.get("model_id", "stabilityai/sdxl-turbo")
    profile = req.get("profile", "CHARACTER")
    prompt = req.get("prompt", "pixel art game asset")
    negative = req.get("negative_prompt", "blurry, low quality, text, watermark")
    width = int(req.get("width", 512))
    height = int(req.get("height", 512))
    seed = int(req.get("seed", 42))
    steps = int(req.get("steps", 4 if "turbo" in model_id else 20))

    prefix = PROFILE_PREFIXES.get(profile, "pixel art game asset,")
    full_prompt = f"{prefix} {prompt}"

    pipe = get_pipeline(model_id)

    import torch

    generator = torch.Generator(device="cuda" if torch.cuda.is_available() else "cpu").manual_seed(seed)
    result = pipe(
        prompt=full_prompt,
        negative_prompt=negative,
        width=width,
        height=height,
        num_inference_steps=steps,
        generator=generator,
    )
    image = result.images[0]
    buf = BytesIO()
    image.save(buf, format="PNG")

    return {
        "ok": True,
        "provider": "diffusers",
        "model_id": model_id,
        "seed": seed,
        "image_base64": base64.b64encode(buf.getvalue()).decode("ascii"),
    }


def main() -> None:
    req = read_request()
    action = req.get("action", "health")

    if action == "health":
        write_response(health_check())
        return

    if action == "generate":
        try:
            write_response(generate_image(req))
        except Exception as exc:
            write_response({"ok": False, "error": str(exc), "provider": "diffusers"})
        return

    write_response({"ok": False, "error": f"unknown action: {action}"})


if __name__ == "__main__":
    main()
