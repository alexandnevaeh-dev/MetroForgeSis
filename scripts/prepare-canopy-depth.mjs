import {cpSync,existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve('GeneratedGames/test-games/topdown');
const current=join(root,'current'),candidate=join(root,'candidate-canopy-depth-20261001');
const report=resolve('reports/game-tests/20261001-canopy-depth');
if(!/^e:\\/i.test(root)||existsSync(candidate))throw Error('Expected fresh candidate on E:');
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const side=resolve('GeneratedGames/test-games/metroidvania/current');
const game=JSON.parse(readFileSync(join(current,'GAME_SET.json')));
const sideGame=JSON.parse(readFileSync(join(side,'GAME_SET.json')));
const paths=['data/world/overworld.json','data/world/world_graph.json','scripts/world/OverworldManager.gd','scripts/player/TopDownPlayerController.gd','scripts/AI/BossController.gd','scripts/AI/EnemyController.gd'];
writeFileSync(join(report,'before/invariants.json'),JSON.stringify({current,candidate,gameManifest:sha(join(current,'GAME_SET.json')),sideManifest:sha(join(side,'GAME_SET.json')),assets:game.assets,sideAssets:sideGame.assets,files:Object.fromEntries(paths.map(path=>[path,sha(join(current,path))]))},null,2));
cpSync(current,candidate,{recursive:true,filter:path=>!path.split(/[\\/]/).some(part=>['.qa','.godot'].includes(part))});
for(const file of ['CanopyTerrainDepthAcceptance.gd','CanopyTerrainDepthAcceptance.tscn']){
 const dest=join(candidate,file.endsWith('.gd')?'scripts/test':'scenes/test',file);
 mkdirSync(resolve(dest,'..'),{recursive:true});cpSync(join('scripts/test-cases',file),dest);
}
console.log(JSON.stringify({candidate,report}));
