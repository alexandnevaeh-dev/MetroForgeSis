import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ImageProviderRegistry } from '../image-router.js';
import { DiffusersProvider } from '../providers/diffusers.js';
import { assembleContactSheet } from '../sprite-qa.js';
import { analyzeAnimationTemporal, analyzeFamilyCohesion, analyzeTilesetAdjacency } from './cohesion-qa.js';
import { runAssetPipelineV2 } from './orchestrator.js';
import type { AssetRequestV2 } from './types.js';

const RUN_ID = 'asset-pipeline-v2-modern-cohesion';
const STYLE_BIBLE = {
  version: 'metro-industrial-v1', worldTheme: 'futuristic underground metro / industrial sci-fi action game',
  cameraPerspective: 'orthographic side view, no vanishing-point shifts', targetAssetScale: '16 px tile grid; 64 px character frame',
  characterScale: 'player 52–58 px apparent height in a 64 px frame', enemyScale: 'robot 42–56 px apparent height in a 64 px frame', tileDimensions: [16,16],
  silhouetteRules: ['large readable primary masses','cyan player accents','orange hostile accents','no loose micro-parts'],
  edgeTreatment: 'crisp antialiased hard edges, dark blue-gray separation edge, no pixel-noise halo',
  lightingDirection: 'cool overhead-left key', shadowTreatment: 'compact cool occlusion shadows; no long baked floor shadows',
  materialVocabulary: ['graphite structural steel','brushed gunmetal panels','matte black polymer','cyan emissive transit glass','amber hazard ceramic'],
  paletteRoles: { void:'#10151d', structure:'#263441', steel:'#526675', playerAccent:'#39d8df', hostileAccent:'#f28a45', hazard:'#e8b84f', ui:'#b9edf0' },
  accentColorRules: 'cyan means player/interactive; orange means hostile; amber means hazard', saturationLimits: 'high saturation only on semantic accents, under 15% image area',
  contrastHierarchy: ['player and threats','interactables and hazards','foreground structure','background atmosphere'], detailDensityRules: 'detail concentrated at face/tool/interface; broad quiet structural masses elsewhere',
  backgroundVersusGameplayContrast: 'background two value bands lower and lower saturation than collision/gameplay layer',
  animationPrinciples: ['bottom-center anchor','preserve equipment and body volume','anticipation before attack','2–3 frame effect decay'],
  vfxPrinciples: ['transparent canvas','compact hit origin','cyan player energy','orange enemy destruction','never obscure full character silhouette'],
  forbiddenVisualTraits: ['photorealism','painterly concept backgrounds','baked text','random palette shifts','excess glow','bloom','noise','perspective drift','fake screenshots'],
} as const;
const STYLE = `Modern premium 2D side-view industrial sci-fi game asset. Futuristic underground metro. Orthographic side view. Crisp hard-edged silhouette, restrained graphite and gunmetal materials, cool overhead-left lighting, compact shadows, controlled detail, consistent 16px grid density. Semantic accents only: cyan for player and interaction, orange for hostile, amber for hazard. Contemporary clean production art, not retro pixel art. No text, photorealism, painterly scenery, bloom, random neon, noise, watermark, perspective view, or cropped subject.`;

function requests(real: boolean): AssetRequestV2[] {
  const common={artDirection:STYLE,allowRealProvider:real,requireRealProvider:real,mode:'LOCAL_ONLY' as const,targetEngine:'godot' as const,project:{theme:STYLE_BIBLE.worldTheme}};
  const clips=(owner:'player'|'enemy', names:Array<[string,4|8|12,number,boolean]>)=>names.map(([clip,frameCount,fps,loop],i)=>({ ...common,id:`metro_${owner}_${clip}`,category:owner,runtimeUse:`${owner} character ${clip} animation, isolated full body facing right; preserve exact costume, proportions, equipment, palette and ground anchor across the requested motion`,seed:940100+(owner==='enemy'?100:0)+i,hostile:owner==='enemy',animation:{clip,frameCount,fps,loop}} satisfies AssetRequestV2));
  return [
    ...clips('player',[['idle',8,8,true],['run',8,12,true],['jump_rise',4,10,false],['jump_fall',4,10,true],['land',4,12,false],['dash',4,14,false],['primary_attack',8,14,false],['hit',4,12,false]]),
    ...clips('enemy',[['idle',8,8,true],['locomotion',8,10,true],['attack_anticipation',4,8,false],['attack',8,12,false],['hit',4,12,false],['death',8,10,false]]),
    { ...common,id:'metro_industrial_tiles',category:'environment',runtimeUse:'modular 8 by 6 Godot tile source family with floors walls ceilings corners transitions platforms supports panels damage trim hazards background wall and conduit integration',seed:940301 },
    { ...common,id:'metro_power_terminal',category:'prop',runtimeUse:'metro power terminal isolated side-view prop',seed:940401 },
    { ...common,id:'metro_cargo_crate',category:'prop',runtimeUse:'industrial cargo storage object isolated side-view prop',seed:940402 },
    { ...common,id:'metro_wall_fixture',category:'prop',runtimeUse:'wall-mounted technological fixture isolated side-view prop',seed:940403 },
    { ...common,id:'metro_gate_operating',category:'animated_environment',runtimeUse:'powered metro gate operating loop, rigid mechanical geometry isolated',seed:940501,animation:{clip:'operating',frameCount:8,fps:8,loop:true} },
    { ...common,id:'metro_gate_activation',category:'animated_environment',runtimeUse:'powered metro gate activation transition, rigid mechanical geometry isolated',seed:940502,animation:{clip:'activate',frameCount:8,fps:10,loop:false} },
    { ...common,id:'metro_player_slash_fx',category:'vfx',runtimeUse:'compact cyan player melee slash energy effect isolated at hit origin',seed:940601,animation:{clip:'slash',frameCount:8,fps:16,loop:false} },
    { ...common,id:'metro_enemy_destroy_fx',category:'vfx',runtimeUse:'compact orange robotic impact destruction effect isolated at hit origin',seed:940602,animation:{clip:'destroy',frameCount:8,fps:14,loop:false} },
    { ...common,id:'metro_health_frame',category:'hud',runtimeUse:'minimal health frame ornament without text',seed:940701 },
    { ...common,id:'metro_dash_icon',category:'ability_icon',runtimeUse:'simple cyan dash ability symbol without text',seed:940702 },
    { ...common,id:'metro_interact_indicator',category:'ability_icon',runtimeUse:'simple interaction indicator symbol without text',seed:940703 },
    { ...common,id:'metro_compact_panel',category:'ui_panel',runtimeUse:'compact scalable panel frame corners and border without text',seed:940704 },
    { ...common,id:'metro_tunnel_background',category:'background',runtimeUse:'low-contrast futuristic metro tunnel parallax background without gameplay collision cues',seed:940801 },
  ];
}

describe('pipeline v2 modern cohesion production batch',()=>{
  it('generates an independent cohesive static/animated/modular kit and writes measurable evidence',async()=>{
    const real=process.env.METROFORGE_MODERN_COHESION_REAL==='1'; const provider=real?new DiffusersProvider({device:'openvino_gpu',modelId:'sd-1.5',generationTimeoutMs:900_000,warmupTimeoutMs:900_000}):undefined;
    const registry=real?new ImageProviderRegistry():undefined; if(provider&&registry)registry.register({provider,local:true,priority:100,costClass:'local'});
    const output=join(process.cwd(),'test-artifacts',real?RUN_ID:`${RUN_ID}-offline`); mkdirSync(output,{recursive:true});
    writeFileSync(join(output,'visual_bible.json'),JSON.stringify(STYLE_BIBLE,null,2));
    const result=await runAssetPipelineV2(requests(real),{registry,distinctSourcePairs:[['metro_player_idle','metro_enemy_idle'],['metro_power_terminal','metro_cargo_crate'],['metro_player_slash_fx','metro_enemy_destroy_fx']]});
    for(const entry of result.manifest){
      const files:[[string,Buffer],[string,Buffer],[string,Buffer]]=[['generated/'+entry.compiledAssetPath,entry.buffer],['source/'+entry.sourceAssetPath,entry.sourceBuffer],['normalized/'+String(entry.normalizedAssetPath),entry.normalizedBuffer]];
      for(const [rel,data] of files){const path=join(output,rel);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,data);}
      for(const extra of entry.extraResources){const path=join(output,'generated',extra.path);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,extra.contents);}
    }
    const animated=result.manifest.filter((e)=>e.animation); const animationQa=animated.map((e)=>({assetId:e.assetId,metadata:e.animation,qa:analyzeAnimationTemporal(e.buffer,e.dimensions.width/(e.animation?.frameCount??1),e.animation?.frameCount??1)}));
    const tiles=result.manifest.find((e)=>e.category==='environment'); const tileQa=tiles?analyzeTilesetAdjacency(tiles.buffer,16):undefined;
    const cohesion=analyzeFamilyCohesion(result.manifest.map((e)=>({id:e.assetId,png:e.buffer})));
    mkdirSync(join(output,'manifests'),{recursive:true}); writeFileSync(join(output,'manifests','pipeline_summary.json'),JSON.stringify(result.summary,null,2));
    mkdirSync(join(output,'qa'),{recursive:true}); writeFileSync(join(output,'qa','automated_family_qa.json'),JSON.stringify({animationQa,tileQa,cohesion},null,2));
    writeFileSync(join(output,'master_contact_sheet.png'),assembleContactSheet(result.manifest.map((e)=>({label:e.assetId,png:e.buffer}))));
    expect(result.summary.failed).toEqual([]); expect(result.manifest).toHaveLength(27); expect(animated).toHaveLength(18); expect(result.summary.distinctSourceChecks.every((c)=>c.distinct)).toBe(true);
    if(real)expect(result.manifest.every((e)=>e.provider==='diffusers'&&e.generationExecutionPath==='direct_openvino_persistent')).toBe(true);
    await provider?.unloadOpenVinoRuntime();
  },process.env.METROFORGE_MODERN_COHESION_REAL==='1'?4*60*60*1000:60_000);
});
