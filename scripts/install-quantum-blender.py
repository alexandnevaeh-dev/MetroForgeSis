"""Install the latest published 4.5 LTS portable Windows x64 build entirely on E:.

Verify the publisher's checksum before extraction; never replace an installation.
"""
import hashlib
import json
from pathlib import Path
import re
import shutil
import zipfile
import requests

downloads = Path('E:/MetroForgeData/Downloads/Blender')
runtime = Path('E:/MetroForgeData/Runtime/Blender')
downloads.mkdir(parents=True,exist_ok=True)
runtime.mkdir(parents=True,exist_ok=True)
session = requests.Session()
session.verify = 'E:/MetroForgeData/Certificates/windows-trusted-roots.pem'
base = 'https://download.blender.org/release/Blender4.5/'
listing = session.get(base,timeout=(30,60))
listing.raise_for_status()
(downloads / 'publisher-index.html').write_bytes(listing.content)
versions = set(re.findall(r'blender-(4\.5\.\d+)-windows-x64\.zip',listing.text))
versions = [version for version in versions if 'blender-'+version+'.sha256' in listing.text]
if not versions:
    raise SystemExit('No published stable portable build with checksum; nothing installed.')
version = max(versions,key=lambda value:tuple(map(int,value.split('.'))))
filename = 'blender-'+version+'-windows-x64.zip'
checksum = session.get(base+'blender-'+version+'.sha256',timeout=(30,60))
checksum.raise_for_status()
(downloads / ('blender-'+version+'.sha256')).write_bytes(checksum.content)
expected = None
for line in checksum.text.splitlines():
    match = re.fullmatch(r'([a-fA-F0-9]{64})\s+\*?'+re.escape(filename),line.strip())
    if match: expected = match[1].lower()
if not expected:
    raise SystemExit('Portable build has no exact publisher checksum; nothing installed.')
target = downloads / filename
installation = runtime / ('blender-'+version+'-windows-x64')
plan = {'version':version,'publisher':base,'source':base+filename,'sha256':expected,
        'archive':str(target),'installation':str(installation),'portable':True}
(downloads / 'install-plan.json').write_text(json.dumps(plan,indent=2),encoding='utf-8')
if not target.exists():
    partial = downloads / (filename+'.part')
    with session.get(base+filename,stream=True,timeout=(30,90)) as response:
        response.raise_for_status()
        with partial.open('wb') as file:
            for chunk in response.iter_content(1024*1024):
                if chunk: file.write(chunk)
    if hashlib.sha256(partial.read_bytes()).hexdigest()!=expected:
        raise SystemExit('Publisher checksum failed; partial retained on E:.')
    partial.rename(target)
elif hashlib.sha256(target.read_bytes()).hexdigest()!=expected:
    raise SystemExit('Existing archive differs; no overwrite attempted.')
if not installation.exists():
    with zipfile.ZipFile(target) as archive:
        root = runtime.resolve()
        for member in archive.infolist():
            resolved = (runtime / member.filename).resolve()
            if not resolved.is_relative_to(root) or member.filename.split('/')[0]!=installation.name:
                raise SystemExit('Archive member leaves the exact intended installation.')
        archive.extractall(runtime)
if not (installation / 'blender.exe').is_file():
    raise SystemExit('Verified archive has no expected Blender executable.')
(installation / 'portable').mkdir(exist_ok=True)
receipt = {**plan,'verified':True,'executable':str(installation / 'blender.exe')}
(runtime / 'installed.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
print(json.dumps(receipt),flush=True)
