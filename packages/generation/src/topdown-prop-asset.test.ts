import {it,expect} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {readTopDownPropAsset} from './topdown-prop-asset.js';
it('admits explicitly authored prop metadata with matching base and layer dimensions',()=>{
 const root=mkdtempSync(join(tmpdir(),'prop-asset-'));mkdirSync(join(root,'assets/props'),{recursive:true});
 const png=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(png);png.write('IHDR',12);png.writeUInt32BE(32,16);png.writeUInt32BE(32,20);
 writeFileSync(join(root,'assets/props/gate.png'),png);
 expect(readTopDownPropAsset(root,'assets/props/gate.png')).toBeNull();
 const layout={version:1,sourceSize:[32,32],anchorPx:[16,24],displayScale:1,collisionRectsPx:[],layers:[{id:'front',image:'front.png',sortY:12}]};
 writeFileSync(join(root,'assets/props/gate.prop.json'),JSON.stringify(layout));
 expect(()=>readTopDownPropAsset(root,'assets/props/gate.png')).toThrow();
 writeFileSync(join(root,'assets/props/front.png'),png);
 expect(readTopDownPropAsset(root,'assets/props/gate.png')).toEqual({image:'res://assets/props/gate.png',layout});
 const wrong=Buffer.from(png);wrong.writeUInt32BE(64,16);writeFileSync(join(root,'assets/props/front.png'),wrong);
 expect(()=>readTopDownPropAsset(root,'assets/props/gate.png')).toThrow('dimensions');
 expect(()=>readTopDownPropAsset(root,'assets/../outside.png')).toThrow('path');
});
