"""Package unchanged native rig frames into fixed-scale candidate sprite strips."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
from PIL import Image, ImageDraw

parser=argparse.ArgumentParser()
parser.add_argument('--source',required=True)
parser.add_argument('--output',required=True)
args=parser.parse_args()
source,output=Path(args.source).resolve(),Path(args.output).resolve()
if source.drive.lower()!='e:' or output.drive.lower()!='e:' or output.exists():
    raise SystemExit('Use unchanged E: source and a fresh E: candidate pack.')
receipt=json.loads((source/'receipt.json').read_text(encoding='utf-8'))
repo=Path(__file__).resolve().parent.parent
digest=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
if receipt.get('ok') is not True or receipt.get('boneLengthsVerified') is not True or receipt.get('renderVendor')!='NVIDIA' or receipt.get('frame')!=[64,96] or receipt.get('logicalSize')!=[32,48] or receipt.get('pivot')!=[32,96]:
    raise SystemExit('Require a complete native NVIDIA rig bake with fixed dimensions/pivot.')
if digest(repo/'prototypes/quantum-divergence/tools/DiverRigBaker.gd')!=receipt['sourceScriptSha256'] or digest(source/'quantum-diver-source.tscn')!=receipt['sourceSceneSha256']:
    raise SystemExit('Native source changed after baking.')
expected={'idle':(6,10),'walk':(8,16),'run':(10,24),'attack':(6,24),'hit':(3,18),
          'death':(12,18),'jump':(4,16),'levitate':(6,16),'dash':(6,24)}
frames={}
for clip,(count,fps) in expected.items():
    record=receipt['clips'].get(clip,{})
    if record.get('count')!=count or record.get('fps')!=fps or len(record.get('frames',[]))!=count:
        raise SystemExit('Required clip incomplete: '+clip)
    collection=[]
    for record_frame in record['frames']:
        relative=Path(record_frame['path'])
        path=(source/relative).resolve()
        if relative.is_absolute() or not path.is_relative_to(source) or digest(path)!=record_frame['sha256']:
            raise SystemExit('Changed/out-of-source frame: '+clip)
        image=Image.open(path)
        if image.format!='PNG' or image.mode!='RGBA' or image.size!=(64,96):
            raise SystemExit('Wrong frame format/dimensions: '+clip)
        bounds=image.getchannel('A').getbbox()
        if not bounds or bounds[0]<2 or bounds[1]<2 or bounds[2]>62 or image.getpixel((0,0))[3]!=0:
            raise SystemExit('Clipped/opaque candidate: '+clip)
        if clip not in ('jump','levitate') and bounds[3]!=96:
            raise SystemExit('Grounded pose has a floating bottom anchor: '+clip)
        if record_frame['groundLine']!=96:
            raise SystemExit('Camera scale/ground projection differs: '+clip)
        collection.append(image.copy())
    if len(set(hashlib.sha256(image.tobytes()).hexdigest() for image in collection))!=count:
        raise SystemExit('Repeated poses cannot satisfy distinct-frame targets: '+clip)
    frames[clip]=collection
# Publish only after every source frame, clip and pivot has passed inspection.
output.mkdir(parents=True)
definitions={}
for clip,collection in frames.items():
    strip=Image.new('RGBA',(64*len(collection),96))
    for index,image in enumerate(collection): strip.alpha_composite(image,(64*index,0))
    path=clip+'.png'
    strip.save(output/path)
    definitions[clip]={'path':path,'frames':len(collection),'fps':expected[clip][1],
                       'loop':clip in ('idle','walk','run','levitate'),'uniqueFrames':len(collection)}
preview=Image.new('RGBA',(13*64,9*116),(10,21,35,255))
draw=ImageDraw.Draw(preview)
for row,(clip,collection) in enumerate(frames.items()):
    draw.text((8,row*116+4),clip,fill=(170,210,226,255))
    for index,image in enumerate(collection): preview.alpha_composite(image,((index+1)*64,row*116+20))
preview.save(output/'pose-review.png')
shutil.copyfile(source/'receipt.json',output/'native-bake-receipt.json')
shutil.copyfile(source/'quantum-diver-source.tscn',output/'quantum-diver-source.tscn')
manifest={'version':1,'genre':'quantum-divergence','actor':'diver','candidateOnly':True,
          'productionApproved':False,'animationReady':False,'completeCast':False,
          'frame':[64,96],'logicalSize':[32,48],'pivot':[32,96],
          'source':str(source),'clips':definitions,'totalUniqueFrames':sum(len(value) for value in frames.values()),
          'scope':'Original rig animation candidate. Native playback, complete matching cast, weapon aiming and final visual admission remain separate gates.',
          'hashes':{path.name:digest(path) for path in output.iterdir() if path.is_file()}}
(output/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps({'candidate':str(output),'clips':len(definitions),'uniqueFrames':manifest['totalUniqueFrames'],
                  'productionApproved':False,'animationReady':False}))
