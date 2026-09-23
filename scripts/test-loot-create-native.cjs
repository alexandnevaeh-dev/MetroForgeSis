const {createRequire}=require('node:module');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const req=createRequire(root+'/apps/desktop/package.json');
(async()=>{
 const stage=process.argv[3]?path.resolve(process.argv[3]):null;
 const out=fs.mkdtempSync('E:/Metroforge/Recovery-Audit/loot-create-native-');
 const project=out+'/projects/unity';
 fs.cpSync(process.argv[2]||'E:/Metroforge/Recovery-Audit/portable-assembly-sJcA1z/unity',project,{recursive:true});
 const env={...process.env,METROFORGE_DATA_DIR:out+'/app-data',METROFORGE_GENERATED_GAMES_DIR:out+'/projects',VITE_DEV_SERVER_URL:''};
 delete env.ELECTRON_RUN_AS_NODE;delete env.METROFORGE_DESKTOP_SMOKE;
 delete env.METROFORGE_RESOURCE_ROOT;delete env.METROFORGE_ENV_FILE;
 if(stage)env.METROFORGE_WORKSPACE_DIR=out;
 const app=await req('playwright')._electron.launch({executablePath:stage?path.join(stage,'MetroForge.exe'):req('electron'),args:stage?[]:[root+'/apps/desktop'],cwd:out,env});
 try{
  const page=await app.firstWindow();page.setDefaultTimeout(15000);
  await page.waitForFunction(()=>Boolean(window.metroforge?.createEditableLoot));
  await page.evaluate(p=>sessionStorage.setItem('metroforge.activeProjectPath',p),project.replaceAll('/','\\'));
  await page.reload();
  const open=async()=>{await page.locator('aside.sidebar button.nav-item').filter({hasText:'Assets'}).click();await page.getByText('Enemy loot and drop quantities',{exact:true}).click();};
  await open();
  await page.getByRole('button',{name:'New loot table',exact:true}).click();
  await page.getByLabel('Loot table name',{exact:true}).fill('');
  assert.equal(await page.getByRole('button',{name:'Create loot table',exact:true}).isDisabled(),true);
  await page.getByLabel('Loot table name',{exact:true}).fill('UI crypt equipment');
  await page.getByRole('button',{name:'Add drop',exact:true}).click();
  await page.getByLabel('Drop 1 chance',{exact:true}).fill('0.45');
  await page.locator('aside.sidebar button.nav-item').first().click();await open();
  await page.getByText('Unsaved loot draft restored.',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('Loot table name',{exact:true}).inputValue(),'UI crypt equipment');
  const rootCatalog=project+'/data/loot/loot_tables.json';
  const beforeConflict=fs.readFileSync(rootCatalog,'utf8');
  fs.writeFileSync(rootCatalog,beforeConflict+'\n');
  await page.getByRole('button',{name:'Create loot table',exact:true}).click();
  await page.getByRole('status').filter({hasText:'changed; reload before saving'}).waitFor();
  assert.equal(await page.getByLabel('Loot table name',{exact:true}).inputValue(),'UI crypt equipment');
  assert.equal(await page.getByLabel('Drop 1 chance',{exact:true}).inputValue(),'0.45');
  assert.equal(fs.readFileSync(rootCatalog,'utf8'),beforeConflict+'\n');
  // Restore the fixture's original revision to verify a retry of the retained draft.
  fs.writeFileSync(rootCatalog,beforeConflict);
  await page.getByRole('button',{name:'Create loot table',exact:true}).click();
  await page.getByText('Saved project and Unity runtime definitions. Restart Play Mode to load changes; rebuild exported players.',{exact:true}).waitFor();
  const uiId=await page.getByLabel('Loot table',{exact:true}).inputValue();
  await page.reload();await open();await page.getByLabel('Loot table',{exact:true}).selectOption(uiId);
  assert.equal(await page.getByLabel('Drop 1 chance',{exact:true}).inputValue(),'0.45');
  await page.screenshot({path:out+'/created-table.png',fullPage:true});
  const sourceId=JSON.parse(fs.readFileSync(project+'/data/enemies/enemies.json','utf8')).enemies[0].id;
  await page.getByLabel('Loot source enemy',{exact:true}).selectOption(sourceId);
  await page.getByRole('button',{name:'Assign selected loot table',exact:true}).click();
  await page.getByText('Enemy drops saved to project and Unity runtime. Restart Play Mode; rebuild exported players.',{exact:true}).waitFor();
  assert.equal(JSON.parse(fs.readFileSync(project+'/data/enemies/enemies.json','utf8')).enemies[0].lootTableId,uiId);
  await page.reload();await open();await page.getByLabel('Loot source enemy',{exact:true}).selectOption(sourceId);
  await page.getByText('Current drops: UI crypt equipment',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Clear enemy drops',exact:true}).click();
  await page.getByText('Current drops: None',{exact:true}).waitFor();
  assert.equal(JSON.parse(fs.readFileSync(project+'/data/enemies/enemies.json','utf8')).enemies[0].lootTableId,undefined);
  await page.screenshot({path:out+'/enemy-assignment.png',fullPage:true});
  const beforeDiscard=fs.readFileSync(rootCatalog,'utf8');
  await page.getByRole('button',{name:'New loot table',exact:true}).click();
  await page.getByLabel('Loot table name',{exact:true}).fill('Discard me');
  await page.getByRole('button',{name:'Discard loot changes',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Create loot table',exact:true}).count(),0);
  await page.locator('aside.sidebar button.nav-item').first().click();await open();
  assert.equal(await page.getByRole('button',{name:'Create loot table',exact:true}).count(),0);
  assert.equal(fs.readFileSync(rootCatalog,'utf8'),beforeDiscard);

  const evidence=await page.evaluate(async project=>{
   const api=window.metroforge;
   const before=await api.readEditableLoot(project);
   const table={id:'native_created_drop',name:'Crypt equipment',entries:[{itemId:String(before.items[0].id),chance:0.35,minQuantity:2,maxQuantity:4}]};
   const saved=await api.createEditableLoot(project,table,before.revision);
   const after=await api.readEditableLoot(project);
   let duplicateRejected=false,staleRejected=false;
   try{await api.createEditableLoot(project,table,after.revision);}catch(e){duplicateRejected=String(e).includes('already exists');}
   try{await api.createEditableLoot(project,{...table,id:'stale_drop'},before.revision);}catch(e){staleRejected=String(e).includes('changed');}
   return {before,after,table,saved,duplicateRejected,staleRejected};
  },project);
  assert.deepEqual(evidence.after.tables.at(-1),evidence.table);
  assert.deepEqual(evidence.after.tables.slice(0,-1),evidence.before.tables);
  assert.equal(evidence.duplicateRejected,true);assert.equal(evidence.staleRejected,true);
  assert.equal(evidence.saved.runtimeSynchronized,true);assert.equal(evidence.saved.restartRequired,true);
  assert.ok(fs.existsSync(evidence.saved.backup));
  const catalog=fs.readFileSync(project+'/data/loot/loot_tables.json','utf8');
  assert.equal(catalog,fs.readFileSync(project+'/Assets/StreamingAssets/data/loot/loot_tables.json','utf8'));
  await page.reload();await page.waitForFunction(()=>Boolean(window.metroforge?.readEditableLoot));
  const reopened=await page.evaluate(project=>window.metroforge.readEditableLoot(project),project);
  assert.deepEqual(reopened.tables,evidence.after.tables);
  const assignment=await page.evaluate(async project=>{
   const api=window.metroforge;
   const before=await api.readEditableLoot(project);
   const source=before.sources[0];
   if(!source)throw Error('Fixture requires an enemy');
   const saved=await api.saveEditableLootSource(project,String(source.id),'native_created_drop',before.revision);
   const assigned=await api.readEditableLoot(project);
   let staleRejected=false;
   try{await api.saveEditableLootSource(project,String(source.id),null,before.revision);}catch(e){staleRejected=String(e).includes('changed');}
   const cleared=await api.saveEditableLootSource(project,String(source.id),null,assigned.revision);
   const after=await api.readEditableLoot(project);
   return {source,assigned:assigned.sources[0],after:after.sources[0],saved,cleared,staleRejected};
  },project);
  assert.equal(assignment.assigned.lootTableId,'native_created_drop');
  assert.equal(assignment.after.lootTableId,undefined);
  const expected={...assignment.source};delete expected.lootTableId;
  assert.deepEqual(assignment.after,expected);
  assert.equal(assignment.staleRejected,true);
  assert.equal(assignment.saved.runtimeSynchronized,true);assert.ok(fs.existsSync(assignment.saved.backup));
  assert.equal(fs.readFileSync(project+'/data/enemies/enemies.json','utf8'),fs.readFileSync(project+'/Assets/StreamingAssets/data/enemies/enemies.json','utf8'));
  fs.writeFileSync(out+'/result.json',JSON.stringify({passed:true,project,stage,scope:'Native Electron renderer/preload/IPC creation, duplicate/stale rejection, backup, disk/runtime equality and reload; UI create/name validation/navigation draft/save/reload, stale-save draft retention/retry and discard also passed; enemy assignment/clear/reload UI and stale IPC checks passed; no gameplay validation'},null,2));
  console.log('PASS native loot creation API:',out);
 }finally{
  const cleanup=setTimeout(()=>app.process().kill(),5000);
  try{await app.close();}finally{clearTimeout(cleanup);}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
