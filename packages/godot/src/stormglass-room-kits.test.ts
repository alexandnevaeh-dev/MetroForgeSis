import {describe,it,expect} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {validStormglassKitManifest,validStormglassArchiveBays} from './stormglass-room-kits.js';
const root=join(process.cwd(),'templates/godot-metroidvania/assets/architecture/stormglass/kits');
describe('Stormglass module sampling admission',()=>{
 it('rejects malformed archive assemblies and keeps their full footprint clear of real doorway thresholds',()=>{
  const bays=[{id:'ReadingRecess',kind:'book-recess',x:1152,width:512,height:288},
   {id:'ScribeDesk',kind:'scribe-desk',x:1792,width:192,height:40}];
  expect(validStormglassArchiveBays(bays,5120)).toBe(true);
  for(const patch of [{x:200},{x:5000},{width:Infinity},{height:20},{height:500},{kind:'full-scene-painting'},{id:'../unsafe'}]){
   const changed=structuredClone(bays);Object.assign(changed[0],patch);
   expect(validStormglassArchiveBays(changed,5120),JSON.stringify(patch)).toBe(false);
  }
  expect(validStormglassArchiveBays([bays[0],bays[0]],5120)).toBe(false);
  expect(validStormglassArchiveBays(bays,NaN)).toBe(false);
 });
 it('validates every shipped original kit against its PNG dimensions and hash',()=>{
  for(const folder of readdirSync(root)){
   const manifest=JSON.parse(readFileSync(join(root,folder,'manifest.json'),'utf8'));
   expect(validStormglassKitManifest(manifest,readFileSync(join(root,folder,'atlas.png'))),folder).toBe(true);
  }
 });
 it('rejects invalid bounds, overlapping samples, duplicate roles, and unsafe anchors',()=>{
  const manifest=JSON.parse(readFileSync(join(root,'gallery-common-v1/manifest.json'),'utf8'));
  const png=readFileSync(join(root,'gallery-common-v1/atlas.png'));
  const changes=[
   (m:typeof manifest)=>{m.size[0]+=1;},
   (m:typeof manifest)=>{m.entries[0].region[2]=99999;},
   (m:typeof manifest)=>{m.entries[0].opaqueBounds[3]=0;},
   (m:typeof manifest)=>{m.entries[0].opaqueBounds[2]=99999;},
   (m:typeof manifest)=>{m.entries[1].region=[...m.entries[0].region];},
   (m:typeof manifest)=>{m.entries[1].role=m.entries[0].role;},
   (m:typeof manifest)=>{m.entries[0].anchor='transparent-cell-center';},
   (m:typeof manifest)=>{m.entries[0].filterClip=false;},
  ];
  for(const change of changes){const altered=structuredClone(manifest);change(altered);expect(validStormglassKitManifest(altered,png)).toBe(false);}
  expect(validStormglassKitManifest(manifest,Buffer.from('invalid image'))).toBe(false);
 });
});
