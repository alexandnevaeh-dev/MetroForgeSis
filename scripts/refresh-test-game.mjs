import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  copyFileSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { join, resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { GodotProjectAssembler } from '../packages/godot/dist/index.js';
import {
  generateTopDownWorld,
  generateWorldTopology,
  generateGameContent,
  generateTrackerPattern,
  synthesizeBiomeLoop,
  exportPatternToMidi,
} from '../packages/procedural/dist/index.js';
import { GameDNASchema, ProjectMetadataSchema } from '../packages/schemas/dist/index.js';
import { PROFILE_DEFAULTS, PRODUCT } from '../packages/shared/dist/index.js';
import {
  extractSheetFramePng,
  generateTopDownPlayerSheet,
  generateTopDownWoodlandTileset,
  generateStormglassTileset,
  generateStormglassBackground,
  generateStormglassEnemySheet,
  generateStormglassNpcSheet,
  generateStormglassProp,
  generatePropSprite,
  stormglassEnemyFrameCount,
  stormglassNpcFrameCount,
  topDownPlayerFrameCount,
  TOP_DOWN_FACINGS,
} from '../packages/assets/dist/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sets = {
  topdown: { archetype: 'TOP_DOWN_ACTION_ADVENTURE', title: 'Ashen Abbey - Top-down Test' },
  metroidvania: {
    archetype: 'SIDE_VIEW_METROIDVANIA',
    title: 'Stormglass Reliquary - Side-view Test',
  },
};

const STORMGLASS_ROOMS = [
  ['Castle Gate', 'tutorial'], ['Grand Hall', 'combat'], ['Moonlit Gallery', 'traversal'],
  ['Dash Reliquary', 'ability_shrine'], ['Upper Hall', 'combat'], ['Clocktower Shaft', 'traversal'],
  ['Candle Alcove', 'save'], ['Secret Balcony', 'secret'], ['Bell Warden', 'miniboss'],
  ['Castle Floodgate', 'ability_gate'],
  ['Flooded Antechamber', 'tutorial'], ['Drowned Hall', 'combat'], ['Current Tunnel', 'traversal'],
  ['Double-Jump Font', 'ability_shrine'], ['Sunken Library', 'combat'], ['Pressure Shaft', 'traversal'],
  ['Water Shrine', 'save'], ['Under-Arch Cache', 'secret'], ['Drowned Guardian', 'miniboss'],
  ['Floodgate Ascent', 'ability_gate'],
  ['Collapsed Vestibule', 'tutorial'], ['Archive Gallery', 'combat'], ['Collapse Shaft', 'traversal'],
  ['Slam Reliquary', 'ability_shrine'], ['Glyph Hall', 'combat'], ['Puzzle Chamber', 'ability_gate'],
  ['Reliquary Rest', 'save'], ['Glyph Wall Secret', 'secret'], ['Sentinel Dais', 'miniboss'],
  ['Ruins Lift', 'ability_gate'],
  ['Frozen Approach', 'tutorial'], ['Storm Bridge', 'combat'], ['Frozen Clock Shaft', 'traversal'],
  ['Air-Dash Belfry', 'ability_shrine'], ['Wind Corridor', 'combat'], ['Broken Bell Rise', 'traversal'],
  ['Bell Alcove', 'save'], ['Frost Cavern Secret', 'secret'], ['Tempest Abbot Arena', 'boss'],
  ['Restored Reliquary', 'transition'],
];

function applyStormglassBlueprint(topology, gameContent) {
  if (topology.roomIds.length !== STORMGLASS_ROOMS.length)
    throw new Error(`Stormglass blueprint requires ${STORMGLASS_ROOMS.length} rooms`);
  const grants = new Map([
    ['room_003', ['dash']],
    ['room_013', ['double_jump', 'wall_slide', 'wall_jump']],
    ['room_023', ['ground_slam']],
    ['room_033', ['air_dash']],
  ]);
  const arenaRooms = new Map([
    ['room_008', { id: 'boss_000', name: 'Bell Warden' }],
    ['room_018', { id: 'boss_001', name: 'Drowned Guardian' }],
    ['room_028', { id: 'boss_002', name: 'Reliquary Sentinel' }],
    ['room_038', { id: 'boss_final', name: 'Tempest Abbot' }],
  ]);
  const nodesById = new Map(topology.worldGraph.nodes.map((node) => [node.id, node]));
  for (let index = 0; index < STORMGLASS_ROOMS.length; index++) {
    const id = topology.roomIds[index];
    const node = nodesById.get(id);
    if (!node) throw new Error(`Stormglass blueprint room missing from topology: ${id}`);
    const [label, archetype] = STORMGLASS_ROOMS[index];
    node.label = label;
    node.metadata.archetype = archetype;
    node.metadata.roomPurpose = archetype;
    node.metadata.grantsAbilities = grants.get(id) ?? [];
    delete node.metadata.bossArena;
    delete node.metadata.zoneBossOf;
    if (arenaRooms.has(id)) {
      node.metadata.bossArena = true;
      node.metadata.zoneBossOf = `zone_${Math.floor(index / 10)}`;
    }
  }

  // Authored critical routes keep secrets off the mandatory spine and reconnect each branch in
  // two transitions. This avoids the generic graph's unrelated vertical/shortcut edges forcing
  // duplicate or unreachable doors into compact production rooms.
  const criticalPaths = [
    [0, 1, 2, 3, 4, 5, 6, 8, 9, 10],
    [10, 11, 12, 13, 14, 15, 16, 18, 19, 20],
    [20, 21, 22, 23, 24, 25, 26, 28, 29, 30],
    [30, 31, 32, 33, 34, 35, 36, 38, 39],
  ];
  const gateRequirements = new Map([
    ['room_009>room_010', 'dash'],
    ['room_019>room_020', 'double_jump'],
    ['room_029>room_030', 'ground_slam'],
    ['room_036>room_038', 'air_dash'],
    ['room_025>room_027', 'ground_slam'],
  ]);
  const authoredEdges = [];
  const addEdge = (fromIndex, toIndex, optional = false, bidirectional = true, transition) => {
    const from = topology.roomIds[fromIndex];
    const to = topology.roomIds[toIndex];
    const requirement = gateRequirements.get(`${from}>${to}`);
    authoredEdges.push({
      id: `stormglass_${String(authoredEdges.length).padStart(3, '0')}`,
      from,
      to,
      requirements: requirement ? [requirement] : [],
      optional,
      bidirectional,
      kind: optional ? 'shortcut' : 'normal',
      ...(transition || requirement ? { transition: transition ?? 'right' } : {}),
      metadata: optional ? { loopType: 'secret_return' } : {},
    });
  };
  for (const path of criticalPaths) {
    for (let index = 0; index < path.length - 1; index++) addEdge(path[index], path[index + 1]);
  }
  for (const [entry, secret, exit] of [[5, 7, 8], [15, 17, 18], [25, 27, 28], [35, 37, 36]]) {
    // One-way drops make the optional branch legible and prevent a third reciprocal doorway
    // from turning into an unsuitable ceiling exit in the compact room on the return path.
    addEdge(entry, secret, true, false, 'down');
    addEdge(secret, exit, true, true, 'right');
  }
  topology.worldGraph.edges = authoredEdges;

  const generatedBosses = new Map(gameContent.bosses.map((boss) => [boss.id, boss]));
  const fallbackGuardians = gameContent.bosses.filter((boss) => boss.id !== 'boss_final');
  gameContent.bosses = [...arenaRooms.entries()].map(([arenaRoomId, identity], index) => {
    const boss = generatedBosses.get(identity.id) ?? fallbackGuardians[index] ?? generatedBosses.get('boss_final');
    if (!boss) throw new Error(`Stormglass boss definition missing: ${identity.id}`);
    return {
      ...boss,
      id: identity.id,
      name: identity.name,
      arenaRoomId,
      rewardAbilityId: undefined,
      lore: identity.id === 'boss_final'
        ? 'The last keeper of the drowned monastery, sealed inside a stormglass reliquary and bound to the broken weather bells.'
        : `${identity.name}, guardian of one broken weather seal.`,
    };
  });
  const sanctuaryRooms = ['room_006', 'room_016', 'room_026', 'room_036'];
  for (let index = 0; index < gameContent.npcs.length; index++) {
    gameContent.npcs[index].roomId = sanctuaryRooms[index % sanctuaryRooms.length];
  }

  // Stormglass is one interconnected world rather than four disconnected asset buckets. The
  // roster keeps twenty combat identities and four regional variations of each silhouette,
  // while every enemy remains eligible throughout the same continuous monastery biome.
  const stormglassEnemyNames = [
    'Choir Husk', 'Drowned Cantor', 'Archive Chorister', 'Rime Cantor',
    'Lancet Knight', 'Brine Lancer', 'Reliquary Halberdier', 'Frostbound Knight',
    'Censer Bat', 'Tidewing', 'Glyphwing', 'Storm Bellwing',
    'Glassbound Acolyte', 'Tidebound Penitent', 'Dustbound Scribe', 'Static Acolyte',
    'Bell Rat', 'Silt Crawler', 'Relic Gnawer', 'Rime Gearling',
  ];
  if (gameContent.enemies.length < 20)
    throw new Error(`Stormglass requires 20 enemy definitions; generated ${gameContent.enemies.length}`);
  for (let index = 0; index < gameContent.enemies.length; index++) {
    const name = stormglassEnemyNames[index];
    if (!name) throw new Error(`Stormglass enemy ${index} has no authored identity`);
    gameContent.enemies[index].name = name;
    gameContent.enemies[index].biomeId = 'biome_0';
  }

  topology.progressionGraph.endNodeId = 'room_038';
  for (const node of topology.progressionGraph.nodes) {
    if (node.type === 'boss') {
      node.id = 'room_038';
      node.label = 'Tempest Abbot';
    }
  }
  topology.progressionGraph.criticalPath = topology.progressionGraph.criticalPath.map((id) =>
    id === 'room_039' ? 'room_038' : id);
  for (const edge of topology.progressionGraph.edges) {
    if (edge.to === 'room_039') edge.to = 'room_038';
  }
}

export function refreshTestGame({ genre, source, seed = 20260929, layoutStyle, promote = true }) {
  const set = sets[genre];
  if (!set) throw new Error('Choose topdown or metroidvania');
  if (layoutStyle && !(
    (genre === 'topdown' && layoutStyle === 'woodland_ruins') ||
    (genre === 'metroidvania' && layoutStyle === 'stormglass_reliquary')
  )) throw new Error('Layout style does not belong to the selected game set');
  const sourceRoot = resolve(source);
  const dna = JSON.parse(readFileSync(join(sourceRoot, 'game_dna.json'), 'utf8'));
  if (dna.archetype !== set.archetype)
    throw new Error('Asset-source genre does not match the test-game set');
  if (!existsSync(join(sourceRoot, 'assets'))) throw new Error('Source assets are missing');
  const setRoot = join(root, 'GeneratedGames', 'test-games', genre);
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const stage = join(setRoot, 'candidate-' + stamp);
  const current = join(setRoot, 'current');
  const backup = join(setRoot, 'backups', stamp);
  // Every rename stays inside this genre's generated test directory.
  for (const path of [stage, current, backup]) {
    const rel = relative(setRoot, path);
    if (!rel || rel.startsWith('..') || isAbsolute(rel))
      throw new Error('Invalid test output path');
  }
  mkdirSync(setRoot, { recursive: true });
  // Retain the set's own art scale, palette, movement and character identity.
  // A 32px Metroidvania atlas must not be attached to a generic 16px starter.
  const stormglass = genre === 'metroidvania' && layoutStyle === 'stormglass_reliquary';
  const profile = stormglass ? 'MEDIUM' : 'TINY_TEST',
    defaults = PROFILE_DEFAULTS[profile];
  const stormglassBiomeCount = 1;
  const stormglassRoomCount = 40;
  const stormglassBossCount = 4;
  const stormglassAbilityIds = ['dash', 'double_jump', 'wall_slide', 'wall_jump', 'air_dash', 'ground_slam'];
  const sourceAbilities = new Map(dna.abilities.map((ability) => [ability.id, ability]));
  const abilities = stormglass
    ? stormglassAbilityIds.map((id) => sourceAbilities.get(id) ?? {
      id,
      name: id.split('_').map((word) => word[0].toUpperCase() + word.slice(1)).join(' '),
      category: 'movement',
      enabled: true,
    })
    : dna.abilities;
  const gameDna = GameDNASchema.parse({
    ...dna,
    seed,
    profile,
    identity: {
      ...dna.identity,
      title: set.title,
      ...(stormglass ? {
        tagline: 'Restore the weather seals of a drowned cliff monastery',
        tone: 'melancholic heroic',
        visualStyle: 'modern HD pixel art',
      } : {}),
    },
    narrative: stormglass ? {
      ...dna.narrative,
      premise: 'A masked Veilblade crosses rain-soaked cloisters, prism aqueducts, and the starless belfry to restore ancient weather seals. Indigo masonry, teal rain light, amber cloth, and fractured stained glass define every room.',
      protagonist: 'The Veilblade',
      centralConflict: 'Restore the weather seals before the reliquary is swallowed by the permanent storm',
    } : dna.narrative,
    movement: stormglass ? {
      ...dna.movement,
      jumpHeight: 160,
      walkSpeed: 220,
      runSpeed: 380,
    } : dna.movement,
    abilities,
    world: {
      ...dna.world,
      biomeCount: stormglass ? stormglassBiomeCount : defaults.biomes,
      roomCount: stormglass ? stormglassRoomCount : defaults.roomsMin,
    },
  });
  const topDown =
    genre === 'topdown'
      ? generateTopDownWorld({ seed, profile, tileSize: gameDna.technical.tileSize, layoutStyle })
      : null;
  const topology = topDown ?? (stormglass
    ? generateWorldTopology({
      seed,
      profile,
      roomCount: stormglassRoomCount,
      biomeCount: stormglassBiomeCount,
      bossCount: stormglassBossCount,
      abilities: stormglassAbilityIds,
    })
    : generateWorldTopology({
      seed,
      profile,
      roomCount: defaults.roomsMin,
      biomeCount: defaults.biomes,
      bossCount: defaults.bosses,
      abilities: gameDna.abilities.filter((a) => a.enabled).map((a) => a.id),
    }));
  const gameContent = generateGameContent(
    gameDna,
    profile,
    seed,
    topology.roomIds.at(-1),
    topology.roomIds,
  );
  if (stormglass) applyStormglassBlueprint(topology, gameContent);
  // The Stormglass atlases are written immediately after assembly, but room assembly must know
  // all four files are part of the candidate before it chooses between TileMap geometry and the
  // generic ColorRect fallback. Previously biome 3 was the only atlas absent from the base
  // template, so rooms 30-39 (including the final boss) silently became prototype fallback rooms.
  const promisedTextureFiles = stormglass
    ? new Set(Array.from(
        { length: gameDna.world.biomeCount },
        (_, biomeIndex) => `assets/tilesets/biome_${biomeIndex}/source.png`,
      ))
    : undefined;
  const result = new GodotProjectAssembler().assemble({
    outputDir: stage,
    gameDna,
    ...topology,
    overworld: topDown?.overworld,
    gameContent,
    textureFiles: promisedTextureFiles,
  });
  const now = new Date().toISOString();
  writeFileSync(join(stage, 'game_dna.json'), JSON.stringify(gameDna, null, 2));
  writeFileSync(
    join(stage, 'project.json'),
    JSON.stringify(
      ProjectMetadataSchema.parse({
        projectId: 'test-' + genre + '-' + stamp,
        slug: 'current-' + genre,
        prompt: gameDna.narrative.premise,
        seed,
        profile,
        mode: 'LOCAL_ONLY',
        createdAt: now,
        lastGeneratedAt: now,
        gameDnaVersion: gameDna.version,
        generatorVersion: PRODUCT.generatorVersion,
        archetype: set.archetype,
        engine: 'godot',
      }),
      null,
      2,
    ),
  );
  if (!result.success) throw new Error(JSON.stringify(result));
  const assets = [];
  function recordAsset(name, to) {
    const normalized = name.replaceAll('\\', '/');
    const record = {
      path: normalized,
      sha256: createHash('sha256').update(readFileSync(to)).digest('hex'),
    };
    const existing = assets.findIndex((asset) => asset.path === normalized);
    if (existing >= 0) assets[existing] = record;
    else assets.push(record);
  }
  function copyAssets(dir, prefix = '') {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error('Asset source must not contain links');
      const name = join(prefix, entry.name),
        from = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '.godot') copyAssets(from, name);
      } else if (entry.isFile() && !entry.name.endsWith('.import')) {
        const to = join(stage, name);
        mkdirSync(dirname(to), { recursive: true });
        copyFileSync(from, to);
        recordAsset(name, to);
      }
    }
  }
  // Runtime audio lives beside assets and must stay with its own genre.
  for (const folder of ['assets', 'audio', 'music']) {
    if (existsSync(join(sourceRoot, folder))) copyAssets(join(sourceRoot, folder), folder);
  }
  // Multi-biome profiles may still request a fourth regional score. The current Stormglass
  // direction is one continuous biome, so this branch remains dormant for its build.
  if (stormglass && gameDna.world.biomeCount > 3) {
    const stormIceTheme = {
      biomeId: 'biome_3',
      mood: 'tense',
      tempo: 'medium',
      key: 'Em',
    };
    const stormIcePattern = generateTrackerPattern(stormIceTheme, seed + 303);
    const stormIceMusic = join(stage, 'audio', 'music', 'biome_3.wav');
    const stormIceMidi = join(stage, 'audio', 'midi', 'biome_3.mid');
    mkdirSync(dirname(stormIceMusic), { recursive: true });
    mkdirSync(dirname(stormIceMidi), { recursive: true });
    writeFileSync(stormIceMusic, synthesizeBiomeLoop(stormIceTheme, seed + 3303));
    writeFileSync(stormIceMidi, exportPatternToMidi(stormIcePattern, 'storm_ice_heights'));
    recordAsset('audio/music/biome_3.wav', stormIceMusic);
    recordAsset('audio/midi/biome_3.mid', stormIceMidi);
  }
  if (genre === 'topdown' && layoutStyle === 'woodland_ruins') {
    const terrainAtlas = join(stage, 'assets', 'tilesets', 'biome_0', 'source.png');
    writeFileSync(terrainAtlas, generateTopDownWoodlandTileset());
    recordAsset('assets/tilesets/biome_0/source.png', terrainAtlas);
    const terrainMetadata = join(stage, 'assets', 'tilesets', 'biome_0', 'terrain.json');
    const terrain = JSON.parse(readFileSync(terrainMetadata, 'utf8'));
    terrain.roles = terrain.roles.filter((role) => role.role !== 'path');
    terrain.roles.push({ role: 'path', col: 3, row: 0, terrainSet: 0, terrain: 1, peering: {} });
    writeFileSync(terrainMetadata, JSON.stringify(terrain, null, 2));
    recordAsset('assets/tilesets/biome_0/terrain.json', terrainMetadata);
    const actions = ['idle', 'walk', 'run', 'attack', 'hurt', 'death'];
    for (const action of actions) {
      for (const facing of TOP_DOWN_FACINGS) {
        const name = `assets/characters/player_${action}_${facing}.png`;
        const to = join(stage, name);
        mkdirSync(dirname(to), { recursive: true });
        writeFileSync(to, generateTopDownPlayerSheet(action, facing));
        recordAsset(name, to);
      }
    }
    const southIdle = generateTopDownPlayerSheet('idle', 'S');
    const playerStill = join(stage, 'assets', 'characters', 'player.png');
    writeFileSync(
      playerStill,
      extractSheetFramePng(southIdle, 64, 64, topDownPlayerFrameCount('idle'), 0),
    );
    recordAsset('assets/characters/player.png', playerStill);
  }
  if (stormglass) {
    const material = 'assets/architecture/stormglass/masonry-fill-v1.png';
    const materialSource = join(root, 'templates', 'godot-metroidvania', material);
    if (!existsSync(materialSource)) throw new Error('The current castle material is missing.');
    mkdirSync(dirname(join(stage, material)), { recursive: true });
    copyFileSync(materialSource, join(stage, material));
    recordAsset(material, join(stage, material));
    // Source preservation intentionally copies the previous candidate's assets after assembly.
    // Re-author the common pickup here so an older cyan debug-bar sprite cannot survive refresh.
    const pickupPath = join(stage, 'assets', 'props', 'interact', 'pickup.png');
    mkdirSync(dirname(pickupPath), { recursive: true });
    writeFileSync(pickupPath, generatePropSprite({
      width: 32,
      height: 32,
      fill: '#d6b45a',
      accent: '#47e6df',
      family: 'pickup',
      seed,
    }));
    recordAsset('assets/props/interact/pickup.png', pickupPath);
    for (const entry of readdirSync(join(stage, 'assets', 'characters'), { withFileTypes: true })) {
      if (entry.isFile() && entry.name.startsWith('player_') && !entry.name.endsWith('.import'))
        unlinkSync(join(stage, 'assets', 'characters', entry.name));
    }
    const aliases = {
      idle: 'idle', walk: 'walk', run: 'run', jump_start: 'jump_start', jump: 'jump', fall: 'fall',
      land: 'land', dash: 'dash', air_dash: 'dash', double_jump: 'jump', wall_slide: 'fall',
      wall_jump: 'jump', attack: 'attack', attack_2: 'attack', attack_3: 'attack', hurt: 'hurt',
      death: 'death', ground_slam_start: 'jump_start', ground_slam_fall: 'fall',
      ground_slam_impact: 'land', grapple: 'attack', phase: 'dash', respawn: 'idle',
      interact: 'idle', ability_acquire: 'idle', swim: 'walk', swim_idle: 'idle',
    };
    const authoredRoot = join(root, 'packages', 'assets', 'authored', 'stormglass-veilblade');
    const authoredActions = {
      idle: { file: 'veilblade-idle-v2.png', frameCount: 8 },
      walk: { file: 'veilblade-walk-v2.png', frameCount: 8 },
      run: { file: 'veilblade-run-v2.png', frameCount: 8 },
      jump_start: { file: 'veilblade-jump-start-v2.png', frameCount: 2 },
      jump: { file: 'veilblade-jump-v2.png', frameCount: 3 },
      fall: { file: 'veilblade-fall-v2.png', frameCount: 2 },
      land: { file: 'veilblade-land-v2.png', frameCount: 1 },
      dash: { file: 'veilblade-dash-v2.png', frameCount: 8 },
      attack: { file: 'veilblade-attack-v2.png', frameCount: 8 },
      hurt: { file: 'veilblade-hurt-v2.png', frameCount: 8 },
      death: { file: 'veilblade-death-v2.png', frameCount: 8 },
    };
    for (const { file } of Object.values(authoredActions)) {
      if (!existsSync(join(authoredRoot, file)))
        throw new Error(`Stormglass authored animation is missing: ${file}`);
    }
    for (const [name, action] of Object.entries(aliases)) {
      const relativeName = `assets/characters/player_${name}.png`;
      const to = join(stage, relativeName);
      copyFileSync(join(authoredRoot, authoredActions[action].file), to);
      recordAsset(relativeName, to);
    }
    const still = extractSheetFramePng(
      readFileSync(join(authoredRoot, authoredActions.idle.file)),
      64,
      64,
      authoredActions.idle.frameCount,
      0,
    );
    writeFileSync(join(stage, 'assets', 'characters', 'player.png'), still);
    recordAsset('assets/characters/player.png', join(stage, 'assets', 'characters', 'player.png'));
    const looped = new Set(['idle', 'walk', 'run', 'swim', 'swim_idle']);
    const metadata = Object.fromEntries(Object.entries(aliases).map(([name, action]) => [name, {
      frameCount: authoredActions[action].frameCount,
      fps: name === 'run' ? 16 : name.startsWith('attack') ? 18 : 12,
      loop: looped.has(name),
      ...(name.startsWith('attack') ? { attackTiming: { activeStart: 2, activeEnd: 5, recoveryEnd: 7, comboCancelOpenFrame: 6 } } : {}),
    }]));
    const metadataPath = join(stage, 'assets', 'characters', 'player_animations.json');
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    recordAsset('assets/characters/player_animations.json', metadataPath);
    for (let biomeIndex = 0; biomeIndex < gameDna.world.biomeCount; biomeIndex++) {
      mkdirSync(join(stage, 'assets', 'tilesets', `biome_${biomeIndex}`), { recursive: true });
      mkdirSync(join(stage, 'assets', 'backgrounds', `biome_${biomeIndex}`), { recursive: true });
    }
    for (const biome of readdirSync(join(stage, 'assets', 'tilesets'), { withFileTypes: true })) {
      if (!biome.isDirectory() || !biome.name.startsWith('biome_')) continue;
      const atlas = join(stage, 'assets', 'tilesets', biome.name, 'source.png');
      const biomeIndex = Number(biome.name.slice('biome_'.length)) || 0;
      writeFileSync(atlas, generateStormglassTileset(biomeIndex));
      recordAsset(`assets/tilesets/${biome.name}/source.png`, atlas);
    }
    const backgroundLayers = ['far', 'mid', 'near', 'foreground', 'overlay'];
    for (const biome of readdirSync(join(stage, 'assets', 'backgrounds'), { withFileTypes: true })) {
      if (!biome.isDirectory() || !biome.name.startsWith('biome_')) continue;
      const biomeIndex = Number(biome.name.slice('biome_'.length)) || 0;
      for (const layer of backgroundLayers) {
        const relativeName = `assets/backgrounds/${biome.name}/${layer}.png`;
        const to = join(stage, relativeName);
        writeFileSync(to, generateStormglassBackground(layer, biomeIndex));
        recordAsset(relativeName, to);
      }
    }
    const environmentRoot = join(root, 'packages', 'assets', 'authored', 'stormglass-environment');
    // Always replace the inherited prototype save icon with the authored castle shrine.
    const shrineRelative = 'assets/props/interact/save_shrine.png';
    const shrinePath = join(stage, shrineRelative);
    copyFileSync(join(environmentRoot, 'gothic-props-v1', 'gothic_prop_06_candle_shrine.png'), shrinePath);
    recordAsset(shrineRelative, shrinePath);
    const shrineMetadataRelative = 'assets/props/interact/save_shrine_animations.json';
    const shrineMetadataPath = join(stage, shrineMetadataRelative);
    writeFileSync(shrineMetadataPath, JSON.stringify({ idle: {
      frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: true,
      pixelsPerUnit: 4 / 3, pivotX: 68.5 / 128, pivotY: 4 / 128,
    } }, null, 2));
    recordAsset(shrineMetadataRelative, shrineMetadataPath);
    const victoryRelative = 'assets/props/interact/victory.png';
    const victoryPath = join(stage, victoryRelative);
    copyFileSync(join(environmentRoot, 'gothic-props-v1', 'gothic_prop_11_reliquary_marker.png'), victoryPath);
    recordAsset(victoryRelative, victoryPath);
    const victoryMetadataRelative = 'assets/props/interact/victory_animations.json';
    const victoryMetadataPath = join(stage, victoryMetadataRelative);
    writeFileSync(victoryMetadataPath, JSON.stringify({ idle: {
      frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: true,
      pixelsPerUnit: 1.6, pivotX: 63.5 / 128, pivotY: 4 / 128,
    } }, null, 2));
    recordAsset(victoryMetadataRelative, victoryMetadataPath);
    const authoredArchitecture = {
      'assets/architecture/stormglass/grand_arch.png': 'stormglass-grand-arch-v1.png',
      'assets/architecture/stormglass/lancet_window.png': 'stormglass-lancet-window-v1.png',
      'assets/architecture/stormglass/platform.png': 'stormglass-platform-trim-v1.png',
      'assets/architecture/stormglass/floor_strip.png': 'stormglass-floor-strip-v1.png',
      'assets/backgrounds/stormglass/reliquary_interior.png': 'stormglass-reliquary-interior-panorama-v2.png',
      'assets/backgrounds/stormglass/drowned_monastery.png': 'stormglass-drowned-monastery-panorama-v1.png',
      'assets/backgrounds/stormglass/sunken_halls.png': 'stormglass-sunken-halls-panorama-v1.png',
      'assets/backgrounds/stormglass/ancient_ruins.png': 'stormglass-ancient-ruins-panorama-v1.png',
      'assets/backgrounds/stormglass/storm_ice_heights.png': 'stormglass-storm-ice-heights-panorama-v1.png',
    };
    for (const [relativeName, file] of Object.entries(authoredArchitecture)) {
      const from = join(environmentRoot, file);
      if (!existsSync(from)) throw new Error(`Stormglass authored environment asset is missing: ${file}`);
      const to = join(stage, relativeName);
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(from, to);
      recordAsset(relativeName, to);
    }
    const conditionDecalRoot = join(environmentRoot, 'condition-decals-v1');
    const conditionDecalFiles = readdirSync(conditionDecalRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.png'))
      .map((entry) => entry.name)
      .sort();
    if (conditionDecalFiles.length !== 16) {
      throw new Error(`Stormglass requires 16 authored condition decals; found ${conditionDecalFiles.length}`);
    }
    for (const file of conditionDecalFiles) {
      const relativeName = `assets/architecture/stormglass/conditions/${file}`;
      const from = join(conditionDecalRoot, file);
      const to = join(stage, relativeName);
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(from, to);
      recordAsset(relativeName, to);
    }
    const bossRoot = join(root, 'packages', 'assets', 'authored', 'stormglass-tempest-abbot');
    const authoredBossActions = {
      idle: 'idle',
      walk: 'locomotion',
      locomotion: 'locomotion',
      telegraph: 'telegraph',
      attack: 'slam',
      attack_projectile: 'projectile',
      attack_burst: 'burst',
      recovery: 'recovery',
      hurt: 'hurt',
      death: 'death',
    };
    for (const [runtimeAction, authoredAction] of Object.entries(authoredBossActions)) {
      const file = `tempest-abbot-${authoredAction}-v1.png`;
      const from = join(bossRoot, file);
      if (!existsSync(from)) throw new Error(`Stormglass Tempest Abbot animation is missing: ${file}`);
      const relativeName = `assets/bosses/boss_final_${runtimeAction}.png`;
      const to = join(stage, relativeName);
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(from, to);
      recordAsset(relativeName, to);
    }
    const bossStill = extractSheetFramePng(
      readFileSync(join(bossRoot, 'tempest-abbot-idle-v1.png')),
      160,
      160,
      8,
      0,
    );
    const bossRunRelativeName = 'assets/bosses/boss_final_run.png';
    const bossRunPath = join(stage, bossRunRelativeName);
    copyFileSync(join(bossRoot, 'tempest-abbot-locomotion-v1.png'), bossRunPath);
    recordAsset(bossRunRelativeName, bossRunPath);
    for (const relativeName of ['assets/bosses/boss_final.png', 'assets/bosses/boss_final_idle_pose.png']) {
      const to = join(stage, relativeName);
      writeFileSync(to, bossStill);
      recordAsset(relativeName, to);
    }
    const bossMetadata = Object.fromEntries([...Object.keys(authoredBossActions), 'run'].map((name) => [name, {
      frameCount: 8,
      fps: name === 'run' ? 12 : name === 'walk' || name === 'locomotion' ? 9 : name === 'idle' ? 6 : name === 'death' ? 8 : 11,
      loop: ['idle', 'walk', 'run', 'locomotion', 'telegraph'].includes(name),
    }]));
    const bossMetadataPath = join(stage, 'assets', 'bosses', 'boss_final_animations.json');
    writeFileSync(bossMetadataPath, JSON.stringify(bossMetadata, null, 2));
    recordAsset('assets/bosses/boss_final_animations.json', bossMetadataPath);
    const bossDataPath = join(stage, 'data', 'bosses', 'bosses.json');
    const bossData = JSON.parse(readFileSync(bossDataPath, 'utf8'));
    const finalBoss = bossData.bosses?.find((boss) => boss.id === 'boss_final');
    if (finalBoss) {
      finalBoss.name = 'Tempest Abbot';
      finalBoss.lore = 'The last keeper of the drowned monastery, sealed inside a stormglass reliquary and bound to the broken weather bells.';
      finalBoss.visualPrompt = 'richly detailed dark fantasy pixel art Tempest Abbot, blue-black storm priest armor, cyan stormglass core, gold reliquary halo, heavy robes and chained censer';
      writeFileSync(bossDataPath, JSON.stringify(bossData, null, 2));
    }
    const authoredGothicProps = [
      'gothic_prop_00_tall_lantern.png',
      'gothic_prop_01_altar_lantern.png',
      'gothic_prop_02_hanging_censer.png',
      'gothic_prop_03_broken_glass.png',
      'gothic_prop_04_reliquary_window.png',
      'gothic_prop_05_stone_pedestal.png',
      'gothic_prop_06_candle_shrine.png',
      'gothic_prop_07_wall_bracket.png',
      'gothic_prop_08_bell_fragment.png',
      'gothic_prop_09_banner.png',
      'gothic_prop_10_door_lintel.png',
      'gothic_prop_11_reliquary_marker.png',
    ];
    const authoredGothicPropRoot = join(environmentRoot, 'gothic-props-v1');
    for (let biomeIndex = 0; biomeIndex < gameDna.world.biomeCount; biomeIndex++) {
      for (let index = 0; index < 12; index++) {
        const relativeName = `assets/props/biome_${biomeIndex}/biome_${biomeIndex}_prop_${index}.png`;
        const to = join(stage, relativeName); mkdirSync(dirname(to), { recursive: true });
        if (biomeIndex === 0) {
          const from = join(authoredGothicPropRoot, authoredGothicProps[index]);
          if (!existsSync(from)) throw new Error(`Stormglass authored Gothic prop is missing: ${authoredGothicProps[index]}`);
          copyFileSync(from, to);
        } else {
          writeFileSync(to, generateStormglassProp(index, biomeIndex));
        }
        recordAsset(relativeName, to);
      }
    }
    const enemyActions = ['idle', 'walk', 'attack', 'hurt', 'death'];
    const authoredGothicEnemyRoot = join(root, 'packages', 'assets', 'authored', 'stormglass-gothic-enemies-v1');
    // Generate the complete content roster. The old four-enemy cap left later rooms pointing at
    // enemy_004+ sheets that did not exist, so those encounters rendered fallback rectangles.
    for (let enemyIndex = 0; enemyIndex < gameContent.enemies.length; enemyIndex++) {
      const id = `enemy_${String(enemyIndex).padStart(3, '0')}`;
      // Four stat/behavior variants share each authored silhouette family. Previously only the
      // first ID in each family (000/004/008/012/016) used the detailed Gothic art while the
      // other fifteen roster entries fell back to deliberately simple procedural placeholders.
      const authoredFamilyIndex = Math.min(16, Math.floor(enemyIndex / 4) * 4);
      const authoredFamilyId = `enemy_${String(authoredFamilyIndex).padStart(3, '0')}`;
      for (const action of enemyActions) {
        const relativeName = `assets/enemies/${id}_${action}.png`, to = join(stage, relativeName);
        const authored = join(authoredGothicEnemyRoot, `${authoredFamilyId}_${action}.png`);
        if (existsSync(authored)) copyFileSync(authored, to);
        else writeFileSync(to, generateStormglassEnemySheet(action, enemyIndex));
        recordAsset(relativeName, to);
      }
      const authoredStill = join(authoredGothicEnemyRoot, `${authoredFamilyId}.png`);
      const still = existsSync(authoredStill)
        ? readFileSync(authoredStill)
        : extractSheetFramePng(generateStormglassEnemySheet('idle', enemyIndex), 64, 64, stormglassEnemyFrameCount('idle'), 0);
      writeFileSync(join(stage, 'assets', 'enemies', `${id}.png`), still); recordAsset(`assets/enemies/${id}.png`, join(stage, 'assets', 'enemies', `${id}.png`));
      const runRelativeName = `assets/enemies/${id}_run.png`;
      const runPath = join(stage, runRelativeName);
      const authoredRunSource = join(authoredGothicEnemyRoot, `${authoredFamilyId}_walk.png`);
      if (existsSync(authoredRunSource)) copyFileSync(authoredRunSource, runPath);
      else writeFileSync(runPath, generateStormglassEnemySheet('walk', enemyIndex));
      recordAsset(runRelativeName, runPath);
      const meta = Object.fromEntries([...enemyActions, 'run'].map((action) => [action, {
        frameCount: action === 'run' ? 8 : stormglassEnemyFrameCount(action),
        fps: action === 'run' ? 13 : action === 'attack' ? 12 : 10,
        loop: action === 'idle' || action === 'walk' || action === 'run',
      }]));
      writeFileSync(join(stage, 'assets', 'enemies', `${id}_animations.json`), JSON.stringify(meta, null, 2)); recordAsset(`assets/enemies/${id}_animations.json`, join(stage, 'assets', 'enemies', `${id}_animations.json`));
    }
    const npcActions = ['idle', 'walk', 'talk', 'listen'];
    for (let npcIndex = 0; npcIndex < gameContent.npcs.length; npcIndex++) {
      const id = `npc_${String(npcIndex).padStart(3, '0')}`;
      for (const action of npcActions) {
        const relativeName = `assets/npcs/${id}_${action}.png`, to = join(stage, relativeName);
        writeFileSync(to, generateStormglassNpcSheet(action, npcIndex)); recordAsset(relativeName, to);
      }
      const still = extractSheetFramePng(generateStormglassNpcSheet('idle', npcIndex), 64, 64, stormglassNpcFrameCount('idle'), 0);
      writeFileSync(join(stage, 'assets', 'npcs', `${id}.png`), still); recordAsset(`assets/npcs/${id}.png`, join(stage, 'assets', 'npcs', `${id}.png`));
      const meta = Object.fromEntries(npcActions.map((action) => [action, { frameCount: stormglassNpcFrameCount(action), fps: action === 'walk' ? 9 : 7, loop: true }]));
      writeFileSync(join(stage, 'assets', 'npcs', `${id}_animations.json`), JSON.stringify(meta, null, 2)); recordAsset(`assets/npcs/${id}_animations.json`, join(stage, 'assets', 'npcs', `${id}_animations.json`));
    }
    const guardianActions = ['walk', 'attack', 'hurt', 'death'];
    const authoredGuardianRoot = join(root, 'packages', 'assets', 'authored', 'stormglass-tempest-abbot');
    const authoredGuardianSheets = {
      walk: 'tempest-abbot-locomotion-v1.png',
      attack: 'tempest-abbot-slam-v1.png',
      hurt: 'tempest-abbot-hurt-v1.png',
      death: 'tempest-abbot-death-v1.png',
      idle: 'tempest-abbot-idle-v1.png',
    };
    for (let bossIndex = 0; bossIndex < stormglassBossCount; bossIndex++) {
      const id = `boss_${String(bossIndex).padStart(3, '0')}`;
      for (const action of guardianActions) {
        const relativeName = `assets/bosses/${id}_${action}.png`, to = join(stage, relativeName);
        copyFileSync(join(authoredGuardianRoot, authoredGuardianSheets[action]), to); recordAsset(relativeName, to);
      }
      const idleRelativeName = `assets/bosses/${id}_idle.png`;
      const idlePath = join(stage, idleRelativeName);
      copyFileSync(join(authoredGuardianRoot, authoredGuardianSheets.idle), idlePath); recordAsset(idleRelativeName, idlePath);
      const still = extractSheetFramePng(readFileSync(idlePath), 160, 160, 8, 0);
      writeFileSync(join(stage, 'assets', 'bosses', `${id}.png`), still); recordAsset(`assets/bosses/${id}.png`, join(stage, 'assets', 'bosses', `${id}.png`));
      const runRelativeName = `assets/bosses/${id}_run.png`;
      const runPath = join(stage, runRelativeName);
      copyFileSync(join(authoredGuardianRoot, authoredGuardianSheets.walk), runPath);
      recordAsset(runRelativeName, runPath);
      const meta = Object.fromEntries(['idle', ...guardianActions, 'run'].map((action) => [action, {
        frameCount: 8,
        fps: action === 'run' ? 12 : action === 'attack' ? 11 : 8,
        loop: action === 'idle' || action === 'walk' || action === 'run',
      }]));
      writeFileSync(join(stage, 'assets', 'bosses', `${id}_animations.json`), JSON.stringify(meta, null, 2)); recordAsset(`assets/bosses/${id}_animations.json`, join(stage, 'assets', 'bosses', `${id}_animations.json`));
    }
  }
  writeFileSync(
    join(stage, 'GAME_SET.json'),
    JSON.stringify(
      {
        genre,
        archetype: set.archetype,
        generatedAt: new Date().toISOString(),
        seed,
        sourceAssets: sourceRoot,
        layoutStyle: layoutStyle ?? 'legacy',
        assets: assets.filter((asset) => existsSync(join(stage, asset.path))),
        productionApproved: false,
        review: 'Refreshed candidate. Native checks and visual approval are separate.',
      },
      null,
      2,
    ),
  );
  if (!promote) {
    return { genre, projectPath: stage, assetCount: assets.length, backup: null, promoted: false };
  }
  if (existsSync(current)) {
    mkdirSync(dirname(backup), { recursive: true });
    renameSync(current, backup);
  }
  try {
    renameSync(stage, current);
  } catch (error) {
    if (existsSync(backup) && !existsSync(current)) renameSync(backup, current);
    throw error;
  }
  return {
    genre,
    projectPath: current,
    assetCount: assets.length,
    backup: existsSync(backup) ? backup : null,
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [genre, source, seed, layoutStyle] = process.argv.slice(2);
  if (!source)
    throw new Error(
      'Usage: node scripts/refresh-test-game.mjs <topdown|metroidvania> <same-genre-source-project> [seed]',
    );
  console.log(
    JSON.stringify(
      refreshTestGame({ genre, source, layoutStyle, promote: !process.argv.includes('--candidate'), ...(seed ? { seed: Number(seed) } : {}) }),
      null,
      2,
    ),
  );
}
