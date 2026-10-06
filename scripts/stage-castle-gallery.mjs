/** Stage one opt-in gallery in a new E: candidate; preserve the source game and media. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  prepareRoomAssemblyContext,
  buildRoomAssemblyOptions,
  buildPublishedRoomRecord,
  generateRoomScene,
  buildStormglassEncounterPlacements,
} from '../packages/godot/dist/room-assembler.js';

const source = resolve(process.argv[2] ?? '');
const base = resolve(process.argv[3] ?? '');
assert.ok(
  process.argv[2] && process.argv[3],
  'Usage: node scripts/stage-castle-gallery.mjs SOURCE_GAME NEW_E_CANDIDATE',
);
assert.match(base, /^E:[\\/]/i);
assert.ok(!existsSync(base), 'Use a new candidate; existing games and evidence are preserved');
const read = (root, path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const dna = read(source, 'game_dna.json');
assert.equal(dna.archetype, 'SIDE_VIEW_METROIDVANIA');
assert.ok(dna.identity.title.startsWith('Stormglass Reliquary'));
const before = read(source, 'data/rooms/rooms.json');
assert.equal(before.rooms.room_001.width, 2048, 'Start from the original gallery');
assert.equal(before.rooms.room_001.height, 1536);
assert.equal(Object.keys(before.rooms).length, 40);
const game = join(base, 'games/stormglass-castle');
cpSync(source, game, {
  recursive: true,
  filter: (path) => !['.godot', 'qa', 'reports'].includes(basename(path)),
});
const graph = read(game, 'world_graph.json');
const ids = Object.keys(before.rooms);
const content = Object.fromEntries(
  ['enemies', 'bosses', 'npcs'].map((key) => [key, read(game, `data/${key}/${key}.json`)[key]]),
);
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
opts.platforms = Array.from({ length: 8 }, (_, bay) => ({
  x: 256 + bay * 480,
  y: 1376 - (bay % 2) * 64,
  width: 352,
  height: 32,
}));
opts.platforms.unshift({ x: 128, y: 1408, width: 96, height: 32 });
opts.pits = [];
opts.tileCells = [];
opts.tileCellsAuthored = true;
for (let y = 46; y < 48; y++)
  for (let x = 0; x < 128; x++) opts.tileCells.push({ x, y, col: 0, row: 0 });
for (const p of opts.platforms)
  for (let x = p.x / 32; x < (p.x + p.width) / 32; x++)
    opts.tileCells.push({ x, y: p.y / 32, col: 3, row: 0 });
opts.entityPlacements = [
  ...before.rooms.room_001.entityPlacements.filter((p) => p.kind !== 'enemy'),
  ...buildStormglassEncounterPlacements(
    'room_001',
    1,
    opts,
    content.enemies.map((e) => e.id),
  ),
];
const record = buildPublishedRoomRecord('room_001', 1, opts);
assert.deepEqual(record.connections, before.rooms.room_001.connections);
const rooms = structuredClone(before);
rooms.rooms.room_001 = {
  ...record,
  layoutMetrics: {
    design: 'long-gallery-reference-v1',
    bayCount: 8,
    lowerRoute: 'continuous',
    balconyRoute: 'optional',
    preservedActorScale: true,
  },
};
for (const id of ids.filter((id) => id !== 'room_001'))
  assert.deepEqual(rooms.rooms[id], before.rooms[id]);
writeFileSync(join(game, 'scenes/rooms/room_001.tscn'), generateRoomScene('room_001', 1, opts));
writeFileSync(join(game, 'data/rooms/rooms.json'), JSON.stringify(rooms, null, 2));
const root = fileURLToPath(new URL('..', import.meta.url));
for (const path of ['scripts/world/StormglassDecor.gd', 'scripts/world/RoomTileMap.gd'])
  cpSync(join(root, 'templates/godot-metroidvania', path), join(game, path));
writeFileSync(
  join(game, 'data/visual/castle-spatial-profile.json'),
  JSON.stringify({ version: 1, rooms: ['room_001'], panoramaHeight: 1024 }, null, 2),
);
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const media = {};
function verifyMedia(path = 'assets') {
  for (const entry of readdirSync(join(source, path), { withFileTypes: true })) {
    const file = `${path}/${entry.name}`;
    if (entry.isDirectory()) verifyMedia(file);
    else {
      media[file] = sha(join(source, file));
      assert.equal(sha(join(game, file)), media[file]);
    }
  }
}
verifyMedia();
writeFileSync(
  join(base, 'gallery-layout.json'),
  JSON.stringify(
    {
      room: 'room_001',
      before: { width: 2048, height: 1536 },
      after: { width: 4096, height: 1536 },
      platforms: opts.platforms,
      unchangedSiblingRooms: 39,
      connectionsPreserved: true,
      scope: 'Candidate only. No new art generation or native traversal is implied by staging.',
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
      mediaUnchanged: Object.keys(media).length,
      media,
      rendererHashes: Object.fromEntries(
        ['StormglassDecor.gd', 'RoomTileMap.gd'].map((name) => [
          name,
          sha(join(game, 'scripts/world', name)),
        ]),
      ),
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    base,
    galleryWidth: 4096,
    platforms: 9,
    unchangedSiblingRooms: 39,
    mediaUnchanged: Object.keys(media).length,
    nativeValidated: false,
  }),
);
