#!/usr/bin/env python3

import base64
import json
import pathlib
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
WORKER = ROOT / "workers" / "diffusers_image_worker.py"
OUTPUT_DIR = ROOT / "test-artifacts" / "openvino-diffusion"
OUTPUT_PATH = OUTPUT_DIR / "openvino_sd15_gpu_384.png"
TELEMETRY_PATH = OUTPUT_DIR / "openvino_sd15_gpu_384.json"
REQUEST = {
    "action": "generate",
    "model_id": "sd-1.5",
    "profile": "ENVIRONMENT",
    "prompt": (
        "top-down fantasy stone combat arena, orthographic game environment, "
        "clear walkable center, simple stone obstacles, readable gameplay composition"
    ),
    "width": 384,
    "height": 384,
    "seed": 42,
    "steps": 6,
    "compute_backend": "openvino_gpu",
}


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    process = subprocess.run(
        [sys.executable, str(WORKER)],
        input=json.dumps(REQUEST),
        capture_output=True,
        text=True,
        cwd=ROOT,
        check=False,
    )
    if process.returncode != 0:
        raise RuntimeError(process.stderr or f"Worker exited with code {process.returncode}")
    response = json.loads(process.stdout)
    if not response.get("ok") or not response.get("image_base64"):
        raise RuntimeError(response.get("error", "Worker did not return an image"))
    if response.get("compute_backend") != "openvino_gpu" or "GPU" not in str(response.get("device", "")).upper():
        raise RuntimeError(f"Expected OpenVINO GPU provenance, received {response.get('compute_backend')} on {response.get('device')}")

    OUTPUT_PATH.write_bytes(base64.b64decode(response["image_base64"]))
    with Image.open(OUTPUT_PATH) as image:
        image.load()
        if image.format != "PNG" or image.size != (384, 384):
            raise RuntimeError(f"Expected a 384x384 PNG, received {image.format} {image.size}")

    telemetry = {
        "sourceModelId": response["openvino_model"]["source_model_id"],
        "openvinoModelPath": response["openvino_model"]["cache_path"],
        "conversionRequired": response["openvino_model"]["conversion_required"],
        "modelCachedBefore": response["openvino_model"]["cached_before"],
        "provider": response["provider"],
        "computeBackend": response["compute_backend"],
        "device": response["device"],
        "precision": response["precision"],
        "seed": response["seed"],
        "width": response["width"],
        "height": response["height"],
        "steps": response["steps"],
        "effectivePrompt": response["effective_prompt"],
        "conversionMs": response["openvino_model"]["conversion_ms"],
        "compileMs": response["compile_ms"],
        "inferenceMs": response["inference_ms"],
        "totalMs": response["total_ms"],
        "outputPath": str(OUTPUT_PATH.relative_to(ROOT)).replace("\\", "/"),
        "pngBytes": OUTPUT_PATH.stat().st_size,
    }
    TELEMETRY_PATH.write_text(json.dumps(telemetry, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(telemetry, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())