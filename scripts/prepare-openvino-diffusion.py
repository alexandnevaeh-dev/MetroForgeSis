#!/usr/bin/env python3

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORKER = ROOT / "workers" / "diffusers_image_worker.py"


def main() -> int:
    request = {"action": "prepare", "model_id": "sd-1.5", "compute_backend": "openvino_gpu"}
    result = subprocess.run(
        [sys.executable, str(WORKER)],
        input=json.dumps(request),
        capture_output=True,
        text=True,
        cwd=ROOT,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr or f"Worker exited with code {result.returncode}")
    response = json.loads(result.stdout)
    if not response.get("ok"):
        raise RuntimeError(response.get("error", "OpenVINO model preparation failed"))
    print(json.dumps(response, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())