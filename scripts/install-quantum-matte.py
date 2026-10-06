"""Install the pinned U2-Net weights already supported by MetroForge, on E:."""
import hashlib
import json
from pathlib import Path
import requests

root = Path('E:/MetroForgeData/Models/carve-u2net-universal')
root.mkdir(parents=True, exist_ok=True)
revision = '10305d785481cf4b2eee1d447c39cd6e5f43d74b'
filename = 'full_weights.pth'
digest = '10025a17f49cd3208afc342b589890e402ee63123d6f2d289a4a0903695cce58'
size = 176290937
url = f'https://huggingface.co/Carve/u2net-universal/resolve/{revision}/{filename}'
plan = {'repository':'Carve/u2net-universal','revision':revision,'license':'apache-2.0',
        'source':url,'destination':str(root / filename),'sha256':digest,'bytes':size}
(root / 'download-plan.json').write_text(json.dumps(plan,indent=2),encoding='utf-8')
session = requests.Session()
session.verify = 'E:/MetroForgeData/Certificates/windows-trusted-roots.pem'
card_url = f'https://huggingface.co/Carve/u2net-universal/resolve/{revision}/README.md'
card = session.get(card_url,timeout=(30,60))
card.raise_for_status()
if 'license: apache-2.0' not in card.text:
    raise SystemExit('Pinned source license differs from the reviewed model.')
target = root / filename
if not target.exists():
    partial = root / (filename + '.part')
    with session.get(url,stream=True,timeout=(30,90)) as response:
        response.raise_for_status()
        with partial.open('wb') as file:
            for chunk in response.iter_content(1024*1024):
                if chunk: file.write(chunk)
    if partial.stat().st_size != size or hashlib.sha256(partial.read_bytes()).hexdigest() != digest:
        raise SystemExit('Integrity failed; partial bytes retained on E:.')
    partial.rename(target)
elif target.stat().st_size != size or hashlib.sha256(target.read_bytes()).hexdigest() != digest:
    raise SystemExit('Existing weights differ; no overwrite attempted.')
(root / 'README.md').write_bytes(card.content)
(root / 'installed.json').write_text(json.dumps({**plan,'verified':True,'modelCard':card_url},indent=2),encoding='utf-8')
print(json.dumps({'installed':str(target),'verified':True,'bytes':size,'sha256':digest}))
