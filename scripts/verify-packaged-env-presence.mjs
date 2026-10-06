/** Read-only credential presence check. Never read credentials into the renderer or proof. */
import assert from 'node:assert/strict';
import {_electron} from 'playwright';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const executable=process.argv.find(value=>value.startsWith('--packaged='))?.slice(11);
assert.ok(executable&&/^E:[\\/]/i.test(executable));
const envFile='E:/Metroforge/MetroForge-Publish/.env';
const hash=()=>createHash('sha256').update(readFileSync(envFile)).digest('hex');
const before=hash();
const output=join(repo,'reports/game-tests/20261004-env-presence',String(Date.now()));
for(const directory of ['temp','appdata','localappdata','data','games'])mkdirSync(join(output,directory),{recursive:true});
const env={...process.env,METROFORGE_ENV_FILE:envFile,METROFORGE_DESKTOP_HIDDEN:'1',METROFORGE_RESOURCE_ROOT:join(dirname(executable),'resources/metroforge'),METROFORGE_WORKSPACE_DIR:join(output,'workspace'),
 TEMP:join(output,'temp'),TMP:join(output,'temp'),APPDATA:join(output,'appdata'),LOCALAPPDATA:join(output,'localappdata'),METROFORGE_DATA_DIR:join(output,'data'),METROFORGE_GENERATED_GAMES_DIR:join(output,'games')};
for(const key of ['ELECTRON_RUN_AS_NODE','VITE_DEV_SERVER_URL','METROFORGE_DESKTOP_SMOKE','METROFORGE_OPEN_DEVTOOLS'])delete env[key];
for(const key of Object.keys(env))if(/API_KEY|API_TOKEN|HF_TOKEN/.test(key))delete env[key];
let app;
const proof={output,scope:'Read-only packaged credential presence from the existing authorized .env; no generation or live-service authentication assertion'};
try{
 app=await _electron.launch({executablePath:executable,args:[],cwd:repo,env,timeout:60000});
 const page=await app.firstWindow();await page.waitForFunction(()=>!!window.metroforge?.getCredentialStatus);
 const status=await page.evaluate(()=>window.metroforge.getCredentialStatus());
 assert.equal(status.error,null);assert.equal(status.encryptionAvailable,true);assert.equal(status.entries.length,12);
 proof.entries=status.entries.map(({id,configured,source})=>({id,configured,source}));
 proof.environmentConfigured=proof.entries.filter(entry=>entry.configured&&entry.source==='environment').length;
 proof.envUnchanged=hash()===before;assert.ok(proof.envUnchanged);assert.ok(proof.environmentConfigured>0);
 assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>!window.isVisible())));
 proof.passed=true;
}catch(error){proof.passed=false;proof.error=String(error.message??error);process.exitCode=1}finally{
 if(app)await app.close();writeFileSync(join(output,'proof.json'),JSON.stringify(proof,null,2));writeFileSync(join(repo,'reports/game-tests/20261004-env-presence/latest.json'),JSON.stringify(proof,null,2));
 console.log(JSON.stringify({passed:proof.passed,environmentConfigured:proof.environmentConfigured,envUnchanged:proof.envUnchanged,output,error:proof.error}));
}
