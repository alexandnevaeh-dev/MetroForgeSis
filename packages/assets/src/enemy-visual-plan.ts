import type {Enemy} from '@metroforge/schemas';
import {pickEnemyArchetype,type EnemyArchetype} from './png.js';

export type EnemyVisualDefinition=Pick<Enemy,'id'|'name'|'movement'|'combat'>;
/** Bind neutral artwork to an existing gameplay identity; this never changes gameplay. */
export function enemyVisualPlan(id:string,definition:EnemyVisualDefinition|undefined,sideView:boolean){
 if(!definition||!sideView)return {archetype:pickEnemyArchetype(id),subject:undefined};
 let archetype:EnemyArchetype;
 if(['fly','hover'].includes(definition.movement))archetype='flying';
 else if(['crawl','burrow'].includes(definition.movement))archetype='crawler';
 else if(definition.movement==='teleport'||['burst','beam','area','summon','trap'].includes(definition.combat.type))archetype='caster';
 else if(definition.movement==='charge')archetype='armored';
 else archetype='humanoid';
 const identity=`Character identity: ${definition.name}.`;
 const subject=archetype==='caster'&&/librarian|archivist|scribe|folio/i.test(definition.name)
  ?`One right-facing side-view folio caster: charcoal robe, black hood with a tiny turquoise pupil, small brass clasp, brown open book held forward in visible black gloves, separated black boots. ${identity} Full-body neutral pose, no scenery or teleport effects.`
  :`One ${archetype==='flying'?'winged flying':archetype==='crawler'?'low ground-crawling':archetype==='caster'?'robed caster':archetype==='armored'?'armored humanoid':'humanoid'} enemy, right-facing side view, readable full-body neutral silhouette. ${identity} No scenery or attack effects.`;
 return {archetype,subject};
}
