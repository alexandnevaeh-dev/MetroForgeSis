import {expect,it} from 'vitest';
import {registeredAssetId} from './asset-identity.js';
it('uses the registered full path when filenames collide',()=>{
 const assets=[{path:'assets/a/icon.png',id:'first'},{path:'assets/b/icon.png',id:'second'}];
 expect(registeredAssetId('assets/b/icon.png',assets)).toBe('second');
 expect(registeredAssetId('assets\\b\\icon.png',assets)).toBe('second');
 expect(registeredAssetId('assets/c/icon.png',assets)).toBeUndefined();
});
