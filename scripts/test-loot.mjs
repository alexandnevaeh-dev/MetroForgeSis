import test from 'node:test';import assert from 'node:assert/strict';
import {rollLoot} from '../packages/engines/dist/loot.js';
const entry=(itemId,chance,minQuantity=1,maxQuantity=1)=>({itemId,chance,minQuantity,maxQuantity});
const table=entries=>({id:'test',name:'Test',entries});const known=new Set(['plate','coin']);
test('zero and guaranteed drops do not depend on random sample',()=>{assert.deepEqual(rollLoot(table([entry('plate',0),entry('coin',1,3,3)]),known,()=>{throw Error('Unexpected RNG call')}),[{itemId:'coin',quantity:3}]);});
test('chance boundary excludes equality and quantity includes both endpoints',()=>{
 assert.deepEqual(rollLoot(table([entry('plate',0.5)]),known,()=>0.5),[]);
 for(const [sample,quantity] of [[0,2],[0.999999,5]])assert.deepEqual(rollLoot(table([entry('coin',1,2,5)]),known,()=>sample),[{itemId:'coin',quantity}]);
});
test('unknown item and invalid RNG reject before any drops can be delivered',()=>{
 let calls=0;assert.throws(()=>rollLoot(table([entry('coin',0.5),entry('missing',1)]),known,()=>{calls++;return 0;}),/Unknown/);assert.equal(calls,0);
 for(const value of [NaN,Infinity,-0.1,1])assert.throws(()=>rollLoot(table([entry('coin',0.5)]),known,()=>value),/RNG/);
});
test('independent entries can drop together and source catalog is unchanged',()=>{const data=table([entry('coin',0.5),entry('plate',0.5)]);const original=structuredClone(data);assert.equal(rollLoot(data,known,()=>0.1).length,2);assert.deepEqual(data,original);});
