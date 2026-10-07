import {readFileSync,mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,it,expect} from 'vitest';
import {GameDNASchema} from '@metroforge/schemas';
import {AssetPipeline} from './asset-pipeline.js';
import {decodePngRgba} from './png.js';
import {buildBossAnimationSidecar} from './boss-animation-spec.js';
describe('side-view enemy run contract',()=>{
 it.each(['SIDE_VIEW_METROIDVANIA','SIDE_VIEW_PLATFORMER'])('%s emits real twelve-frame run strips alongside walk',async(archetype)=>{
  const input=JSON.parse(readFileSync(new URL('./fixtures/canopy-game-dna.json',import.meta.url),'utf8'));
  input.archetype=archetype;input.identity.title='Side-view run contract';
  const dna=GameDNASchema.parse(input);
  mkdirSync('E:/MetroForgeData/TestArtifacts',{recursive:true});
  const outputDir=mkdtempSync('E:/MetroForgeData/TestArtifacts/enemy-run-');
  const result=await new AssetPipeline().generate({gameDna:dna,profile:'TINY_TEST',seed:42,outputDir,visualMode:'procedural-only',skipVlm:true});
  const walks=result.assets.filter(asset=>/^assets\/enemies\/enemy_\d+_walk\.png$/.test(asset.path));
  expect(walks.length).toBeGreaterThan(0);
  for(const walk of walks){
   const run=result.assets.find(asset=>asset.path===walk.path.replace('_walk.png','_run.png'));
   expect(run).toBeDefined();
   const image=decodePngRgba(run!.buffer);
   expect(image.width).toBe(image.height*12);
   expect(run!.buffer.equals(walk.buffer)).toBe(false);
   // Retain the actual generator bytes for the separate native slicing probe.
   writeFileSync(join(outputDir,run!.path),run!.buffer);
   writeFileSync(join(outputDir,walk.path),walk.buffer);
  }
  const bossWalks=result.assets.filter(asset=>/^assets\/bosses\/boss_(?:\d+|final)_walk\.png$/.test(asset.path));
  expect(bossWalks.length).toBeGreaterThan(0);
  for(const walk of bossWalks){
   const run=result.assets.find(asset=>asset.path===walk.path.replace('_walk.png','_run.png'));
   expect(run).toBeDefined();
   const image=decodePngRgba(run!.buffer);
   expect(image.width).toBe(image.height*12);
   expect(image.height).toBe(decodePngRgba(walk.buffer).height);
   expect(run!.buffer.equals(walk.buffer)).toBe(false);
   writeFileSync(join(outputDir,run!.path),run!.buffer);
   const metadata=JSON.parse(readFileSync(join(outputDir,walk.path.replace('_walk.png','_animations.json')),'utf8'));
   expect(metadata.run).toMatchObject({frameCount:12,fps:14,loop:true});
  }
 },60000);
 it('keeps existing non-side-view boss metadata unchanged unless run is requested',()=>{
  expect(buildBossAnimationSidecar().run).toBeUndefined();
  expect(buildBossAnimationSidecar(true).run).toMatchObject({frameCount:12,fps:14,loop:true});
 });
});
