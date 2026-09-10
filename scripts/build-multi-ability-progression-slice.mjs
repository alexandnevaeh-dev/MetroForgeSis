import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { GodotProjectAssembler } from '../packages/godot/dist/index.js';
import { generateWorldTopology, planVictoryRoute, validateMovementFeasibility, validateWorldReachability } from '../packages/procedural/dist/index.js';
import { buildMovementJson, movementFeasibilityStats } from '../packages/shared/dist/index.js';

const root = process.cwd();
const slug = process.env.METROFORGE_SLICE_SLUG || 'metroforge-multi-ability-progression';
const projectDir = join(root, 'GeneratedGames', slug);
const gameDna = {
  version: '0.1.0',
  archetype: 'SIDE_VIEW_METROIDVANIA',
  identity: {
    title: 'MetroForge Multi-Ability Progression Slice',
    tagline: 'Dash, ground slam, and phase progression proof.',
    genre: 'Metroidvania',
    subgenre: 'Action-Adventure',
    tone: 'industrial sci-fi',
    visualStyle: 'pixel art',
  },
  technical: { resolution: { width: 1920, height: 1080 }, tileSize: 32, targetPlaytimeHours: 0.5, difficulty: 'normal' },
  combat: { style: 'fast melee', meleeEnabled: true, rangedEnabled: false },
  movement: { walkSpeed: 200, runSpeed: 350, jumpHeight: 120, gravity: 980 },
  abilities: [
    { id: 'dash', name: 'Dash', category: 'movement', enabled: true },
    { id: 'ground_slam', name: 'Ground Slam', category: 'movement', enabled: true },
    { id: 'phase', name: 'Phase', category: 'movement', enabled: true },
  ],
  world: { biomeCount: 1, roomCount: 12 },
  narrative: { premise: 'Recover the Ground Slam and Phase modules to reach the reactor guardian.', protagonist: 'The Wanderer', centralConflict: 'Restore a sealed industrial transit route.' },
  seed: 314165,
  profile: 'VISUAL_VERTICAL_SLICE',
};

rmSync(projectDir, { recursive: true, force: true });
mkdirSync(projectDir, { recursive: true });
writeFileSync(join(projectDir, 'game_dna.json'), JSON.stringify(gameDna, null, 2));
const generated = spawnSync(process.execPath, [
  join(root, 'apps', 'cli', 'dist', 'index.js'), 'generate', slug,
  '--profile', 'VISUAL_VERTICAL_SLICE', '--mode', 'LOCAL_ONLY', '--seed', '314165',
  '--external-visual-pack', 'industrial-transit', '--skip-export', '--skip-runtime-validation', '--fresh',
], { cwd: root, stdio: 'inherit', windowsHide: true });
if (generated.status !== 0 && !existsSync(join(projectDir, 'project.godot'))) {
  process.exit(generated.status ?? 1);
}

const readJson = (relative) => JSON.parse(readFileSync(join(projectDir, relative), 'utf8'));
const compactTopology = generateWorldTopology({
  seed: gameDna.seed,
  roomCount: 8,
  biomeCount: 1,
  abilities: ['dash', 'ground_slam', 'phase'],
  bossCount: 1,
  profile: 'TINY_TEST',
});
const worldGraph = compactTopology.worldGraph;
const progressionGraph = compactTopology.progressionGraph;
const roomIds = compactTopology.roomIds;
const phaseGate = worldGraph.edges.find((edge) => edge.requirements.includes('phase'));
if (!phaseGate) throw new Error('Generated slice has no phase gate');
phaseGate.requirements = ['phase', 'ground_slam'];
phaseGate.transition = 'right';
const phaseProgressionEdge = progressionGraph.edges.find((edge) => edge.requires.includes('phase'));
if (!phaseProgressionEdge) throw new Error('Generated slice has no phase progression edge');
phaseProgressionEdge.requires = ['phase', 'ground_slam'];
writeFileSync(join(projectDir, 'multi_ability_progression_graph.json'), JSON.stringify({ worldGraph, progressionGraph, roomIds }, null, 2));
writeFileSync(join(projectDir, 'world_graph.json'), JSON.stringify(worldGraph, null, 2));
writeFileSync(join(projectDir, 'data', 'world', 'world_graph.json'), JSON.stringify(worldGraph, null, 2));
writeFileSync(join(projectDir, 'progression_graph.json'), JSON.stringify(progressionGraph, null, 2));

const gameContent = {
  enemies: readJson('data/enemies/enemies.json').enemies,
  bosses: readJson('data/bosses/bosses.json').bosses,
  quests: readJson('data/quests/quests.json').quests,
  items: readJson('data/items/items.json').items,
  npcs: readJson('data/npcs/npcs.json').npcs,
  dialogues: readJson('data/dialogues/dialogues.json').dialogues,
  shops: readJson('data/shops/shops.json').shops,
};
for (const boss of gameContent.bosses) {
  if (boss.id === 'boss_final') boss.arenaRoomId = roomIds.at(-1);
}
writeFileSync(join(projectDir, 'game_dna.json'), JSON.stringify({ ...gameDna, profile: 'TINY_TEST', world: { ...gameDna.world, roomCount: roomIds.length, biomeCount: 1 } }, null, 2));
writeFileSync(join(projectDir, 'data', 'bosses', 'bosses.json'), JSON.stringify({ bosses: gameContent.bosses }, null, 2));
writeFileSync(join(projectDir, 'data', 'abilities', 'abilities.json'), JSON.stringify({ abilities: gameDna.abilities }, null, 2));
const assembler = new GodotProjectAssembler();
const targets = roomIds;
rmSync(join(projectDir, 'scenes', 'rooms'), { recursive: true, force: true });
rmSync(join(projectDir, 'data', 'rooms', 'rooms.json'), { force: true });
const recompilation = assembler.recompileRooms({ outputDir: projectDir, gameDna, worldGraph, gameContent, roomIds, targetRoomIds: targets });
if (!recompilation.success) throw new Error(`Room recompilation failed: ${recompilation.errors.join('; ')}`);
const route = planVictoryRoute(worldGraph, { victoryRoomId: roomIds.at(-1), victoryBossId: 'boss_final' });
const feasibility = validateMovementFeasibility(worldGraph, movementFeasibilityStats(buildMovementJson(gameDna.movement)));
const reachability = validateWorldReachability(worldGraph, new Set());
writeFileSync(
  join(projectDir, 'playtest_route.json'),
  JSON.stringify(
    {
      ...route,
      persona: { id: 'multi_ability_runner', displayName: 'Multi Ability Runner', walkTimeoutSec: 8, bossAttackTimeoutSec: 45, collectAllPickups: true },
      movementFeasibility: feasibility,
    },
    null,
    2,
  ),
);
const report = {
  abilities: ['dash', 'ground_slam', 'phase'],
  abilityA: 'ground_slam',
  abilityB: 'phase',
  pickupRooms: Object.fromEntries(worldGraph.nodes.filter((node) => node.metadata?.grantsAbilities?.length).map((node) => [node.id, node.metadata.grantsAbilities])),
  gatedEdges: worldGraph.edges.filter((edge) => edge.requirements.length).map((edge) => ({ from: edge.from, to: edge.to, requirements: edge.requirements, transition: edge.transition })),
  combinedGate: { from: phaseGate.from, to: phaseGate.to, requirements: phaseGate.requirements, transition: phaseGate.transition },
  recompiledRooms: recompilation.recompiled,
  route,
  movementFeasibility: feasibility,
  reachability,
};
writeFileSync(join(projectDir, 'multi_ability_progression_report.json'), JSON.stringify(report, null, 2));
if (!route.reachable || !reachability.reachable || !feasibility.feasible) process.exitCode = 1;
console.log(JSON.stringify(report, null, 2));
