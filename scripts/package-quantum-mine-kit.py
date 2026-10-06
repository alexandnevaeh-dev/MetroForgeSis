"""Admit only unchanged complete native mine-kit bakes into an isolated candidate pack."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('--source', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args()
source, output = Path(args.source).resolve(), Path(args.output).resolve()
repo = Path(__file__).resolve().parent.parent
assert source.drive.lower() == 'e:' and output.drive.lower() == 'e:' and not output.exists()
digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
receipt = json.loads((source/'receipt.json').read_text(encoding='utf-8'))
assert receipt['ok'] is True and receipt['renderVendor'] == 'NVIDIA'
assert abs(receipt['pixelsPerUnit']-96/3.5) < 1e-9
assert receipt['sourceScriptSha256'] == digest(repo/'prototypes/quantum-divergence/tools/MineKitBaker.gd')
assert receipt['helperScriptSha256'] == digest(repo/'prototypes/quantum-divergence/tools/DiverRigBaker.gd')
expected = {'bedrock-a':(64,64),'bedrock-b':(64,64),'catwalk':(64,64),'ore':(64,64),'sand':(64,64),'fluid':(64,64),
            'wall-a':(256,192),'wall-b':(256,192),'wall-rib':(128,256),'station':(128,128),'anchor':(64,96),
            'core':(128,128),'lift':(192,192),'crystal':(40,72)}
assert set(receipt['assets']) == set(expected)
for name, size in expected.items():
    entry = receipt['assets'][name]
    assert entry['frame'] == list(size) and entry['logicalSize'] == [value/2 for value in size]
    assert entry['pivot'] == [size[0]/2,size[1]] and entry['groundLine'] == size[1]
    for file_key, hash_key in [('path','sha256'),('sourcePath','sourceSha256')]:
        path = (source/entry[file_key]).resolve()
        assert path.is_relative_to(source) and path.name == entry[file_key]
        assert digest(path) == entry[hash_key]
    with Image.open(source/entry['path']) as image:
        assert image.mode == 'RGBA' and image.format == 'PNG' and image.size == size
        bounds = image.getchannel('A').getbbox()
        assert bounds and list((bounds[0],bounds[1],bounds[2]-bounds[0],bounds[3]-bounds[1])) == entry['bounds']
        if entry['opaque']:
            assert image.getchannel('A').getextrema() == (255,255), name+' material/wall has an unintended hole'
        else:
            assert bounds[0] >= 2 and bounds[1] >= 2 and bounds[2] <= size[0]-2 and image.getpixel((0,0))[3] == 0
            if name != 'wall-rib': assert bounds[3] == size[1], name+' prop is floating above its ground pivot'
output.mkdir(parents=True)
for entry in receipt['assets'].values():
    for key in ['path','sourcePath']: shutil.copyfile(source/entry[key], output/entry[key])
shutil.copyfile(source/'receipt.json',output/'native-bake-receipt.json')
manifest = {'version':1,'genre':'quantum-divergence','candidateOnly':True,'productionApproved':False,
            'assets':receipt['assets'],'sourceScriptSha256':receipt['sourceScriptSha256'],
            'helperScriptSha256':receipt['helperScriptSha256'], 'nativeSource':str(source),
            'scope':'Original Probability Mines environment candidate, with fixed actor-compatible scale. Full world rendering and visual approval remain separate gates.',
            'hashes':{path.name:digest(path) for path in output.iterdir() if path.is_file()}}
(output/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
(output/'.gitattributes').write_text('*.json -text\n*.tscn -text\n*.png binary\n',encoding='utf-8')
(output/'README.md').write_text('# Original Probability Mines kit candidate\n\nFourteen original native geometry bakes: terrain/materials, interior wall layers, structural ribs and grounded interactive machinery. Uses the Diver material palette, lights and camera pixel density. Source geometry and frame hashes accompany the artwork. Assets are specific to Quantum Divergence and remain unapproved candidates. No outside asset meshes or textures.\n',encoding='utf-8')
print(json.dumps({'candidate':str(output),'assets':len(expected),'productionApproved':False}))
