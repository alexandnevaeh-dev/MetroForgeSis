"""Run MetroForge's installed local image worker with preserved E: requests and receipts."""
import argparse
import base64
import json
import os
from pathlib import Path
import subprocess
import sys
import time

parser = argparse.ArgumentParser()
parser.add_argument("request")
parser.add_argument("output")
args = parser.parse_args()
request_path, output = Path(args.request).resolve(), Path(args.output).resolve()
if request_path.drive.upper() != "E:" or output.drive.upper() != "E:":
    raise SystemExit("Requests and output must stay on E:")
if output.exists():
    raise SystemExit("Choose a fresh source output folder to preserve evidence")
request = json.loads(request_path.read_text(encoding="utf-8-sig"))
model = Path(request["model_id"]).resolve()
if model.drive.upper() != "E:" or not (model / "model_index.json").is_file():
    raise SystemExit("An existing E: model is required; no models are downloaded here")
if request.get("compute_backend") != "cuda" or request.get("action") != "generate":
    raise SystemExit("This source job requires native CUDA generation")
output.mkdir(parents=True)
(output / "request.json").write_text(json.dumps(request, indent=2), encoding="utf-8")
environment = os.environ.copy()
for key, folder in {"TEMP": "Temp", "TMP": "Temp", "HF_HOME": "HuggingFace",
                    "TORCH_HOME": "Torch", "XDG_CACHE_HOME": "Cache", "CUDA_CACHE_PATH": "CudaCache"}.items():
    directory = Path("E:/MetroForgeData") / folder
    directory.mkdir(parents=True, exist_ok=True)
    environment[key] = str(directory)
environment["HF_HUB_OFFLINE"] = "1"
environment["DIFFUSERS_BASE_MODEL_PATH"] = str(model)
worker = Path(__file__).resolve().parent.parent / "workers/diffusers_image_worker.py"
started = time.monotonic()
completed = subprocess.run([sys.executable, str(worker)], input=json.dumps(request), text=True,
                           capture_output=True, env=environment)
(output / "stderr.log").write_text(completed.stderr, encoding="utf-8")
result = json.loads(completed.stdout)
encoded = result.pop("image_base64", None)
result["wallSeconds"] = round(time.monotonic() - started, 2)
result["exitCode"] = completed.returncode
result["productionApproved"] = False
(output / "receipt.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
if completed.returncode or not result.get("ok") or result.get("device") != "cuda" or not encoded:
    raise SystemExit("Native generation failed; inspect receipt and stderr")
(output / "source.png").write_bytes(base64.b64decode(encoded))
print(json.dumps({"ok": True, "device": result["device"], "source": str(output / "source.png"),
                  "wallSeconds": result["wallSeconds"], "productionApproved": False}))
