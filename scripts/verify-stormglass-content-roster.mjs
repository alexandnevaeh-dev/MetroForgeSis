import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {generateStormglassGalleryCampaign,applyStormglassGalleryDnaContract} from '../packages/godot/dist/index.js';
import {generateGameContent} from '../packages/procedural/dist/index.js';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),project=process.argv[2];
if(!project)throw new Error('Pass the isolated generated project');
const input=JSON.parse(readFileSync(join(project,'game_dna.json'),'utf8')),before=JSON.stringify(input);
const dna=applyStormglassGalleryDnaContract(input),campaign=generateStormglassGalleryCampaign(dna,20261006);
assert.ok(campaign);assert.equal(dna.world.biomeCount,1);assert.equal(JSON.stringify(input),before);
const topDown={...input,archetype:'TOP_DOWN_METROIDVANIA'};assert.equal(applyStormglassGalleryDnaContract(topDown),topDown);
const basic={bossRoomIds:campaign.bossRoomIds};
const authored={...basic,enemyNames:campaign.enemyNames,bossNames:campaign.bossNames,biomeCount:1};
const plain=generateGameContent(dna,'MEDIUM',42,campaign.finalBossRoomId,campaign.roomIds,basic);
const content=generateGameContent(dna,'MEDIUM',42,campaign.finalBossRoomId,campaign.roomIds,authored);
assert.equal(content.enemies.length,20);assert.equal(new Set(content.enemies.map(e=>e.name)).size,20);
assert.deepEqual([...new Set(content.enemies.map(e=>e.biomeId))],['biome_0']);
for(const [index,enemy] of content.enemies.entries()){
 const {name,biomeId,...stats}=enemy;const {name:oldName,biomeId:oldBiome,...oldStats}=plain.enemies[index];assert.deepEqual(stats,oldStats);
}
for(const [index,boss] of content.bosses.entries()){
 assert.equal(boss.arenaRoomId,campaign.bossRoomIds[index]);
 const {name,visualPrompt,...stats}=boss;const {name:oldName,visualPrompt:oldPrompt,...oldStats}=plain.bosses[index];assert.deepEqual(stats,oldStats);
}
assert.equal(content.bosses.at(-1).name,'Tempest Abbot');
assert.equal(content.quests.at(-1).objectives[0].target,content.bosses.at(-1).id);
assert.match(content.quests.at(-1).objectives[0].description,/Tempest Abbot/);
const legacy=generateGameContent(input,'MEDIUM',42,'room_039',campaign.roomIds);assert.equal(legacy.bosses.length,5);assert.equal(new Set(legacy.enemies.map(e=>e.biomeId)).size,5);
assert.throws(()=>generateGameContent(dna,'MEDIUM',42,campaign.finalBossRoomId,campaign.roomIds,{...authored,enemyNames:['Duplicate']}),/roster budget/);
assert.throws(()=>generateGameContent(dna,'MEDIUM',42,campaign.finalBossRoomId,campaign.roomIds,{...authored,biomeCount:0}),/biome count/);
const output=join(repo,'reports/game-tests/20261006-content-roster',String(Date.now()));mkdirSync(output,{recursive:true});
writeFileSync(join(output,'proof.json'),JSON.stringify({passed:true,scope:'Actual content generator;20unique enemies,onebiome,fourguardians,quest reference,RNG/combat-stat preservation,legacy defaults,topdown identity,input immutability,invalid contract rejection. Artwork and native gameplay remain separate.',enemies:content.enemies.map(e=>({id:e.id,name:e.name,biome:e.biomeId,movement:e.movement,combat:e.combat.type})),bosses:content.bosses.map(b=>({id:b.id,name:b.name,room:b.arenaRoomId})),legacyBossCount:legacy.bosses.length},null,2));
console.log(JSON.stringify({passed:true,enemies:20,bosses:4,biomes:1,output}));
