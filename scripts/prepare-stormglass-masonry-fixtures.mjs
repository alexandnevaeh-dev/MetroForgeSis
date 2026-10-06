/** Separate E: fixtures. Preserve original games, native builds, saves and caches. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cpSync,existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
const repo=resolve('.');
const base='E:/MetroForgeData/TestArtifacts/engine-gpu-20261003';
const stamp=Date.now();
const unity=join(base,'stormglass-unity-masonry-'+stamp);
const godot=join(base,'stormglass-godot-masonry-'+stamp);
const unityOrigin=join(base,'stormglass-unity-route-1791063077338');
const godotOrigin=join(repo,'GeneratedGames/test-games/metroidvania/current');
const art='assets/architecture/stormglass/masonry-fill-v1.png';
const asset=join(repo,'templates/godot-metroidvania',art);
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
for(const output of [unity,godot]){assert.match(output,/^E:[/\\]/i);assert.ok(!existsSync(output));mkdirSync(output,{recursive:true});}
for(const folder of ['Assets','Packages','ProjectSettings'])cpSync(join(unityOrigin,folder),join(unity,folder),{recursive:true});
for(const name of ['GameBootstrap','CastleTerrainPresentation'])cpSync(join(repo,'templates/unity-metroidvania/Assets/Scripts',name+'.cs'),join(unity,'Assets/Scripts',name+'.cs'));
mkdirSync(join(unity,'Assets/StreamingAssets',art,'..'),{recursive:true});
cpSync(asset,join(unity,'Assets/StreamingAssets',art));
cpSync(godotOrigin,godot,{recursive:true,filter:path=>!/[\\/](\.godot|qa|\.qa|checkpoints|isolated-user-data)([\\/]|$)/.test(path)});
cpSync(join(repo,'templates/godot-metroidvania/scripts/world/RoomTileMap.gd'),join(godot,'scripts/world/RoomTileMap.gd'));
mkdirSync(join(godot,art,'..'),{recursive:true});cpSync(asset,join(godot,art));
const proof={unity,godot,unityOrigin,godotOrigin,art,artSha256:hash(asset),scope:'Existing separate Stormglass data/assets cloned; only terrain presentation code and the new opaque generated material changed. Original fixtures/builds/games/saves preserved.',productionReady:false};
const report=join(repo,'reports/game-tests/20261003-stormglass-masonry');mkdirSync(report,{recursive:true});
writeFileSync(join(report,'fixtures.json'),JSON.stringify(proof,null,2));
console.log(JSON.stringify(proof));
