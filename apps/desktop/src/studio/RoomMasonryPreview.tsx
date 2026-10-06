import {useId} from 'react';
export type RoomMasonryRect={name:string;x:number;y:number;width:number;height:number};
export type RoomStairFlight={from:{x:number;y:number};to:{x:number;y:number};thickness:number};
export function validStairFlights(flights:RoomStairFlight[]|undefined,width:number,height:number):flights is RoomStairFlight[]{
 return Array.isArray(flights)&&flights.length<=32&&flights.every(f=>f?.from&&f?.to&&[f.from.x,f.from.y,f.to.x,f.to.y,f.thickness].every(Number.isFinite)&&f.thickness>0&&
  [f.from,f.to].every(p=>p.x>=0&&p.x<=width&&p.y>=0&&p.y+f.thickness<=height));
}
export function validRoomMasonry(rects:RoomMasonryRect[]|undefined,width:number,height:number):rects is RoomMasonryRect[]{
 return Array.isArray(rects)&&rects.length>0&&rects.length<=512&&rects.every(r=>r&&typeof r.name==='string'&&
  [r.x,r.y,r.width,r.height].every(Number.isFinite)&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=width&&r.y+r.height<=height);
}
/** Authoring geometry preview; native play remains the artwork acceptance view. */
export function RoomMasonryPreview({rects}:{rects:RoomMasonryRect[]}){
 const id=useId().replaceAll(':','');
 return <g aria-label="Built room walls and ceilings" pointerEvents="none">
  <defs><pattern id={id} width={64} height={64} patternUnits="userSpaceOnUse">
   <rect width={64} height={64} fill="#1c2232"/>
   <rect x={1} y={1} width={62} height={30} fill="#46516b"/>
   <rect x={-31} y={33} width={62} height={30} fill="#4b5670"/>
   <rect x={33} y={33} width={62} height={30} fill="#4b5670"/>
  </pattern></defs>
  {rects.map((r,i)=><g key={`${r.name}-${i}`} data-masonry-body={r.name}>
   <rect x={r.x} y={r.y} width={r.width} height={r.height} fill="#090c14"/>
   <rect x={r.x} y={r.name.startsWith('MasonryRoof_')?r.y+Math.max(0,r.height-96):r.y}
    width={r.width} height={r.name.startsWith('MasonryRoof_')?Math.min(96,r.height):r.height} fill={`url(#${id})`}/>
  </g>)}
 </g>;
}
