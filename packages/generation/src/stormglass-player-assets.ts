import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const PACK_ID = 'stormglass-player-cape-v3';
const CLIPS = ['idle','walk','run','dash','air_dash','jump_start','jump','fall','land','attack','attack_2','attack_3','hurt','death'];
const parse = (buffer: Buffer) => JSON.parse(buffer.toString('utf8').replace(/^\uFEFF/, ''));

/** Byte-preserving admission of the reviewed cape candidate. This is deliberately
 * separate from provider output and does not imply full player or production approval. */
export function loadStormglassPlayerAssets(resourceRoot: string, existingMetadata?: Buffer) {
  const root = join(resourceRoot, 'test-packs', PACK_ID);
  const manifest = parse(readFileSync(join(root, 'manifest.json')));
  if (manifest.version !== 1 || manifest.id !== PACK_ID || manifest.productionReady !== false || !Array.isArray(manifest.assets)) {
    throw new Error('Invalid Stormglass player candidate manifest');
  }
  const textures = new Map<string, Buffer>();
  const assets: {sourcePath: string; destination: string; sha256: string}[] = [];
  const sizes = new Map<string, {width: number; height: number}>();
  for (const entry of manifest.assets) {
    if (typeof entry.source !== 'string' || !/^player_[a-z0-9_]+\.png$/.test(entry.source)
      || entry.destination !== `assets/characters/${entry.source}` || textures.has(entry.destination)) {
      throw new Error('Unsafe or duplicate Stormglass player asset path');
    }
    const sourcePath = join(root, entry.source);
    const bytes = readFileSync(sourcePath);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== entry.sha256) throw new Error(`Stormglass player hash mismatch: ${entry.source}`);
    if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
      || bytes.subarray(12, 16).toString('ascii') !== 'IHDR') throw new Error('Stormglass player asset is not PNG');
    sizes.set(entry.destination, {width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)});
    textures.set(entry.destination, bytes);
    assets.push({sourcePath, destination: entry.destination, sha256});
  }
  const animations = manifest.animations;
  if (!animations || Object.keys(animations).length !== CLIPS.length || !CLIPS.every(clip => animations[clip])) {
    throw new Error('Stormglass player candidate clip set is incomplete');
  }
  for (const clip of CLIPS) {
    const animation = animations[clip];
    const size = sizes.get(animation.sourceSheet);
    if (!size || !Array.isArray(animation.sourceRegions) || animation.sourceRegions.length !== animation.frameCount
      || !Number.isFinite(animation.fps) || animation.fps <= 0 || typeof animation.loop !== 'boolean'
      || !Number.isFinite(animation.displayScale) || animation.displayScale <= 0 || animation.displayScale > 2
      || !Number.isFinite(animation.footAnchorY)) throw new Error(`Invalid Stormglass player clip: ${clip}`);
    let previousRight = -1;
    const frameHeight = animation.sourceRegions[0]?.[3];
    for (const region of animation.sourceRegions) {
      if (!Array.isArray(region) || region.length !== 4 || !region.every(Number.isInteger)) throw new Error(`Invalid atlas region: ${clip}`);
      const [x,y,w,h] = region;
      if (x < 0 || y !== 0 || w <= 0 || h !== frameHeight || x < previousRight || x + w > size.width
        || y + h > size.height || animation.footAnchorY < 0 || animation.footAnchorY > h) throw new Error(`Overlapping or out-of-bounds atlas region: ${clip}`);
      previousRight = x + w;
    }
  }
  if (new Set(CLIPS.map(clip => animations[clip].sourceSheet)).size !== assets.length) throw new Error('Unused Stormglass player candidate asset');
  const prior = existingMetadata ? parse(existingMetadata) : {};
  if (!prior || typeof prior !== 'object' || Array.isArray(prior)) throw new Error('Invalid generated player animation metadata');
  textures.set('assets/characters/player_animations.json', Buffer.from(JSON.stringify({...prior, ...animations}, null, 2) + '\n'));
  return {id: PACK_ID, textures, assets, clips: [...CLIPS], productionReady: false as const};
}
