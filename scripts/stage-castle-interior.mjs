/** Build one new upstairs/downstairs castle candidate; preserve source game and all assets. */
import assert from 'node:assert/strict';
import { cpSync, existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildCastleInteriorLayout } from '../packages/godot/dist/castle-interior-layout.js';
import {
  prepareRoomAssemblyContext,
  buildRoomAssemblyOptions,
  buildPublishedRoomRecord,
  generateRoomScene,
} from '../packages/godot/dist/room-assembler.js';
const source = resolve(process.argv[2] ?? ''),
  base = resolve(process.argv[3] ?? '');
assert.ok(process.argv[2] && process.argv[3]);
assert.match(base, /^E:[\\/]/i);
assert.ok(!existsSync(base), 'Use a fresh candidate');
const read = (root, path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const before = read(source, 'data/rooms/rooms.json'),
  dna = read(source, 'game_dna.json');
assert.equal(dna.archetype, 'SIDE_VIEW_METROIDVANIA');
assert.ok(dna.identity.title.startsWith('Stormglass Reliquary'));
assert.equal(Object.keys(before.rooms).length, 40);
const game = join(base, 'games/stormglass-castle'),
  root = fileURLToPath(new URL('..', import.meta.url));
cpSync(source, game, {
  recursive: true,
  filter: (path) => !['.godot', 'qa', 'reports'].includes(basename(path)),
});
const graph = read(game, 'world_graph.json'),
  ids = Object.keys(before.rooms);
const content = Object.fromEntries(
  ['enemies', 'bosses', 'npcs'].map((key) => [key, read(game, `data/${key}/${key}.json`)[key]]),
);
const layout = buildCastleInteriorLayout();
const opts = buildRoomAssemblyOptions(
  'room_001',
  1,
  prepareRoomAssemblyContext(graph, content, ids),
  dna,
  content,
  { value: 1 },
  (rel) => existsSync(join(game, rel)),
  { width: 4096, height: 1536, hasEnemy: true },
);
opts.platforms = [...layout.platforms, ...layout.partitions];
opts.pits = [];
opts.tileCells = [];
opts.tileCellsAuthored = true;
opts.entityPlacements = before.rooms.room_001.entityPlacements.map((row) =>
  row.kind === 'enemy' ? { ...row, y: layout.floors.lower } : row,
);
const cells = new Map();
for (let y = 46; y < 48; y++)
  for (let x = 0; x < 128; x++) cells.set(`${x},${y}`, { x, y, col: 0, row: 0 });
for (const p of opts.platforms)
  for (let y = p.y / 32; y < (p.y + p.height) / 32; y++)
    for (let x = p.x / 32; x < (p.x + p.width) / 32; x++)
      cells.set(`${x},${y}`, { x, y, col: 3, row: 0 });
opts.tileCells = [...cells.values()];
if (opts.blueprint?.plan) {
  opts.blueprint.plan.platformRegions = opts.platforms.map((p) => ({ ...p }));
  opts.blueprint.plan.gameplayFloors = [
    { x: 0, y: layout.floors.lower, width: 4096, height: 64 },
    ...layout.platforms.filter((p) => p.width > 512).map((p) => ({ ...p })),
  ];
}
const record = buildPublishedRoomRecord('room_001', 1, opts);
assert.deepEqual(record.connections, before.rooms.room_001.connections);
const rooms = structuredClone(before);
rooms.rooms.room_001 = record;
for (const id of ids.filter((id) => id !== 'room_001'))
  assert.deepEqual(rooms.rooms[id], before.rooms[id]);
writeFileSync(join(game, 'data/rooms/rooms.json'), JSON.stringify(rooms, null, 2));
writeFileSync(join(game, 'scenes/rooms/room_001.tscn'), generateRoomScene('room_001', 1, opts));
mkdirSync(join(game, 'data/visual'), { recursive: true });
writeFileSync(
  join(game, 'data/visual/castle-interiors.json'),
  JSON.stringify({ version: 1, rooms: { room_001: layout } }, null, 2),
);
writeFileSync(
  join(game, 'data/visual/castle-spatial-profile.json'),
  JSON.stringify(
    {
      version: 1,
      rooms: ['room_001'],
      panoramaHeight: 256,
      panoramaMode: 'continuous',
      sourceHeightFraction: 0.75,
      stoneGrade: [0.54, 0.67, 0.84],
    },
    null,
    2,
  ),
);
for (const rel of [
  'scripts/world/StormglassDecor.gd',
  'scripts/world/RoomTileMap.gd',
  'scripts/test/CastleContinuityValidation.gd',
  'scenes/test/CastleContinuityValidation.tscn',
  'scripts/test/CastleStoreyTraversal.gd',
  'scenes/test/CastleStoreyTraversal.tscn',
])
  cpSync(join(root, 'templates/godot-metroidvania', rel), join(game, rel));
const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex'),
  media = {};
function verifyAssets(path = 'assets') {
  for (const entry of readdirSync(join(source, path), { withFileTypes: true })) {
    const rel = `${path}/${entry.name}`;
    if (entry.isDirectory()) verifyAssets(rel);
    else {
      media[rel] = sha(join(source, rel));
      assert.equal(sha(join(game, rel)), media[rel]);
    }
  }
}
verifyAssets();
for (const rel of ['world_graph.json', 'game_dna.json', 'generation_manifest.json'])
  assert.equal(sha(join(source, rel)), sha(join(game, rel)));
writeFileSync(
  join(base, 'interior-layout.json'),
  JSON.stringify(
    {
      ...layout,
      unchangedSiblingRooms: 39,
      scope: 'Authored three-storey candidate, not native traversal or visual acceptance.',
    },
    null,
    2,
  ),
);
writeFileSync(
  join(base, 'provenance.json'),
  JSON.stringify(
    {
      source,
      media,
      roomsPreserved: 39,
      doorsPreserved: true,
      scope:
        'Only gallery geometry, interior plan and explicit renderer updates; all registered art preserved.',
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    base,
    game,
    storeys: 3,
    chambers: layout.sections.length,
    stairs: layout.ascent.length,
    platforms: layout.platforms.length,
    partitions: layout.partitions.length,
  }),
);
