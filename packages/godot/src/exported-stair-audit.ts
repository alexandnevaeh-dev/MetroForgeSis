import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import type {WorldGraph} from '@metroforge/schemas';
import type {AuthoredStairApproach} from '@metroforge/procedural';

type Section = {header:string;body:string};
function sections(scene:string): Section[] {
  return [...scene.matchAll(/^\[([^\n]+)\]\r?\n([^]*?)(?=^\[|$(?![^]))/gm)].map(m=>({header:m[1]!,body:m[2]!}));
}
function vector(body:string,key:string): {x:number;y:number} | undefined {
  const match=body.match(new RegExp(`^${key} = Vector2\\(([^,]+), ([^)]+)\\)`,'m'));
  return match?{x:Number(match[1]),y:Number(match[2])}:undefined;
}
function attribute(header:string,key:string): string | undefined {
  return header.match(new RegExp(`(?:^| )${key}="([^"]+)"`))?.[1];
}

/** Independently inspect emitted collision nodes, not the exporter report or
 * graph's profile metadata. Unrecognized collision is deliberately unsupported. */
export function exportedStairApproaches(projectPath:string,graph:WorldGraph): Record<string,AuthoredStairApproach> {
  const result:Record<string,AuthoredStairApproach>={};
  // These dimensions are the contract used by the geometry audit. Custom actor
  // or door sensors need their own model rather than inheriting this allowance.
  try {
    const player=readFileSync(join(projectPath,'scenes/player/Player.tscn'),'utf8');
    const transition=readFileSync(join(projectPath,'scenes/world/RoomTransition.tscn'),'utf8');
    if(!player.includes('size = Vector2(24, 48)')||!player.includes('position = Vector2(0, -24)')||
      !transition.includes('size = Vector2(24, 80)')||!transition.includes('position = Vector2(12, 40)'))return result;
  } catch {return result;}
  for(const edge of graph.edges) {
    if(edge.transition!=='up'||!edge.requirements.length||!/^[a-zA-Z0-9_-]+$/.test(edge.from))continue;
    try {
      const scene=readFileSync(join(projectPath,'scenes/rooms',edge.from+'.tscn'),'utf8'),all=sections(scene);
      const nodes=all.filter(s=>s.header.startsWith('node '));
      const ground=nodes.find(s=>attribute(s.header,'name')==='Ground');
      if(!ground || /^tile_cells = (?!PackedVector2Array\(\))/m.test(ground.body))continue;
      const width=Number(ground.body.match(/^room_width = (.+)$/m)?.[1]),height=Number(ground.body.match(/^room_height = (.+)$/m)?.[1]);
      const bodies=nodes.filter(s=>attribute(s.header,'type')==='StaticBody2D');
      const solids:AuthoredStairApproach['solids']=[],landings:AuthoredStairApproach['landings']=[],flights:AuthoredStairApproach['flights']=[];
      let supported=true;
      for(const body of bodies) {
        if(attribute(body.header,'parent')!=='.'||/^(rotation|scale|transform|script|disabled) =/m.test(body.body)||
          /^collision_layer = (?!1$)/m.test(body.body)){supported=false;break;}
        const name=attribute(body.header,'name')!,position=vector(body.body,'position')??{x:0,y:0};
        const collision=nodes.filter(s=>attribute(s.header,'parent')===name&&['CollisionShape2D','CollisionPolygon2D'].includes(attribute(s.header,'type')??''));
        if(collision.length!==1){supported=false;break;}
        const shape=collision[0]!;
        if(/^(rotation|scale|transform|disabled) =/m.test(shape.body)){supported=false;break;}
        const offset=vector(shape.body,'position')??{x:0,y:0};
        if(attribute(shape.header,'type')==='CollisionPolygon2D') {
          const polygon=shape.body.match(/^polygon = PackedVector2Array\(([^)]+)\)/m)?.[1]?.split(',').map(Number);
          if(!name.startsWith('StairFlight_')||!/^one_way_collision = true$/m.test(shape.body)||!polygon||polygon.length!==8||
            polygon[4]!==polygon[2]||polygon[6]!==polygon[0]||polygon[5]!-polygon[3]!==polygon[7]!-polygon[1]){supported=false;break;}
          flights.push({from:{x:polygon[0]!+position.x+offset.x,y:polygon[1]!+position.y+offset.y},
            to:{x:polygon[2]!+position.x+offset.x,y:polygon[3]!+position.y+offset.y},thickness:polygon[7]!-polygon[1]!});
        } else {
          const id=shape.body.match(/^shape = SubResource\("([^"]+)"\)/m)?.[1];
          const resource=all.find(s=>s.header.startsWith('sub_resource ')&&attribute(s.header,'id')===id&&attribute(s.header,'type')==='RectangleShape2D');
          const size=resource&&vector(resource.body,'size');
          if(!size){supported=false;break;}
          const rect={x:position.x+offset.x-size.x/2,y:position.y+offset.y-size.y/2,width:size.x,height:size.y};
          if(/^one_way_collision = true$/m.test(shape.body))landings.push(rect);else solids.push(rect);
        }
      }
      if(!supported||!flights.length)continue;
      const door=nodes.find(s=>/^transition_direction = "up"$/m.test(s.body)&&s.body.includes(`target_room_id = "${edge.to}"`));
      const anchor=door&&vector(door.body,'position');
      const locks=door?.body.match(/^required_abilities = PackedStringArray\(([^)]*)\)/m)?.[1]?.match(/"([^"]+)"/g)?.map(s=>s.slice(1,-1))??[];
      if(!door||!anchor||locks.length!==edge.requirements.length||locks.some(lock=>!edge.requirements.includes(lock)))continue;
      const floorY=flights[0]!.from.y;
      const supports=solids.filter(r=>Math.abs(r.y-floorY)<0.01&&r.x<=flights[0]!.from.x-12&&r.x+r.width>=flights[0]!.from.x+12);
      if(!supports.length)continue;
      result[edge.id]={from:edge.from,to:edge.to,width,height,floorY,oneWay:true,flights,landings,solids,pits:[],door:anchor};
    } catch { /* Missing/malformed export retains the generic feasibility failure. */ }
  }
  return result;
}
