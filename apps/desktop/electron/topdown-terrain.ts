import {readFileSync,realpathSync,statSync} from 'node:fs';
import {join,relative,isAbsolute} from 'node:path';
export function readTopDownTerrain(projectPath:string){
 const root=realpathSync(projectPath),file=realpathSync(join(root,'assets/tilesets/biome_0/terrain.json'));
 const rel=relative(root,file);if(rel.startsWith('..')||isAbsolute(rel))throw Error('Terrain metadata outside project');
 if(statSync(file).size>262144)throw Error('Terrain metadata too large');
 const raw=JSON.parse(readFileSync(file,'utf8'));
 if(!Number.isSafeInteger(raw.tileSize)||raw.tileSize<1||raw.tileSize>1024||!Array.isArray(raw.roles))throw Error('Invalid terrain metadata');
 const roles:Record<string,[number,number]>=Object.create(null);
 for(const entry of raw.roles){if(typeof entry.role!=='string'||![entry.col,entry.row].every(n=>Number.isSafeInteger(n)&&n>=0))throw Error('Invalid terrain atlas role');roles[entry.role]=[entry.col,entry.row];}
 return {tileSize:raw.tileSize as number,roles};
}
