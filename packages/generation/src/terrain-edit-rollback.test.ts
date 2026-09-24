import {it,expect,vi} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
const fault=vi.hoisted(()=>({enabled:false}));
vi.mock('node:fs',async original=>{
 const fs=await original<typeof import('node:fs')>();
 return {...fs,renameSync:(from: import('node:fs').PathLike,to: import('node:fs').PathLike)=>{
  if(fault.enabled && String(to).includes('StreamingAssets'))throw new Error('simulated mirror failure');
  return fs.renameSync(from,to);
 }};
});
import {readEditableTerrain,saveEditableTerrain} from './terrain-edit-service.js';
it.each([false,true])('rolls back root when mirror replacement fails; existing=%s',existing=>{
 const root=mkdtempSync(join(tmpdir(),'terrain-rollback-'));const asset='assets/tilesets/biome_0/floor.png';const rel=asset.replace('.png','.presentation.json');
 const png=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(png);png.writeUInt32BE(64,16);png.writeUInt32BE(64,20);
 for(const base of [root,join(root,'Assets/StreamingAssets')]){const p=join(base,asset);mkdirSync(dirname(p),{recursive:true});writeFileSync(p,png);if(existing)writeFileSync(join(base,rel),'{"width":64,"height":64}');}
 const before=readEditableTerrain(root,asset);
 fault.enabled=true;
 try{expect(()=>saveEditableTerrain(root,asset,{...before.settings,tintR:.5},before.revision)).toThrow('simulated mirror failure');}finally{fault.enabled=false;}
 expect(readEditableTerrain(root,asset).revision).toBe(before.revision);
 for(const base of [root,join(root,'Assets/StreamingAssets')]){
  expect(existsSync(join(base,rel))).toBe(existing);
  if(existing)expect(readFileSync(join(base,rel),'utf8')).toBe('{"width":64,"height":64}');
 }
});
