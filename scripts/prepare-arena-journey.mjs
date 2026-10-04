import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const source = resolve(process.argv[2]);
const base = resolve(process.argv[3]);
assert.match(base, /^E:[\\/]/i);
assert.ok(!existsSync(base), 'Preserve earlier candidates and evidence');
const dna = JSON.parse(readFileSync(join(source, 'game_dna.json'), 'utf8'));
assert.equal(dna.archetype, 'SIDE_VIEW_METROIDVANIA');
assert.ok(dna.identity.title.startsWith('Stormglass Reliquary'));
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const project = join(base, 'games/stormglass-castle');
mkdirSync(join(base, 'games'), { recursive: true });
cpSync(source, project, {
  recursive: true,
  filter: (path) => !['.godot', 'qa', 'reports'].includes(basename(path)),
});
const overlays = [
  'scripts/core/AudioManager.gd',
  'scripts/core/StudioRuntimeBridge.gd',
  'scripts/world/WorldManager.gd',
  'scripts/test/CastleJourneyValidation.gd',
  'scripts/test/AudioLifecycleValidation.gd',
  'scripts/test/CastleBacktrackingValidation.gd',
  'scenes/test/AudioLifecycleValidation.tscn',
  'scenes/test/CastleBacktrackingValidation.tscn',
];
for (const path of overlays)
  cpSync(join(root, 'templates/godot-metroidvania', path), join(project, path));
const route = JSON.parse(readFileSync(join(project, 'playtest_route.json'), 'utf8'));
assert.equal(route.transitions.length, 34, 'Use the accepted critical-route game as source');
const steps = [];
for (const step of route.transitions) {
  steps.push(step);
  if (['room_008', 'room_018', 'room_028'].includes(step.fromRoomId)) {
    steps.push({ fromRoomId: step.toRoomId, toRoomId: step.fromRoomId, requirements: [] });
    steps.push({ fromRoomId: step.fromRoomId, toRoomId: step.toRoomId, requirements: [] });
  }
}
assert.equal(steps.length, 40);
route.transitions = steps;
route.validationScope =
  'Critical victory route plus normal-input return through the first three cleared guardian arenas; final guardian save/load covered by separate controlled regression.';
writeFileSync(join(project, 'playtest_route.json'), JSON.stringify(route, null, 2));
const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const media = {};
function walk(path) {
  for (const entry of readdirSync(join(source, path), { withFileTypes: true })) {
    const file = join(path, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(png|wav|ogg)$/i.test(file)) {
      media[file] = sha(join(source, file));
      assert.equal(sha(join(project, file)), media[file]);
    }
  }
}
for (const path of ['assets', 'audio']) walk(path);
writeFileSync(
  join(base, 'provenance.json'),
  JSON.stringify({ source, overlays, mediaUnchanged: Object.keys(media).length, media }, null, 2),
);
console.log(
  JSON.stringify({ base, transitions: steps.length, mediaUnchanged: Object.keys(media).length }),
);
