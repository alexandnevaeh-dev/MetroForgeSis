import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const stage=resolve(process.argv[2]||'E:/Metroforge/Recovery-Audit/portable-852e263');
if(!/^E:[\\/]/i.test(stage)||!existsSync(join(stage,'MetroForge.exe')))throw Error('Expected staged Windows application on E:');
const env={...process.env,METROFORGE_DESKTOP_SMOKE:'1'};
for(const key of ['ELECTRON_RUN_AS_NODE','VITE_DEV_SERVER_URL','METROFORGE_DATA_DIR','METROFORGE_RESOURCE_ROOT','METROFORGE_WORKSPACE_DIR','METROFORGE_GENERATED_GAMES_DIR','METROFORGE_ENV_FILE','METROFORGE_DESKTOP_SMOKE_PROJECT'])delete env[key];
// Keep pre-bootstrap Electron startup temp paths on E as well.
for(const [key,suffix]of Object.entries({TEMP:'temp',TMP:'temp',APPDATA:'appdata',LOCALAPPDATA:'localappdata'})){env[key]=join(stage,'startup-test',suffix);mkdirSync(env[key],{recursive:true});}
const result=spawnSync(join(stage,'MetroForge.exe'),[],{cwd:'E:/Metroforge/Recovery-Audit',env,windowsHide:true,timeout:45000,encoding:'utf8'});
const log=(result.stdout||'')+(result.stderr||'');writeFileSync(join(stage,'startup.log'),log);
const passed=result.status===0&&log.includes('DESKTOP_SMOKE_PASS:');
const receipt={passed,exitCode:result.status,error:result.error?.message,scope:'Packaged executable outside source checkout; renderer and version IPC'};
writeFileSync(join(stage,'startup-result.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));process.exitCode=passed?0:1;
