import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {canopyActor,canopyEffect,CANOPY_ACTION_FRAMES,CANOPY_EFFECT_IDS} from '../packages/assets/dist/topdown-canopy-art.js';
const root='GeneratedGames/test-games/topdown/current/';
const records=[];
const compare=(path,buffer)=>{
  const native=readFileSync(root+path),sha256=createHash('sha256').update(native).digest('hex');
  if(!buffer.equals(native))throw Error('Shared source differs from native-tested sprite: '+path);
  records.push({path,sha256});
};
for(const [action,count] of Object.entries(CANOPY_ACTION_FRAMES))for(const facing of ['N','NE','E','SE','S','SW','W','NW'])compare(`assets/characters/player_${action}_${facing}.png`,canopyActor('hero',action,facing,count));
for(const [id,kind,folder] of [['enemy_000','melee','enemies'],['enemy_001','ranged','enemies'],['boss_final','boss','bosses'],['npc_000','npc','npcs']])for(const [action,count] of Object.entries(CANOPY_ACTION_FRAMES))compare(`assets/${folder}/${id}_${action}.png`,canopyActor(kind,action,'S',count));
for(const id of [...CANOPY_EFFECT_IDS,'ranged_projectile'])compare(`assets/vfx/${id}.png`,canopyEffect(id,id==='ranged_projectile'?1:10));
const result={checked:records.length,identicalToNativeTestedArt:true,productionApproved:false,records};
writeFileSync('reports/game-tests/20261001-canopy-actor-integration/shared-art-identity.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({checked:records.length,identicalToNativeTestedArt:true}));
