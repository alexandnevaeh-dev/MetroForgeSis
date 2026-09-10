throw new Error('MISSING AUTHORED ANIMATION: procedural SunnyLand V3.1 pose generation is disabled. Use scripts/ingest-sunnyland-v3-1-authored.mjs after artist-authored strips are accepted.');

const root = process.cwd();
const source = path.join(root, 'assets/external/sunnyland_forest/original/Sunny-land-forest-files/Assets/PNG/sprites/player');
const output = path.join(root, 'assets/external/sunnyland_forest/normalized/player_v3_1');
const godotOutput = path.join(root, 'templates/godot-metroidvania/assets/characters/sunnyland_v3_1');
const cell = 64;
const states = {
  idle: ['idle', 9, 8, true], walk: ['skip', 8, 12, true], run: ['skip', 8, 14, true],
  jump_start: ['jump', 3, 12, false], jump: ['jump', 4, 10, true], fall: ['fall', 4, 10, true], land: ['duck', 3, 14, false],
  attack: ['hurt', 6, 18, false], attack_2: ['jump', 6, 18, false], attack_3: ['fall', 6, 18, false], hurt: ['hurt', 3, 14, false], death: ['fall', 10, 10, false],
  dash: ['skip', 5, 18, false], air_dash: ['jump', 5, 18, false], double_jump: ['jump', 4, 14, false], wall_slide: ['climb', 4, 8, true], wall_jump: ['jump', 4, 14, false],
  ground_slam_start: ['duck', 3, 12, false], ground_slam_fall: ['fall', 3, 12, false], ground_slam_impact: ['duck', 5, 16, false],
  swim: ['climb', 6, 10, true], swim_idle: ['idle', 5, 8, true], grapple: ['climb', 5, 12, false], phase: ['idle', 5, 12, false],
  respawn: ['idle', 8, 10, false], interact: ['duck', 4, 10, false], ability_acquire: ['jump', 8, 12, false],
};
const sourceDirs = { idle: 'player-idle', jump: 'player-jump', fall: 'player-fall', duck: 'player-duck', climb: 'player-climb', hurt: 'player-hurt', skip: 'player-skip' };
const cache = new Map();
async function frame(kind, index, state, position) {
  const dir = sourceDirs[kind]; const entries = await fs.readdir(path.join(source, dir));
  const files = entries.filter((name) => name.endsWith('.png')).sort();
  const file = path.join(source, dir, files[index % files.length]);
  const key = `${file}:${state}:${position}`;
  if (cache.has(key)) return cache.get(key);
  const x = state.includes('dash') ? Math.min(8, position * 2) : state === 'attack_2' ? position : state === 'attack_3' ? position * 2 : 0;
  const y = state === 'jump_start' ? Math.max(0, 6 - position * 3) : state.includes('slam') ? position * 2 : state === 'death' ? position * 2 : 0;
  const image = await sharp(file).resize(64, 55, { kernel: 'nearest', fit: 'fill' }).extend({ top: 9, bottom: 0, left: 0, right: 0, background: { r: 0, g: 0, b: 0, alpha: 0 } }).affine([[1, 0], [0, 1]], { background: { r: 0, g: 0, b: 0, alpha: 0 }, interpolator: 'nearest', idx: x, idy: -y }).png().toBuffer();
  cache.set(key, image); return image;
}
async function buildState(name, spec) {
  const [kind, count, fps, loop] = spec;
  let sheet = sharp({ create: { width: cell * count, height: cell, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
  const composites = [];
  for (let index = 0; index < count; index++) composites.push({ input: await frame(kind, index, name, index), left: index * cell, top: 0 });
  const data = await sheet.composite(composites).png().toBuffer();
  await fs.writeFile(path.join(output, `${name}.png`), data);
  await fs.writeFile(path.join(godotOutput, `${name}.png`), data);
  return { frameCount: count, fps, loop, sourceFrames: kind, derived: !['idle', 'jump', 'fall', 'hurt'].includes(name) };
}
function label(text, x, y) { return Buffer.from(`<svg width="220" height="22"><text x="${x}" y="${y}" fill="#ffffff" font-family="monospace" font-size="13">${text}</text></svg>`); }
async function sheets(meta) {
  const names = Object.keys(meta); const columns = 3, width = 768, rowHeight = 104;
  const composite = [{ input: { create: { width, height: Math.ceil(names.length / columns) * rowHeight, channels: 4, background: '#17202a' } }, left: 0, top: 0 }];
  for (let i=0;i<names.length;i++) { const name=names[i], col=i%columns,row=Math.floor(i/columns), x=col*256,y=row*rowHeight; composite.push({input:path.join(output,`${name}.png`),left:x,top:y+22}); composite.push({input:label(`${name} | ${meta[name].frameCount}f @ ${meta[name].fps}`,2,16),left:x,top:y}); }
  await sharp({create:{width,height:Math.ceil(names.length/columns)*rowHeight,channels:4,background:'#17202a'}}).composite(composite.slice(1)).png().toFile(path.join(output,'contact-sheet.png'));
  const identity = [];
  for (let i=0;i<names.length;i++) { const name=names[i], x=(i%5)*128,y=Math.floor(i/5)*96; identity.push({input:await sharp(path.join(output,`${name}.png`)).extract({left:0,top:0,width:64,height:64}).resize(96,96,{kernel:'nearest'}).png().toBuffer(),left:x,top:y}); identity.push({input:label(name,0,14),left:x,top:y}); }
  await sharp({create:{width:640,height:Math.ceil(names.length/5)*96,channels:4,background:'#17202a'}}).composite(identity).png().toFile(path.join(output,'state-identity-sheet.png'));
}
await fs.mkdir(output,{recursive:true}); await fs.mkdir(godotOutput,{recursive:true});
const metadata = {}; for (const [name,spec] of Object.entries(states)) metadata[name] = await buildState(name,spec);
await fs.writeFile(path.join(output,'player_v3_1_animations.json'),JSON.stringify(metadata,null,2));
await fs.writeFile(path.join(godotOutput,'player_v3_1_animations.json'),JSON.stringify(metadata,null,2));
await sheets(metadata);
console.log(JSON.stringify({states:Object.keys(metadata).length, output},null,2));
