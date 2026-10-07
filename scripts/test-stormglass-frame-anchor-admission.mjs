import {cpSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {loadStormglassPlayerAssets} from '../packages/generation/dist/stormglass-player-assets.js';
const repo=fileURLToPath(new URL('../',import.meta.url));
if (!process.argv[2]) throw new Error('Pass an isolated E: evidence directory');
const root=resolve(process.argv[2]);
if (!/^E:[\\/]/i.test(root) || root.toLowerCase().startsWith(resolve(repo).toLowerCase())) throw new Error('Evidence must be outside the repository on E:');
const pack=join(root,'test-packs/stormglass-player-cape-v3');
mkdirSync(pack,{recursive:true});
cpSync(join(repo,'test-packs/stormglass-player-cape-v3'),pack,{recursive:true});
const original=JSON.parse(readFileSync(join(pack,'manifest.json'),'utf8').replace(/^\uFEFF/,''));
let checks=[];
function trial(label,edit,reject=false){
 const m=structuredClone(original);edit(m);
 writeFileSync(join(pack,'manifest.json'),JSON.stringify(m));
 if(reject) assert.throws(()=>loadStormglassPlayerAssets(root));
 else {const result=loadStormglassPlayerAssets(root);assert.equal(result.clips.length,14);assert.equal(result.productionReady,false);}
 checks.push({label,passed:true});
}
trial('existing scalar-anchor pack remains admitted',()=>{});
trial('per-frame anchors without scalar admitted',m=>{const c=m.animations.idle;c.frameFootAnchors=c.sourceRegions.map(r=>[r[2]/2,c.footAnchorY]);delete c.footAnchorY;});
for(const [label,anchor] of [['negative',[-1,0]],['outside',[99999,0]],['wrong shape',[0]],['string',['0',0]],['null',[null,0]]]){
 trial('reject '+label+' anchor',m=>{const c=m.animations.idle;c.frameFootAnchors=c.sourceRegions.map(()=>anchor);},true);
}
trial('reject incomplete anchor count',m=>{m.animations.idle.frameFootAnchors=[[0,0]];},true);
trial('reject zero-frame animation',m=>{m.animations.idle.frameCount=0;m.animations.idle.sourceRegions=[];},true);
writeFileSync(join(pack,'manifest.json'),JSON.stringify(original));
writeFileSync(join(root,'proof.json'),JSON.stringify({passed:true,checks},null,2));
console.log('ADMISSION_RESULT passed=true checks='+checks.length);

