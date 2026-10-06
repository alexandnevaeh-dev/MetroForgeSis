import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ModelCatalogService } from '../packages/ai/dist/model-catalog.js';
const fixture=mkdtempSync('E:/Metroforge/Recovery-Audit/catalog-resources-');
const resource=join(fixture,'resources'),data=join(fixture,'data');
mkdirSync(join(resource,'config'),{recursive:true});mkdirSync(data);
const builtin=JSON.parse(readFileSync(new URL('../config/models.catalog.json',import.meta.url),'utf8'));
assert.ok(builtin.models.length>0);
builtin.models=builtin.models.slice(0,1);
writeFileSync(join(resource,'config/models.catalog.json'),JSON.stringify(builtin));
const previous={resource:process.env.METROFORGE_RESOURCE_ROOT,data:process.env.METROFORGE_DATA_DIR};
try{
 process.env.METROFORGE_RESOURCE_ROOT=resource;process.env.METROFORGE_DATA_DIR=data;
 assert.deepEqual(new ModelCatalogService().list().map(m=>m.id),builtin.models.map(m=>m.id));
 const user={...builtin,models:[]};writeFileSync(join(data,'models.catalog.json'),JSON.stringify(user));
 assert.equal(new ModelCatalogService().list().length,0);
 writeFileSync(join(data,'models.catalog.json'),'{broken');
 assert.equal(new ModelCatalogService().list().length,1);
 console.log('PASS relocated model catalog, configured user data precedence and invalid user catalog fallback');
}finally{
 for(const [key,value] of [['METROFORGE_RESOURCE_ROOT',previous.resource],['METROFORGE_DATA_DIR',previous.data]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}
}
