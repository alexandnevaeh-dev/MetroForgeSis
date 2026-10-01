import { encodePng } from '../../packages/assets/dist/png.js';

export {canopyActor,canopyEffect,canopyIcon,canopyPickup} from '../../packages/assets/dist/topdown-canopy-art.js';

// New source art for the canopy set. Pixel clusters, shared lighting and grounded anchors.
const C = { ink:'#18232f', dark:'#263d43', wood:'#655447', woodLight:'#a18c65',
  green:'#428276', leaf:'#82b987', pale:'#dae2b5', gold:'#eeb866', blue:'#63d8d3',
  stone:'#657781', stoneLight:'#a1b0ae', violet:'#946485', red:'#e07b80' };
function canvas(width, height) {
  const rgba = new Uint8Array(width * height * 4);
  let clipStart=0,clipEnd=width;
  const put = (x,y,color) => { x=Math.round(x); y=Math.round(y); if(x<0||y<0||x>=width||y>=height)return;
    if(x<clipStart||x>=clipEnd)return;
    const hex=color.replace('#',''); rgba.set([parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16),hex.length===8?parseInt(hex.slice(6,8),16):255],(y*width+x)*4); };
  const rect = (x,y,w,h,c) => { for(let dy=0;dy<h;dy++)for(let dx=0;dx<w;dx++)put(x+dx,y+dy,c); };
  const oval = (x,y,rx,ry,c) => { for(let py=-ry;py<=ry;py++)for(let px=-rx;px<=rx;px++)if(px*px/(rx*rx)+py*py/(ry*ry)<=1)put(x+px,y+py,c); };
  const line = (ax,ay,bx,by,c,thick=2) => { const n=Math.ceil(Math.max(Math.abs(bx-ax),Math.abs(by-ay))); for(let i=0;i<=n;i++)rect(ax+(bx-ax)*i/(n||1),ay+(by-ay)*i/(n||1),thick,thick,c); };
  return { put, rect, oval, line, clip:(start,end)=>{clipStart=start;clipEnd=end;},png:()=>encodePng(width,height,rgba) };
}

export function canopyProp(kind='tree') {
  const p=canvas(96,128), x=48;
  if(['tree','rune_tree','elder_roots'].includes(kind)) {
    p.oval(x,119,25,5,C.ink);
    for(const [dx,dy] of [[-24,116],[-12,120],[20,119],[28,112]])p.line(x,81,x+dx,dy,C.wood,6);
    p.line(x-5,53,x-6,116,C.wood,16);p.line(x-6,66,x-9,113,C.woodLight,3);
    p.line(x-6,68,15,43,C.wood,7);p.line(x+2,73,81,51,C.wood,7);
    for(const [cx,cy,rx,ry] of [[48,27,29,22],[22,43,21,20],[73,45,21,22],[46,50,32,22]]) {
      p.oval(cx,cy,rx+2,ry+2,C.ink);p.oval(cx,cy,rx,ry,C.dark);
      p.oval(cx-2,cy-3,rx-3,ry-3,C.green);p.oval(cx-7,cy-7,rx-8,ry-8,C.leaf);
      for(let n=0;n<12;n++)p.rect(cx+(n*7%35)-17,cy+(n*11%25)-12,3,2,n%3?C.green:C.pale);
    }
    if(kind!=='tree'){p.rect(42,79,13,15,C.ink);p.line(48,81,48,91,C.blue,2);p.line(43,86,53,86,C.blue,2);}
  } else if(kind==='mushrooms') {
    p.oval(x,119,27,5,C.ink);
    for(const [dx,y,r] of [[-21,99,13],[4,79,18],[23,106,10]]) {
      p.rect(x+dx-3,y,6,120-y,C.pale);p.oval(x+dx,y,r,6,C.dark);p.oval(x+dx,y-3,r,7,C.blue);
      p.rect(x+dx-5,y-7,4,2,C.pale);p.rect(x+dx+3,y-4,3,2,C.pale);
    }
  } else {
    p.oval(x,120,30,4,C.ink);p.rect(16,113,64,7,C.dark);p.rect(19,110,58,5,C.stoneLight);
    p.rect(24,99,48,12,C.stone);p.rect(25,99,45,3,C.stoneLight);
    const arch=['bridge','vine_gate','root_arch'].includes(kind);
    if(arch){p.rect(23,49,12,53,C.stone);p.rect(63,49,12,53,C.stone);p.oval(x,48,28,18,C.stone);p.rect(35,49,28,52,C.ink);p.oval(x,52,14,12,C.ink);}
    else {p.rect(34,55,29,44,C.stone);p.rect(31,51,35,8,C.stoneLight);p.oval(x,40,15,17,C.stone);p.rect(39,36,5,3,C.dark);p.rect(53,36,5,3,C.dark);p.rect(45,45,7,2,C.dark);}
    for(const y of [62,78,93])p.line(35,y,58,y+2,C.dark,2);
    p.line(27,61,29,105,C.leaf,3);p.rect(23,93,13,4,C.green);
    if(['seed_shrine','crown','lantern','vine_gate'].includes(kind)) {p.oval(x,66,9,9,C.dark);p.oval(x,66,6,6,C.blue);p.rect(x-1,60,2,12,C.pale);}
  }
  return p.png();
}

export function canopyTerrain() {
  const p=canvas(256,192);
  for(let row=0;row<6;row++)for(let col=0;col<8;col++) {
    const ox=col*32,oy=row*32, kind=col===1?'wall':col===2?'stone':col===3?'path':col===4?'water':'grass';
    p.rect(ox,oy,32,32,kind==='wall'?C.dark:kind==='stone'?C.stone:kind==='path'?'#85765e':kind==='water'?'#225f70':'#315b55');
    if(kind==='grass' && col===5) for(const [x,y] of [[6,7],[23,19]]) { p.rect(ox+x,oy+y,3,1,'#3b6b5e');p.rect(ox+x+1,oy+y-2,1,3,'#467861'); }
    if(kind==='wall') for(let n=0;n<7;n++) {const x=4+n*11%25,y=3+n*7%25;p.oval(ox+x,oy+y,7,4,C.green);p.rect(ox+x-2,oy+y-2,4,1,C.leaf);}
    if(kind==='stone') {for(const y of [8,19,30])p.rect(ox,oy+y,32,2,C.dark);p.rect(ox+4,oy+2,17,2,C.stoneLight);p.rect(ox+16,oy+10,2,10,C.dark);}
    if(kind==='path') for(const [x,y] of [[6,8],[21,23],[11,27]]){p.rect(ox+x,oy+y,5,2,C.woodLight);p.rect(ox+x+4,oy+y+2,2,1,C.wood);}
    if(kind==='water')for(const y of [6,18,28]){p.rect(ox+2+row%3,oy+y,12,1,C.blue);p.rect(ox+18,oy+y+3,10,2,C.dark);}
  }
  return p.png();
}

export function canopySound(id) {
  const rate=22050, length=Math.round(rate*(id==='ability'?0.55:0.18)), bytes=Buffer.alloc(44+length*2);
  bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);
  bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);
  bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(length*2,40);
  const frequency={pickup:680,ability:440,ui_click:540,player_attack:180,hit:95,boss_hit:110,boss_attack:70}[id]??220;
  for(let i=0;i<length;i++) {
    const t=i/rate, envelope=Math.min(1,i/(rate*0.008))*Math.pow(1-i/length,2);
    const f=frequency*(id==='pickup'||id==='ability'?1+t*2:1-t*2);
    const value=Math.sin(t*f*Math.PI*2)*0.55+Math.sin(t*f*3*Math.PI*2)*0.15;
    bytes.writeInt16LE(Math.round(value*envelope*11000),44+i*2);
  }
  return bytes;
}

