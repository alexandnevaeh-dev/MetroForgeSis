import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {generateGameContent} from '../packages/procedural/dist/index.js';
import {validateLootCatalog} from '../packages/schemas/dist/index.js';
const dna=JSON.parse(readFileSync(new URL('../GeneratedGames/ashen-covenant-sideview-unity/game_dna.json',import.meta.url),'utf8'));
const rooms=Array.from({length:12},(_,i)=>`room_${String(i).padStart(3,'0')}`);
for(const archetype of ['SIDE_VIEW_METROIDVANIA','TOP_DOWN_ACTION_ADVENTURE']) {
 const input={...dna,archetype};
 const content=generateGameContent(input,'TINY_TEST',123,rooms.at(-1),rooms);
 assert.ok(content.enemies.length>0);
 assert.equal(content.lootTables.length,content.enemies.length);
 validateLootCatalog(content.lootTables,content.items,content.enemies);
 for(const table of content.lootTables) for(const entry of table.entries) {
  const item=content.items.find(item=>item.id===entry.itemId);
  assert.ok(['consumable','upgrade_material','armor'].includes(item.category));
 }
 assert.deepEqual(content,generateGameContent(input,'TINY_TEST',123,rooms.at(-1),rooms));
 const armor=content.items.find(item=>item.id==='warden_mail');
 assert.equal(armor.category,'armor');assert.deepEqual(armor.effects,[{type:'armor',value:25}]);
 console.log(`PASS ${archetype}: deterministic linked drops, no progression rewards, armor definition`);
}
