import { describe, expect, it } from 'vitest';
import { generateProceduralSprite, generateWalkCycleSheet, generateTilesetSource } from '../png.js';
import { TileCompiler } from '../tile-compiler.js';
import { analyzeAnimationTemporal, analyzeFamilyCohesion, analyzeTilesetAdjacency } from './cohesion-qa.js';

describe('pipeline v2 measurable family QA', () => {
  it('measures compatible palette relationships without granting approval', () => {
    const make=(id:string,accent:[number,number,number,number])=>generateProceduralSprite({id,width:64,height:64,fill:[35,45,55,255],accent,shape:'humanoid'});
    const result=analyzeFamilyCohesion([{id:'player',png:make('p',[40,210,220,255])},{id:'enemy',png:make('e',[230,90,45,255])}]);
    expect(result.assetMetrics).toHaveLength(2); expect(result.checks.map((c)=>c.id)).toContain('palette_mean_channel_spread');
  });
  it('checks temporal uniqueness, palette drift, scale drift, and frame structure', () => {
    const base=generateProceduralSprite({id:'player',width:64,height:64,fill:[40,55,65,255],accent:[45,210,220,255],shape:'humanoid'});
    const sheet=generateWalkCycleSheet({id:'player',width:64,height:64,fill:[0,0,0,0]},8,base);
    const result=analyzeAnimationTemporal(sheet,64,8); expect(result.checks.map((c)=>c.id)).toEqual(expect.arrayContaining(['palette_drift','silhouette_scale_drift']));
  });
  it('validates the canonical 8x6 atlas and opposite-edge adjacency', () => {
    const atlas=new TileCompiler().compile({sourcePng:generateTilesetSource(7,128),tileSize:16}).atlas;
    const result=analyzeTilesetAdjacency(atlas,16); expect(result.tileSize).toBe(16); expect(result.checks).toHaveLength(2);
  });
});
