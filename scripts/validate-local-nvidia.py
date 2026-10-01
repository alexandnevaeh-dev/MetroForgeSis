"""Exercise the real local image worker and retain compact E:-resident evidence."""
import argparse
import base64
import json
import os
from pathlib import Path
import subprocess
import sys
import time

parser = argparse.ArgumentParser()
parser.add_argument('--model', required=True, help='Existing local Diffusers model directory')
parser.add_argument('--output', required=True)
args = parser.parse_args()
output = Path(args.output).resolve()
model = Path(args.model).resolve()
if output.drive.lower() != 'e:' or model.drive.lower() != 'e:':
    raise SystemExit('Model and evidence must be on E:.')
if not (model / 'model_index.json').is_file():
    raise SystemExit('An installed local Diffusers model is required; this test does not acquire models.')
output.mkdir(parents=True, exist_ok=True)
env = os.environ.copy()
for key, folder in {
    'TEMP': 'Temp', 'TMP': 'Temp', 'HF_HOME': 'HuggingFace',
    'TORCH_HOME': 'Torch', 'XDG_CACHE_HOME': 'Cache',
    'CUDA_CACHE_PATH': 'CudaCache', 'PIP_CACHE_DIR': 'PipCache',
}.items():
    path = Path('E:/MetroForgeData') / folder
    path.mkdir(parents=True, exist_ok=True)
    env[key] = str(path)
env['HF_HUB_OFFLINE'] = '1'
# CUDA is built in. Avoid unrelated third-party backend entry-point discovery
# during this NVIDIA-only diagnostic; preserve the application's default discovery.
env['TORCH_DEVICE_BACKEND_AUTOLOAD'] = '0'
env['DIFFUSERS_CPU_OFFLOAD'] = '1'
env['DIFFUSERS_OFFLOAD_STRATEGY'] = 'model'
env['DIFFUSERS_BASE_MODEL_PATH'] = str(model)
worker = Path(__file__).resolve().parent.parent / 'workers/diffusers_image_worker.py'
results = {'python': sys.executable, 'prefix': sys.prefix, 'basePrefix': sys.base_prefix, 'model': str(model)}
for action in ('health', 'generate'):
    request = {'action': action, 'model_id': str(model), 'compute_backend': 'cuda',
               'prompt': 'Side view gothic castle stone arch, blue glass, warm candlelight, painted game environment.',
               'negative_prompt': 'text, watermark, blurry', 'width': 512, 'height': 512, 'steps': 20, 'seed': 9302026}
    started = time.monotonic()
    completed = subprocess.run([sys.executable, str(worker)], input=json.dumps(request),
                               text=True, capture_output=True, env=env, timeout=600)
    (output / f'{action}-stderr.log').write_text(completed.stderr, encoding='utf-8')
    try:
        result = json.loads(completed.stdout)
    except json.JSONDecodeError:
        (output / f'{action}-stdout.log').write_text(completed.stdout, encoding='utf-8')
        raise RuntimeError(f'{action}: worker did not return JSON; exit={completed.returncode}')
    image = result.pop('image_base64', None)
    if image:
        (output / 'cuda-generation.png').write_bytes(base64.b64decode(image))
    result['wallSeconds'] = round(time.monotonic() - started, 2)
    results[action] = result
    (output / 'result.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
    print(json.dumps({'action': action, 'ok': result.get('ok'), 'device': result.get('device'),
                      'wallSeconds': result['wallSeconds'], 'output': str(output)}), flush=True)
    if completed.returncode or not result.get('ok'):
        raise SystemExit(f'{action} failed: {result.get("error", completed.returncode)}')
    if action == 'health' and not result.get('cuda'):
        raise SystemExit('CUDA backend was not available.')
    if action == 'generate' and (result.get('device') != 'cuda' or not image):
        raise SystemExit('Worker did not generate an image with CUDA.')
