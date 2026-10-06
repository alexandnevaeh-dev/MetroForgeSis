/** Build original architecture studies in a fresh E: copy; no canonical game writes. */
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import {
  CASTLE_ROOM_FAMILIES,
  buildCastleRoomFamily,
} from '../packages/godot/dist/castle-room-family.js';
import {
  prepareRoomAssemblyContext,
  buildRoomAssemblyOptions,
  buildPublishedRoomRecord,
  generateRoomScene,
} from '../packages/godot/dist/room-assembler.js';
const source = resolve(process.argv[2]),
  base = resolve(process.argv[3]);
assert.ok(process.argv[2] && process.argv[3]);
assert.match(base, /^E:[\\/]/i);
assert.ok(!existsSync(base), 'Preserve previous candidates');
const game = join(base, 'games/stormglass-castle'),
  repo = resolve('.');
const read = (root, file) => JSON.parse(readFileSync(join(root, file), 'utf8'));
const dna = read(source, 'game_dna.json');
assert.equal(dna.archetype, 'SIDE_VIEW_METROIDVANIA');
cpSync(source, game, {
  recursive: true,
  filter: (path) => !['.godot', 'qa', 'reports'].includes(basename(path)),
});
const graph = read(game, 'world_graph.json'),
  rooms = read(game, 'data/rooms/rooms.json');
const before = structuredClone(rooms);
const content = Object.fromEntries(
  ['enemies', 'bosses', 'npcs'].map((key) => [key, read(game, `data/${key}/${key}.json`)[key]]),
);
const ctx = prepareRoomAssemblyContext(graph, content, Object.keys(rooms.rooms));
const plans = {};
const ids = [1, 2, 4, 5, 6, 7, 9, 10].map((index) => `room_${String(index).padStart(3, '0')}`);
const assetDir = join(game, 'assets/architecture/stormglass-room-family');
mkdirSync(assetDir, { recursive: true });
const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${body}</svg>`;
const stone = '#59687b',
  trim = '#9b8861',
  dark = '#192533',
  glass = '#346477';
const r = (x, y, w, h, c) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`;
const arch = `<path d="M16 384V120Q16 40 128 8Q240 40 240 120V384H216V120Q216 68 128 40Q40 68 40 120V384Z" fill="${stone}"/>`;
const assets = {
  arch: svg(256, 384, arch + r(8, 368, 48, 16, trim) + r(200, 368, 48, 16, trim)),
  window: svg(
    256,
    384,
    arch +
      `<path d="M64 328V128Q64 92 128 56Q192 92 192 128V328Z" fill="${glass}"/>` +
      r(124, 80, 8, 248, trim) +
      r(64, 196, 128, 8, trim),
  ),
  shelf: svg(
    256,
    256,
    r(8, 0, 240, 256, '#3b302d') +
      Array.from(
        { length: 4 },
        (_, row) =>
          r(16, row * 64 + 52, 224, 12, trim) +
          Array.from({ length: 14 }, (_, col) =>
            r(
              20 + col * 16,
              row * 64 + 8 + (col % 3) * 4,
              12,
              44 - (col % 3) * 4,
              ['#547166', '#71546b', '#79704e'][col % 3],
            ),
          ).join(''),
      ).join(''),
  ),
  banner: svg(
    64,
    192,
    r(0, 0, 64, 12, trim) +
      `<path d="M8 12H56V160L32 188L8 160Z" fill="#405469"/>` +
      `<path d="M32 44L48 72L32 100L16 72Z" fill="#68b9b2"/>`,
  ),
  sconce: svg(
    64,
    128,
    r(24, 56, 16, 72, trim) +
      r(8, 68, 48, 12, stone) +
      `<path d="M32 8Q4 48 32 60Q60 48 32 8Z" fill="#ddab61"/>` +
      r(28, 32, 8, 24, '#ffe0a1'),
  ),
  sarcophagus: svg(
    256,
    128,
    r(8, 24, 240, 88, stone) +
      r(0, 16, 256, 24, trim) +
      r(16, 112, 224, 16, dark) +
      `<path d="M64 64H192M128 40V96" stroke="#a9b4be" stroke-width="8"/>`,
  ),
  apparatus: svg(
    256,
    192,
    r(0, 144, 256, 16, trim) +
      r(16, 160, 16, 32, stone) +
      r(224, 160, 16, 32, stone) +
      r(40, 32, 16, 112, trim) +
      `<path d="M48 40H160V72M136 80L116 136H204L184 80Z" fill="none" stroke="${glass}" stroke-width="12"/>` +
      r(124, 120, 72, 16, '#5d9c94'),
  ),
  support: svg(
    256,
    384,
    r(8, 16, 24, 368, '#665039') +
      r(224, 16, 24, 368, '#665039') +
      r(0, 0, 256, 24, trim) +
      `<path d="M32 104L112 24M224 104L144 24" stroke="#81684b" stroke-width="20"/>`,
  ),
  statue: svg(
    128,
    256,
    r(16, 224, 96, 32, stone) +
      `<path d="M32 224L44 112L28 88L48 64H80L100 88L84 112L96 224Z" fill="${stone}"/>` +
      r(48, 24, 32, 40, '#78899a') +
      r(8, 216, 112, 12, trim),
  ),
  weapon_rack: svg(
    256,
    192,
    r(16, 16, 224, 16, trim) +
      r(24, 32, 16, 160, '#514039') +
      r(216, 32, 16, 160, '#514039') +
      Array.from(
        { length: 5 },
        (_, i) => r(56 + i * 32, 40, 8, 120, '#94a4af') + r(44 + i * 32, 144, 32, 8, trim),
      ).join(''),
  ),
  bell: svg(
    128,
    192,
    r(56, 0, 16, 56, trim) +
      `<path d="M24 160L36 96Q36 56 64 56Q92 56 92 96L104 160Z" fill="${trim}"/>` +
      r(16, 160, 96, 16, '#c1a379') +
      r(56, 176, 16, 16, stone),
  ),
  floor_trim: svg(
    256,
    64,
    r(0, 0, 256, 64, dark) +
      r(0, 0, 256, 12, stone) +
      r(0, 12, 256, 8, trim) +
      Array.from({ length: 8 }, (_, i) => r(i * 32 + 4, 28, 24, 28, '#36485b')).join(''),
  ),
};
for (const [name, image] of Object.entries(assets))
  writeFileSync(join(assetDir, name + '.svg'), image);
for (let i = 0; i < ids.length; i++) {
  const id = ids[i],
    plan = buildCastleRoomFamily(CASTLE_ROOM_FAMILIES[i]);
  plans[id] = plan;
  const opts = buildRoomAssemblyOptions(
    id,
    Number(id.slice(5)),
    ctx,
    dna,
    content,
    { value: i },
    (rel) => existsSync(join(game, rel)),
    { width: plan.width, height: plan.height },
  );
  opts.castleRegionPlan = undefined;
  opts.platforms = plan.platforms;
  opts.pits = [];
  opts.tileCellsAuthored = true;
  opts.entityPlacements = before.rooms[id].entityPlacements?.map((p) => ({
    ...p,
    y: p.y + plan.height - before.rooms[id].height,
  }));
  const cells = new Map();
  for (const rect of [{ x: 0, y: plan.floorY, width: plan.width, height: 64 }, ...plan.platforms])
    for (let y = rect.y / 32; y < (rect.y + rect.height) / 32; y++)
      for (let x = rect.x / 32; x < (rect.x + rect.width) / 32; x++)
        cells.set(`${x},${y}`, { x, y, col: 3, row: 0 });
  opts.tileCells = [...cells.values()];
  const record = buildPublishedRoomRecord(id, Number(id.slice(5)), opts);
  assert.deepEqual(record.connections, before.rooms[id].connections);
  rooms.rooms[id] = record;
  let scene = generateRoomScene(id, i, opts);
  scene = scene.replace(
    '[sub_resource',
    '[ext_resource type="Script" path="res://scripts/world/CastleRoomFamilyDecor.gd" id="99_family"]\n\n[sub_resource',
  );
  scene += `\n[node name="CastleRoomFamilyDecor" type="Node2D" parent="."]\nscript = ExtResource("99_family")\nroom_id = "${id}"\n`;
  writeFileSync(join(game, 'scenes/rooms', id + '.tscn'), scene);
}
for (const id of Object.keys(before.rooms).filter((id) => !ids.includes(id)))
  assert.deepEqual(rooms.rooms[id], before.rooms[id]);
writeFileSync(join(game, 'data/rooms/rooms.json'), JSON.stringify(rooms, null, 2));
writeFileSync(
  join(game, 'data/visual/castle-room-families.json'),
  JSON.stringify({ version: 1, rooms: plans }, null, 2),
);
for (const name of ['CastleRoomFamilyDecor.gd', 'CastleRegionMasonry.gdshader', 'RoomTileMap.gd'])
  cpSync(
    join(repo, 'templates/godot-metroidvania/scripts/world', name),
    join(game, 'scripts/world', name),
  );
for (const [folder, name] of [
  ['scripts/test', 'CastleRoomFamilyValidation.gd'],
  ['scenes/test', 'CastleRoomFamilyValidation.tscn'],
])
  cpSync(join(repo, 'templates/godot-metroidvania', folder, name), join(game, folder, name));
const assetsReceipt = Object.fromEntries(
  Object.keys(assets).map((name) => [
    name + '.svg',
    createHash('sha256')
      .update(readFileSync(join(assetDir, name + '.svg')))
      .digest('hex'),
  ]),
);
writeFileSync(
  join(base, 'family-manifest.json'),
  JSON.stringify(
    {
      source,
      game,
      ids,
      plans,
      assets: assetsReceipt,
      preservedSiblingRooms: 32,
      productionApproved: false,
      scope:
        'Eight original room studies and twelve original modular SVG assets; candidate geometry and presentation, not completed reference-scale regions or accepted art.',
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ base, game, rooms: ids.length, assets: Object.keys(assets).length }));
