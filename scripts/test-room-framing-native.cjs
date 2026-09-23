const {createRequire}=require('node:module');const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const stage=process.argv[2]?path.resolve(process.argv[2]):null;
const root=path.resolve(__dirname,'..'),req=createRequire(root+'/apps/desktop/package.json');
(async()=>{
 const out=fs.mkdtempSync('E:/Metroforge/Recovery-Audit/room-framing-ui-'),project=out+'/projects/unity';
 fs.cpSync('E:/Metroforge/Recovery-Audit/portable-assembly-sJcA1z/unity',project,{recursive:true});
 const background='assets/room-preview-test.png';
 fs.mkdirSync(project+'/Assets/StreamingAssets/assets',{recursive:true});
 fs.copyFileSync('E:/Metroforge/Recovery-Audit/ashen-covenant/assets/abbey-distant-layer-v1.png',project+'/Assets/StreamingAssets/'+background);
 for(const file of ['gameplay.json','Assets/StreamingAssets/gameplay.json']){const pack=JSON.parse(fs.readFileSync(project+'/'+file,'utf8'));pack.rooms[0].backgrounds={...pack.rooms[0].backgrounds,far:background};fs.writeFileSync(project+'/'+file,JSON.stringify(pack,null,2));}
 const env={...process.env,METROFORGE_DATA_DIR:out+'/data',METROFORGE_GENERATED_GAMES_DIR:out+'/projects',VITE_DEV_SERVER_URL:''};delete env.ELECTRON_RUN_AS_NODE;delete env.METROFORGE_DESKTOP_SMOKE;
 const app=await req('playwright')._electron.launch({executablePath:stage?path.join(stage,'MetroForge.exe'):req('electron'),args:stage?[]:[root+'/apps/desktop'],cwd:out,env});
 try{
  const page=await app.firstWindow();page.setDefaultTimeout(15000);
  await page.evaluate(p=>sessionStorage.setItem('metroforge.activeProjectPath',p),project.replaceAll('/','\\'));await page.reload();
  const open=async()=>{await page.locator('aside.sidebar button.nav-item').filter({hasText:'Rooms'}).click();await page.getByRole('listbox',{name:'Rooms',exact:true}).getByRole('option').first().click();};
  await open();
  // This older fixture deliberately lacks the new Unity preview entry point.
  assert.equal(fs.existsSync(project+'/Assets/Editor/MetroForgePreview.cs'),false);
  await page.getByRole('button',{name:'Play Preview',exact:true}).click();
  await page.getByText('This Unity project needs the current preview template. Save your edits and refresh the project template first.',{exact:true}).waitFor();
  const outsideLaunchRejected=await page.evaluate(async()=>{
    try { await window.metroforge.playProject('E:/Metroforge/MetroForge-Recovered'); return false; }
    catch { return true; }
  });
  assert.equal(outsideLaunchRejected,true);
  await page.locator('image[data-room-background="far"]').waitFor({state:'attached'});
  assert.ok(await page.locator('image[data-room-background="far"]').evaluate(async element=>{const img=new Image();img.src=element.getAttribute('href');await img.decode();return img.naturalWidth>0;}));
  await page.getByText('Distant background settings',{exact:true}).click();
  const previewGuards=await page.evaluate(async p=>{
   const traversal=await window.metroforge.getAssetPreview(p,'../outside.png');
   let outsideRejected=false;
   try{await window.metroforge.getAssetPreview('E:/Metroforge/MetroForge-Recovered','assets/outside.png');}catch{outsideRejected=true;}
   return {traversalBlocked:!traversal.dataUrl,outsideRejected};
  },project);
  assert.deepEqual(previewGuards,{traversalBlocked:true,outsideRejected:true});
  const control=page.getByLabel('Frame background to camera',{exact:true});await control.check();
  await page.getByLabel('Background parallax',{exact:true}).fill('0.25');
  await page.locator('.unity-room-geometry').getByRole('button',{name:'Undo room edit',exact:true}).click();assert.equal(await page.getByLabel('Background parallax',{exact:true}).inputValue(),'0.1');
  await page.locator('.unity-room-geometry').getByRole('button',{name:'Redo room edit',exact:true}).click();assert.equal(await page.getByLabel('Background parallax',{exact:true}).inputValue(),'0.25');
  await page.getByRole('button',{name:'Add platform',exact:true}).click();
  await page.locator('.unity-room-geometry').getByRole('button',{name:'Undo room edit',exact:true}).click();assert.equal(await page.getByLabel('Background parallax',{exact:true}).inputValue(),'0.25');
  await page.getByRole('button',{name:'Save room',exact:true}).click();await page.getByText('Saved. Restart the Unity game to apply room changes.',{exact:true}).waitFor();
  const saved=JSON.parse(fs.readFileSync(project+'/gameplay.json','utf8'));const room=saved.rooms.find(r=>r.backgrounds?.farCameraRelative);
  assert.ok(room);assert.equal(room.backgrounds.farParallax,0.25);
  assert.equal(fs.readFileSync(project+'/gameplay.json','utf8'),fs.readFileSync(project+'/Assets/StreamingAssets/gameplay.json','utf8'));
  await page.getByText('Distant background settings',{exact:true}).click();
  const canvas=page.getByLabel('Unity room geometry',{exact:true});
  const fitted=await canvas.getAttribute('viewBox');
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();
  const magnified=await canvas.getAttribute('viewBox');assert.notEqual(magnified,fitted);
  assert.ok(Number(magnified.split(' ')[2])<Number(fitted.split(' ')[2]));
  await page.getByRole('button',{name:'Fit',exact:true}).click();assert.equal(await canvas.getAttribute('viewBox'),fitted);
  await page.screenshot({path:out+'/room-framing.png',fullPage:true});
  await page.reload();await open();await page.getByText('Distant background settings',{exact:true}).click();assert.equal(await control.isChecked(),true);assert.equal(await page.getByLabel('Background parallax',{exact:true}).inputValue(),'0.25');
  await page.locator('aside.sidebar button.nav-item').filter({hasText:'Playtest'}).click();
  await page.getByText('Unity opens in a separate editor window.',{exact:false}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Stop',exact:true}).isDisabled(),true);
  assert.equal(await page.getByRole('button',{name:'Pause',exact:true}).isDisabled(),true);
  assert.equal(await page.getByRole('button',{name:'Open Godot editor',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await page.getByText('This Unity project needs the current preview template. Save your edits and refresh the project template first.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Restart',exact:true}).count(),0);
  const layout=await page.locator('.preview-workspace').evaluate(el=>({
    width:el.getBoundingClientRect().width,
    main:el.querySelector('.preview-main-column').getBoundingClientRect().width,
    viewport:window.innerWidth
  }));
  if(layout.viewport<=1366) assert.ok(layout.main/layout.width>0.9,JSON.stringify(layout));
  await page.screenshot({path:out+'/unity-playtest-controls.png',fullPage:true});
  const unityPath='E:/Metroforge/Programs/Editor/Unity.exe';
  await page.evaluate(p=>window.metroforge.setAppSettings({'app.unityEditor':p}),unityPath);
  await page.reload();
  const savedUnity=await page.evaluate(()=>window.metroforge.getConfig());
  assert.equal(savedUnity.unityEditor,unityPath);
  const runtimeBefore=fs.readFileSync(project+'/Assets/StreamingAssets/gameplay.json','utf8');
  const sceneBefore=fs.readFileSync(project+'/Assets/Scenes/World.unity','utf8');
  const repaired=await page.evaluate(p=>window.metroforge.refreshProjectTemplate(p),project);
  assert.equal(repaired.success,true,JSON.stringify(repaired));
  assert.deepEqual(repaired.copied,['Assets/Editor/MetroForgePreview.cs']);
  assert.equal(fs.readFileSync(project+'/Assets/StreamingAssets/gameplay.json','utf8'),runtimeBefore);
  assert.equal(fs.readFileSync(project+'/Assets/Scenes/World.unity','utf8'),sceneBefore);
  const entry=project+'/Assets/Editor/MetroForgePreview.cs';
  fs.appendFileSync(entry,'\n// Authored customization must survive refresh.\n');
  const authored=fs.readFileSync(entry,'utf8');
  const repeated=await page.evaluate(p=>window.metroforge.refreshProjectTemplate(p),project);
  assert.equal(repeated.success,true);assert.deepEqual(repeated.copied,[]);
  assert.equal(fs.readFileSync(entry,'utf8'),authored);
  for (const [badPath,expected] of [
    [out+'/missing-Unity.exe','could not be found or read'],
    [out,'existing executable file'],
    ['Unity.exe','existing executable file']
  ]) {
    await page.evaluate(p=>window.metroforge.setAppSettings({'app.unityEditor':p}),badPath);
    const failed=await page.evaluate(p=>window.metroforge.playProject(p),project);
    assert.equal(failed.success,false);assert.ok(failed.message.includes(expected),failed.message);
  }
  await page.evaluate(p=>window.metroforge.setAppSettings({'app.unityEditor':p}),unityPath);
  fs.writeFileSync(out+'/result.json',JSON.stringify({passed:true,project,stage,scope:'Native room framing, save/reload/runtime mirror, Unity preview missing-template routing and outside-root launch rejection; no live Unity preview'},null,2));console.log('PASS room framing UI:',out);
 }finally{const timer=setTimeout(()=>app.process().kill(),5000);try{await app.close();}finally{clearTimeout(timer);}}
})().catch(error=>{console.error(error);process.exitCode=1;});
