/** Carry verified publication evidence back without replacing divergent working documentation. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpSync,existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {basename,join,resolve} from 'node:path';
const canonical=resolve('.');
const report=join(canonical,'reports/game-tests/20261003-quantum-programming-publication');
const receipt=JSON.parse(readFileSync(join(report,'upload.json'),'utf8'));
const review=JSON.parse(readFileSync(join(report,'latest.json'),'utf8'));
assert.equal(receipt.status,'uploaded');
assert.equal(receipt.sourceTree,review.tree);
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const normalize=bytes=>bytes.toString('utf8').replaceAll('\r\n','\n');
assert.equal(sha(join(canonical,'.git/index')),receipt.originalIndexSha256);
for(const [file,hash] of Object.entries(review.hashes)) assert.equal(sha(join(canonical,file)),hash,'Canonical feature drift: '+file);
const backup=join('E:/MetroForgeData/Backups/20261003-quantum-programming','handoff-'+Date.now());
assert.match(backup,/^E:[/\\]/i);
assert.ok(!existsSync(backup));
mkdirSync(backup,{recursive:true});
const docs=['docs/development/QUANTUM_GENERATION.md','docs/development/QUANTUM_DIVERGENCE.md'];
const record={commit:receipt.commit,backup,canonical,docs:[],evidence:[],indexPreserved:true,remaining:['Full-world versioned suspension','Persistent programmed loadouts and profile knowledge','Final art/audio and expanded biomes','AI-directed Quantum content','Quantum Unity/Unreal ports']};
for(const file of receipt.files.filter(file=>file.path.startsWith('docs/verification/quantum-programming-20261003/'))) {
 const origin=join(receipt.sourceTree,file.path),target=join(canonical,file.path);
 assert.equal(sha(origin),file.sha256);
 if(existsSync(target)) assert.equal(sha(target),file.sha256,'Existing evidence differs: '+file.path);
 mkdirSync(join(target,'..'),{recursive:true});
 cpSync(origin,target);assert.equal(sha(target),file.sha256);
 record.evidence.push(file);
}
for(const file of docs) {
 const target=join(canonical,file),published=join(receipt.sourceTree,file),before=normalize(execFileSync('git',['--git-dir='+review.store,'show',receipt.parent+':'+file],{windowsHide:true}));
 const current=normalize(readFileSync(target)),next=normalize(readFileSync(published));
 cpSync(target,join(backup,basename(file)));
 let merged=next;
 if(current!==before&&current!==next) {
  const prefix=join(backup,basename(file));
  for(const [suffix,text] of [['canonical',current],['parent',before],['published',next]]) writeFileSync(prefix+'.'+suffix,text);
  // The canonical handoff has fuller historical receipts. Retain that history and
  // apply only the published feature's current checklist edits and new section.
  merged=current;
  const replace=(before,after)=>{assert.equal(merged.split(before).length,2,'Handoff anchor changed: '+before);merged=merged.replace(before,after);};
  let heading;
  if(file.endsWith('QUANTUM_GENERATION.md')) {
   replace('programming UI, audio, durable full-world saves','expanded compiler/editor workflows, audio, durable full-world saves');
   heading='\n## Station programming\n';
  } else {
   replace('- [ ] Station compiler/preview and discoverable entanglement/tunneling modules.','- [x] Station compiler/preview and discoverable entanglement/tunneling modules in the connected-world candidate.');
   replace('- [ ] Station programming preview and chunk-scale saves.','- [x] Station programming preview.\n- [ ] Chunk-scale saves and durable programmed loadouts.');
   replace('- [ ] Add genre schemas, capability registry, own assembler/template and app UI only when the runtime exists.','- [x] Add genre schemas, capability registry, own assembler/template and app UI only when the runtime exists.');
   replace('- [ ] Generate through MetroForge\'s real app UI, play through all three objectives, show gameplay/animation captures and retain failures honestly.','- [x] Generate through MetroForge\'s real app UI, play through all three objectives, show gameplay/animation captures and retain failures honestly.');
   heading='\n## Station programming milestone, 2026-10-03\n';
  }
  assert.equal(next.split(heading).length,2);
  assert.ok(!merged.includes(heading));
  merged+=next.slice(next.indexOf(heading));
 }
 assert.ok(!/^(?:<<<<<<<|=======|>>>>>>>)/m.test(merged));
 writeFileSync(target,merged);
 record.docs.push({file,sha256:sha(target),mergedCanonical:current!==before&&current!==next});
}
const epic=join(canonical,'docs/development/EPIC_WORLD_PROGRESS.md');
cpSync(epic,join(backup,basename(epic)));
let text=readFileSync(epic,'utf8');
assert.ok(!text.includes(receipt.commit));
text+='\nThe Quantum station programming update was confirmed on GitHub at `'+receipt.commit+'`. Two instruments now have a native paused four-slot compiler, real previews and discovered Entanglement/Tunneling behavior. The exact isolated snapshot passed 35 regressions, 259 fresh native behavior checks, 21 native GUI checks, 35 backend checks, 25 real-app creation checks and 22 workbench checks inside the exported release. Source and copied release games completed 161 waypoints with 76 HP; duplicate-name rejection preserved all 479 files. See `../verification/quantum-programming-20261003/README.md` and `QUANTUM_GENERATION.md`. Recipes/profile knowledge currently last for the connected-world run; full-world saves, persistent programmed loadouts, final art/audio, expanded biomes and other engine ports remain pending. Earlier synchronous WorldTests timeouts and external-release-probe launch failures remain retained on E: and are not counted as passes. All three genre sets remain separate.\n';
writeFileSync(epic,text);
record.docs.push({file:'docs/development/EPIC_WORLD_PROGRESS.md',sha256:sha(epic),appended:true});
assert.equal(sha(join(canonical,'.git/index')),receipt.originalIndexSha256);
writeFileSync(join(report,'handoff.json'),JSON.stringify(record,null,2));
console.log(JSON.stringify({commit:receipt.commit,evidence:record.evidence.length,docs:record.docs.length,indexPreserved:true,backup}));
