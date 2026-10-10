import { describe,it,expect } from 'vitest';
import { resolve } from 'node:path';
import { listManualStyleAdapters,resolveManualStyleAdapter } from './manual-style-catalog.js';

describe('curated local style catalog',()=>{
  it('rejects unknown identities and invalid strength before file access',()=>{
    expect(()=>resolveManualStyleAdapter('../../private',1)).toThrow('Unknown');
    expect(()=>resolveManualStyleAdapter('pixel-art-xl',0)).toThrow('scale');
    expect(()=>resolveManualStyleAdapter('pixel-art-xl',NaN)).toThrow('scale');
  });
  it('lists unavailable cache without downloading or exposing filesystem paths',()=>{
    const options=listManualStyleAdapters(resolve('E:/MetroForgeData/Development/stormglass-style-bridge-20261009/missing-cache'));
    expect(options).toMatchObject([{id:'pixel-art-xl',available:false}]);expect(JSON.stringify(options)).not.toContain('E:');
  });
  it('refuses a missing adapter instead of substituting ordinary generation',()=>{
    expect(()=>resolveManualStyleAdapter('pixel-art-xl',1,resolve('E:/MetroForgeData/Development/stormglass-style-bridge-20261009/missing-cache'))).toThrow('not available');
  });
});
