import {describe,it,expect} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {validStormglassKitManifest} from './stormglass-room-kits.js';
const root=join(process.cwd(),'templates/godot-metroidvania/assets/architecture/stormglass/kits');
describe('Stormglass module sampling admission',()=>{
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
