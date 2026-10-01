"""Run MetroForge's actual U2-Net matte on explicitly selected E: candidates.

Keep every raw source and soft alpha result; isolation cannot approve art.
"""
import argparse
import base64
import contextlib
import faulthandler
import hashlib
import json
import os
from pathlib import Path
import sys
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('--source', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--jobs', nargs='+', required=True)
args = parser.parse_args()
source, output = Path(args.source).resolve(), Path(args.output).resolve()
if source.drive.lower() != 'e:' or output.drive.lower() != 'e:' or output.exists():
    raise SystemExit('Use existing E: source and a fresh E: output.')
weights = Path('E:/MetroForgeData/Models/carve-u2net-universal/full_weights.pth')
expected = '10025a17f49cd3208afc342b589890e402ee63123d6f2d289a4a0903695cce58'
if not weights.is_file() or hashlib.sha256(weights.read_bytes()).hexdigest() != expected:
    raise SystemExit('Installed isolation model must match its published digest.')
for name, folder in {'TEMP':'Temp','TMP':'Temp','TORCH_HOME':'Torch','CUDA_CACHE_PATH':'CudaCache','XDG_CACHE_HOME':'Cache'}.items():
    os.environ[name] = str(Path('E:/MetroForgeData') / folder)
os.environ['TORCH_DEVICE_BACKEND_AUTOLOAD'] = '0'
os.environ['METROFORGE_U2NET_WEIGHTS_PATH'] = str(weights)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'workers'))
import foreground_isolation

spec = json.loads((source / 'spec.json').read_text(encoding='utf-8'))
if spec.get('genre') != 'quantum-divergence':
    raise SystemExit('Keep genre sets separate.')
jobs = {job['id']:job for job in spec['jobs']}
if len(set(args.jobs)) != len(args.jobs) or any(job not in jobs for job in args.jobs):
    raise SystemExit('Select unique, explicitly listed source jobs.')
output.mkdir(parents=True)
report = {'source':str(source),'model':'Carve/u2net-universal','modelSha256':expected,
          'productionApproved':False,'jobs':{}}
for name in args.jobs:
    image_path = source / name / 'source.png'
    raw = image_path.read_bytes()
    receipt = json.loads((source / name / 'receipt.json').read_text(encoding='utf-8'))
    if not receipt.get('ok') or receipt.get('device') != 'cuda' or hashlib.sha256(raw).hexdigest() != receipt.get('sourceSha256'):
        raise SystemExit('Successful unchanged CUDA source required: ' + name)
    print(json.dumps({'job':name,'state':'isolating'}),flush=True)
    with (output / (name + '.log')).open('w',encoding='utf-8') as log:
        faulthandler.dump_traceback_later(120,repeat=True,file=log)
        try:
            with contextlib.redirect_stdout(log), contextlib.redirect_stderr(log):
                result = foreground_isolation.segment_foreground(raw)
        finally:
            faulthandler.cancel_dump_traceback_later()
    encoded = result.pop('image_base64',None)
    if not result.get('ok') or not encoded:
        (output / (name + '-failed.json')).write_text(json.dumps(result,indent=2),encoding='utf-8')
        raise SystemExit('Isolation failed; evidence retained.')
    png = base64.b64decode(encoded,validate=True)
    destination = output / (name + '.png')
    destination.write_bytes(png)
    image = Image.open(destination)
    if image.mode != 'RGBA' or image.size != (jobs[name]['width'],jobs[name]['height']):
        raise SystemExit('Unexpected matte format/dimensions.')
    result.update({'path':destination.name,'sourceSha256':receipt['sourceSha256'],
                   'sha256':hashlib.sha256(png).hexdigest(),'productionApproved':False})
    report['jobs'][name] = result
    (output / 'mattes.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps({'job':name,'state':'isolated','device':result['device'],'occupancy':result['occupancy']}),flush=True)
