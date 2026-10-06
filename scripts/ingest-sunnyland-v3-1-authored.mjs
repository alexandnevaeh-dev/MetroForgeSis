import fs from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const incoming = join(root, 'assets/external/sunnyland_forest/authored_incoming');
const reference = join(root, 'assets/external/sunnyland_forest/authoring_reference');
const statusPath = join(reference, 'player_v3_1_art_status.json');
const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
const errors = [], warnings = [], info = [];
const received = [];
for (const entry of Object.values(status)) {
  if (entry.status !== 'PENDING') continue;
  const file = join(incoming, `${entry.state}.png`);
  if (!fs.existsSync(file)) { info.push(`pending artwork: ${entry.state}`); continue; }
  received.push(entry.state);
  const image = await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if (image.info.height !== 64 || image.info.width % 64) errors.push(`${entry.state}: strip must be 64px high with 64px cells`);
  const hashes = []; const bounds = [];
  for (let frame=0; frame<image.info.width/64; frame++) { let l=64,t=64,r=-1,b=-1, opaque=0, hash=2166136261; for(let y=0;y<64;y++)for(let x=0;x<64;x++){const i=(y*image.info.width+frame*64+x)*4;if(image.data[i+3]<16)continue;opaque++;l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);hash=Math.imul(hash^image.data[i]^image.data[i+1]^image.data[i+2]^image.data[i+3],16777619)>>>0} hashes.push(hash); bounds.push({l,t,r,b,opaque}); }
  if (new Set(hashes).size < 2 && hashes.length > 1) errors.push(`${entry.state}: duplicate animation frames`);
  if (bounds.some((item) => item.opaque < 20)) errors.push(`${entry.state}: empty frame`);
  const baseline = Math.max(...bounds.map((item)=>item.b))-Math.min(...bounds.map((item)=>item.b));
  if (!['jump_start','jump','fall','air_dash','double_jump','ground_slam_start','ground_slam_fall','swim','swim_idle','grapple','phase','death','respawn','ability_acquire'].includes(entry.state) && baseline > 1) warnings.push(`${entry.state}: grounded baseline variance ${baseline}px`);
  const heights = bounds.map((item)=>item.b-item.t+1); if (Math.max(...heights)-Math.min(...heights)>18) warnings.push(`${entry.state}: silhouette height variation needs review`);
  info.push(`candidate received: ${entry.state} (${image.info.width / 64} frames)`);
}
if (received.length) {
  const directRoot = join(root, 'assets/external/sunnyland_forest/normalized/player');
  const entries = [
    ...['idle', 'jump', 'fall', 'hurt'].map((state) => ({ state, file: join(directRoot, `${state}.png`) })),
    ...received.map((state) => ({ state, file: join(incoming, `${state}.png`) })),
  ].filter((entry) => fs.existsSync(entry.file));
  const tileWidth = 256, tileHeight = 100, columns = 3;
  const composites = [];
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    const x = (index % columns) * tileWidth, y = Math.floor(index / columns) * tileHeight;
    composites.push({ input: await sharp(entry.file).resize({ width: tileWidth, height: 64, fit: 'inside', kernel: 'nearest' }).png().toBuffer(), left: x, top: y + 24 });
  }
  const sheetHeight = Math.ceil(entries.length / columns) * tileHeight;
  await sharp({ create: { width: columns * tileWidth, height: sheetHeight, channels: 4, background: '#17202a' } }).composite(composites).png().toFile(join(incoming, 'incoming-contact-sheet.png'));
  const identity = [];
  for (let index = 0; index < entries.length; index++) {
    identity.push({ input: await sharp(entries[index].file).extract({ left: 0, top: 0, width: 64, height: 64 }).resize(96, 96, { kernel: 'nearest' }).png().toBuffer(), left: (index % 5) * 128, top: Math.floor(index / 5) * 96 });
  }
  await sharp({ create: { width: 640, height: Math.ceil(entries.length / 5) * 96, channels: 4, background: '#17202a' } }).composite(identity).png().toFile(join(incoming, 'incoming-identity-sheet.png'));
  const batchA = ['idle', 'walk', 'run', 'fall', 'land', 'jump_start', 'jump'].map((state) => entries.find((entry) => entry.state === state)).filter(Boolean);
  if (batchA.length) await sharp({ create: { width: batchA.length * 128, height: 96, channels: 4, background: '#17202a' } }).composite(await Promise.all(batchA.map(async (entry, index) => ({ input: await sharp(entry.file).extract({ left: 0, top: 0, width: 64, height: 64 }).resize(96, 96, { kernel: 'nearest' }).png().toBuffer(), left: index * 128 + 16, top: 0 })))).png().toFile(join(incoming, 'batch-a-review.png'));
  info.push(`review sheets generated for ${entries.length} accepted/direct or incoming strips`);
}
console.log(JSON.stringify({ERROR:errors, WARNING:warnings, INFO:info},null,2));
process.exitCode = errors.length ? 1 : 0;