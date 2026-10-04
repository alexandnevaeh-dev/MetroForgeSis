import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recompileRooms } from '../packages/godot/dist/room-assembler.js';
import { validateMovementFeasibility } from '../packages/procedural/dist/index.js';
import { buildMovementJson, movementFeasibilityStats } from '../packages/shared/dist/index.js';

// Isolated candidate only. Preserve approved artwork, audio and all unrelated rooms.
const source = resolve(process.argv[2]);
const base = resolve(process.argv[3]);
assert.match(base, /^E:[\\/]/i);
assert.ok(!existsSync(base), 'Candidate destination must be new');
const project = join(base, 'games/stormglass-castle');
const read = (root, path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const dna = read(source, 'game_dna.json');
assert.equal(dna.archetype, 'SIDE_VIEW_METROIDVANIA');
assert.ok(dna.identity.title.startsWith('Stormglass Reliquary'));
const graph = read(source, 'world_graph.json');
const gate = graph.edges.find((edge) => edge.from === 'room_029' && edge.to === 'room_030');
assert.deepEqual(gate?.requirements, ['ground_slam']);
assert.ok(['right', 'down'].includes(gate.transition));
gate.transition = 'down';
mkdirSync(join(base, 'games'), { recursive: true });
cpSync(source, project, {
  recursive: true,
  filter: (path) => !['.godot', 'qa', 'reports'].includes(basename(path)),
});
const content = {};
for (const key of ['enemies', 'bosses', 'npcs', 'items'])
  content[key] = read(project, `data/${key}/${key}.json`)[key];
const compiled = recompileRooms({
  outputDir: project,
  gameDna: dna,
  worldGraph: graph,
  gameContent: content,
  targetRoomIds: ['room_029', 'room_030'],
});
assert.equal(compiled.success, true, JSON.stringify(compiled.errors));
for (const path of ['world_graph.json', 'data/world/world_graph.json']) {
  writeFileSync(join(project, path), JSON.stringify(graph, null, 2));
}
const route = read(project, 'playtest_route.json');
route.movementFeasibility = validateMovementFeasibility(
  graph,
  movementFeasibilityStats(buildMovementJson(dna)),
);
assert.equal(route.movementFeasibility.feasible, true, JSON.stringify(route.movementFeasibility));
writeFileSync(join(project, 'playtest_route.json'), JSON.stringify(route, null, 2));
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
for (const path of [
  'scripts/test/PlaytestAgent.gd',
  'scripts/test/CastleJourneyValidation.gd',
  'scripts/test/UpDoorIntentTest.gd',
  'scripts/test/CastleMapValidation.gd',
  'scenes/test/CastleJourneyValidation.tscn',
  'scenes/world/WeakFloor.tscn',
  'scripts/world/WorldManager.gd',
  'scripts/world/RoomTransition.gd',
]) {
  cpSync(join(root, 'templates/godot-metroidvania', path), join(project, path));
}
function hashes(root, prefix) {
  const entries = [];
  const walk = (path) => {
    for (const entry of readdirSync(join(root, path), { withFileTypes: true })) {
      const file = `${path}/${entry.name}`;
      if (entry.isDirectory()) walk(file);
      else
        entries.push([
          file,
          createHash('sha256')
            .update(readFileSync(join(root, file)))
            .digest('hex'),
        ]);
    }
  };
  for (const path of prefix) walk(path);
  return Object.fromEntries(entries);
}
const preserved = hashes(source, ['assets', 'audio', 'music']);
assert.deepEqual(hashes(project, ['assets', 'audio', 'music']), preserved);
writeFileSync(
  join(base, 'candidate-preparation.json'),
  JSON.stringify(
    {
      source,
      project,
      compiled,
      movementFeasibility: route.movementFeasibility,
      preservedMedia: preserved,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    project,
    recompiled: compiled.recompiled,
    preservedMediaFiles: Object.keys(preserved).length,
    feasible: true,
  }),
);
