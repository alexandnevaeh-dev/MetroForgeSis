/** Shared original woodland room grammar. Coordinates are composed on a 30x22 grid
 * then scaled to each room's dimensions; collision clearance is applied by world generation. */
export interface CanopyScenery {kind:string;x:number;y:number;solid:boolean}
export interface CanopyRoomLayout {tiles:number[][];floorRoles:string[][];landmarkAt:[number,number];scenery:CanopyScenery[];composition:string;compositionVersion:2}
export function createCanopyLayout(index: number, outputWidth=30, outputHeight=22, tileSize=32): CanopyRoomLayout {
  if (!Number.isInteger(index) || index<0 || index>15) throw new Error("Unknown canopy composition");
  if(outputWidth<12 || outputHeight<10) throw new Error("Canopy room is too small");
  const width=30, height=22;
  const tiles: number[][]=Array.from({length:height},(_,y)=>Array.from({length:width},(_,x)=>x===0||y===0||x===width-1||y===height-1?3:0));
  const floorRoles=Array.from({length:height},()=>Array(width).fill(''));
  const cell=(x: number,y: number,tile: number,role='')=>{if(x>0&&y>0&&x<width-1&&y<height-1){tiles[y]![x]=tile;floorRoles[y]![x]=role;}};
  const ellipse=(cx: number,cy: number,rx: number,ry: number,tile: number,role='')=>{
    for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++)
      if((x-cx)**2/rx**2+(y-cy)**2/ry**2<=1)cell(x,y,tile,role);
  };
  const road=(points: Array<[number,number]>,role='path',radius=1)=>{
    for(let n=1;n<points.length;n++) {
      const [ax,ay]=points[n-1]!,[bx,by]=points[n]!,steps=Math.max(Math.abs(bx-ax),Math.abs(by-ay));
      for(let i=0;i<=steps;i++) {
        const x=Math.round(ax+(bx-ax)*i/(steps||1)),y=Math.round(ay+(by-ay)*i/(steps||1));
        for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++)cell(x+dx,y+dy,1,role);
      }
    }
  };
  // Irregular edge groves frame the clear routes; they are not scattered in combat lanes.
  for(const [x,y,rx,ry] of ([[4,4,4,3],[25,4,4,3],[4,18,4,3],[25,18,4,3]] as Array<[number,number,number,number]>))ellipse(x,y,rx,ry,3);
  const descriptions=[
    'A winding arrival trail around a root arch, with a sheltered guide and waystone.',
    'A diagonal river, broad ruined crossing, and combat staging on the eastern bank.',
    'An open mushroom-lit clearing where two lower routes branch away from the sealed path.',
    'A narrow root-framed approach to the living vine seal, with a small side clearing.',
    'A winding corridor between two groves; casters flank its turns.',
    'An aqueduct over deep water with two northern piers and an eastern landing.',
    'A quiet circular stone courtyard around the First Seed altar.',
    'A lantern alcove beside a crescent pool, reached along one tucked-away path.',
    'A bent root valley with a sheltered checkpoint before the crown arena.',
    'A broad ruined circular court, with the crown roots framing its northern edge.',
    'A sheltered hamlet with two timber houses beside a broad communal stone road.',
    'A ruined bell archive with a stone reading court and a tucked-away memorial.',
    'An observatory courtyard above the river where a lost ember is preserved.',
    'A flooded garden threaded by narrow stone paths between three planted islands.',
    'A root cistern with a sheltered central landing beside ancient waterworks.',
    'A moonlit well enclosed by a crescent pool, with a quiet outer ring.'
  ];
  switch(index) {
    case 0:
      ellipse(24,16,4,3,2);road([[4,11],[12,11],[12,7],[20,7],[20,11],[27,11]]);
      road([[8,11],[8,9],[11,8]]);road([[12,11],[12,15],[11,14]]);break;
    case 1:
      for(let y=2;y<20;y++)for(let x=1;x<29;x++)if(Math.abs(x-(10+y*0.28))<2.2)cell(x,y,2);
      road([[2,11],[8,11]],'path');road([[8,11],[19,11]],'platform',1);road([[19,11],[27,11]]);
      ellipse(23,13,4,4,0);road([[19,11],[23,14]]);break;
    case 2:
      ellipse(15,11,7,6,1,'path');road([[2,11],[15,11],[27,11]]);
      road([[14,11],[14,19]]);road([[20,13],[21,19]]);break;
    case 3:
      ellipse(13,5,7,3,3);ellipse(16,18,8,3,3);
      road([[2,11],[10,11],[14,9],[21,9],[21,11],[27,11]]);
      ellipse(21,12,4,3,0);road([[17,10],[20,14]]);break;
    case 4:
      ellipse(11,11,3,3,3);ellipse(21,12,3,3,3);
      road([[14,2],[14,6],[7,6],[7,16],[14,16],[14,19]]);
      road([[4,11],[7,11]]);road([[14,6],[24,6],[24,14],[20,14]]);break;
    case 5:
      for(let y=2;y<20;y++)for(let x=7;x<=22;x++)cell(x,y,2);
      road([[14,2],[14,11],[27,11]],'platform');
      road([[21,2],[21,6],[14,6]],'platform');road([[4,11],[14,11]],'platform');break;
    // New southbound garden road is added by the expanded world before collision derivation.
    case 6:
      ellipse(15,8,5,4,1,'platform');road([[2,11],[9,11],[9,8],[15,8],[23,8],[23,11],[27,11]],'platform');break;
    case 7:
      ellipse(19,8,7,4,2);ellipse(16,11,4,3,0);road([[2,11],[8,11],[8,14],[16,14],[16,11]]);
      ellipse(16,11,3,2,1,'platform');break;
    case 8:
      ellipse(12,16,5,3,3);ellipse(20,4,5,3,3);
      road([[2,11],[9,11],[9,7],[19,7],[19,11],[27,11]]);
      ellipse(18,10,3,2,0);road([[16,7],[18,10]]);break;
    case 9:
      ellipse(18,11,9,8,1,'platform');road([[2,11],[18,11]],'platform');break;
    case 10:
      road([[2,11],[27,11]],'platform',2);road([[14,2],[14,11],[14,19]],'path');
      ellipse(15,9,5,4,1,'platform');break;
    case 11:
      ellipse(14,9,7,5,1,'platform');road([[2,11],[14,11],[27,11]],'platform');
      ellipse(23,17,3,2,2);road([[14,11],[14,16],[20,16]]);break;
    case 12:
      ellipse(13,8,7,5,1,'platform');road([[4,11],[13,11],[27,11]],'platform');
      ellipse(23,17,5,3,2);road([[13,11],[13,16],[18,16]]);break;
    case 13:
      ellipse(15,11,11,8,2);for(const [x,y] of [[8,8],[17,12],[24,17]])ellipse(x!,y!,3,3,0);
      road([[14,2],[14,8],[8,8],[8,12],[17,12],[27,12]],'platform');
      // The central bridge closes the island loop and gives the eastern return a readable northbound route.
      road([[14,8],[14,12],[17,12]],'platform');road([[4,11],[8,11]],'platform');break;
    case 14:
      ellipse(12,8,8,5,2);ellipse(15,10,4,3,1,'platform');
      road([[2,11],[15,11],[27,11]],'platform');road([[15,11],[15,16],[21,16]]);break;
    case 15:
      ellipse(17,10,8,6,2);ellipse(17,10,5,4,0);ellipse(17,10,3,2,1,'platform');
      road([[2,11],[9,11],[17,11]],'platform');break;
  }
  const landmarkAt=([[16,6],[19,8],[15,7],[22,8],[12,12],[24,9],[15,6],[16,7],[13,13],[18,6],[15,6],[14,6],[13,5],[17,9],[15,7],[17,7]] as Array<[number,number]>)[index]!;
  const scenery: CanopyScenery[]=[];
  for(const [x,y] of ([[2,4],[5,5],[8,3],[23,3],[26,5],[28,4],[2,17],[5,19],[8,18],[22,19],[25,18],[28,17]] as Array<[number,number]>)) {
    const sx=x+(index%3-1),sy=y+((index*7+x)%3-1);
    if(tiles[sy]?.[sx]!==1 && tiles[sy]?.[sx]!==2)scenery.push({kind:['tree','tree_b','tree_c'][(x+index)%3]!,x:sx*32,y:sy*32,solid:true});
  }
  for(const [x,y] of ([[10,5],[22,7],[7,16],[20,17]] as Array<[number,number]>))
    if(tiles[y]![x]===0)scenery.push({kind:(x+index)%2?'ferns':'ruin_fragments',x:x*32,y:y*32,solid:false});
  const px=(x:number)=>Math.round(x*(outputWidth-1)/29);
  const py=(y:number)=>Math.round(y*(outputHeight-1)/21);
  const grid=<T>(source:T[][])=>Array.from({length:outputHeight},(_,y)=>Array.from({length:outputWidth},(_,x)=>source[Math.round(y*21/(outputHeight-1))]![Math.round(x*29/(outputWidth-1))]!));
  return {tiles:grid(tiles),floorRoles:grid(floorRoles),landmarkAt:[px(landmarkAt[0]),py(landmarkAt[1])],
    scenery:scenery.map(entry=>({...entry,x:px(entry.x/32)*tileSize,y:py(entry.y/32)*tileSize})),
    composition:descriptions[index]!,compositionVersion:2};
}
