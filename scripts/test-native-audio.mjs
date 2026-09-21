import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { spawnCapturedSync } from '../packages/qa/dist/process-capture.js';
const source = process.argv[2];
const godot = process.env.GODOT_EXECUTABLE;
assert.ok(source && godot, 'Provide a generated game fixture and GODOT_EXECUTABLE');
const project = mkdtempSync(join(tmpdir(), 'metroforge-native-audio-'));
cpSync(source, project, { recursive: true, filter: path => !['qa', '.git'].includes(basename(path)) });
for (const script of ['core/AudioManager.gd','UI/DialogueOverlay.gd']) {
  cpSync(new URL(`../templates/godot-metroidvania/scripts/${script}`, import.meta.url), join(project,'scripts',script));
}
const results = [];
for (const test of ['music-loop-runtime','dialogue-voice-runtime','audio-bus-runtime']) {
  cpSync(new URL(`./fixtures/${test}.gd`, import.meta.url), join(project,`${test}.gd`));
  writeFileSync(join(project,`${test}.tscn`), `[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://${test}.gd" id="1"]\n[node name="AudioTest" type="Node"]\nscript = ExtResource("1")\n`);
  const result = spawnCapturedSync(godot,['--headless','--path',project,'--audio-driver','Dummy',`res://${test}.tscn`,'--quit-after','3000'],{encoding:'utf8',windowsHide:true,timeout:45000});
  const output = result.stdout + result.stderr;
  writeFileSync(join(project,`${test}.log`),output);
  const passed = result.status === 0 && /^PASS:/m.test(result.stdout) && !/^FAIL:|SCRIPT ERROR|Assertion failed|Parse Error/m.test(output);
  results.push({test,passed,exitCode:result.status,error:result.error?.message,diagnostics:output.split(/\r?\n/).filter(line=>/^ERROR:|WARNING:/.test(line))});
}
const report = {project,scope:'Native playback state with dummy audio driver; does not validate audible mix',passed:results.every(result=>result.passed),results};
writeFileSync(join(project,'audio-results.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
process.exitCode = report.passed ? 0 : 1;
