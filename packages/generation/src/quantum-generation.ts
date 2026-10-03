import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { assembleQuantumProject } from '@metroforge/godot';
import { GameDNASchema, ProjectMetadataSchema, QuantumProjectSpecSchema, WorldGraphSchema, type GenerationJob } from '@metroforge/schemas';
import { createDatabase, type MetroForgeDatabase } from '@metroforge/database';
import { writeEngineManifest } from '@metroforge/engines';
import { godotProcessEnv, resolveGodotExecutableCanonical, windowsExportTemplatesInstalled } from '@metroforge/tools';
import { GENERATION_PHASES, GenerationCancelledError, PRODUCT, generateId, loadConfig, resolveGeneratedGamesPath, resolveProjectPathSafe, slugify, throwIfCancelled } from '@metroforge/shared';
import type { GenerateOptions, GenerateResult } from './pipeline.js';
import { withCategory, type GenerationEvent } from './events.js';
import { quantumRuntimeFailures } from './quantum-runtime.js';

const digest = (path: string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
const writeJson = (path: string,value: unknown)=>writeFileSync(path,JSON.stringify(value,null,2)+'\n');

/** Run an actual native process with bounded logs, timeout and cancellation. */
async function native(executable: string,args: string[],log: string,signal?: AbortSignal,options: { env?: NodeJS.ProcessEnv; cwd?: string } = {}): Promise<string> {
  throwIfCancelled(signal);
  return new Promise((accept,reject)=>{
    const child = spawn(executable,args,{windowsHide:true,cwd:options.cwd,env:{...process.env,
      TEMP:'E:/MetroForgeData/Temp',TMP:'E:/MetroForgeData/Temp',
      APPDATA:'E:/MetroForgeData/AppData/QuantumGenerated',LOCALAPPDATA:'E:/MetroForgeData/AppData/QuantumGeneratedLocal',...options.env}});
    let output = '';
    let failure: Error | undefined;
    const stop = (error: Error)=>{
      if (failure) return;
      failure = error;
      if (process.platform === 'win32' && child.pid) {
        // The console wrapper owns a game child: cancel only this job's process tree.
        const killer = spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
        killer.on('error',()=>child.kill());
      } else child.kill();
    };
    const cancel = ()=>stop(new GenerationCancelledError());
    const timeout = setTimeout(()=>stop(new Error('Quantum native validation timed out')),360000);
    signal?.addEventListener('abort',cancel,{once:true});
    const append = (bytes: Buffer)=>{
      if (output.length+bytes.length > 12*1024*1024) stop(new Error('Quantum native validation log exceeded its limit'));
      else output += bytes.toString('utf8');
    };
    child.stdout.on('data',append);
    child.stderr.on('data',append);
    child.on('error',error=>{failure ??= error;});
    child.on('close',code=>{
      clearTimeout(timeout);
      signal?.removeEventListener('abort',cancel);
      writeFileSync(log,output);
      if (failure) reject(failure);
      else if (code!==0 || /SCRIPT ERROR:|Parse Error:|Assertion failed/.test(output)) reject(new Error('Quantum native validation failed; see '+log));
      else accept(output);
    });
    if (signal?.aborted) cancel();
  });
}

export async function runQuantumGeneration(options: GenerateOptions): Promise<GenerateResult> {
  const config = loadConfig();
  const slug = options.slug ?? slugify(options.title?.trim() || 'Quantum Divergence');
  const root = resolveGeneratedGamesPath(config,options.cwd ?? process.cwd());
  const outputPath = resolveProjectPathSafe(root,slug);
  const phases: GenerateResult['phases'] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  let db: MetroForgeDatabase | undefined;
  let job: GenerationJob | undefined;
  let projectId = '';
  let assembled = false;
  let currentPhase = 'intake';
  const emit = (event: Omit<GenerationEvent,'timestamp'>)=>options.onEvent?.(withCategory({...event,timestamp:new Date().toISOString(),jobId:job?.id,projectSlug:slug,projectPath:outputPath} as GenerationEvent));
  const phase = (name: string,status: 'RUNNING' | 'PASSED' | 'FAILED' | 'SKIPPED',message?: string)=>{
    throwIfCancelled(options.signal);
    currentPhase = name;
    phases.push({phase:name,status,message});
    options.onPhase?.(name,status,message);
    emit({type:status==='RUNNING'?'PhaseStarted':'PhaseCompleted',phase:name,status,message} as GenerationEvent);
    const stage = job?.stages.find(value=>value.phase===name);
    if (stage) db!.jobs.updateStageStatus(stage.id,status,status==='FAILED'?message ?? 'Failed':null);
    if (job) db!.jobs.updateJobStatus(job.id,'running',name);
  };
  try {
    throwIfCancelled(options.signal);
    if (options.mode!=='LOCAL_ONLY') throw new Error('Quantum currently supports Local only generation; AI-directed content generation is not implemented yet');
    if (options.profile!=='TINY_TEST') throw new Error('Quantum currently supports the Probability Mines test profile; expanded biome profiles are not implemented yet');
    if ((options.targetEngine ?? 'godot')!=='godot') throw new Error('Quantum material simulation currently supports Godot only; Unity/Unreal ports are not implemented yet');
    if (options.externalVisualPack || options.worldOverride || options.resume) throw new Error('Quantum requires a fresh isolated project; room visual packs, topology overrides and generation resume are unsupported');
    if (options.generationControl && options.generationControl!=='autonomous') throw new Error('Quantum generation review pauses are not implemented yet; use autonomous generation');
    if (process.platform==='win32' && !/^E:[/\\]/i.test(resolve(outputPath))) throw new Error('Quantum generated projects must stay on E:');
    if (existsSync(outputPath)) throw new Error('Quantum project already exists; use a new title or slug to preserve it');
    const spec = QuantumProjectSpecSchema.parse({version:1,archetype:'QUANTUM_SIMULATION_ROGUELITE',
      title:options.title?.trim() || 'Quantum Divergence',prompt:options.prompt,seed:options.seed,
      biome:'probability-mines',candidateOnly:true,productionApproved:false});
    const dataDir = resolve(config.dataDir || join(options.cwd ?? process.cwd(),'.metroforge'));
    if (process.platform==='win32' && !/^E:[/\\]/i.test(dataDir)) throw new Error('Quantum database must stay on E:');
    db = await createDatabase(dataDir);
    if (db.projects.findBySlug(slug)) throw new Error('Quantum project slug already exists in MetroForge; use a new slug');
    const now = new Date().toISOString();
    const project = db.projects.create({id:generateId('proj'),slug,title:spec.title,description:spec.prompt,profile:options.profile,mode:options.mode,seed:spec.seed,
      outputPath:outputPath.replaceAll('\\','/'),createdAt:now,updatedAt:now,status:'generating'});
    projectId = project.id;
    job = db.jobs.create(projectId,options.profile,options.mode,spec.seed);
    emit({type:'GenerationStarted',profile:options.profile,mode:options.mode,seed:spec.seed,prompt:spec.prompt} as GenerationEvent);
    phase('intake','PASSED','Dedicated Quantum material-world generator');
    phase('game_dna','RUNNING');
    const dna = GameDNASchema.parse({version:PRODUCT.schemaVersion,archetype:spec.archetype,seed:spec.seed,profile:options.profile,
      identity:{title:spec.title,genre:'Quantum Simulation Roguelite',tone:'Mysterious sci-fi',visualStyle:'Crisp articulated pixel art'},
      technical:{resolution:{width:960,height:600},tileSize:32,targetPlaytimeHours:.2,difficulty:'normal'},
      combat:{style:'Programmable projectiles',meleeEnabled:false,rangedEnabled:true},
      movement:{walkSpeed:160,runSpeed:260,jumpHeight:64.8,gravity:840},
      abilities:[{id:'photon',name:'Photon Stabilizer',category:'quantum_instrument',enabled:true},{id:'tachyon',name:'Tachyon Splitter',category:'quantum_instrument',enabled:true}],
      world:{biomeCount:1,roomCount:8},narrative:{premise:spec.prompt,protagonist:'Quantum Diver',antagonist:'Probability Golem',centralConflict:'Stabilize the Quantum Cascade and extract'}});
    phase('game_dna','PASSED','Local authored design and selected seed; no AI request');
    phase('project_assembly','RUNNING');
    const assembly = assembleQuantumProject({outputDir:outputPath,spec});
    assembled = true;
    writeJson(join(outputPath,'game_dna.json'),dna);
    writeJson(join(outputPath,'project.json'),ProjectMetadataSchema.parse({projectId,slug,prompt:spec.prompt,profile:options.profile,mode:options.mode,seed:spec.seed,
      createdAt:now,lastGeneratedAt:now,gameDnaVersion:dna.version,generatorVersion:PRODUCT.generatorVersion,archetype:spec.archetype,engine:'godot'}));
    const reports = join(outputPath,'reports/quantum-generation');
    mkdirSync(reports,{recursive:true});
    writeJson(join(reports,'assembly.json'),assembly);
    const templateManifest = JSON.parse(readFileSync(join(outputPath,'quantum-template.json'),'utf8'));
    const artifacts = Object.entries(templateManifest.hashes).filter(([path])=>path.endsWith('.png')).map(([path,sha256])=>({
      id:'quantum:'+path,path,type:'sprite',provider:'authored-quantum',modelId:'original-native-geometry',
      fallbackGenerated:false,productionReady:false,maturity:'COMPILED',sourceType:'compiled',
      metadata:{genre:spec.archetype,candidateOnly:true,productionApproved:false,sha256}}));
    writeJson(join(outputPath,'generation_manifest.json'),{version:1,createdAt:now,archetype:spec.archetype,artifacts});
    writeEngineManifest(outputPath,'godot',{engineVersion:'unverified',gameplayPack:'quantum_project.json',notes:['Dedicated chunked-material Quantum candidate, using authored local asset packs; not AI-generated art or final production approval']});
    phase('project_assembly','PASSED',assembly.files+' verified runtime/configuration files');
    phase('environment_assets','PASSED','Matching original Quantum candidate packs; no cross-genre fallback');
    phase('static_validation','PASSED','Template dependency hashes and strict Quantum configuration verified');
    const used = new Set(['intake','game_dna','project_assembly','environment_assets','static_validation','world_topology','final_qa','export']);
    for (const name of GENERATION_PHASES) if (!used.has(name)) phase(name,'SKIPPED','Not generated by the current Quantum candidate path');
    let validationPassed = false;
    let validatedGodot: string | undefined;
    let validatedGodotVersion = '';
    let nativeLayout: any;
    let exportPath: string | undefined;
    let validationLevel: GenerateResult['validationLevel'] = 'STATIC_VALIDATED';
    const gates: Array<{gate:string;passed:boolean;state:string;message:string}> = [{gate:'quantum_template_integrity',passed:true,state:'PASS',message:'Strict configuration and exact template/package bytes'}];
    if (options.skipRuntimeValidation) {
      warnings.push('Native layout, imports and gameplay were skipped; this project still needs runtime validation');
      phase('world_topology','SKIPPED','Native generation/terrain layout not verified');
      gates.push({gate:'quantum_native_gameplay',passed:false,state:'SKIPPED',message:'Runtime validation was explicitly skipped'});
    } else {
      const godot = resolveGodotExecutableCanonical({envPath:config.godotExecutable});
      if (!godot.path || !existsSync(godot.path)) {
        validationLevel = 'NEEDS_RUNTIME_VALIDATION';
        warnings.push('Godot is unavailable; native layout, imports and gameplay remain unverified');
        phase('world_topology','SKIPPED','Godot is unavailable');
        gates.push({gate:'quantum_native_gameplay',passed:false,state:'SKIPPED',message:'Godot unavailable'});
      } else {
        validatedGodot = godot.path;
        validatedGodotVersion = (await native(godot.path,['--version'],join(reports,'runtime-version.log'),options.signal)).trim();
        phase('world_topology','RUNNING','Building selected seed with the actual native generator');
        await native(godot.path,['--headless','--editor','--path',outputPath,'--import'],join(reports,'import.log'),options.signal);
        validationLevel = 'IMPORT_VALIDATED';
        const layoutLogs = await native(godot.path,['--headless','--path',outputPath,'--','--generation-layout-only'],join(reports,'layout.log'),options.signal);
        const line = layoutLogs.split(/\r?\n/).find(value=>value.startsWith('QUANTUM_GENERATED_LAYOUT '));
        if (!line) throw new Error('Quantum native layout proof is missing');
        const layout = JSON.parse(line.slice('QUANTUM_GENERATED_LAYOUT '.length));
        nativeLayout = layout;
        if (layout.seed!==spec.seed || !/^[a-f0-9]{64}$/.test(layout.initial_terrain_sha256)) throw new Error('Quantum native layout seed or terrain fingerprint mismatch');
        const graph = WorldGraphSchema.parse(layout.worldGraph);
        if (graph.seed!==spec.seed || graph.nodes.length!==8 || graph.nodes.some(node=>node.type!=='region')) throw new Error('Quantum native landmarks mismatch');
        writeJson(join(outputPath,'quantum_world.json'),layout);
        writeJson(join(outputPath,'world_graph.json'),graph);
        phase('world_topology','PASSED','Eight authored landmarks connected through native seeded material terrain');
        phase('final_qa','RUNNING','Playing through the generated project with normal controls');
        const captures = join(reports,'gameplay');
        const avi = join(reports,'generated-quantum.avi');
        await native(godot.path,['--path',outputPath,'--position','-10000,-10000',
          ...(options.quantumRecordRuntime?['--write-movie',avi,'--fixed-fps','60','--disable-vsync']:[]),
          '--','--smoke-test','--capture-dir='+captures.replaceAll('\\','/')],join(reports,'gameplay.log'),options.signal);
        const runtime = JSON.parse(readFileSync(join(captures,'playground-result.json'),'utf8'));
        const failures = quantumRuntimeFailures(runtime,{...assembly,seed:spec.seed,terrainSha256:layout.initial_terrain_sha256,entrySha256:digest(join(outputPath,'scripts/GeneratedMines.gd'))});
        validationPassed = failures.length === 0;
        if (!validationPassed) throw new Error('Quantum generated-project gameplay gates failed: '+failures.join(', '));
        if (options.quantumRecordRuntime) {
          const ffmpeg = 'E:/MetroForgeData/Runtime/video-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe';
          const movie = join(reports,'generated-quantum.mp4');
          await native(ffmpeg,['-hide_banner','-loglevel','error','-i',avi,'-an','-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',movie],join(reports,'encode.log'),options.signal);
          await native(ffmpeg,['-hide_banner','-loglevel','error','-i',movie,'-f','null','-'],join(reports,'decode.log'),options.signal);
          writeJson(join(reports,'recording.json'),{path:movie,sha256:digest(movie),decoded:true,fps:60,scope:'Native generated-project gameplay gate, not manual desktop UI interaction'});
        }
        validationLevel = 'RUNTIME_VALIDATED';
        gates.push({gate:'quantum_native_gameplay',passed:true,state:'PASS',message:'Actual generated project: 161 waypoints, both optional branches, every enemy family/boss attack, objectives, living extraction and matching art contacts'});
        writeEngineManifest(outputPath,'godot',{engineVersion:validatedGodotVersion,compiled:true,opened:true,playtested:true,visualCapture:true,gameplayPack:'quantum_project.json',notes:['Native GPU route validated; candidate art, not final production approval']});
      }
    }
    phase('final_qa',validationPassed?'PASSED':'SKIPPED',validationPassed?'Native generated game completed its route':'Runtime validation remains required');
    if (options.skipExport || !validationPassed || !validatedGodot || process.platform !== 'win32') {
      phase('export','SKIPPED',options.skipExport?'Standalone export was explicitly skipped':!validationPassed?'Standalone export requires passing native gameplay':'Standalone Quantum export currently supports Windows');
    } else {
      phase('export','RUNNING','Building and playing the copied Windows release package');
      const exportEnv = godotProcessEnv({...process.env,METROFORGE_GODOT_APPDATA:'E:/MetroForgeData/AppData/Roaming',METROFORGE_GODOT_LOCALAPPDATA:'E:/MetroForgeData/AppData/Local'});
      const version = validatedGodotVersion;
      const versionFolder = version.trim().match(/^(\d+\.\d+(?:\.\d+)?\.[A-Za-z0-9]+)/)?.[1];
      if (!versionFolder || !windowsExportTemplatesInstalled(versionFolder,exportEnv)) throw new Error('Matching Godot Windows export templates are required on E: for '+version.trim());
      const build = join(outputPath,'build/windows');
      mkdirSync(build,{recursive:true});
      const exported = await native(validatedGodot,['--headless','--path',outputPath,'--export-release','Windows Desktop',join(build,'game.exe')],join(reports,'export.log'),options.signal,{env:exportEnv});
      if (!exported.includes('QUANTUM_PACKAGE_VERIFIED ')) throw new Error('Quantum export plugin did not verify its package');
      const portable = join(reports,'portable');
      mkdirSync(portable);
      for (const file of ['game.exe','game.pck','game.console.exe']) {
        if (!existsSync(join(build,file)) || statSync(join(build,file)).size === 0) throw new Error('Quantum Windows export is missing '+file);
        cpSync(join(build,file),join(portable,file));
      }
      const layoutLog = await native(join(portable,'game.console.exe'),['--headless','--','--generation-layout-only'],join(reports,'packaged-layout.log'),options.signal,{env:exportEnv,cwd:portable});
      const layoutLine = layoutLog.split(/\r?\n/).find(line=>line.startsWith('QUANTUM_GENERATED_LAYOUT '));
      if (!layoutLine) throw new Error('Quantum standalone layout proof is missing');
      const packagedLayout = JSON.parse(layoutLine.slice('QUANTUM_GENERATED_LAYOUT '.length));
      if (packagedLayout.seed !== spec.seed || packagedLayout.initial_terrain_sha256 !== nativeLayout.initial_terrain_sha256 || !packagedLayout.package?.standalone || !packagedLayout.package?.release || !packagedLayout.package?.integrity) throw new Error('Quantum standalone terrain or package integrity mismatch');
      const captures = join(reports,'packaged-gameplay');
      await native(join(portable,'game.console.exe'),['--position','-10000,-10000','--','--smoke-test','--capture-dir='+captures.replaceAll('\\','/')],join(reports,'packaged-gameplay.log'),options.signal,{env:exportEnv,cwd:portable});
      const runtime = JSON.parse(readFileSync(join(captures,'playground-result.json'),'utf8'));
      const failures = quantumRuntimeFailures(runtime,{...assembly,seed:spec.seed,terrainSha256:nativeLayout.initial_terrain_sha256,entrySha256:digest(join(outputPath,'scripts/GeneratedMines.gd'))},true);
      if (failures.length || readdirSync(captures).filter(file=>file.endsWith('.png')).length !== 24) throw new Error('Quantum standalone gameplay gates failed: '+failures.join(', '));
      const files = ['game.exe','game.pck','game.console.exe'].map(file=>({path:file,bytes:statSync(join(build,file)).size,sha256:digest(join(build,file))}));
      writeJson(join(reports,'standalone.json'),{passed:true,platform:'Windows x86_64',release:true,files,seed:spec.seed,templateSha256:assembly.templateSha256,configSha256:assembly.configSha256,waypoints:runtime.world.visited_waypoints,hp:runtime.player_hp,portablePath:portable,productionReady:false});
      exportPath = build;
      gates.push({gate:'quantum_standalone_gameplay',passed:true,state:'PASS',message:'Copied release executables/PCK: exact original bytes, all 161 waypoints, both branches, enemies, animations and living extraction'});
      writeEngineManifest(outputPath,'godot',{engineVersion:validatedGodotVersion,compiled:true,opened:true,playtested:true,visualCapture:true,standaloneBuild:true,gameplayPack:'quantum_project.json',notes:['Windows release package verified away from the source project; candidate art, not final production approval']});
      phase('export','PASSED','Windows release package completed the full native gameplay route');
    }
    const status = validationPassed ? 'complete' : 'validation_failed';
    writeJson(join(outputPath,'validation_report.json'),{passed:validationPassed,validationLevel,results:gates,productionReady:false,candidateOnly:true,scope:'Dedicated local Quantum generation and native gameplay; AI content, expanded biomes, final art/audio and full-world saves remain incomplete'});
    db.projects.updateStatus(projectId,status);
    db.jobs.updateJobStatus(job.id,status,currentPhase);
    warnings.push('Quantum is a playable candidate: AI content generation, instrument programming, expanded biomes, final visual polish, audio and durable full-world saves remain pending');
    emit({type:'GenerationCompleted',success:true,validationPassed,validationLevel,exportPath} as GenerationEvent);
    return {success:true,projectSlug:slug,outputPath,jobId:job.id,errors,warnings,phases,validationPassed,validationLevel,projectStatus:status,exportPath};
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const cancelled = error instanceof GenerationCancelledError;
    errors.push(message);
    const stage = job?.stages.find(value=>value.phase===currentPhase);
    if (stage) db?.jobs.updateStageStatus(stage.id,'FAILED',message);
    if (projectId) db?.projects.updateStatus(projectId,cancelled?'cancelled':'validation_failed');
    if (job) db?.jobs.updateJobStatus(job.id,cancelled?'cancelled':'validation_failed',currentPhase);
    phases.push({phase:currentPhase,status:cancelled?'CANCELLED':'FAILED',message});
    options.onPhase?.(currentPhase,cancelled?'CANCELLED':'FAILED',message);
    emit({type:'GenerationFailed',reason:message,phase:currentPhase} as GenerationEvent);
    if (assembled) writeJson(join(outputPath,'validation_report.json'),{passed:false,validationLevel:'FAILED',results:[{gate:'quantum_generation',passed:false,state:'FAIL',message}],productionReady:false});
    return {success:assembled,cancelled,projectSlug:slug,outputPath,jobId:job?.id ?? '',errors,warnings,phases,validationPassed:false,validationLevel:'FAILED',projectStatus:cancelled?'cancelled':'validation_failed'};
  } finally {db?.close();}
}
