import {existsSync,readFileSync,writeFileSync,renameSync,mkdirSync,cpSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve('GeneratedGames/test-games/topdown'),candidate=join(root,'candidate-canopy-depth-20261001');
const current=join(root,'current'),backup=join(root,'backups/20261001-canopy-depth');
const report=resolve('reports/game-tests/20261001-canopy-depth');
if(!/^e:\\/i.test(root)||existsSync(backup))throw Error('Expected unused E: backup');
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const before=JSON.parse(readFileSync(join(report,'before/invariants.json')));
if(hash(join(current,'GAME_SET.json'))!==before.gameManifest)throw Error('Published game changed during validation');
for(const [file,expected]of Object.entries(before.files))if(hash(join(candidate,file))!==expected)throw Error('Physics/world/controller changed: '+file);
for(const asset of before.assets)if(hash(join(candidate,asset.path))!==asset.sha256)throw Error('Crisp original asset changed: '+asset.path);
const side=resolve('GeneratedGames/test-games/metroidvania/current');
if(hash(join(side,'GAME_SET.json'))!==before.sideManifest)throw Error('Separate side-view manifest changed');
for(const asset of before.sideAssets)if(hash(join(side,asset.path))!==asset.sha256)throw Error('Separate side-view asset changed: '+asset.path);
const suites={};
for(const [file,marker,expected]of [
 ['terrain-compatibility-final.log','CANOPY_TERRAIN_DEPTH_END',36],['terrain-forward.log','CANOPY_TERRAIN_DEPTH_END',36],
 ['world-compatibility.log','CANOPY_HD2D_END',44],['world-forward.log','CANOPY_HD2D_END',44],
 ['animation-showcase-contract-final.log','CANOPY_ANIMATION_SHOWCASE_END',82],
 ['runtime-final.log','SMOKE_TEST_RESULTS_END',160]]){
 const text=readFileSync(join(report,file),'utf8');
 const passed=(text.match(/^PASS:/gm)||[]).length,failed=(text.match(/^FAIL:/gm)||[]).length;
 if(passed!==expected||failed||!text.includes(marker)||/SCRIPT ERROR:|Parse Error:/.test(text))throw Error('Incomplete validation: '+file);
 suites[file]={passed,failed,sha256:hash(join(report,file))};
}
const animations=JSON.parse(readFileSync(join(candidate,'.qa/animation-showcase/results.json')));
if(animations.frames!==560||animations.failures)throw Error('Animation recording incomplete');
const files=['scripts/world/HD2DWorldPresenter.gd','scripts/AI/TopDownEnemyController.gd','scripts/test/CanopyAnimationShowcase.gd','scripts/test/CanopyTerrainDepthAcceptance.gd'];
if(hash(join(candidate,files[0]))!==hash(resolve('templates/godot-topdown-adventure',files[0])))throw Error('Template differs from tested runtime');
const testedFiles=Object.fromEntries(files.map(file=>[file,hash(join(candidate,file))]));
const game=JSON.parse(readFileSync(join(candidate,'GAME_SET.json')));
if(game.artRevision!==5||game.presentationRevision!==2)throw Error('Wrong candidate revision');
game.presentationRevision=3;
game.presentationDescription='Lowered rivers, original pixel-textured shore banks, bridge decks and piers; exact controller-driven cutout animation frames.';
writeFileSync(join(candidate,'GAME_SET.json'),JSON.stringify(game,null,2));
const result={current,backup,presentationRevision:3,artRevision:5,suites,nativePassed:Object.values(suites).reduce((sum,row)=>sum+row.passed,0),assetsUnchanged:before.assets.length,sideViewAssetsUnchanged:before.sideAssets.length,worldAndCollisionUnchanged:true,enemyTimingFix:'Combat-type sprite aliases now retain original enemy-id animation metadata, including 24fps run strips.',animationFrames:560,testedFiles,productionApproved:false};
mkdirSync(join(report,'after/animations'),{recursive:true});
for(const pose of ['idle','walk','run','attack','hurt','death','cast'])cpSync(join(candidate,'.qa/animation-showcase',pose+'.png'),join(report,'after/animations',pose+'.png'));
mkdirSync(join(root,'backups'),{recursive:true});
renameSync(current,backup);
try{renameSync(candidate,current);}catch(error){renameSync(backup,current);throw error;}
for(const [file,expected]of Object.entries(testedFiles))if(hash(join(current,file))!==expected)throw Error('Promoted runtime mismatch: '+file);
writeFileSync(join(report,'results.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
