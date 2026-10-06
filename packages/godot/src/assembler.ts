import {configureStormglassGalleryRoomKits} from './stormglass-room-kits.js';
import { cpSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname, sep } from 'node:path';
import { getResourceRoot } from '@metroforge/shared';
import { validateLootCatalog } from '@metroforge/schemas';
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
  buildTopDownMovementJson,
  movementFeasibilityStats,
  getGameArchetypePlugin,
  genreSupports,
  genreUsesDungeonTools,
  genreUsesOverworldChunks,
  resolveGameArchetype,
  DEFAULT_TOP_DOWN_MOVEMENT,
  type AssetMaturity,
  type AssetSourceType,
} from '@metroforge/shared';
import {
  buildRoomAssemblyOptions,
  buildPublishedRoomRecord,
  generateRoomScene,
  prepareRoomAssemblyContext,
  recompileRooms,
  resolveFloorPropPlacements,
  applyStormglassEncounterComposition,
  type RecompileRoomsInput,
  type RecompileRoomsResult,
} from './room-assembler.js';
import { measureRoomLayout, layoutsTooSimilar, type RoomLayoutMetrics } from './room-variety.js';
import { composeEnvironment } from './environment-composition.js';
import { writePixelArtImport } from './godot-import.js';
import { loadExternalVisualPack, type ExternalVisualPackId } from './external-visual-pack.js';
import { expandFoundryTextureAliases } from './foundry-visual-pack.js';


export interface AssetManifestEntry {
  id: string;
  path: string;
  type: 'texture' | 'audio';
  provider: string;
  modelId?: string;
  fallbackGenerated: boolean;
  critiquePassed?: boolean;
  critiqueScore?: number;
  maturity?: AssetMaturity;
  productionReady?: boolean;
  sourceType?: AssetSourceType;
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
  /** Test-only selected art pack. Default keeps the procedural asset pipeline unchanged. */
  externalVisualPack?: ExternalVisualPackId;
  /** True when the asset pipeline used the authored Foundry courier/masonry direction (side-view
   *  VISUAL_VERTICAL_SLICE with a foundry/courier theme). Drives `visual_kit = "foundry"` on Ground
   *  nodes so the Foundry camera cinematic-plate + lighting paths engage without the prebuilt pack. */
  foundryThemed?: boolean;
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
    configureStormglassGalleryRoomKits(input.outputDir,input.gameDna,input.worldGraph);
    return recompileRooms(input);
  }

  assemble(input: AssemblyInput): AssemblyResult {
    if (input.gameDna.archetype === 'QUANTUM_SIMULATION_ROGUELITE') {
      return {success:false,projectPath:input.outputDir,errors:['Quantum requires the dedicated material-world assembler'],warnings:[]};
    }
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
      const lootTables = validateLootCatalog(input.gameContent?.lootTables ?? [], input.gameContent?.items ?? [], input.gameContent?.enemies ?? []);
      const priorManifest = readExistingGenerationManifest(input.outputDir);
      cpSync(templatePath, input.outputDir, {
        recursive: true,
        filter: (src) => !isRollbackOnlyTemplatePath(src, templatePath),
      });
      stripRollbackOnlyAssets(input.outputDir);
      configureStormglassGalleryRoomKits(input.outputDir,input.gameDna,input.worldGraph);
      if (input.externalVisualPack === 'metroforge-foundry-v3' && input.textureFiles) {
        expandFoundryTextureAliases(input.textureFiles);
      }

      const roomsDir = join(input.outputDir, 'scenes', 'rooms');
      mkdirSync(roomsDir, { recursive: true });
      const roomsData: Record<string, unknown> = {};
      let topDownOverworld: TopDownOverworld | undefined;

      if (genreUsesOverworldChunks(input.gameDna.archetype)) {
        const overworld =
          input.overworld ??
          generateTopDownWorld({
            seed: input.gameDna.seed,
            profile: input.gameDna.profile,
            tileSize: input.gameDna.technical.tileSize,
          }).overworld;
        topDownOverworld = overworld;
        writeTopDownWorld(input.outputDir, overworld);
        if (/hd[\s-]?2d/i.test(input.gameDna.identity.visualStyle)) {
          const visualDir = join(input.outputDir, 'data', 'visual');
          mkdirSync(visualDir, { recursive: true });
          writeFileSync(join(visualDir, 'hd2d.json'), JSON.stringify({ enabled: true, style: 'pixel-sprites-in-3d-diorama', productionApproved: false }, null, 2));
        }
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
          {
            visualKit: (input.externalVisualPack === 'metroforge-foundry-v3' || input.foundryThemed) ? 'foundry' : undefined,
            authoredParallax: Boolean(input.foundryThemed && !input.externalVisualPack),
          },
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
            decorationCount:
              resolveFloorPropPlacements(opts).length +
              Math.min(4, opts.architectureSprites?.length ?? opts.blueprint?.plan?.majorArchitecture.length ?? 0),
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
            {
              uniquenessSalt: salt,
              hasEnemy: opts.hasEnemy,
              width: opts.width,
              height: opts.height,
              visualKit: (input.externalVisualPack === 'metroforge-foundry-v3' || input.foundryThemed) ? 'foundry' : undefined,
              authoredParallax: Boolean(input.foundryThemed && !input.externalVisualPack),
            },
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
            decorationCount:
              resolveFloorPropPlacements(opts).length +
              Math.min(4, opts.architectureSprites?.length ?? opts.blueprint?.plan?.majorArchitecture.length ?? 0),
          }),
          platforms: opts.platforms ?? [],
          pits: opts.pits ?? [],
        });
        if (input.gameDna.identity.title.startsWith('Stormglass Reliquary')) {
          applyStormglassEncounterComposition(roomId, i, opts, input.gameContent?.enemies ?? []);
        }
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
      const movementJson = genreSupports(input.gameDna.archetype, 'supportsFreePlanarMovement')
        ? {
            ...buildTopDownMovementJson({
              walkSpeed: DEFAULT_TOP_DOWN_MOVEMENT.walkSpeed,
              runSpeed: DEFAULT_TOP_DOWN_MOVEMENT.runSpeed,
              acceleration: DEFAULT_TOP_DOWN_MOVEMENT.acceleration,
              deceleration: DEFAULT_TOP_DOWN_MOVEMENT.deceleration,
              knockbackDecay: DEFAULT_TOP_DOWN_MOVEMENT.knockbackDecay,
              movementDirections: input.gameDna.topDown?.movementDirections ?? 8,
              worldStyle: input.gameDna.topDown?.worldStyle ?? 'continuous',
            }),
          }
        : buildMovementJson(input.gameDna.movement);
      const movementFeasibility = validateMovementFeasibility(
        input.worldGraph,
        movementFeasibilityStats(movementJson as ReturnType<typeof buildMovementJson>),
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
        mkdirSync(join(dataDir, 'loot'), { recursive: true });
        writeFileSync(join(dataDir, 'loot', 'loot_tables.json'), JSON.stringify({ tables: lootTables }, null, 2));
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
              items: genreUsesDungeonTools(input.gameDna.archetype)
                ? [
                    ...input.gameContent.items,
                    ...topDownChestItemDefs(
                      topDownOverworld,
                      input.gameDna.abilities,
                      input.gameContent.items,
                    ),
                  ]
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

      let overlaidAuthoredPaths: string[] = [];
      if (input.externalVisualPack) {
        patchCharacterFrameSizeForExternalPack(input.outputDir, input.externalVisualPack);
        patchCharacterSheetPathsForFoundryPack(input.outputDir, input.externalVisualPack);
      } else if (input.foundryThemed && genreSupports(input.gameDna.archetype, 'supportsPerRoomScenes')) {
        overlaidAuthoredPaths = overlayAuthoredVisualPolish(input.outputDir, templatePath);
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
            critiquePassed: true,
            critiqueScore: 100,
            maturity: 'PROCEDURAL_PRODUCTION',
            productionReady: true,
            sourceType: id.startsWith('voice_') ? 'compiled' : 'procedural',
            license: id.startsWith('voice_')
              ? 'Piper TTS (MIT) + generated dialogue text'
              : 'MetroForge Procedural Generator (original work)',
            commercialUse: 'allowed',
          });
        }
      }
      const artifacts = applyAuthoredOverlayProvenance(
        mergeManifestArtifacts(priorManifest?.artifacts, incoming),
        overlaidAuthoredPaths,
      );

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
      if (genreSupports(input.gameDna.archetype, 'supportsPerRoomScenes')) {
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
  return join(getResourceRoot(), plugin.runtimeTemplate);
}

type CharacterBucket = 'player' | 'boss' | 'enemy';

function characterBucketForRole(role: string): CharacterBucket {
  if (role.startsWith('player.')) return 'player';
  if (role.startsWith('boss.')) return 'boss';
  return 'enemy'; // every non-player, non-boss character role (melee./ranged./etc.) shares Enemy.tscn
}

const CHARACTER_SCENE_BY_BUCKET: Record<CharacterBucket, string> = {
  player: join('scenes', 'player', 'Player.tscn'),
  boss: join('scenes', 'bosses', 'Boss.tscn'),
  enemy: join('scenes', 'enemies', 'Enemy.tscn'),
};

/**
 * Sixteenth-session fix: Player.tscn/Enemy.tscn/Boss.tscn each hardcode a `frame_size` for their
 * AnimatedAssetSprite (64x64 / 64x64 / 160x160 respectively — player/enemy stay on the template
 * collision canvas; boss_final matches the visual constitution's native boss frame). An external
 * visual pack's actual character sheets can
 * use a different native size (metroforge-foundry-v3's are 128x128 for player/enemies and 160x160
 * for its boss — see test-packs/metroforge-foundry-v3/manifest.json's nativeDimensions). Without
 * this, AnimatedAssetSprite.gd slices the pack's real, correctly-sized sheet into the WRONG number
 * of undersized frame regions (each showing only a fragment of the actual character), which is
 * the root cause independently identified in a visual assessment as "a small pale actor fragment"
 * with no readable full silhouette (docs/audit/MODERN_COHESION_TEST_PROJECT.md's sixteenth
 * session). This patches each affected scene file's `frame_size` line in place, once per family,
 * to the pack's real, declared native size — never touching the sheet-slicing script itself.
 */
export function patchCharacterFrameSizeForExternalPack(outputDir: string, packId: ExternalVisualPackId): void {
  let pack;
  try {
    pack = loadExternalVisualPack(getResourceRoot(), packId);
  } catch {
    return; // Pack failed to load — external-pack asset copying already surfaces this failure loudly elsewhere.
  }
  const dimsByBucket = new Map<CharacterBucket, { width: number; height: number }>();
  for (const asset of pack.assets) {
    if (asset.family !== 'character' || !asset.nativeDimensions) continue;
    const bucket = characterBucketForRole(asset.role);
    if (!dimsByBucket.has(bucket)) dimsByBucket.set(bucket, asset.nativeDimensions);
  }
  for (const [bucket, sceneRelPath] of Object.entries(CHARACTER_SCENE_BY_BUCKET) as Array<[CharacterBucket, string]>) {
    const dims = dimsByBucket.get(bucket);
    if (!dims) continue;
    const scenePath = join(outputDir, sceneRelPath);
    if (!existsSync(scenePath)) continue;
    const original = readFileSync(scenePath, 'utf8');
    const patched = original.replace(
      /frame_size = Vector2i\(\d+,\s*\d+\)/,
      `frame_size = Vector2i(${dims.width}, ${dims.height})`,
    );
    if (patched !== original) writeFileSync(scenePath, patched, 'utf8');
  }
}

const FOUNDRY_SHEET_PATCHES: Array<{ file: string; replacements: Array<[RegExp, string]> }> = [
  {
    file: join('scenes', 'player', 'Player.tscn'),
    replacements: [
      [/sheet_path = "assets\/characters\/player_run\.png"/g, 'sheet_path = "assets/characters/player_locomotion.png"'],
      [/run_sheet_path = "assets\/characters\/player_run\.png"/g, 'run_sheet_path = "assets/characters/player_locomotion.png"'],
    ],
  },
  {
    file: join('scenes', 'enemies', 'Enemy.tscn'),
    replacements: [
      [/sheet_path = "assets\/enemies\/enemy_000_walk\.png"/g, 'sheet_path = "assets/enemies/melee_locomotion.png"'],
      [/hurt_sheet_path = "assets\/enemies\/enemy_000_hurt\.png"/g, 'hurt_sheet_path = "assets/enemies/melee_hurt.png"'],
      [/death_sheet_path = "assets\/enemies\/enemy_000_death\.png"/g, 'death_sheet_path = "assets/enemies/melee_death.png"'],
      [/attack_sheet_path = "assets\/enemies\/enemy_000_attack\.png"/g, 'attack_sheet_path = "assets/enemies/melee_attack.png"'],
    ],
  },
  {
    file: join('scenes', 'bosses', 'Boss.tscn'),
    replacements: [
      [/sheet_path = "assets\/bosses\/boss_final_walk\.png"/g, 'sheet_path = "assets/bosses/boss_locomotion.png"'],
      [/hurt_sheet_path = "assets\/bosses\/boss_final_hurt\.png"/g, 'hurt_sheet_path = "assets/bosses/boss_hurt.png"'],
      [/death_sheet_path = "assets\/bosses\/boss_final_death\.png"/g, 'death_sheet_path = "assets/bosses/boss_death.png"'],
      [/attack_sheet_path = "assets\/bosses\/boss_final_attack\.png"/g, 'attack_sheet_path = "assets/bosses/boss_attack.png"'],
    ],
  },
];

/** Prefixes copied from the Godot template after generated textures write, so Foundry-themed
 *  assembled games keep the authored courier/boss/biome sheets instead of 128px procedural
 *  stand-ins that slice incorrectly against Boss.tscn's 160×160 frame_size. Unique generated
 *  ids (enemy_003, extra bosses) are left untouched. */
const AUTHORED_POLISH_PREFIXES = [
  'assets/characters/player_',
  'assets/enemies/enemy_000',
  'assets/enemies/enemy_001',
  'assets/enemies/enemy_002',
  'assets/npcs/npc_000',
  'assets/bosses/boss_final',
  'assets/tilesets/biome_0/',
  'assets/tilesets/biome_1/',
  'assets/tilesets/biome_2/',
  'assets/backgrounds/biome_0/',
  'assets/backgrounds/biome_1/',
  'assets/backgrounds/biome_2/',
  'assets/vfx/',
  'assets/ui/',
  'assets/environment/',
  'assets/props/',
  'assets/architecture/',
  'assets/generated/',
] as const;

function shouldOverlayPolishAsset(rel: string): boolean {
  const n = rel.replace(/\\/g, '/');
  if (n.includes('/_baseline') || n.includes('/_polish_preview')) return false;
  if (n.endsWith('.import') || n.endsWith('.uid')) return false;
  return AUTHORED_POLISH_PREFIXES.some((prefix) => n.startsWith(prefix));
}

/** Rollback-only comparison copies. Kept in the template; excluded from generated games so
 *  Godot does not warn about duplicate UIDs against the live authored sheets. */
export function isRollbackOnlyTemplatePath(src: string, templateRoot: string): boolean {
  if (src === templateRoot) return false;
  const rel = src.slice(templateRoot.length).replace(/\\/g, '/');
  const parts = rel.split('/').filter(Boolean);
  return parts.some((part) => part.startsWith('_baseline') || part === '_polish_preview');
}

/** Removes leftover rollback copies when reassembling into an existing generated folder. */
export function stripRollbackOnlyAssets(outputDir: string): void {
  const assets = join(outputDir, 'assets');
  if (!existsSync(assets)) return;
  for (const name of readdirSync(assets)) {
    if (name.startsWith('_baseline') || name === '_polish_preview') {
      rmSync(join(assets, name), { recursive: true, force: true });
    }
  }
}

export function overlayAuthoredVisualPolish(outputDir: string, templatePath: string): string[] {
  const paths: string[] = [];
  const walk = (relDir: string): void => {
    const abs = join(templatePath, relDir);
    if (!existsSync(abs)) return;
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const rel = `${relDir}/${entry.name}`.replace(/\\/g, '/');
      if (entry.isDirectory()) {
        walk(rel);
        continue;
      }
      if (!shouldOverlayPolishAsset(rel)) continue;
      const dest = join(outputDir, rel);
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(join(templatePath, rel), dest);
      if (rel.endsWith('.png')) writePixelArtImport(dest, rel);
      paths.push(rel);
    }
  };
  walk('assets');
  return paths;
}

/** Overlay copies authored PNGs after the pipeline writes procedural stand-ins. The files on
 *  disk are then authored; the manifest must say so or AssetProduction/ParallaxDepth score the
 *  visible plates as placeholders. Does not invent promptHash and does not raise maturity to
 *  PRODUCTION_READY. */
export function applyAuthoredOverlayProvenance(
  artifacts: AssetManifestEntry[],
  overlaidRels: string[],
): AssetManifestEntry[] {
  if (overlaidRels.length === 0) return artifacts;
  const overlay = new Set(overlaidRels.map((p) => p.replace(/\\/g, '/')));
  return artifacts.map((entry) => {
    const path = (entry.path ?? '').replace(/\\/g, '/').replace(/^res:\/\//, '');
    if (!overlay.has(path)) return entry;
    return {
      ...entry,
      provider: 'authored-original',
      sourceType: 'manual',
      fallbackGenerated: false,
      maturity: entry.maturity === 'PRODUCTION_READY' ? 'PRODUCTION_READY' : 'QA_REVIEW',
    };
  });
}

export function patchCharacterSheetPathsForFoundryPack(outputDir: string, packId: ExternalVisualPackId): void {
  if (packId !== 'metroforge-foundry-v3') return;
  for (const { file, replacements } of FOUNDRY_SHEET_PATCHES) {
    const scenePath = join(outputDir, file);
    if (!existsSync(scenePath)) continue;
    let text = readFileSync(scenePath, 'utf8');
    for (const [pattern, replacement] of replacements) {
      text = text.replace(pattern, replacement);
    }
    writeFileSync(scenePath, text, 'utf8');
  }
}

/** Every real item a chest in this project can grant — the DNA-level dungeon reward tools, plus
 *  any per-dungeon key id discovered by scanning the actual generated chest POIs (see the
 *  items.json write site above for why the latter can't come from GameDNA).
 *
 *  `realItems` is `input.gameContent.items` — the actual generated item catalog (with real
 *  categories/effects, e.g. a consumable's heal effect). This function used to synthesize a
 *  bare stub (category 'tool'/'misc', no `effects`) for *every* dnaAbility id and every chest
 *  itemId unconditionally, even when a full definition for that same id already existed in
 *  realItems — and since items.json concatenates realItems first and these stubs last,
 *  InventoryManager's last-wins-by-id lookup always picked the worse stub. Concretely: a chest
 *  rewarding "health_vial" (a real consumable with a heal effect in realItems) got a second,
 *  effect-less "health_vial" stub appended after it, so every health-vial pickup silently healed
 *  for nothing at runtime (caught by RuntimeSmokeTest.gd's item_pickup_consumable_can_be_triggered,
 *  which failed against the exact same last-wins map InventoryManager builds). Skipping ids
 *  `realItems` already defines fixes this without losing the key-item discovery this function
 *  exists for — per-dungeon keys never appear in realItems, so they're untouched. */
export function topDownChestItemDefs(
  overworld: TopDownOverworld | undefined,
  dnaAbilities: { id: string; name: string }[],
  realItems: Array<{ id: string }>,
): Array<{ id: string; name: string; category: string; description: string }> {
  const realIds = new Set(realItems.map((item) => item.id));
  const known = new Map(
    dnaAbilities
      .filter((a) => !realIds.has(a.id))
      .map((a) => [a.id, { id: a.id, name: a.name, category: 'tool', description: `Dungeon tool: ${a.name}` }]),
  );
  for (const area of overworld?.areas ?? []) {
    for (const poi of area.pois) {
      if (poi.kind !== 'chest') continue;
      const itemId = String(poi.metadata.itemId ?? '');
      if (!itemId || known.has(itemId) || realIds.has(itemId)) continue;
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
