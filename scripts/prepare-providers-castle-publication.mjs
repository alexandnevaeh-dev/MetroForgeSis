/** Review only selected changes against the confirmed publication parent. Never change the canonical index. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpSync,existsSync,mkdirSync,readFileSync,readdirSync,realpathSync,symlinkSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
const source='E:/Metroforge/MetroForge-Publish';
const tree='E:/MetroForgeData/GitHubUpload/20261003/providers-castle-review';
const parent='c68ba7888d56a0b829afd6991347b9108de8ff70';
const files=[
 'README.md','DESIGN.md','UX-CONTRACT.md',
 'apps/desktop/electron/credentials.ts','apps/desktop/electron/credentials.test.ts','apps/desktop/electron/handlers.ts',
 'apps/desktop/src/studio/ApiKeysScreen.tsx','apps/desktop/src/studio/SettingsScreen.tsx','apps/desktop/src/styles.css',
 'packages/ai/src/providers/compatible-chat.ts','packages/ai/src/providers/compatible-chat.test.ts',
 'packages/ai/src/bootstrap.ts','packages/ai/src/bootstrap.test.ts','packages/ai/src/types.ts',
 'packages/shared/src/provider-toggles.ts','packages/shared/src/provider-connections.test.ts',
 'packages/database/src/repositories/settings.ts','packages/generation/src/pipeline.ts',
 'packages/godot/src/room-assembler.ts','packages/godot/src/room-assembler.test.ts','packages/unity/src/assembler.ts',
 'templates/godot-metroidvania/scripts/world/RoomTileMap.gd','templates/godot-metroidvania/scripts/world/StormglassDecor.gd',
 'templates/godot-metroidvania/scripts/player/CameraDirector.gd','templates/godot-metroidvania/scripts/test/RuntimeSmokeTest.gd',
 'templates/godot-metroidvania/assets/architecture/stormglass/masonry-fill-v1.png',
 'templates/unity-metroidvania/Assets/Scripts/GameBootstrap.cs','templates/unity-metroidvania/Assets/Scripts/CastleTerrainPresentation.cs',
 'scripts/refresh-test-game.mjs','scripts/verify-connections-ui.mjs','scripts/prepare-stormglass-masonry-fixtures.mjs',
 'scripts/review-stormglass-terrain.ps1','scripts/probe-unity-stormglass-route.mjs','tests/unity/TerrainMaterialReview.cs',
 'scripts/prepare-providers-castle-publication.mjs',
];
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
assert.ok(existsSync(join(tree,'parent.tar')));
assert.ok(!existsSync(join(tree,'providers-review.json')),'Preserve completed review');
for(const file of files){assert.ok(!file.includes('..'));mkdirSync(dirname(join(tree,file)),{recursive:true});cpSync(join(source,file),join(tree,file));}
// Keep unrelated in-progress cancellation/runtime changes out of this publication.
const pipeline='packages/generation/src/pipeline.ts';
let projected=execFileSync('git',['--git-dir=E:/MetroForgeData/GitHubUpload/20261003/unity-upload-objectdb','show',parent+':'+pipeline],{encoding:'utf8',windowsHide:true});
const declaration='  providerEnabled?: Record<string, boolean>;';
const bootstrap='        providerEnabled: options.providerEnabled,';
assert.ok(projected.includes(declaration) && projected.includes(bootstrap));
projected=projected.replace(declaration,declaration+'\n  textConnectionSettings?: Record<string,string>;').replace(bootstrap,bootstrap+'\n        connectionSettings: options.textConnectionSettings,');
writeFileSync(join(tree,pipeline),projected);
const workspaces=[...readdirSync(join(tree,'packages')).map(name=>'packages/'+name),'apps/cli','apps/desktop'].filter(path=>existsSync(join(tree,path,'package.json')));
const names=Object.fromEntries(workspaces.map(path=>[JSON.parse(readFileSync(join(tree,path,'package.json'),'utf8')).name,join(tree,path)]));
function dependencies(path){
 const origin=join(source,path,'node_modules'),target=join(tree,path,'node_modules');if(!existsSync(origin))return;
 mkdirSync(target,{recursive:true});
 for(const entry of readdirSync(origin,{withFileTypes:true})){
  if(['.bin','.vite','@metroforge'].includes(entry.name))continue;
  if(entry.name.startsWith('@')){mkdirSync(join(target,entry.name),{recursive:true});for(const name of readdirSync(join(origin,entry.name)))symlinkSync(realpathSync(join(origin,entry.name,name)),join(target,entry.name,name),'junction');}
  else symlinkSync(realpathSync(join(origin,entry.name)),join(target,entry.name),'junction');
 }
 mkdirSync(join(target,'@metroforge'),{recursive:true});for(const [name,directory] of Object.entries(names))symlinkSync(directory,join(target,name),'junction');
}
dependencies('');for(const path of workspaces)dependencies(path);
const review={source,tree,parent,files,hashes:Object.fromEntries(files.map(file=>[file,hash(join(tree,file))])),sourceHashes:Object.fromEntries(files.map(file=>[file,hash(join(source,file))])),projectedFiles:[pipeline],originalIndexSha256:hash(join(source,'.git/index')),status:'ready-for-isolated-validation',productionReady:false};
writeFileSync(join(tree,'providers-review.json'),JSON.stringify(review,null,2));
mkdirSync(join(source,'reports/game-tests/20261003-providers-publication'),{recursive:true});
writeFileSync(join(source,'reports/game-tests/20261003-providers-publication/review.json'),JSON.stringify(review,null,2));
console.log(JSON.stringify({tree,files:files.length,indexPreserved:true}));
