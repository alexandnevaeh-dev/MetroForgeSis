import type {GameplayRoom,GameplayRect} from './types.js';

export interface FurnishingRequest {
  id: string; role: string; asset: string; x: number; floorY: number;
  width: number; height: number; mounting: 'floor' | 'rear-wall';
  sectionId?: string;
}
export interface FurnishingPlacement extends FurnishingRequest {
  /** Decorative only. Rewards keep their separately authored collision and pickup. */
  collision: 'none'; layer: 'rear' | 'front'; anchor: string;
}
export interface FurnishingOmission {id: string; reason: string}
const overlaps=(a:GameplayRect,b:GameplayRect)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;

/** Combine adjacent coplanar tiles, never bridge a gap between them. */
export function floorSupports(room:Pick<GameplayRoom,'solids'>,floorY:number) {
  const spans=room.solids.filter(r=>Math.abs(r.y-floorY)<=0.5&&r.width>0&&r.height>0)
    .map(r=>({left:r.x,right:r.x+r.width,names:[r.name??'solid']})).sort((a,b)=>a.left-b.left);
  const joined:typeof spans=[];
  for(const span of spans){const last=joined.at(-1);if(last&&span.left<=last.right+0.01){last.right=Math.max(last.right,span.right);last.names.push(...span.names);}else joined.push(span);}
  return joined;
}

/** Authored requests stay at their authored coordinates; unsafe requests are explained, never scattered. */
export function placeFurnishings(room:GameplayRoom,requests:FurnishingRequest[]) {
  const placements:FurnishingPlacement[]=[],omissions:FurnishingOmission[]=[];
  const seen=new Set<string>();
  for(const request of requests){
    let reason='';
    const box={x:request.x-request.width/2,y:request.floorY-request.height,width:request.width,height:request.height};
    const supports=floorSupports(room,request.floorY);
    const support=supports.find(s=>s.left<=box.x&&s.right>=box.x+box.width);
    if(!request.id||seen.has(request.id)||![request.x,request.floorY,request.width,request.height].every(Number.isFinite)
      ||request.width<=0||request.height<=0||!/^assets\/[a-zA-Z0-9_/-]+\.png$/.test(request.asset)
      ||!['floor','rear-wall'].includes(request.mounting))reason='invalid-request';
    else if(box.x<0||box.x+box.width>room.width||box.y<0||request.floorY>room.height)reason='outside-room';
    else if(request.mounting==='floor'&&!support)reason='unsupported-full-footprint';
    else if(room.doors.some(d=>overlaps(box,{x:d.x-112,y:d.y-32,width:d.width+224,height:d.height+64})))reason='door-arrival-or-return';
    else if(request.mounting==='floor'&&room.solids.some(s=>overlaps(box,s)))reason='solid-or-overhead-clearance';
    else if(request.mounting==='floor'&&(room.stairFlights??[]).some(s=>overlaps(box,{x:Math.min(s.from.x,s.to.x)-32,y:Math.min(s.from.y,s.to.y)-64,width:Math.abs(s.from.x-s.to.x)+64,height:Math.abs(s.from.y-s.to.y)+128})))reason='stair-flight-clearance';
    else if([...(room.npcs??[]),...(room.enemy?[room.enemy]:[]),...(room.checkpoint?[room.checkpoint]:[]),{x:room.spawnX,y:room.spawnY}].some(a=>overlaps(box,{x:a.x-64,y:a.y-112,width:128,height:144})))reason='actor-or-arrival-readability';
    else if(placements.some(p=>overlaps(box,{x:p.x-p.width/2,y:p.floorY-p.height,width:p.width,height:p.height})))reason='furnishing-overlap';
    seen.add(request.id);
    if(reason)omissions.push({id:request.id,reason});
    else placements.push({...request,collision:'none',layer:request.mounting==='rear-wall'?'rear':'front',anchor:request.mounting==='floor'?support!.names.join('+'):`rear-plane:${request.sectionId??room.id}`});
  }
  return {placements,omissions};
}

/** Legacy fixtures get a supported surface bay, not a percentage of the room width. */
export function surfaceBays(room:GameplayRoom) {
  return floorSupports(room,room.floorTop).filter(s=>s.right-s.left>=192)
    .map(s=>({x:(s.left+s.right)/2,floorY:room.floorTop,anchor:s.names.join('+')}));
}
