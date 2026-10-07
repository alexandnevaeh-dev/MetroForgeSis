import { encodePng } from './png.js';

const P={ink:'#152b38',shadow:'#183b42',dark:'#245653',green:'#367d6e',leaf:'#65a27b',light:'#a2c58b',
  bark:'#5e5548',wood:'#99816a',gold:'#e7b96d',pale:'#d6dfbd',stone:'#546d73',stoneLight:'#92a69d',
  cyan:'#72d5ca',violet:'#6a849a',floor:'#2e5b53',dirt:'#7c755d',water:'#174955'};
function paint(w: number,h: number) {
  const rgba=new Uint8Array(w*h*4);
  const dot=(x: number,y: number,c: string)=>{x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=w||y>=h)return;rgba.set([parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16),255],(y*w+x)*4);};
  const rect=(x: number,y: number,width: number,height: number,c: string)=>{for(let j=0;j<height;j++)for(let i=0;i<width;i++)dot(x+i,y+j,c);};
  const oval=(x: number,y: number,rx: number,ry: number,c: string)=>{for(let j=-ry;j<=ry;j++)for(let i=-rx;i<=rx;i++)if(i*i/rx**2+j*j/ry**2<=1)dot(x+i,y+j,c);};
  const line=(ax: number,ay: number,bx: number,by: number,c: string,size=2)=>{const steps=Math.ceil(Math.max(Math.abs(bx-ax),Math.abs(by-ay)));for(let n=0;n<=steps;n++)rect(ax+(bx-ax)*n/(steps||1),ay+(by-ay)*n/(steps||1),size,size,c);};
  return {dot,rect,oval,line,png:()=>encodePng(w,h,rgba)};
}
function leaves(p: ReturnType<typeof paint>,x: number,y: number,rx: number,ry: number,variant=0) {
  // Layered, serrated leaf masses: never outlined circular bubbles.
  const outline=(dx: number,dy: number)=>{
    const a=Math.atan2(dy/ry,dx/rx);
    return Math.hypot(dx/rx,dy/ry)<1+0.08*Math.sin(a*9+variant)+0.055*Math.cos(a*17);
  };
  for(let dy=-ry-4;dy<=ry+6;dy++)for(let dx=-rx-4;dx<=rx+4;dx++) {
    if(outline(dx-2,dy-4))p.dot(x+dx,y+dy,P.ink);
    if(!outline(dx,dy))continue;
    const lighting=-(dx/rx)*.22-(dy/ry)*.44;
    p.dot(x+dx,y+dy,lighting>.3?P.leaf:lighting>-.1?(variant===2?'#417c7b':P.green):P.dark);
  }
  for(let n=0;n<38;n++) {
    const a=n*2.399+variant*.5,r=Math.sqrt((n+1)/41)*.90;
    const dx=Math.cos(a)*rx*r,dy=Math.sin(a)*ry*r;
    const c=dy<0?(n%4===0?P.light:'#80b389'):(n%3===0?P.green:'#2a635e');
    // Three angular leaves make one small cluster, lit along its upper edge.
    p.line(x+dx-4,y+dy+1,x+dx,y+dy-3,c,2);
    p.line(x+dx,y+dy-3,x+dx+5,y+dy,c,2);
    p.line(x+dx-2,y+dy+3,x+dx+3,y+dy+1,n%3===0?P.dark:c,2);
  }
}
function pedestal(p: ReturnType<typeof paint>,x: number,g: number,width: number) {
  p.oval(x,g-4,width*.58,5,P.ink);
  p.rect(x-width/2,g-17,width,13,P.shadow);p.rect(x-width/2+3,g-19,width-6,6,P.stoneLight);
  p.rect(x-width/2+5,g-13,width-10,8,P.stone);
  for(let n=0;n<4;n++)p.line(x-width/2+10+n*14,g-13,x-width/2+11+n*14,g-6,P.shadow,2);
}
export function canopyEnvironment(kind: string) {
  const widths: Record<string,number>={root_arch:192,vine_gate:192,seed_shrine:192,crown:256,bridge:192};
  const w=widths[kind]??128,h=['root_arch','vine_gate','crown'].includes(kind)?192:160;
  const p=paint(w,h),x=w/2,g=h-4;
  const tree=kind.startsWith('tree')||['rune_tree','elder_roots'].includes(kind);
  if(tree) {
    const variant=kind==='tree_b'?1:kind==='tree_c'?2:0;
    p.oval(x,g-4,38,5,P.ink);
    for(const [dx,y] of [[-35,g-4],[-18,g-1],[22,g-2],[38,g-7]]) {
      p.line(x,100,x+dx,y,P.shadow,9);p.line(x,105,x+dx,y-2,P.bark,6);p.line(x+1,114,x+dx,y-3,P.wood,2);
    }
    p.line(x-6,58,x-10,g-7,P.ink,23);p.line(x-5,55,x-7,g-8,P.bark,18);p.line(x-6,70,x-10,g-9,P.wood,4);
    p.line(x-1,88,x-38,49,P.bark,9);p.line(x+5,88,x+38,56,P.bark,10);
    for(let n=0;n<8;n++)p.line(x-13+n*3,95+n%3*7,x-16+n*3,g-12,P.shadow,1);
    p.line(x+5,87,x+9,111,P.green,3);p.line(x+9,111,x+4,136,P.green,3);
    for(let n=0;n<5;n++)p.line(x+8,100+n*7,x+15,97+n*7,P.leaf,2);
    if(kind==='elder_roots')for(const dx of [-48,-32,32,48])p.line(x,100,x+dx,g-6,P.bark,12);
    const masses=variant===1?[[0,25,24,19],[-28,48,25,21],[26,51,25,20],[-9,71,31,20]]:variant===2?[[-12,32,28,21],[29,43,26,21],[-30,61,28,23],[8,70,32,22]]:[[0,30,31,24],[-31,56,27,25],[33,52,28,23],[1,76,34,23]];
    for(const [dx,dy,rx,ry] of masses)leaves(p,x+dx,dy,rx,ry,variant);
    if(kind==='rune_tree') {
      p.oval(x,123,15,22,P.ink);p.oval(x,121,10,17,P.shadow);
      p.line(x-6,121,x+3,108,P.cyan,2);p.line(x+3,108,x+7,127,P.cyan,2);p.line(x-7,124,x+8,122,P.cyan,2);
      for(const [dx,y] of [[-40,133],[35,146]]){p.rect(x+dx,y,3,11,P.wood);p.oval(x+dx,y,7,3,P.cyan);}
    }
  } else if(['root_arch','vine_gate'].includes(kind)) {
    for(const side of [-1,1]) {
      const xx=x+side*54;
      p.oval(xx,g-5,24,5,P.ink);p.line(xx-8,g-10,xx-10,72,P.ink,22);p.line(xx-7,g-11,xx-8,67,P.bark,16);
      p.line(xx-4,g-16,xx-8,80,P.wood,3);
      p.line(xx-8,70,x+side*14,35,P.bark,15);p.line(xx-7,67,x+side*5,31,P.wood,3);
      leaves(p,xx,52,35,24,side===1?1:0);
      p.line(xx,g-17,xx+side*23,g-2,P.bark,7);
    }
    leaves(p,x-3,34,36,22,0);
    if(kind==='vine_gate') {
      for(const side of [-1,1])p.line(x+side*36,82,x-side*25,153,P.green,7);
      p.line(x-30,102,x+32,137,P.leaf,3);p.oval(x,120,7,8,P.shadow);p.oval(x,120,4,5,P.cyan);
    }
  } else if(kind==='mushrooms') {
    p.oval(x,g-4,46,5,P.ink);
    for(const [dx,y,rx] of [[-32,117,21],[1,88,29],[35,125,17],[-13,137,12]]) {
      p.rect(x+dx-5,y,10,g-y-4,P.shadow);p.rect(x+dx-3,y,6,g-y-5,P.pale);
      p.oval(x+dx,y+4,rx+2,9,P.ink);p.oval(x+dx,y,rx,11,P.green);p.oval(x+dx,y-3,rx-2,9,P.cyan);
      p.rect(x+dx-10,y-7,6,3,P.pale);p.rect(x+dx+7,y-4,5,2,P.pale);
    }
  } else if(kind==='ferns') {
    p.oval(x,g-4,35,4,P.shadow);
    for(const dx of [-37,-22,-8,10,25,39]) {
      p.line(x,g-5,x+dx,g-37-Math.abs(dx)/3,P.green,3);
      for(let n=1;n<5;n++){const xx=x+dx*n/5,yy=g-5-(32+Math.abs(dx)/3)*n/5;p.line(xx,yy,xx-9,yy-4,P.leaf,3);p.line(xx,yy,xx+9,yy-5,P.green,3);}
    }
  } else if(kind==='ruin_fragments') {
    pedestal(p,x,g,74);p.rect(27,g-40,29,23,P.stone);p.rect(30,g-43,25,6,P.stoneLight);
    p.rect(68,g-31,28,14,P.stone);p.line(77,g-29,89,g-20,P.shadow,3);p.rect(29,g-21,18,4,P.leaf);
  } else if(kind==='bridge') {
    for(const xx of [x-57,x+45]) {
      pedestal(p,xx+7,g,31);p.rect(xx,64,15,76,P.stone);p.rect(xx-5,61,25,7,P.stoneLight);
      p.line(xx+3,72,xx+3,131,P.shadow,3);leaves(p,xx+8,61,17,9,0);
    }
    p.line(x-43,86,x+43,86,P.bark,5);p.line(x-44,84,x+43,84,P.wood,2);
  } else if(kind==='lantern') {
    pedestal(p,x,g,44);p.line(x-7,43,x-8,g-19,P.bark,10);p.line(x-7,45,x+27,46,P.wood,5);
    p.line(x+20,48,x+20,66,P.ink,2);p.rect(x+7,66,28,7,P.wood);p.rect(x+10,73,22,26,P.gold);p.rect(x+15,75,11,21,P.pale);
    p.rect(x+8,98,27,6,P.bark);p.rect(x+10,73,3,25,P.bark);p.rect(x+30,73,3,25,P.bark);
    leaves(p,x-15,35,29,19,1);
  } else if(kind==='seed_shrine') {
    pedestal(p,x,g,128);
    p.rect(x-40,102,80,34,P.stone);p.rect(x-46,96,92,9,P.stoneLight);
    for(const dx of [-31,28]){p.rect(x+dx,51,12,45,P.stone);p.rect(x+dx-5,47,22,8,P.stoneLight);}
    p.oval(x,62,25,25,P.shadow);p.oval(x,60,20,22,P.green);
    p.line(x,38,x,82,P.cyan,3);p.line(x-17,57,x,41,P.cyan,3);p.line(x,41,x+17,60,P.cyan,3);
    p.line(x-17,66,x+17,66,P.pale,2);p.rect(x-3,106,6,19,P.cyan);
    p.line(x-55,103,x-52,135,P.green,5);p.line(x+53,99,x+48,133,P.leaf,4);
  } else if(kind==='crown') {
    p.oval(x,g-6,101,6,P.ink);
    for(const dx of [-95,-67,-40,37,69,98]){p.line(x+dx*.25,107,x+dx,g-5,P.bark,17);p.line(x+dx*.25,112,x+dx,g-6,P.wood,4);}
    p.oval(x,100,45,49,P.ink);p.oval(x,98,39,45,P.bark);
    for(const dx of [-25,-9,10,25])p.line(x+dx,63,x+dx-4,126,P.wood,3);
    for(const [dx,y] of [[-49,30],[-24,19],[0,9],[25,19],[49,30]]){p.line(x+dx,77,x+dx-3,y,P.wood,9);p.rect(x+dx-9,y-4,15,9,P.gold);}
    p.oval(x,96,19,26,P.shadow);p.oval(x,91,9,11,P.cyan);p.rect(x-3,84,5,14,P.pale);
    for(const side of [-1,1])leaves(p,x+side*70,99,25,18,0);
  } else {
    pedestal(p,x,g,86);p.rect(x-23,72,46,62,P.stone);p.rect(x-28,69,56,8,P.stoneLight);
    p.oval(x-4,44,23,27,P.ink);p.oval(x-5,42,20,24,P.stone);p.rect(x-20,33,10,5,P.shadow);
    p.line(x-18,69,x+13,87,P.shadow,3);p.rect(x+15,91,11,38,P.shadow);
    p.rect(x-29,112,17,5,P.leaf);p.line(x-29,80,x-24,135,P.green,4);
    p.rect(x-15,74,6,9,P.cyan);p.rect(x+4,73,5,8,P.cyan);
  }
  if(['idol','seed_shrine','ruin_fragments'].includes(kind)) {
    // Chips, incised masonry and tiny moss seams give ruins age and scale.
    for(let n=0;n<18;n++) {
      const xx=x-20+(n*19%40),yy=kind==='seed_shrine'?104+n*7%29:g-20-(n*13%19);
      p.rect(xx,yy,3+n%4,1,n%3===0?P.leaf:P.shadow);
    }
  }
  return {bytes:p.png(),width:w,height:h,anchor:[w/2,h-4] as [number,number]};
}

export const CANOPY_PROP_KINDS = ['tree','tree_b','tree_c','rune_tree','elder_roots','root_arch','vine_gate','mushrooms','ferns','ruin_fragments','bridge','lantern','seed_shrine','crown'] as const;

export function canopyTerrainV2() { return buildCanopyTerrain(2); }
/** Readable connected hedge barriers; v2 remains available for recovery and comparisons. */
export function canopyTerrainV3() { return buildCanopyTerrain(3); }
/** Four quiet foliage variants per boundary mask, without a diagonal repeat. */
export function canopyTerrainV4() { return buildCanopyTerrain(4); }
function buildCanopyTerrain(version:2|3|4) {
  const p=paint(256,version===4?544:version===3?352:288);
  const roles: Array<{role:string;col:number;row:number}> = [];
  for(let col=0;col<8;col++) {
    const ox=col*32,c=col===1?P.shadow:col===2?P.stone:col===3?P.dirt:col===4?P.water:P.floor;
    p.rect(ox,0,32,32,c);
    if(col===1){p.rect(ox,0,32,32,'#20463f');for(let n=0;n<7;n++){const xx=ox+(n*n*13+17)%29,yy=(n*n*11+n*7+3)%29;p.line(xx,yy,xx+3,yy-2,n%3===0?'#2b594a':'#244c43',1);}}
    if(col===4){p.line(ox+3,8,ox+15,8,P.green,1);p.line(ox+17,24,ox+28,24,P.dark,1);}
    if(col===5){p.rect(ox+6,17,2,3,P.green);p.rect(ox+10,20,3,1,P.leaf);}
  }
  for(const [role,col] of [['ground',0],['wall',1],['platform',2],['path',3],['hazard',4],['ground_dirty',5]] as const)roles.push({role,col,row:0});
  for(const [family,rowStart] of [['path',1],['platform',3]] as const)for(let mask=0;mask<16;mask++) {
    const col=mask%8,row=rowStart+Math.floor(mask/8),ox=col*32,oy=row*32;
    p.rect(ox,oy,32,32,family==='path'?P.dirt:P.stone);
    for(let n=0;n<9;n++)p.rect(ox+3+(n*13%25),oy+3+(n*7%26),family==='path'?2:5,1,family==='path'?'#91876d':'#6a8180');
    if(family==='platform'){
      p.line(ox+2,oy+15,ox+28,oy+15,P.shadow,1);p.line(ox+13,oy+2,ox+13,oy+15,P.shadow,1);p.line(ox+24,oy+15,ox+24,oy+31,P.shadow,1);
      p.line(ox+17,oy+19,ox+20,oy+24,'#879b91',1);p.line(ox+20,oy+24,ox+18,oy+29,P.shadow,1);
      p.rect(ox+3,oy+13,6,1,P.green);
    }
    for(let i=0;i<32;i++) {
      const thickness=4+Math.round(2*Math.sin(i*.65))+i%2;
      if(mask&1)p.rect(ox+i,oy,1,thickness,P.floor);
      if(mask&2)p.rect(ox+32-thickness,oy+i,thickness,1,P.floor);
      if(mask&4)p.rect(ox+i,oy+32-thickness,1,thickness,P.floor);
      if(mask&8)p.rect(ox,oy+i,thickness,1,P.floor);
    }
    for(const [a,b,cx,cy] of [[1,8,0,0],[1,2,31,0],[4,8,0,31],[4,2,31,31]])if((mask&a)&&(mask&b))
      for(let y=0;y<11;y++)for(let x=0;x<11;x++)if(Math.hypot(11-x,11-y)>11)p.dot(ox+(cx?31-x:x),oy+(cy?31-y:y),P.floor);
    for(let n=0;n<8;n++) {
      const i=(n*13+mask*3)%32;
      if(mask&1)p.line(ox+i,oy+3,ox+i+1,oy+7,P.green,1);
      if(mask&4)p.line(ox+i,oy+27,ox+i+1,oy+31,P.green,1);
      if(mask&8)p.rect(ox+4,oy+i,2,1,P.green);
      if(mask&2)p.rect(ox+26,oy+i,2,1,P.green);
    }
    roles.push({role:family+'_edge_'+mask,col,row});
  }
  for(let variant=0;variant<4;variant++) {
    const ox=variant*32,oy=160;p.rect(ox,oy,32,32,P.floor);
    for(let n=0;n<3+variant;n++) {
      const xx=ox+3+(n*n*13+variant*7+n*3)%25,yy=oy+4+(n*n*11+variant*3+n*5)%24;
      p.line(xx,yy,xx-1,yy-2,n%3===0?'#3c6b5b':'#335f54',1);
      p.line(xx,yy,xx+2,yy-1,'#396557',1);
      if(variant===2&&n===2)p.rect(xx+2,yy-3,1,1,'#617f5e');
    }
    roles.push({role:'ground_variant_'+variant,col:variant,row:5});
  }
  for(let mask=0;mask<16;mask++) {
    const col=mask%8,row=6+Math.floor(mask/8),ox=col*32,oy=row*32;
    p.rect(ox,oy,32,32,P.water);
    for(let n=0;n<7;n++){const xx=(n*11+mask*3)%24,yy=(n*7+mask)%30;p.line(ox+xx,oy+yy,ox+xx+4,oy+yy,'#246474',1);}
    for(let i=0;i<32;i++) {
      const t=3+Math.round(Math.sin(i*.6)*1.5);
      for(const [bit,x,y,dx,dy] of [[1,i,0,0,1],[2,31,i,-1,0],[4,i,31,0,-1],[8,0,i,1,0]])if(mask&bit) {
        p.line(ox+x,oy+y,ox+x+dx*t,oy+y+dy*t,P.floor,1);
        p.dot(ox+x+dx*(t+1),oy+y+dy*(t+1),'#43847e');
        if(i%5<2)p.dot(ox+x+dx*(t+3),oy+y+dy*(t+3),'#73a79b');
      }
    }
    roles.push({role:'water_edge_'+mask,col,row});
  }
  for(const [family,start] of [['path',0],['platform',4]] as const)for(let variant=0;variant<4;variant++) {
    const col=start+variant,ox=col*32,oy=256;
    p.rect(ox,oy,32,32,family==='path'?P.dirt:P.stone);
    if(family==='path')for(let n=0;n<4;n++) {
      const xx=ox+4+(n*n*7+variant*5)%23,yy=oy+5+(n*n*13+variant*9)%22;
      p.rect(xx,yy,2+n%2,1,'#898069');
    } else {
      const seam=9+variant*4;
      p.line(ox,oy+seam,ox+31,oy+seam,'#465e61',1);
      p.line(ox+8+variant*5,oy,ox+8+variant*5,oy+seam,'#465e61',1);
      p.line(ox+27-variant*6,oy+seam,ox+27-variant*6,oy+31,'#465e61',1);
      p.rect(ox+3,oy+seam-2,8,1,'#779087');
      if(variant===2){p.line(ox+18,oy+20,ox+21,oy+25,P.shadow,1);p.rect(ox+24,oy+seam+1,5,1,P.green);}
    }
    roles.push({role:family+'_variant_'+variant,col,row:8});
  }
  if(version===3) {
    const hedge=(ox:number,oy:number,mask:number)=>{
      p.rect(ox,oy,32,32,P.dark);
      // Low-contrast interior clusters join without per-cell borders.
      for(let n=0;n<7;n++) {
        const x=ox+3+(n*11)%25,y=oy+3+(n*7)%22;
        p.line(x,y,x+3,y-1,n%2?P.green:'#3d8474',2);
      }
      if(mask&1){p.rect(ox,oy,32,2,P.ink);p.line(ox,oy+3,ox+31,oy+3,P.leaf,1);}
      if(mask&2){p.rect(ox+30,oy,2,32,P.ink);p.line(ox+28,oy+3,ox+28,oy+25,P.green,1);}
      if(mask&8){p.rect(ox,oy,2,32,P.ink);p.line(ox+3,oy+3,ox+3,oy+25,P.leaf,1);}
      if(mask&4){
        p.rect(ox,oy+24,32,6,P.bark);p.rect(ox,oy+30,32,2,P.ink);
        p.line(ox+2,oy+24,ox+29,oy+24,P.wood,1);
        for(const x of [5,15,25])p.line(ox+x,oy+25,ox+x+3,oy+28,P.shadow,1);
      }
    };
    hedge(32,0,15); // Legacy wall role remains a readable isolated barrier.
    for(let mask=0;mask<16;mask++) {
      const col=mask%8,row=9+Math.floor(mask/8);
      hedge(col*32,row*32,mask);roles.push({role:'wall_edge_'+mask,col,row});
    }
  }
  if(version===4) {
    const hedge=(ox:number,oy:number,mask:number,variant:number)=>{
      p.rect(ox,oy,32,32,'#24534b');
      // Uneven compact leaf masses use subdued colors. Open tile edges have
      // no outlines, so adjacent cells read as one continuous canopy.
      let state=1729+variant*7919;
      const next=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;};
      for(let n=0;n<11;n++) {
        const x=3+next()%26,y=3+next()%24;
        const rx=2+next()%4,ry=1+next()%3;
        const c=n%3===0?'#2f6251':n%3===1?'#285a4d':'#204a43';
        // Clamp to this tile; neighboring roles must never receive pixels.
        for(let dy=-ry;dy<=ry;dy++)for(let dx=-rx;dx<=rx;dx++)
          if(dx*dx/(rx*rx)+dy*dy/(ry*ry)<=1&&x+dx>=0&&x+dx<32&&y+dy>=0&&y+dy<32)
            p.dot(ox+x+dx,oy+y+dy,c);
        if(n%4===0)p.rect(ox+Math.min(x,29),oy+y-1,2,1,'#41755b');
      }
      if(mask&1){p.rect(ox,oy,32,2,P.ink);for(let x=0;x<32;x++)p.dot(ox+x,oy+3+(x*7%5===0?1:0),'#588361');}
      if(mask&2){p.rect(ox+30,oy,2,32,P.ink);p.rect(ox+28,oy+3,1,22,'#326650');}
      if(mask&8){p.rect(ox,oy,2,32,P.ink);p.rect(ox+3,oy+3,1,22,'#588361');}
      if(mask&4){
        p.rect(ox,oy+24,32,6,P.bark);p.rect(ox,oy+30,32,2,P.ink);
        p.line(ox+2,oy+24,ox+29,oy+24,P.wood,1);
        for(const x of [5,15,25])p.line(ox+x,oy+25,ox+x+3,oy+28,P.shadow,1);
      }
    };
    hedge(32,0,15,0);
    for(let variant=0;variant<4;variant++)for(let mask=0;mask<16;mask++) {
      const col=mask%8,row=9+variant*2+Math.floor(mask/8);
      hedge(col*32,row*32,mask,variant);
      if(variant===0)roles.push({role:'wall_edge_'+mask,col,row});
      roles.push({role:`wall_edge_${mask}_variant_${variant}`,col,row});
    }
  }
  return {bytes:p.png(),roles};
}
