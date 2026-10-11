import {useId} from 'react';
export type RoomMasonryRect={name:string;x:number;y:number;width:number;height:number};
export type RoomStairFlight={from:{x:number;y:number};to:{x:number;y:number};thickness:number};
/** Same 32 shallow treads and 40px handrail as the native stair renderer. */
export function RoomStairPreview({flight:f,index}:{flight:RoomStairFlight;index:number}){
 const point=(t:number)=>({x:f.from.x+(f.to.x-f.from.x)*t,y:f.from.y+(f.to.y-f.from.y)*t});
 return <g aria-label={`Built stair flight ${index+1}`} pointerEvents="none">
  <polygon data-stair-flight={index} points={`${f.from.x},${f.from.y} ${f.to.x},${f.to.y} ${f.to.x},${f.to.y+f.thickness} ${f.from.x},${f.from.y+f.thickness}`} fill="#46516b" stroke="#a1aec5" strokeWidth={2}/>
  {Array.from({length:32},(_,step)=>{const a=point(step/32),b=point((step+1)/32),y=(a.y+b.y)/2;return <g key={step} data-stair-tread={step}>
   <rect x={Math.min(a.x,b.x)} y={y} width={Math.abs(b.x-a.x)} height={8} fill="#67758f"/>
   <line x1={Math.min(a.x,b.x)} y1={y} x2={Math.max(a.x,b.x)} y2={y} stroke="#bdc9d9" strokeWidth={2}/>
  </g>;})}
  <line data-stair-handrail={index} x1={f.from.x} y1={f.from.y-40} x2={f.to.x} y2={f.to.y-40} stroke="#a99467" strokeWidth={2}/>
  {Array.from({length:8},(_,i)=>{const p=point((i+1)/9);return <line key={i} x1={p.x} y1={p.y} x2={p.x} y2={p.y-40} stroke="#71664e" strokeWidth={2}/>;})}
 </g>;
}
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
