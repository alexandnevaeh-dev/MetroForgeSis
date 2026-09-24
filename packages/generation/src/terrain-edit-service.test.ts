import {it,expect} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {readEditableTerrain,saveEditableTerrain} from './terrain-edit-service.js';
it('creates synchronized terrain settings and refuses stale or divergent edits',()=>{
 const root=mkdtempSync(join(tmpdir(),'terrain-edit-')); const asset='assets/tilesets/biome_0/floor.png';
 const png=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(png);png.writeUInt32BE(64,16);png.writeUInt32BE(64,20);
 for(const base of [root,join(root,'Assets/StreamingAssets')]){const p=join(base,asset);mkdirSync(dirname(p),{recursive:true});writeFileSync(p,png);}
 const before=readEditableTerrain(root,asset);
 const saved=saveEditableTerrain(root,asset,{...before.settings,tintR:.5},before.revision);
 expect(saved.runtimeSynchronized).toBe(true);expect(saved.restartRequired).toBe(true);expect(existsSync(saved.backup)).toBe(true);
 const rel=asset.replace('.png','.presentation.json');
 expect(readFileSync(join(root,rel),'utf8')).toBe(readFileSync(join(root,'Assets/StreamingAssets',rel),'utf8'));
 expect(()=>saveEditableTerrain(root,asset,before.settings,before.revision)).toThrow('changed');
 expect(()=>saveEditableTerrain(root,asset,{...saved.settings,tintG:2},saved.revision)).toThrow('tint');
 expect(readEditableTerrain(root,asset).revision).toBe(saved.revision);
 writeFileSync(join(root,'Assets/StreamingAssets',rel),'{}');
 expect(()=>readEditableTerrain(root,asset)).toThrow('differ');
 expect(()=>readEditableTerrain(root,'../floor.png')).toThrow('canonical');
});
