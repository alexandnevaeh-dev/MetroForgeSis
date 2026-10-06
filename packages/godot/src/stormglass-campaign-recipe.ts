import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {getResourceRoot} from '@metroforge/shared';
import {WorldGraphSchema,ProgressionGraphSchema,type GameDNA} from '@metroforge/schemas';
import {buildStormglassGalleryBlueprint} from './stormglass-gallery-blueprint.js';
/** Movement used by the native-tested gallery preview, including its 96px stair rises. */
export function applyStormglassGalleryDnaContract(dna:GameDNA):GameDNA {
 if(dna.archetype!=='SIDE_VIEW_METROIDVANIA')return dna;
 return {...dna,world:{...dna.world,biomeCount:1},technical:{...dna.technical,tileSize:32},movement:{...dna.movement,walkSpeed:220,runSpeed:380,jumpHeight:160,gravity:980}};
}
/** Explicit authored campaign choice. Never silently replaces a procedural/user-owned graph. */
export function generateStormglassGalleryCampaign(dna:GameDNA,seed:number) {
 const required=['dash','double_jump','wall_slide','wall_jump','ground_slam','air_dash'];
 const enabled=dna.abilities.filter(a=>a.enabled).map(a=>a.id);
 if(dna.archetype!=='SIDE_VIEW_METROIDVANIA'||dna.technical.tileSize!==32||!dna.identity.title.startsWith('Stormglass Reliquary'))return null;
 if(enabled.length!==required.length||required.some(id=>!enabled.includes(id)))return null;
 if(!Number.isSafeInteger(seed))throw new Error('Stormglass campaign requires an integer seed');
 const recipe=JSON.parse(readFileSync(join(getResourceRoot(),'templates/godot-metroidvania/data/visual/blueprints/stormglass-gallery-campaign-v1.json'),'utf8'));
 if(recipe.version!==1||recipe.id!=='stormglass-gallery-campaign-v1')throw new Error('Invalid Stormglass campaign recipe');
 const worldGraph=WorldGraphSchema.parse(recipe.worldGraph);
 const progressionGraph=ProgressionGraphSchema.parse(recipe.progressionGraph);
 worldGraph.seed=seed;progressionGraph.seed=seed;
 for(const node of worldGraph.nodes)if(node.type==='room')node.metadata.stormglassCampaignLayout=recipe.id;
 for(const room of buildStormglassGalleryBlueprint().rooms){
  const node=worldGraph.nodes.find(node=>node.id===room.id);
  if(!node)throw new Error('Stormglass recipe room missing: '+room.id);
  node.metadata.stormglassRoomPosition={x:room.x,y:room.y};
 }
 const roomIds=worldGraph.nodes.filter(node=>node.type==='room').map(node=>node.id);
 const finalBossRoomId=progressionGraph.endNodeId;
 if(!worldGraph.nodes.some(node=>node.id===finalBossRoomId&&node.metadata.bossArena))throw new Error('Stormglass recipe final boss is missing');
 // Region listings and graph nodes must agree, including optional backrooms.
 for(const id of roomIds)if(worldGraph.regions.filter(region=>region.roomIds.includes(id)).length!==1)throw new Error('Invalid Stormglass room region: '+id);
 const bossRoomIds=worldGraph.nodes.filter(node=>node.metadata.bossArena).map(node=>node.id);
 // Names describe the preserved combat/movement slots: crawlers crawl, winged
 // creatures fly, effigies remain traps, and spectral casters hover/teleport.
 const enemyNames=['Gallery Watchman','Veilblade Acolyte','Shardback Crawler','Glasswing Moth','Lantern Wisp',
  'Reliquary Herald','Runeseal Effigy','Ashen Librarian','Ossuary Serpent','Windbound Gargoyle',
  'Hollow Chorister','Censer Idol','Marble Hound','Runebound Sentinel','Graveglass Worm',
  'Bellbound Cantor','Memorial Ward','Chainbound Shade','Reliquary Lancer','Vault Custodian'];
 const bossNames=['Veilblade Castellan','Drowned Bellkeeper','Archivist of Ash','Tempest Abbot'];
 return {worldGraph,progressionGraph,roomIds,finalBossRoomId,bossRoomIds,enemyNames,bossNames,layoutId:recipe.id};
}
