import { existsSync, readFileSync, writeFileSync, realpathSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { join, dirname, relative, isAbsolute } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parseTerrainPresentation } from '@metroforge/engines';
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
function snapshot(project: string, asset: string) {
  if (!/^assets\/tilesets\/biome_\d+\/(floor|wall)(\.coping)?\.png$/.test(asset)) throw new Error('Select a canonical floor, wall, or coping image');
  const root = realpathSync(project);
  const contained = (path: string) => {
    const target = realpathSync(existsSync(path) ? path : dirname(path));
    const rel = relative(root, target);
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Terrain path escapes project');
    return path;
  };
  const png = readFileSync(contained(join(root, asset)));
  if (png.length < 24 || png.subarray(0,8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Invalid terrain PNG');
  const image = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
  const file = contained(join(root, asset.replace('.png','.presentation.json')));
  const mirrorRoot = join(root,'Assets','StreamingAssets');
  const files = [file];
  if (existsSync(mirrorRoot)) {
    const runtimePng = readFileSync(contained(join(mirrorRoot,asset)));
    if (!png.equals(runtimePng)) throw new Error('Terrain images differ; reconcile before editing');
    files.push(contained(join(mirrorRoot,asset.replace('.png','.presentation.json'))));
  }
  const originals = files.map(path => existsSync(path) ? readFileSync(path,'utf8') : null);
  if (originals.length > 1 && originals[0] !== originals[1]) throw new Error('Terrain runtime settings differ; reconcile before editing');
  const settings = parseTerrainPresentation(originals[0] === null ? {width:image.width,height:image.height} : JSON.parse(originals[0]!),image);
  return {root,contained,files,originals,image,settings,revision:hash(JSON.stringify([hash(png),originals]))};
}
export function readEditableTerrain(project: string, asset: string) {
  const {settings,image,revision} = snapshot(project,asset);
  return {settings,image,revision,restartRequired:true as const};
}
export function saveEditableTerrain(project: string, asset: string, value: unknown, revision: string) {
  const state = snapshot(project,asset);
  if (state.revision !== revision) throw new Error('Terrain changed; reload before saving');
  const settings = parseTerrainPresentation(value,state.image);
  const id = randomUUID();
  const metadataDir = state.contained(join(state.root,'.metroforge'));
  mkdirSync(metadataDir,{recursive:true});
  const backupDir = state.contained(join(metadataDir,'terrain-edit-backups'));
  mkdirSync(backupDir,{recursive:true});
  const backup = join(backupDir,`${id}.json`);
  writeFileSync(backup,JSON.stringify({asset,originals:state.originals},null,2),{flag:'wx'});
  const staged = state.files.map(path=>`${path}.${id}.tmp`);
  const replaced: number[] = [];
  try {
    staged.forEach(path=>writeFileSync(path,JSON.stringify(settings,null,2),{flag:'wx'}));
    if(snapshot(project,asset).revision!==revision) throw new Error('Terrain changed while saving');
    state.files.forEach((path,index)=>{renameSync(staged[index]!,path);replaced.push(index);});
  } catch(error) {
    const failures: string[] = [];
    for(const i of replaced) try {
      if(state.originals[i]===null) unlinkSync(state.files[i]!);
      else writeFileSync(state.files[i]!,state.originals[i]!);
    } catch(rollback) { failures.push(String(rollback)); }
    if(failures.length) throw new Error(`Restore terrain backup ${backup}: ${failures.join('; ')}`);
    throw error;
  } finally { for(const path of staged) if(existsSync(path)) unlinkSync(path); }
  return {...readEditableTerrain(project,asset),backup,runtimeSynchronized:state.files.length===2};
}
