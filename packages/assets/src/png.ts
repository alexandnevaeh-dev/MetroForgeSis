import { deflateSync, inflateSync } from 'node:zlib';

/** Minimal RGBA PNG encoder — no external dependencies */
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  if (rgba.length !== width * height * 4) {
    throw new Error(`RGBA buffer size mismatch: expected ${width * height * 4}, got ${rgba.length}`);
  }

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgba.subarray(y * stride, y * stride + stride)).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }

  const compressed = deflateSync(raw);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ].map((c, i) => (i === 0 ? Buffer.concat([pngSignature(), c]) : c)));
}

const pngSignature = () => Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

export interface SpriteSpec {
  id: string;
  width: number;
  height: number;
  fill: [number, number, number, number];
  accent?: [number, number, number, number];
  enemyArchetype?: EnemyArchetype;
  shape?:
    | 'humanoid'
    | 'enemy'
    | 'boss'
    | 'item'
    | 'tile'
    | 'checkpoint'
    | 'ability_pickup'
    | 'ability_gate'
    | 'chest_closed'
    | 'chest_open'
    | 'portal';
}

/** Deterministic small integer hash — picks archetype/variation from spec.id, not Math.random(). */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function inEllipseFrac(fx: number, fy: number, cx: number, cy: number, rx: number, ry: number): boolean {
  const dx = (fx - cx) / rx;
  const dy = (fy - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

function inRectFrac(fx: number, fy: number, x0: number, x1: number, y0: number, y1: number): boolean {
  return fx >= x0 && fx <= x1 && fy >= y0 && fy <= y1;
}

/** A rect whose half-width linearly interpolates from `halfW0` (at y0) to `halfW1` (at y1),
 *  centered on `cx` — the basic building block for tapered limbs/torsos/robes. */
function inTaperedRectFrac(
  fx: number,
  fy: number,
  y0: number,
  y1: number,
  halfW0: number,
  halfW1: number,
  cx = 0.5,
): boolean {
  if (fy < y0 || fy > y1) return false;
  const t = y1 > y0 ? (fy - y0) / (y1 - y0) : 0;
  const hw = halfW0 + (halfW1 - halfW0) * t;
  return Math.abs(fx - cx) <= hw;
}

type BodyPart =
  | 'head' | 'neck' | 'torso' | 'hip' | 'armL' | 'armR' | 'legL' | 'legR' | 'footL' | 'footR'
  | 'wing' | 'beastHead' | 'tail' | 'leg' | 'crest' | 'plate' | 'staff' | 'orb' | 'core' | 'armor' | 'weapon' | 'glow'
  | 'helmet' | 'pauldron' | 'cape' | 'belt' | 'gauntlet' | 'horn'
  | null;

/** Real layered anatomy — head/neck/torso/hips/arms/legs/feet — instead of two overlapping
 *  rectangles. Used for the player, NPCs, and the 'humanoid' enemy archetype. `robe` widens the
 *  torso taper toward the hips (caster silhouette) instead of narrowing it (regular clothing). */
function humanoidPart(fx: number, fy: number, robe = false): BodyPart {
  if (inTaperedRectFrac(fx, fy, 0.055, 0.14, 0.11, 0.16)) return 'helmet';
  if (inEllipseFrac(fx, fy, 0.5, 0.17, 0.135, 0.12)) return 'head';
  if (inRectFrac(fx, fy, 0.58, 0.64, 0.15, 0.19)) return 'helmet';
  if (inRectFrac(fx, fy, 0.44, 0.56, 0.24, 0.3)) return 'neck';
  if (inEllipseFrac(fx, fy, 0.29, 0.34, 0.12, 0.09)) return 'pauldron';
  if (inEllipseFrac(fx, fy, 0.71, 0.34, 0.12, 0.09)) return 'pauldron';
  if (robe ? inTaperedRectFrac(fx, fy, 0.29, 0.86, 0.19, 0.34) : inTaperedRectFrac(fx, fy, 0.29, 0.57, 0.2, 0.145))
    return 'torso';
  if (!robe && inRectFrac(fx, fy, 0.34, 0.66, 0.51, 0.57)) return 'belt';
  if (!robe && inTaperedRectFrac(fx, fy, 0.55, 0.66, 0.15, 0.17)) return 'hip';
  if (inTaperedRectFrac(fx, fy, 0.3, 0.6, 0.075, 0.055, 0.72)) return 'armR';
  if (inTaperedRectFrac(fx, fy, 0.3, 0.6, 0.075, 0.055, 0.28)) return 'armL';
  if (!robe) {
    if (inTaperedRectFrac(fx, fy, 0.64, 0.87, 0.07, 0.06, 0.595)) return 'legR';
    if (inTaperedRectFrac(fx, fy, 0.64, 0.87, 0.07, 0.06, 0.405)) return 'legL';
    if (inRectFrac(fx, fy, 0.51, 0.69, 0.87, 0.965)) return 'footR';
    if (inRectFrac(fx, fy, 0.31, 0.49, 0.87, 0.965)) return 'footL';
  } else if (fy > 0.86 && fy <= 0.97 && Math.abs(fx - 0.5) <= 0.2) {
    return 'footL';
  }
  return null;
}

/** Player-only silhouette: mycelial spore-scout — soft hood, spore-lantern staff, lichen cloak.
 *  Foundry courier gens use the authored kit still; this is the procedural fallback silhouette. */
function playerPart(fx: number, fy: number): BodyPart {
  if (inEllipseFrac(fx, fy, 0.50, 0.14, 0.17, 0.095)) return 'glow';
  if (inEllipseFrac(fx, fy, 0.80, 0.20, 0.05, 0.065)) return 'glow';
  if (inTaperedRectFrac(fx, fy, 0.20, 0.94, 0.02, 0.024, 0.80)) return 'weapon';
  if (inRectFrac(fx, fy, 0.70, 0.82, 0.54, 0.59)) return 'armR';
  if (inTaperedRectFrac(fx, fy, 0.28, 0.90, 0.09, 0.15, 0.20)) return 'cape';
  if (inEllipseFrac(fx, fy, 0.22, 0.42, 0.06, 0.05)) return 'gauntlet';
  return humanoidPart(fx, fy);
}

/** Clamp/ladle mite: slag-glass carapace, forward pincers, stubby foundry legs.
 *  Fills the sprite so it reads as scavenger hardware in-room, not two dark specks. */
function beastPart(fx: number, fy: number): BodyPart {
  if (inTaperedRectFrac(fx, fy, 0.38, 0.92, 0.16, 0.09, 0.90)) return 'weapon';
  if (inTaperedRectFrac(fx, fy, 0.34, 0.88, 0.16, 0.08, 0.10)) return 'weapon';
  if (inEllipseFrac(fx, fy, 0.80, 0.48, 0.22, 0.20)) return 'beastHead';
  if (inEllipseFrac(fx, fy, 0.48, 0.56, 0.46, 0.30)) return 'torso';
  if (inEllipseFrac(fx, fy, 0.50, 0.52, 0.20, 0.16)) return 'glow';
  if (inRectFrac(fx, fy, 0.02, 0.22, 0.42, 0.62)) return 'tail';
  for (const cx of [0.16, 0.36, 0.56, 0.76]) {
    if (inRectFrac(fx, fy, cx - 0.08, cx + 0.08, 0.74, 0.98)) return 'leg';
  }
  return null;
}

/** Central body plus two broad wing masses, positioned high in the frame (hovering). */
function flyingPart(fx: number, fy: number): BodyPart {
  if (inEllipseFrac(fx, fy, 0.5, 0.32, 0.09, 0.08)) return 'beastHead';
  if (inEllipseFrac(fx, fy, 0.5, 0.55, 0.14, 0.17)) return 'torso';
  if (inEllipseFrac(fx, fy, 0.21, 0.42, 0.24, 0.15)) return 'wing';
  if (inEllipseFrac(fx, fy, 0.79, 0.42, 0.24, 0.15)) return 'wing';
  return null;
}

/** Very low, flat, wide body hugging the ground with small leg nubs — a bug/spider read. */
function crawlerPart(fx: number, fy: number): BodyPart {
  if (inEllipseFrac(fx, fy, 0.82, 0.7, 0.1, 0.09)) return 'beastHead';
  if (inEllipseFrac(fx, fy, 0.48, 0.74, 0.4, 0.16)) return 'torso';
  for (const cx of [0.16, 0.34, 0.5, 0.66, 0.82]) {
    if (inRectFrac(fx, fy, cx - 0.035, cx + 0.035, 0.86, 0.97)) return 'leg';
  }
  return null;
}

/** Broad-shouldered humanoid with a chest plate — the "armored" archetype. */
function armoredPart(fx: number, fy: number): BodyPart {
  if (inTaperedRectFrac(fx, fy, 0.035, 0.15, 0.08, 0.17)) return 'helmet';
  if (inEllipseFrac(fx, fy, 0.5, 0.17, 0.14, 0.12)) return 'head';
  if (inRectFrac(fx, fy, 0.44, 0.56, 0.24, 0.29)) return 'neck';
  if (inTaperedRectFrac(fx, fy, 0.28, 0.6, 0.26, 0.19)) return 'torso';
  if (inRectFrac(fx, fy, 0.38, 0.62, 0.34, 0.5)) return 'plate';
  if (inTaperedRectFrac(fx, fy, 0.58, 0.68, 0.19, 0.21)) return 'hip';
  if (inTaperedRectFrac(fx, fy, 0.3, 0.58, 0.1, 0.07, 0.76)) return 'armR';
  if (inTaperedRectFrac(fx, fy, 0.3, 0.58, 0.1, 0.07, 0.24)) return 'armL';
  if (inRectFrac(fx, fy, 0.35, 0.48, 0.66, 0.92)) return 'legL';
  if (inRectFrac(fx, fy, 0.52, 0.65, 0.66, 0.92)) return 'legR';
  return null;
}

/** Robed humanoid with a staff — the "caster" archetype. Silhouette alone (robe, staff, orb)
 *  distinguishes it from a melee enemy even before color is considered. */
function casterPart(fx: number, fy: number): BodyPart {
  if (inRectFrac(fx, fy, 0.84, 0.9, 0.08, 0.82)) return 'staff';
  if (inEllipseFrac(fx, fy, 0.87, 0.09, 0.055, 0.055)) return 'orb';
  const body = humanoidPart(fx, fy, true);
  if (body) return body;
  return null;
}

const ENEMY_ARCHETYPES = ['beast', 'flying', 'crawler', 'armored', 'caster', 'humanoid'] as const;
export type EnemyArchetype = (typeof ENEMY_ARCHETYPES)[number];

const ENEMY_PRODUCTION_ORDER: EnemyArchetype[] = ['beast', 'flying', 'armored', 'caster', 'crawler', 'humanoid'];

/** The production vertical-slice masters intentionally lock the first 3 enemy slots to distinct,
 *  readable silhouette families instead of letting the hash drift across repeated same-family IDs.
 *  The full enemy pool still uses the same archetype library for later generated enemies. */
export function pickEnemyArchetype(id: string): EnemyArchetype {
  const match = /^enemy_(\d+)$/i.exec(id.trim());
  if (match) {
    const index = Number(match[1]);
    if (Number.isInteger(index)) return ENEMY_PRODUCTION_ORDER[index % ENEMY_PRODUCTION_ORDER.length] ?? 'humanoid';
  }
  return ENEMY_ARCHETYPES[hashString(id) % ENEMY_ARCHETYPES.length]!;
}

function enemyPart(fx: number, fy: number, archetype: EnemyArchetype): BodyPart {
  switch (archetype) {
    case 'beast':
      return beastPart(fx, fy);
    case 'flying':
      return flyingPart(fx, fy);
    case 'crawler':
      return crawlerPart(fx, fy);
    case 'armored':
      return armoredPart(fx, fy);
    case 'caster':
      return casterPart(fx, fy);
    case 'humanoid':
      return humanoidPart(fx, fy);
  }
}

/** Large core mass, a crest/head above it, shoulder armor blocks, a side weapon silhouette, and
 *  a chest glow accent — reads as "important and dangerous" rather than a scaled-up enemy. */
function bossPart(fx: number, fy: number): BodyPart {
  if (inTaperedRectFrac(fx, fy, 0.08, 0.24, 0.06, 0.16, 0.42)) return 'horn';
  if (inTaperedRectFrac(fx, fy, 0.08, 0.24, 0.06, 0.16, 0.58)) return 'horn';
  if (inTaperedRectFrac(fx, fy, 0.18, 0.42, 0.16, 0.28)) return 'crest';
  if (inTaperedRectFrac(fx, fy, 0.34, 0.84, 0.29, 0.24)) return 'core';
  if (inTaperedRectFrac(fx, fy, 0.34, 0.72, 0.16, 0.12, 0.18)) return 'armor';
  if (inTaperedRectFrac(fx, fy, 0.34, 0.72, 0.16, 0.12, 0.82)) return 'armor';
  if (inTaperedRectFrac(fx, fy, 0.68, 0.96, 0.14, 0.1, 0.32)) return 'legL';
  if (inTaperedRectFrac(fx, fy, 0.68, 0.96, 0.14, 0.1, 0.68)) return 'legR';
  if (inRectFrac(fx, fy, 0.84, 0.92, 0.2, 0.94)) return 'weapon';
  if (inTaperedRectFrac(fx, fy, 0.08, 0.24, 0.02, 0.1, 0.89)) return 'weapon';
  if (inEllipseFrac(fx, fy, 0.5, 0.5, 0.13, 0.13)) return 'glow';
  if (inRectFrac(fx, fy, 0.38, 0.62, 0.32, 0.48)) return 'plate';
  return null;
}

function interactivePart(
  fx: number,
  fy: number,
  shape: 'checkpoint' | 'ability_pickup' | 'ability_gate' | 'chest_closed' | 'chest_open' | 'portal',
): BodyPart {
  // A stone frame (two side pillars + a lintel) around an open energy field — reads as "a doorway
  // you can walk through" rather than a solid barrier, the opposite silhouette intent from
  // 'ability_gate' below (which fills its whole frame to read as blocked/solid).
  if (shape === 'portal') {
    if (inRectFrac(fx, fy, 0.14, 0.86, 0.04, 0.14)) return 'plate';
    if (inRectFrac(fx, fy, 0.14, 0.26, 0.08, 0.92) || inRectFrac(fx, fy, 0.74, 0.86, 0.08, 0.92)) return 'armor';
    if (inRectFrac(fx, fy, 0.28, 0.72, 0.16, 0.9)) return 'glow';
    return null;
  }
  if (shape === 'checkpoint') {
    if (inTaperedRectFrac(fx, fy, 0.22, 0.7, 0.2, 0.25)) return 'core';
    if (inTaperedRectFrac(fx, fy, 0.64, 0.92, 0.26, 0.38)) return 'armor';
    if (inEllipseFrac(fx, fy, 0.5, 0.4, 0.14, 0.18)) return 'glow';
    if (inRectFrac(fx, fy, 0.14, 0.86, 0.9, 0.97)) return 'plate';
    return null;
  }
  if (shape === 'ability_pickup') {
    const diamond = Math.abs(fx - 0.5) / 0.33 + Math.abs(fy - 0.5) / 0.4;
    if (diamond <= 1) return diamond < 0.48 ? 'glow' : 'core';
    if (inEllipseFrac(fx, fy, 0.5, 0.5, 0.47, 0.47) && !inEllipseFrac(fx, fy, 0.5, 0.5, 0.36, 0.36)) return 'orb';
    if (inEllipseFrac(fx, fy, 0.5, 0.5, 0.15, 0.15)) return 'plate';
    return null;
  }
  // A ground-anchored container, not a portrait/pillar like the shapes above — the body sits low
  // (fy 0.42-0.86) with the lid drawn either sealed against it (closed) or lifted clear above it
  // (open, plus a bright 'glow' sliver in the gap standing in for visible contents), so the two
  // states silhouette differently at a glance rather than only differing by a recolor.
  if (shape === 'chest_closed' || shape === 'chest_open') {
    if (shape === 'chest_closed') {
      if (inRectFrac(fx, fy, 0.16, 0.84, 0.32, 0.44)) return 'plate';
      if (inRectFrac(fx, fy, 0.44, 0.56, 0.38, 0.48)) return 'core';
    } else {
      if (inRectFrac(fx, fy, 0.22, 0.78, 0.14, 0.28)) return 'plate';
      if (inRectFrac(fx, fy, 0.26, 0.74, 0.32, 0.44)) return 'glow';
    }
    if (inRectFrac(fx, fy, 0.18, 0.82, 0.44, 0.86)) return 'armor';
    return null;
  }
  if (inRectFrac(fx, fy, 0.08, 0.22, 0.08, 0.94) || inRectFrac(fx, fy, 0.78, 0.92, 0.08, 0.94)) return 'armor';
  if (inRectFrac(fx, fy, 0.2, 0.8, 0.14, 0.24) || inRectFrac(fx, fy, 0.2, 0.8, 0.78, 0.88)) return 'plate';
  if (inRectFrac(fx, fy, 0.34, 0.66, 0.3, 0.7)) return 'core';
  const diagonal = Math.abs((fx - 0.5) + (fy - 0.5) * 0.65);
  if (diagonal < 0.085 && fy > 0.24 && fy < 0.78) return 'glow';
  return null;
}

const OUTLINE: [number, number, number, number] = [20, 27, 42, 255];
/** Warm mid-tone that reads as "skin" against most fill/accent palettes without hardcoding one
 *  specific ethnicity's tone — kept desaturated enough to sit under a helmet/hood/fur recolor. */
const SKIN_TONE: [number, number, number, number] = [214, 172, 138, 255];

function shade(color: [number, number, number, number], amount: number): [number, number, number, number] {
  return [
    Math.max(0, Math.min(255, color[0] + amount)),
    Math.max(0, Math.min(255, color[1] + amount)),
    Math.max(0, Math.min(255, color[2] + amount)),
    color[3],
  ];
}

function mix(
  a: [number, number, number, number],
  b: [number, number, number, number],
  t: number,
): [number, number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
    255,
  ];
}

const COURIER_VISOR: [number, number, number, number] = [52, 140, 152, 255];
const COURIER_COAT: [number, number, number, number] = [62, 48, 38, 255];
const COURIER_BRASS: [number, number, number, number] = [138, 104, 64, 255];
const COURIER_IRON: [number, number, number, number] = [52, 46, 42, 255];
const COURIER_EMBER: [number, number, number, number] = [204, 108, 52, 255];
const COURIER_STEEL: [number, number, number, number] = [118, 122, 128, 255];
const COURIER_BOOT: [number, number, number, number] = [30, 26, 24, 255];

/** Body-part → color for the humanoid/enemy/boss constructions. Centralized so every archetype
 *  shares one readable, consistent shading language (skin, clothing, shadowed lower body, a
 *  bright accent for "this part matters" — head crest, weapon, glow). */
function colorForPart(
  part: BodyPart,
  fill: [number, number, number, number],
  accent: [number, number, number, number],
  forPlayer = false,
): [number, number, number, number] {
  if (forPlayer) {
    switch (part) {
      case 'head':
        return SKIN_TONE;
      case 'neck':
        return shade(SKIN_TONE, -20);
      case 'helmet':
      case 'glow':
        return part === 'helmet' ? mix(COURIER_IRON, COURIER_VISOR, 0.55) : COURIER_VISOR;
      case 'torso':
        return COURIER_COAT;
      case 'pauldron':
      case 'gauntlet':
      case 'belt':
        return COURIER_BRASS;
      case 'cape':
        return shade(COURIER_COAT, -24);
      case 'armL':
      case 'armR':
        return shade(COURIER_COAT, 12);
      case 'hip':
      case 'legL':
      case 'legR':
      case 'leg':
        return COURIER_IRON;
      case 'footL':
      case 'footR':
        return COURIER_BOOT;
      case 'weapon':
        return COURIER_STEEL;
      default:
        return COURIER_EMBER;
    }
  }
  switch (part) {
    case 'head':
      return SKIN_TONE;
    case 'beastHead':
      return mix(fill, accent, 0.28);
    case 'neck':
      return shade(SKIN_TONE, -20);
    case 'torso':
    case 'wing':
      return fill;
    case 'hip':
    case 'belt':
    case 'plate':
    case 'armor':
      return shade(fill, -22);
    case 'helmet':
    case 'pauldron':
    case 'gauntlet':
      return mix(fill, accent, 0.42);
    case 'cape':
      return shade(fill, -42);
    case 'armL':
    case 'armR':
      return shade(fill, -10);
    case 'legL':
    case 'legR':
    case 'leg':
    case 'tail':
      return shade(fill, -34);
    case 'footL':
    case 'footR':
      return shade(fill, -50);
    case 'crest':
    case 'horn':
    case 'orb':
    case 'glow':
      return accent;
    case 'staff':
    case 'weapon':
      return shade(fill, -55);
    case 'core':
      return fill;
    default:
      return fill;
  }
}

export function generateProceduralSprite(spec: SpriteSpec): Buffer {
  const { width, height, fill, accent = fill } = spec;
  const rgba = new Uint8Array(width * height * 4);
  const archetype = spec.shape === 'enemy' ? (spec.enemyArchetype ?? pickEnemyArchetype(spec.id)) : undefined;

  const partAt = (x: number, y: number): BodyPart => {
    const fx = (x + 0.5) / width;
    const fy = (y + 0.5) / height;
    switch (spec.shape ?? 'humanoid') {
      case 'humanoid':
        return spec.id === 'player' ? playerPart(fx, fy) : humanoidPart(fx, fy);
      case 'enemy':
        return enemyPart(fx, fy, archetype!);
      case 'boss':
        return bossPart(fx, fy);
      case 'item':
        return inRectFrac(fx, fy, 0.3, 0.7, 0.3, 0.7) ? 'core' : null;
      case 'tile':
        return fy >= 0.6 ? 'core' : null;
      case 'checkpoint':
      case 'ability_pickup':
      case 'ability_gate':
      case 'chest_closed':
      case 'chest_open':
      case 'portal':
        return interactivePart(
          fx,
          fy,
          spec.shape as 'checkpoint' | 'ability_pickup' | 'ability_gate' | 'chest_closed' | 'chest_open' | 'portal',
        );
    }
  };
  const isInside = (x: number, y: number): boolean => partAt(x, y) !== null;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const part = partAt(x, y);

      if (part === null) {
        const outlined = spec.shape !== 'tile' && [
          isInside(x - 1, y), isInside(x + 1, y), isInside(x, y - 1), isInside(x, y + 1),
        ].some(Boolean);
        if (outlined) {
          rgba[i] = OUTLINE[0];
          rgba[i + 1] = OUTLINE[1];
          rgba[i + 2] = OUTLINE[2];
          rgba[i + 3] = OUTLINE[3];
          continue;
        }
        rgba[i] = 0;
        rgba[i + 1] = 0;
        rgba[i + 2] = 0;
        rgba[i + 3] = 0;
      } else {
        let c: [number, number, number, number];
        if (spec.shape === 'item' || spec.shape === 'tile') {
          c = fill;
        } else {
          c = colorForPart(part, fill, accent, spec.id === 'player');
        }
        // Directional highlight (top edge of each region) and a lower-edge shadow line — cheap,
        // consistent "form" cue that keeps flat archetypes from reading as solid stickers.
        const topEdge = !isInside(x, y - 1) || partAt(x, y - 1) !== part;
        const bottomEdge = !isInside(x, y + 1) || partAt(x, y + 1) !== part;
        if (part !== 'head' && part !== 'beastHead' && topEdge) {
          c = mix(c, [255, 255, 255, 255], 0.16);
        } else if (bottomEdge) {
          c = mix(c, [0, 0, 0, 255], 0.22);
        }
        const fx = (x + 0.5) / width;
        const fy = (y + 0.5) / height;
        if (part === 'torso' && fy > 0.34 && fy < 0.55 && Math.abs(fx - 0.5) < 0.025) {
          c = accent;
        }
        if (part === 'core' && spec.shape === 'boss' && Math.abs(fx - 0.5) > 0.19) {
          c = shade(fill, -30);
        }
        rgba[i] = c[0]!;
        rgba[i + 1] = c[1]!;
        rgba[i + 2] = c[2]!;
        rgba[i + 3] = c[3]!;
      }
    }
  }

  if ((spec.shape === 'humanoid' || spec.shape === 'boss' || (spec.shape === 'enemy' && archetype !== 'crawler')) && width >= 16 && height >= 16) {
    const eyeY = Math.max(1, Math.floor(height * (spec.shape === 'boss' ? 0.27 : 0.15)));
    const eyeSpan = spec.shape === 'boss' ? 0.09 : 0.045;
    for (const eyeX of [Math.floor(width * (0.5 - eyeSpan)), Math.floor(width * (0.5 + eyeSpan))]) {
      const i = (eyeY * width + eyeX) * 4;
      rgba[i] = 40;
      rgba[i + 1] = 44;
      rgba[i + 2] = 54;
      rgba[i + 3] = 255;
    }
  }

  return encodePng(width, height, rgba);
}

export interface VfxSpec {
  id: string;
  size: number;
  core: [number, number, number, number];
  edge: [number, number, number, number];
  style?: 'burst' | 'streak';
  effectType?: string;
  whereUsed?: string[];
  prompt?: string;
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function pixelRgb(rgba: Uint8Array, i: number): [number, number, number] {
  return [rgba[i]!, rgba[i + 1]!, rgba[i + 2]!];
}

/**
 * Knock out a solid chroma / photographic backdrop so compiled VFX sprites keep transparency.
 * FLUX.1 hosted preview cannot emit alpha; prompts request magenta or dark studio backdrops
 * which this pass converts to alpha before PixelArtProcessor.
 */
export function knockoutVfxBackground(png: Buffer, chroma: [number, number, number] = [255, 0, 255]): Buffer {
  const { rgba, width, height } = decodePngRgba(png);
  const out = new Uint8Array(rgba);
  const chromaTol = 48;
  const floodTol = 28;
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];

  for (let i = 0; i < out.length; i += 4) {
    if (colorDistance(pixelRgb(out, i), chroma) <= chromaTol) {
      out[i + 3] = 0;
    }
  }

  const pushIfBackdrop = (x: number, y: number, origin: [number, number, number]) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (visited[idx]) return;
    const i = idx * 4;
    if ((out[i + 3] ?? 0) === 0) {
      visited[idx] = 1;
      return;
    }
    if (colorDistance(pixelRgb(out, i), origin) > floodTol) return;
    visited[idx] = 1;
    out[i + 3] = 0;
    queue.push(idx);
  };

  const seeds: Array<[number, number]> = [];
  for (let x = 0; x < width; x++) {
    seeds.push([x, 0], [x, height - 1]);
  }
  for (let y = 1; y < height - 1; y++) {
    seeds.push([0, y], [width - 1, y]);
  }
  for (const [cx, cy] of seeds) {
    const i = (cy * width + cx) * 4;
    if ((out[i + 3] ?? 0) === 0) continue;
    const origin = pixelRgb(out, i);
    const luma = 0.2126 * origin[0] + 0.7152 * origin[1] + 0.0722 * origin[2];
    // Only flood typical studio backdrops (dark, magenta-ish, or pale gray) — never
    // a saturated effect that happens to touch a corner.
    const magentaish = colorDistance(origin, chroma) < 90;
    const sat = Math.max(origin[0], origin[1], origin[2]) - Math.min(origin[0], origin[1], origin[2]);
    const grayish = sat < 36;
    // NVIDIA hosted preview paints a low-sat studio rectangle (mid gray or pale)
    // that is neither magenta nor near-black. Flood those too so walk/idle sheets
    // do not compile as an opaque punch box. Corners on already-compiled sheets are
    // often punched already — scanning the whole border still reaches leftover gray.
    const studio = luma < 28 || luma > 200 || magentaish || grayish;
    if (!studio) continue;
    queue.length = 0;
    pushIfBackdrop(cx, cy, origin);
    while (queue.length > 0) {
      const idx = queue.pop()!;
      const x = idx % width;
      const y = Math.floor(idx / width);
      pushIfBackdrop(x + 1, y, origin);
      pushIfBackdrop(x - 1, y, origin);
      pushIfBackdrop(x, y + 1, origin);
      pushIfBackdrop(x, y - 1, origin);
    }
  }

  // Grow punched alpha into leftover studio gray / magenta that already touches
  // transparency. NVIDIA stills leave a mid-gray punch box or a pocket between
  // legs that is not 4-connected to the image border, so border flood misses it.
  growKnockableFromAlpha(out, width, height);

  punchRegistrationTicks(out, width, height);
  punchDetachedSpecks(out, width, height);
  punchGroundBloom(out, width, height);
  // Studio gray under the feet is often a sealed island (boots on three sides).
  // Punch knockable backdrop in the contact band so it cannot composite as RGB 60,64,78.
  punchBottomStudioBand(out, width, height);
  growKnockableFromAlpha(out, width, height);
  fillInteriorHoles(out, width, height);

  return encodePng(width, height, out);
}

function growKnockableFromAlpha(out: Uint8Array, width: number, height: number): void {
  const grow: number[] = [];
  for (let i = 0; i < width * height; i++) {
    if ((out[i * 4 + 3] ?? 0) < 16) grow.push(i);
  }
  while (grow.length > 0) {
    const idx = grow.pop()!;
    const x = idx % width;
    const y = Math.floor(idx / width);
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ] as Array<[number, number]>) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      const pi = ni * 4;
      if ((out[pi + 3] ?? 0) < 16) continue;
      if (!isKnockableBackdrop(pixelRgb(out, pi))) continue;
      out[pi + 3] = 0;
      grow.push(ni);
    }
  }
}

function isKnockableBackdrop(rgb: [number, number, number]): boolean {
  const luma = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  const sat = Math.max(rgb[0], rgb[1], rgb[2]) - Math.min(rgb[0], rgb[1], rgb[2]);
  // Mid-gray studio plates only. Saturated magenta/purple is often the weapon glow.
  return sat < 40 && luma >= 44 && luma <= 140;
}

function punchRegistrationTicks(out: Uint8Array, width: number, height: number): void {
  // Hosted sprite sheets stamp a 2px red/white/magenta registration tick in the
  // bottom-right of each frame. Red/magenta ticks fuse into the feet even when
  // they are not yet 4-connected to transparency — punch those in the bottom
  // band. White ticks only punch when they already touch alpha so a pale
  // sleeve is not eaten. Match the bloom contact band so ticks above the last
  // 8px still cannot composite as palette red/cream at runtime.
  const y0 = Math.max(0, height - Math.max(8, Math.floor(height * 0.35)));
  for (let y = y0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if ((out[i + 3] ?? 0) === 0) continue;
      const r = out[i]!;
      const g = out[i + 1]!;
      const b = out[i + 2]!;
      const redTick = r > 190 && g <= 90 && b < 90;
      const whiteTick = r > 210 && g > 210 && b > 210;
      const magentaTick = r > 180 && b > 140 && g < 120;
      if (!redTick && !whiteTick && !magentaTick) continue;
      if (redTick || magentaTick) {
        out[i + 3] = 0;
        continue;
      }
      const neighbors = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ];
      const nearClear = neighbors.some(([nx, ny]) => {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) return true;
        return (out[(ny * width + nx) * 4 + 3] ?? 0) < 16;
      });
      if (nearClear) out[i + 3] = 0;
    }
  }
}

function punchDetachedSpecks(out: Uint8Array, width: number, height: number): void {
  // Leftover ticks and chroma specks sit as tiny opaque islands after the studio
  // plate is gone. Keep the largest silhouette; punch components that are clearly
  // trash (a few pixels in the corner, not a second character).
  const n = width * height;
  const seen = new Uint8Array(n);
  const components: number[][] = [];
  for (let i = 0; i < n; i++) {
    if (seen[i] || (out[i * 4 + 3] ?? 0) < 16) continue;
    const stack = [i];
    seen[i] = 1;
    const cells: number[] = [];
    while (stack.length > 0) {
      const idx = stack.pop()!;
      cells.push(idx);
      const x = idx % width;
      const y = Math.floor(idx / width);
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ] as Array<[number, number]>) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = ny * width + nx;
        if (seen[ni] || (out[ni * 4 + 3] ?? 0) < 16) continue;
        seen[ni] = 1;
        stack.push(ni);
      }
    }
    components.push(cells);
  }
  if (components.length < 2) return;
  components.sort((a, b) => b.length - a.length);
  const main = components[0]!.length;
  const trashLimit = Math.max(24, Math.floor(main * 0.02));
  for (let c = 1; c < components.length; c++) {
    const cells = components[c]!;
    if (cells.length > trashLimit) continue;
    for (const idx of cells) out[idx * 4 + 3] = 0;
  }
}

function isGroundBloom(r: number, g: number, b: number): boolean {
  const purple = r > 140 && b > 150 && g < 130;
  const pale = r > 210 && g > 200 && b > 180;
  const paletteRed = Math.hypot(r - 200, g - 80, b - 80) <= 28;
  const paletteCream = Math.hypot(r - 240, g - 240, b - 250) <= 28;
  const redTick = r > 160 && g < 120 && b < 140;
  return purple || pale || paletteRed || paletteCream || redTick;
}

function punchGroundBloom(out: Uint8Array, width: number, height: number): void {
  // NVIDIA stills paint a magenta contact oval and a white registration stitch
  // under the feet. Palette red/cream also survive skipQuantize and show up as
  // a cluster under the player even when the still has zero exact 60,64,78.
  const y0 = Math.max(0, height - Math.max(8, Math.floor(height * 0.35)));
  for (let y = y0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if ((out[i + 3] ?? 0) < 16) continue;
      if (!isGroundBloom(out[i]!, out[i + 1]!, out[i + 2]!)) continue;
      out[i + 3] = 0;
    }
  }
}

function punchBottomStudioBand(out: Uint8Array, width: number, height: number): void {
  const band = Math.max(2, Math.min(4, Math.floor(height / 16) || 2));
  const y0 = Math.max(0, height - band);
  for (let y = y0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if ((out[i + 3] ?? 0) < 16) continue;
      if (!isKnockableBackdrop(pixelRgb(out, i))) continue;
      out[i + 3] = 0;
    }
  }
}

function fillInteriorHoles(out: Uint8Array, width: number, height: number): void {
  const n = width * height;
  const exterior = new Uint8Array(n);
  const stack: number[] = [];
  const seed = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (exterior[idx]) return;
    if ((out[idx * 4 + 3] ?? 0) >= 16) return;
    exterior[idx] = 1;
    stack.push(idx);
  };
  for (let x = 0; x < width; x++) {
    seed(x, 0);
    seed(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    seed(0, y);
    seed(width - 1, y);
  }
  while (stack.length > 0) {
    const idx = stack.pop()!;
    const x = idx % width;
    const y = Math.floor(idx / width);
    seed(x + 1, y);
    seed(x - 1, y);
    seed(x, y + 1);
    seed(x, y - 1);
  }

  let opaque = 0;
  for (let i = 0; i < n; i++) {
    if ((out[i * 4 + 3] ?? 0) >= 16) opaque++;
  }
  const holeLimit = Math.max(24, Math.floor(opaque * 0.02));
  const seen = new Uint8Array(n);
  const offsets: Array<[number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  for (let start = 0; start < n; start++) {
    if (seen[start] || exterior[start]) continue;
    if ((out[start * 4 + 3] ?? 0) >= 16) continue;
    const cells: number[] = [];
    const open = [start];
    seen[start] = 1;
    while (open.length > 0) {
      const idx = open.pop()!;
      cells.push(idx);
      const x = idx % width;
      const y = Math.floor(idx / width);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as Array<[number, number]>) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = ny * width + nx;
        if (seen[ni] || exterior[ni]) continue;
        if ((out[ni * 4 + 3] ?? 0) >= 16) continue;
        seen[ni] = 1;
        open.push(ni);
      }
    }
    if (cells.length > holeLimit) continue;
    for (const idx of cells) {
      const x = idx % width;
      const y = Math.floor(idx / width);
      const i = idx * 4;
      let found = false;
      for (let r = 1; r <= 4 && !found; r++) {
        for (const [dx, dy] of offsets) {
          const nx = x + dx * r;
          const ny = y + dy * r;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = (ny * width + nx) * 4;
          if ((out[ni + 3] ?? 0) < 16) continue;
          out[i] = out[ni]!;
          out[i + 1] = out[ni + 1]!;
          out[i + 2] = out[ni + 2]!;
          out[i + 3] = out[ni + 3]!;
          found = true;
          break;
        }
      }
    }
  }
}

/** Small radial or streak VFX sprites for hit/dash/pickup/death feedback. */
export function generateVfxTexture(spec: VfxSpec): Buffer {
  const { size, core, edge, style = 'burst' } = spec;
  const rgba = new Uint8Array(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let alpha = 0.0;
      if (style === 'streak') {
        const dx = (x - cx + 0.5) / (size * 0.45);
        const dy = (y - cy + 0.5) / (size * 0.22);
        const d = Math.hypot(dx, dy);
        if (d <= 1) alpha = Math.pow(1 - d, 1.2);
      } else {
        const d = Math.hypot(x - cx + 0.5, y - cy + 0.5) / (size * 0.5);
        if (d <= 1) alpha = Math.pow(1 - d, 1.5);
      }

      if (alpha <= 0) {
        rgba[i] = 0;
        rgba[i + 1] = 0;
        rgba[i + 2] = 0;
        rgba[i + 3] = 0;
        continue;
      }

      const t = 1 - alpha;
      rgba[i] = Math.round(core[0]! * alpha + edge[0]! * t);
      rgba[i + 1] = Math.round(core[1]! * alpha + edge[1]! * t);
      rgba[i + 2] = Math.round(core[2]! * alpha + edge[2]! * t);
      rgba[i + 3] = Math.round(255 * alpha * (core[3]! / 255));
    }
  }

  return encodePng(size, size, rgba);
}

interface ArticulationPose {
  phase: number;
  stridePx: number;
  footLiftPx: number;
  torsoLeanPx: number;
  armSwingPx: number;
  /** Lateral hip counter-rotation (opposite legs), px at hip band. */
  hipSwayPx: number;
  compress: number;
  extend: number;
  attackReachPx: number;
}

type ArticulationPart = 'head' | 'torso' | 'leftLeg' | 'rightLeg' | 'leftArm' | 'rightArm';

const ARTICULATION_HIP_Y = 0.56;
const ARTICULATION_NECK_Y = 0.30;
const ARTICULATION_MID_X = 0.5;

/** Exclusive body-part masks so left/right limbs never sample each other (ghost legs). */
function articulationPartAt(fx: number, fy: number): ArticulationPart {
  if (fy < ARTICULATION_NECK_Y) return 'head';
  if (fy >= ARTICULATION_HIP_Y) return fx < ARTICULATION_MID_X ? 'leftLeg' : 'rightLeg';
  if (fx < 0.36) return 'leftArm';
  if (fx > 0.64) return 'rightArm';
  return 'torso';
}

/** Use the authored procedural rig only for its exact source image. Imported art keeps
 * the generic segmentation; a filename alone must never impose this character's anatomy. */
function proceduralPlayerRig(spec: SpriteSpec, sourcePng?: Buffer): ((fx: number, fy: number) => ArticulationPart) | undefined {
  if (spec.id !== 'player' || (spec.shape && spec.shape !== 'humanoid')) return undefined;
  if (sourcePng && !sourcePng.equals(generateProceduralSprite(spec))) return undefined;
  return (fx, fy) => {
    let body = playerPart(fx, fy);
    // Outline pixels belong to their nearest painted part, rather than a horizontal band.
    if (!body) {
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        body = playerPart(fx + ox / spec.width, fy + oy / spec.height);
        if (body) break;
      }
    }
    switch (body) {
      case 'legL': case 'footL': return 'leftLeg';
      case 'legR': case 'footR': return 'rightLeg';
      case 'armL': case 'gauntlet': return 'leftArm';
      case 'armR': case 'weapon': return 'rightArm';
      case 'cape': case 'belt': case 'hip': return 'torso';
      case 'glow': return fx > 0.75 ? 'rightArm' : 'head';
      default: return fy < ARTICULATION_NECK_Y ? 'head' : 'torso';
    }
  };
}

/**
 * Forward warp: source pixel → destination. Parts are transformed independently and composited
 * with occlusion so a swinging leg cannot pull the opposite leg's pixels into the same column
 * (the classic inverse-warp multi-leg smear).
 */
function destForArticulatedPart(
  sx: number,
  sy: number,
  width: number,
  height: number,
  pose: ArticulationPose,
  part: ArticulationPart,
): { dx: number; dy: number } {
  const fx = (sx + 0.5) / width;
  const fy = (sy + 0.5) / height;
  const hipY = ARTICULATION_HIP_Y;
  const neckY = ARTICULATION_NECK_Y;
  let dx = sx;
  let dy = sy;

  if (pose.compress > 0 && fy > neckY) {
    const fold = part === 'leftLeg' || part === 'rightLeg' ? pose.compress * 0.42 : pose.compress * 0.14;
    dy = neckY * height + (sy - neckY * height) / (1 + fold);
  }
  if (pose.extend > 0 && fy > neckY) {
    dy = neckY * height + (sy - neckY * height) * (1 + pose.extend * 0.22);
  }

  if (pose.hipSwayPx !== 0 && fy > neckY) {
    const hipWeight = fy >= hipY ? 1.0 : Math.max(0, (fy - neckY) / (hipY - neckY));
    dx += pose.hipSwayPx * Math.sin(pose.phase) * hipWeight;
  }

  if (part === 'torso' || part === 'head' || part === 'leftArm' || part === 'rightArm') {
    const fromHip = Math.max(0, hipY - fy);
    dx += pose.torsoLeanPx * fromHip * 2.2;
    if (part === 'head') {
      dx -= pose.torsoLeanPx * (neckY - fy) * 1.6;
    }
  }

  if (part === 'leftLeg' || part === 'rightLeg') {
    const isLeft = part === 'leftLeg';
    const legPhase = pose.phase + (isLeft ? 0 : Math.PI);
    const swing = Math.sin(legPhase);
    dx += Math.cos(legPhase) * pose.stridePx;
    if (swing > 0) {
      dy -= swing * pose.footLiftPx;
    } else {
      dy -= Math.abs(swing) * pose.compress * height * 0.04;
    }
  } else if (part === 'leftArm' || part === 'rightArm') {
    const isLeft = part === 'leftArm';
    const armPhase = pose.phase + (isLeft ? Math.PI : 0);
    const armSwing = Math.sin(armPhase);
    dx += armSwing * pose.armSwingPx;
    dy -= ((1 - Math.cos(armPhase)) * 0.5) * pose.armSwingPx * 0.28;
    dy -= Math.max(0, -armSwing) * pose.armSwingPx * 0.12;
  }

  if (pose.attackReachPx !== 0 && (part === 'torso' || part === 'rightArm') && fx > 0.52) {
    dx += pose.attackReachPx;
    dy -= Math.round(pose.attackReachPx * 0.15);
  }

  return { dx, dy };
}

function blitPartOntoFrame(
  src: Uint8Array,
  dest: Uint8Array,
  width: number,
  height: number,
  pose: ArticulationPose,
  part: ArticulationPart,
  partAt: (fx: number, fy: number) => ArticulationPart = articulationPartAt,
  fit?: { scale: number; x: number; y: number },
): void {
  for (let sy = 0; sy < height; sy++) {
    for (let sx = 0; sx < width; sx++) {
      const fx = (sx + 0.5) / width;
      const fy = (sy + 0.5) / height;
      if (partAt(fx, fy) !== part) continue;
      const si = (sy * width + sx) * 4;
      const a = src[si + 3]!;
      if (a < 8) continue;
      const { dx, dy } = destForArticulatedPart(sx, sy, width, height, pose, part);
      const x = Math.round(fit ? dx * fit.scale + fit.x : dx);
      const y = Math.round(fit ? dy * fit.scale + fit.y : dy);
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const di = (y * width + x) * 4;
      // Opaque overwrite — never blend limbs (blending is what stacked ghost legs looked like).
      dest[di] = src[si]!;
      dest[di + 1] = src[si + 1]!;
      dest[di + 2] = src[si + 2]!;
      dest[di + 3] = a;
    }
  }
}

/**
 * Segmented forward composite: each limb is warped from its own exclusive mask, then drawn in
 * occlusion order (planted leg behind swinging leg). Inverse nearest-neighbor alone still
 * sampled across the midline and stacked both legs into mid-stride frames.
 */
function blitArticulatedSheet(
  rgba: Uint8Array,
  width: number,
  height: number,
  frameCount: number,
  poseAt: (frame: number) => ArticulationPose,
  partAt?: (fx: number, fy: number) => ArticulationPart,
): Buffer {
  const sheet = new Uint8Array(width * frameCount * height * 4);
  const frame = new Uint8Array(width * height * 4);
  let fit: { scale: number; x: number; y: number } | undefined;
  if (partAt && frameCount > 0) {
    // One fit for the entire known rig, calculated before clipping. This preserves the
    // staff and every limb without per-frame scale jitter or moving the feet's anchor.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let f = 0; f < frameCount; f++) {
      const pose = poseAt(f);
      for (let sy = 0; sy < height; sy++) for (let sx = 0; sx < width; sx++) {
        if (rgba[(sy * width + sx) * 4 + 3]! < 8) continue;
        const part = partAt((sx + 0.5) / width, (sy + 0.5) / height);
        const { dx, dy } = destForArticulatedPart(sx, sy, width, height, pose, part);
        minX = Math.min(minX, dx); maxX = Math.max(maxX, dx);
        minY = Math.min(minY, dy); maxY = Math.max(maxY, dy);
      }
    }
    if (Number.isFinite(minX)) {
      const margin = Math.max(1, Math.round(Math.min(width, height) * 0.03));
      const scale = Math.min(1, (width - 1 - margin * 2) / Math.max(1, maxX - minX),
        (height - 1 - margin * 2) / Math.max(1, maxY - minY));
      fit = { scale, x: (width - 1 - (maxX + minX) * scale) / 2,
        y: height - 1 - margin - maxY * scale };
    }
  }
  for (let f = 0; f < frameCount; f++) {
    const pose = poseAt(f);
    frame.fill(0);
    const leftSwing = Math.sin(pose.phase);
    // Planted leg first, swinging leg on top — single silhouette, no stacked ghost limbs.
    const order: ArticulationPart[] =
      leftSwing > 0
        ? ['rightLeg', 'leftLeg', 'torso', 'head', 'leftArm', 'rightArm']
        : ['leftLeg', 'rightLeg', 'torso', 'head', 'leftArm', 'rightArm'];
    for (const part of order) {
      blitPartOntoFrame(rgba, frame, width, height, pose, part, partAt, fit);
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const si = (y * width + x) * 4;
        const di = (y * width * frameCount + f * width + x) * 4;
        sheet[di] = frame[si]!;
        sheet[di + 1] = frame[si + 1]!;
        sheet[di + 2] = frame[si + 2]!;
        sheet[di + 3] = frame[si + 3]!;
      }
    }
  }
  return encodePng(width * frameCount, height, sheet);
}

/**
 * Count opaque connected components in the lower body band (legs). Bipedal walk/run frames
 * should have at most two significant leg blobs — three+ indicates multi-leg ghost smear.
 */
export function countLowerBodyBlobs(
  frameRgba: Uint8Array,
  frameWidth: number,
  frameHeight: number,
  opts?: { alphaThreshold?: number; minBlobPixels?: number; lowerBandStart?: number },
): number {
  const alphaThreshold = opts?.alphaThreshold ?? 24;
  const minBlobPixels = opts?.minBlobPixels ?? Math.max(3, Math.floor(frameWidth * frameHeight * 0.004));
  const y0 = Math.floor(frameHeight * (opts?.lowerBandStart ?? 0.52));
  const visited = new Uint8Array(frameWidth * frameHeight);
  const idx = (x: number, y: number) => y * frameWidth + x;
  let blobs = 0;
  for (let y = y0; y < frameHeight; y++) {
    for (let x = 0; x < frameWidth; x++) {
      const i = idx(x, y);
      if (visited[i]) continue;
      if (frameRgba[i * 4 + 3]! < alphaThreshold) {
        visited[i] = 1;
        continue;
      }
      let area = 0;
      const stack: number[] = [i];
      visited[i] = 1;
      while (stack.length) {
        const cur = stack.pop()!;
        area += 1;
        const cx = cur % frameWidth;
        const cy = (cur / frameWidth) | 0;
        for (const [nx, ny] of [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ] as const) {
          if (nx < 0 || ny < y0 || nx >= frameWidth || ny >= frameHeight) continue;
          const ni = idx(nx, ny);
          if (visited[ni]) continue;
          visited[ni] = 1;
          if (frameRgba[ni * 4 + 3]! >= alphaThreshold) stack.push(ni);
        }
      }
      if (area >= minBlobPixels) blobs += 1;
    }
  }
  return blobs;
}

/** True when any frame's lower body has more than two significant opaque blobs (ghost legs). */
export function hasMultiLegSmear(
  sheetRgba: Uint8Array,
  frameWidth: number,
  frameHeight: number,
  frameCount: number,
): boolean {
  for (let f = 0; f < frameCount; f++) {
    const frame = new Uint8Array(frameWidth * frameHeight * 4);
    for (let y = 0; y < frameHeight; y++) {
      const srcRowStart = (y * frameWidth * frameCount + f * frameWidth) * 4;
      frame.set(sheetRgba.subarray(srcRowStart, srcRowStart + frameWidth * 4), y * frameWidth * 4);
    }
    if (countLowerBodyBlobs(frame, frameWidth, frameHeight) > 2) return true;
  }
  return false;
}

/** Horizontal walk-cycle spritesheet (frameCount frames) */
export function generateWalkCycleSheet(spec: SpriteSpec, frameCount = 4, sourcePng?: Buffer): Buffer {
  const { rgba, width, height } = sourcePng
    ? decodePngRgba(sourcePng)
    : decodePngRgba(generateProceduralSprite(spec));
  const stride = Math.max(4, Math.round(width * 0.16));
  const lift = Math.max(3, Math.round(height * 0.09));
  const rig = proceduralPlayerRig(spec, sourcePng);
  const arms = Math.max(1, Math.round(width * (rig ? 0.05 : 0.14)));
  const hip = Math.max(1, Math.round(width * (rig ? 0.02 : 0.05)));
  return blitArticulatedSheet(rgba, width, height, frameCount, (f) => {
    // Ease contact phases slightly so planted frames linger (weightier, less strobing).
    const u = frameCount > 1 ? f / frameCount : 0;
    const eased = u + 0.04 * Math.sin(4 * Math.PI * u);
    const phase = 2 * Math.PI * eased;
    return {
      phase,
      stridePx: stride,
      footLiftPx: lift,
      torsoLeanPx: Math.sin(phase) * 2.2,
      armSwingPx: arms,
      hipSwayPx: hip,
      compress: 0.14 * (0.5 + 0.5 * Math.sin(phase * 2)),
      extend: 0,
      attackReachPx: 0,
    };
  }, rig);
}

/**
 * Horizontal run-cycle spritesheet — longer stride, stronger opposing arms, constant
 * forward lean. Never a relabeled walk: amplitude and lean differ on every frame.
 */
export function generateRunCycleSheet(spec: SpriteSpec, frameCount = 12, sourcePng?: Buffer): Buffer {
  const { rgba, width, height } = sourcePng
    ? decodePngRgba(sourcePng)
    : decodePngRgba(generateProceduralSprite(spec));
  const rig = proceduralPlayerRig(spec, sourcePng);
  const stride = Math.max(5, Math.round(width * (rig ? 0.20 : 0.26)));
  const lift = Math.max(4, Math.round(height * 0.13));
  // Held equipment needs its own clearance; it must not leave the frame at mid-stride.
  const arms = Math.max(1, Math.round(width * (rig ? 0.05 : 0.18)));
  const lean = Math.max(3, Math.round(width * 0.09));
  const hip = Math.max(1, Math.round(width * (rig ? 0.02 : 0.07)));
  return blitArticulatedSheet(rgba, width, height, frameCount, (f) => {
    const u = frameCount > 1 ? f / frameCount : 0;
    const eased = u + 0.03 * Math.sin(4 * Math.PI * u);
    const phase = 2 * Math.PI * eased;
    return {
      phase,
      stridePx: stride,
      footLiftPx: lift,
      torsoLeanPx: lean + Math.sin(phase) * 1.8,
      armSwingPx: arms,
      hipSwayPx: hip,
      compress: 0.18 * (0.5 + 0.5 * Math.sin(phase * 2)),
      extend: 0,
      attackReachPx: 0,
    };
  }, rig);
}

/**
 * Frame-quality metrics for a horizontal frame-strip spritesheet (production standard §20).
 * Operates on decoded RGBA, not the encoded PNG, so callers can reuse a single decode.
 * - uniqueFrameRatio: fraction of frames that are not byte-identical to an earlier frame.
 * - duplicateFrameRatio: 1 - uniqueFrameRatio.
 * - meanSilhouetteDelta: average fraction of alpha-coverage pixels that differ (opaque vs
 *   transparent) between consecutive frames — near-zero means frames aren't actually moving.
 * - contentBoundsDrift: max deviation, across frames, of the opaque bounding-box center from the
 *   sheet-wide average center, normalized by frame width — a cheap proxy for pivot/anchor drift
 *   when no explicit pivot metadata exists (this codebase doesn't author one per frame).
 */
export interface FrameQualityMetrics {
  frameCount: number;
  uniqueFrameRatio: number;
  duplicateFrameRatio: number;
  meanSilhouetteDelta: number;
  contentBoundsDrift: number;
  /** Mean fraction of RGB channel bytes (opaque pixels only) that differ by more than a small
   *  threshold between consecutive frames — near-zero means the animation isn't visibly moving,
   *  very high means adjacent frames barely resemble each other (chaotic/exploding motion). */
  meanPixelDelta: number;
  /** 1 - (stddev of each frame's opaque bounding-box area / mean area), clamped to [0,1].
   *  Low values mean the silhouette's on-screen size balloons or collapses between frames
   *  instead of the character staying a consistent size throughout the clip. */
  frameDimensionConsistency: number;
  /** 1 - (fraction of frames whose opaque content touches a canvas edge). A crop/shear/scale
   *  transform pushed too far clips the silhouette against the frame boundary; this catches it. */
  alphaBoundsConsistency: number;
  /** Variance (0..1 range, not clamped) of each frame's opaque-pixel coverage as a fraction of
   *  frame area — flags frames whose apparent size swings unrealistically frame to frame. */
  contentScaleVariance: number;
  /** True when meanPixelDelta and contentScaleVariance both exceed a "this doesn't read as a
   *  coherent character animation anymore" threshold — an upper-bound sanity check against
   *  chaotic/exploding motion, not just the lower-bound "did anything move at all" checks above. */
  chaoticMotion: boolean;
  /** True when any frame's lower body has >2 significant opaque blobs (stacked ghost legs). */
  multiLegSmear: boolean;
  /** Max lower-body blob count across frames (bipedal walk/run should stay ≤2). */
  maxLowerBodyBlobs: number;
}

export function computeFrameQualityMetrics(sheetRgba: Uint8Array, frameWidth: number, frameHeight: number, frameCount: number): FrameQualityMetrics {
  if (frameCount <= 0) {
    return {
      frameCount: 0, uniqueFrameRatio: 0, duplicateFrameRatio: 1, meanSilhouetteDelta: 0, contentBoundsDrift: 0,
      meanPixelDelta: 0, frameDimensionConsistency: 1, alphaBoundsConsistency: 1, contentScaleVariance: 0, chaoticMotion: false,
      multiLegSmear: false, maxLowerBodyBlobs: 0,
    };
  }
  const frameBytes = frameWidth * frameHeight * 4;
  const frames: Uint8Array[] = [];
  for (let f = 0; f < frameCount; f++) {
    const frame = new Uint8Array(frameBytes);
    for (let y = 0; y < frameHeight; y++) {
      const srcRowStart = (y * frameWidth * frameCount + f * frameWidth) * 4;
      const dstRowStart = y * frameWidth * 4;
      frame.set(sheetRgba.subarray(srcRowStart, srcRowStart + frameWidth * 4), dstRowStart);
    }
    frames.push(frame);
  }

  const seen: Uint8Array[] = [];
  let duplicates = 0;
  for (const frame of frames) {
    if (seen.some((s) => buffersEqual(s, frame))) duplicates += 1;
    else seen.push(frame);
  }
  const duplicateFrameRatio = duplicates / frameCount;
  const uniqueFrameRatio = 1 - duplicateFrameRatio;

  let silhouetteDeltaSum = 0;
  for (let f = 1; f < frames.length; f++) {
    silhouetteDeltaSum += silhouetteDelta(frames[f - 1]!, frames[f]!, frameBytes);
  }
  const meanSilhouetteDelta = frames.length > 1 ? silhouetteDeltaSum / (frames.length - 1) : 0;

  const centers = frames.map((f) => opaqueCenterX(f, frameWidth, frameHeight));
  const validCenters = centers.filter((c): c is number => c !== null);
  let contentBoundsDrift = 0;
  if (validCenters.length > 0) {
    const avg = validCenters.reduce((a, b) => a + b, 0) / validCenters.length;
    const maxDelta = Math.max(...validCenters.map((c) => Math.abs(c - avg)));
    contentBoundsDrift = frameWidth > 0 ? maxDelta / frameWidth : 0;
  }

  let pixelDeltaSum = 0;
  for (let f = 1; f < frames.length; f++) {
    pixelDeltaSum += meanPixelDeltaBetween(frames[f - 1]!, frames[f]!, frameBytes);
  }
  const meanPixelDelta = frames.length > 1 ? pixelDeltaSum / (frames.length - 1) : 0;

  const bboxes = frames.map((f) => opaqueBoundingBox(f, frameWidth, frameHeight));
  const areas = bboxes.map((b) => (b ? b.w * b.h : 0));
  const meanArea = areas.reduce((a, b) => a + b, 0) / areas.length;
  const areaStddev = Math.sqrt(areas.reduce((sum, a) => sum + (a - meanArea) ** 2, 0) / areas.length);
  const frameDimensionConsistency = meanArea > 0 ? Math.max(0, Math.min(1, 1 - areaStddev / meanArea)) : 1;

  const edgeTouchCount = bboxes.filter((b) => b && (b.x0 <= 0 || b.y0 <= 0 || b.x1 >= frameWidth - 1 || b.y1 >= frameHeight - 1)).length;
  const alphaBoundsConsistency = 1 - edgeTouchCount / frames.length;

  const coverageFractions = frames.map((f) => opaqueCoverage(f, frameBytes));
  const meanCoverage = coverageFractions.reduce((a, b) => a + b, 0) / coverageFractions.length;
  const contentScaleVariance = coverageFractions.reduce((sum, c) => sum + (c - meanCoverage) ** 2, 0) / coverageFractions.length;

  const chaoticMotion = meanPixelDelta > 0.55 && contentScaleVariance > 0.02;
  let maxLowerBodyBlobs = 0;
  for (const frame of frames) {
    maxLowerBodyBlobs = Math.max(maxLowerBodyBlobs, countLowerBodyBlobs(frame, frameWidth, frameHeight));
  }
  const multiLegSmear = maxLowerBodyBlobs > 2;

  return {
    frameCount, uniqueFrameRatio, duplicateFrameRatio, meanSilhouetteDelta, contentBoundsDrift,
    meanPixelDelta, frameDimensionConsistency, alphaBoundsConsistency, contentScaleVariance, chaoticMotion,
    multiLegSmear, maxLowerBodyBlobs,
  };
}

function meanPixelDeltaBetween(a: Uint8Array, b: Uint8Array, byteLength: number): number {
  let diffSum = 0;
  let opaqueCount = 0;
  for (let i = 0; i < byteLength; i += 4) {
    const aOpaque = a[i + 3]! > 16;
    const bOpaque = b[i + 3]! > 16;
    if (!aOpaque && !bOpaque) continue;
    opaqueCount += 1;
    const dr = Math.abs(a[i]! - b[i]!);
    const dg = Math.abs(a[i + 1]! - b[i + 1]!);
    const db = Math.abs(a[i + 2]! - b[i + 2]!);
    diffSum += (dr + dg + db) / (3 * 255);
  }
  return opaqueCount > 0 ? diffSum / opaqueCount : 0;
}

interface BoundingBox { x0: number; y0: number; x1: number; y1: number; w: number; h: number }

function opaqueBoundingBox(frame: Uint8Array, width: number, height: number): BoundingBox | null {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (frame[(y * width + x) * 4 + 3]! > 16) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function opaqueCoverage(frame: Uint8Array, byteLength: number): number {
  let count = 0;
  let total = 0;
  for (let i = 3; i < byteLength; i += 4) {
    if (frame[i]! > 16) count += 1;
    total += 1;
  }
  return total > 0 ? count / total : 0;
}

function buffersEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function silhouetteDelta(a: Uint8Array, b: Uint8Array, byteLength: number): number {
  let diff = 0;
  let total = 0;
  for (let i = 3; i < byteLength; i += 4) {
    const aOpaque = a[i]! > 16;
    const bOpaque = b[i]! > 16;
    if (aOpaque !== bOpaque) diff += 1;
    total += 1;
  }
  return total > 0 ? diff / total : 0;
}

function opaqueCenterX(frame: Uint8Array, width: number, height: number): number | null {
  let sumX = 0;
  let count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = frame[(y * width + x) * 4 + 3]!;
      if (alpha > 16) {
        sumX += x;
        count += 1;
      }
    }
  }
  return count > 0 ? sumX / count : null;
}

/** Hurt-reaction animation: a real directional knockback recoil (a backward horizontal shove
 *  that peaks early and eases back to neutral) layered under the alternating red-white damage
 *  flash on odd frames — the classic "took damage" color cue, plus genuine silhouette motion so
 *  a multi-frame hurt reads as an actual flinch, not a color filter over a static pose. */
export function generateHurtFlashSheet(spec: SpriteSpec, frameCount = 4, sourcePng?: Buffer): Buffer {
  const { rgba, width, height } = sourcePng
    ? decodePngRgba(sourcePng)
    : decodePngRgba(generateProceduralSprite(spec));
  const sheet = new Uint8Array(width * frameCount * height * 4);
  const maxKnockback = Math.max(2, Math.round(width * 0.08));

  for (let f = 0; f < frameCount; f++) {
    const flashed = f % 2 === 1;
    const raw = frameCount > 1 ? f / (frameCount - 1) : 1;
    // fast recoil out, slow ease back — peaks around the first third, not the last frame
    const recoilT = Math.sin(Math.min(1, raw * 1.6) * Math.PI * (raw < 0.5 ? 1 : 0.6)) * (1 - raw * 0.4);
    const shiftX = Math.round(maxKnockback * recoilT);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcX = Math.min(width - 1, Math.max(0, x - shiftX));
        const si = (y * width + srcX) * 4;
        const di = (y * width * frameCount + f * width + x) * 4;
        const alpha = rgba[si + 3]!;
        if (alpha === 0) {
          sheet[di + 3] = 0;
          continue;
        }
        if (flashed) {
          sheet[di] = 255;
          sheet[di + 1] = 90;
          sheet[di + 2] = 90;
        } else {
          sheet[di] = rgba[si]!;
          sheet[di + 1] = rgba[si + 1]!;
          sheet[di + 2] = rgba[si + 2]!;
        }
        sheet[di + 3] = alpha;
      }
    }
  }

  return encodePng(width * frameCount, height, sheet);
}

export type AttackArcKind = 'horizontal' | 'upward' | 'downward';

/** Attack-swing animation: the sprite leans progressively further into the swing across a
 *  windup→strike→impact→recover arc, with a brightness pulse on the impact frame — real visual
 *  feedback for the attack hitbox activating. `arcKind` distinguishes attack_1 (horizontal slash)
 *  from attack_2 (upward arc) and attack_3 (downward slam finisher) — each combo hit gets a
 *  genuinely different silhouette path, not a rotate/recolor of the same swing. The impact frame
 *  is placed at ~65% through the sheet (not the last frame) so there's a real recovery tail for
 *  the combo-cancel window to land on. */
export function generateAttackSheet(spec: SpriteSpec, frameCount = 4, sourcePng?: Buffer, arcKind: AttackArcKind = 'horizontal'): Buffer {
  const { rgba, width, height } = sourcePng
    ? decodePngRgba(sourcePng)
    : decodePngRgba(generateProceduralSprite(spec));
  const sheet = new Uint8Array(width * frameCount * height * 4);
  // Amplitude/windup/recovery tuned so a 12-20 frame combo hit at any reasonable actor canvas
  // size (32px-64px) produces enough distinct integer pixel-shift values to clear the
  // uniqueFrameRatio production bar (PLAYER_ANIMATION_SPEC's minUniqueFrameRatio: 0.7) — a
  // shallower windup/recovery curve collides (multiple frames rounding to the same shift) at
  // small canvas sizes with 12+ frames.
  const maxShift = Math.max(4, Math.floor(width * (arcKind === 'downward' ? 0.28 : 0.3)));
  const maxVertical = Math.floor(height * (arcKind === 'horizontal' ? 0 : 0.14));
  const impactFrame = Math.max(1, Math.round(frameCount * 0.65));

  for (let f = 0; f < frameCount; f++) {
    // Smoothstep windup → strike → ease-out follow-through (anticipation + recovery in-betweens).
    const u = frameCount > 1 ? f / (frameCount - 1) : 0;
    const impactU = frameCount > 1 ? impactFrame / (frameCount - 1) : 1;
    let swingT: number;
    if (u <= impactU) {
      const t = impactU > 0 ? u / impactU : 1;
      const s = t * t * (3 - 2 * t);
      swingT = -0.42 * (1 - s) + s;
    } else {
      const t = (u - impactU) / Math.max(1e-6, 1 - impactU);
      const s = t * t * (3 - 2 * t);
      swingT = 1 - 0.92 * s;
    }
    const shiftX = Math.round(maxShift * swingT);
    const vertSign = arcKind === 'upward' ? -1 : arcKind === 'downward' ? 1 : 0;
    const shiftY = Math.round(maxVertical * swingT * vertSign);
    const isImpactFrame = f === impactFrame;
    const hip = height * 0.56;
    for (let y = 0; y < height; y++) {
      const srcYUnclamped = y - shiftY;
      const srcY = Math.min(height - 1, Math.max(0, srcYUnclamped));
      const armReach = y < hip ? Math.round(shiftX * 0.4) : 0;
      for (let x = 0; x < width; x++) {
        const extra = x > width * 0.5 ? armReach : Math.round(armReach * -0.25);
        const srcX = Math.min(width - 1, Math.max(0, x - shiftX - extra));
        const si = (srcY * width + srcX) * 4;
        const di = (y * width * frameCount + f * width + x) * 4;
        const alpha = rgba[si + 3]!;
        if (alpha === 0 || srcYUnclamped < 0 || srcYUnclamped >= height) {
          sheet[di + 3] = 0;
          continue;
        }
        const boost = isImpactFrame ? 60 : 0;
        sheet[di] = Math.min(255, rgba[si]! + boost);
        sheet[di + 1] = Math.min(255, rgba[si + 1]! + boost);
        sheet[di + 2] = Math.min(255, rgba[si + 2]! + boost);
        sheet[di + 3] = alpha;
      }
    }
  }

  return encodePng(width * frameCount, height, sheet);
}

/** Death animation: the sprite sinks downward and desaturates toward gray across frames,
 *  fading to 45% opacity by the final frame — never fully invisible, since a completely
 *  transparent last frame reads as a rendering bug rather than a death, and would also fail
 *  the animation critic's "frame is empty" check. Frame 0 is pixel-identical to the base
 *  sprite (matches every other sheet here), not a relabeled hurt flash. */
export function generateDeathSheet(spec: SpriteSpec, frameCount = 4, sourcePng?: Buffer): Buffer {
  const { rgba, width, height } = sourcePng
    ? decodePngRgba(sourcePng)
    : decodePngRgba(generateProceduralSprite(spec));
  const sheet = new Uint8Array(width * frameCount * height * 4);

  for (let f = 0; f < frameCount; f++) {
    const t = frameCount > 1 ? f / (frameCount - 1) : 0;
    const dropPx = Math.round(t * height * 0.25);
    const alphaScale = 1 - t * 0.55;
    for (let y = 0; y < height; y++) {
      const srcY = y + dropPx;
      for (let x = 0; x < width; x++) {
        const di = (y * width * frameCount + f * width + x) * 4;
        if (srcY >= height) {
          sheet[di + 3] = 0;
          continue;
        }
        const si = (srcY * width + x) * 4;
        const alpha = rgba[si + 3]!;
        if (alpha === 0) {
          sheet[di + 3] = 0;
          continue;
        }
        const r = rgba[si]!;
        const g = rgba[si + 1]!;
        const b = rgba[si + 2]!;
        const gray = (r + g + b) / 3;
        sheet[di] = Math.round(r + (gray - r) * t);
        sheet[di + 1] = Math.round(g + (gray - g) * t);
        sheet[di + 2] = Math.round(b + (gray - b) * t);
        sheet[di + 3] = Math.round(alpha * alphaScale);
      }
    }
  }

  return encodePng(width * frameCount, height, sheet);
}

export interface PoseTransformSpec {
  /** Vertical source-sampling window [top,bottom] as a 0..1 fraction of height, stretched
   *  to fill the full frame — crops toward the top (rise/jump) or bottom (crouch/land). */
  cropY?: [number, number];
  /** Per-row horizontal pixel shear at the top and bottom of the frame — creates lean/tilt. */
  shearX?: [number, number];
  /** Horizontal squash (<1) or stretch (>1) around the frame's center column. */
  scaleX?: number;
  /** RGB delta applied to every visible pixel, clamped to 0..255 — brightens or darkens the
   *  silhouette so the pose reads as visually distinct even on a flat procedural fill. */
  tint?: number;
}

/**
 * Deterministic, purposeful per-animation-state transforms applied to a single reference frame
 * (a real AI still, or the flat procedural silhouette when none is available) to produce a
 * distinct pose for every locomotion state. This is the required fallback behavior when no AI
 * image provider is healthy: idle/run/jump_start/jump/fall/land/dash must never collapse to "the
 * same pose duplicated across states." Deliberately excludes attack/hurt/death — those already
 * have dedicated multi-frame sheets (generateAttackSheet/generateHurtFlashSheet/
 * generateDeathSheet) wired into AnimatedAssetSprite.gd via attack_sheet_path/hurt_sheet_path/
 * death_sheet_path; producing a single-frame `<id>_attack_pose.png` etc. here would cause
 * AnimatedAssetSprite.gd's `_load_pose_overrides()` to clear() and replace those real multi-frame
 * animations with a static still, regressing the swing/flash/death-fade animations.
 */
export const POSE_TRANSFORMS: Record<string, PoseTransformSpec> = {
  // Needs a real geometric change, not just `tint` — PixelArtProcessor quantizes every pixel to
  // the nearest of 8 fixed palette colors, so a small color-only delta collapses right back to
  // the source color and idle would silently end up byte-identical to walk-frame-0 again (the
  // exact defect this phase fixes). The slight top crop shifts which rows are "inside" the
  // silhouette, which survives quantization since alpha isn't quantized.
  idle: { cropY: [0, 0.96], tint: -8 },
  run: { cropY: [0.02, 1], shearX: [-4, 4] },
  jump_start: { cropY: [0.16, 1], shearX: [3, -3] },
  jump: { cropY: [0, 0.86], shearX: [-2, 2], tint: 14 },
  fall: { cropY: [0.06, 1], shearX: [-6, 6], tint: -6 },
  land: { cropY: [0.28, 1], scaleX: 1.22 },
  dash: { scaleX: 0.82, shearX: [10, -10], tint: 26 },
  wall_slide: { cropY: [0.04, 0.92], shearX: [8, 2], scaleX: 0.9 },
  wall_jump: { cropY: [0, 0.84], shearX: [-8, 8], tint: 18 },
  ground_slam: { cropY: [0.22, 1], scaleX: 1.18, tint: -12 },
  grapple: { cropY: [0, 0.9], shearX: [12, -4], tint: 10 },
  swim: { cropY: [0.08, 0.94], shearX: [-5, 5], scaleX: 0.95 },
  phase: { cropY: [0.04, 0.96], tint: 22, scaleX: 0.88 },
  // Boss combat family — stronger mechanical motion than player idle. Kept off the player
  // `idle` key so courier breathing tests stay on the shallow crop.
  boss_idle: { cropY: [0.06, 0.90], shearX: [4, -4], scaleX: 1.05, tint: 12 },
  boss_telegraph: { cropY: [0.14, 1], shearX: [-16, 14], scaleX: 0.88, tint: 36 },
  boss_recovery: { cropY: [0.18, 1], scaleX: 1.22, tint: -20 },
  boss_projectile: { cropY: [0.02, 0.88], shearX: [14, -6], scaleX: 1.12, tint: 20 },
  boss_burst: { cropY: [0.08, 0.96], scaleX: 1.28, tint: 40 },
};

/**
 * Renders a single, purposeful pose still for one named locomotion state by applying that
 * state's deterministic transform (crop/shear/scale/tint, see `POSE_TRANSFORMS`) to a source
 * frame — a real AI still when one is available, otherwise the flat procedural silhouette.
 * Output matches AnimatedAssetSprite.gd's `_load_pose_overrides()` naming convention
 * (`<id>_<pose>_pose.png`, one frame_size×frame_size frame). Never byte-identical across poses.
 */
export function generatePoseStill(spec: SpriteSpec, poseName: string, sourcePng?: Buffer): Buffer {
  const { rgba, width, height } = sourcePng
    ? decodePngRgba(sourcePng)
    : decodePngRgba(generateProceduralSprite(spec));
  const t = POSE_TRANSFORMS[poseName] ?? {};
  const [cropTop, cropBottom] = t.cropY ?? [0, 1];
  const [shearTop, shearBottom] = t.shearX ?? [0, 0];
  const scaleX = t.scaleX ?? 1;
  const tint = t.tint ?? 0;
  const cx = width / 2;
  const out = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    const frac = height > 1 ? y / (height - 1) : 0;
    const srcYf = (cropTop + frac * (cropBottom - cropTop)) * (height - 1);
    const srcY = Math.max(0, Math.min(height - 1, Math.round(srcYf)));
    const shear = shearTop + (shearBottom - shearTop) * frac;
    for (let x = 0; x < width; x++) {
      const srcXf = (x - cx) / scaleX + cx - shear;
      const srcX = Math.round(srcXf);
      const di = (y * width + x) * 4;
      if (srcX < 0 || srcX >= width) {
        out[di + 3] = 0;
        continue;
      }
      const si = (srcY * width + srcX) * 4;
      const alpha = rgba[si + 3]!;
      if (alpha === 0) {
        out[di + 3] = 0;
        continue;
      }
      out[di] = Math.max(0, Math.min(255, rgba[si]! + tint));
      out[di + 1] = Math.max(0, Math.min(255, rgba[si + 1]! + tint));
      out[di + 2] = Math.max(0, Math.min(255, rgba[si + 2]! + tint));
      out[di + 3] = alpha;
    }
  }

  return encodePng(width, height, out);
}

export interface ProgressionSheetOptions {
  /** 'ramp': frame 0 is neutral, intensity rises (eased) to the full POSE_TRANSFORMS pose by the
   *  last frame — for one-shot transitions that hold on their final pose (jump_start, land,
   *  wall_jump, dash). 'oscillate': intensity rises from neutral to the full pose at the cycle's
   *  midpoint and eases back to neutral by the last frame — for animations that loop while a
   *  state persists (jump-hang, fall, wall_slide, swim, idle). */
  mode: 'ramp' | 'oscillate';
  /** Extra per-frame brightness pulse riding on top of the state's base tint, for idle's subtle
   *  breathing cue. */
  tintPulse?: number;
}

/**
 * Generalized multi-frame progression sheet: animates a single reference frame from neutral
 * toward (and, in 'oscillate' mode, back from) a named state's POSE_TRANSFORMS target across
 * `frameCount` frames, by interpolating the same crop/shear/scale/tint parameters
 * `generatePoseStill` already applies as a single still. This is the shared generator family for
 * every locomotion/transition state that isn't a bespoke walk/run/attack/hurt/death cycle
 * (jump_start, jump, fall, land, dash, wall_slide, wall_jump, swim, idle) — one function reused
 * with per-state config instead of a bespoke generator per animation name, so a new state only
 * needs a POSE_TRANSFORMS entry, never new pixel-pushing code.
 */
export function generateProgressionSheet(
  spec: SpriteSpec,
  poseName: string,
  frameCount: number,
  sourcePng?: Buffer,
  options: ProgressionSheetOptions = { mode: 'ramp' },
): Buffer {
  const { rgba, width, height } = sourcePng
    ? decodePngRgba(sourcePng)
    : decodePngRgba(generateProceduralSprite(spec));

  if (poseName === 'jump_start' || poseName === 'jump' || poseName === 'fall' || poseName === 'land') {
    return blitArticulatedSheet(rgba, width, height, frameCount, (f) => {
      const raw = frameCount > 1 ? f / (frameCount - 1) : 1;
      const eased = raw * raw * (3 - 2 * raw);
      const progress =
        options.mode === 'ramp' ? eased : 0.2 + 0.8 * Math.sin(raw * Math.PI);
      if (poseName === 'jump_start') {
        return {
          phase: 0,
          stridePx: 0,
          footLiftPx: 0,
          torsoLeanPx: -progress * 2.4,
          armSwingPx: 0,
          hipSwayPx: 0,
          compress: progress * 0.78,
          extend: 0,
          attackReachPx: -progress * 2,
        };
      }
      if (poseName === 'jump') {
        return {
          phase: Math.PI * 0.15,
          stridePx: 1,
          footLiftPx: progress * 2,
          torsoLeanPx: progress * 1.6,
          armSwingPx: progress * 2,
          hipSwayPx: 0,
          compress: 0,
          extend: progress * 0.7,
          attackReachPx: 0,
        };
      }
      if (poseName === 'fall') {
        return {
          phase: Math.PI,
          stridePx: 1,
          footLiftPx: 1,
          torsoLeanPx: -progress * 1.2,
          armSwingPx: progress * 3,
          hipSwayPx: 0,
          compress: 0,
          extend: progress * 0.25,
          attackReachPx: 0,
        };
      }
      return {
        phase: 0,
        stridePx: 0,
        footLiftPx: 0,
        torsoLeanPx: progress * 0.8,
        armSwingPx: 0,
        hipSwayPx: 0,
        compress: progress * 0.88,
        extend: 0,
        attackReachPx: 0,
      };
    });
  }

  const t = POSE_TRANSFORMS[poseName] ?? {};
  const [cropTopTarget, cropBottomTarget] = t.cropY ?? [0, 1];
  const [shearTopTarget, shearBottomTarget] = t.shearX ?? [0, 0];
  const scaleXTarget = t.scaleX ?? 1;
  const tintTarget = t.tint ?? 0;
  const cx = width / 2;
  const sheet = new Uint8Array(width * frameCount * height * 4);

  // Oscillate mode's low point never touches pure progress-0 (the untransformed source frame) —
  // at progress 0 every animation's frame is byte-identical to every other animation's neutral
  // frame (walk frame 0, run frame 0, ...), which is exactly the "idle looks like walk-frame-1"
  // defect this pipeline was built to eliminate. A resting/looping state should always carry at
  // least a little of its own pose, even at the bottom of its cycle.
  const OSCILLATE_FLOOR = 0.2;

  for (let f = 0; f < frameCount; f++) {
    const raw = frameCount > 1 ? f / (frameCount - 1) : 1;
    const eased = raw * raw * (3 - 2 * raw); // smoothstep — avoids a linear/robotic ramp
    const progress = options.mode === 'ramp' ? eased : OSCILLATE_FLOOR + (1 - OSCILLATE_FLOOR) * Math.sin(raw * Math.PI);
    const cropTop = 0 + (cropTopTarget - 0) * progress;
    const cropBottom = 1 + (cropBottomTarget - 1) * progress;
    const shearTop = shearTopTarget * progress;
    const shearBottom = shearBottomTarget * progress;
    const scaleX = 1 + (scaleXTarget - 1) * progress;
    const tint = Math.round(tintTarget * progress + (options.tintPulse ? Math.sin(raw * 2 * Math.PI) * options.tintPulse : 0));

    for (let y = 0; y < height; y++) {
      const frac = height > 1 ? y / (height - 1) : 0;
      const srcYf = (cropTop + frac * (cropBottom - cropTop)) * (height - 1);
      const srcY = Math.max(0, Math.min(height - 1, Math.round(srcYf)));
      const shear = shearTop + (shearBottom - shearTop) * frac;
      for (let x = 0; x < width; x++) {
        const srcXf = (x - cx) / scaleX + cx - shear;
        const srcX = Math.round(srcXf);
        const di = (y * width * frameCount + f * width + x) * 4;
        if (srcX < 0 || srcX >= width) {
          sheet[di + 3] = 0;
          continue;
        }
        const si = (srcY * width + srcX) * 4;
        const alpha = rgba[si + 3]!;
        if (alpha === 0) {
          sheet[di + 3] = 0;
          continue;
        }
        sheet[di] = Math.max(0, Math.min(255, rgba[si]! + tint));
        sheet[di + 1] = Math.max(0, Math.min(255, rgba[si + 1]! + tint));
        sheet[di + 2] = Math.max(0, Math.min(255, rgba[si + 2]! + tint));
        sheet[di + 3] = alpha;
      }
    }
  }

  return encodePng(width * frameCount, height, sheet);
}

/** First (or indexed) frame of a horizontal strip, encoded as its own PNG. */
export function extractSheetFramePng(
  sheetPng: Buffer,
  frameWidth: number,
  frameHeight: number,
  index = 0,
): Buffer {
  const { rgba, width, height } = decodePngRgba(sheetPng);
  const frames = frameWidth > 0 ? Math.max(1, Math.floor(width / frameWidth)) : 1;
  const frame = Math.max(0, Math.min(frames - 1, index));
  const h = Math.min(frameHeight, height);
  const out = new Uint8Array(frameWidth * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < frameWidth; x++) {
      const si = (y * width + frame * frameWidth + x) * 4;
      const di = (y * frameWidth + x) * 4;
      out[di] = rgba[si]!;
      out[di + 1] = rgba[si + 1]!;
      out[di + 2] = rgba[si + 2]!;
      out[di + 3] = rgba[si + 3]!;
    }
  }
  return encodePng(frameWidth, h, out);
}

export interface BossCombatSheets {
  idle: Buffer;
  telegraph: Buffer;
  recovery: Buffer;
  attack: Buffer;
  attack_projectile: Buffer;
  attack_burst: Buffer;
  hurt: Buffer;
  death: Buffer;
  walk: Buffer;
}

/** Combat-cycle sheets from one still. Hit windows stay a runtime concern; these clips only change pose. */
export function compileBossCombatSheets(spec: SpriteSpec, sourcePng: Buffer): BossCombatSheets {
  return {
    idle: generateProgressionSheet(spec, 'boss_idle', 6, sourcePng, { mode: 'oscillate', tintPulse: 16 }),
    telegraph: generateProgressionSheet(spec, 'boss_telegraph', 4, sourcePng, { mode: 'oscillate', tintPulse: 22 }),
    recovery: generateProgressionSheet(spec, 'boss_recovery', 4, sourcePng, { mode: 'oscillate' }),
    attack: generateAttackSheet(spec, 6, sourcePng, 'horizontal'),
    attack_projectile: generateProgressionSheet(spec, 'boss_projectile', 6, sourcePng, { mode: 'ramp', tintPulse: 18 }),
    attack_burst: generateProgressionSheet(spec, 'boss_burst', 6, sourcePng, { mode: 'ramp', tintPulse: 28 }),
    hurt: generateHurtFlashSheet(spec, 3, sourcePng),
    death: generateDeathSheet(spec, 8, sourcePng),
    walk: generateWalkCycleSheet(spec, 6, sourcePng),
  };
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Undoes PNG's per-scanline filtering (spec §9.2-9.3). Every real PNG encoder we ingest
 * (Pillow's `Image.save(format="PNG")` in `ensurePngBuffer`'s JPEG conversion, any external
 * image-gen provider) picks a per-row filter — usually Up or Paeth, since None compresses
 * poorly on photographic/gradient content. `encodePng` below always writes filter 0 (None) for
 * our own procedural output, so skipping this step happened to round-trip correctly for
 * everything we generated ourselves, but silently corrupted every externally-sourced PNG: e.g.
 * a constant alpha=255 channel under Up filtering reconstructs to a raw byte of 0
 * (255 - previous-row's-255) on every row after the first, which reads back as fully
 * transparent — turning a fully-opaque real AI image into a near-blank one once it hit the
 * pixel-art pipeline.
 */
function unfilter(inflated: Buffer, width: number, height: number, bpp: number): Buffer {
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filterType = inflated[y * (stride + 1)]!;
    const rowIn = y * (stride + 1) + 1;
    const rowOut = y * stride;
    const priorOut = rowOut - stride;
    for (let x = 0; x < stride; x++) {
      const raw = inflated[rowIn + x]!;
      const a = x >= bpp ? out[rowOut + x - bpp]! : 0;
      const b = y > 0 ? out[priorOut + x]! : 0;
      const c = y > 0 && x >= bpp ? out[priorOut + x - bpp]! : 0;
      let value: number;
      switch (filterType) {
        case 0:
          value = raw;
          break;
        case 1:
          value = raw + a;
          break;
        case 2:
          value = raw + b;
          break;
        case 3:
          value = raw + Math.floor((a + b) / 2);
          break;
        case 4:
          value = raw + paethPredictor(a, b, c);
          break;
        default:
          throw new Error(`Unsupported PNG filter type: ${filterType}`);
      }
      out[rowOut + x] = value & 0xff;
    }
  }
  return out;
}

export function decodePngRgba(png: Buffer): { rgba: Uint8Array; width: number; height: number } {
  if (png[0] !== 137 || png.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error('Not a PNG file');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 6;
  let idat = Buffer.alloc(0);

  while (offset < png.length) {
    const len = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + len);
    offset += 12 + len;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8]!;
      colorType = data[9]!;
    } else if (type === 'IDAT') {
      idat = Buffer.concat([idat, data]);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(
      `Unsupported PNG format for decodePngRgba: bitDepth=${bitDepth}, colorType=${colorType} (only 8-bit RGB/RGBA supported)`,
    );
  }

  const srcBpp = colorType === 6 ? 4 : 3;
  const inflated = inflateSync(idat);
  const pixels = unfilter(inflated, width, height, srcBpp);

  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const si = i * srcBpp;
    const di = i * 4;
    rgba[di] = pixels[si]!;
    rgba[di + 1] = pixels[si + 1]!;
    rgba[di + 2] = pixels[si + 2]!;
    rgba[di + 3] = colorType === 6 ? pixels[si + 3]! : 255;
  }

  return { rgba, width, height };
}

/** Overlay features `generateTilesetSource` actually knows how to render. Anything a caller
 *  requests outside this set must be reported (via `partitionTilesetFeatures`) as unsupported
 *  rather than silently dropped — fifteenth-session requirement to "declare unsupported template
 *  features explicitly". */
export const TILESET_SUPPORTED_FEATURES = [
  'panel_grates',
  'corrosion',
  'stains',
  'damaged_modules',
  'vegetation',
] as const;
export type TilesetFeature = (typeof TILESET_SUPPORTED_FEATURES)[number];

export function partitionTilesetFeatures(requested: readonly string[] | undefined): {
  supported: TilesetFeature[];
  unsupported: string[];
} {
  const supported: TilesetFeature[] = [];
  const unsupported: string[] = [];
  for (const f of requested ?? []) {
    if ((TILESET_SUPPORTED_FEATURES as readonly string[]).includes(f)) supported.push(f as TilesetFeature);
    else unsupported.push(f);
  }
  return { supported, unsupported };
}

export interface TilesetBiomeStyle {
  /** [r,g,b] overrides for the three fixed structural bands (ground / upper wall / shadow wall).
   *  Omitted channels keep the original fixed base color — fully backward compatible with every
   *  existing caller that passes no style at all. */
  groundColor?: [number, number, number];
  wallColor?: [number, number, number];
  shadowColor?: [number, number, number];
  /** Material accent colors used by feature overlays below (corrosion/stains/vegetation/damaged
   *  modules). Deliberately separate from groundColor/wallColor/shadowColor and never a
   *  gameplay-meaning color (player/enemy/boss accents are reserved — see
   *  docs/asset-pipeline/VISUAL_STYLE_GUIDE.md §3); callers should pass a biome's own material
   *  palette here, not an actor accent. */
  accentColor?: [number, number, number];
  accentColor2?: [number, number, number];
  /** Requested overlay features. Use partitionTilesetFeatures() first if you need to disclose
   *  which of these were actually renderable. */
  features?: readonly string[];
  /**
   * Structural language for overlays. `industrial` may use panel_grates (rivets).
   * `carved_stone` / `organic` / `weathered_masonry` never emit riveted cross-hatch —
   * they draw irregular courses, lichen blotches, or soft strata instead.
   */
  structureFamily?: 'industrial' | 'carved_stone' | 'organic' | 'weathered_masonry';
}

/** Hex "#rrggbb" → RGB for biome palette → tileset style mapping. */
function hexToRgbTuple(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [80, 84, 90];
  const n = Number.parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Build a LOCAL_ONLY tileset style from biome / visual DNA so procedural tiles match the
 * prompt theme (coastal sandstone, organic grove, …) instead of default industrial gray
 * + riveted panel_grates from the foundry-biased reference library.
 */
export function tilesetStyleFromBiomeDna(input: {
  displayName?: string;
  biomeId?: string;
  forbiddenPatterns?: string[];
  paletteGlobal?: string[];
  paletteShadows?: string[];
  paletteHighlights?: string[];
  terrainMaterialNames?: string[];
  organicMaterialNames?: string[];
}): TilesetBiomeStyle {
  const hay = [
    input.displayName,
    input.biomeId,
    ...(input.terrainMaterialNames ?? []),
    ...(input.organicMaterialNames ?? []),
    ...(input.forbiddenPatterns ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const forbidsIndustrial =
    /rivet|panel.?grate|industrial foundry|furnace slag|slag brick|cyan robot/i.test(hay) ||
    /coastal|cliff|tide|temple|sandstone|grove|organic|fungal|spore|mycelium|glowcap|underdark|autumn|volcanic|ashland/i.test(
      hay,
    );

  let structureFamily: NonNullable<TilesetBiomeStyle['structureFamily']> = 'weathered_masonry';
  if (/foundry|pouring|quench|cooling.?yard|clockwork|mechanical|industrial/i.test(hay) && !forbidsIndustrial) {
    structureFamily = 'industrial';
  } else if (/fungal|spore|mycelium|glowcap|grove|organic|lichen|kelp|moss/i.test(hay)) {
    structureFamily = 'organic';
  } else if (/coastal|cliff|tide|temple|sandstone|colonnade|shrine|volcanic|ashland|ruin/i.test(hay)) {
    structureFamily = 'carved_stone';
  }

  const global = input.paletteGlobal ?? [];
  const shadows = input.paletteShadows ?? [];
  const highlights = input.paletteHighlights ?? [];
  const ground = hexToRgbTuple(highlights[0] ?? global[2] ?? global[1] ?? '#a89070');
  const wall = hexToRgbTuple(global[1] ?? global[0] ?? '#6a5a48');
  const shadow = hexToRgbTuple(shadows[0] ?? global[0] ?? '#2a2830');
  const accent = hexToRgbTuple(highlights[1] ?? global[global.length - 1] ?? '#7a9a88');
  const accent2 = hexToRgbTuple(global[Math.min(2, global.length - 1)] ?? '#5a7a70');

  const features =
    structureFamily === 'industrial'
      ? (['panel_grates', 'corrosion', 'stains', 'damaged_modules'] as const)
      : structureFamily === 'organic'
        ? (['vegetation', 'stains', 'corrosion'] as const)
        : (['stains', 'vegetation', 'corrosion'] as const);

  return {
    groundColor: ground,
    wallColor: wall,
    shadowColor: shadow,
    accentColor: accent,
    accentColor2: accent2,
    features: [...features],
    structureFamily,
  };
}

function tileHash(seed: number, a: number, b: number, salt: number): number {
  let h = (seed * 9301 + 49297 + a * 7919 + b * 104729 + salt * 1299709) >>> 0;
  h ^= h << 13;
  h ^= h >>> 17;
  h ^= h << 5;
  return (h >>> 0) / 4294967296;
}

function blendTowards(base: [number, number, number], target: [number, number, number], amount: number): [number, number, number] {
  return [
    Math.round(base[0] + (target[0] - base[0]) * amount),
    Math.round(base[1] + (target[1] - base[1]) * amount),
    Math.round(base[2] + (target[2] - base[2]) * amount),
  ];
}

/**
 * Same 16px-tile / ground-vs-wall-band structure as always (tile boundaries and the ground/wall
 * split are never moved by a style or feature — only the fixed-identity colors and an additive
 * overlay pass change), now with an optional per-biome material style. With no `style` argument
 * this reproduces the exact original output byte-for-byte (verified by
 * `png.test.ts`'s backward-compatibility case).
 */
export function generateTilesetSource(seed: number, size = 128, style?: TilesetBiomeStyle): Buffer {
  const rng = (n: number) => ((seed * 9301 + 49297 + n) % 233280) / 233280;
  const rgba = new Uint8Array(size * size * 4);
  const groundBase = style?.groundColor ?? [60, 62, 70];
  const wallBase = style?.wallColor ?? [45, 48, 55];
  const shadowBase = style?.shadowColor ?? [20, 22, 30];
  const groundRange: [number, number, number] = [40, 35, 30];
  const wallRange: [number, number, number] = [25, 20, 20];
  const shadowRange: [number, number, number] = [15, 15, 20];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const tileX = Math.floor(x / 16);
      const tileY = Math.floor(y / 16);
      const isGround = y >= size * 0.5;
      const isWall = x < 16 || x >= size - 16;
      const n = rng(tileX + tileY * 8);

      let r: number, g: number, b: number;
      if (isGround) {
        r = groundBase[0] + n * groundRange[0];
        g = groundBase[1] + n * groundRange[1];
        b = groundBase[2] + n * groundRange[2];
      } else if (isWall && tileY < 4) {
        r = wallBase[0] + n * wallRange[0];
        g = wallBase[1] + n * wallRange[1];
        b = wallBase[2] + n * wallRange[2];
      } else {
        r = shadowBase[0] + n * shadowRange[0];
        g = shadowBase[1] + n * shadowRange[1];
        b = shadowBase[2] + n * shadowRange[2];
      }
      rgba[i] = Math.min(255, Math.max(0, Math.floor(r)));
      rgba[i + 1] = Math.min(255, Math.max(0, Math.floor(g)));
      rgba[i + 2] = Math.min(255, Math.max(0, Math.floor(b)));
      rgba[i + 3] = 255;
    }
  }

  const { supported: rawSupported } = partitionTilesetFeatures(style?.features);
  const structureFamily = style?.structureFamily ??
    (!style || rawSupported.some((feature) => feature === 'panel_grates' || feature === 'damaged_modules')
      ? 'industrial' : 'weathered_masonry');
  // Hard gate: non-industrial biomes never get riveted cross-hatch even if a foundry-biased
  // visual-reference template requested panel_grates.
  const supported =
    structureFamily === 'industrial'
      ? rawSupported
      : rawSupported.filter((f) => f !== 'panel_grates' && f !== 'damaged_modules');

  if (supported.length > 0 || structureFamily !== 'industrial') {
    const accent = style?.accentColor ?? [140, 90, 60];
    const accent2 = style?.accentColor2 ?? [90, 100, 70];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const tileX = Math.floor(x / 16);
        const tileY = Math.floor(y / 16);
        const localX = x % 16;
        const localY = y % 16;
        const isGround = y >= size * 0.5;
        const isWall = x < 16 || x >= size - 16;
        const isStructure = isGround || (isWall && tileY < 4);
        if (!isStructure) continue;
        const base: [number, number, number] = [rgba[i]!, rgba[i + 1]!, rgba[i + 2]!];
        let out = base;

        // Carved / weathered stone: irregular course lines — never a 4px rivet grid.
        if (structureFamily === 'carved_stone' || structureFamily === 'weathered_masonry') {
          const course = localY % 7 === 0;
          const joint = (localX + tileY * 3) % 11 === 0;
          if (course || joint) out = blendTowards(out, shadowBase, 0.22);
          if (tileHash(seed, x, y, 19) > 0.92) out = blendTowards(out, accent, 0.25);
        }
        if (structureFamily === 'organic') {
          if (tileHash(seed, x, y, 53) > 0.88) out = blendTowards(out, accent2, 0.4);
          if (isWall && localX % 5 === 2 && tileHash(seed, tileX, localY, 59) > 0.55) {
            out = blendTowards(out, accent, 0.3);
          }
        }

        // panel_grates: a regular dark cross-hatch every 4px within wall panels — reads as a
        // riveted/grated structural panel without moving the tile's own boundary.
        if (supported.includes('panel_grates') && isWall && tileY < 4) {
          if (localX % 4 === 0 || localY % 4 === 0) out = blendTowards(out, shadowBase, 0.35);
        }

        // corrosion: irregular rust-toned blotches, deterministic per source pixel (same seed ->
        // identical speckle pattern every time).
        if (supported.includes('corrosion')) {
          const speck = tileHash(seed, x, y, 11);
          if (speck > 0.86) out = blendTowards(out, accent, 0.55 + (speck - 0.86) * 3);
        }

        // stains: a handful of deterministic vertical streaks per tile column, darker/desaturated.
        if (supported.includes('stains')) {
          const streakSeed = tileHash(seed, tileX, 0, 23);
          const streakX = Math.floor(streakSeed * 16);
          if (Math.abs(localX - streakX) <= 1 && tileHash(seed, tileX, tileY, 29) > 0.4) {
            out = blendTowards(out, accent2, 0.3 + (localY / 16) * 0.3);
          }
        }

        // damaged_modules: a whole wall tile, chosen deterministically (~1 in 5), recolored as an
        // exposed/broken panel — the tile grid cell itself is untouched, only its fill differs.
        if (supported.includes('damaged_modules') && isWall && tileY < 4) {
          const damaged = tileHash(seed, tileX, tileY, 37) > 0.8;
          if (damaged) {
            const edge = localX < 2 || localX > 13 || localY < 2 || localY > 13;
            out = edge ? blendTowards(out, shadowBase, 0.6) : blendTowards(out, accent, 0.4);
          }
        }

        // vegetation: small deterministic speckle clusters + thin vine-like vertical hints on
        // wall panels, using the biome's own accent (never a gameplay-meaning color).
        if (supported.includes('vegetation') && isWall && tileY < 4) {
          const clusterSeed = tileHash(seed, tileX, tileY, 41);
          if (clusterSeed > 0.7) {
            const vineX = Math.floor(tileHash(seed, tileX, tileY, 43) * 16);
            const near = Math.abs(localX - vineX) <= (localY % 3 === 0 ? 1 : 0);
            if (near || tileHash(seed, x, y, 47) > 0.9) out = blendTowards(out, accent2, 0.5);
          }
        }

        rgba[i] = out[0];
        rgba[i + 1] = out[1];
        rgba[i + 2] = out[2];
      }
    }
  }

  return encodePng(size, size, rgba);
}
