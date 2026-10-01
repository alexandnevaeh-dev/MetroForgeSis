"""Acquire one pinned local pixel-art adapter on E: and verify its published digest."""
import hashlib
import json
import os
from pathlib import Path
import requests

root = Path('E:/MetroForgeData/Models/nerijs-pixel-art-xl')
root.mkdir(parents=True, exist_ok=True)
revision = '8bf4a4d9ea283e00a51fafda8e0539f8248ea037'
filename = 'pixel-art-xl.safetensors'
expected = '4234637cb80c998f41e348e6a6cb6bc20d8d038b2b0f256b6129b3b5e353eef7'
url = f'https://huggingface.co/nerijs/pixel-art-xl/resolve/{revision}/{filename}'
plan = {'repository': 'nerijs/pixel-art-xl', 'revision': revision, 'license': 'creativeml-openrail-m',
        'source': url, 'destination': str(root / filename), 'sha256': expected, 'bytes': 170543052}
(root / 'download-plan.json').write_text(json.dumps(plan, indent=2), encoding='utf-8')
certificate = 'E:/MetroForgeData/Certificates/windows-trusted-roots.pem'
session = requests.Session()
session.verify = certificate
target = root / filename
if not target.exists():
    partial = root / (filename + '.part')
    with session.get(url, stream=True, timeout=(30,90)) as response:
        response.raise_for_status()
        with partial.open('wb') as file:
            for chunk in response.iter_content(1024 * 1024):
                if chunk:
                    file.write(chunk)
    actual = hashlib.sha256(partial.read_bytes()).hexdigest()
    if actual != expected or partial.stat().st_size != plan['bytes']:
        raise SystemExit('Adapter download integrity failed; partial bytes are retained on E:.')
    partial.rename(target)
elif hashlib.sha256(target.read_bytes()).hexdigest() != expected:
    raise SystemExit('Existing adapter differs; it will not be replaced.')
card_url = f'https://huggingface.co/nerijs/pixel-art-xl/resolve/{revision}/README.md'
card = session.get(card_url, timeout=(30,60))
card.raise_for_status()
if 'license: creativeml-openrail-m' not in card.text:
    raise SystemExit('Pinned model card license differs from the reviewed source.')
(root / 'README.md').write_bytes(card.content)
(root / 'installed.json').write_text(json.dumps({**plan,'verified':True,'modelCard':card_url}, indent=2), encoding='utf-8')
print(json.dumps({'installed':str(target),'bytes':target.stat().st_size,'sha256':expected,'verified':True}))
