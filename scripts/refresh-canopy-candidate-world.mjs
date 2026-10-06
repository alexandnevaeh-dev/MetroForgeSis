import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {buildRuinedCanopy} from './lib/ruined-canopy-world.mjs';
const project=resolve(process.argv[2]??'');
if(!project.startsWith(resolve('GeneratedGames/test-games/topdown')+sep)||!project.includes('candidate-canopy-'))throw Error('Expected an isolated candidate');
const file=join(project,'data/world/overworld.json');
const world=JSON.parse(readFileSync(file));
const generated=buildRuinedCanopy(world.seed).overworld;
for(const area of world.areas){
 const fresh=generated.areas.find(item=>item.id===area.id);
 if(!fresh)throw Error('Unknown area '+area.id);
 for(const key of ['tiles','floorRoles','collisionRects','buildings'])if(fresh[key]!==undefined)area[key]=fresh[key];
}
writeFileSync(file,JSON.stringify(world,null,2));
console.log('Updated physical grids from the shared world generator; preserved generated artwork and POIs.');
