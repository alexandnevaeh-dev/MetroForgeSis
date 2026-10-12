import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
import {GameDNASchema} from '@metroforge/schemas';
import {generateStormglassGalleryCampaign} from './stormglass-campaign-recipe.js';
import {buildStormglassGalleryBlueprint,stormglassGalleryPort} from './stormglass-gallery-blueprint.js';
import {buildRoomConnections} from './room-assembler.js';
const dna=GameDNASchema.parse({version:'1',identity:{title:'Stormglass Reliquary',genre:'Metroidvania',tone:'quiet danger',visualStyle:'original gothic pixel art'},technical:{resolution:{width:1920,height:1080},tileSize:32,targetPlaytimeHours:2,difficulty:'normal'},combat:{style:'sword',meleeEnabled:true,rangedEnabled:false},movement:{walkSpeed:220,runSpeed:380,jumpHeight:160,gravity:980},abilities:['dash','double_jump','wall_slide','wall_jump','ground_slam','air_dash'].map(id=>({id,name:id,category:'movement',enabled:true})),world:{biomeCount:1,roomCount:48},narrative:{premise:'Recover the original weather seals',protagonist:'Courier',centralConflict:'Restore the castle'},seed:42,profile:'MEDIUM',archetype:'SIDE_VIEW_METROIDVANIA'});

it('preserves all existing rooms, grants and campaign progression in a fresh west loop',()=>{
 const old=generateStormglassGalleryCampaign(dna,42,'record-halls')!,fresh=generateStormglassGalleryCampaign(dna,42,'great-archive')!;
 expect(old.roomIds).toHaveLength(50);expect(fresh.roomIds).toHaveLength(53);
 expect(fresh.progressionGraph).toEqual(old.progressionGraph);expect(fresh.bossRoomIds).toEqual(old.bossRoomIds);
 for(const n of old.worldGraph.nodes){const actual=fresh.worldGraph.nodes.find(x=>x.id===n.id)!;expect(actual.metadata.grantsAbilities).toEqual(n.metadata.grantsAbilities);expect(actual.metadata.stormglassRoomPosition).toEqual(n.metadata.stormglassRoomPosition);}
 expect(buildStormglassGalleryBlueprint('great-archive').rooms.filter(r=>Number(r.id.slice(5))<50)).toEqual(buildStormglassGalleryBlueprint('record-halls').rooms);
});
it('fits a substantial archive footprint without inflating exterior gaps or overlapping chambers',()=>{
 const rooms=buildStormglassGalleryBlueprint('great-archive').rooms.filter(r=>Number(r.id.slice(5))>=43);
 const width=Math.max(...rooms.map(r=>r.x+r.width))-Math.min(...rooms.map(r=>r.x));
 const height=Math.max(...rooms.map(r=>r.y+r.height))-Math.min(...rooms.map(r=>r.y));
 expect(width/967.111).toBeGreaterThan(12);expect(height/544).toBeGreaterThanOrEqual(6);expect(height/544).toBeLessThanOrEqual(14);
 for(let i=0;i<rooms.length;i++)for(let j=i+1;j<rooms.length;j++){const a=rooms[i]!,b=rooms[j]!;expect(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y).toBe(false);}
 for(const id of ['room_050','room_052'])expect(rooms.find(r=>r.id===id)!.width/967.111).toBeGreaterThan(5);
});
it('keeps every new door reciprocal, physically adjacent and separated from other same-facing sensors',()=>{
 const profile='great-archive',plan=buildStormglassGalleryBlueprint(profile),campaign=generateStormglassGalleryCampaign(dna,42,profile)!,connections=buildRoomConnections(campaign.roomIds,campaign.worldGraph.edges),opposite={left:'right',right:'left',up:'down',down:'up'};
 const ports=new Map<string,Array<{x:number;y:number}>>();
 for(const link of plan.links){const a=plan.rooms.find(r=>r.id===link.from),b=plan.rooms.find(r=>r.id===link.to);if(!a||!b)continue;
 const p=stormglassGalleryPort(a.id,b.id,link.direction,profile)!,q=stormglassGalleryPort(b.id,a.id,opposite[link.direction],profile)!;
 if(['left','right'].includes(link.direction))expect(a.y+p.floorY).toBe(b.y+q.floorY);else expect(a.x+p.x).toBe(b.x+q.x);
 for(const [room,port]of [[a,p],[b,q]]as const){const prior=ports.get(room.id)??[];for(const other of prior)expect(Math.hypot(port.x-other.x,port.y-other.y)).toBeGreaterThan(128);prior.push(port);ports.set(room.id,prior);}
 expect(connections.get(a.id)?.find(c=>c.targetRoomId===b.id)?.direction).toBe(link.direction);
 }
 for(const id of ['room_050','room_051','room_052'])expect(connections.get(id)).toHaveLength(2);
});

it('ships a review recipe matching the generated campaign, including all west links',()=>{
 const recipe=JSON.parse(readFileSync('templates/godot-metroidvania/data/visual/blueprints/stormglass-great-archive-campaign-v1.json','utf8')),actual=generateStormglassGalleryCampaign(dna,42,'great-archive')!;
 expect(recipe.worldGraph).toEqual(actual.worldGraph);expect(recipe.progressionGraph).toEqual(actual.progressionGraph);expect(recipe.id).toBe('stormglass-great-archive-campaign-v1');
});
