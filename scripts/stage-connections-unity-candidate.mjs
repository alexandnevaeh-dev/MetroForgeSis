/** Preserve the tested desktop package; bind its five Unity sources to the native build. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cpSync,existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join,relative} from 'node:path';
const repo='E:/Metroforge/MetroForge-Publish';
const base='E:/MetroForgeData/Releases/MetroForge-connections-20261003-v2';
const output='E:/MetroForgeData/Releases/MetroForge-connections-unity-20261003-v2';
assert.ok(!existsSync(output),'Preserve existing candidates');
const publication=JSON.parse(readFileSync(join(repo,'reports/game-tests/20261003-unity-publication/upload.json'),'utf8'));
assert.equal(publication.status,'uploaded');
const route=JSON.parse(readFileSync(join(repo,'reports/game-tests/20261003-unity-route/run-1791068444284/proof.json'),'utf8'));
assert.equal(route.passed,true);
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const before=[];
function collect(root,dir){for(const entry of readdirSync(dir,{withFileTypes:true})){
 const path=join(dir,entry.name);
 assert.ok(!entry.isSymbolicLink(),'Candidate must not depend on external links');
 assert.ok(!/^(UserData|credentials\.enc.*|\.env.*)$/i.test(entry.name),'Do not copy private data');
 if(entry.isDirectory())collect(root,path);
 else before.push({path:relative(root,path).replaceAll('\\','/'),sha256:hash(path)});
}}
collect(base,base);
cpSync(base,output,{recursive:true});
const updated=[];
for(const name of ['GameBootstrap','AcceptanceDriver','PlayerActor','EnemyActor','BossController']){
 const source='templates/unity-metroidvania/Assets/Scripts/'+name+'.cs';
 assert.equal(hash(join(repo,source)),route.sources[source]);
 const target='resources/metroforge/'+source;
 if(['PlayerActor','EnemyActor','BossController'].includes(name))assert.equal(readFileSync(join(base,target),'utf8').replaceAll('\r\n','\n'),readFileSync(join(repo,source),'utf8').replaceAll('\r\n','\n'),'Only line endings may differ for unchanged actor logic');
 cpSync(join(repo,source),join(output,target));updated.push(target);
}
for(const entry of before)if(!updated.includes(entry.path))assert.equal(hash(join(output,entry.path)),entry.sha256,'Copied package changed '+entry.path);
for(const [source,sha256] of Object.entries(route.sources))assert.equal(hash(join(output,'resources/metroforge',source)),sha256,'Packaged Unity source does not match native campaign');
const evidence=join(output,'Validation/Unity');mkdirSync(evidence,{recursive:true});
cpSync(join(publication.sourceTree,'docs/verification/unity-route-20261003'),evidence,{recursive:true});
writeFileSync(join(output,'README.md'),[
 '# MetroForge desktop candidate — API Keys and Unity export',
 'Run Launch-MetroForge.cmd. User data, encrypted keys, generated games and caches stay on E:. Local-Runtime.cmd supplies the installed engine paths.',
 'Open API Keys in the top bar. Save a provider key, then check Providers for access. Saving does not enable a disabled provider; use Settings > Runtime. Windows encrypts saved keys for your account. Existing environment keys remain supported. Optional .env configuration belongs in UserData/data/.env; never share keys or credentials.enc.',
 'The desktop package is copied byte for byte from the verified connections candidate. Its Unity export template contains the source-bound native campaign fix. All five native runtime sources match the compiled fixture exactly; three actor files differ from the previous package only in line endings. Validation/Unity contains the native campaign, geometry and controlled-gate evidence.',
 'This is a development candidate. Final art/animations, optional-room coverage, every ability activation, NPCs, FPS and native Unreal gameplay remain incomplete. Microsoft compiler/SDK installation requires the prepared administrator step. Top-down, side-view and Quantum assets stay separate.',
].join('\n\n')+'\n');
const binding={base,output,uploadedCommit:publication.commit,baseFiles:before.length,unchangedDesktopPackage:true,updated,lineEndingsOnly:['PlayerActor','EnemyActor','BossController'],unityRuntimeSources:route.sources,nativeCampaign:route.output,productionReady:false};
writeFileSync(join(output,'candidate-binding.json'),JSON.stringify(binding,null,2));
const report=join(repo,'reports/game-tests/20261003-connections-unity');mkdirSync(report,{recursive:true});
writeFileSync(join(report,'candidate.json'),JSON.stringify(binding,null,2));
console.log(JSON.stringify(binding));
