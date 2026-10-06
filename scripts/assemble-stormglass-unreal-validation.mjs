/** Assemble the separate Stormglass game for actual UE C++ validation. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {UnrealProjectAssembler} from '../packages/unreal/dist/assembler.js';
const repo=resolve('.');
const sourceFlag=process.argv.indexOf('--source');
if(sourceFlag>=0&&(!process.argv[sourceFlag+1]||process.argv[sourceFlag+1].startsWith('--')))
 throw new Error('--source requires a side-view candidate project path.');
const source=resolve(sourceFlag>=0?process.argv[sourceFlag+1]:'GeneratedGames/test-games/metroidvania/current');
assert.match(source,/^E:[/\\]/i,'Validation source must stay on E:');
const output=resolve(process.argv[2]||'E:/MetroForgeData/TestArtifacts/engine-gpu-20261003/stormglass-unreal-'+Date.now());
assert.match(output,/^E:[/\\]/i);assert.ok(!existsSync(output),'Choose a fresh Unreal output');
const read=file=>JSON.parse(readFileSync(join(source,file),'utf8'));
const gameDna=read('game_dna.json');assert.equal(gameDna.archetype,'SIDE_VIEW_METROIDVANIA');
const worldGraph=read('world_graph.json'),progressionGraph=read('progression_graph.json');
const roomIds=worldGraph.nodes.filter(node=>node.type==='room').map(node=>node.id);
const gameContent={};
for(const[key,path,field]of [['enemies','enemies/enemies.json','enemies'],['bosses','bosses/bosses.json','bosses'],['quests','quests/quests.json','quests'],['items','items/items.json','items'],['npcs','npcs/npcs.json','npcs'],['dialogues','dialogues/dialogues.json','dialogues'],['shops','shops/shops.json','shops'],['lootTables','loot/loot_tables.json','tables']]) {
 const catalog=read('data/'+path);gameContent[key]=Array.isArray(catalog)?catalog:catalog[field]??[];
}
const textureFiles=new Map(),assetHashes={};
function collect(folder,relative){for(const entry of readdirSync(folder,{withFileTypes:true})){assert.ok(!entry.isSymbolicLink());const file=relative+'/'+entry.name,path=join(folder,entry.name);if(entry.isDirectory())collect(path,file);else if(/\.(png|json)$/i.test(file)){const bytes=readFileSync(path);textureFiles.set(file,bytes);assetHashes[file]=createHash('sha256').update(bytes).digest('hex');}}}
collect(join(source,'assets'),'assets');
mkdirSync(output,{recursive:true});
const result=new UnrealProjectAssembler().assemble({outputDir:output,gameDna,worldGraph,progressionGraph,roomIds,gameContent,textureFiles});
writeFileSync(join(output,'assembly-result.json'),JSON.stringify({...result,source,roomCount:roomIds.length,assetHashes,scope:'Unreal source assembly only; native compile/gameplay must be verified separately.'},null,2));
assert.equal(result.success,true,result.errors.join('; '));
const report=join(repo,'reports/game-tests/20261003-unreal');mkdirSync(report,{recursive:true});
writeFileSync(join(report,'fixture-latest.json'),JSON.stringify({output,source,rooms:roomIds.length,files:textureFiles.size,success:true},null,2));
console.log(JSON.stringify({output,rooms:roomIds.length,assetFiles:textureFiles.size,success:true}));
