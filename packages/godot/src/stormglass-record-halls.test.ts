import {readFileSync} from 'node:fs';
import {buildRoomConnections} from './room-assembler.js';
import {it,expect} from 'vitest';
import {GameDNASchema} from '@metroforge/schemas';
import {generateStormglassGalleryCampaign} from './stormglass-campaign-recipe.js';
import {buildStormglassGalleryBlueprint,stormglassGalleryPort} from './stormglass-gallery-blueprint.js';
import {buildStormglassArchiveChamber} from './stormglass-archive-chamber.js';
const dna=GameDNASchema.parse({version:'1',identity:{title:'Stormglass Reliquary',genre:'Metroidvania',tone:'quiet danger',visualStyle:'original gothic pixel art'},technical:{resolution:{width:1920,height:1080},tileSize:32,targetPlaytimeHours:2,difficulty:'normal'},combat:{style:'sword',meleeEnabled:true,rangedEnabled:false},movement:{walkSpeed:220,runSpeed:380,jumpHeight:160,gravity:980},abilities:['dash','double_jump','wall_slide','wall_jump','ground_slam','air_dash'].map(id=>({id,name:id,category:'movement',enabled:true})),world:{biomeCount:1,roomCount:48},narrative:{premise:'Recover the original weather seals',protagonist:'Courier',centralConflict:'Restore the castle'},seed:42,profile:'MEDIUM',archetype:'SIDE_VIEW_METROIDVANIA'});
it('adds complete upper/lower cycles while preserving grants, bosses and old choices',()=>{
 const old=generateStormglassGalleryCampaign(dna,42,'archive-wing')!,fresh=generateStormglassGalleryCampaign(dna,42,'record-halls')!;
 expect(old.roomIds).toHaveLength(48);expect(fresh.roomIds).toHaveLength(50);expect(fresh.layoutId).not.toBe(old.layoutId);
 expect(fresh.bossRoomIds).toEqual(old.bossRoomIds);expect(fresh.progressionGraph).toEqual(old.progressionGraph);
 for(const room of old.worldGraph.nodes)expect(fresh.worldGraph.nodes.find(n=>n.id===room.id)?.metadata.grantsAbilities).toEqual(room.metadata.grantsAbilities);
 for(const [from,to]of [['room_046','room_048'],['room_048','room_044'],['room_047','room_049'],['room_049','room_045']])expect(fresh.worldGraph.edges.find(e=>e.from===from&&e.to===to)).toMatchObject({requirements:[],optional:true,bidirectional:true});
 expect(buildStormglassGalleryBlueprint('archive-wing').rooms.some(r=>r.id==='room_048')).toBe(false);
});
it('each authored connection meets reciprocal physical edges with separated sensors',()=>{
 const plan=buildStormglassGalleryBlueprint('record-halls'),opposite={left:'right',right:'left',up:'down',down:'up'},ports=new Map<string,Array<{x:number;y:number}>>();
 for(const link of plan.links){const a=plan.rooms.find(r=>r.id===link.from),b=plan.rooms.find(r=>r.id===link.to);if(!a||!b)continue;
 const p=stormglassGalleryPort(a.id,b.id,link.direction,'record-halls')!,q=stormglassGalleryPort(b.id,a.id,opposite[link.direction],'record-halls')!;
 if(['left','right'].includes(link.direction))expect(a.y+p.floorY).toBe(b.y+q.floorY);else expect(a.x+p.x).toBe(b.x+q.x);
 for(const [room,port]of [[a,p],[b,q]]as const){const prior=ports.get(room.id)??[];for(const other of prior)expect(Math.hypot(port.x-other.x,port.y-other.y)).toBeGreaterThan(128);prior.push(port);ports.set(room.id,prior);}
 }
});
it('new upper approach has support below its actual ceiling sensor and continuous existing return well',()=>{
 const chamber=buildStormglassArchiveChamber('room_044','record-halls')!,port=stormglassGalleryPort('room_044','room_048','up','record-halls')!,center=port.x+12;
 expect(chamber.platforms.some(p=>p.y===128&&p.x<=center-12&&p.x+p.width>=center+12)).toBe(true);
 expect(chamber.flights.filter(f=>f.from.x<1600&&f.from.y<=704)).toHaveLength(3);
 for(const p of chamber.platforms)expect(p.x>=3392||p.x+p.width<=3264).toBe(true);
 expect(buildStormglassArchiveChamber('room_048','record-halls')).toBeDefined();
});

it('assembler preserves separate authored same-facing doorways instead of rotating a spatial edge',()=>{
 const campaign=generateStormglassGalleryCampaign(dna,42,'record-halls')!,connections=buildRoomConnections(campaign.roomIds,campaign.worldGraph.edges);
 expect(connections.get('room_045')?.find(c=>c.targetRoomId==='room_049')?.direction).toBe('left');
 expect(connections.get('room_044')?.find(c=>c.targetRoomId==='room_048')?.direction).toBe('up');
 const plan=buildStormglassGalleryBlueprint('record-halls');
 for(const room of plan.rooms)for(const conn of connections.get(room.id)??[]){const target=plan.rooms.find(r=>r.id===conn.targetRoomId);if(target)expect(()=>stormglassGalleryPort(room.id,target.id,conn.direction,'record-halls')).not.toThrow();}
});

it('ships a complete native review recipe for the50roomprofile with every reciprocal connection',()=>{
 const recipe=JSON.parse(readFileSync('templates/godot-metroidvania/data/visual/blueprints/stormglass-record-halls-campaign-v1.json','utf8')),actual=generateStormglassGalleryCampaign(dna,42,'record-halls')!;
 expect(recipe.id).toBe('stormglass-record-halls-campaign-v1');expect(new Set(recipe.worldGraph.nodes.map((n:any)=>n.id))).toEqual(new Set(actual.roomIds));expect(recipe.worldGraph.nodes).toHaveLength(50);
 const key=(e:any)=>JSON.stringify([e.from,e.to,e.transition,e.bidirectional,e.optional,[...e.requirements].sort()]);
 expect(recipe.worldGraph.edges.map(key).sort()).toEqual(actual.worldGraph.edges.map(key).sort());
 expect(new Set(recipe.worldGraph.regions.flatMap((r:any)=>r.roomIds))).toEqual(new Set(actual.roomIds));
});
