import { cpSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GameDNA, ProgressionGraph, WorldGraph } from '@metroforge/schemas';
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');

export interface AssetManifestEntry {
  id: string;
  path: string;
  type: 'texture' | 'audio';
  provider: string;
  fallbackGenerated: boolean;
  critiquePassed?: boolean;
  critiqueScore?: number;
  license?: string;
  commercialUse?: 'allowed' | 'restricted' | 'unknown';
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
}

export interface AssemblyResult {
  success: boolean;
  projectPath: string;
  errors: string[];
  warnings: string[];
}

export type { RecompileRoomsInput, RecompileRoomsResult };

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
      cpSync(templatePath, input.outputDir, { recursive: true });

      const roomsDir = join(input.outputDir, 'scenes', 'rooms');
      mkdirSync(roomsDir, { recursive: true });
      const roomsData: Record<string, unknown> = {};

      if (isTopDownArchetype(input.gameDna.archetype)) {
        const overworld =
          input.overworld ??
          generateTopDownWorld({
            seed: input.gameDna.seed,
            profile: input.gameDna.profile,
            tileSize: input.gameDna.technical.tileSize,
          }).overworld;
        writeTopDownWorld(input.outputDir, overworld);
        for (const area of overworld.areas) {
          roomsData[area.id] = {
            id: area.id,
            name: area.name,
            archetype: area.kind === 'overworld' ? 'hub' : 'combat',
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

      for (let i = 0; i < input.roomIds.length; i++) {
        const roomId = input.roomIds[i]!;
        const opts = buildRoomAssemblyOptions(
          roomId,
          i,
          roomConnections,
          input.gameDna,
          input.gameContent,
          enemyCounter,
          textureExists,
        );
        const sceneContent = generateRoomScene(roomId, i, opts);
        writeFileSync(join(roomsDir, `${roomId}.tscn`), sceneContent);
        roomsData[roomId] = buildPublishedRoomRecord(roomId, i, opts);
      }
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
          JSON.stringify({ items: input.gameContent.items }, null, 2),
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

      const artifacts: AssetManifestEntry[] = [...(input.assetMetadata ?? [])];
      if (input.audioFiles) {
        for (const id of input.audioFiles.keys()) {
          const relPath = id.startsWith('voice_')
            ? `audio/voice/${id.replace(/^voice_/, '')}.wav`
            : id.startsWith('music_')
              ? `audio/music/${id.replace(/^music_/, '')}.wav`
              : `audio/sfx/${id}.wav`;
          artifacts.push({
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

      writeFileSync(
        join(input.outputDir, 'generation_manifest.json'),
        JSON.stringify(
          {
            version: PRODUCT.generatorVersion,
            projectId: input.outputDir,
            seed: input.gameDna.seed,
            generatorVersion: PRODUCT.generatorVersion,
            artifacts,
            createdAt: new Date().toISOString(),
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

function writeTopDownWorld(outputDir: string, overworld: TopDownOverworld): void {
  mkdirSync(join(outputDir, 'data', 'world'), { recursive: true });
  writeFileSync(join(outputDir, 'data', 'world', 'overworld.json'), JSON.stringify(overworld, null, 2));
}
