import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const desktop=join(root,'apps/desktop');
const output=resolve(process.argv[2] || `E:/Metroforge/Recovery-Audit/portable-${Date.now()}`);
if(process.platform!=='win32' || !/^E:[\\/]/i.test(output)) throw Error('This installation requires a Windows output directory on E:');
if(existsSync(output)) throw Error('Output already exists; choose a new staging directory');
const manifest=dir=>JSON.parse(readFileSync(join(dir,'package.json'),'utf8'));
const packages=new Map(); const pending=[desktop];
while(pending.length){
 const dir=pending.shift(), pkg=manifest(dir), req=createRequire(join(dir,'package.json'));
 for(const name of Object.keys({...pkg.dependencies,...pkg.optionalDependencies})){
  const candidate=(req.resolve.paths(name)||[]).map(base=>join(base,name,'package.json')).find(existsSync);
  if(!candidate) throw Error(`Dependency missing: ${name} required by ${pkg.name}`);
  const source=realpathSync(dirname(candidate)), child=manifest(source), prior=packages.get(name);
  if(prior){if(prior.version!==child.version)throw Error(`Conflicting dependency versions: ${name}`);continue;}
  packages.set(name,{source,version:child.version}); pending.push(source);
 }
}
const require=createRequire(join(desktop,'package.json'));
const electron=require('electron');
for(const path of ['dist/index.html','dist-electron/main.js','dist-electron/preload.cjs'])if(!existsSync(join(desktop,path)))throw Error(`Build missing: ${path}`);
const excluded=new Set(['node_modules','.git','.godot','Library','Temp','Logs','obj','bin','.metroforge']);
const filter=path=>!excluded.has(basename(path))&&!basename(path).startsWith('.env');
mkdirSync(output,{recursive:true});
cpSync(dirname(electron),output,{recursive:true,filter:path=>basename(path)!=='default_app.asar'});
renameSync(join(output,basename(electron)),join(output,'MetroForge.exe'));
const app=join(output,'resources/app');mkdirSync(app,{recursive:true});
for(const name of ['dist','dist-electron'])cpSync(join(desktop,name),join(app,name),{recursive:true,filter});
writeFileSync(join(app,'package.json'),JSON.stringify({name:'metroforge',version:manifest(desktop).version,type:'module',main:'dist-electron/main.js'},null,2));
for(const [name,{source}] of packages){
 const target=join(app,'node_modules',name);mkdirSync(target,{recursive:true});
 if(name.startsWith('@metroforge/')){
  cpSync(join(source,'package.json'),join(target,'package.json'));
  cpSync(join(source,'dist'),join(target,'dist'),{recursive:true,filter});
 }else cpSync(source,target,{recursive:true,dereference:true,filter});
}
const resources=join(output,'resources/metroforge');mkdirSync(resources,{recursive:true});
cpSync(join(root,'templates'),join(resources,'templates'),{recursive:true,filter});
mkdirSync(join(resources,'workers'),{recursive:true});
for(const name of ['diffusers_image_worker.py','diffusers_audio_worker.py','local_sprite_worker.py','openvino_direct_server.py','u2net_model.py','requirements-diffusers.txt'])cpSync(join(root,'workers',name),join(resources,'workers',name));
mkdirSync(join(resources,'config'),{recursive:true});
for(const name of ['models.catalog.json','reference-profiles.json'])cpSync(join(root,'config',name),join(resources,'config',name));
writeFileSync(join(output,'staging-report.json'),JSON.stringify({scope:'Development portable build; not a release acceptance',output,dependencies:[...packages].map(([name,p])=>({name,version:p.version})),excluded:['credentials','generated games','models','engine caches'],remaining:['standalone launch','generation and editing','native engine validation','visual approval']},null,2));
console.log(`STAGED: ${output}`);
