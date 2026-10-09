import {readFileSync} from 'node:fs';import {describe,it,expect} from 'vitest';
import {GameDNASchema} from '@metroforge/schemas';
import {generateStormglassGalleryCampaign} from './stormglass-campaign-recipe.js';
const dna=GameDNASchema.parse({version:'1',identity:{title:'Stormglass Reliquary',genre:'Metroidvania',tone:'quiet danger',visualStyle:'original gothic pixel art'},technical:{resolution:{width:1920,height:1080},tileSize:32,targetPlaytimeHours:2,difficulty:'normal'},combat:{style:'sword',meleeEnabled:true,rangedEnabled:false},movement:{walkSpeed:220,runSpeed:380,jumpHeight:160,gravity:980},abilities:['dash','double_jump','wall_slide','wall_jump','ground_slam','air_dash'].map(id=>({id,name:id,category:'movement',enabled:true})),world:{biomeCount:1,roomCount:48},narrative:{premise:'Recover the original weather seals',protagonist:'Courier',centralConflict:'Restore the castle'},seed:42,profile:'MEDIUM',archetype:'SIDE_VIEW_METROIDVANIA'});
const recipe=(id:string)=>JSON.parse(readFileSync('templates/godot-metroidvania/data/visual/blueprints/'+id+'.json','utf8'));
describe('Declared archive campaign recipe',()=>{
 it('independently declares every generated room and preserves the base campaign grants and bosses',()=>{
  const actual=generateStormglassGalleryCampaign(dna,42,'archive-wing')!,declared=recipe('stormglass-archive-wing-campaign-v1'),base=recipe('stormglass-gallery-campaign-v1');
  expect(actual.roomIds).toHaveLength(48);expect(new Set(declared.worldGraph.nodes.map((n:any)=>n.id)).size).toBe(48);
  expect(new Set(actual.roomIds)).toEqual(new Set(declared.worldGraph.nodes.map((n:any)=>n.id)));
  for(const n of declared.worldGraph.nodes){const emitted=actual.worldGraph.nodes.find(node=>node.id===n.id)!;expect(emitted.label).toBe(n.label);expect(emitted.metadata.archetype).toBe(n.metadata.archetype);expect(emitted.metadata.targetTileWidth).toBe(n.metadata.targetTileWidth);expect(emitted.metadata.targetTileHeight).toBe(n.metadata.targetTileHeight);}
  for(const n of base.worldGraph.nodes){const emitted=actual.worldGraph.nodes.find(node=>node.id===n.id)!;expect(emitted.metadata.grantsAbilities??[]).toEqual(n.metadata.grantsAbilities??[]);expect(Boolean(emitted.metadata.bossArena)).toBe(Boolean(n.metadata.bossArena));}
  expect(actual.bossRoomIds).toEqual(['room_008','room_018','room_028','room_038']);
  const edgeKey=(e:any)=>JSON.stringify([e.from,e.to,e.transition,[...e.requirements].sort(),e.optional,e.bidirectional]);
  expect(actual.worldGraph.edges.map(edgeKey).sort()).toEqual(declared.worldGraph.edges.map(edgeKey).sort());
 });
 it('retains a distinct complete expanded recipe instead of falling back to the 43-room blueprint',()=>{
  const declared=recipe('stormglass-expanded-region-campaign-v1');expect(declared.id).toBe('stormglass-expanded-region-campaign-v1');expect(declared.worldGraph.nodes).toHaveLength(46);
 });
});
