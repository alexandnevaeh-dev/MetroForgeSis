import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { GodotProjectAssembler } from '../packages/godot/dist/index.js';
import { loadProjectContext } from '../packages/generation/dist/project-loader.js';
import { spawnCapturedSync } from '../packages/qa/dist/process-capture.js';
const source = process.argv[2];
const godot = process.env.GODOT_EXECUTABLE;
const audioDriver = process.env.METROFORGE_TEST_AUDIO_DRIVER || 'Dummy';
assert.ok(source && godot, 'Provide generated project and GODOT_EXECUTABLE');
const project = mkdtempSync(join(tmpdir(), 'metroforge-native-recompiled-'));
cpSync(source, project, { recursive:true, filter: path => !['qa','.git'].includes(basename(path)) });
cpSync(new URL('../templates/godot-metroidvania/scripts/core/AudioManager.gd', import.meta.url), join(project, 'scripts/core/AudioManager.gd'));
cpSync(new URL('../templates/godot-metroidvania/scripts/UI/DialogueOverlay.gd', import.meta.url), join(project, 'scripts/UI/DialogueOverlay.gd'));
cpSync(new URL('../templates/godot-metroidvania/scripts/world/WeakFloor.gd', import.meta.url), join(project, 'scripts/world/WeakFloor.gd'));
cpSync(new URL('../templates/godot-metroidvania/scripts/test/RuntimeSmokeTest.gd', import.meta.url), join(project, 'scripts/test/RuntimeSmokeTest.gd'));
const context = loadProjectContext(project);
const mechanicsFixture = process.argv.includes('--mechanics-fixture');
if (mechanicsFixture) {
  assert.ok(context.roomIds.length >= 8, 'Mechanics fixture requires at least eight rooms');
  const [start, , , , , , floorRoom, destination] = context.roomIds;
  context.worldGraph.edges.push(
    {id:'test_ground_slam',from:floorRoom,to:destination,transition:'down',requirements:['ground_slam'],optional:true,bidirectional:false},
    {id:'test_shortcut',from:start,to:destination,transition:'left',requirements:[],optional:true,bidirectional:false},
  );
  for (const file of ['world_graph.json','data/world/world_graph.json']) {
    writeFileSync(join(project,file),JSON.stringify(context.worldGraph,null,2));
  }
}

const compiled = new GodotProjectAssembler().recompileRooms({ outputDir:project, gameDna:context.gameDna, worldGraph:context.worldGraph, gameContent:context.gameContent, roomIds:context.roomIds, targetRoomIds:context.roomIds });
assert.equal(compiled.success, true, compiled.errors.join('\n'));
assert.equal(compiled.recompiled.length, context.roomIds.length);
const result = spawnCapturedSync(godot, ['--path',project,'--audio-driver',audioDriver,'res://scenes/test/RuntimeSmokeTest.tscn','--quit-after','3600'], { encoding:'utf8',windowsHide:true,timeout:120000,env:{...process.env,METROFORGE_HUD_MODE:'PLAYER',METROFORGE_CAPTURE:'1'} });
const output = result.stdout + result.stderr;
writeFileSync(join(project,'native-recompiled.log'),output);
const counts = Object.fromEntries(['PASS','FAIL','SOFT_FAIL'].map(key => [key,(output.match(new RegExp(`^${key}:`,'gm')) ?? []).length]));
const diagnostics = output.split(/\r?\n/).filter(line => /^(ERROR:|WARNING:|SCRIPT ERROR|Parse Error)/.test(line));
const scriptErrors = diagnostics.filter(line => /SCRIPT ERROR|Parse Error/.test(line));
const report = {project, audioDriver, mechanicsFixture, rooms:compiled.recompiled.length, exitCode:result.status, error:result.error?.message, signal:result.signal, diagnostics, counts};
writeFileSync(join(project,'native-recompiled.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
assert.equal(result.status,0);
assert.equal(result.error,undefined);
assert.equal(scriptErrors.length,0,scriptErrors.join('\n'));
assert.match(output,/SMOKE_TEST_RESULTS_END/);
assert.equal(counts.FAIL,0);
assert.ok(counts.PASS > 0);

if (mechanicsFixture) {
  for (const check of ['breakable_wall_breaks_with_ability','breakable_wall_stays_broken_after_room_reentry','breakable_wall_stays_broken_after_save_load','shortcut_leads_to_declared_room']) {
    assert.ok(output.includes(`PASS: ${check}`), `Missing native mechanics evidence: ${check}`);
  }
}

console.log('PASS: all rooms recompiled and native gameplay assertions completed; soft failures remain separately reported');
