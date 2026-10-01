import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GodotProjectAssembler } from '@metroforge/godot';
import { generateGameContent, generateWorldTopology, generateTopDownWorld } from '@metroforge/procedural';
import {
  GameDNASchema,
  ProjectMetadataSchema,
  type GameArchetype,
} from '@metroforge/schemas';
import {
  DEFAULT_TOP_DOWN_MOVEMENT,
  PRODUCT,
  PROFILE_DEFAULTS,
  genreSupports,
  genreUsesDungeonTools,
  genreUsesOverworldChunks,
  getGenreDefinition,
  pickRegisteredAbilities,
  pickTopDownDungeonItems,
  type GenerationMode,
  type GenerationProfile,
} from '@metroforge/shared';

export type ScaffoldManualProjectOptions = {
  outputDir: string;
  title: string;
  slug: string;
  prompt?: string;
  archetype?: GameArchetype;
  profile?: GenerationProfile;
  mode?: GenerationMode;
  seed?: number;
};

export type ScaffoldManualProjectResult = {
  success: boolean;
  projectPath: string;
  slug: string;
  errors: string[];
  warnings: string[];
};

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'untitled-forge';
}

export function uniqueProjectDir(root: string, slug: string): { slug: string; path: string } {
  let candidate = slug;
  let index = 2;
  while (existsSync(join(root, candidate))) {
    candidate = `${slug}-${index}`;
    index += 1;
  }
  return { slug: candidate, path: join(root, candidate) };
}

/** Assemble a playable Godot starter from the template + procedural TINY_TEST topology. No LLM. */
export function scaffoldManualProject(options: ScaffoldManualProjectOptions): ScaffoldManualProjectResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const profile = options.profile ?? 'TINY_TEST';
  const defaults = PROFILE_DEFAULTS[profile];
  const seed = options.seed ?? Date.now() % 1_000_000;
  const archetype = options.archetype ?? 'SIDE_VIEW_METROIDVANIA';
  const genre = getGenreDefinition(archetype);
  const mode = options.mode ?? 'LOCAL_ONLY';
  const title = options.title.trim() || 'Untitled Forge';
  const slug = slugify(options.slug || title);
  mkdirSync(options.outputDir, { recursive: true });

  const dna = GameDNASchema.parse({
    version: PRODUCT.schemaVersion,
    identity: {
      title,
      genre: genre.displayName.includes('Metroidvania') ? 'Metroidvania' : 'Action-Adventure',
      tone: 'molten industrial',
      visualStyle: 'pixel art',
    },
    technical: {
      resolution: { width: 1280, height: 720 },
      tileSize: 16,
      targetPlaytimeHours: 1,
      difficulty: 'normal',
    },
    combat: {
      style: genreSupports(archetype, 'supportsDirectionalCombat') ? 'directional melee' : 'melee',
      meleeEnabled: true,
      rangedEnabled: true,
    },
    movement: genreSupports(archetype, 'supportsFreePlanarMovement')
      ? {
          walkSpeed: DEFAULT_TOP_DOWN_MOVEMENT.walkSpeed,
          runSpeed: DEFAULT_TOP_DOWN_MOVEMENT.runSpeed,
          jumpHeight: 0,
          gravity: 0,
          acceleration: DEFAULT_TOP_DOWN_MOVEMENT.acceleration,
          deceleration: DEFAULT_TOP_DOWN_MOVEMENT.deceleration,
          knockbackDecay: DEFAULT_TOP_DOWN_MOVEMENT.knockbackDecay,
        }
      : { walkSpeed: 200, runSpeed: 350, jumpHeight: 120, gravity: 980 },
    abilities: genreUsesDungeonTools(archetype)
      ? pickTopDownDungeonItems(profile)
      : pickRegisteredAbilities(profile),
    world: { biomeCount: defaults.biomes, roomCount: defaults.roomsMin },
    narrative: {
      premise: options.prompt?.trim() || `A courier walks the ${title} foundry floors.`,
      protagonist: 'The Courier',
      antagonist: 'The Core',
      centralConflict: 'Heat, gates, and a machine that will not cool.',
    },
    seed,
    profile,
    archetype,
  });

  const topDownWorld = genreUsesOverworldChunks(archetype)
    ? generateTopDownWorld({ seed, profile, tileSize: dna.technical.tileSize })
    : undefined;
  const topology = topDownWorld ?? generateWorldTopology({
    seed,
    roomCount: defaults.roomsMin,
    biomeCount: defaults.biomes,
    abilities: dna.abilities.filter((ability) => ability.enabled).map((ability) => ability.id),
    bossCount: defaults.bosses,
    profile,
  });
  const bossRoomId = topology.roomIds[topology.roomIds.length - 1] ?? topology.roomIds[0]!;
  const gameContent = generateGameContent(dna, profile, seed, bossRoomId, topology.roomIds);

  const assembler = new GodotProjectAssembler();
  const assembled = assembler.assemble({
    outputDir: options.outputDir,
    gameDna: dna,
    worldGraph: topology.worldGraph,
    progressionGraph: topology.progressionGraph,
    roomIds: topology.roomIds,
    gameContent,
    overworld: topDownWorld?.overworld,
  });
  errors.push(...assembled.errors);
  warnings.push(...assembled.warnings);

  const now = new Date().toISOString();
  writeFileSync(join(options.outputDir, 'game_dna.json'), JSON.stringify(dna, null, 2));
  writeFileSync(
    join(options.outputDir, 'project.json'),
    JSON.stringify(
      ProjectMetadataSchema.parse({
        projectId: `manual-${slug}-${seed}`,
        slug,
        prompt: options.prompt?.trim() || `Manual template: ${title}`,
        profile,
        mode,
        seed,
        createdAt: now,
        lastGeneratedAt: now,
        gameDnaVersion: dna.version,
        generatorVersion: PRODUCT.generatorVersion,
        archetype,
        engine: 'godot',
      }),
      null,
      2,
    ),
  );

  return {
    success: assembled.success && errors.length === 0,
    projectPath: options.outputDir,
    slug,
    errors,
    warnings,
  };
}
