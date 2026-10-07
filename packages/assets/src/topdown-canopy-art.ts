import {encodePng,extractSheetFramePng} from './png.js';

export type CanopyActorKind='hero'|'melee'|'ranged'|'npc'|'boss';
export type CanopyAction='idle'|'walk'|'run'|'attack'|'hurt'|'death'|'cast';
export type CanopyFacing='N'|'NE'|'E'|'SE'|'S'|'SW'|'W'|'NW';
export const CANOPY_ACTION_FRAMES: Record<CanopyAction,number>={idle:12,walk:12,run:16,attack:12,hurt:6,death:12,cast:12};
export const CANOPY_EFFECT_IDS=['hit_spark','death_puff','dash_trail','pickup_spark','ability_unlock','boss_phase_shift','area_burst','slam_shock','attack_warning'] as const;

// New source art for the canopy set. Pixel clusters, shared lighting and grounded anchors.
const C = { ink:'#18232f', dark:'#263d43', wood:'#655447', woodLight:'#a18c65',
  green:'#428276', leaf:'#82b987', pale:'#dae2b5', gold:'#eeb866', blue:'#63d8d3',
  stone:'#657781', stoneLight:'#a1b0ae', violet:'#946485', red:'#e07b80',
  coral:'#d06465', coralShadow:'#8d3f56', coralLight:'#f1a18b', brass:'#b99668' };
function canvas(width: number, height: number, offsetY=0) {
  const rgba = new Uint8Array(width * height * 4);
  let clipStart=0,clipEnd=width;
  const put = (x: number,y: number,color: string) => { x=Math.round(x); y=Math.round(y)+offsetY; if(x<0||y<0||x>=width||y>=height)return;
    if(x<clipStart||x>=clipEnd)return;
    const hex=color.replace('#',''); rgba.set([parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16),hex.length===8?parseInt(hex.slice(6,8),16):255],(y*width+x)*4); };
  const rect = (x: number,y: number,w: number,h: number,c: string) => { for(let dy=0;dy<h;dy++)for(let dx=0;dx<w;dx++)put(x+dx,y+dy,c); };
  const oval = (x: number,y: number,rx: number,ry: number,c: string) => { for(let py=-ry;py<=ry;py++)for(let px=-rx;px<=rx;px++)if(px*px/(rx*rx)+py*py/(ry*ry)<=1)put(x+px,y+py,c); };
  const line = (ax: number,ay: number,bx: number,by: number,c: string,thick=2) => { const n=Math.ceil(Math.max(Math.abs(bx-ax),Math.abs(by-ay))); for(let i=0;i<=n;i++)rect(ax+(bx-ax)*i/(n||1),ay+(by-ay)*i/(n||1),thick,thick,c); };
  return { put, rect, oval, line, clip:(start: number,end: number)=>{clipStart=start;clipEnd=end;},png:()=>encodePng(width,height,rgba) };
}

export function canopyActor(kind: CanopyActorKind, action: CanopyAction='idle', facing: CanopyFacing='S', count=8) {
  const size=kind==='boss'?128:64, p=canvas(size*count,size);
  for(let frame=0;frame<count;frame++) {
    p.clip(frame*size,(frame+1)*size);
    const o=frame*size, phase=frame/count*Math.PI*2, moving=['walk','run'].includes(action);
    const gait=moving?Math.sin(phase)*(action==='run'?5.5:3.5):0;
    const bob=moving?Math.round(Math.abs(Math.sin(phase))):action==='idle'?Math.round(Math.sin(phase)):0;
    const dead=action==='death'?frame/(count-1):0;
    const hit=action==='hurt'?Math.round(Math.sin(frame)*2):0;
    const u=frame/Math.max(1,count-1), attack=action==='attack';
    const wind=attack?(u<.28?-Math.sin(u/.28*Math.PI/2):u<.64?Math.sin((u-.28)/.36*Math.PI):0):0;
    const cx=o+size/2+hit+wind*1.5, base=size-(kind==='boss'?6:3), top=(kind==='boss'?25:20)+bob+dead*16;
    if(action==='death' && frame>=Math.ceil(count/2)) {
      const collapsed=frame/(count-1);
      p.oval(cx,base-1,kind==='boss'?34:18,kind==='boss'?6:3,C.ink);
      p.oval(cx,base-8,kind==='boss'?30:16,Math.max(3,12-collapsed*8),kind==='hero'?C.coral:kind==='ranged'?C.violet:C.wood);
      p.oval(cx-(kind==='boss'?23:13),base-8,kind==='boss'?12:7,5,C.woodLight);
      p.line(cx-5,base-10,cx+16,base-7,C.pale,2);
      for(let n=0;n<8;n++)p.rect(cx-12+n*3,base-9+(n%3),2,1,n%2?C.dark:C.gold);
      p.line(cx+10,base-7,cx+22,base-5,C.stoneLight,2);
      if(kind==='boss'){p.oval(cx+5,base-8,7,3,C.dark);p.line(cx+3,base-10,cx+8,base-7,C.blue,2);for(const dx of [-19,-7,16])p.line(cx+dx,base-5,cx+dx+3,base-8,C.woodLight,2);}
      continue;
    }
    const left=facing.includes('W'), north=facing.includes('N');
    if(kind==='boss') {
      p.oval(cx,base-1,34,6,C.ink);
      for(const side of [-1,1]) {
        p.line(cx+side*10,top+44,cx+side*(28+gait),base-4,C.wood,12);
        p.line(cx+side*8,top+44,cx+side*(26+gait),base-4,C.woodLight,3);
        const reach=attack?wind*12:Math.sin(phase+side)*2;
        p.line(cx+side*14,top+17,cx+side*40,top+24+reach,C.ink,12);
        p.line(cx+side*14,top+18,cx+side*39,top+24+reach,C.wood,9);
        p.line(cx+side*38,top+25+reach,cx+side*46,top+43+reach,C.woodLight,5);
        p.line(cx+side*39,top+26+reach,cx+side*43,top+38+reach,C.wood,2);
        for(let claw=0;claw<3;claw++)p.line(cx+side*(43+claw*3),top+39+reach,cx+side*(45+claw*3),top+48+reach,C.pale,2);
      }
      p.oval(cx,top+36,23,36,C.ink); p.oval(cx,top+35,20,33,C.wood);
      for(const dx of [-12,-5,4,11])p.line(cx+dx,top+9,cx+dx-3,top+55,C.woodLight,2);
      for(let n=0;n<17;n++) {
        const dx=-15+n*11%30,dy=13+n*7%46;
        p.line(cx+dx,top+dy,cx+dx+2,top+dy+6,n%3===0?C.dark:C.woodLight,1);
      }
      p.oval(cx,top+41,12,17,C.ink);p.oval(cx,top+40,9,14,C.dark);
      p.oval(cx,top+40,5+Math.sin(phase)*1.5,8,C.blue);
      p.line(cx-2,top+33,cx+1,top+44,C.pale,2);
      for(const side of [-1,1])for(let n=0;n<4;n++) {
        p.line(cx+side*9,top+38+n*5,cx+side*(18+n%2*3),top+32+n*5,C.woodLight,2);
        p.line(cx+side*22,base-10,cx+side*(31+n*2),base-3-n%2,C.dark,3);
      }
      p.oval(cx,top+2,29,18,C.dark); p.oval(cx-10,top-2,22,14,C.green);
      p.oval(cx+14,top+1,20,13,C.leaf); p.oval(cx,top+5,18,10,C.green);
      for(let n=0;n<24;n++) {
        const dx=-25+n*17%51,dy=-12+n*7%23;
        p.line(cx+dx,top+dy,cx+dx+3,top+dy-2,n%4===0?C.pale:n%2?C.leaf:C.green,2);
      }
      p.rect(cx-11,top+22,7,4,C.blue);p.rect(cx+5,top+22,7,4,C.blue);
      p.line(cx-8,top+35,cx+9,top+35,C.ink,3);
      for(const dx of [-17,0,16]) {p.line(cx+dx,top-5,cx+dx-4,top-17,C.gold,3);p.rect(cx+dx-5,top-20,5,4,C.pale);}
      for(const side of [-1,1])p.line(cx+side*16,top-10,cx+side*27,top-16,C.woodLight,2);
      if(attack&&u>.27&&u<.65)p.oval(cx,top+40,9+Math.sin(u*Math.PI)*3,4,C.gold);
      continue;
    }
    const mage=kind==='ranged', npc=kind==='npc', hero=kind==='hero';
    const coat=hero?C.coral:mage?C.violet:npc?C.blue:C.green;
    p.oval(cx,base-1,14,3,C.ink);
    const waist=top+19+dead*4;
    const flutter=Math.sin(phase-.7)*(moving?3:1.2);
    // Cloth follows the previous gait phase, behind the body and planted feet.
    p.line(cx-8,top+11,cx-13+flutter,waist+12,C.ink,5);
    p.line(cx-8,top+12,cx-12+flutter,waist+10,hero?C.coralShadow:mage?C.dark:C.wood,4);
    p.line(cx-8,top+14,cx-10+flutter,waist+9,hero?C.coralLight:C.stoneLight,1);
    // One planted foot at every gait phase; the other leg lifts and passes.
    for(const side of [-1,1]) {
      const lift=moving?Math.max(0,Math.round(side*gait)):0;
      const footX=cx+side*5+side*gait*.6,kneeX=cx+side*5-side*gait*.35;
      p.line(cx+side*5,waist+7,kneeX,base-10-lift,C.ink,5);
      p.line(kneeX,base-10-lift,footX,base-3-lift,C.ink,4);
      p.line(kneeX+1,base-10-lift,footX+1,base-5-lift,C.stone,2);
      p.rect(footX-2,base-4-lift,6,4,C.wood);
      p.rect(footX-2,base-4-lift,5,1,C.woodLight);p.rect(footX+2,base-2-lift,3,1,C.pale);
    }
    p.oval(cx,waist,12,17-dead*5,C.ink);
    p.oval(cx-1,waist-1,10,15-dead*5,coat);
    p.line(cx-5,top+16,cx-7,waist+10,hero?C.coralShadow:mage?'#60455f':'#28635f',3);
    p.line(cx+1,top+13,cx+3,waist+8,hero?C.coralLight:mage?'#bb8fa5':'#70b2a2',2);
    for(let n=0;n<5;n++)p.rect(cx-7+n*3,waist+9+(n%2),1,2,C.pale);
    p.line(cx-6,top+12,cx-9,waist+11,hero?C.pale:C.leaf,2);
    p.line(cx+6,top+12,cx+10,waist+8,C.dark,2);
    p.rect(cx-10,waist+5,20,3,C.wood);p.rect(cx-2,waist+5,4,4,hero?C.brass:C.gold);
    p.rect(cx+5,waist+3,4,7,C.ink);p.rect(cx+6,waist+4,3,4,C.woodLight);
    p.line(cx-8,top+13,cx+7,waist+4,C.dark,2);p.rect(cx-3,waist-1,3,3,C.pale);
    p.oval(cx,top+2,10,10,C.ink); p.oval(cx-1,top+1,8,8,hero?C.pale:coat);
    if(!north){p.rect(cx+(left?-7:0),top+2,8,6,C.woodLight);p.rect(cx+(left?-6:3),top+3,2,2,C.ink);p.rect(cx+(left?-4:5),top+6,2,1,C.pale);}
    else p.line(cx-5,top-2,cx+5,top-2,C.dark,3);
    if(hero) {
      p.rect(cx-11,top-5,22,3,C.green);p.line(cx-7,top-7,cx+6,top-8,C.leaf,1);
      for(let n=0;n<3;n++)p.rect(cx-7+n*3,top-1,2,3,C.wood);
      p.rect(cx+6,top-12,3,8,C.leaf);p.rect(cx+8,top-13,5,3,C.pale);
      p.line(cx-6,top+10,cx+5,top+11,C.coralShadow,3);p.line(cx-6,top+12,cx-10+flutter,top+19,C.coralLight,2);
    } else if(kind==='melee') {
      p.oval(cx-9,top+12,5,4,C.ink);p.oval(cx-9,top+11,4,3,C.stoneLight);
      p.oval(cx+9,top+12,4,3,C.stone);p.line(cx+7,top+11,cx+11,top+11,C.pale,1);
      p.rect(cx-6,top-2,13,9,C.pale);p.line(cx-5,top+5,cx+4,top+7,C.stone,1);
      if(!north){p.rect(cx-4,top+1,3,2,C.dark);p.rect(cx+2,top+1,3,2,C.dark);p.put(cx-3,top+1,C.gold);p.put(cx+3,top+1,C.gold);}
      for(const side of [-1,1]){p.line(cx+side*7,top-3,cx+side*11,top-11,C.wood,3);p.line(cx+side*10,top-7,cx+side*14,top-8,C.woodLight,2);}
      p.rect(cx-4,waist-5,8,8,C.dark);p.line(cx,waist-4,cx,waist+1,C.gold,1);
    } else if(mage) {
      p.line(cx-8,top-4,cx,top-10,C.dark,3);p.line(cx,top-10,cx+8,top-4,C.violet,3);
      p.line(cx-8,top-4,cx-8,top+8,C.violet,2);p.line(cx+8,top-4,cx+8,top+8,C.violet,2);
      p.rect(cx-4,top+1,9,5,C.dark);if(!north){p.rect(cx-3,top+2,2,1,C.blue);p.rect(cx+3,top+2,2,1,C.blue);}
      p.line(cx-6,top+12,cx,top+18,C.gold,1);p.line(cx+6,top+12,cx,top+18,C.gold,1);
      p.oval(cx,top+19,2,3,C.blue);
    } else if(npc) {
      p.line(cx-7,top-3,cx+5,top-5,C.stoneLight,2);p.line(cx-7,top-2,cx-6,top+7,C.pale,2);
      p.line(cx-7,top+12,cx-2,waist+8,C.wood,2);p.rect(cx-11,waist+1,5,8,C.woodLight);
      p.rect(cx+3,top+12,3,3,C.gold);
    }
    p.line(cx-11,waist-5,cx-14,waist+8-gait,C.ink,4);
    p.line(cx+10,waist-5,cx+13,waist+8+gait,C.ink,4);
    p.rect(cx-14,waist+5-gait,3,3,C.woodLight);p.rect(cx+12,waist+5+gait,3,3,C.woodLight);
    if(hero&&action==='cast'){
      const lift=Math.sin(u*Math.PI)*7, radius=2+Math.sin(u*Math.PI)*5;
      for(const side of [-1,1]){
        p.line(cx+side*9,waist-4,cx+side*15,waist-lift,C.ink,4);
        p.line(cx+side*9,waist-3,cx+side*14,waist-lift,C.gold,2);
        p.rect(cx+side*14-1,waist-lift-1,3,3,C.pale);
      }
      p.oval(cx,waist-5-lift,radius,radius,C.green);
      p.oval(cx,waist-5-lift,Math.max(1,radius-2),Math.max(1,radius-2),C.blue);
      p.line(cx-2,waist-7-lift,cx+1,waist-5-lift,C.pale,1);
      for(let n=0;n<4;n++){const a=n*Math.PI/2+u*3; p.put(cx+Math.cos(a)*(radius+3),waist-5-lift+Math.sin(a)*(radius+3),C.gold);}
    }
    else if(npc){p.rect(cx-3,waist-1,16,12,C.wood);p.rect(cx-1,waist,12,8,C.pale);p.line(cx+5,waist,cx+5,waist+7,C.woodLight,1);for(let n=0;n<3;n++)p.line(cx+1,waist+1+n*2,cx+3,waist+1+n*2,C.stone,1);}
    else if(mage){p.line(cx+13,top-2,cx+13,base-3,C.ink,4);p.line(cx+13,top-2,cx+13,base-3,C.woodLight,2);p.oval(cx+14,top-4,5,5,C.dark);p.oval(cx+14,top-4,3+Math.sin(phase)*.8,4,C.blue);p.oval(cx+13,top-5,1,2,C.pale);for(const y of [waist,waist+7])p.rect(cx+12,y,4,1,C.gold);}
    else {
      const angles: Record<CanopyFacing,number>={N:-Math.PI/2,NE:-Math.PI/4,E:0,SE:Math.PI/4,S:Math.PI/2,SW:3*Math.PI/4,W:Math.PI,NW:-3*Math.PI/4};
      const sweep=u<.28?-.9-u/.28*.4:u<.64?-1.3+(u-.28)/.36*2.7:1.4-(u-.64)/.36;
      const angle=angles[facing]+(attack?sweep:0.4+gait*.055);
      // Keep the complete sword and active trail inside the authored 64px cell.
      // The prior off-centre hand plus 21px trail clipped east/northeast poses.
      const hx=cx+(left?-8:8),hy=waist+2+gait*.3;
      p.line(hx,hy,hx+Math.cos(angle)*16,hy+Math.sin(angle)*10,C.ink,3);
      p.line(hx,hy,hx+Math.cos(angle)*15,hy+Math.sin(angle)*10,hero?C.pale:C.woodLight,2);
      p.line(hx+Math.cos(angle)*5,hy+Math.sin(angle)*4,hx+Math.cos(angle)*12,hy+Math.sin(angle)*8,hero?C.blue:C.gold,1);
      p.rect(hx-1,hy-1,3,3,hero?C.brass:C.gold);
      if(attack&&u>.28&&u<.65)for(let n=0;n<5;n++) {
        const a=angle-n*.12;
        p.line(hx+Math.cos(a)*18,hy+Math.sin(a)*12,hx+Math.cos(a-.12)*18,hy+Math.sin(a-.12)*12,n<2?C.pale:C.blue,1);
      }
    }
    if(action==='hurt')p.rect(cx-5,top+8,10,2,C.red);
  }
  return p.png();
}

export function canopyEffect(id: string,count=1) {
  const p=canvas(32*count,32);
  for(let frame=0;frame<count;frame++) {
    const o=frame*32,x=o+16,y=16,t=count===1?.4:frame/(count-1);
    p.clip(o,o+32);
    const fade=count===1?255:Math.round(255*Math.max(.08,1-t*.92));
    const ink=(c: string)=>c+fade.toString(16).padStart(2,'0');
    const ring=(rx: number,ry: number,color: string,start=0,end=Math.PI*2)=>{
      for(let n=0;n<44;n++) {
        const a=start+(end-start)*n/44,b=start+(end-start)*(n+1)/44;
        p.line(x+Math.cos(a)*rx,y+Math.sin(a)*ry,x+Math.cos(b)*rx,y+Math.sin(b)*ry,ink(color),1);
      }
    };
    if(id==='ranged_projectile') {
      p.line(o+2,15,o+23,15,C.ink,7);p.line(o+4,16,o+25,16,C.green,5);
      p.line(o+7,17,o+27,17,C.blue,3);p.line(o+15,18,o+28,18,C.pale,1);
      p.line(o+2,12,o+13,12,C.blue,1);p.line(o+1,24,o+10,24,C.leaf,1);
      p.oval(o+24,18,4,3,C.blue);p.oval(o+25,17,2,1,C.pale);
    } else if(id==='dash_trail') {
      for(let n=0;n<7;n++) {
        const dx=-10+n*3+t*(n%2?8:-8),dy=6+n%3-t*10;
        p.line(x+dx,y+dy,x+dx+3,y+dy-2,ink(n%3?C.leaf:C.blue),2);
        p.put(x+dx+1,y+dy-2,ink(C.pale));
      }
    } else if(id==='death_puff') {
      for(let n=0;n<9;n++) {
        const a=n*2.399,r=3+t*10;
        p.oval(x+Math.cos(a)*r,y+Math.sin(a)*r,Math.max(1,3-t*2),2,ink(n%2?C.green:C.woodLight));
        p.line(x+Math.cos(a)*r,y+Math.sin(a)*r,x+Math.cos(a)*(r+2),y+Math.sin(a)*(r+2),ink(C.pale),1);
      }
    } else if(id==='slam_shock'||id==='attack_warning') {
      const r=id==='attack_warning'?10+t*3:3+t*11;
      ring(r,r*.60,C.gold);ring(Math.max(1,r-3),Math.max(1,r*.60-2),C.pale);
      for(const side of [-1,1])p.line(x+side*r,y,x+side*(r+2),y-3,ink(C.gold),1);
    } else if(id==='hit_spark') {
      for(let n=0;n<6;n++) {
        const a=n*Math.PI/3+.2,r=2+t*7;
        p.line(x+Math.cos(a)*r,y+Math.sin(a)*r,x+Math.cos(a)*(r+5-t*3),y+Math.sin(a)*(r+5-t*3),ink(n%2?C.gold:C.pale),2);
      }
      if(t<.6)p.oval(x,y,3*(1-t),3*(1-t),ink(C.pale));
    } else {
      const color=id==='pickup_spark'?C.gold:id==='boss_phase_shift'?C.leaf:C.blue;
      const r=4+t*9;
      ring(r,r*.8,color,.15,Math.PI*1.65);ring(Math.max(1,r-3),Math.max(1,r*.8-2),C.pale,Math.PI,Math.PI*2.5);
      for(let n=0;n<5;n++) {
        const a=n*Math.PI*2/5+t*1.1;
        const px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;
        p.line(px-2,py,px+2,py,ink(color),1);p.line(px,py-2,px,py+2,ink(C.pale),1);
      }
    }
  }
  return p.png();
}


export function buildCanopyActorFamily(kind: CanopyActorKind,directional=false) {
  const size=kind==='boss'?128:64;
  const sheets=new Map<string,Buffer>();
  const facings: CanopyFacing[]=['N','NE','E','SE','S','SW','W','NW'];
  for(const [action,count] of Object.entries(CANOPY_ACTION_FRAMES) as [CanopyAction,number][]) {
    if(action==='cast'&&kind!=='hero')continue;
    sheets.set(action,canopyActor(kind,action,'S',count));
    if(directional)for(const facing of facings)sheets.set(action+'_'+facing,canopyActor(kind,action,facing,count));
  }
  const metadata=Object.fromEntries(Object.entries(CANOPY_ACTION_FRAMES).filter(([action])=>action!=='cast'||kind==='hero').map(([action,frameCount])=>[action,{frameCount,fps:action==='run'||action==='cast'?24:action==='attack'?(kind==='hero'?30:21):action==='idle'?10:action==='death'&&kind==='hero'?15:16,loop:['idle','walk','run'].includes(action),...(action==='attack'&&kind==='hero'?{attackTiming:{activeStart:3.6,activeEnd:7.2,recoveryEnd:12}}:{})}]));
  return {size,still:extractSheetFramePng(sheets.get('idle')!,size,size,0),sheets,metadata};
}

export function canopyEffectMetadata() {
 return Object.fromEntries(CANOPY_EFFECT_IDS.map(id=>[id,{frameCount:10,frameWidth:32,frameHeight:32,fps:24,loop:false}]));
}

/** Small world objects share the actors' materials and a painted bottom-ground anchor. */
export function canopyIcon(kind: string,height=32) {
  const p=canvas(32,height,height-32);
  p.oval(16,29,14,2,C.ink);
  if(kind.includes('chest')) {
    p.rect(4,16,24,12,C.ink);p.rect(5,16,22,11,C.wood);p.rect(7,17,18,9,C.woodLight);
    p.oval(16,14,12,6,C.ink);p.oval(16,13,10,4,C.woodLight);p.rect(6,13,20,5,C.wood);
    for(const x of [8,22]){p.rect(x,10,2,16,C.gold);p.rect(x,11,1,11,C.pale);}
    p.rect(5,19,22,2,C.ink);p.rect(14,18,4,5,C.gold);p.rect(15,20,2,2,C.ink);
    for(const y of [23,25])p.line(11,y,20,y,C.wood,1);
    for(const x of [6,24])p.put(x,25,C.gold);
    if(kind.includes('open')){p.rect(6,4,20,9,C.ink);p.rect(8,5,16,5,C.woodLight);p.rect(8,14,16,6,C.ink);p.line(11,16,21,16,C.gold,1);}
  } else if(kind==='gate') {
    for(const side of [4,24]){p.rect(side,4,5,25,C.ink);p.rect(side+1,5,3,23,C.wood);p.line(side+2,8,side+1,24,C.woodLight,1);}
    p.line(7,8,26,24,C.green,3);p.line(8,24,25,8,C.leaf,2);
    for(const [x,y] of [[10,12],[20,20],[20,10],[11,22]])p.line(x,y,x+3,y-2,C.pale,1);
    p.oval(16,17,5,6,C.dark);p.oval(16,17,3,4,C.blue);p.line(16,14,16,19,C.pale,1);
  } else if(kind==='portal') {
    p.oval(16,15,11,12,C.ink);p.oval(16,14,9,10,C.wood);p.oval(16,14,6,8,C.dark);
    for(const side of [-1,1])p.line(16+side*8,10,16+side*7,25,C.woodLight,2);
    for(let n=0;n<7;n++){const a=n*Math.PI/3.5;p.rect(16+Math.cos(a)*5,14+Math.sin(a)*7,2,2,n%2?C.blue:C.pale);}
    p.line(10,26,23,26,C.stoneLight,2);p.line(12,28,21,28,C.stone,1);
    p.line(9,7,12,4,C.leaf,2);p.line(22,8,24,5,C.green,2);
  } else if(kind==='disc'||kind==='ability') {
    p.rect(7,26,18,3,C.stone);p.line(7,25,24,25,C.stoneLight,1);
    p.oval(16,16,9,9,C.ink);p.oval(16,15,7,7,C.gold);p.oval(16,15,4,4,C.green);
    p.line(12,19,21,11,C.pale,1);p.line(12,12,19,19,C.blue,1);
  } else {
    p.rect(5,26,22,3,C.stone);p.line(5,25,26,25,C.stoneLight,1);
    p.rect(9,22,14,3,C.wood);p.oval(16,15,9,10,C.ink);p.oval(16,14,7,8,C.green);
    p.oval(16,14,4,6,kind==='health'?C.red:C.blue);p.line(15,9,15,17,C.pale,2);
    p.line(9,20,7,26,C.leaf,2);p.line(22,21,24,25,C.green,2);
    for(const [x,y] of [[6,25],[22,26]])p.put(x,y,C.pale);
  }
  return p.png();
}

export function canopyPickup(kind: string) {
  const p=canvas(32,32);
  p.oval(16,29,11,2,C.ink);
  if(kind==='health') {
    p.rect(12,5,8,4,C.wood);p.rect(13,9,6,4,C.pale);
    p.oval(16,22,8,8,C.ink);p.oval(16,21,6,7,C.red);
    p.rect(13,15,2,7,C.pale);p.rect(19,20,2,5,C.violet);
    p.line(17,19,21,15,C.leaf,2);
  } else {
    p.oval(16,22,8,8,C.ink);p.oval(16,21,6,7,C.gold);
    p.line(13,24,20,17,C.wood,2);p.rect(17,17,4,2,C.pale);
  }
  return p.png();
}
