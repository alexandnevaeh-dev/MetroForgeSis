import {mkdirSync,readFileSync,writeFileSync,copyFileSync,existsSync} from 'node:fs';
import {dirname,join} from 'node:path';
const report='reports/game-tests/20261001-canopy-actor-integration';
// One-time migration receipt: rerunning must not replace the original backups.
if(existsSync('packages/assets/src/topdown-canopy-art.ts'))throw Error('Canopy art is already shared; original backups are retained');
mkdirSync(join(report,'before'),{recursive:true});
for(const file of ['scripts/lib/ruined-canopy-art.mjs','packages/assets/src/asset-pipeline.ts','packages/assets/src/index.ts','packages/generation/src/pipeline.ts','templates/godot-topdown-adventure/scenes/world/NPC.tscn'])copyFileSync(file,join(report,'before',file.replaceAll('/','__')));
const old=readFileSync('scripts/lib/ruined-canopy-art.mjs','utf8');
const start=old.indexOf('// New source art'),actorEnd=old.indexOf('export function canopyProp');
const effectStart=old.indexOf('export function canopyEffect'),effectEnd=old.indexOf('export function canopyPickup');
let shared=old.slice(start,actorEnd)+old.slice(effectStart,effectEnd);
const replacements=[
 ['function canvas(width, height)', 'function canvas(width: number, height: number)'],
 ['(x,y,color) =>','(x: number,y: number,color: string) =>'],
 ['(x,y,w,h,c) =>','(x: number,y: number,w: number,h: number,c: string) =>'],
 ['(x,y,rx,ry,c) =>','(x: number,y: number,rx: number,ry: number,c: string) =>'],
 ['(ax,ay,bx,by,c,thick=2) =>','(ax: number,ay: number,bx: number,by: number,c: string,thick=2) =>'],
 ['clip:(start,end)=>','clip:(start: number,end: number)=>'],
 ["canopyActor(kind, action='idle', facing='S', count=8)","canopyActor(kind: CanopyActorKind, action: CanopyAction='idle', facing: CanopyFacing='S', count=8)"],
 ['const angles={','const angles: Record<CanopyFacing,number>={'],
 ['canopyEffect(id,count=1)','canopyEffect(id: string,count=1)'],
 ['const ink=c=>','const ink=(c: string)=>'],
 ['const ring=(rx,ry,color,start=0,end=Math.PI*2)=>','const ring=(rx: number,ry: number,color: string,start=0,end=Math.PI*2)=>'],
 ];
for(const [from,to] of replacements){if(!shared.includes(from))throw Error('Missing expected source: '+from);shared=shared.replace(from,to);}
const types=`import {encodePng,extractSheetFramePng} from './png.js';\n\nexport type CanopyActorKind='hero'|'melee'|'ranged'|'npc'|'boss';\nexport type CanopyAction='idle'|'walk'|'run'|'attack'|'hurt'|'death';\nexport type CanopyFacing='N'|'NE'|'E'|'SE'|'S'|'SW'|'W'|'NW';\nexport const CANOPY_ACTION_FRAMES: Record<CanopyAction,number>={idle:12,walk:12,run:16,attack:12,hurt:6,death:12};\nexport const CANOPY_EFFECT_IDS=['hit_spark','death_puff','dash_trail','pickup_spark','ability_unlock','boss_phase_shift','area_burst','slam_shock','attack_warning'] as const;\n\n`;
const family=`\nexport function buildCanopyActorFamily(kind: CanopyActorKind,directional=false) {\n  const size=kind==='boss'?128:64;\n  const sheets=new Map<string,Buffer>();\n  const facings: CanopyFacing[]=['N','NE','E','SE','S','SW','W','NW'];\n  for(const [action,count] of Object.entries(CANOPY_ACTION_FRAMES) as [CanopyAction,number][]) {\n    sheets.set(action,canopyActor(kind,action,'S',count));\n    if(directional)for(const facing of facings)sheets.set(action+'_'+facing,canopyActor(kind,action,facing,count));\n  }\n  const metadata=Object.fromEntries(Object.entries(CANOPY_ACTION_FRAMES).map(([action,frameCount])=>[action,{frameCount,fps:action==='run'?24:action==='attack'?(kind==='hero'?30:21):action==='idle'?10:action==='death'&&kind==='hero'?15:16,loop:['idle','walk','run'].includes(action),...(action==='attack'&&kind==='hero'?{attackTiming:{activeStart:3.6,activeEnd:7.2,recoveryEnd:12}}:{})}]));\n  return {size,still:extractSheetFramePng(sheets.get('idle')!,size,size,CANOPY_ACTION_FRAMES.idle,0),sheets,metadata};\n}\n\nexport function canopyEffectMetadata() {\n return Object.fromEntries(CANOPY_EFFECT_IDS.map(id=>[id,{frameCount:10,frameWidth:32,frameHeight:32,fps:24,loop:false}]));\n}\n`;
writeFileSync('packages/assets/src/topdown-canopy-art.ts',types+shared+family);
let shim=old.slice(0,start)+"export {canopyActor,canopyEffect} from '../../packages/assets/dist/topdown-canopy-art.js';\n\n"+old.slice(start,old.indexOf('export function canopyActor'))+old.slice(actorEnd,effectStart)+old.slice(effectEnd);
writeFileSync('scripts/lib/ruined-canopy-art.mjs',shim);
console.log('Shared original actor/effect source extracted; source backups retained on E:');
