import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const repo = resolve('.');
const project = join(repo, 'prototypes/quantum-divergence');
const candidate = join(project, 'assets/cast-candidate-v2');
const reports = join(repo, 'reports/game-tests/20261001-quantum-divergence');
const output = join(reports, 'cast-animation-' + Date.now());
assert.match(output, /^E:[/\\]/i);
assert.ok(!existsSync(output));
mkdirSync(output, { recursive: true });
const record = process.argv.includes('--record');
const godot = 'E:/MetroForgeData/Godot/4.6/Godot_v4.6-stable_win64_console.exe';
const ffmpeg = 'E:/MetroForgeData/Runtime/video-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe';
const env = { ...process.env, TEMP: 'E:/MetroForgeData/Temp', TMP: 'E:/MetroForgeData/Temp',
  APPDATA: 'E:/MetroForgeData/AppData/QuantumGodot', LOCALAPPDATA: 'E:/MetroForgeData/AppData/QuantumGodotLocal' };
const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const paths = ['scripts/MaterialContact.gd', 'scripts/PlayerSimulation.gd', 'scripts/EnemySimulation.gd',
  'scripts/MicrocellGrid.gd', 'scripts/InstrumentSimulation.gd', 'scripts/SpriteClipPlayer.gd',
  'scripts/EnemyClipBinding.gd', 'scripts/CastAnimationReview.gd', 'tools/QuantumActorBaker.gd',
  'tools/DiverRigBaker.gd', 'tests/EnemyClipBindingTests.gd', 'tests/EnemyTests.gd',
  'tests/ContactTests.gd', 'tests/SpriteClipTests.gd', 'scenes/CastAnimationReview.tscn'];
const sources = paths.map(path => ({ path:'prototypes/quantum-divergence/'+path, sha256:digest(join(project,path)) }));
for (const path of ['scripts/package-quantum-cast.py', 'scripts/verify-quantum-cast.mjs']) sources.push({ path, sha256:digest(join(repo,path)) });
const manifestSha256 = digest(join(candidate,'manifest.json'));
const manifest = JSON.parse(readFileSync(join(candidate,'manifest.json'),'utf8'));
assert.equal(manifest.frameCount,231);
assert.equal(manifest.distinctImages,203);
for (const [path, sha] of Object.entries(manifest.hashes)) assert.equal(digest(join(candidate,path)),sha);
const diverManifestSha256 = digest(join(project,'assets/diver-candidate-v1/manifest.json'));
const diverIdleSha256 = digest(join(project,'assets/diver-candidate-v1/idle.png'));
function run(executable, args, name, timeout = 90000) {
  const result = spawnSync(executable,args,{env,encoding:'utf8',windowsHide:true,timeout,maxBuffer:8*1024*1024});
  const logs = String(result.stdout||'')+String(result.stderr||'');
  writeFileSync(join(output,name+'.log'),logs+(result.error?'\n'+result.error:''));
  assert.ifError(result.error);
  assert.equal(result.status,0,name+' failed; evidence: '+output);
  assert.ok(!/SCRIPT ERROR:|Parse Error:|Assertion failed|CAST_REVIEW_TIMEOUT/.test(logs));
  return logs;
}
const suites = [];
for (const [script,prefix,expected] of [['EnemyClipBindingTests.gd','QUANTUM_ENEMY_BINDING_RESULTS ',23],
  ['EnemyTests.gd','QUANTUM_ENEMY_RESULTS ',43],['ContactTests.gd','QUANTUM_CONTACT_RESULTS ',22],
  ['SpriteClipTests.gd','QUANTUM_SPRITE_CLIP_RESULTS ',18]]) {
  const logs = run(godot,['--headless','--path',project,'--script','res://tests/'+script],script);
  const line = logs.split(/\r?\n/).find(value=>value.startsWith(prefix));
  assert.ok(line,'Missing native suite result: '+script);
  const result = JSON.parse(line.slice(prefix.length));
  assert.equal(result.failed,0);
  assert.equal(result.passed,expected);
  suites.push({script,...result});
  console.log(JSON.stringify({suite:script,passed:result.passed}));
}
const avi = join(output,'native-cast-animation.avi');
const mp4 = join(output,'quantum-cast-animation.mp4');
const native = join(output,'native');
run(godot,['--path',project,'--position','-10000,-10000',
  ...(record?['--write-movie',avi,'--fixed-fps','60','--disable-vsync']:[]),
  'res://scenes/CastAnimationReview.tscn','--','--candidate='+candidate.replaceAll('\\','/'),
  '--capture-dir='+native.replaceAll('\\','/')],'render',180000);
const runtime = JSON.parse(readFileSync(join(native,'cast-result.json'),'utf8'));
assert.equal(runtime.ok,true);
assert.equal(runtime.ticks,2472);
assert.equal(Object.keys(runtime.checks).length,21);
for (const [key,value] of Object.entries(runtime.checks)) assert.equal(value,true,key);
assert.equal(runtime.floorChecks,1854);
assert.equal(runtime.floorFailures,0);
assert.match(runtime.renderDevice,/NVIDIA/i);
assert.equal(runtime.manifestSha256,manifestSha256);
assert.equal(runtime.sourceScriptSha256,digest(join(project,'scripts/CastAnimationReview.gd')));
assert.equal(runtime.captures.length,14);
for (const path of runtime.captures) assert.ok(existsSync(path));
let video = null;
if (record) {
  run(ffmpeg,['-hide_banner','-loglevel','error','-i',avi,'-an','-c:v','libx264','-preset','fast',
    '-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',mp4],'encode',60000);
  run(ffmpeg,['-hide_banner','-loglevel','error','-i',mp4,'-f','null','-'],'decode',60000);
  video = {path:mp4,sha256:digest(mp4),fps:60,decoded:true};
}
for (const source of sources) assert.equal(digest(join(repo,source.path)),source.sha256,'Source changed during review');
assert.equal(digest(join(candidate,'manifest.json')),manifestSha256);
assert.equal(digest(join(project,'assets/diver-candidate-v1/manifest.json')),diverManifestSha256);
assert.equal(digest(join(project,'assets/diver-candidate-v1/idle.png')),diverIdleSha256);
const result = {output,candidate,manifestSha256,sources,suites,runtime,video,diverManifestSha256,diverIdleSha256,
  frameCount:manifest.frameCount,distinctImages:manifest.distinctImages,productionApproved:false,completeCast:false,scope:runtime.scope};
writeFileSync(join(output,'verification.json'),JSON.stringify(result,null,2));
writeFileSync(join(reports,'cast-animation-latest.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({output,headlessChecks:suites.reduce((sum,value)=>sum+value.passed,0),nativeChecks:21,
  floorChecks:1854,floorFailures:0,video:video?.path,productionApproved:false}));
