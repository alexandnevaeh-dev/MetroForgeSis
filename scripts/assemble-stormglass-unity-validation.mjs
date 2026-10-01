import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { UnityProjectAssembler } from '../packages/unity/dist/assembler.js';

const sourceFlag = process.argv.indexOf('--source');
if (sourceFlag >= 0 && (!process.argv[sourceFlag + 1] || process.argv[sourceFlag + 1].startsWith('--')))
  throw new Error('--source requires a side-view candidate project path.');
const source = resolve(sourceFlag >= 0 ? process.argv[sourceFlag + 1] : 'GeneratedGames/test-games/metroidvania/current');
const outputDir = resolve(process.argv[2] ?? 'E:/MetroForgeData/TestArtifacts/engine-gpu-20260930/stormglass-unity');
if (existsSync(join(outputDir, 'ProjectSettings/ProjectVersion.txt'))) {
  const previous = JSON.parse(readFileSync(join(outputDir, 'assembly-result.json'), 'utf8'));
  if (!process.argv.includes('--refresh') || previous.source !== source || previous.engine !== 'unity')
    throw new Error('Choose a fresh output directory or explicitly refresh this generated validation fixture.');
  const backup = join(outputDir, 'validation-backups', new Date().toISOString().replaceAll(':', '-'));
  mkdirSync(backup, { recursive: true });
  for (const relative of ['Assets/Scripts', 'Assets/StreamingAssets/gameplay.json', 'gameplay.json', 'assembly-result.json', 'Builds/Windows/qa']) {
    if (existsSync(join(outputDir, relative))) cpSync(join(outputDir, relative), join(backup, relative), { recursive: true });
  }
}
const read = (relative) => JSON.parse(readFileSync(join(source, relative), 'utf8'));
const gameDna = read('game_dna.json');
if (gameDna.archetype !== 'SIDE_VIEW_METROIDVANIA') throw new Error('Expected the separate side-view game set.');
const worldGraph = read('world_graph.json');
const progressionGraph = read('progression_graph.json');
const roomIds = worldGraph.nodes.filter((node) => node.type === 'room').map((node) => node.id);
const gameContent = {};
for (const [key, path, field] of [
  ['enemies', 'enemies/enemies.json', 'enemies'], ['bosses', 'bosses/bosses.json', 'bosses'],
  ['quests', 'quests/quests.json', 'quests'], ['items', 'items/items.json', 'items'],
  ['npcs', 'npcs/npcs.json', 'npcs'], ['dialogues', 'dialogues/dialogues.json', 'dialogues'],
  ['shops', 'shops/shops.json', 'shops'], ['lootTables', 'loot/loot_tables.json', 'tables'],
]) {
  const catalog = read(`data/${path}`);
  gameContent[key] = Array.isArray(catalog) ? catalog : catalog[field] ?? [];
}
mkdirSync(outputDir, { recursive: true });
const textureFiles = new Map();
if (!process.argv.includes('--reuse-staged-assets')) {
  const collect = (folder, prefix) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name), relative = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) collect(path, relative);
      else if (/\.(png|json)$/i.test(entry.name)) textureFiles.set(relative, readFileSync(path));
    }
  };
  collect(join(source, 'assets'), 'assets');
}
const result = new UnityProjectAssembler().assemble({ outputDir, gameDna, worldGraph, progressionGraph, roomIds, gameContent, textureFiles });
writeFileSync(join(outputDir, 'assembly-result.json'), JSON.stringify({ ...result, source, roomCount: roomIds.length }, null, 2));
if (!result.success) throw new Error(JSON.stringify(result.errors));
if (result.warnings.some((warning) => warning.includes('UNITY_VISUAL_PACK overlay'))) throw new Error('Unexpected old art overlay.');
console.log(JSON.stringify({ success: true, outputDir, rooms: roomIds.length, warnings: result.warnings }));
