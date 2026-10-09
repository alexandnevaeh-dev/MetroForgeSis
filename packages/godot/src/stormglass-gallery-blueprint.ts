/** Original Stormglass topology inspired by the supplied regional cutaway references.
 * World coordinates describe how separate playable rooms fit inside one place.
 * Reference PNGs are study material and are not copied into generated game art. */
export type StormglassRegionProfile = 'gallery' | 'expanded-region' | 'archive-wing';
export function buildStormglassGalleryBlueprint(profile: StormglassRegionProfile = 'gallery') {
  if (!['gallery', 'expanded-region', 'archive-wing'].includes(profile)) throw new Error('Unknown Stormglass region profile');
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
  ];
  const links: Array<{from:string;to:string;direction:'left'|'right'|'up'|'down';requirements:string[];optional:boolean}> = [
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
  ];
  if (profile !== 'gallery') {
    const bounds: Record<string, [number, number, number, number]> = {
      room_001:[3072,0,6144,768], room_002:[4096,768,1024,3072],
      room_004:[5120,3072,4096,768], room_005:[9216,768,1024,3072],
      room_006:[9216,0,1024,768], room_007:[10240,3072,1024,768],
      room_040:[10240,3840,1024,3072], room_041:[6656,6144,3584,768],
      room_042:[5632,3840,1024,3072],
    };
    for (const room of rooms) {
      const b = bounds[room.id];
      if (b) [room.x, room.y, room.width, room.height] = b;
    }
    rooms.push(
      {id:'room_043',name:'Upper Archive Service Stair',x:3072,y:-3072,width:1024,height:3072,theme:'stairwell',purpose:'Upstairs branch from the main gallery to the elevated archive passage'},
      {id:'room_044',name:'High Scriptorium Passage',x:4096,y:-3072,width:5120,height:768,theme:'archive',purpose:'Enclosed upper exploration hall returning toward the checkpoint; rewards and encounters pending'},
      {id:'room_045',name:'Lantern Tower Descent',x:9216,y:-3072,width:1024,height:3072,theme:'stairwell',purpose:'Downstairs return to the familiar checkpoint after the upper branch'},
    );
    links.push(
      {from:'room_001',to:'room_043',direction:'up',requirements:['dash'],optional:true},
      {from:'room_043',to:'room_044',direction:'right',requirements:[],optional:true},
      {from:'room_044',to:'room_045',direction:'right',requirements:[],optional:true},
      {from:'room_045',to:'room_006',direction:'down',requirements:[],optional:true},
    );
  }
  if (profile === 'archive-wing') {
    const landing = rooms.find(room=>room.id==='room_044')!;
    landing.name="Scribe's Landing";landing.height=1536;
    landing.purpose='Two-storey archive with a clear lower reading lane, upper crosswalk, enclosed upper records chamber and lower branch';
    rooms.push(
      {id:'room_046',name:'Sealed Records Loft',x:6144,y:-4608,width:1536,height:1536,theme:'archive-loft',purpose:'Enclosed upper records room with an ordinary return to the scriptorium; optional lore and encounter space'},
      {id:'room_047',name:'Lower Ledger Vault',x:6656,y:-1536,width:1536,height:1536,theme:'archive-vault',purpose:'Enclosed lower branch with a stair return; no new movement grant or progression prerequisite'},
    );
    links.push(
      {from:'room_044',to:'room_046',direction:'up',requirements:[],optional:true},
      {from:'room_044',to:'room_047',direction:'down',requirements:[],optional:true},
    );
  }
  return {version:1,id:profile === 'gallery' ? 'stormglass-gallery-world-within-world-v1' : profile==='archive-wing' ? 'stormglass-archive-wing-candidate-v1' : 'stormglass-expanded-region-candidate-v1',profile,rooms,links,
    abilityRoom:'room_003',checkpointRoom:'room_006',externalBossRoom:'room_008',
    references:'User supplied Marble Gallery topology and regional cutaways; original geometry and Stormglass materials',
    productionReady:false};
}

/** Broad top landing provides a safe final jump beneath the ceiling and room to approach Up. */
export function buildStormglassGalleryStairPlatforms(height: number, mirrored=false) {
  const count = stairLandingCount(height);
  const platforms = Array.from({length:count},(_,i)=>({
    x:i===count-1?512:i%2===0?96:864,
    y:height-64-i*192,
    width:i===count-1?416:i%2===0?48:64,
    height:32,
  }));
  return mirrored ? platforms.map(p=>({...p,x:1024-p.x-p.width})) : platforms;
}

export function buildStormglassStairFlights(height:number,mirrored=false,returnWell:boolean|{left:number;right:number}=false){
  const flights = Array.from({length:stairLandingCount(height)-1},(_,i)=>({
    from:{x:i%2===0?144:864,y:height-64-i*192},
    to:{x:i%2===0?864:144,y:height-64-(i+1)*192},thickness:32,
  }));
  const oriented = mirrored ? flights.map(f=>({...f,from:{...f.from,x:1024-f.from.x},to:{...f.to,x:1024-f.to.x}})) : flights;
  if(!returnWell)return oriented;
  const well=returnWell===true?{left:448,right:576}:returnWell;
  if(!Number.isFinite(well.left)||!Number.isFinite(well.right)||well.left<=144||well.right>=864||well.right-well.left<64)
    throw new Error('Stormglass service well must be at least 64px wide inside the stair flights');
  // A continuous 128px service well separates the ascending flight from the
  // descending return. Keep both remaining flight segments at their original
  // pitch; never draw/collide a complete flight across the fall route.
  return oriented.flatMap(f=>{
    const yAt=(x:number)=>f.from.y+(f.to.y-f.from.y)*(x-f.from.x)/(f.to.x-f.from.x);
    const first=f.from.x<f.to.x?well.left:well.right,second=f.from.x<f.to.x?well.right:well.left;
    return [{...f,to:{x:first,y:yAt(first)}},{...f,from:{x:second,y:yAt(second)}}];
  });
}
function stairLandingCount(height:number) {
  if (!Number.isSafeInteger(height) || height < 384 || height > 6144 || height % 384 !== 0)
    throw new Error('Stormglass stair height must be a 384px multiple between 384 and 6144');
  return height / 192;
}
/** Portal anchors use shared world-space room edges, not each room's bottom.
 * A tall stairwell can therefore connect to a small chamber halfway up its wall. */
export function stormglassGalleryPort(roomId:string,targetId:string,direction:string,profile:StormglassRegionProfile='gallery'): {x:number;y:number;floorY:number;direction:string;targetRoomId:string;arrivalX?:number}|undefined {
  const rooms=buildStormglassGalleryBlueprint(profile).rooms;
  const room=rooms.find(r=>r.id===roomId),target=rooms.find(r=>r.id===targetId);
  if(!room||!target)return undefined;
  // Overlap alone is insufficient: a chamber on the opposite side (or across
  // another room) would otherwise receive a plausible but disconnected anchor.
  const touches = direction==='left' ? target.x+target.width===room.x
    : direction==='right' ? room.x+room.width===target.x
    : direction==='up' ? target.y+target.height===room.y
    : direction==='down' ? room.y+room.height===target.y : false;
  if(!touches)throw new Error(`Stormglass portal ${roomId} ${direction} ${targetId}: room edges do not touch`);
  if(direction==='left'||direction==='right'){
    const top=Math.max(room.y,target.y),bottom=Math.min(room.y+room.height,target.y+target.height);
    if(bottom-top<128)throw new Error(`Stormglass portal ${roomId} ${direction} ${targetId}: opening has less than 128px shared height`);
    const floorY=profile==='archive-wing'&&[roomId,targetId].every(id=>['room_044','room_045'].includes(id)) ? 704 : bottom-room.y-64;
    return {x:direction==='left'?48:room.width-72,y:floorY-32,floorY,direction,targetRoomId:targetId};
  }
  const left=Math.max(room.x,target.x),right=Math.min(room.x+room.width,target.x+target.width);
  if(right-left<128)throw new Error(`Stormglass portal ${roomId} ${direction} ${targetId}: opening has less than 128px shared width`);
  const x=(left+right)/2-room.x-12;
  return {x,y:direction==='up'?32:room.height+64,floorY:direction==='up'?64:room.height-64,direction,targetRoomId:targetId,
    ...(profile!=='gallery'&&['room_043','room_045','room_046'].includes(roomId)&&direction==='down'?{arrivalX:112}:{}),
  };
}
