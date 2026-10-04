/** Real dashboard component: controlled async failure and stale-response regressions. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {_electron} from 'playwright';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');const require=createRequire(join(repo,'apps/desktop/package.json'));
const esbuildRequire=createRequire(createRequire(require.resolve('vite/package.json')).resolve('esbuild/package.json'));
const output=join(repo,'reports/game-tests/20261004-dashboard-frontend',String(Date.now()));mkdirSync(output,{recursive:true});
const files=['apps/desktop/src/studio/ProjectDashboard.tsx','apps/desktop/src/studio/StudioContext.tsx','apps/desktop/src/studio/ProjectSelect.tsx','apps/desktop/src/styles.css','scripts/verify-dashboard-frontend.mjs'];
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');const sourceHashes=Object.fromEntries(files.map(file=>[file,sha(join(repo,file))]));
writeFileSync(join(output,'fixture.tsx'),`
import React from 'react';import {createRoot} from 'react-dom/client';
import {ProjectDashboard} from ${JSON.stringify(join(repo,files[0]))};
import {StudioProvider,useStudio} from ${JSON.stringify(join(repo,files[1]))};import ${JSON.stringify(join(repo,files[3]))};
const state=window.dashboardFixture={error:true,hold:false,pending:[],reads:0,finish(){for(const done of this.pending.splice(0))done()}};
window.metroforge={async listProjects(){return[{path:'E:/first',slug:'same',title:'First project'},{path:'E:/second',slug:'same',title:'Second project'}]},async getProjectDashboard(path){state.reads++;const error=state.error;if(state.hold)await new Promise(resolve=>state.pending.push(resolve));if(error)throw Error('fixture overview unavailable');return{title:path==='E:/first'?'First loaded overview':'Second loaded overview',roomCount:4,assetCount:8}},async listProjectCheckpoints(){return[]}};
function Test(){const studio=useStudio();window.dashboardSelect=studio.setSelectedPath;return <ProjectDashboard/>}const root=createRoot(document.getElementById('root'));window.dashboardUnmount=()=>root.unmount();root.render(<StudioProvider onNavigate={()=>{}}><Test/></StudioProvider>);
`);
execFileSync(esbuildRequire.resolve('@esbuild/win32-x64/esbuild.exe'),[join(output,'fixture.tsx'),'--bundle','--platform=browser','--format=esm','--jsx=automatic','--outfile='+join(output,'fixture.js')],{cwd:repo,windowsHide:true,env:{...process.env,NODE_PATH:join(repo,'apps/desktop/node_modules')}});
writeFileSync(join(output,'index.html'),'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>MetroForge dashboard tests</title><link rel="stylesheet" href="fixture.css"></head><body><main id="root" style="padding:16px;max-width:1200px"></main><script type="module" src="fixture.js"></script></body></html>');
writeFileSync(join(output,'main.cjs'),`const{app,BrowserWindow}=require('electron');app.setPath('userData',process.env.METROFORGE_DATA_DIR);app.whenReady().then(()=>new BrowserWindow({show:false,width:1280,height:900,webPreferences:{backgroundThrottling:false}}).loadFile(${JSON.stringify(join(output,'index.html'))}));`);
const proof={output,scope:'Real dashboard and project selector; controlled bridge, read failure, retries, duplicate submissions, stale responses and unmount; no actual engine acceptance',sourceHashes,checks:[],pageErrors:[]};const check=(label,value)=>{proof.checks.push({label,passed:!!value});assert.ok(value,label)};let app;
try{
 const env={...process.env,TEMP:join(output,'temp'),TMP:join(output,'temp'),APPDATA:join(output,'appdata'),LOCALAPPDATA:join(output,'localappdata'),METROFORGE_DATA_DIR:join(output,'data')};for(const name of ['temp','appdata','localappdata','data'])mkdirSync(join(output,name),{recursive:true});delete env.ELECTRON_RUN_AS_NODE;
 app=await _electron.launch({executablePath:require('electron'),args:[join(output,'main.cjs')],cwd:repo,env});const page=await app.firstWindow();page.on('pageerror',error=>proof.pageErrors.push(error.message));await page.getByRole('alert').waitFor();check('overview read rejection has inline recovery',await page.getByText('Dashboard unavailable',{exact:true}).isVisible()&&await page.getByRole('button',{name:'Try again',exact:true}).isEnabled());
 await page.evaluate(()=>{window.dashboardFixture.error=false});await page.getByRole('button',{name:'Try again',exact:true}).click();await page.getByText('First loaded overview',{exact:true}).waitFor();check('retry restores actual returned overview',await page.getByRole('alert').count()===0);
 await page.evaluate(()=>{window.dashboardFixture.hold=true});const refresh=page.locator('.screen-header').getByRole('button',{name:'Refresh',exact:true});const before=await page.evaluate(()=>window.dashboardFixture.reads);const box=await refresh.boundingBox();await refresh.evaluate(button=>{button.click();button.click()});check('same-project duplicate refresh submits once',await page.evaluate(()=>window.dashboardFixture.reads)===before+1);check('pending refresh locks the button without geometry changes',await refresh.isDisabled()&&await refresh.getAttribute('aria-busy')==='true'&&Math.abs((await refresh.boundingBox()).width-box.width)<1);
 await page.evaluate(()=>{window.dashboardFixture.hold=false;window.dashboardFixture.finish()});await refresh.waitFor();await page.waitForFunction(()=>!document.querySelector('button[aria-busy="true"]'));
 await page.evaluate(()=>{window.dashboardFixture.hold=true});await refresh.click();await page.evaluate(()=>{window.dashboardFixture.hold=false;window.dashboardSelect('E:/second')});await page.getByText('Second loaded overview',{exact:true}).waitFor();check('project switch clears the previous overview',await page.getByText('First loaded overview',{exact:true}).count()===0);
 await page.evaluate(()=>window.dashboardFixture.finish());await page.waitForTimeout(100);check('late first-project response cannot overwrite second-project data',await page.getByText('Second loaded overview',{exact:true}).isVisible()&&await page.getByText('First loaded overview',{exact:true}).count()===0);
 check('project dropdown has two path-distinct entries for repeated slugs',await page.locator('.project-select option').count()===2);
 await page.evaluate(()=>{window.dashboardFixture.hold=true});await refresh.click();await page.evaluate(()=>{window.dashboardUnmount();window.dashboardFixture.finish()});await page.waitForTimeout(100);check('read failure and late unmount produce no renderer errors',proof.pageErrors.length===0);
 check('all tested sources remain unchanged',Object.entries(sourceHashes).every(([file,hash])=>sha(join(repo,file))===hash));proof.passed=true;
}catch(error){proof.passed=false;proof.error=String(error.stack??error);process.exitCode=1}finally{if(app)await app.close();writeFileSync(join(output,'proof.json'),JSON.stringify(proof,null,2));writeFileSync(join(repo,'reports/game-tests/20261004-dashboard-frontend/latest.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify({passed:proof.passed,checks:proof.checks.length,output,error:proof.error}));}
