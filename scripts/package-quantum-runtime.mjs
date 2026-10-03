import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repo = resolve('.');
const source = join(repo,'prototypes/quantum-divergence');
const output = join(repo,'templates/godot-quantum-divergence');
assert.match(output,/^E:[/\\]/i);
assert.ok(!existsSync(output),'Refusing to overwrite a template; inspect and preserve its prior version first');
const hash = bytes=>createHash('sha256').update(bytes).digest('hex');
const files = new Map();
const pending = ['scripts/GeneratedMines.gd','scenes/GeneratedMines.tscn'];
while (pending.length) {
  const path = pending.pop();
  if (files.has(path)) continue;
  assert.ok(/^(?:scripts\/[A-Za-z]+\.gd|scenes\/[A-Za-z]+\.tscn)$/.test(path));
  const bytes = readFileSync(join(source,path));
  files.set(path,bytes);
  for (const match of bytes.toString('utf8').matchAll(/res:\/\/((?:scripts|scenes)\/[A-Za-z]+\.(?:gd|tscn))/g)) pending.push(match[1]);
}
for (const name of ['mine-kit-candidate-v1','cast-candidate-v2','diver-candidate-v1']) {
  const prefix = 'assets/'+name+'/';
  const manifestBytes = readFileSync(join(source,prefix,'manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.genre,'quantum-divergence');
  assert.equal(manifest.candidateOnly,true);
  assert.equal(manifest.productionApproved,false);
  files.set(prefix+'manifest.json',manifestBytes);
  for (const [file,sha] of Object.entries(manifest.hashes)) {
    assert.ok(/^[a-z0-9/-]+\.(png|json|tscn)$/.test(file));
    const bytes = readFileSync(join(source,prefix,file));
    assert.equal(hash(bytes),sha,'Candidate changed: '+file);
    files.set(prefix+file,bytes);
  }
  for (const file of ['README.md','.gitattributes']) files.set(prefix+file,readFileSync(join(source,prefix,file)));
}
files.set('project.godot',Buffer.from('; Dedicated generated Quantum runtime. Authored candidate artwork, not final approval.\nconfig_version=5\n\n[application]\nconfig/name="Quantum Divergence"\nrun/main_scene="res://scenes/GeneratedMines.tscn"\n\n[display]\nwindow/size/viewport_width=960\nwindow/size/viewport_height=600\nwindow/stretch/mode="canvas_items"\n\n[physics]\ncommon/physics_ticks_per_second=60\n\n[rendering]\nrenderer/rendering_method="gl_compatibility"\nrenderer/rendering_method.mobile="gl_compatibility"\ntextures/default_filters/use_nearest_mipmap_filter=false\n'));
files.set('.gitattributes',Buffer.from('* -text\n*.png binary\n'));
const manifest = {version:1,archetype:'QUANTUM_SIMULATION_ROGUELITE',entryScene:'scenes/GeneratedMines.tscn',candidateOnly:true,productionApproved:false,
  hashes:Object.fromEntries([...files].sort(([a],[b])=>a.localeCompare(b)).map(([path,bytes])=>[path,hash(bytes)]))};
// All dependency and package checks precede publication; raw art/tool/test/cache folders stay out.
for (const [path,bytes] of files) {
  mkdirSync(resolve(output,path,'..'),{recursive:true});
  writeFileSync(join(output,path),bytes);
}
writeFileSync(join(output,'quantum-template.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({output,files:files.size,entryScene:manifest.entryScene,productionApproved:false}));
