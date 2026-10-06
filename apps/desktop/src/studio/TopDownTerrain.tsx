import {useEffect,useState} from 'react';
import {terrainAtlasCell} from './topdown-terrain.js';
export function TopDownTerrain({projectPath,areaId,tiles,tileSize,width,height}:{projectPath:string;areaId:string;tiles?:number[][];tileSize:number;width:number;height:number}){
 const [image,setImage]=useState('');
 const [status,setStatus]=useState('Loading terrain…');
 useEffect(()=>{let cancelled=false;setImage('');setStatus('Loading terrain…');
 void (async()=>{
  if(!tiles?.length)throw Error('This room has no terrain grid.');
  const atlas=await window.metroforge!.getTilesetPreview(projectPath,'biome_0').catch(()=>{throw Error('Terrain artwork or placement settings could not be loaded.');});
  if(!atlas.dataUrl||!atlas.roles||!atlas.tileSize)throw Error('Terrain artwork or placement settings are missing.');
  if(atlas.tileSize!==tileSize)throw Error('Terrain tile size differs from the room; preview unavailable.');
  if(width*height>16777216||width>8192||height>8192)throw Error('This room exceeds the terrain preview size limit.');
  const source=new Image();source.src=atlas.dataUrl;await source.decode();if(cancelled)return;
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');if(!ctx)throw Error('Terrain preview unavailable.');ctx.imageSmoothingEnabled=false;
  for(let y=0;y<height/tileSize;y++)for(let x=0;x<width/tileSize;x++){
   const [col,row]=terrainAtlasCell(areaId,tiles[y]?.[x]??3,x,y,atlas.roles);const sx=col*tileSize,sy=row*tileSize;
   if(sx+tileSize>source.width||sy+tileSize>source.height)throw Error('Terrain role is outside its artwork atlas.');
   ctx.drawImage(source,sx,sy,tileSize,tileSize,x*tileSize,y*tileSize,tileSize,tileSize);
  }
  if(!cancelled){setImage(canvas.toDataURL());setStatus('');}
 })().catch(error=>{if(!cancelled)setStatus(error instanceof Error?error.message:'Terrain preview unavailable.');});
 return()=>{cancelled=true};},[projectPath,areaId,tiles,tileSize,width,height]);
 return <g pointerEvents="none" aria-label="Room terrain">{image&&<image href={image} width={width} height={height} style={{imageRendering:'pixelated'}}/>}{status&&<foreignObject width={width} height={80}><p role="status" className="hint">{status}</p></foreignObject>}</g>;
}
