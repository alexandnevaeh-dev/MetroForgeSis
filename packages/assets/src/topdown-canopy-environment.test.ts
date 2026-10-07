import { describe,it,expect,vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync,mkdtempSync,readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GameDNASchema } from '@metroforge/schemas';
import { AssetPipeline } from './asset-pipeline.js';
import { decodePngRgba } from './png.js';
import { canopyEnvironment,canopyTerrainV2,canopyTerrainV3,canopyTerrainV4 } from './topdown-canopy-environment.js';
import { shouldUseCanopyEnvironment } from './canopy-environment-selection.js';
import {ImageProviderRegistry} from './image-router.js';
import {canopyIcon,canopyPickup} from './topdown-canopy-art.js';

const dna=GameDNASchema.parse(JSON.parse(readFileSync(new URL('./fixtures/canopy-game-dna.json',import.meta.url),'utf8')));

describe('shared canopy environment',()=>{
  it('preserves the recoverable legacy v2 atlas bytes',()=>{
    const hash=createHash('sha256').update(canopyTerrainV2().bytes).digest('hex');
    expect(hash).toBe('fec49cab6c7dc0fa5693b6009d2ec13cc99ad8b01db770fbe4da0a48fc98cd11');
  });
  it('preserves the recoverable v3 atlas bytes',()=>{
    expect(createHash('sha256').update(canopyTerrainV3().bytes).digest('hex')).toBe('07c3cafc05a0aa05391c7891e8d49db0bf4f55523d057dae84b6e25984b1dc55');
  });
  it('exports material variants and shore masks within the actual atlas',()=>{
    const terrain=canopyTerrainV4(),image=decodePngRgba(terrain.bytes);
    expect(new Set(terrain.roles.map(role=>role.role)).size).toBe(terrain.roles.length);
    for(const role of terrain.roles){
      expect(role.col*32+32).toBeLessThanOrEqual(image.width);
      expect(role.row*32+32).toBeLessThanOrEqual(image.height);
      expect(image.rgba[((role.row*32+16)*image.width+role.col*32+16)*4+3]).toBe(255);
    }
    for(let mask=0;mask<16;mask++){
      expect(terrain.roles.some(role=>role.role===`water_edge_${mask}`)).toBe(true);
      expect(terrain.roles.some(role=>role.role===`wall_edge_${mask}`)).toBe(true);
      for(let variant=0;variant<4;variant++)expect(terrain.roles.some(role=>role.role===`wall_edge_${mask}_variant_${variant}`)).toBe(true);
    }
    expect(image.height).toBe(544);
  });
  it('keeps ground anchors inside all large landmark images',()=>{
    for(const kind of ['root_arch','vine_gate','seed_shrine','crown','bridge']){
      const art=canopyEnvironment(kind),image=decodePngRgba(art.bytes);
      expect(image.width).toBe(art.width);expect(image.height).toBe(art.height);
      expect(art.anchor[1]).toBeLessThan(image.height);
      expect(art.anchor[0]).toBe(image.width/2);
    }
  });
  it('selects compatible woodland requests and excludes other genres, themes and tile sizes',()=>{
    expect(shouldUseCanopyEnvironment(dna)).toBe(true);
    expect(shouldUseCanopyEnvironment({...dna,archetype:'SIDE_VIEW_METROIDVANIA'})).toBe(false);
    expect(shouldUseCanopyEnvironment({...dna,technical:{...dna.technical,tileSize:16}})).toBe(false);
    expect(shouldUseCanopyEnvironment({...dna,identity:{...dna.identity,visualStyle:'realistic 3D'}})).toBe(false);
    expect(shouldUseCanopyEnvironment({...dna,identity:{...dna.identity,title:'Neon City',tagline:''},narrative:{...dna.narrative,premise:'Explore a space station'}})).toBe(false);
  });
  it('uses shared terrain in the real offline asset pipeline and keeps all tile slices as drafts',async()=>{
    const parent='E:/MetroForgeData/TestArtifacts';mkdirSync(parent,{recursive:true});
    const outputDir=mkdtempSync(join(parent,'canopy-pipeline-'));
    const discovery=vi.spyOn(ImageProviderRegistry.prototype,'selectHealthy').mockRejectedValue(new Error('Procedural-only must not discover providers'));
    let result;
    try {
      result=await new AssetPipeline().generate({gameDna:dna,profile:'TINY_TEST',seed:dna.seed,outputDir,visualMode:'procedural-only',skipVlm:true});
      expect(discovery).not.toHaveBeenCalled();
    } finally {discovery.mockRestore();}
    const atlas=result.assets.find(asset=>asset.path==='assets/tilesets/biome_0/source.png');
    expect(atlas?.buffer.equals(canopyTerrainV4().bytes)).toBe(true);
    const tiles=result.assets.filter(asset=>asset.path.startsWith('assets/tilesets/biome_0/'));
    expect(tiles.length).toBeGreaterThan(1);
    for(const asset of tiles){expect(asset.maturity).toBe('QA_REVIEW');expect(asset.productionReady).toBe(false);expect(asset.productionAllowed).toBe(false);expect(asset.critiqueScore).toBe(0);}
    const metadata=JSON.parse(readFileSync(join(outputDir,'assets/tilesets/biome_0/terrain.json'),'utf8'));
    expect(metadata.roles).toEqual(canopyTerrainV4().roles);
    expect(metadata.productionApproved).toBe(false);
    expect(result.warnings.some(message=>message.includes('production visual review is pending'))).toBe(true);
    const props=result.assets.filter(asset=>asset.path.startsWith('assets/props/canopy/'));
    expect(props).toHaveLength(14);
    for(const prop of props){expect(prop.maturity).toBe('QA_REVIEW');expect(prop.productionAllowed).toBe(false);expect(prop.critiqueScore).toBe(0);}
    const actor=result.assets.find(asset=>asset.path==='assets/characters/player_run_W.png')!;
    expect(createHash('sha256').update(actor.buffer).digest('hex')).toBe('f1f55480977327fa29ee2444887d7c413df733c18488e865dea39a68ea39e0e1');
    for(const [path,hash] of [
      ['assets/enemies/enemy_001_attack.png','9bd8f106bf85383a5c58c0a4795a6465774f572a714e4fb6f8710b5e29c1c826'],
      ['assets/bosses/boss_final_run.png','e7f625326c8814306c7af3229ab9cffd9382c92273152aff8246c71d2bb04185'],
      ['assets/vfx/slam_shock.png','60b71461b58082018673851d31495048bff39fa6ce76cc0cbd30db9c272c9110'],
    ])expect(createHash('sha256').update(result.assets.find(asset=>asset.path===path)!.buffer).digest('hex')).toBe(hash);
    const timing=JSON.parse(readFileSync(join(outputDir,'assets/characters/player_animations.json'),'utf8'));
    expect(timing.cast).toEqual({frameCount:12,fps:24,loop:false});
    expect(result.assets.filter(asset=>/^assets\/characters\/player_cast(?:_[A-Z]+)?\.png$/.test(asset.path))).toHaveLength(9);
    expect(timing.attack.fps).toBe(30);
    expect(timing.attack.attackTiming.activeStart/timing.attack.fps).toBeCloseTo(0.12);
    expect(timing.attack.attackTiming.activeEnd/timing.attack.fps).toBeCloseTo(0.24);
    const effects=JSON.parse(readFileSync(join(outputDir,'assets/vfx/effects.json'),'utf8'));
    expect(Object.keys(effects)).toHaveLength(9);
    for(const effect of Object.values(effects) as {frameCount:number}[])expect(effect.frameCount).toBe(10);
    const portrait=result.assets.find(asset=>asset.path.startsWith('assets/ui/portraits/'))!;
    expect(portrait.maturity).toBe('QA_REVIEW');expect(portrait.productionReady).toBe(false);
    for(const [path,expected] of [
      ['assets/generated/chest/interactive_chest_closed.png',canopyIcon('chest')],
      ['assets/generated/chest/interactive_chest_open.png',canopyIcon('chest_open')],
      ['assets/generated/gate/interactive_ability_gate.png',canopyIcon('gate')],
      ['assets/generated/portal/interactive_portal.png',canopyIcon('portal')],
      ['assets/generated/checkpoint/interactive_checkpoint.png',canopyIcon('seed')],
      ['assets/generated/items/health_pickup.png',canopyPickup('health')],
      ['assets/generated/items/progression_pickup.png',canopyPickup('scrap')],
    ] as const){
      const item=result.assets.find(asset=>asset.path===path)!;
      expect(item.buffer.equals(expected)).toBe(true);
      expect(item.maturity).toBe('QA_REVIEW');expect(item.productionAllowed).toBe(false);
    }
    expect(new Set(result.assets.map(asset=>asset.path)).size).toBe(result.assets.length);
  },60000);
});
