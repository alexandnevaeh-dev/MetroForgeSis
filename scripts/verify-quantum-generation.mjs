import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repo = resolve('.');
const reports = join(repo,'reports/game-tests/20261001-quantum-divergence');
const output = join(reports,'generation-'+Date.now());
assert.match(output,/^E:[/\\]/i);
mkdirSync(output,{recursive:true});
process.env.METROFORGE_GENERATED_GAMES_DIR = join(output,'GeneratedGames');
process.env.METROFORGE_DATA_DIR = join(output,'Database');
process.env.METROFORGE_RESOURCE_ROOT = repo;
process.env.TEMP = 'E:/MetroForgeData/Temp';
process.env.TMP = process.env.TEMP;
process.env.GODOT_EXECUTABLE = 'E:/MetroForgeData/Godot/4.6/Godot_v4.6-stable_win64_console.exe';
process.env.APPDATA = 'E:/MetroForgeData/AppData/QuantumGenerated';
process.env.LOCALAPPDATA = 'E:/MetroForgeData/AppData/QuantumGeneratedLocal';
const {GenerationPipeline,loadProjectContext,scaffoldManualProject} = await import('../packages/generation/dist/index.js');
const {assembleQuantumProject,GodotProjectAssembler} = await import('../packages/godot/dist/index.js');
const {QuantumProjectSpecSchema,GenreDefinitionSchema} = await import('../packages/schemas/dist/index.js');
const {getGenreDefinition,resolveGameArchetype,inferGameArchetypeFromPrompt} = await import('../packages/shared/dist/index.js');
const {generateGameDNA} = await import('../packages/ai/dist/index.js');
const digest = path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const sourcePaths = ['packages/shared/src/constants.ts','packages/shared/src/archetypes.ts','packages/schemas/src/core.ts','packages/schemas/src/genre.ts',
  'packages/schemas/src/quantum.ts','packages/schemas/src/index.ts','packages/godot/src/quantum-assembler.ts','packages/godot/src/assembler.ts','packages/godot/src/index.ts',
  'packages/generation/src/quantum-generation.ts','packages/generation/src/quantum-runtime.ts','packages/generation/src/events.ts','packages/generation/src/pipeline.ts','packages/generation/src/index.ts','packages/generation/src/scaffold-manual-project.ts',
  'packages/ai/src/generators/game-dna.ts','scripts/package-quantum-runtime.mjs','scripts/verify-quantum-generation.mjs'];
const sources = sourcePaths.map(path=>({path,sha256:digest(join(repo,path))}));
const template = join(repo,'templates/godot-quantum-divergence');
const templateSha256 = digest(join(template,'quantum-template.json'));
const manifest = JSON.parse(readFileSync(join(template,'quantum-template.json'),'utf8'));
const spec = {version:1,archetype:'QUANTUM_SIMULATION_ROGUELITE',title:'The Lattice Expedition',prompt:'Stabilize the Probability Mines and extract.',seed:42,biome:'probability-mines',candidateOnly:true,productionApproved:false};
const checks = [];
const check = (label,fn)=>{fn();checks.push({label,passed:true});};
check('registry selects the actual Quantum runtime',()=>{
  const genre = getGenreDefinition(spec.archetype);
  assert.equal(resolveGameArchetype(spec.archetype),spec.archetype);
  assert.equal(inferGameArchetypeFromPrompt('Quantum Divergence simulation roguelite'),spec.archetype);
  assert.equal(GenreDefinitionSchema.safeParse(genre).success,true);
  assert.equal(genre.runtime.worldGenerator,'chunked_material_world');
  assert.equal(genre.runtime.navigationModel,'MATERIAL_CONTACT');
  assert.equal(genre.capabilities.supportsPerRoomScenes,false);
  assert.equal(genre.capabilities.supportsSideViewQualityPass,false);
});
for (const [label,change] of [
  ['negative seed',{seed:-1}],['fractional seed',{seed:.5}],['overflow seed',{seed:2147483648}],
  ['blank title',{title:' '}],['control-character title',{title:'Bad\nTitle'}],
  ['unsupported biome',{biome:'chrono-rift'}],['unknown configuration field',{silentFallback:true}],
  ['false production approval',{productionApproved:true}]]) check('strict configuration rejects '+label,()=>assert.equal(QuantumProjectSpecSchema.safeParse({...spec,...change}).success,false));
check('all shipped template dependencies match their bound hashes',()=>{
  for (const [path,sha] of Object.entries(manifest.hashes)) assert.equal(digest(join(template,path)),sha);
  assert.ok(!Object.keys(manifest.hashes).some(path=>/\.godot|\.env|reports\/|test|tool|review-reference/.test(path.replace('project.godot','project'))));
});
check('generic room assembler refuses Quantum without writing output',()=>{
  const target = join(output,'wrong-room-assembler');
  const result = new GodotProjectAssembler().assemble({outputDir:target,gameDna:{archetype:spec.archetype}});
  assert.equal(result.success,false);
  assert.equal(existsSync(target),false);
});
check('manual room scaffold refuses Quantum without writing output',()=>{
  const target = join(output,'wrong-manual-scaffold');
  const result = scaffoldManualProject({outputDir:target,title:spec.title,slug:'manual',archetype:spec.archetype});
  assert.equal(result.success,false);
  assert.equal(existsSync(target),false);
});
await assert.rejects(generateGameDNA({archetype:spec.archetype,prompt:spec.prompt,profile:'TINY_TEST',seed:42},null),/dedicated/);
checks.push({label:'generic AI DNA refuses a Quantum room fallback',passed:true});
const badResources = join(output,'tampered-resources');
cpSync(template,join(badResources,'templates/godot-quantum-divergence'),{recursive:true});
writeFileSync(join(badResources,'templates/godot-quantum-divergence/scripts/PlayerSimulation.gd'),'tampered source');
check('changed template fails before any project is written',()=>{
  const target = join(output,'bad-template-project');
  assert.throws(()=>assembleQuantumProject({outputDir:target,spec,resourceRoot:badResources}),/hash mismatch/);
  assert.equal(existsSync(target),false);
});
const pipeline = new GenerationPipeline();
const base = {prompt:spec.prompt,title:spec.title,archetype:spec.archetype,seed:42,profile:'TINY_TEST',mode:'LOCAL_ONLY',cwd:repo};
for (const [label,change] of [['unsupported AI mode',{mode:'FULL_AI'}],['expanded profile',{profile:'SMALL'}],
  ['Unity engine',{targetEngine:'unity'}],['Unreal engine',{targetEngine:'unreal'}],['room visual pack',{externalVisualPack:'foundry-courier'}],
  ['generation resume',{resume:true}],['room override',{worldOverride:{roomCount:3}}],['review pauses',{generationControl:'interactive'}]]) {
  const slug = 'reject-'+label.replaceAll(' ','-');
  const result = await pipeline.run({...base,...change,slug});
  check('pipeline rejects '+label+' before project creation',()=>{
    assert.equal(result.success,false);
    assert.ok(result.errors.length);
    assert.equal(existsSync(result.outputPath),false);
  });
}
const cancelled = new AbortController();
cancelled.abort();
const cancelledResult = await pipeline.run({...base,slug:'cancel-before-create',signal:cancelled.signal});
check('cancelled generation creates no project',()=>{
  assert.equal(cancelledResult.cancelled,true);
  assert.equal(existsSync(cancelledResult.outputPath),false);
});
const events = [];
const run = await pipeline.run({...base,slug:'the-lattice-expedition',quantumRecordRuntime:process.argv.includes('--record'),
  onEvent:event=>events.push(event),onPhase:(phase,status,message)=>console.log(JSON.stringify({phase,status,message}))});
writeFileSync(join(output,'pipeline-result.json'),JSON.stringify(run,null,2));
assert.equal(run.success,true,run.errors.join('; '));
assert.equal(run.validationPassed,true,run.errors.join('; '));
check('actual MetroForge pipeline creates and validates a standalone Quantum game',()=>{
  assert.equal(run.validationLevel,'RUNTIME_VALIDATED');
  assert.equal(run.projectStatus,'complete');
  const loaded = loadProjectContext(run.outputPath);
  assert.equal(loaded.gameDna.archetype,spec.archetype);
  assert.equal(loaded.gameDna.combat.meleeEnabled,false);
  assert.deepEqual(loaded.roomIds,[]);
  assert.equal(loaded.worldGraph.nodes.length,8);
  assert.ok(loaded.worldGraph.nodes.every(node=>node.type==='region'));
  assert.ok(loaded.manifest.artifacts.length>40);
  assert.ok(loaded.manifest.artifacts.every(item=>item.productionReady===false));
});
check('actual generated configuration controls seed and displayed title',()=>{
  const runtime = JSON.parse(readFileSync(join(run.outputPath,'reports/quantum-generation/gameplay/playground-result.json'),'utf8'));
  assert.equal(runtime.generation.seed,42);
  assert.equal(runtime.generation.title,spec.title);
  assert.equal(runtime.generation.configuration_sha256,digest(join(run.outputPath,'quantum_project.json')));
  assert.equal(runtime.full_route.reached,161);
  assert.equal(runtime.player_hp,76);
  assert.equal(runtime.art.floorFailures,0);
  assert.equal(runtime.art.propFailures,0);
});
check('events preserve real start, phase and validation completion states',()=>{
  assert.equal(events[0].type,'GenerationStarted');
  assert.ok(events.every(event=>event.projectPath===run.outputPath && event.jobId));
  assert.equal(events.at(-1).type,'GenerationCompleted');
  assert.equal(events.at(-1).validationPassed,true);
});
const standalone = JSON.parse(readFileSync(join(run.outputPath,'reports/quantum-generation/standalone.json'),'utf8'));
const packaged = JSON.parse(readFileSync(join(run.outputPath,'reports/quantum-generation/packaged-gameplay/playground-result.json'),'utf8'));
check('normal generation exports and fingerprints the Windows release package',()=>{
  assert.equal(standalone.passed,true);
  assert.equal(standalone.release,true);
  assert.equal(run.exportPath,join(run.outputPath,'build/windows'));
  assert.equal(events.at(-1).exportPath,run.exportPath);
  assert.deepEqual(standalone.files.map(file=>file.path),['game.exe','game.pck','game.console.exe']);
  for (const file of standalone.files) assert.equal(digest(join(run.exportPath,file.path)),file.sha256);
  assert.equal(JSON.parse(readFileSync(join(run.outputPath,'engine.json'),'utf8')).standaloneBuild,true);
});
check('copied release package preserves every original template dependency',()=>{
  assert.equal(packaged.generation.package.standalone,true);
  assert.equal(packaged.generation.package.release,true);
  assert.equal(packaged.generation.package.integrity,true);
  assert.equal(packaged.generation.package.files,Object.keys(manifest.hashes).length);
  assert.equal(packaged.generation.package.template_sha256,templateSha256);
  assert.equal(packaged.generation.configuration_sha256,digest(join(run.outputPath,'quantum_project.json')));
});
check('copied release package completes gameplay rather than only starting',()=>{
  assert.equal(packaged.full_route.reached,161);
  assert.equal(packaged.full_route.failure,'');
  assert.equal(packaged.progression.extracted,true);
  assert.ok(packaged.player_hp>0);
  assert.equal(packaged.art.floorFailures,0);
  assert.equal(packaged.art.propFailures,0);
  assert.equal(packaged.art.propChecks,480);
  for (const kind of ['skitter','driller','wraith','golem']) for (const state of ['idle','walk','run','attack','hit','death']) assert.equal(packaged.art.actorStates[kind][state],true);
});
const originalConfig = digest(join(run.outputPath,'quantum_project.json'));
const collision = await pipeline.run({...base,slug:'the-lattice-expedition'});
check('existing generated game is preserved on a repeated slug',()=>{
  assert.equal(collision.success,false);
  assert.equal(digest(join(run.outputPath,'quantum_project.json')),originalConfig);
});
const layout = result=>{
  const child = spawnSync(process.env.GODOT_EXECUTABLE,['--headless','--path',result.outputPath,'--','--generation-layout-only'],{env:process.env,encoding:'utf8',windowsHide:true,timeout:90000,maxBuffer:4*1024*1024});
  const logs = String(child.stdout||'')+String(child.stderr||'');
  writeFileSync(join(output,result.projectSlug+'-layout.log'),logs);
  assert.ifError(child.error);
  assert.equal(child.status,0);
  assert.ok(!/SCRIPT ERROR:|Parse Error:|Assertion failed/.test(logs));
  const line = logs.split(/\r?\n/).find(value=>value.startsWith('QUANTUM_GENERATED_LAYOUT '));
  assert.ok(line);
  return JSON.parse(line.slice('QUANTUM_GENERATED_LAYOUT '.length));
};
const same = await pipeline.run({...base,slug:'same-seed',skipRuntimeValidation:true});
const different = await pipeline.run({...base,slug:'different-seed',seed:73,skipRuntimeValidation:true});
for (const result of [same,different]) check('skipped native gates stay unverified: '+result.projectSlug,()=>{
  assert.equal(result.success,true,result.errors.join('; '));
  assert.equal(result.validationPassed,false);
  assert.equal(result.validationLevel,'STATIC_VALIDATED');
  assert.equal(result.projectStatus,'validation_failed');
  assert.equal(result.exportPath,undefined);
  assert.ok(result.phases.some(phase=>phase.phase==='export' && phase.status==='SKIPPED'));
});
const a = JSON.parse(readFileSync(join(run.outputPath,'quantum_world.json'),'utf8'));
const b = layout(same);
const c = layout(different);
check('same seed reproduces actual material bytes in a second generated project',()=>assert.equal(a.initial_terrain_sha256,b.initial_terrain_sha256));
check('different seed changes actual terrain and preserves authored geometry',()=>{
  assert.notEqual(a.initial_terrain_sha256,c.initial_terrain_sha256);
  assert.equal(c.seed,73);
  assert.deepEqual(a.worldGraph.nodes,c.worldGraph.nodes);
  assert.deepEqual(a.stations,c.stations);
});
for (const source of sources) assert.equal(digest(join(repo,source.path)),source.sha256,'Source changed during generation test');
assert.equal(digest(join(template,'quantum-template.json')),templateSha256);
for (const [path,sha] of Object.entries(manifest.hashes)) assert.equal(digest(join(template,path)),sha);
const recordingPath = join(run.outputPath,'reports/quantum-generation/recording.json');
const recording = existsSync(recordingPath)?JSON.parse(readFileSync(recordingPath,'utf8')):null;
if (process.argv.includes('--record')) {
  assert.equal(recording?.decoded,true);
  assert.equal(digest(recording.path),recording.sha256);
}
const result = {output,checks,sources,templateSha256,project:run,events,layouts:{primary:a,sameSeed:b,differentSeed:c},recording,standalone,
  productionReady:false,scope:'Actual MetroForge generation backend and generated native game; not manual desktop UI use, AI content generation or final production approval'};
writeFileSync(join(output,'verification.json'),JSON.stringify(result,null,2));
writeFileSync(join(reports,'generation-latest.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({output,checks:checks.length,projectPath:run.outputPath,validationLevel:run.validationLevel,recording:recording?.path,productionReady:false}));
