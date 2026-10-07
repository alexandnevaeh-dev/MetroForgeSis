/** Original Stormglass topology inspired by the supplied regional cutaway references.
 * World coordinates describe how separate playable rooms fit inside one place.
 * Reference PNGs are study material and are not copied into generated game art. */
export function buildStormglassGalleryBlueprint() {
  const rooms = [
    {id:'room_000',name:'West Arrival Gallery',x:0,y:0,width:3072,height:768,theme:'arrival',purpose:'Readable entrance and first view of the processional gallery'},
    {id:'room_001',name:'Stormglass Processional Gallery',x:3072,y:0,width:4096,height:768,theme:'gallery',purpose:'Long architectural spine with a descending exploration branch'},
    {id:'room_002',name:'Archivist Stairwell',x:4096,y:768,width:1024,height:1536,theme:'stairwell',purpose:'Uneven landings connect the gallery, shrine and lower passage'},
    {id:'room_003',name:'Veilblade Reliquary',x:3072,y:768,width:1024,height:768,theme:'shrine',purpose:'Sheltered ability discovery beside the stairwell'},
    {id:'room_004',name:'Lower Memorial Passage',x:5120,y:1536,width:2048,height:768,theme:'undercroft',purpose:'A distinct lower route with an encounter and return landmark'},
    {id:'room_005',name:'Bell Service Stair',x:7168,y:768,width:1024,height:1536,theme:'stairwell',purpose:'Return ascent to the checkpoint and access to a hidden branch'},
    {id:'room_006',name:'Lantern Checkpoint',x:7168,y:0,width:1024,height:768,theme:'rest',purpose:'The loop closes beside a save point before the boss approach'},
    {id:'room_007',name:'Sealed Echo Chamber',x:8192,y:1536,width:1024,height:768,theme:'secret',purpose:'Optional chamber reached from the lower service stair'},
    {id:'room_040',name:'Echo Service Descent',x:8192,y:2304,width:1024,height:1536,theme:'stairwell',purpose:'Backroom descent below the Echo Chamber into the archive vault'},
    {id:'room_041',name:'Memorial Archive Vault',x:6656,y:3072,width:1536,height:768,theme:'archive',purpose:'A lower furnished backroom passage linking two service stairs'},
    {id:'room_042',name:'Memorial Return Stair',x:5632,y:2304,width:1024,height:1536,theme:'stairwell',purpose:'Return ascent reconnecting the vault to the main memorial passage'},
  ] as const;
  const links = [
    {from:'room_000',to:'room_001',direction:'right',requirements:[],optional:false},
    {from:'room_001',to:'room_006',direction:'right',requirements:['dash'],optional:false},
    {from:'room_001',to:'room_002',direction:'down',requirements:[],optional:false},
    {from:'room_002',to:'room_003',direction:'left',requirements:[],optional:false},
    {from:'room_002',to:'room_004',direction:'right',requirements:[],optional:false},
    {from:'room_004',to:'room_005',direction:'right',requirements:[],optional:false},
    {from:'room_005',to:'room_006',direction:'up',requirements:[],optional:false},
    {from:'room_005',to:'room_007',direction:'right',requirements:[],optional:true},
    {from:'room_006',to:'room_008',direction:'right',requirements:[],optional:false},
    {from:'room_007',to:'room_040',direction:'down',requirements:[],optional:true},
    {from:'room_040',to:'room_041',direction:'left',requirements:[],optional:true},
    {from:'room_041',to:'room_042',direction:'left',requirements:[],optional:true},
    {from:'room_042',to:'room_004',direction:'up',requirements:[],optional:true},
  ] as const;
  return {version:1,id:'stormglass-gallery-world-within-world-v1',rooms,links,
    abilityRoom:'room_003',checkpointRoom:'room_006',externalBossRoom:'room_008',
    references:'User supplied Marble Gallery topology and regional cutaways; original geometry and Stormglass materials',
    productionReady:false};
}

/** Broad top landing provides a safe final jump beneath the ceiling and room to approach Up. */
export function buildStormglassGalleryStairPlatforms(height: number, mirrored=false) {
  const platforms = Array.from({length:8},(_,i)=>({
    x:i===7?512:i%2===0?96:864,
    y:height-64-i*192,
    width:i===7?416:i%2===0?48:64,
    height:32,
  }));
  return mirrored ? platforms.map(p=>({...p,x:1024-p.x-p.width})) : platforms;
}

export function buildStormglassStairFlights(height:number,mirrored=false){
  const flights = Array.from({length:7},(_,i)=>({
    from:{x:i%2===0?144:864,y:height-64-i*192},
    to:{x:i%2===0?864:144,y:height-64-(i+1)*192},thickness:32,
  }));
  return mirrored ? flights.map(f=>({...f,from:{...f.from,x:1024-f.from.x},to:{...f.to,x:1024-f.to.x}})) : flights;
}
/** Portal anchors use shared world-space room edges, not each room's bottom.
 * A tall stairwell can therefore connect to a small chamber halfway up its wall. */
export function stormglassGalleryPort(roomId:string,targetId:string,direction:string) {
  const rooms=buildStormglassGalleryBlueprint().rooms;
  const room=rooms.find(r=>r.id===roomId),target=rooms.find(r=>r.id===targetId);
  if(!room||!target)return undefined;
  if(direction==='left'||direction==='right'){
    const top=Math.max(room.y,target.y),bottom=Math.min(room.y+room.height,target.y+target.height);
    if(bottom-top<128)return undefined;
    const floorY=bottom-room.y-64;
    return {x:direction==='left'?48:room.width-72,y:floorY-32,floorY,direction,targetRoomId:targetId};
  }
  const left=Math.max(room.x,target.x),right=Math.min(room.x+room.width,target.x+target.width);
  if(right-left<128)return undefined;
  const x=(left+right)/2-room.x-12;
  return {x,y:direction==='up'?32:room.height+64,floorY:direction==='up'?64:room.height-64,direction,targetRoomId:targetId};
}
