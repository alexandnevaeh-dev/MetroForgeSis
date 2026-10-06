/** Hidden Electron component fixture: queue failure/race tests, not native game acceptance. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {_electron} from 'playwright';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(join(repo,'apps/desktop/package.json'));
const viteRequire=createRequire(require.resolve('vite/package.json'));
const esbuildRequire=createRequire(viteRequire.resolve('esbuild/package.json'));
const binary=esbuildRequire.resolve('@esbuild/win32-x64/esbuild.exe');
const output=join(repo,'reports/game-tests/20261004-queue-frontend',String(Date.now()));
mkdirSync(output,{recursive:true});
const component=join(repo,'apps/desktop/src/studio/GenerationQueuePanel.tsx').replaceAll('\\','/');
const styles=join(repo,'apps/desktop/src/styles.css').replaceAll('\\','/');
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const sourceHashes=Object.fromEntries([component,styles,fileURLToPath(import.meta.url)].map(file=>[file,sha(file)]));
writeFileSync(join(output,'fixture.tsx'),[
"import React from 'react'; import {createRoot} from 'react-dom/client';",
`import {GenerationQueuePanel} from ${JSON.stringify(component)}; import ${JSON.stringify(styles)};`,
`const state=window.queueFixture={jobs:[],reads:0,inFlight:0,maxInFlight:0,holdRead:false,readError:false,cancelError:false,cancels:0,holdCancel:false,listeners:new Set(),pending:[],cancelPending:[],
 emit(){for(const listener of this.listeners)listener({type:'GenerationCompleted'})},
 finishReads(){for(const finish of this.pending.splice(0))finish()},
 finishCancel(){for(const finish of this.cancelPending.splice(0))finish()},
};
window.metroforge={
 async listGenerationQueue(){state.reads++;state.inFlight++;state.maxInFlight=Math.max(state.maxInFlight,state.inFlight);try{if(state.holdRead)await new Promise(resolve=>state.pending.push(resolve));if(state.readError)throw Error('fixture transport failure');return structuredClone(state.jobs)}finally{state.inFlight--}},
 async cancelGenerationJob(){state.cancels++;if(state.holdCancel)await new Promise(resolve=>state.cancelPending.push(resolve));if(state.cancelError)throw Error('fixture cancellation failure');return {cancelled:true}},
 onGenerationEvent(listener){state.listeners.add(listener);return()=>state.listeners.delete(listener)},
};
let root=createRoot(document.getElementById('root'));window.queueUnmount=()=>root.unmount();window.queueRemount=()=>{root=createRoot(document.getElementById('root'));root.render(<GenerationQueuePanel/>)};root.render(<GenerationQueuePanel/>);`,
].join('\n'));
execFileSync(binary,[join(output,'fixture.tsx'),'--bundle','--platform=browser','--format=esm','--jsx=automatic','--outfile='+join(output,'fixture.js')],{cwd:repo,windowsHide:true,env:{...process.env,NODE_PATH:join(repo,'apps/desktop/node_modules')}});
writeFileSync(join(output,'index.html'),'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>MetroForge queue test fixture</title><link rel="stylesheet" href="fixture.css"></head><body><main id="root" style="padding:16px;max-width:800px"></main><script type="module" src="fixture.js"></script></body></html>');
writeFileSync(join(output,'main.cjs'),`const {app,BrowserWindow}=require('electron');app.setPath('userData',process.env.METROFORGE_DATA_DIR);app.whenReady().then(()=>{const window=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{backgroundThrottling:false}});window.loadFile(${JSON.stringify(join(output,'index.html'))})});`);
const checks=[];const proof={output,scope:'Real queue component in hidden Electron with a controlled IPC fixture; no actual generation, key authentication or worker-cancellation claim',checks,sourceHashes,fixtureSha256:sha(join(output,'fixture.js'))};
const check=(label,value)=>{checks.push({label,passed:!!value});assert.ok(value,label)};
let app;
try{
 const env={...process.env,TEMP:join(output,'temp'),TMP:join(output,'temp'),APPDATA:join(output,'appdata'),LOCALAPPDATA:join(output,'localappdata'),METROFORGE_DATA_DIR:join(output,'data')};
 for(const name of ['temp','appdata','localappdata','data'])mkdirSync(join(output,name),{recursive:true});delete env.ELECTRON_RUN_AS_NODE;
 app=await _electron.launch({executablePath:require('electron'),args:[join(output,'main.cjs')],cwd:repo,env});
 const page=await app.firstWindow();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.clock.install();await page.reload();
 await page.getByText('No queued jobs',{exact:true}).waitFor();await page.clock.pauseAt(new Date());
 const reads=()=>page.evaluate(()=>window.queueFixture.reads);
 const first=await reads();await page.clock.runFor(9000);check('idle queue avoids 1.5-second polling',await reads()===first);
 await page.clock.runFor(1100);check('idle queue refreshes at ten seconds',await reads()===first+1);
 await page.evaluate(()=>{const state=window.queueFixture;state.jobs=Array.from({length:27},(_,index)=>({id:String(index),type:'generate_game',status:index<2?'running':'completed',label:'Generation '+index+' with a long description '.repeat(7),createdAt:'2026-10-04T00:00:00Z'}));state.emit()});
 await page.clock.runFor(100);await page.locator('.queue-item').nth(11).waitFor();
 check('all active jobs and only ten past jobs render initially',await page.locator('.queue-item').count()===12);
 check('readable status badges identify actual states',await page.locator('.status-running .mf-badge').first().innerText()==='running');
 await page.getByRole('button',{name:/Show 10 more/}).click();check('history grows by ten on explicit action',await page.locator('.queue-item').count()===22);
 const beforeActive=await reads();await page.clock.runFor(1500);check('active queue retains prompt polling',await reads()===beforeActive+1);
 await page.evaluate(()=>{window.queueFixture.readError=true});await page.getByRole('button',{name:'Refresh queue',exact:true}).click();await page.clock.runFor(100);
 await page.getByRole('alert').waitFor();check('read failure preserves visible job history',await page.locator('.queue-item').count()===22);
 await page.evaluate(()=>{window.queueFixture.readError=false});await page.getByRole('button',{name:'Retry queue',exact:true}).click();await page.clock.runFor(100);
 check('retry restores readable queue without losing jobs',await page.getByRole('alert').count()===0&&await page.locator('.queue-item').count()===22);
 await page.evaluate(()=>{window.queueFixture.holdRead=true});await page.getByRole('button',{name:'Refresh queue',exact:true}).click();await page.clock.runFor(100);
 for(let index=0;index<5;index++){await page.getByRole('button',{name:'Refresh queue',exact:true}).click();await page.clock.runFor(100)}
 check('repeated refreshes never overlap IPC reads',await page.evaluate(()=>window.queueFixture.maxInFlight===1&&window.queueFixture.inFlight===1));
 await page.evaluate(()=>{window.queueFixture.holdRead=false;window.queueFixture.finishReads()});await page.clock.runFor(100);
 check('refresh requested during a slow read is replayed',await page.evaluate(()=>window.queueFixture.pending.length===0&&window.queueFixture.inFlight===0));
 await page.evaluate(()=>{window.queueFixture.holdCancel=true});const cancel=page.locator('.status-running button').first();const before=await cancel.boundingBox();
 await cancel.evaluate(button=>{button.click();button.click()});check('duplicate cancellation sends one request',await page.evaluate(()=>window.queueFixture.cancels===1));
 check('cancellation locks controls with a busy state',await cancel.isDisabled()&&await cancel.getAttribute('aria-busy')==='true');
 const during=await cancel.boundingBox();check('cancel control keeps its dimensions while pending',Math.abs(before.width-during.width)<1&&Math.abs(before.height-during.height)<1);
 await page.evaluate(()=>{window.queueFixture.holdCancel=false;window.queueFixture.finishCancel()});await page.getByRole('status').waitFor();await page.clock.runFor(100);
 check('request acknowledgement does not invent stopped-worker status',await page.getByRole('status').innerText()==='Cancellation requested.'&&await page.locator('.status-running').count()===2);
 await page.evaluate(()=>{window.queueFixture.cancelError=true});await cancel.click();await page.getByRole('status').filter({hasText:'Could not request cancellation'}).waitFor();
 check('cancellation failure is recoverable and retains the active job',await cancel.isEnabled()&&await page.locator('.status-running').count()===2);
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:600,height:720}));await page.clock.runFor(100);
 check('long queue content fits a narrow window',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const capture=await app.evaluate(async({BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0];return {visible:window.isVisible(),data:(await window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG().toString('base64')}});
 check('fixture never opens or focuses a native window',!capture.visible);writeFileSync(join(output,'queue-narrow.png'),Buffer.from(capture.data,'base64'));
 await page.evaluate(()=>{window.queueFixture.holdRead=true});await page.getByRole('button',{name:'Refresh queue',exact:true}).click();await page.clock.runFor(100);
 await page.evaluate(()=>window.queueUnmount());const afterUnmount=await reads();await page.evaluate(()=>window.queueFixture.finishReads());await page.clock.runFor(20000);
 check('unmount removes subscriptions and stops polling including late responses',await page.evaluate(()=>window.queueFixture.listeners.size===0)&&await reads()===afterUnmount);
 check('no renderer errors during failures or unmount',errors.length===0);
 await page.evaluate(()=>{window.queueFixture.holdRead=false;window.queueFixture.readError=true;window.queueFixture.jobs=[];window.queueRemount()});await page.clock.runFor(100);await page.getByRole('alert').waitFor();
 check('initial read failure reports unavailable status rather than an empty queue',await page.getByText('Status unavailable',{exact:true}).count()===1&&await page.getByText('No queued jobs',{exact:true}).count()===0);
 await page.evaluate(()=>{window.queueFixture.readError=false});await page.getByRole('button',{name:'Retry queue',exact:true}).click();await page.clock.runFor(100);await page.getByText('No queued jobs',{exact:true}).waitFor();
 check('initial failure retry restores authoritative empty state',await page.getByRole('alert').count()===0&&await page.getByText('0 active',{exact:true}).count()===1);
 check('tested component, styles and harness stayed unchanged',Object.entries(sourceHashes).every(([file,hash])=>sha(file)===hash));proof.passed=true;
}catch(error){proof.passed=false;proof.error=String(error.stack??error);process.exitCode=1}finally{
 if(app)await app.close();writeFileSync(join(output,'proof.json'),JSON.stringify(proof,null,2));writeFileSync(join(repo,'reports/game-tests/20261004-queue-frontend/latest.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify({passed:proof.passed,checks:checks.length,output,error:proof.error}));
}
