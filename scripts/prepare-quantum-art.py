"""Non-destructive, fixed-scale normalization of reviewed Quantum source candidates.

Creates a static seed for the subsequent strip workflow; never fabricates clips
by duplicating a still frame and never updates the playable world's asset set.
"""
import argparse
from collections import deque
import hashlib
import json
from pathlib import Path
import shutil
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('--source', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--diver-job', choices=['diver-seed', 'diver-seed-a', 'diver-seed-b'], default='diver-seed')
parser.add_argument('--actors', nargs='+', choices=['diver','skitter','wraith','driller','golem'], default=['diver','skitter','wraith','driller','golem'])
parser.add_argument('--matte', help='Verified soft-alpha output from isolate-quantum-art.py')
parser.add_argument('--wall-source', help='Separate reviewed Quantum batch containing mine-interior')
parser.add_argument('--review', required=True, help='Explicit visual decisions bound to unchanged source hashes')
args = parser.parse_args()
source = Path(args.source).resolve()
output = Path(args.output).resolve()
if source.drive.lower() != 'e:' or output.drive.lower() != 'e:' or output.exists():
    raise SystemExit('Use E: source and a new E: candidate destination.')
spec = json.loads((source / 'spec.json').read_text(encoding='utf-8'))
if spec.get('genre') != 'quantum-divergence':
    raise SystemExit('Only the separate Quantum source set can enter this candidate pack.')
receipts = {}
images = {}
for job in spec['jobs']:
    name = job['id']
    if name not in ['diver-seed', 'diver-seed-a', 'diver-seed-b', 'skitter-seed', 'wraith-seed', 'driller-seed', 'golem-seed', 'mine-interior']:
        raise SystemExit('Unexpected source job.')
    path = source / name / 'source.png'
    receipt = json.loads((source / name / 'receipt.json').read_text(encoding='utf-8'))
    if not receipt.get('ok') or receipt.get('device') != 'cuda':
        raise SystemExit('An actual successful local CUDA receipt is required.')
    if hashlib.sha256(path.read_bytes()).hexdigest() != receipt.get('sourceSha256'):
        raise SystemExit('Source changed since generation: ' + name)
    image = Image.open(path)
    if image.format != 'PNG' or image.size != (job['width'], job['height']):
        raise SystemExit('Unexpected source format/dimensions: ' + name)
    images[name] = image.convert('RGBA')
    receipts[name] = receipt

if args.wall_source:
    wall_source = Path(args.wall_source).resolve()
    if wall_source.drive.lower() != 'e:':
        raise SystemExit('Wall source must stay on E:.')
    wall_spec = json.loads((wall_source / 'spec.json').read_text(encoding='utf-8'))
    wall_job = next((job for job in wall_spec['jobs'] if job['id'] == 'mine-interior'), None)
    wall_path = wall_source / 'mine-interior/source.png'
    wall_receipt = json.loads((wall_source / 'mine-interior/receipt.json').read_text(encoding='utf-8'))
    if wall_spec.get('genre') != 'quantum-divergence' or not wall_job or not wall_receipt.get('ok') or wall_receipt.get('device') != 'cuda' or hashlib.sha256(wall_path.read_bytes()).hexdigest() != wall_receipt.get('sourceSha256'):
        raise SystemExit('Unchanged actual CUDA Quantum wall required.')
    wall_image = Image.open(wall_path)
    if wall_image.format != 'PNG' or wall_image.size != (wall_job['width'],wall_job['height']):
        raise SystemExit('Unexpected wall format/dimensions.')
    images['mine-interior'] = wall_image.convert('RGBA')
    receipts['mine-interior'] = wall_receipt

review_path = Path(args.review).resolve()
if review_path.drive.lower() != 'e:':
    raise SystemExit('Keep visual decisions on E:.')
review = json.loads(review_path.read_text(encoding='utf-8'))
if review.get('genre') != 'quantum-divergence' or review.get('productionApproved') is not False:
    raise SystemExit('Only reviewed static candidates enter this preview pack.')
matte_report = None
if args.matte:
    matte_root = Path(args.matte).resolve()
    if matte_root.drive.lower() != 'e:':
        raise SystemExit('Keep matte output on E:.')
    matte_report = json.loads((matte_root / 'mattes.json').read_text(encoding='utf-8'))
    if Path(matte_report['source']).resolve() != source or matte_report.get('modelSha256') != '10025a17f49cd3208afc342b589890e402ee63123d6f2d289a4a0903695cce58':
        raise SystemExit('Matte provenance differs from the selected source/model.')

def require_review(name):
    decision = review.get('jobs',{}).get(name,{})
    if decision.get('status') != 'staticSeedAccepted' or decision.get('sourceSha256') != receipts[name]['sourceSha256']:
        raise ValueError('Unreviewed/rejected/changed source cannot enter a candidate pack: ' + name)

def reviewed_actor(name):
    require_review(name)
    if matte_report is None:
        return images[name], False
    record = matte_report['jobs'].get(name,{})
    relative = Path(record.get('path',''))
    if relative.is_absolute() or relative.name != name + '.png' or record.get('sourceSha256') != receipts[name]['sourceSha256']:
        raise ValueError('Matte source identity differs.')
    path = matte_root / relative
    if hashlib.sha256(path.read_bytes()).hexdigest() != record.get('sha256'):
        raise ValueError('Matte changed after isolation.')
    image = Image.open(path)
    if image.mode != 'RGBA' or image.size != images[name].size:
        raise ValueError('Matte format or dimensions differ.')
    image.putalpha(image.getchannel('A').point(lambda alpha: 255 if alpha >= 128 else 0))
    return image, True

def normalize_actor(raw, frame_size, center_anchor=False, isolated=False):
    # Remove only green background connected to image edges; internal costume
    # pixels are preserved. This is matte/format normalization, not a new edit.
    raw = raw.copy()
    pixels = raw.load()
    width, height = raw.size
    removed = bytearray(width * height)
    queue = deque()
    def is_matte(x, y):
        r, g, b, _ = pixels[x, y]
        return pixels[x,y][3] == 0 if isolated else g > r + 24 and g > b + 12 and g > 85
    def admit(x, y):
        index = y * width + x
        if not removed[index] and is_matte(x, y):
            removed[index] = 1
            queue.append((x, y))
    for x in range(width):
        admit(x, 0)
        admit(x, height - 1)
    for y in range(height):
        admit(0, y)
        admit(width - 1, y)
    while queue:
        x, y = queue.popleft()
        for nx, ny in [(x-1,y), (x+1,y), (x,y-1), (x,y+1)]:
            if 0 <= nx < width and 0 <= ny < height:
                admit(nx, ny)
    matte_fraction = sum(removed) / (width * height)
    if matte_fraction < 0.45:
        raise ValueError('Source matte is insufficiently isolated; keep it for another pass.')
    for y in range(height):
        for x in range(width):
            if removed[y * width + x]:
                pixels[x, y] = (0, 0, 0, 0)
    bounds = raw.getchannel('A').getbbox()
    if not bounds or bounds[0] < 2 or bounds[1] < 2 or bounds[2] > width - 2 or bounds[3] > height - 2:
        raise ValueError('Candidate has clipped or contaminated bounds; do not admit it.')
    body = raw.crop(bounds)
    fw, fh = frame_size
    scale = min((fw - 2) / body.width, (fh - 4) / body.height)
    size = (max(1,round(body.width * scale)),max(1,round(body.height * scale)))
    body = body.resize(size, Image.Resampling.NEAREST)
    alpha = body.getchannel('A')
    body = body.convert('RGB').quantize(colors=48, dither=Image.Dither.NONE).convert('RGBA')
    body.putalpha(alpha)
    frame = Image.new('RGBA', frame_size)
    frame.alpha_composite(body, ((fw - size[0]) // 2,(fh - size[1]) // 2 if center_anchor else fh - size[1]))
    if not center_anchor and frame.getchannel('A').getbbox()[3] != fh:
        raise ValueError('Bottom-center foot anchor was not retained.')
    return frame, {'scale': scale, 'sourceBounds': list(bounds), 'matteFraction': matte_fraction}

if 'diver' not in args.actors or len(set(args.actors)) != len(args.actors):
    raise SystemExit('Select the diver and unique actor names.')
selected = {'diver': (args.diver_job, (32,48), False)}
for kind, dimensions in [('skitter',(32,32)), ('wraith',(32,48)), ('driller',(48,32)), ('golem',(64,96))]:
    if kind in args.actors:
        if kind + '-seed' not in images:
            raise SystemExit('Missing explicitly selected actor: ' + kind)
        selected[kind] = (kind + '-seed', dimensions, kind == 'wraith')
frames = {}
normalization = {}
for kind, (job_id, dimensions, center) in selected.items():
    raw, isolated = reviewed_actor(job_id)
    frames[kind], normalization[kind] = normalize_actor(raw, dimensions, center, isolated)
require_review('mine-interior')
wall = images['mine-interior'].convert('RGB').resize((384,192), Image.Resampling.NEAREST)
wall = wall.quantize(colors=96, dither=Image.Dither.NONE).convert('RGB')
model_license = Path(spec['model']) / 'LICENSE.md'
if not model_license.is_file():
    raise SystemExit('Keep the installed model license with the original source candidates.')
output.mkdir(parents=True)
(output / 'raw').mkdir()
for kind, frame in frames.items():
    frame.save(output / (kind + '-idle-seed.png'))
wall.save(output / 'mine-wall.png')
for name in images:
    raw_source = wall_source if name == 'mine-interior' and args.wall_source else source
    shutil.copyfile(raw_source / name / 'source.png', output / 'raw' / (name + '.png'))
(output / 'generation-receipts.json').write_text(json.dumps(receipts, indent=2), encoding='utf-8')
(output / 'source-spec.json').write_text(json.dumps(spec, indent=2), encoding='utf-8')
shutil.copyfile(model_license, output / 'model-license.md')
shutil.copyfile(review_path, output / 'visual-review.json')
if args.wall_source:
    shutil.copyfile(wall_source / 'spec.json', output / 'wall-source-spec.json')
if matte_report:
    (output / 'isolation-receipts.json').write_text(json.dumps(matte_report,indent=2),encoding='utf-8')
    matte_model = Path('E:/MetroForgeData/Models/carve-u2net-universal')
    shutil.copyfile(matte_model / 'installed.json', output / 'isolation-model.json')
    shutil.copyfile(matte_model / 'README.md', output / 'isolation-model-card.md')
if spec.get('local_style_adapter'):
    style_model = Path(spec['local_style_adapter']['path']).parent
    shutil.copyfile(style_model / 'installed.json', output / 'style-model.json')
    shutil.copyfile(style_model / 'README.md', output / 'style-model-card.md')
manifest = {
    'version': 1, 'genre': 'quantum-divergence', 'candidateOnly': True,
    'productionApproved': False, 'animationReady': False,
    'completeCast': len(selected) == 5,
    'review': 'Static source candidates require in-engine review; animation strips and the complete matching cast are still pending.',
    'diver': {'path': 'diver-idle-seed.png', 'frame': [32,48], 'pivot': [16,48], 'uniqueFrames': 1},
    'wall': {'path': 'mine-wall.png', 'size': [384,192]},
    'actors': {kind: {'path': kind + '-idle-seed.png', 'frame': list(frame.size),
                     'pivot': [frame.width//2,frame.height//2 if kind == 'wraith' else frame.height],
                     'anchor': 'center' if kind == 'wraith' else 'feet', 'uniqueFrames': 1}
               for kind, frame in frames.items()},
    'normalization': {'actors': normalization, 'nearestResampling': True, 'actorPaletteLimit': 48, 'wallPaletteLimit': 96},
    'hashes': {str(path.relative_to(output)).replace('\\','/'): hashlib.sha256(path.read_bytes()).hexdigest()
               for path in output.rglob('*') if path.is_file()},
}
(output / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print(json.dumps({'candidate': str(output), 'frame': [32,48], 'pivot': [16,48],
                  'productionApproved': False, 'animationReady': False}))
