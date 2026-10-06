import { collisionRectsFromTiles } from '@metroforge/procedural';
import { readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

type RecordData = Record<string, unknown>;
const record = (value: unknown): value is RecordData => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const pair = (value: unknown): value is [number, number] => Array.isArray(value) && value.length === 2 && value.every(finite);

/** Validate persisted input before any write; matches the runtime authored layout limits. */
export function validateTopDownProps(value: unknown): void {
  if (!Array.isArray(value) || value.length > 512) throw new Error('Props must be an array of at most 512 placements');
  const ids = new Set<string>();
  for (const prop of value) {
    if (!record(prop) || typeof prop.id !== 'string' || !prop.id.trim() || ids.has(prop.id)) throw new Error('Prop identities must be nonempty and unique');
    ids.add(prop.id);
    if (typeof prop.image !== 'string' || !prop.image.startsWith('res://') || /[\\:]/.test(prop.image.slice(6)) || prop.image.includes('..') || prop.image.length <= 6) throw new Error('Prop image must be a project resource');
    if (!finite(prop.x) || !finite(prop.y)) throw new Error('Prop positions must be finite');
    const layout = prop.layout;
    if (!record(layout) || layout.version !== 1 || !pair(layout.sourceSize) || layout.sourceSize.some(n => n <= 0) || !pair(layout.anchorPx)) throw new Error('Invalid prop image size or anchor');
    if (layout.anchorPx.some((n, i) => n < 0 || n > (layout.sourceSize as number[])[i]!)) throw new Error('Prop anchor is outside image');
    if (!finite(layout.displayScale) || layout.displayScale <= 0 || layout.displayScale > 4) throw new Error('Invalid prop scale');
    if (!Array.isArray(layout.collisionRectsPx) || layout.collisionRectsPx.length > 16) throw new Error('Invalid prop footprints');
    for (const rect of layout.collisionRectsPx) {
      if (!record(rect) || !finite(rect.x) || !finite(rect.y) || !finite(rect.width) || !finite(rect.height) || rect.width <= 0 || rect.height <= 0 || Math.abs(rect.x) + rect.width > layout.sourceSize[0] * 2 || Math.abs(rect.y) + rect.height > layout.sourceSize[1] * 2) throw new Error('Invalid prop footprint');
    }
    if (layout.layers !== undefined) {
      if (!Array.isArray(layout.layers) || layout.layers.length < 1 || layout.layers.length > 32) throw new Error('Invalid prop layers');
      const layers = new Set<string>();
      for (const layer of layout.layers) {
        if (!record(layer) || typeof layer.id !== 'string' || !layer.id.trim() || layers.has(layer.id) || !finite(layer.sortY) || Math.abs(layer.sortY) > layout.sourceSize[1] * 2) throw new Error('Invalid prop layer identity or depth');
        layers.add(layer.id);
        if (typeof layer.image !== 'string' || !layer.image || ['.', '..'].includes(layer.image) || /[\\/:]/.test(layer.image)) throw new Error('Layer image must be a sibling filename');
      }
    }
  }
}

function readWorld(projectPath: string): { path: string; world: RecordData; areas: RecordData[] } {
  const path = join(projectPath, 'data', 'world', 'overworld.json');
  const world: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!record(world) || !Array.isArray(world.areas) || !world.areas.every(record)) throw new Error('Invalid top-down world data');
  return { path, world, areas: world.areas };
}

export function snapshotTopDownArea(projectPath: string, areaId: string): RecordData {
  const { areas } = readWorld(projectPath);
  const matches = areas.filter(area => area.id === areaId);
  if (matches.length !== 1) throw new Error('Top-down area must exist exactly once');
  return structuredClone(matches[0]!);
}

/** Save only this area's props; all unrelated area/world fields remain intact. */
export function saveTopDownProps(projectPath: string, areaId: string, placements: unknown): void {
  validateTopDownProps(placements);
  writeTopDownProps(projectPath, areaId, placements, false);
}

/** Undo must preserve absence (automatic scatter) versus [] (explicitly no props). */
export function restoreTopDownProps(projectPath: string, areaId: string, snapshot: RecordData): void {
  if (snapshot.id !== areaId) throw new Error('Snapshot area does not match');
  const absent = !Object.hasOwn(snapshot, 'propPlacements');
  if (!absent) validateTopDownProps(snapshot.propPlacements);
  const {path,world,areas}=readWorld(projectPath);
  const matches=areas.filter(area=>area.id===areaId);
  if(matches.length!==1)throw Error('Top-down area must exist exactly once');
  const area=matches[0]!;
  if(snapshot.widthTiles!==undefined){
    if(snapshot.widthTiles!==area.widthTiles||snapshot.heightTiles!==area.heightTiles||snapshot.tileSize!==area.tileSize)throw Error('Area dimensions changed since the saved edit');
    validateTerrainGrid(area,snapshot.tiles);
    if(snapshot.collisionRects!==undefined&&(!Array.isArray(snapshot.collisionRects)||snapshot.collisionRects.some(r=>!record(r)||![r.x,r.y,r.w,r.h].every(finite)||(r.w as number)<=0||(r.h as number)<=0)))throw Error('Invalid saved terrain collision');
    area.tiles=structuredClone(snapshot.tiles);
    if(Object.hasOwn(snapshot,'collisionRects'))area.collisionRects=structuredClone(snapshot.collisionRects);
    else delete area.collisionRects;
  }
  if(absent)delete area.propPlacements;else area.propPlacements=structuredClone(snapshot.propPlacements);
  writeWorldAtomic(path,world);
}

function writeTopDownProps(projectPath: string, areaId: string, placements: unknown, remove: boolean): void {
  const { path, world, areas } = readWorld(projectPath);
  const matches = areas.filter(area => area.id === areaId);
  if (matches.length !== 1) throw new Error('Top-down area must exist exactly once');
  const area = matches[0]!;
  if (remove) delete area.propPlacements;
  else area.propPlacements = structuredClone(placements);
  writeWorldAtomic(path, world);
}

function writeWorldAtomic(path: string, world: RecordData): void {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(world, null, 2) + '\n', { flag: 'wx' });
    renameSync(temporary, path);
  } finally {
    try { unlinkSync(temporary); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

/** Persist the terrain grid and its derived runtime collision in the same file replacement. */
export function saveTopDownTerrain(projectPath:string,areaId:string,tiles:unknown):void {
 const {path,world,areas}=readWorld(projectPath);
 const matches=areas.filter(area=>area.id===areaId);
 if(matches.length!==1)throw Error('Top-down area must exist exactly once');
 const area=matches[0]!;
 validateTerrainGrid(area,tiles);
 const size=area.tileSize;
 const grid=structuredClone(tiles) as number[][];
 area.tiles=grid;
 area.collisionRects=collisionRectsFromTiles(grid,size as number);
 writeWorldAtomic(path,world);
}

function validateTerrainGrid(area:RecordData,tiles:unknown):void {
 const width=area.widthTiles,height=area.heightTiles,size=area.tileSize;
 if(![width,height,size].every(n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0))throw Error('Invalid area dimensions');
 if((width as number)*(height as number)>1048576)throw Error('Terrain edit exceeds supported cell count');
 if(!Array.isArray(tiles)||tiles.length!==height||tiles.some(row=>!Array.isArray(row)||row.length!==width||row.some(value=>!Number.isInteger(value)||value<0||value>3)))throw Error('Terrain must match room dimensions and use values 0 through 3');
}
