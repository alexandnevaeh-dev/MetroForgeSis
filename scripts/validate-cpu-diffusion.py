#!/usr/bin/env python3

import base64
import json
import subprocess
import sys
import time
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
WORKER = ROOT / "workers" / "diffusers_image_worker.py"
OUTPUT_DIR = ROOT / "test-artifacts" / "cpu-diffusion"
OUTPUT_PATH = OUTPUT_DIR / "cpu_sdxl_turbo_384.png"
TELEMETRY_PATH = OUTPUT_DIR / "cpu_generation.json"
REQUEST = {
    "action": "generate",
    "model_id": "stabilityai/sdxl-turbo",
    "profile": "ENVIRONMENT",
    "prompt": (
        "top-down fantasy stone combat arena, orthographic game environment, "
        "clear walkable center, simple stone obstacles, readable gameplay composition"
    ),
    "width": 384,
    "height": 384,
    "seed": 42,
    "steps": 2,
    "compute_backend": "cpu",
}


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    total_start = time.perf_counter()
    result = subprocess.run(
        [sys.executable, str(WORKER)],
        input=json.dumps(REQUEST),
        capture_output=True,
        text=True,
        cwd=ROOT,
        check=False,
    )
    caller_total_ms = int((time.perf_counter() - total_start) * 1000)
    if result.returncode != 0:
        raise RuntimeError(result.stderr or f"Worker exited with code {result.returncode}")

    response = json.loads(result.stdout)
    if not response.get("ok") or not response.get("image_base64"):
        raise RuntimeError(response.get("error", "Worker did not return an image"))

    OUTPUT_PATH.write_bytes(base64.b64decode(response["image_base64"]))
    with Image.open(OUTPUT_PATH) as image:
        image.load()
        if image.format != "PNG" or image.size != (384, 384):
            raise RuntimeError(f"Expected a 384x384 PNG, received {image.format} {image.size}")

    telemetry = {
        "model": response["model_id"],
        "provider": response["provider"],
        "computeBackend": response["compute_backend"],
        "device": response["device"],
        "dtype": response["dtype"],
        "seed": response["seed"],
        "width": response["width"],
        "height": response["height"],
        "steps": response["steps"],
        "effectivePrompt": response["effective_prompt"],
        "modelAcquisition": response["model_acquisition"],
        "pipelineLoadMs": response["pipeline_load_ms"],
        "inferenceMs": response["inference_ms"],
        "totalMs": response["total_ms"],
        "callerTotalMs": caller_total_ms,
        "outputPath": str(OUTPUT_PATH.relative_to(ROOT)).replace("\\", "/"),
        "pngBytes": OUTPUT_PATH.stat().st_size,
    }
    TELEMETRY_PATH.write_text(json.dumps(telemetry, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(telemetry, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())