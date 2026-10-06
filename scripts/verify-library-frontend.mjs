/** Real project-library components with controlled failures; no native engine or paid calls. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(repo, 'apps/desktop/package.json'));
const esbuildRequire = createRequire(createRequire(require.resolve('vite/package.json')).resolve('esbuild/package.json'));
const output = join(repo, 'reports/game-tests/20261004-library-frontend', String(Date.now()));
mkdirSync(output, { recursive: true });
const sourceFiles = ['apps/desktop/src/studio/ProjectsScreen.tsx', 'apps/desktop/src/studio/StudioContext.tsx', 'apps/desktop/src/studio/ui/index.tsx', 'apps/desktop/src/styles.css', 'scripts/verify-library-frontend.mjs'];
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const sourceHashes = Object.fromEntries(sourceFiles.map(file => [file, sha(join(repo, file))]));
writeFileSync(join(output, 'fixture.tsx'), `
import React from 'react';import {createRoot} from 'react-dom/client';
import {ProjectsScreen} from ${JSON.stringify(join(repo,sourceFiles[0]))};
import {StudioProvider} from ${JSON.stringify(join(repo,sourceFiles[1]))};
import ${JSON.stringify(join(repo,sourceFiles[3]))};
const state=window.libraryFixture={reads:0,inFlight:0,maxInFlight:0,readError:true,hold:false,pending:[],actions:[],holdAction:false,actionPending:[],actionError:false,projects:[],finish(){for(const resolve of this.pending.splice(0))resolve()},finishAction(){for(const resolve of this.actionPending.splice(0))resolve()}};
state.projects=Array.from({length:47},(_,index)=>({path:'E:/games/'+index+'/same-slug',slug:'same-slug',title:'Project '+index,engine:index===2?'unity':index===3?'unreal':'godot',archetype:index===1?'QUANTUM_SIMULATION_ROGUELITE':index===0?'TOP_DOWN_ACTION_ADVENTURE':'SIDE_VIEW_METROIDVANIA'}));
async function work(type,args){state.actions.push({type,args});if(state.holdAction)await new Promise(resolve=>state.actionPending.push(resolve));if(state.actionError)throw Error('fixture action failure')}
window.metroforge={async listProjects(){state.reads++;state.inFlight++;state.maxInFlight=Math.max(state.maxInFlight,state.inFlight);try{if(state.hold)await new Promise(resolve=>state.pending.push(resolve));if(state.readError)throw Error('fixture library failure');return structuredClone(state.projects)}finally{state.inFlight--}},
async exportProject(...args){await work('export',args);return{success:true,archivePath:'E:/Exports/source.zip',warnings:['Review license before release']}},
async refreshProjectTemplate(...args){await work('refresh',args);return{success:true,copied:['scripts/Player.gd'],removed:[],planDigest:'a'.repeat(64),templateName:'Top-Down Action-Adventure',backupPath:'E:/games/backup',validationInvalidated:true}},
async openInGodot(...args){await work('open',args);return{success:true,message:'requested'}},async playProject(...args){await work('play',args);return{success:true,message:'requested'}}};
let root=createRoot(document.getElementById('root'));const render=()=>root.render(<StudioProvider onNavigate={id=>state.actions.push({type:'navigate',id})}><ProjectsScreen/></StudioProvider>);window.libraryUnmount=()=>root.unmount();render();
`);
execFileSync(esbuildRequire.resolve('@esbuild/win32-x64/esbuild.exe'), [join(output,'fixture.tsx'),'--bundle','--platform=browser','--format=esm','--jsx=automatic','--outfile='+join(output,'fixture.js')], {cwd:repo,windowsHide:true,env:{...process.env,NODE_PATH:join(repo,'apps/desktop/node_modules')}});
writeFileSync(join(output,'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>MetroForge library tests</title><link rel="stylesheet" href="fixture.css"></head><body><main id="root" style="padding:16px;max-width:1200px"></main><script type="module" src="fixture.js"></script></body></html>');
writeFileSync(join(output,'main.cjs'), `const{app,BrowserWindow}=require('electron');app.setPath('userData',process.env.METROFORGE_DATA_DIR);app.whenReady().then(()=>new BrowserWindow({show:false,width:1280,height:900,webPreferences:{backgroundThrottling:false}}).loadFile(${JSON.stringify(join(output,'index.html'))}));`);
const proof={output,scope:'Real ProjectsScreen, StudioProvider and shared search with a controlled bridge; failure, concurrency, keyboard and layout checks; no engine acceptance',sourceHashes,checks:[],captures:[]};
const check=(label,value)=>{proof.checks.push({label,passed:!!value});assert.ok(value,label)};
let app;
try {
 const env={...process.env,TEMP:join(output,'temp'),TMP:join(output,'temp'),APPDATA:join(output,'appdata'),LOCALAPPDATA:join(output,'localappdata'),METROFORGE_DATA_DIR:join(output,'data')};
 for(const name of ['temp','appdata','localappdata','data'])mkdirSync(join(output,name),{recursive:true});delete env.ELECTRON_RUN_AS_NODE;
 app=await _electron.launch({executablePath:require('electron'),args:[join(output,'main.cjs')],cwd:repo,env});const page=await app.firstWindow();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.getByRole('alert').waitFor();check('initial failure does not claim an empty library',await page.getByText('No generated projects yet',{exact:true}).count()===0);
 await page.evaluate(()=>{window.libraryFixture.readError=false});await page.getByRole('button',{name:'Retry library',exact:true}).click();await page.locator('.project-card').nth(19).waitFor();
 check('initial render is bounded to twenty projects',await page.locator('.project-card').count()===20);
 check('same slugs with distinct paths retain distinct cards',await page.locator('.project-card strong').nth(0).innerText()==='Project 0'&&await page.locator('.project-card strong').nth(19).innerText()==='Project 19');
 await page.getByRole('button',{name:'Show 20 more projects',exact:true}).click();check('explicit pagination adds twenty projects',await page.locator('.project-card').count()===40);
 const card=index=>page.locator('.project-card').filter({has:page.getByText('Project '+index,{exact:true})});
 check('engine and genre are readable labels',await card(0).getByText('Top-down adventure',{exact:true}).isVisible()&&await card(2).getByText('unity',{exact:true}).isVisible());
 check('Quantum has no room-template refresh',await card(1).getByRole('button',{name:'Review template refresh',exact:true}).count()===0);
 check('Unity does not offer a Godot editor or source export',await card(2).getByRole('button',{name:'Open in Godot',exact:true}).count()===0&&await card(2).getByRole('button',{name:'Export project',exact:true}).count()===0);
 check('Unreal play is unavailable without a build',await card(3).getByRole('button',{name:'Play',exact:true}).isDisabled());
 const search=page.getByRole('searchbox',{name:'Search projects'});await search.fill('top-down');await card(0).waitFor();check('search includes readable genre names',await page.locator('.project-card').count()===1);
 const clear=page.locator('.mf-search').getByRole('button',{name:'Clear search'});await clear.focus();await page.keyboard.press('Enter');check('keyboard clear empties query and returns focus',await search.inputValue()===''&&await search.evaluate(input=>input===document.activeElement));
 await page.locator('.project-card').nth(19).waitFor();check('new search resets the page bound',await page.locator('.project-card').count()===20);
 await page.evaluate(()=>{window.libraryFixture.readError=true});await page.getByRole('button',{name:'Refresh library',exact:true}).click();await page.getByRole('alert').waitFor();check('read failure preserves known projects and selected path',await page.locator('.project-card').count()===20&&await card(0).getAttribute('class').then(value=>value.includes('active')));
 await page.evaluate(()=>{window.libraryFixture.readError=false;window.libraryFixture.hold=true});await page.getByRole('button',{name:'Retry library',exact:true}).click();check('refresh exposes pending state',await page.getByRole('button',{name:'Refresh library',exact:true}).getAttribute('aria-busy')==='true');
 await page.evaluate(()=>{window.libraryFixture.hold=false;window.libraryFixture.finish()});await page.getByRole('button',{name:'Refresh library',exact:true}).waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('button[aria-busy="true"]'));check('library reads do not overlap',await page.evaluate(()=>window.libraryFixture.maxInFlight===1));
 await page.evaluate(()=>{window.libraryFixture.holdAction=true});const exportButton=card(0).getByRole('button',{name:'Export project',exact:true});await exportButton.evaluate(button=>{button.click();button.click()});
 check('duplicate exports submit once',await page.evaluate(()=>window.libraryFixture.actions.filter(action=>action.type==='export').length===1));check('pending action locks controls',await exportButton.isDisabled()&&await exportButton.getAttribute('aria-busy')==='true');
 check('export never silently bypasses validation',await page.evaluate(()=>window.libraryFixture.actions.find(action=>action.type==='export').args.length===1));
 await page.evaluate(()=>{window.libraryFixture.holdAction=false;window.libraryFixture.finishAction()});await page.getByRole('status').filter({hasText:'source project exported'}).waitFor();check('export feedback identifies source scope and warnings',await page.getByRole('status').innerText().then(value=>value.includes('source files')&&value.includes('Review license')));
 await card(0).getByRole('button',{name:'Review template refresh',exact:true}).click();await page.getByRole('button',{name:'Apply reviewed refresh',exact:true}).waitFor();check('review does not apply runtime changes',await page.evaluate(()=>window.libraryFixture.actions.filter(action=>action.type==='refresh').every(action=>action.args[1].dryRun===true)));
 await page.getByRole('button',{name:'Cancel refresh',exact:true}).click();check('cancel leaves only read-only refresh calls',await page.evaluate(()=>window.libraryFixture.actions.filter(action=>action.type==='refresh').every(action=>action.args[1].dryRun===true)));
 await card(0).getByRole('button',{name:'Review template refresh',exact:true}).click();await page.getByRole('button',{name:'Apply reviewed refresh',exact:true}).click();await page.getByRole('status').filter({hasText:'Backup:'}).waitFor();check('apply binds the reviewed digest',await page.evaluate(()=>window.libraryFixture.actions.filter(action=>action.type==='refresh').at(-1).args[1].expectedPlanDigest==='a'.repeat(64)));
 check('success reports backup and repeated validation',await page.getByRole('status').innerText().then(value=>value.includes('E:/games/backup')&&value.includes('validation again')));
 await page.evaluate(()=>{window.libraryFixture.actionError=true});await card(0).getByRole('button',{name:'Open in Godot',exact:true}).click();await page.getByRole('alert').filter({hasText:'fixture action failure'}).waitFor();check('editor rejection is inline and retryable',await card(0).getByRole('button',{name:'Open in Godot',exact:true}).isEnabled());
 await page.evaluate(()=>{window.libraryFixture.actionError=false});await card(0).getByRole('button',{name:'Play',exact:true}).click();await page.getByRole('status').filter({hasText:'play launch requested'}).waitFor();check('play acknowledgement does not invent running-game success',await page.getByRole('status').innerText()==='Project 0: play launch requested.');
 await search.fill('not found');await page.getByText('No matches',{exact:true}).waitFor();check('no matches has an explicit recovery action',await page.locator('.empty-state').getByRole('button',{name:'Clear search'}).count()===1);
 await search.fill('Project 0');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:600,height:800}));check('library fits a narrow window',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const capture=await app.evaluate(async({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];return{visible:win.isVisible(),data:(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG().toString('base64')}});check('native fixture stays hidden',!capture.visible);writeFileSync(join(output,'library-narrow.png'),Buffer.from(capture.data,'base64'));proof.captures.push('library-narrow.png');
 await page.evaluate(()=>{window.libraryFixture.holdAction=true});await card(0).getByRole('button',{name:'Export project',exact:true}).click();await page.evaluate(()=>{window.libraryUnmount();window.libraryFixture.finishAction()});check('no renderer errors on failure or late unmount response',errors.length===0);
 check('source files stayed unchanged',Object.entries(sourceHashes).every(([file,hash])=>sha(join(repo,file))===hash));proof.passed=true;
}catch(error){proof.passed=false;proof.error=String(error.stack??error);process.exitCode=1}finally{if(app)await app.close();writeFileSync(join(output,'proof.json'),JSON.stringify(proof,null,2));writeFileSync(join(repo,'reports/game-tests/20261004-library-frontend/latest.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify({passed:proof.passed,checks:proof.checks.length,output,error:proof.error}));}
