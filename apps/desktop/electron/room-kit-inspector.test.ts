import {describe,it,expect} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readActiveRoomKits} from './room-kit-inspector.js';
describe('room architecture inspector admission',()=>{
 it('shows complete native kits and falls back for missing, unsafe, or unrelated data',()=>{
  const root=mkdtempSync(join(tmpdir(),'room-kit-inspector-'));
  const write=(path:string,value:string)=>{const target=join(root,path);mkdirSync(join(target,'..'),{recursive:true});writeFileSync(target,value);};
  const manifest='assets/architecture/stormglass/kits/gallery/manifest.json';
  const config={version:1,rooms:{room_002:{wallRole:'marble_wall',props:[{role:'bookcase'},{role:'bookcase'},{role:'../outside'}],manifests:[manifest]}}};
  try{
   write('project.godot','[application]\nconfig/name="Stormglass Reliquary Test"');
   write('scenes/rooms/room_002.tscn','[gd_scene format=3]');
   write(manifest,JSON.stringify({entries:[],atlas:'assets/architecture/stormglass/kits/gallery/atlas.png'}));
   write('assets/architecture/stormglass/kits/gallery/atlas.png','presence fixture');
   write('data/visual/stormglass-room-kits.json',JSON.stringify(config));
   expect(readActiveRoomKits(root,['room_002','room_999'])).toEqual({room_002:{wallRole:'marble_wall',propRoles:['bookcase']}});
   write(manifest,JSON.stringify({entries:[],atlas:'../outside.png'}));
   expect(readActiveRoomKits(root,['room_002'])).toEqual({});
   write('project.godot','[application]\nconfig/name="Platformer Test"');
   expect(readActiveRoomKits(root,['room_002'])).toEqual({});
   write('data/visual/stormglass-room-kits.json','invalid json');
   expect(readActiveRoomKits(root,['room_002'])).toEqual({});
  }finally{rmSync(root,{recursive:true,force:true});}
 });
});
