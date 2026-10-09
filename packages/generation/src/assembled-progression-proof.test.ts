import {beforeEach,describe,it,expect} from 'vitest';
import {mkdtempSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {GameDNASchema} from '@metroforge/schemas';
import {GodotProjectAssembler,generateStormglassGalleryCampaign} from '@metroforge/godot';
import {buildProgressionProof,generateGameContent} from '@metroforge/procedural';
import {RepairEngineer,QAValidator} from '@metroforge/qa';
import {finalizeAssembledProgressionProof} from './assembled-progression-proof.js';

describe('assembled progression proof',()=>{
 let options:Parameters<typeof finalizeAssembledProgressionProof>[0];
 beforeEach(()=>{
  const outputPath=mkdtempSync(join(tmpdir(),'assembled-progression-'));
  const dna=GameDNASchema.parse({version:'1',identity:{title:'Stormglass Reliquary',genre:'Metroidvania',tone:'quiet danger',visualStyle:'original pixel art'},technical:{resolution:{width:1920,height:1080},tileSize:32,targetPlaytimeHours:2,difficulty:'normal'},combat:{style:'sword',meleeEnabled:true,rangedEnabled:false},movement:{walkSpeed:220,runSpeed:380,jumpHeight:160,gravity:980},abilities:['dash','double_jump','wall_slide','wall_jump','ground_slam','air_dash'].map(id=>({id,name:id,category:'movement',enabled:true})),world:{biomeCount:1,roomCount:48},narrative:{premise:'Recover weather seals',protagonist:'Courier',centralConflict:'Restore castle'},seed:42,profile:'MEDIUM',archetype:'SIDE_VIEW_METROIDVANIA'});
  const campaign=generateStormglassGalleryCampaign(dna,42,'archive-wing')!;
  const gameContent=generateGameContent(dna,'MEDIUM',42,'room_038',campaign.roomIds);
  const assembly=new GodotProjectAssembler().assemble({outputDir:outputPath,gameDna:dna,...campaign,gameContent});
  expect(assembly.errors).toEqual([]);expect(assembly.success).toBe(true);
  const initial=buildProgressionProof(campaign.worldGraph,campaign.progressionGraph);
  expect(initial.passed).toBe(false);expect(initial.movementFeasible).toBe(false);
  writeFileSync(join(outputPath,'progression_proof.json'),JSON.stringify(initial));
  options={outputPath,targetEngine:'godot',worldGraph:campaign.worldGraph,progressionGraph:campaign.progressionGraph,knownTokens:[]};
 });
 it('uses real exported stairs, preserves provisional evidence and leaves geometry unchanged',()=>{
  const scene=join(options.outputPath,'scenes/rooms/room_001.tscn'),original=readFileSync(scene);
  const provisional=readFileSync(join(options.outputPath,'progression_proof.json'));
  const graph=JSON.stringify(options.worldGraph);
  expect(finalizeAssembledProgressionProof(options).passed).toBe(true);
  expect(readFileSync(join(options.outputPath,'progression_proof.provisional.json')).equals(provisional)).toBe(true);
  expect(readFileSync(scene).equals(original)).toBe(true);expect(JSON.stringify(options.worldGraph)).toBe(graph);
 });
 it('does not exempt an unsupported stair approach',()=>{
  const scene=join(options.outputPath,'scenes/rooms/room_001.tscn');
  writeFileSync(scene,readFileSync(scene,'utf8').replaceAll('one_way_collision = true','one_way_collision = false'));
  expect(finalizeAssembledProgressionProof(options).passed).toBe(false);
 });
 it('refreshes a previous pass after geometry changes without replacing provisional evidence',()=>{
  const provisional=readFileSync(join(options.outputPath,'progression_proof.json'));
  expect(finalizeAssembledProgressionProof(options).passed).toBe(true);
  const scene=join(options.outputPath,'scenes/rooms/room_001.tscn');
  writeFileSync(scene,readFileSync(scene,'utf8').replaceAll('one_way_collision = true','one_way_collision = false'));
  expect(finalizeAssembledProgressionProof(options).passed).toBe(false);
  expect(JSON.parse(readFileSync(join(options.outputPath,'progression_proof.json'),'utf8')).passed).toBe(false);
  expect(readFileSync(join(options.outputPath,'progression_proof.provisional.json')).equals(provisional)).toBe(true);
 });
 it('rejects a real solid obstruction across the stair approach',()=>{
  const scene=join(options.outputPath,'scenes/rooms/room_001.tscn');
  writeFileSync(scene,readFileSync(scene,'utf8')+'\n[sub_resource type="RectangleShape2D" id="proof_obstruction"]\nsize = Vector2(64, 768)\n\n[node name="ProofObstruction" type="StaticBody2D" parent="."]\nposition = Vector2(500, 384)\n\n[node name="CollisionShape2D" type="CollisionShape2D" parent="ProofObstruction"]\nshape = SubResource("proof_obstruction")\n');
  expect(finalizeAssembledProgressionProof(options).passed).toBe(false);
 });
 it('keeps missing ability acquisition a failure even with valid physical stairs',()=>{
  const grant=options.worldGraph.nodes.find(n=>n.id==='room_003')!;
  grant.metadata={...grant.metadata,grantsAbilities:[]};
  expect(finalizeAssembledProgressionProof(options).passed).toBe(false);
 });
 it('requires the emitted player collision contract',()=>{
  const scene=join(options.outputPath,'scenes/player/Player.tscn');
  writeFileSync(scene,readFileSync(scene,'utf8').replace('size = Vector2(24, 48)','size = Vector2(24, 49)'));
  expect(finalizeAssembledProgressionProof(options).passed).toBe(false);
 });
 it('never uses Godot stairs as Unreal acceptance',()=>{
  expect(finalizeAssembledProgressionProof({...options,targetEngine:'unreal'}).passed).toBe(false);
 });
 it('does not report success when required movement data is absent',()=>{
  unlinkSync(join(options.outputPath,'data/player/movement.json'));
  expect(()=>finalizeAssembledProgressionProof(options)).toThrow();
  expect(JSON.parse(readFileSync(join(options.outputPath,'progression_proof.json'),'utf8')).passed).toBe(false);
 });
 it('refreshes successfully after the real repair engine restores a missing player scene',()=>{
  const provisional=readFileSync(join(options.outputPath,'progression_proof.json'));
  expect(finalizeAssembledProgressionProof(options).passed).toBe(true);
  unlinkSync(join(options.outputPath,'scenes/player/Player.tscn'));
  expect(finalizeAssembledProgressionProof(options).passed).toBe(false);
  const report=new QAValidator().validateProject(options.outputPath,'proof-repair-fixture');
  expect(new RepairEngineer().repair(options.outputPath,report).repaired).toBe(true);
  expect(finalizeAssembledProgressionProof(options).passed).toBe(true);
  expect(readFileSync(join(options.outputPath,'progression_proof.provisional.json')).equals(provisional)).toBe(true);
 });
});
