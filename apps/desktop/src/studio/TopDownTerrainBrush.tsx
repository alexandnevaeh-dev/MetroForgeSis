import {useEffect,useRef,useState} from 'react';
export function TopDownTerrainBrush({tiles,tileSize,width,height,value,busy,onSave}:{tiles:number[][];tileSize:number;width:number;height:number;value:number;busy:boolean;onSave:(tiles:number[][])=>void}){
 const stroke=useRef<{pointer:number;grid:number[][];last:[number,number];cells:Map<string,[number,number]>}|null>(null);
 const [cursor,setCursor]=useState<[number,number]>([0,0]);
 const [cells,setCells]=useState<[number,number][]>([]);
 const cancel=()=>{stroke.current=null;setCells([])};
 useEffect(()=>{cancel()},[tiles,value,busy]);
 const paint=(x:number,y:number)=>{const s=stroke.current;if(!s)return;const [a,b]=s.last,n=Math.max(Math.abs(x-a),Math.abs(y-b),1);for(let i=0;i<=n;i++){const cx=Math.round(a+(x-a)*i/n),cy=Math.round(b+(y-b)*i/n);if(s.grid[cy]?.[cx]!==undefined){s.grid[cy]![cx]=value;s.cells.set(`${cx}:${cy}`,[cx,cy])}}s.last=[x,y];setCells([...s.cells.values()]);};
 return <g><title>{`Brush column ${cursor[0]+1}, row ${cursor[1]+1}. Arrow keys move; Enter or Space paints.`}</title><rect width={width} height={height} fill="transparent" role="button" aria-label="Paint room terrain" tabIndex={busy?-1:0} style={{touchAction:'none',cursor:'crosshair'}}
 onPointerDown={e=>{if(busy||e.button!==0)return;const m=e.currentTarget.ownerSVGElement?.getScreenCTM();if(!m)return;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse());const x=Math.floor(p.x/tileSize),y=Math.floor(p.y/tileSize);e.preventDefault();e.currentTarget.focus();stroke.current={pointer:e.pointerId,grid:structuredClone(tiles),last:[x,y],cells:new Map()};e.currentTarget.setPointerCapture(e.pointerId);paint(x,y)}}
 onPointerMove={e=>{if(stroke.current?.pointer!==e.pointerId)return;const m=e.currentTarget.ownerSVGElement?.getScreenCTM();if(!m)return;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse());paint(Math.max(0,Math.min(tiles[0]!.length-1,Math.floor(p.x/tileSize))),Math.max(0,Math.min(tiles.length-1,Math.floor(p.y/tileSize))))}}
 onPointerUp={e=>{const s=stroke.current;if(!s||s.pointer!==e.pointerId)return;cancel();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);if(!busy&&s.cells.size&&JSON.stringify(s.grid)!==JSON.stringify(tiles))onSave(s.grid)}} onPointerCancel={cancel} onLostPointerCapture={cancel}
 onKeyDown={e=>{
 if(e.key==='Escape'){e.preventDefault();cancel();return}
 if(busy||stroke.current)return;
 const [x,y]=cursor;
 const delta:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
 if(delta[e.key]){e.preventDefault();const [dx,dy]=delta[e.key]!;setCursor([Math.max(0,Math.min((tiles[0]?.length??1)-1,x+dx)),Math.max(0,Math.min(tiles.length-1,y+dy))]);}
 else if(e.key==='Enter'||e.key===' '){e.preventDefault();if(e.repeat||tiles[y]?.[x]===undefined||tiles[y]![x]===value)return;const grid=structuredClone(tiles);grid[y]![x]=value;onSave(grid);}
}}/>
 {cells.map(([x,y])=><rect key={`${x}:${y}`} x={x*tileSize} y={y*tileSize} width={tileSize} height={tileSize} fill="var(--forge-border-focus)" opacity="0.5" pointerEvents="none"/>)}
 <rect x={cursor[0]*tileSize} y={cursor[1]*tileSize} width={tileSize} height={tileSize} fill="none" stroke="var(--forge-border-focus)" vectorEffect="non-scaling-stroke" pointerEvents="none" aria-hidden="true"/></g>;
}
