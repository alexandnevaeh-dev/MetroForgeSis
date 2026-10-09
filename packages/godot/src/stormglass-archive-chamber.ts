import {buildStormglassGalleryStairPlatforms,buildStormglassStairFlights} from './stormglass-gallery-blueprint.js';
/** Original chamber collision; existing earned movement, no actor or pickup grants. */
export function buildStormglassArchiveChamber(roomId:string){
 if(roomId==='room_044'){
  const platforms=buildStormglassGalleryStairPlatforms(1536).filter(p=>p.y>=704);
  platforms.push({x:96,y:704,width:3168,height:32},{x:3392,y:704,width:1696,height:32});
  const flights=buildStormglassStairFlights(1536).filter(f=>f.to.y>=704);
  for(let i=0;i<3;i++){
   const fromX=i%2===0?2208:2928,toX=i%2===0?2928:2208;
   flights.push({from:{x:fromX,y:704-i*192},to:{x:toX,y:704-(i+1)*192},thickness:32});
   platforms.push({x:toX-32,y:704-(i+1)*192,width:128,height:32});
  }
  platforms.push({x:2176,y:128,width:800,height:32});
  // A service return joins the vault arrival to the nearby east mezzanine.
  // Keep the established 192/720 flight pitch; the lower room remains connected.
  for(let i=0;i<4;i++){
   const fromX=i%2===0?3520:4240,toX=i%2===0?4240:3520;
   flights.push({from:{x:fromX,y:1472-i*192},to:{x:toX,y:1472-(i+1)*192},thickness:32});
   platforms.push({x:toX-32,y:1472-(i+1)*192,width:128,height:32});
  }
  return {platforms,flights,lowerFloorY:1472,mezzanineFloorY:704,lowerClearance:736,returnWell:{left:3264,right:3392}};
 }
 if(['room_046','room_047'].includes(roomId)){
  const scale=1.5,well=true;
  const platforms=buildStormglassGalleryStairPlatforms(1536).map(p=>({...p,x:p.x*scale,width:p.width*scale}));
  const flights=buildStormglassStairFlights(1536,false,well).map(f=>({...f,from:{x:f.from.x*scale,y:f.from.y},to:{x:f.to.x*scale,y:f.to.y}}));
  // A broad top shelf supports the entry/return Up approach on both sides.
  platforms.push({x:32,y:128,width:640,height:32},{x:864,y:128,width:640,height:32});
  const supported=platforms.flatMap(p=>p.x>=864||p.x+p.width<=672?[p]:[
   {...p,width:672-p.x},{...p,x:864,width:p.x+p.width-864},
  ].filter(part=>part.width>0));
  // The lower vault's ceiling exit needs a supported ordinary takeoff beneath
  // the narrow sensor. A short bridge replaces the two large arrival shelves;
  // stepping off its right lip reaches the flight below and then the service well.
  const returnPlatforms=roomId==='room_047' ? [...supported.filter(p=>p.y!==128),{x:640,y:128,width:256,height:32}] : supported;
  return {platforms:returnPlatforms,flights,lowerFloorY:1472,mezzanineFloorY:704,lowerClearance:736,returnWell:{left:672,right:864}};
 }
 return undefined;
}
