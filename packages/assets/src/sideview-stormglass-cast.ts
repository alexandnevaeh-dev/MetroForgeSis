import { encodePng } from './png.js';

type Rgba = readonly [number, number, number, number];
export type StormglassEnemyAction = 'idle' | 'walk' | 'attack' | 'hurt' | 'death';
const COUNTS: Record<StormglassEnemyAction, number> = { idle: 6, walk: 8, attack: 8, hurt: 3, death: 8 };
const INK: Rgba = [19, 20, 37, 255], STONE: Rgba = [66, 67, 101, 255], LIGHT: Rgba = [108, 119, 151, 255];
const ACCENTS: Rgba[] = [[62, 210, 198, 255], [219, 105, 77, 255], [193, 79, 139, 255], [230, 166, 66, 255]];

function put(out: Uint8Array, w: number, x: number, y: number, c: Rgba): void { if (x >= 0 && y >= 0 && x < w && y < 64) out.set(c, (y * w + x) * 4); }
function rect(out: Uint8Array, w: number, x: number, y: number, rw: number, rh: number, c: Rgba): void { for (let py=y;py<y+rh;py++) for(let px=x;px<x+rw;px++) put(out,w,px,py,c); }
function line(out: Uint8Array, w: number, x0: number, y0: number, x1: number, y1: number, c: Rgba): void { const n=Math.max(Math.abs(x1-x0),Math.abs(y1-y0),1); for(let i=0;i<=n;i++) put(out,w,Math.round(x0+(x1-x0)*i/n),Math.round(y0+(y1-y0)*i/n),c); }

/**
 * Five silhouette families recur once per biome.  The previous implementation drew every
 * enemy as the same rectangular sentinel and only changed its accent colour; in game that
 * read as a row of coloured boxes beside the authored player.  Keep the compact deterministic
 * generator, but give each combat family its own anatomy, weapon and motion language.
 */
export function generateStormglassEnemySheet(action: StormglassEnemyAction, variant = 0): Buffer {
  const count=COUNTS[action], width=count*64, out=new Uint8Array(width*64*4), accent=ACCENTS[variant%ACCENTS.length]!;
  const family=Math.floor(Math.max(0,variant)/ACCENTS.length)%5;
  for(let f=0;f<count;f++) {
    const ox=f*64, phase=f/count*Math.PI*2, stride=action==='walk'?Math.round(Math.sin(phase)*4):0;
    const breathe=action==='idle'?Math.round(Math.sin(phase)):0;
    const recoil=action==='hurt'?(f-1)*4:0, death=action==='death'?f/(count-1):0;
    const attackArc=action==='attack'?Math.sin(f/(count-1)*Math.PI):0;
    const lunge=Math.round(attackArc*(family===4?11:8)), cx=ox+30+recoil+lunge, feet=57;
    const sink=Math.round(death*(family===2?24:18));
    const fadeHeight=(value:number,min=2)=>Math.max(min,value-Math.round(death*(value-min)));

    if(family===0){
      // Choir Husk: a narrow chorister robe, split mitre and glowing rib-organ pipes.
      for(let y=28;y<feet-sink;y++){
        const half=6+Math.floor((y-28)*0.28);
        rect(out,width,cx-half,y+breathe+sink,half*2,1,(y%5===0)?STONE:INK);
      }
      rect(out,width,cx-7,17+breathe+sink,14,12,INK);
      line(out,width,cx-6,18+sink,cx-10,10+sink,accent); line(out,width,cx+6,18+sink,cx+10,10+sink,accent);
      for(let pipe=-5;pipe<=5;pipe+=5) rect(out,width,cx+pipe-1,32+sink,3,13-Math.abs(pipe)/2,accent);
      rect(out,width,cx-2,20+sink,4,4,LIGHT);
      const arm=Math.round(attackArc*9);
      line(out,width,cx+7,33+sink,cx+15+arm,39-Math.round(attackArc*8)+sink,STONE);
      rect(out,width,cx-13+stride,feet-2,10,2,LIGHT); rect(out,width,cx+3-stride,feet-2,10,2,LIGHT);
    }else if(family===1){
      // Lancet Knight: tall plate silhouette, kite shield and an unmistakable long lance.
      rect(out,width,cx-10,20+breathe+sink,19,fadeHeight(28),INK);
      rect(out,width,cx-7,23+breathe+sink,13,fadeHeight(21),STONE);
      rect(out,width,cx-7,11+breathe+sink,15,12,INK); rect(out,width,cx-4,15+breathe+sink,10,4,LIGHT);
      line(out,width,cx-4,11+sink,cx,6+sink,accent); line(out,width,cx+5,11+sink,cx+9,7+sink,accent);
      // Shield on the rear side, lance on the facing side.
      rect(out,width,cx-16,28+sink,8,17,INK); rect(out,width,cx-14,30+sink,4,12,accent);
      const reach=22+Math.round(attackArc*15);
      line(out,width,cx+8,29+sink,cx+8+reach,27-Math.round(attackArc*7)+sink,LIGHT);
      line(out,width,cx+8,30+sink,cx+8+reach,28-Math.round(attackArc*7)+sink,accent);
      rect(out,width,cx-9+stride,48+sink,7,9-sink/3,INK); rect(out,width,cx+3-stride,48+sink,7,9-sink/3,INK);
      rect(out,width,cx-11+stride,55,10,2,LIGHT); rect(out,width,cx+2-stride,55,10,2,LIGHT);
    }else if(family===2){
      // Censer Bat: broad animated wings, tiny mask and a pendulum censer below the body.
      const flap=Math.round(Math.sin(phase)*7)+(action==='attack'?Math.round(attackArc*5):0);
      const cy=28+breathe+sink;
      rect(out,width,cx-6,cy-6,12,15,INK); rect(out,width,cx-3,cy-3,6,6,LIGHT); put(out,width,cx+2,cy-1,accent);
      line(out,width,cx-5,cy-3,cx-23,cy-15-flap,accent); line(out,width,cx-23,cy-15-flap,cx-28,cy+7,STONE);
      line(out,width,cx+5,cy-3,cx+23,cy-15-flap,accent); line(out,width,cx+23,cy-15-flap,cx+28,cy+7,STONE);
      for(let rib=0;rib<3;rib++){
        line(out,width,cx-7,cy,cx-25+rib*4,cy+5-flap+rib*4,INK);
        line(out,width,cx+7,cy,cx+25-rib*4,cy+5-flap+rib*4,INK);
      }
      const swing=Math.round(Math.sin(phase)*4)+Math.round(attackArc*8);
      line(out,width,cx,cy+8,cx+swing,cy+21,STONE); rect(out,width,cx+swing-4,cy+20,8,7,INK); rect(out,width,cx+swing-2,cy+22,4,3,accent);
    }else if(family===3){
      // Glassbound Acolyte: hooded caster with a long split robe and orbiting glass shards.
      for(let y=25;y<feet-sink;y++){
        const half=7+Math.floor((y-25)*0.23);
        rect(out,width,cx-half,y+breathe+sink,half*2,1,(y%6===0)?STONE:INK);
      }
      rect(out,width,cx-9,12+breathe+sink,18,15,INK); rect(out,width,cx-5,17+breathe+sink,10,7,LIGHT);
      rect(out,width,cx-2,19+breathe+sink,4,3,accent);
      const cast=Math.round(attackArc*12);
      line(out,width,cx+7,30+sink,cx+15+cast,22-Math.round(attackArc*8)+sink,accent);
      line(out,width,cx-7,31+sink,cx-15,25+sink,STONE);
      for(let shard=0;shard<3;shard++){
        const a=phase+shard*2.1+attackArc;
        const sx=cx+Math.round(Math.cos(a)*(16+cast/3)), sy=27+sink+Math.round(Math.sin(a)*12);
        line(out,width,sx,sy,sx+3,sy-6,accent); put(out,width,sx+1,sy-3,LIGHT);
      }
      rect(out,width,cx-13+stride,55,10,2,LIGHT); rect(out,width,cx+3-stride,55,10,2,LIGHT);
    }else{
      // Bell Rat: low quadruped; a cracked bell shell, bright snout and whip tail.
      const crouch=Math.round(attackArc*3)+sink;
      rect(out,width,cx-15,39+crouch,28,fadeHeight(13,4),INK);
      rect(out,width,cx-11,36+crouch,21,12,STONE);
      // Bell shell flares at the base and carries a visible crack.
      line(out,width,cx-10,37+crouch,cx-5,29+crouch,accent); line(out,width,cx+9,37+crouch,cx+5,29+crouch,accent);
      rect(out,width,cx-12,45+crouch,24,3,accent); line(out,width,cx,33+crouch,cx+3,41+crouch,INK);
      rect(out,width,cx+10,40+crouch,10,8,INK); rect(out,width,cx+16,42+crouch,5,3,LIGHT); put(out,width,cx+16,40+crouch,accent);
      line(out,width,cx-14,42+crouch,cx-25-stride,35+Math.round(Math.sin(phase)*5)+crouch,accent);
      rect(out,width,cx-11+stride,52,6,5,INK); rect(out,width,cx+5-stride,52,6,5,INK);
    }
  }
  return encodePng(width,64,out);
}
export function stormglassEnemyFrameCount(action: StormglassEnemyAction): number { return COUNTS[action]; }

export type StormglassNpcAction = 'idle' | 'walk' | 'talk' | 'listen';
const NPC_COUNTS: Record<StormglassNpcAction, number> = { idle: 6, walk: 8, talk: 6, listen: 4 };

/** Hooded reliquary keepers and drowned pilgrims with readable conversational gestures. */
export function generateStormglassNpcSheet(action: StormglassNpcAction, variant = 0): Buffer {
  const count = NPC_COUNTS[action], width = count * 64, out = new Uint8Array(width * 64 * 4);
  const accent = ACCENTS[(variant + 1) % ACCENTS.length]!;
  for (let f = 0; f < count; f++) {
    const ox = f * 64, phase = f / count * Math.PI * 2;
    const gait = action === 'walk' ? Math.round(Math.sin(phase) * 3) : 0;
    const breathe = action === 'idle' ? Math.round(Math.sin(phase)) : 0;
    const gesture = action === 'talk' ? Math.round(Math.sin(phase) * 7) : action === 'listen' ? -3 : 0;
    const cx = ox + 31, feet = 59, bob = breathe + (action === 'walk' ? Math.abs(gait) % 2 : 0);
    // Layered pilgrim cloak: a wide shoulder mantle narrows into the torso, then opens into a
    // split, weather-heavy hem. Rows are shaded deliberately rather than filled as rectangles.
    for (let y = 27; y < feet; y++) {
      const half = y < 35 ? 13 - Math.floor((y - 27) * 0.45) : 9 + Math.floor((y - 35) * 0.22);
      const shade = y % 6 === 0 ? LIGHT : y % 3 === 0 ? STONE : INK;
      rect(out, width, cx - half, y + bob, half * 2 + 1, 1, shade);
    }
    // Pointed hood, deep face opening, glass brooch and layered shoulder cape.
    for (let y = 9; y <= 27; y++) {
      const hoodHalf = y < 15 ? 3 + Math.floor((y - 9) * 0.8) : 8 - Math.floor((y - 15) * 0.18);
      rect(out, width, cx - hoodHalf, y + bob, hoodHalf * 2 + 1, 1, y % 4 === 0 ? STONE : INK);
    }
    rect(out, width, cx - 5, 16 + bob, 11, 9, [8, 11, 20, 255]);
    put(out, width, cx - 2, 20 + bob, accent); put(out, width, cx + 3, 20 + bob, accent);
    line(out, width, cx - 13, 27 + bob, cx - 8, 34 + bob, LIGHT);
    line(out, width, cx + 13, 27 + bob, cx + 8, 34 + bob, LIGHT);
    rect(out, width, cx - 3, 27 + bob, 7, 6, accent);
    put(out, width, cx, 29 + bob, [235, 220, 154, 255]);

    // Sleeves and hands carry the conversational motion. The far arm remains dark so the front
    // gesture reads cleanly in silhouette at gameplay scale.
    line(out, width, cx - 10, 31 + bob, cx - 17 - Math.round(gesture * 0.35), 43 - Math.abs(gesture) + bob, STONE);
    line(out, width, cx - 9, 31 + bob, cx - 16 - Math.round(gesture * 0.35), 43 - Math.abs(gesture) + bob, INK);
    line(out, width, cx + 10, 31 + bob, cx + 17 + gesture, 43 - Math.abs(gesture) + bob, accent);
    rect(out, width, cx + 16 + gesture, 41 - Math.abs(gesture) + bob, 3, 3, [210, 177, 148, 255]);

    // Four keeper identities: weather staff, merchant satchel, archive book, and censer beads.
    const role = ((variant % 4) + 4) % 4;
    if (role === 0) {
      line(out, width, cx - 18, 22 + bob, cx - 18, 57, [125, 91, 58, 255]);
      line(out, width, cx - 22, 23 + bob, cx - 18, 17 + bob, accent);
      line(out, width, cx - 18, 17 + bob, cx - 14, 23 + bob, accent);
    } else if (role === 1) {
      line(out, width, cx - 7, 31 + bob, cx + 12, 48 + bob, [153, 112, 63, 255]);
      rect(out, width, cx + 7, 42 + bob, 11, 10, [76, 48, 42, 255]);
      rect(out, width, cx + 9, 44 + bob, 7, 2, accent);
    } else if (role === 2) {
      rect(out, width, cx + 10 + Math.round(gesture * 0.4), 34 - Math.abs(gesture) + bob, 10, 8, INK);
      rect(out, width, cx + 11 + Math.round(gesture * 0.4), 35 - Math.abs(gesture) + bob, 4, 6, LIGHT);
      line(out, width, cx + 15 + Math.round(gesture * 0.4), 35 - Math.abs(gesture) + bob, cx + 15 + Math.round(gesture * 0.4), 41 - Math.abs(gesture) + bob, accent);
    } else {
      line(out, width, cx + 15 + gesture, 42 - Math.abs(gesture) + bob, cx + 20 + gesture, 51 + bob, LIGHT);
      rect(out, width, cx + 17 + gesture, 49 + bob, 7, 6, INK);
      rect(out, width, cx + 19 + gesture, 51 + bob, 3, 3, accent);
    }

    // Split hem and asymmetric feet prevent the old vending-machine silhouette.
    line(out, width, cx, 38 + bob, cx - 2, 56 + bob, accent);
    rect(out, width, cx - 14 + gait, feet - 2, 11, 3, INK);
    rect(out, width, cx + 3 - gait, feet - 2, 11, 3, INK);
    rect(out, width, cx - 13 + gait, feet, 10, 2, LIGHT);
    rect(out, width, cx + 3 - gait, feet, 10, 2, LIGHT);
  }
  return encodePng(width, 64, out);
}
export function stormglassNpcFrameCount(action: StormglassNpcAction): number { return NPC_COUNTS[action]; }

export type StormglassGuardianAction = 'walk' | 'attack' | 'hurt' | 'death';
const GUARDIAN_COUNTS: Record<StormglassGuardianAction, number> = { walk: 6, attack: 8, hurt: 3, death: 8 };

/** Chapter guardians at 96px frames, visually heavier than the 64px enemy family. */
export function generateStormglassGuardianSheet(action: StormglassGuardianAction, variant = 0): Buffer {
  const count = GUARDIAN_COUNTS[action], frame = 96, width = count * frame;
  const out = new Uint8Array(width * frame * 4), accent = ACCENTS[variant % ACCENTS.length]!;
  const p = (x: number, y: number, c: Rgba) => { if (x >= 0 && y >= 0 && x < width && y < frame) out.set(c, (y * width + x) * 4); };
  const r = (x: number, y: number, rw: number, rh: number, c: Rgba) => { for (let py = y; py < y + rh; py++) for (let px = x; px < x + rw; px++) p(px, py, c); };
  const l = (x0: number, y0: number, x1: number, y1: number, c: Rgba) => { const n = Math.max(Math.abs(x1-x0),Math.abs(y1-y0),1); for(let i=0;i<=n;i++) p(Math.round(x0+(x1-x0)*i/n),Math.round(y0+(y1-y0)*i/n),c); };
  for (let f = 0; f < count; f++) {
    const phase = f / count * Math.PI * 2, ox = f * frame;
    const step = action === 'walk' ? Math.round(Math.sin(phase) * 5) : 0;
    const lunge = action === 'attack' ? Math.round(Math.sin(f / (count - 1) * Math.PI) * 12) : 0;
    const recoil = action === 'hurt' ? (f - 1) * 5 : 0, fall = action === 'death' ? f / (count - 1) : 0;
    const cx = ox + 47 + lunge + recoil, feet = 88, sink = Math.round(fall * 34);
    r(cx - 20, feet - 43 + sink, 40, Math.max(5, 32 - Math.round(fall * 22)), INK);
    r(cx - 15, feet - 39 + sink, 30, Math.max(4, 24 - Math.round(fall * 16)), STONE);
    r(cx - 9, feet - 34 + sink, 18, 15, accent);
    r(cx - 15, feet - 61 + sink, 30, 20, INK);
    r(cx - 10, feet - 56 + sink, 20, 12, LIGHT);
    r(cx - 5, feet - 52 + sink, 10, 6, accent);
    r(cx - 18 + step, feet - 12, 9, 12, INK); r(cx + 9 - step, feet - 12, 9, 12, INK);
    r(cx - 22 + step, feet - 3, 14, 3, LIGHT); r(cx + 8 - step, feet - 3, 14, 3, LIGHT);
    const reach = action === 'attack' ? 36 : 23;
    l(cx + 17, feet - 35, cx + 17 + reach, feet - 48 - (action === 'attack' ? 8 : 0), accent);
    l(cx + 18, feet - 34, cx + 18 + reach, feet - 47 - (action === 'attack' ? 8 : 0), LIGHT);
    // Variant-specific reliquary crown prongs make each chapter guardian identifiable.
    for (let prong = 0; prong < 2 + (variant % 3); prong++) l(cx - 10 + prong * 7, feet - 60 + sink, cx - 13 + prong * 9, feet - 73 + sink - prong * 2, accent);
  }
  return encodePng(width, frame, out);
}
export function stormglassGuardianFrameCount(action: StormglassGuardianAction): number { return GUARDIAN_COUNTS[action]; }

/** Twelve transparent architectural props: lanterns, glass shards, rain vessels and reliquary markers. */
export function generateStormglassProp(index: number, biome = 0): Buffer {
  const size=index<4?48:32, out=new Uint8Array(size*size*4), accent=ACCENTS[(index+biome)%ACCENTS.length]!;
  const p=(x:number,y:number,c:Rgba)=>{if(x>=0&&y>=0&&x<size&&y<size)out.set(c,(y*size+x)*4);};
  const r=(x:number,y:number,w:number,h:number,c:Rgba)=>{for(let py=y;py<y+h;py++)for(let px=x;px<x+w;px++)p(px,py,c);};
  const kind=index%6;
  if(kind===0){r(size/2-3,7,6,size-12,INK);r(size/2-8,10,16,14,STONE);r(size/2-5,13,10,8,accent);}
  if(kind===1){r(5,size-9,size-10,6,STONE);r(9,size-19,size-18,10,INK);r(12,size-17,size-24,6,accent);}
  if(kind===2){r(size/2-2,6,4,size-9,STONE);r(size/2-10,5,20,4,LIGHT);r(size/2-6,12,12,12,accent);}
  if(kind===3){r(4,size-8,size-8,5,STONE);for(let x=8;x<size-5;x+=7)r(x,size-20-(x%5),4,12+(x%5),accent);}
  if(kind===4){r(7,9,size-14,size-12,INK);r(10,12,size-20,size-18,accent);r(size/2-1,12,2,size-18,LIGHT);}
  if(kind===5){r(5,size-8,size-10,5,STONE);r(size/2-4,8,8,size-16,accent);r(size/2-7,7,14,3,LIGHT);}
  return encodePng(size,size,out);
}
