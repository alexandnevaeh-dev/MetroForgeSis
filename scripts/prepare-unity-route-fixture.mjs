/** Clone source/configuration only, preserving the previous licensed-editor fixture and its QA. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cpSync,existsSync,mkdirSync,readFileSync,readdirSync,statfsSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
const repo=resolve('.');
const origin='E:/MetroForgeData/TestArtifacts/engine-gpu-20261001/stormglass-unity';
const output='E:/MetroForgeData/TestArtifacts/engine-gpu-20261003/stormglass-unity-route-'+Date.now();
assert.ok(!existsSync(output));assert.match(output,/^E:[/\\]/i);
const space=statfsSync(origin);assert.ok(space.bavail*space.bsize>4*1024*1024*1024);
mkdirSync(output,{recursive:true});
for(const directory of ['Assets','Packages','ProjectSettings'])cpSync(join(origin,directory),join(output,directory),{recursive:true});
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const changed='Assets/Scripts/AcceptanceDriver.cs';
assert.equal(sha(join(origin,changed)),sha(join('E:/MetroForgeData/Backups/20261003-unity-route','AcceptanceDriver.cs')));
cpSync(join(repo,'templates/unity-metroidvania',changed),join(output,changed));
const files={};
function scan(relative){for(const entry of readdirSync(join(output,relative),{withFileTypes:true})){assert.ok(!entry.isSymbolicLink());const file=relative+'/'+entry.name;if(entry.isDirectory())scan(file);else files[file]=sha(join(output,file));}}
for(const directory of ['Assets','Packages','ProjectSettings'])scan(directory);
const previous={};
for(const file of Object.keys(files))previous[file]=sha(join(origin,file));
const changes=Object.keys(files).filter(file=>files[file]!==previous[file]);assert.deepEqual(changes,[changed]);
const proof={origin,output,changes,hashes:files,previous,scope:'Identical staged Unity game data/assets/settings; only acceptance-driver forward navigation is changed. No generated Library or previous builds/QA were copied.'};
writeFileSync(join(output,'route-fixture.json'),JSON.stringify(proof,null,2));
const report=join(repo,'reports/game-tests/20261003-unity-route');mkdirSync(report,{recursive:true});
writeFileSync(join(report,'fixture-latest.json'),JSON.stringify(proof,null,2));
console.log(JSON.stringify({output,files:Object.keys(files).length,changes}));
