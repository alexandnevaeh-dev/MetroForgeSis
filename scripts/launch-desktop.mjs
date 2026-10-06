import {createRequire} from 'node:module';
import {existsSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url));
const desktop=join(root,'apps','desktop');
if(process.platform!=='win32')throw new Error('This launcher is for Windows.');
for(const file of ['dist/index.html','dist-electron/main.js','dist-electron/preload.cjs']){
 if(!existsSync(join(desktop,file)))throw new Error('Desktop build missing. Run node scripts/desktop-build.mjs first.');
}
const require=createRequire(join(desktop,'package.json'));
const electron=require('electron');
if(!existsSync(electron))throw new Error('Installed Electron runtime is missing.');
const data=process.env.METROFORGE_DATA_DIR||'E:\\Metroforge\\UserData';
if(!/^E:[\\/]/i.test(data))throw new Error('MetroForge data directory must be on E: for this installation.');
const directories={TEMP:'temp',TMP:'temp',APPDATA:'appdata',LOCALAPPDATA:'localappdata',
 HF_HOME:'cache/huggingface',TORCH_HOME:'cache/torch',npm_config_cache:'cache/npm',
 ELECTRON_CACHE:'cache/electron',PLAYWRIGHT_BROWSERS_PATH:'cache/playwright',XDG_CACHE_HOME:'cache'};
const env={...process.env,METROFORGE_DATA_DIR:data};
// Retain TLS verification while using the same public roots trusted by Windows.
const systemRoots='E:\\MetroForgeData\\Certificates\\windows-trusted-roots.pem';
if(!env.NODE_EXTRA_CA_CERTS && existsSync(systemRoots))env.NODE_EXTRA_CA_CERTS=systemRoots;
for(const [key,suffix] of Object.entries(directories)){env[key]=join(data,suffix);mkdirSync(env[key],{recursive:true});}
delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL;delete env.METROFORGE_DESKTOP_SMOKE;
const child=spawn(electron,[desktop],{cwd:root,env,detached:true,stdio:'ignore',windowsHide:true});
child.on('error',error=>{console.error('MetroForge could not launch:',error.message);process.exitCode=1;});
child.on('spawn',()=>{console.log('MetroForge launched. Data: '+data);child.unref();});
