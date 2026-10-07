"""Read-only source-region alpha audit. Requires Pillow; never writes sprite pixels."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--manifest', type=Path, required=True)
parser.add_argument('--report', type=Path, required=True)
args = parser.parse_args()
manifest = json.loads(args.manifest.read_text(encoding='utf-8-sig'))
pack = args.manifest.parent.resolve()
images = {}
rows = []
for name, clip in manifest['animations'].items():
    sheet = clip.get('sourceSheet')
    if not sheet:
        continue
    # This pack format stores export destinations; originals live beside its manifest.
    path = pack / Path(sheet).name
    if path not in images:
        images[path] = Image.open(path).convert('RGBA').getchannel('A')
    alpha = images[path]
    for frame, region in enumerate(clip.get('sourceRegions', [])):
        if len(region) != 4 or any(not isinstance(v, int) for v in region):
            raise ValueError(f'{name} frame {frame}: invalid region')
        x, y, width, height = region
        if min(x, y) < 0 or min(width, height) <= 0 or x+width > alpha.width or y+height > alpha.height:
            raise ValueError(f'{name} frame {frame}: region outside source')
        cell = alpha.crop((x, y, x+width, y+height))
        measurements = {}
        for threshold in (1, 18, 128, 255):
            bounds = cell.point(lambda p: 255 if p >= threshold else 0).getbbox()
            margins = [bounds[0], bounds[1], width-bounds[2], height-bounds[3]] if bounds else None
            measurements[str(threshold)] = {'bounds': bounds, 'margins': margins, 'boundaryContact': margins is not None and min(margins) == 0}
        rows.append({'clip': name, 'frame': frame, 'source': path.name, 'region': region, 'alpha': measurements})
result = {
    'scope': 'Read-only alpha boundary review; contact alone does not prove neighboring pose intrusion or animation quality.',
    'manifestSha256': hashlib.sha256(args.manifest.read_bytes()).hexdigest(),
    'sources': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in images},
    'frames': rows,
    'totalFrames': len(rows),
    'fullAlphaBoundaryContacts': sum(r['alpha']['1']['boundaryContact'] for r in rows),
    'visibleAlphaBoundaryContacts': sum(r['alpha']['18']['boundaryContact'] for r in rows),
}
args.report.parent.mkdir(parents=True, exist_ok=True)
args.report.write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps({k: result[k] for k in ('totalFrames', 'fullAlphaBoundaryContacts', 'visibleAlphaBoundaryContacts')}))
