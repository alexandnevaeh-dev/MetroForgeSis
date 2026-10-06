"""Produce candidate original 2D art with MetroForge's existing local CUDA worker.

No model acquisition, account change, paid job or automatic asset admission.
The worker/model are reused in one process; every source and receipt stays on E:.
"""
import argparse
import base64
import contextlib
import faulthandler
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import time

parser = argparse.ArgumentParser()
parser.add_argument('--spec', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args()
spec_path = Path(args.spec).resolve()
output = Path(args.output).resolve()
if spec_path.drive.lower() != 'e:' or output.drive.lower() != 'e:':
    raise SystemExit('Source specification and every output must stay on E:.')
if output.exists():
    raise SystemExit('Choose a new output folder; original evidence is never replaced.')
spec = json.loads(spec_path.read_text(encoding='utf-8-sig'))
model = Path(spec['model']).resolve()
if model.drive.lower() != 'e:' or not (model / 'model_index.json').is_file():
    raise SystemExit('Use an already installed E: model; this tool cannot acquire models.')
for name, folder in {
    'TEMP': 'Temp', 'TMP': 'Temp', 'HF_HOME': 'HuggingFace', 'TORCH_HOME': 'Torch',
    'XDG_CACHE_HOME': 'Cache', 'CUDA_CACHE_PATH': 'CudaCache', 'PIP_CACHE_DIR': 'PipCache',
}.items():
    destination = Path('E:/MetroForgeData') / folder
    destination.mkdir(parents=True, exist_ok=True)
    os.environ[name] = str(destination)
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['TORCH_DEVICE_BACKEND_AUTOLOAD'] = '0'
os.environ['DIFFUSERS_CPU_OFFLOAD'] = '1'
os.environ['DIFFUSERS_OFFLOAD_STRATEGY'] = 'model'
os.environ['DIFFUSERS_BASE_MODEL_PATH'] = str(model)
repo = Path(__file__).resolve().parent.parent
worker_path = repo / 'workers/diffusers_image_worker.py'
sys.path.insert(0, str(worker_path.parent))
module_spec = importlib.util.spec_from_file_location('quantum_local_image_worker', worker_path)
worker = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(worker)
output.mkdir(parents=True)
(output / 'spec.json').write_text(json.dumps(spec, indent=2), encoding='utf-8')
summary = {'genre': spec['genre'], 'output': str(output), 'productionApproved': False, 'jobs': []}
for job in spec['jobs']:
    if not job['id'].replace('-', '').isalnum():
        raise SystemExit('Invalid source job name.')
    job_dir = output / job['id']
    job_dir.mkdir()
    request = {'action': 'generate', 'model_id': str(model), 'compute_backend': 'cuda',
               **{key: job[key] for key in ['prompt', 'negative_prompt', 'width', 'height', 'steps', 'seed']}}
    if spec.get('local_style_adapter'):
        request['local_style_adapter'] = spec['local_style_adapter']
    (job_dir / 'request.json').write_text(json.dumps(request, indent=2), encoding='utf-8')
    print(json.dumps({'job': job['id'], 'state': 'started', 'output': str(job_dir)}), flush=True)
    started = time.monotonic()
    with (job_dir / 'worker.log').open('w', encoding='utf-8') as log:
        faulthandler.dump_traceback_later(120, repeat=True, file=log)
        try:
            with contextlib.redirect_stdout(log), contextlib.redirect_stderr(log):
                budget = worker.check_prompt(request)
                (job_dir / 'prompt-budget.json').write_text(json.dumps(budget, indent=2), encoding='utf-8')
                if budget.get('anyOverflow'):
                    raise ValueError('Prompt exceeds the installed model budget; source job was not submitted.')
                result = worker.generate_image(request)
        except Exception as error:
            result = {'ok': False, 'error': str(error), 'device': 'unverified'}
        finally:
            faulthandler.cancel_dump_traceback_later()
    encoded = result.pop('image_base64', None)
    result.update({'wallSeconds': round(time.monotonic() - started, 3), 'productionApproved': False,
                   'specSha256': hashlib.sha256(spec_path.read_bytes()).hexdigest()})
    if result.get('ok') and result.get('device') == 'cuda' and encoded:
        image = base64.b64decode(encoded, validate=True)
        (job_dir / 'source.png').write_bytes(image)
        result['sourceSha256'] = hashlib.sha256(image).hexdigest()
    (job_dir / 'receipt.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    if not (job_dir / 'source.png').is_file():
        summary['failed'] = {'id': job['id'], 'receipt': str(job_dir / 'receipt.json')}
        (output / 'result.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
        raise SystemExit('Local generation failed; retained source request, receipt and worker log.')
    summary['jobs'].append({'id': job['id'], 'source': str(job_dir / 'source.png'), 'receipt': str(job_dir / 'receipt.json')})
    (output / 'result.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
    print(json.dumps({'job': job['id'], 'state': 'generated', 'device': result['device'],
                      'source': str(job_dir / 'source.png'), 'wallSeconds': result['wallSeconds'],
                      'productionApproved': False}), flush=True)
