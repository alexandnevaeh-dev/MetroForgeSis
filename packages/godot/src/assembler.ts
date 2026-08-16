import { cpSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GameDNA, ProgressionGraph, StyleBible, WorldGraph } from '@metroforge/schemas';
import type { GameContent, TopDownOverworld } from '@metroforge/procedural';
import {
  attachPlaytestPersona,
  defaultPlaytestPersonaForProfile,
  validateMovementFeasibility,
  planVictoryRoute,
  generateTopDownWorld,
} from '@metroforge/procedural';
import {
  PRODUCT,
  buildMovementJson,
  movementFeasibilityStats,
  getGameArchetypePlugin,
  isTopDownArchetype,
  resolveGameArchetype,
  DEFAULT_TOP_DOWN_MOVEMENT,
} from '@metroforge/shared';
import {
  buildRoomAssemblyOptions,
  buildPublishedRoomRecord,
  generateRoomScene,
  prepareRoomAssemblyContext,
  recompileRooms,
  type RecompileRoomsInput,
  type RecompileRoomsResult,
} from './room-assembler.js';
import { measureRoomLayout, layoutsTooSimilar, type RoomLayoutMetrics } from './room-variety.js';
import { composeEnvironment } from './environment-composition.js';
import { writePixelArtImport } from './godot-import.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');

export interface AssetManifestEntry {
  id: string;
  path: string;
  type: 'texture' | 'audio';
  provider: string;
  modelId?: string;
  fallbackGenerated: boolean;
  critiquePassed?: boolean;
  critiqueScore?: number;
  license?: string;
  commercialUse?: 'allowed' | 'restricted' | 'unknown';
  promptHash?: string | null;
  parentArtifactIds?: string[];
  compiler?: string;
  godotResourcePath?: string;
  repairCount?: number;
  sourcePath?: string;
  transformation?: string;
  sourceLicense?: string;
  derivedLicense?: string;
}

export interface AssemblyInput {
  outputDir: string;
  gameDna: GameDNA;
  worldGraph: WorldGraph;
  progressionGraph: ProgressionGraph;
  roomIds: string[];
  gameContent?: GameContent;
  audioFiles?: Map<string, Buffer>;
  textureFiles?: Map<string, Buffer>;
  assetMetadata?: AssetManifestEntry[];
  overworld?: TopDownOverworld;
  styleBible?: StyleBible;
}

export interface AssemblyResult {
  success: boolean;
  projectPath: string;
  errors: string[];
  warnings: string[];
}

export type { RecompileRoomsInput, RecompileRoomsResult };

function readExistingGenerationManifest(outputDir: string): {
  artifacts?: AssetManifestEntry[];
  createdAt?: string;
} | null {
  const path = join(outputDir, 'generation_manifest.json');
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as {
      artifacts?: AssetManifestEntry[];
      createdAt?: string;
    };
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function mergeManifestArtifacts(
  existing: AssetManifestEntry[] | undefined,
  incoming: AssetManifestEntry[],
): AssetManifestEntry[] {
  const byId = new Map<string, AssetManifestEntry>();
  for (const entry of existing ?? []) {
    if (entry?.id) byId.set(entry.id, entry);
  }
  for (const entry of incoming) {
    if (!entry?.id) continue;
    const prev = byId.get(entry.id);
    byId.set(entry.id, prev ? { ...prev, ...entry } : entry);
  }
  return [...byId.values()];
}

export class GodotProjectAssembler {
  recompileRooms(input: RecompileRoomsInput): RecompileRoomsResult {
    return recompileRooms(input);
  }

  assemble(input: AssemblyInput): AssemblyResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const templatePath = getTemplatePath(input.gameDna.archetype);
    if (!existsSync(templatePath)) {
      return {
        success: false,
        projectPath: input.outputDir,
        errors: [`Template not found: ${templatePath}`],
        warnings,
      };
    }

    try {
      const priorManifest = readExistingGenerationManifest(input.outputDir);
      cpSync(templatePath, input.outputDir, { recursive: true });

      const roomsDir = join(input.outputDir, 'scenes', 'rooms');
      mkdirSync(roomsDir, { recursive: true });
      const roomsData: Record<string, unknown> = {};
      let topDownOverworld: TopDownOverworld | undefined;

      if (isTopDownArchetype(input.gameDna.archetype)) {
        const overworld =
          input.overworld ??
          generateTopDownWorld({
            seed: input.gameDna.seed,
            profile: input.gameDna.profile,
            tileSize: input.gameDna.technical.tileSize,
          }).overworld;
        topDownOverworld = overworld;
        writeTopDownWorld(input.outputDir, overworld);
        const worldArchetypeById = new Map(
          input.worldGraph.nodes.map((n) => [n.id, n.metadata?.archetype as string | undefined]),
        );
        // No per-area .tscn files here: OverworldManager.gd (the actual scene attached to
        // World.tscn) reads data/world/overworld.json directly at runtime and spawns everything
        // — ground, collision, POIs — from that data, rather than loading a pre-baked scene per
        // room. rooms.json below is still written for the data/rooms.json readers (dashboard,
        // room_archetype_fidelity, etc.), just without a matching .tscn on disk.
        for (const area of overworld.areas) {
          roomsData[area.id] = {
            id: area.id,
            name: area.name,
            // Preserved from the real world-graph node, not collapsed to hub/combat — see
            // room_archetype_fidelity's audit in packages/godot/src/room-assembler.ts, which
            // this previously failed for every boss room in a top-down dungeon.
            archetype: worldArchetypeById.get(area.id) ?? (area.kind === 'overworld' ? 'hub' : 'combat'),
            width: area.widthTiles * area.tileSize,
            height: area.heightTiles * area.tileSize,
            collectibles: area.pois.filter((p) => p.kind === 'chest').map((p) => String(p.metadata.itemId ?? '')),
          };
        }
      } else {
      const roomConnections = prepareRoomAssemblyContext(
        input.worldGraph,
        input.gameContent,
        input.roomIds,
      );
      const enemyCounter = { value: 0 };
      const textureExists = (rel: string) =>
        (input.textureFiles?.has(rel) ?? false) || existsSync(join(input.outputDir, rel));
      const previousLayouts: Array<{
        metrics: RoomLayoutMetrics;
        platforms: NonNullable<ReturnType<typeof buildRoomAssemblyOptions>['platforms']>;
        pits: NonNullable<ReturnType<typeof buildRoomAssemblyOptions>['pits']>;
      }> = [];
      const compositionByRoom: Record<string, unknown> = {};

      for (let i = 0; i < input.roomIds.length; i++) {
        const roomId = input.roomIds[i]!;
        let opts = buildRoomAssemblyOptions(
          roomId,
          i,
          roomConnections,
          input.gameDna,
          input.gameContent,
          enemyCounter,
          textureExists,
        );
        const enemySnapshot = enemyCounter.value;
        for (let salt = 1; salt <= 5; salt++) {
          const metrics = measureRoomLayout({
            width: opts.width,
            height: opts.height,
            tileSize: opts.tileSize,
            layout: {
              cells: opts.tileCells ?? [],
              platforms: opts.platforms ?? [],
              pits: opts.pits ?? [],
            },
          });
          const similar = previousLayouts.some((prev) =>
            layoutsTooSimilar(
              prev.metrics,
              metrics,
              prev.platforms ?? [],
              opts.platforms ?? [],
              prev.pits ?? [],
              opts.pits ?? [],
            ),
          );
          if (!similar) break;
          enemyCounter.value = opts.hasEnemy ? enemySnapshot - 1 : enemySnapshot;
          opts = buildRoomAssemblyOptions(
            roomId,
            i,
            roomConnections,
            input.gameDna,
            input.gameContent,
            enemyCounter,
            textureExists,
            { uniquenessSalt: salt, hasEnemy: opts.hasEnemy, width: opts.width, height: opts.height },
          );
        }
        previousLayouts.push({
          metrics: measureRoomLayout({
            width: opts.width,
            height: opts.height,
            tileSize: opts.tileSize,
            layout: {
              cells: opts.tileCells ?? [],
              platforms: opts.platforms ?? [],
              pits: opts.pits ?? [],
            },
          }),
          platforms: opts.platforms ?? [],
          pits: opts.pits ?? [],
        });
        compositionByRoom[roomId] = composeEnvironment({
          gameDna: input.gameDna,
          styleBible: input.styleBible,
          biomeIndex: opts.biomeIndex,
          archetype: opts.worldGraphArchetype ?? 'combat',
          seed: input.gameDna.seed + i,
          textureExists,
        });
        const sceneContent = generateRoomScene(roomId, i, opts);
        writeFileSync(join(roomsDir, `${roomId}.tscn`), sceneContent);
        roomsData[roomId] = {
          ...buildPublishedRoomRecord(roomId, i, opts),
          layoutMetrics: previousLayouts[previousLayouts.length - 1]!.metrics,
        };
      }
      mkdirSync(join(input.outputDir, 'data', 'environment'), { recursive: true });
      writeFileSync(
        join(input.outputDir, 'data', 'environment', 'composition.json'),
        JSON.stringify({ rooms: compositionByRoom }, null, 2),
      );
      }

      writeFileSync(
        join(input.outputDir, 'data', 'rooms', 'rooms.json'),
        JSON.stringify({ rooms: roomsData }, null, 2),
      );

      writeFileSync(
        join(input.outputDir, 'game_dna.json'),
        JSON.stringify(input.gameDna, null, 2),
      );

      writeFileSync(
        join(input.outputDir, 'world_graph.json'),
        JSON.stringify(input.worldGraph, null, 2),
      );
      mkdirSync(join(input.outputDir, 'data', 'world'), { recursive: true });
      writeFileSync(
        join(input.outputDir, 'data', 'world', 'world_graph.json'),
        JSON.stringify(input.worldGraph, null, 2),
      );

      writeFileSync(
        join(input.outputDir, 'progression_graph.json'),
        JSON.stringify(input.progressionGraph, null, 2),
      );

      const finalBoss =
        input.gameContent?.bosses.find((b) => b.id === 'boss_final') ??
        input.gameContent?.bosses[input.gameContent.bosses.length - 1];
      const playtestRoute = attachPlaytestPersona(
        planVictoryRoute(input.worldGraph, {
          victoryRoomId: finalBoss?.arenaRoomId ?? input.roomIds[input.roomIds.length - 1],
          victoryBossId: finalBoss?.id ?? 'boss_final',
        }),
        defaultPlaytestPersonaForProfile(input.gameDna.profile),
      );
      const movementJson = isTopDownArchetype(input.gameDna.archetype)
        ? {
            ...buildMovementJson({
              ...input.gameDna.movement,
              walkSpeed: DEFAULT_TOP_DOWN_MOVEMENT.walkSpeed,
              runSpeed: DEFAULT_TOP_DOWN_MOVEMENT.runSpeed,
              acceleration: DEFAULT_TOP_DOWN_MOVEMENT.acceleration,
              deceleration: DEFAULT_TOP_DOWN_MOVEMENT.deceleration,
              knockbackDecay: DEFAULT_TOP_DOWN_MOVEMENT.knockbackDecay,
            }),
            movementDirections: input.gameDna.topDown?.movementDirections ?? 8,
            worldStyle: input.gameDna.topDown?.worldStyle ?? 'continuous',
          }
        : buildMovementJson(input.gameDna.movement);
      const movementFeasibility = validateMovementFeasibility(
        input.worldGraph,
        movementFeasibilityStats(movementJson),
      );
      writeFileSync(
        join(input.outputDir, 'playtest_route.json'),
        JSON.stringify(
          {
            ...playtestRoute,
            movementFeasibility: {
              feasible: movementFeasibility.feasible,
              issueCount: movementFeasibility.issues.length,
              issues: movementFeasibility.issues,
              metrics: movementFeasibility.metrics,
            },
          },
          null,
          2,
        ),
      );

      if (input.gameContent) {
        const dataDir = join(input.outputDir, 'data');
        mkdirSync(join(dataDir, 'enemies'), { recursive: true });
        mkdirSync(join(dataDir, 'bosses'), { recursive: true });
        mkdirSync(join(dataDir, 'quests'), { recursive: true });
        mkdirSync(join(dataDir, 'items'), { recursive: true });
        mkdirSync(join(dataDir, 'npcs'), { recursive: true });
        mkdirSync(join(dataDir, 'dialogues'), { recursive: true });
        mkdirSync(join(dataDir, 'shops'), { recursive: true });
        mkdirSync(join(dataDir, 'player'), { recursive: true });
        mkdirSync(join(dataDir, 'abilities'), { recursive: true });

        writeFileSync(
          join(dataDir, 'player', 'movement.json'),
          JSON.stringify(movementJson, null, 2),
        );

        writeFileSync(
          join(dataDir, 'abilities', 'abilities.json'),
          JSON.stringify(
            {
              abilities: input.gameDna.abilities
                .filter((a) => a.enabled)
                .map((a) => ({
                  id: a.id,
                  displayName: a.name,
                  category: a.category,
                  enabled: true,
                })),
            },
            null,
            2,
          ),
        );

        writeFileSync(
          join(dataDir, 'enemies', 'enemies.json'),
          JSON.stringify({ enemies: input.gameContent.enemies }, null, 2),
        );
        writeFileSync(
          join(dataDir, 'bosses', 'bosses.json'),
          JSON.stringify({ bosses: input.gameContent.bosses }, null, 2),
        );
        writeFileSync(
          join(dataDir, 'quests', 'quests.json'),
          JSON.stringify({ quests: input.gameContent.quests }, null, 2),
        );
        writeFileSync(
          join(dataDir, 'items', 'items.json'),
          // Top-down items merge in here so InventoryManager (which only knows items it finds in
          // this file) actually recognizes them; without this, ChestPickup.gd's grant_item()
          // rejects every pickup as unknown. Two distinct sources: GameDNA.abilities holds the
          // profile-level dungeon tool rewards (pickTopDownDungeonItems() — generators/
          // game-dna.ts); per-dungeon key items (`${dungeonId}_key`, generated fresh inside
          // generateTopDownWorld() for each LockedDoor — packages/procedural/src/topdown/
          // world.ts) never flow through GameDNA at all, so they must be discovered by scanning
          // every 'chest' POI's actual itemId directly — the only real source of truth for what
          // a chest in this project grants.
          JSON.stringify(
            {
              items: isTopDownArchetype(input.gameDna.archetype)
                ? [...input.gameContent.items, ...topDownChestItemDefs(topDownOverworld, input.gameDna.abilities)]
                : input.gameContent.items,
            },
            null,
            2,
          ),
        );
        writeFileSync(
          join(dataDir, 'npcs', 'npcs.json'),
          JSON.stringify({ npcs: input.gameContent.npcs }, null, 2),
        );
        writeFileSync(
          join(dataDir, 'dialogues', 'dialogues.json'),
          JSON.stringify({ dialogues: input.gameContent.dialogues }, null, 2),
        );
        writeFileSync(
          join(dataDir, 'shops', 'shops.json'),
          JSON.stringify({ shops: input.gameContent.shops }, null, 2),
        );
      }

      if (input.audioFiles && input.audioFiles.size > 0) {
        const sfxDir = join(input.outputDir, 'audio', 'sfx');
        const musicDir = join(input.outputDir, 'audio', 'music');
        const voiceDir = join(input.outputDir, 'audio', 'voice');
        mkdirSync(sfxDir, { recursive: true });
        mkdirSync(musicDir, { recursive: true });
        mkdirSync(voiceDir, { recursive: true });
        for (const [id, buffer] of input.audioFiles) {
          const dest = id.startsWith('voice_')
            ? join(voiceDir, `${id.replace(/^voice_/, '')}.wav`)
            : id.startsWith('music_')
              ? join(musicDir, `${id.replace(/^music_/, '')}.wav`)
              : join(sfxDir, `${id}.wav`);
          writeFileSync(dest, buffer);
        }
      }

      if (input.textureFiles && input.textureFiles.size > 0) {
        for (const [relPath, buffer] of input.textureFiles) {
          const fullPath = join(input.outputDir, relPath.replace(/\//g, sep));
          mkdirSync(dirname(fullPath), { recursive: true });
          writeFileSync(fullPath, buffer);
        if (relPath.replace(/\\/g, '/').endsWith('.png')) {
          writePixelArtImport(fullPath, relPath.replace(/\\/g, '/'));
        }
        }

        const texturePaths: Record<string, string> = {};
        for (const key of input.textureFiles.keys()) {
          texturePaths[key] = `res://${key}`;
        }
        writeFileSync(
          join(input.outputDir, 'assets_manifest.json'),
          JSON.stringify({ textures: texturePaths, generatedAt: new Date().toISOString() }, null, 2),
        );
      }

      const incoming: AssetManifestEntry[] = [...(input.assetMetadata ?? [])];
      if (input.audioFiles) {
        for (const id of input.audioFiles.keys()) {
          const relPath = id.startsWith('voice_')
            ? `audio/voice/${id.replace(/^voice_/, '')}.wav`
            : id.startsWith('music_')
              ? `audio/music/${id.replace(/^music_/, '')}.wav`
              : `audio/sfx/${id}.wav`;
          incoming.push({
            id,
            path: relPath,
            type: 'audio',
            provider: id.startsWith('voice_') ? 'piper' : 'procedural',
            fallbackGenerated: !id.startsWith('voice_'),
            license: id.startsWith('voice_')
              ? 'Piper TTS (MIT) + generated dialogue text'
              : 'MetroForge Procedural Generator (original work)',
            commercialUse: 'allowed',
          });
        }
      }
      const artifacts = mergeManifestArtifacts(priorManifest?.artifacts, incoming);

      writeFileSync(
        join(input.outputDir, 'generation_manifest.json'),
        JSON.stringify(
          {
            version: PRODUCT.generatorVersion,
            projectId: input.outputDir,
            seed: input.gameDna.seed,
            generatorVersion: PRODUCT.generatorVersion,
            artifacts,
            createdAt: priorManifest?.createdAt ?? new Date().toISOString(),
            reassembledAt: priorManifest ? new Date().toISOString() : undefined,
          },
          null,
          2,
        ),
      );

      // Update project.godot with game title
      const projectGodotPath = join(input.outputDir, 'project.godot');
      let projectGodot = readFileSync(projectGodotPath, 'utf-8');
      projectGodot = projectGodot.replace(
        'config/name="MetroForge Template"',
        `config/name="${input.gameDna.identity.title.replace(/"/g, '\\"')}"`,
      );
      const viewportW = input.gameDna.technical.resolution.width;
      const viewportH = input.gameDna.technical.resolution.height;
      projectGodot = projectGodot.replace(
        /window\/size\/viewport_width=\d+/,
        `window/size/viewport_width=${viewportW}`,
      );
      projectGodot = projectGodot.replace(
        /window\/size\/viewport_height=\d+/,
        `window/size/viewport_height=${viewportH}`,
      );
      // Integer stretch + a non-multiple capture window letterboxes the game into a corner of
      // the PNG. Keep canvas_items so pixel art scales, without locking the window to integer.
      projectGodot = projectGodot.replace(/\nwindow\/stretch\/aspect="integer"/g, '');
      if (!isTopDownArchetype(input.gameDna.archetype)) {
        const qualityDir = join(input.outputDir, 'data', 'quality');
        mkdirSync(qualityDir, { recursive: true });
        // 3.0 cropped an 800×600 room to ~426×240 world pixels so the camera showed a postage-stamp
        // of floor plus floating parallax plates. 1.85 still reads as chunky pixel art while
        // keeping platforms, exits, and biome depth in frame.
        const zoom = 1.85;
        writeFileSync(
          join(qualityDir, 'camera_profile.json'),
          JSON.stringify(
            { zoom, deadZone: 0.16, lookAheadPx: 32, pixelSnap: true, smoothing: true },
            null,
            2,
          ),
        );
        writeFileSync(
          join(qualityDir, 'install_readability_outline.json'),
          JSON.stringify({ kind: 'INSTALL_READABILITY_OUTLINE', enabled: true, intensity: 1 }, null, 2),
        );
        writeFileSync(
          join(qualityDir, 'apply_combat_feedback.json'),
          JSON.stringify(
            {
              kind: 'APPLY_COMBAT_FEEDBACK',
              hitstopMs: 36,
              flashMs: 60,
              vfxScale: 1.1,
              shakeEnabledDefault: true,
              flashEnabledDefault: true,
            },
            null,
            2,
          ),
        );
        writeFileSync(
          join(qualityDir, 'apply_transition_fade.json'),
          JSON.stringify({ kind: 'APPLY_TRANSITION_FADE', durationMs: 180 }, null, 2),
        );
        writeFileSync(
          join(qualityDir, 'apply_lighting_profile.json'),
          JSON.stringify({ kind: 'APPLY_LIGHTING_PROFILE', tier: 'LOW' }, null, 2),
        );
      }
      writeFileSync(projectGodotPath, projectGodot);

      // Update title screen label via Main.tscn
      const mainScenePath = join(input.outputDir, 'scenes', 'boot', 'Main.tscn');
      let mainScene = readFileSync(mainScenePath, 'utf-8');
      mainScene = mainScene.replace('MetroForge Game', input.gameDna.identity.title);
      writeFileSync(mainScenePath, mainScene);

      return {
        success: true,
        projectPath: input.outputDir,
        errors,
        warnings,
      };
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      return { success: false, projectPath: input.outputDir, errors, warnings };
    }
  }
}

export function getTemplatePath(archetype?: string): string {
  const plugin = getGameArchetypePlugin(resolveGameArchetype(archetype));
  return join(REPO_ROOT, plugin.runtimeTemplate);
}

/** Every real item a chest in this project can grant — the DNA-level dungeon reward tools, plus
 *  any per-dungeon key id discovered by scanning the actual generated chest POIs (see the
 *  items.json write site above for why the latter can't come from GameDNA). */
function topDownChestItemDefs(
  overworld: TopDownOverworld | undefined,
  dnaAbilities: { id: string; name: string }[],
): Array<{ id: string; name: string; category: string; description: string }> {
  const known = new Map(
    dnaAbilities.map((a) => [a.id, { id: a.id, name: a.name, category: 'tool', description: `Dungeon tool: ${a.name}` }]),
  );
  for (const area of overworld?.areas ?? []) {
    for (const poi of area.pois) {
      if (poi.kind !== 'chest') continue;
      const itemId = String(poi.metadata.itemId ?? '');
      if (!itemId || known.has(itemId)) continue;
      const isKey = itemId.endsWith('_key');
      const displayName = itemId
        .split('_')
        .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : part))
        .join(' ');
      known.set(itemId, {
        id: itemId,
        name: displayName,
        category: isKey ? 'key' : 'misc',
        description: isKey ? `Opens the matching locked door.` : displayName,
      });
    }
  }
  return Array.from(known.values());
}

function writeTopDownWorld(outputDir: string, overworld: TopDownOverworld): void {
  mkdirSync(join(outputDir, 'data', 'world'), { recursive: true });
  writeFileSync(join(outputDir, 'data', 'world', 'overworld.json'), JSON.stringify(overworld, null, 2));
}
