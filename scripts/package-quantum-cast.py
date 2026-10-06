"""Validate native articulated cast bakes before packaging fixed-scale sprite strips."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
from PIL import Image, ImageDraw

parser = argparse.ArgumentParser()
parser.add_argument('--source-root', required=True)
parser.add_argument('--suffix', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args()
root, output = Path(args.source_root).resolve(), Path(args.output).resolve()
repo = Path(__file__).resolve().parent.parent
assert root.drive.lower() == 'e:' and output.drive.lower() == 'e:' and not output.exists()
digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
contracts = {
    'skitter': ((64,64), {'idle':(6,10),'walk':(8,16),'run':(10,24),'attack':(6,24),'hit':(3,18),'death':(8,18)}),
    'driller': ((96,64), {'idle':(6,10),'walk':(8,16),'run':(10,24),'attack':(8,24),'hit':(3,18),'death':(8,18),'drill':(8,24)}),
    'wraith': ((64,96), {'idle':(6,10),'walk':(8,16),'run':(8,24),'attack':(6,24),'hit':(3,18),'death':(10,18),'levitate':(6,16)}),
    'golem': ((128,192), {'idle':(8,10),'walk':(10,16),'run':(12,24),'attack':(12,24),'hit':(4,18),'death':(16,18),'slam':(12,24),'burst':(10,24),'roar':(8,24)})
}
validated = {}
for actor, (size, clips) in contracts.items():
    source = root / ('quantum-' + actor + '-' + args.suffix)
    receipt = json.loads((source/'receipt.json').read_text(encoding='utf-8'))
    pivot = [size[0]//2, size[1]//2 if actor == 'wraith' else size[1]]
    assert receipt['ok'] is True and receipt['boneLengthsVerified'] is True
    assert receipt['actor'] == actor and receipt['renderVendor'] == 'NVIDIA'
    assert receipt['frame'] == list(size) and receipt['logicalSize'] == [value//2 for value in size]
    assert receipt['pivot'] == pivot and abs(receipt['pixelsPerUnit'] - 96/3.5) < 1e-9
    assert receipt['sourceScriptSha256'] == digest(repo/'prototypes/quantum-divergence/tools/QuantumActorBaker.gd')
    assert receipt['helperScriptSha256'] == digest(repo/'prototypes/quantum-divergence/tools/DiverRigBaker.gd')
    assert receipt['sourceSceneSha256'] == digest(source/'quantum-diver-source.tscn')
    assert set(receipt['clips']) == set(clips), actor+' incomplete core/special clips'
    frames = {}
    for clip, (count, fps) in clips.items():
        record = receipt['clips'][clip]
        assert record['count'] == count and record['fps'] == fps and len(record['frames']) == count
        collection = []
        for entry in record['frames']:
            relative = Path(entry['path'])
            path = (source/relative).resolve()
            assert not relative.is_absolute() and path.is_relative_to(source)
            assert digest(path) == entry['sha256'], actor+'/'+clip+' changed native frame'
            with Image.open(path) as image:
                assert image.format == 'PNG' and image.mode == 'RGBA' and image.size == size
                bounds = image.getchannel('A').getbbox()
                assert bounds and bounds[0] >= 2 and bounds[1] >= 2 and bounds[2] <= size[0]-2
                assert list((bounds[0], bounds[1], bounds[2]-bounds[0], bounds[3]-bounds[1])) == entry['bounds']
                assert image.getpixel((0,0))[3] == 0
                if actor == 'wraith':
                    assert bounds[3] <= size[1]-2 and entry['groundLine'] == size[1]/2
                else:
                    assert bounds[3] == size[1] and entry['groundLine'] == size[1], actor+'/'+clip+' floating contact'
                collection.append(image.copy())
        assert len({hashlib.sha256(image.tobytes()).hexdigest() for image in collection}) == count, actor+'/'+clip+' repeated poses'
        frames[clip] = collection
    validated[actor] = (source, receipt, frames)

# Nothing is published until every actor's source, dimensions, pose and contact passes.
output.mkdir(parents=True)
actors = {}
for actor, (source, receipt, frames) in validated.items():
    directory = output/actor
    directory.mkdir()
    size, contract = contracts[actor]
    definitions = {}
    preview = Image.new('RGBA', (size[0]*17, (size[1]+24)*len(frames)), (10,21,35,255))
    draw = ImageDraw.Draw(preview)
    for row, (clip, collection) in enumerate(frames.items()):
        strip = Image.new('RGBA', (size[0]*len(collection), size[1]))
        draw.text((4, row*(size[1]+24)+4), clip, fill=(170,210,226,255))
        for index, image in enumerate(collection):
            strip.alpha_composite(image,(size[0]*index,0))
            preview.alpha_composite(image,(size[0]*(index+1),row*(size[1]+24)+24))
        strip.save(directory/(clip+'.png'))
        definitions[clip] = {'path':actor+'/'+clip+'.png','frames':len(collection),'fps':contract[clip][1],
                             'loop':clip in ('idle','walk','run','drill','levitate'),'uniqueFrames':len(collection)}
    preview.save(directory/'pose-review.png')
    shutil.copyfile(source/'receipt.json', directory/'native-bake-receipt.json')
    shutil.copyfile(source/'quantum-diver-source.tscn', directory/'actor-source.tscn')
    actors[actor] = {'frame':list(size),'logicalSize':[value//2 for value in size], 'pivot':receipt['pivot'],
                     'clips':definitions,'frameCount':sum(len(value) for value in frames.values()),
                     'distinctImages':len({hashlib.sha256(image.tobytes()).hexdigest() for collection in frames.values() for image in collection}),
                     'sourceScriptSha256':receipt['sourceScriptSha256'], 'helperScriptSha256':receipt['helperScriptSha256'],
                     'nativeSource':str(source), 'intentionalLevitation':actor == 'wraith'}
manifest = {'version':1,'genre':'quantum-divergence','candidateOnly':True,'productionApproved':False,
            'animationReady':False,'completeCast':False,'actors':actors,
            'frameCount':sum(value['frameCount'] for value in actors.values()),
            'distinctImages':sum(value['distinctImages'] for value in actors.values()),
            'scope':'Original matching cast candidate; complete native animation review and coherent world art remain required. Wraith teleport is not implemented or claimed.',
            'hashes':{str(path.relative_to(output)).replace('\\','/'):digest(path) for path in output.rglob('*') if path.is_file()}}
(output/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
(output/'.gitattributes').write_text('*.json -text\n*.tscn -text\n*.png binary\n',encoding='utf-8')
(output/'README.md').write_text('# Quantum original cast candidates\n\nOriginal articulated Skitter, Driller, Wraith and Probability Golem geometry, baked with the Diver material palette and camera pixel density. No external meshes or textures. Assets remain unapproved candidates, separate from both other MetroForge game sets. Native frame hashes, source geometry and receipts accompany the strips. Grounded actors use feet pivots; Wraith uses a center pivot for deliberate levitation. No Wraith teleport implementation or approval is implied.\n',encoding='utf-8')
print(json.dumps({'candidate':str(output),'actors':list(actors),'frameCount':manifest['frameCount'],'distinctImages':manifest['distinctImages'],
                  'productionApproved':False,'animationReady':False}))
