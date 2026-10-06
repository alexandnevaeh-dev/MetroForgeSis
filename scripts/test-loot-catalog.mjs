import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateLootCatalog } from '../packages/schemas/dist/index.js';
const table = {id:'abbey',name:'Abbey',entries:[{itemId:'plate',chance:1,minQuantity:1,maxQuantity:1}]};
test('valid linked catalog is copied without changing authored data', () => {
 const original=JSON.stringify(table);
 const result=validateLootCatalog([table],[{id:'plate'}],[{id:'enemy',lootTableId:'abbey'}]);
 assert.deepEqual(result,[table]);assert.notEqual(result[0],table);assert.equal(JSON.stringify(table),original);
});
test('ambiguous tables and dangling items or sources reject', () => {
 assert.throws(()=>validateLootCatalog([table,table],[{id:'plate'}]),/Duplicate loot table/);
 assert.throws(()=>validateLootCatalog([table],[]),/unknown item: plate/);
 assert.throws(()=>validateLootCatalog([table],[{id:'plate'}],[{id:'enemy',lootTableId:'missing'}]),/unknown table: missing/);
});
test('legacy projects without loot and explicit empty tables are valid', () => {
 assert.deepEqual(validateLootCatalog([],[],[{id:'enemy'}]),[]);
 assert.equal(validateLootCatalog([{...table,entries:[]}],[]).length,1);
});
