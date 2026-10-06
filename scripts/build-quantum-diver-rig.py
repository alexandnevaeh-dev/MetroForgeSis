"""Original articulated miner source and orthographic sprite baking in Blender.

Run with Blender --background --factory-startup --python this-file -- --output E:/...
No external geometry/textures, diffusion image edits or fabricated animation frames.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
import bpy
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument('--output',required=True)
parser.add_argument('--clips',nargs='+',default=['seed'])
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:])
output = Path(args.output).resolve()
if output.drive.lower()!='e:' or output.exists():
    raise SystemExit('Use a fresh E: destination; preserve all prior sources.')
clips = {'seed':(1,1),'idle':(6,10),'walk':(8,16),'run':(10,24),'attack':(6,24),
         'hit':(3,18),'death':(12,18),'jump':(4,16),'levitate':(6,16),'dash':(6,24)}
if any(name not in clips for name in args.clips) or len(set(args.clips))!=len(args.clips):
    raise SystemExit('Select known unique clips.')
output.mkdir(parents=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine='BLENDER_EEVEE_NEXT'
scene.render.film_transparent=True
scene.render.image_settings.file_format='PNG'
scene.render.image_settings.color_mode='RGBA'
scene.render.image_settings.color_depth='8'
scene.render.resolution_percentage=100
scene.render.resolution_x=64
scene.render.resolution_y=96
scene.render.fps=24
scene.render.filepath=str(output / 'seed.png')
scene.world.color=(0.15,0.18,0.24)
scene.view_settings.view_transform='Standard'
scene.view_settings.look='None'
scene.view_settings.exposure=0
scene.view_settings.gamma=1

def material(name,color,metallic=0,roughness=0.4,emission=0):
    result=bpy.data.materials.new(name)
    result.use_nodes=True
    shader=result.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value=(*color,1)
    shader.inputs['Metallic'].default_value=metallic
    shader.inputs['Roughness'].default_value=roughness
    shader.inputs['Emission Color'].default_value=(*color,1)
    shader.inputs['Emission Strength'].default_value=emission
    return result

silver=material('Pale silver ceramic armor',(0.56,0.66,0.75),0.65,0.28)
edge=material('Brushed edge metal',(0.23,0.33,0.43),0.8,0.30)
dark=material('Graphite blue joint housings',(0.025,0.047,0.085),0.3,0.43)
cyan=material('Opaque cyan sensor glass',(0.018,0.59,0.68),0.5,0.18,0.7)
violet=material('Violet energy conduits',(0.26,0.09,0.49),0.4,0.3,0.2)
light=material('Cool indicator lamps',(0.15,0.90,0.91),0.1,0.3,1.3)

def finish(obj,name,mat):
    obj.name=name
    obj.data.materials.append(mat)
    return obj

def block(name,location,size,mat,bevel=0.04):
    bpy.ops.mesh.primitive_cube_add(size=1,location=location)
    obj=finish(bpy.context.object,name,mat)
    obj.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        modifier=obj.modifiers.new('Machined armor edge','BEVEL')
        modifier.width=bevel
        modifier.segments=2
        obj.modifiers.new('Weighted panel normals','WEIGHTED_NORMAL')
    return obj

def sphere(name,location,size,mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=1,location=location)
    obj=finish(bpy.context.object,name,mat)
    obj.scale=size
    for polygon in obj.data.polygons: polygon.use_smooth=True
    return obj

def rod(name,start,end,radius,mat,vertices=12):
    a,b=Vector(start),Vector(end)
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=(b-a).length,location=(a+b)*0.5)
    obj=finish(bpy.context.object,name,mat)
    obj.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
    return obj

def move_rod(obj,start,end):
    a,b=Vector(start),Vector(end)
    obj.location=(a+b)*0.5
    obj.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
    obj.scale.z=(b-a).length/obj.data.get('rest_length',1)

def group(name,origin):
    obj=bpy.data.objects.new(name,None)
    scene.collection.objects.link(obj)
    obj.location=origin
    return obj

def adopt(obj,parent):
    matrix=obj.matrix_world.copy()
    obj.parent=parent
    obj.matrix_world=matrix

# Rigid mechanical parts stay attached to the same articulated source throughout.
torso=group('Torso pose control',(0,0,1.32))
torso_parts=[
    block('Tapered torso understructure',(0,0,1.92),(0.48,0.45,0.86),dark),
    block('Chest armor main plate',(0.075,0,2.08),(0.47,0.49,0.49),silver,0.09),
    block('Lower rib armor',(-0.005,0,1.73),(0.45,0.43,0.20),edge),
    block('Front reactor housing',(0.34,-0.02,2.08),(0.14,0.40,0.31),dark),
    block('Cyan reactor window',(0.425,-0.02,2.08),(0.035,0.31,0.19),cyan,0.012),
    block('Backpack chassis',(-0.40,0,2.00),(0.26,0.46,0.70),dark),
    block('Violet backpack reservoir',(-0.545,-0.015,2.04),(0.055,0.31,0.52),violet,0.015),
    rod('Neck bearing',(0,0,2.32),(0,0,2.56),0.105,edge),
    sphere('Helmet silver pressure shell',(0.03,0,2.82),(0.255,0.23,0.295),silver),
    sphere('Dark visor gasket',(0.19,-0.016,2.84),(0.22,0.227,0.238),dark),
    sphere('Opaque cyan visor',(0.235,-0.018,2.85),(0.188,0.218,0.191),cyan),
    block('Helmet brow plate',(0.20,-0.014,3.02),(0.32,0.43,0.07),silver,0.025),
    block('Helmet jaw guard',(0.19,-0.014,2.61),(0.28,0.40,0.08),edge,0.025),
    sphere('Near helmet receiver',(-0.018,-0.255,2.82),(0.083,0.037,0.102),edge),
    block('Receiver cyan indicator',(-0.019,-0.296,2.82),(0.054,0.008,0.025),light,0.004),
]
for z in (1.86,2.04,2.22):
    torso_parts.append(block('Backpack cooling rib',(-0.57,-0.025,z),(0.05,0.34,0.026),silver,0.006))
for z in (1.82,1.91,2.0):
    torso_parts.append(block('Side armor vent',(0.065,-0.255,z),(0.16,0.01,0.019),dark,0.003))
for x in (-0.09,0.14):
    for z in (2.06,2.23):
        torso_parts.append(sphere('Panel fastener',(x,-0.255,z),(0.017,0.01,0.017),edge))
for obj in torso_parts: adopt(obj,torso)

pelvis=block('Hip armor',(0,0,1.33),(0.43,0.43,0.26),edge,0.06)
limbs=[]
for side,y in [('far',0.17),('near',-0.17)]:
    hip=(0,y,1.32);knee=(0.14,y,0.73);ankle=(0.025,y,0.15)
    upper=rod(side+' thigh',hip,knee,0.10,dark)
    lower=rod(side+' shin',knee,ankle,0.095,dark)
    upper.data['rest_length']=(Vector(knee)-Vector(hip)).length
    lower.data['rest_length']=(Vector(ankle)-Vector(knee)).length
    knee_joint=sphere(side+' knee bearing',knee,(0.105,0.11,0.105),edge)
    thigh_plate=block(side+' thigh plate',(0.13,y-0.018,1.01),(0.23,0.22,0.36),silver,0.055)
    shin_plate=block(side+' shin plate',(0.10,y-0.018,0.43),(0.23,0.24,0.36),silver,0.055)
    boot=block(side+' grounded boot',(0.13,y,0.12),(0.42,0.26,0.24),dark,0.035)
    toe=block(side+' toe armor',(0.26,y-0.01,0.15),(0.18,0.255,0.15),silver,0.025)
    ankle_lamp=block(side+' ankle lamp',(0.14,y-0.145,0.21),(0.09,0.01,0.027),light,0.004)
    shoulder=(0.035,y*1.5,2.27);elbow=(0.10,y*1.5,1.97);wrist=(0.46,y*1.5,1.85)
    arm_upper=rod(side+' upper arm',shoulder,elbow,0.085,dark)
    arm_lower=rod(side+' forearm',elbow,wrist,0.08,edge)
    arm_upper.data['rest_length']=(Vector(elbow)-Vector(shoulder)).length
    arm_lower.data['rest_length']=(Vector(wrist)-Vector(elbow)).length
    shoulder_plate=sphere(side+' shoulder shell',shoulder,(0.16,0.145,0.16),silver)
    elbow_joint=sphere(side+' elbow bearing',elbow,(0.085,0.09,0.085),violet)
    hand=block(side+' glove',wrist,(0.18,0.15,0.14),dark,0.035)
    limbs.append(dict(y=y,upper=upper,lower=lower,knee=knee_joint,thigh=thigh_plate,shin=shin_plate,
      boot=boot,toe=toe,lamp=ankle_lamp,arm_upper=arm_upper,arm_lower=arm_lower,shoulder=shoulder_plate,elbow=elbow_joint,hand=hand))
scanner=group('Held mining scanner',(0.50,-0.26,1.87))
for obj in [block('Scanner housing',(0.54,-0.26,1.91),(0.35,0.18,0.16),edge,0.025),
            block('Scanner barrel',(0.77,-0.26,1.93),(0.15,0.10,0.08),silver,0.012),
            block('Scanner cyan emitter',(0.855,-0.26,1.93),(0.014,0.072,0.045),light,0.003),
            block('Scanner grip',(0.49,-0.26,1.81),(0.10,0.13,0.17),dark,0.015)]: adopt(obj,scanner)

def knee_between(hip,ankle):
    delta=Vector((ankle[0]-hip[0],ankle[2]-hip[2]))
    distance=max(0.001,min(delta.length,1.239))
    direction=delta.normalized()
    projection=distance/2
    height=math.sqrt(max(0,0.62**2-projection**2))
    at=Vector((hip[0],hip[2]))+direction*projection+Vector((-direction.y,direction.x))*height
    return (at.x,hip[1],at.y)

def pose(clip,t):
    stride=clip in ('walk','run','dash')
    fast=clip in ('run','dash')
    dead=t if clip=='death' else 0
    hip_z=1.30+(0.022*math.cos(4*math.pi*t) if stride else 0.006*math.sin(2*math.pi*t))
    hip_z=hip_z*(1-dead)+0.28*dead
    hip_x=-0.50*dead
    lean=(0.10 if fast else 0)+1.12*dead
    if clip=='hit': lean=-0.16*math.sin(math.pi*t)
    torso.location=(hip_x,0,hip_z)
    torso.rotation_euler.y=lean
    pelvis.location=(hip_x,0,hip_z)
    pelvis.rotation_euler.y=lean*0.3
    attack=max(0,math.sin(math.pi*t)) if clip=='attack' else 0
    for index,part in enumerate(limbs):
        y=part['y']
        phase=(t+index*0.5)%1
        foot_x=0.025
        lift=0
        if stride:
            reach=0.34 if fast else 0.24
            if phase<0.56: foot_x=reach*(0.5-phase/0.56)
            else:
                swing=(phase-0.56)/0.44
                foot_x=reach*(-0.5+swing)
                lift=(0.20 if fast else 0.13)*math.sin(math.pi*swing)
        if clip in ('jump','levitate'):
            foot_x=(-0.16 if index==0 else 0.18)
            lift=0.08+0.06*math.sin(math.pi*t)
        if dead: foot_x=(-0.43 if index==0 else -0.66)*dead
        hip=(hip_x,y,hip_z)
        ankle=(foot_x,y,0.15+lift)
        knee=knee_between(hip,ankle)
        move_rod(part['upper'],hip,knee);move_rod(part['lower'],knee,ankle)
        part['knee'].location=knee
        for key,a,b in [('thigh',hip,knee),('shin',knee,ankle)]:
            part[key].location=(Vector(a)+Vector(b))*0.5+Vector((0.035,-0.012,0))
            part[key].rotation_euler=(Vector(b)-Vector(a)).to_track_quat('Z','Y').to_euler()
        part['boot'].location=(foot_x+0.10,y,0.12+lift)
        part['toe'].location=(foot_x+0.23,y-0.01,0.15+lift)
        part['lamp'].location=(foot_x+0.12,y-0.145,0.21+lift)
        shoulder=torso.matrix_world @ Vector((0.035,y*1.5,0.97))
        elbow=(shoulder.x+0.08+0.09*attack,shoulder.y,shoulder.z-0.30+0.03*attack)
        wrist=(shoulder.x+0.42+0.17*attack,shoulder.y,shoulder.z-0.42+0.36*attack)
        if clip=='hit': wrist=(wrist[0]-0.12*math.sin(math.pi*t),wrist[1],wrist[2])
        if dead: wrist=(hip_x+0.52,y*1.5,0.34)
        move_rod(part['arm_upper'],shoulder,elbow);move_rod(part['arm_lower'],elbow,wrist)
        part['shoulder'].location=shoulder;part['elbow'].location=elbow;part['hand'].location=wrist
        if index==1: scanner.location=Vector(wrist)+Vector((0.04,0,0.02))
    bpy.context.view_layer.update()

camera_data=bpy.data.cameras.new('Fixed orthographic side camera')
camera=bpy.data.objects.new('Fixed orthographic side camera',camera_data)
scene.collection.objects.link(camera)
camera.location=(0,-8,1.75)
camera.rotation_euler=(Vector((0,0,1.75))-camera.location).to_track_quat('-Z','Y').to_euler()
camera_data.type='ORTHO'
camera_data.ortho_scale=3.5
scene.camera=camera
for name,position,energy,size,color in [
    ('Large cool key',(1.5,-3.5,5),550,4,(0.79,0.89,1)),
    ('Soft silver fill',(-2.5,-2,3),300,3,(0.58,0.71,0.85)),
    ('Violet edge light',(-1,2.5,4),450,2,(0.52,0.34,0.80))]:
    data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.shape='DISK';data.size=size;data.color=color
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=position
    obj.rotation_euler=(Vector((0,0,1.6))-obj.location).to_track_quat('-Z','Y').to_euler()

pose('seed',0)
bpy.ops.wm.save_as_mainfile(filepath=str(output / 'quantum-diver-source.blend'))
receipt={'source':'Original authored articulated meshes; no external model or texture',
         'sourceScriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
         'blender':bpy.app.version_string,'engine':scene.render.engine,'frame':[64,96],
         'logicalSize':[32,48],'pivot':[32,96],'transparent':True,'productionApproved':False,
         'camera':{'projection':'orthographic','scale':3.5,'location':list(camera.location)},'clips':{}}
for clip in args.clips:
    count,fps=clips[clip]
    directory=output / clip;directory.mkdir()
    frames=[]
    for index in range(count):
        t=index/max(1,count-1) if clip in ('death','attack','hit','jump') else index/count
        pose(clip,t)
        destination=directory / ('frame-'+str(index+1).zfill(2)+'.png')
        scene.render.filepath=str(destination)
        bpy.ops.render.render(write_still=True)
        frames.append({'path':str(destination.relative_to(output)).replace('\\','/'),
                       'sha256':hashlib.sha256(destination.read_bytes()).hexdigest()})
    receipt['clips'][clip]={'frames':frames,'fps':fps,'count':count}
    (output / 'receipt.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
if args.clips==['seed']:
    scene.render.resolution_x=512;scene.render.resolution_y=768
    scene.render.filepath=str(output / 'design-detail.png')
    bpy.ops.render.render(write_still=True)
try:
    import gpu
    receipt['renderHardware']={'vendor':gpu.platform.vendor_get(),'renderer':gpu.platform.renderer_get(),'version':gpu.platform.version_get()}
except Exception as error:
    receipt['renderHardware']={'verified':False,'reason':str(error)}
(output / 'receipt.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
print('QUANTUM_DIVER_BAKE '+json.dumps({'output':str(output),'clips':list(receipt['clips']),
      'frames':sum(item['count'] for item in receipt['clips'].values()),'productionApproved':False}),flush=True)
