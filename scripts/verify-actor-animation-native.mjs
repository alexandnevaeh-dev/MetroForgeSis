import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
const base=resolve(process.argv[2]||'E:/MetroForgeData/TestArtifacts/actor-animation-20261004/candidate'),project=join(base,'games/stormglass-castle');assert.match(base,/^E:[\\/]/i);
const env={...process.env,TEMP:join(base,'temp'),TMP:join(base,'temp'),APPDATA:join(base,'appdata'),LOCALAPPDATA:join(base,'localappdata'),METROFORGE_GALLERY_CAPTURE:'1',METROFORGE_CAPTURE:'1',METROFORGE_CAPTURE_STRATEGY:'windowed_gpu'};
for(const key of ['TEMP','APPDATA','LOCALAPPDATA'])mkdirSync(env[key],{recursive:true});
const godot='E:/MetroForgeData/Godot/4.6/Godot_v4.6-stable_win64_console.exe';
function run(name,scene,timeout){const result=spawnSync(godot,['--path',project,'--rendering-driver','opengl3','--audio-driver','Dummy','--position','-10000,-10000','--resolution','1280x720',scene],{env,encoding:'utf8',windowsHide:true,timeout,maxBuffer:30*1024*1024});const log=(result.stdout??'')+(result.stderr??'');writeFileSync(join(base,name+'.log'),log);assert.equal(result.status,0,name+': '+String(result.error??log.slice(-1500)));assert.ok(!/Parse Error|SCRIPT ERROR/.test(log),name+' script errors');assert.match(log,/Using Device: NVIDIA - NVIDIA GeForce RTX 5060 Laptop GPU/);return log}
run('gallery','res://scenes/test/CharacterAnimationGallery.tscn',45000);
const gallery=JSON.parse(readFileSync(join(project,'qa/actor-animation/gallery/proof.json'),'utf8'));assert.ok(gallery.passed&&gallery.checks.every(row=>row.passed));assert.equal(gallery.runFrames.length,24);
const log=run('runtime-smoke','res://scenes/test/RuntimeSmokeTest.tscn',120000),text=log.split('SMOKE_TEST_RESULTS_BEGIN').at(-1).split('SMOKE_TEST_RESULTS_END')[0];
const checks=[...text.matchAll(/^(PASS|FAIL|SOFT_FAIL):\s*(.+)$/gm)].map(match=>({label:match[2].trim(),passed:match[1]==='PASS'}));assert.equal(checks.length,456);assert.ok(checks.every(row=>row.passed));
writeFileSync(join(base,'native-summary.json'),JSON.stringify({passed:true,galleryChecks:gallery.checks.length,runtimeSmokeChecks:checks.length,checks,scope:'Real offscreen NVIDIA authored-clip gallery plus existing functional/capture smoke suite. Gallery controllers are frozen; smoke later rooms are force-loaded. Not full input-driven game traversal or final visual approval.'},null,2));console.log(JSON.stringify({passed:true,gallery:gallery.checks.length,smoke:checks.length,base}));
