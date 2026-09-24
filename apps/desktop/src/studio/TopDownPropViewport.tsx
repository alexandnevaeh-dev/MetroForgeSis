import {TopDownTerrainBrush} from './TopDownTerrainBrush.js';
import {TopDownTerrain} from './TopDownTerrain.js';
import { useEffect, useRef, useState } from 'react';
import type { TopDownEditorProp } from './TopDownPropInspector.js';

export function TopDownPropViewport({projectPath,areaId,tiles,tileSize=16,width,height,props,zoom,fit,selectedId,onSelect,onMove,terrainBrush,onPaint,busy=false}:{projectPath:string;areaId?:string;tiles?:number[][];tileSize?:number;width:number;height:number;props?:TopDownEditorProp[];zoom:number;fit:boolean;selectedId?:string;onSelect?:(id:string)=>void;terrainBrush?:number;onPaint?:(tiles:number[][])=>void;busy?:boolean;onMove?:(id:string,x:number,y:number)=>void}) {
  const drag = useRef<{id:string;pointer:number;startX:number;startY:number;x:number;y:number;clientX:number;clientY:number}|null>(null);
  const [preview,setPreview]=useState<{id:string;x:number;y:number}|null>(null);
  const cancelDrag=()=>{drag.current=null;setPreview(null);};
  useEffect(()=>{cancelDrag();},[projectPath,props,busy]);
  const point=(element:SVGGElement,clientX:number,clientY:number)=>{
    const matrix=element.ownerSVGElement?.getScreenCTM();
    return matrix ? new DOMPoint(clientX,clientY).matrixTransform(matrix.inverse()) : null;
  };
  const [images,setImages]=useState<Record<string,string>>({});
  const [status,setStatus]=useState('Loading prop artwork…');
  useEffect(()=>{
    let cancelled=false;setImages({});setStatus('Loading prop artwork…');
    const paths=[...new Set((props??[]).map(prop=>prop.image))];
    void Promise.all(paths.map(async path=>{
      if(!path.startsWith('res://')) return [path,''] as const;
      const result=await window.metroforge!.getAssetPreview(projectPath,path.slice(6));
      return [path,result.dataUrl??''] as const;
    })).then(entries=>{if(cancelled)return;setImages(Object.fromEntries(entries));setStatus(entries.some(([,url])=>!url)?'Some prop images are missing. Check the project assets.':'');}).catch(()=>{if(!cancelled)setStatus('Prop artwork could not be loaded. Reopen the room to retry.');});
    return()=>{cancelled=true;};
  },[projectPath,props]);
  const validSize=Number.isFinite(width)&&Number.isFinite(height)&&width>0&&height>0;
  return <div>
    <p className="hint">Room layout. Character rendering is available in Play Preview.</p>{onMove && terrainBrush===undefined && <p className="hint">Drag props to move them. Arrow keys move 1 pixel; Shift moves 10. Release to save, or press Escape to cancel.</p>}
    {status && <p role="status">{status}</p>}
    {!props?.length && <p className="hint">{props===undefined?'Automatic props are placed when the game runs.':'This area has no saved props.'}</p>}
    {validSize && <svg role="group" aria-label="Saved top-down prop layout" viewBox={`0 0 ${width} ${height}`} style={{width:fit?'100%':width*zoom/100,height:fit?'auto':height*zoom/100,maxWidth:'none'}}>
      <rect width={width} height={height} fill="var(--forge-bg-input)" stroke="var(--forge-border)" />
      {areaId && <TopDownTerrain projectPath={projectPath} areaId={areaId} tiles={tiles} tileSize={tileSize} width={width} height={height}/>}{[...(props??[])].sort((a,b)=>a.y-b.y).map(prop=>{
        const size=prop.layout.sourceSize as number[]|undefined,anchor=prop.layout.anchorPx as number[]|undefined;
        if(!Array.isArray(size)||!Array.isArray(anchor)||size.length!==2||anchor.length!==2||!images[prop.image])return null;
        const scale=prop.layout.displayScale; const position=preview?.id===prop.id ? preview : prop;
        return <g key={prop.id} role={onSelect ? "button" : undefined} tabIndex={onSelect && !busy ? 0 : undefined} aria-label={`Select ${prop.id}`} aria-pressed={selectedId===prop.id} aria-disabled={busy} style={{touchAction:onMove?'none':undefined,cursor:onMove&&!busy?'move':undefined}}
          onPointerDown={event=>{
            if(busy||!onMove||event.button!==0)return;
            const p=point(event.currentTarget,event.clientX,event.clientY);if(!p)return;
            event.preventDefault();event.currentTarget.focus();onSelect?.(prop.id);
            drag.current={id:prop.id,pointer:event.pointerId,startX:p.x,startY:p.y,x:prop.x,y:prop.y,clientX:event.clientX,clientY:event.clientY};
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={event=>{
            const d=drag.current;if(!d||d.id!==prop.id||d.pointer!==event.pointerId)return;
            const p=point(event.currentTarget,event.clientX,event.clientY);if(!p)return;
            setPreview({id:d.id,x:d.x+p.x-d.startX,y:d.y+p.y-d.startY});
          }}
          onPointerUp={event=>{
            const d=drag.current;if(!d||d.pointer!==event.pointerId)return;
            const p=point(event.currentTarget,event.clientX,event.clientY);
            cancelDrag();if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
            if(p&&!busy&&Math.hypot(event.clientX-d.clientX,event.clientY-d.clientY)>=3)onMove?.(d.id,d.x+p.x-d.startX,d.y+p.y-d.startY);
          }}
          onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag}
          onClick={() => { if(!busy) onSelect?.(prop.id); }} onKeyDown={event => { if(event.key==='Escape'){event.preventDefault();cancelDrag();return;}
            if(!busy&&onMove&&!drag.current&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
              event.preventDefault();const step=event.shiftKey?10:1;
              onMove(prop.id,prop.x+(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0),prop.y+(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0));return;
            }
            if(!busy && (event.key === "Enter" || event.key === " ")) {event.preventDefault();onSelect?.(prop.id);} }}><image href={images[prop.image]} x={position.x-anchor[0]!*scale} y={position.y-anchor[1]!*scale} width={size[0]!*scale} height={size[1]!*scale} style={{imageRendering:'pixelated'}}><title>{prop.id}</title></image>{selectedId===prop.id && <rect x={position.x-anchor[0]!*scale} y={position.y-anchor[1]!*scale} width={size[0]!*scale} height={size[1]!*scale} fill="none" stroke="var(--forge-border-focus)" vectorEffect="non-scaling-stroke" strokeWidth="2" pointerEvents="none" aria-hidden="true" />}</g>;
      })}
    {terrainBrush!==undefined && tiles?.length && onPaint && <TopDownTerrainBrush tiles={tiles} tileSize={tileSize} width={width} height={height} value={terrainBrush} busy={busy} onSave={onPaint}/>}</svg>}
  </div>;
}
