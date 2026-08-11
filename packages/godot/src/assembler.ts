import { cpSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GameDNA, ProgressionGraph, WorldGraph } from '@metroforge/schemas';
import type { GameContent } from '@metroforge/procedural';
import { PRODUCT } from '@metroforge/shared';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');
const TEMPLATE_PATH = join(REPO_ROOT, 'templates', 'godot-metroidvania');

export interface AssetManifestEntry {
  id: string;
  path: string;
  type: 'texture' | 'audio';
  provider: string;
  fallbackGenerated: boolean;
  critiquePassed?: boolean;
  critiqueScore?: number;
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
}

export interface AssemblyResult {
  success: boolean;
  projectPath: string;
  errors: string[];
  warnings: string[];
}

interface RoomConnection {
  direction: 'left' | 'right' | 'up' | 'down';
  targetRoomId: string;
  optional?: boolean;
  requirements: string[];
}

function spawnSideForEntry(exitDirection: RoomConnection['direction']): string {
  switch (exitDirection) {
    case 'up':
      return 'bottom';
    case 'down':
      return 'top';
    case 'right':
      return 'left';
    case 'left':
      return 'right';
  }
}

function reverseDirection(
  direction: RoomConnection['direction'],
): RoomConnection['direction'] {
  switch (direction) {
    case 'up':
      return 'down';
    case 'down':
      return 'up';
    case 'left':
      return 'right';
    case 'right':
      return 'left';
  }
}

function inferHorizontalDirection(fromIdx: number, toIdx: number): 'left' | 'right' {
  return toIdx > fromIdx ? 'right' : 'left';
}

function buildRoomConnections(
  roomIds: string[],
  edges: WorldGraph['edges'],
): Map<string, RoomConnection[]> {
  const indexMap = new Map(roomIds.map((id, i) => [id, i]));
  const connections = new Map<string, RoomConnection[]>();

  for (const roomId of roomIds) {
    connections.set(roomId, []);
  }

  for (const edge of edges) {
    const fromIdx = indexMap.get(edge.from);
    const toIdx = indexMap.get(edge.to);
    if (fromIdx === undefined || toIdx === undefined) continue;

    const outDirection =
      edge.transition ?? inferHorizontalDirection(fromIdx, toIdx);

    const fromList = connections.get(edge.from)!;
    if (!fromList.some((c) => c.targetRoomId === edge.to && c.direction === outDirection)) {
      fromList.push({
        direction: outDirection,
        targetRoomId: edge.to,
        optional: edge.optional,
        requirements: edge.requirements ?? [],
      });
    }

    if (edge.bidirectional) {
      const inDirection = reverseDirection(outDirection);
      const toList = connections.get(edge.to)!;
      if (!toList.some((c) => c.targetRoomId === edge.from && c.direction === inDirection)) {
        toList.push({
          direction: inDirection,
          targetRoomId: edge.from,
          optional: edge.optional,
          requirements: edge.requirements ?? [],
        });
      }
    }
  }

  return connections;
}

function generateRoomScene(
  roomId: string,
  index: number,
  options: {
    hasEnemy: boolean;
    enemyIndex: number;
    hasAbilityPickup: boolean;
    abilityId: string;
    isBossRoom: boolean;
    width: number;
    height: number;
    biomeIndex: number;
    connections: RoomConnection[];
    biomeTexturePath?: string;
    hasTileset: boolean;
    tileSize: number;
  },
): string {
  const floorY = options.height - 64;
  const platformWidth = options.width;
  let loadSteps = 6;
  if (options.hasTileset) loadSteps += 2;
  if (options.biomeTexturePath) loadSteps += 1;

  let scene = `[gd_scene load_steps=${loadSteps} format=3]

[ext_resource type="PackedScene" uid="uid://player_scene" path="res://scenes/player/Player.tscn" id="1_player"]
[ext_resource type="PackedScene" uid="uid://enemy_scene" path="res://scenes/enemies/Enemy.tscn" id="2_enemy"]
[ext_resource type="PackedScene" uid="uid://boss_scene" path="res://scenes/bosses/Boss.tscn" id="3_boss"]
[ext_resource type="PackedScene" uid="uid://ability_pickup" path="res://scenes/world/AbilityPickup.tscn" id="4_pickup"]
[ext_resource type="PackedScene" uid="uid://room_transition" path="res://scenes/world/RoomTransition.tscn" id="5_transition"]
`;

  if (options.hasTileset) {
    scene += `[ext_resource type="Script" path="res://scripts/world/RoomTileMap.gd" id="6_tilemap"]
`;
  }

  if (options.biomeTexturePath) {
    scene += `[ext_resource type="Texture2D" path="res://${options.biomeTexturePath}" id="7_biome"]
`;
  }

  scene += `
[sub_resource type="RectangleShape2D" id="floor_shape"]
size = Vector2(${platformWidth}, 64)

[node name="${roomId}" type="Node2D"]

`;

  if (options.hasTileset) {
    scene += `[node name="Ground" type="TileMapLayer" parent="."]
z_index = -1
script = ExtResource("6_tilemap")
biome_id = "biome_${options.biomeIndex}"
room_width = ${platformWidth}
room_height = ${options.height}
tile_size = ${options.tileSize}

`;
  }

  if (options.biomeTexturePath) {
    scene += `[node name="Background" type="TextureRect" parent="."]
z_index = -2
offset_right = ${options.width}.0
offset_bottom = ${options.height}.0
texture = ExtResource("7_biome")
expand_mode = 1
stretch_mode = 6

`;
  } else {
    scene += `[node name="Background" type="ColorRect" parent="."]
offset_right = ${options.width}.0
offset_bottom = ${options.height}.0
color = Color(${0.1 + (index % 3) * 0.05}, ${0.12 + (index % 2) * 0.03}, ${0.18 + (index % 4) * 0.02}, 1)

`;
  }

  scene += `[node name="Floor" type="StaticBody2D" parent="."]
position = Vector2(${platformWidth / 2}, ${floorY})

[node name="CollisionShape2D" type="CollisionShape2D" parent="Floor"]
shape = SubResource("floor_shape")

[node name="FloorVisual" type="ColorRect" parent="Floor"]
offset_left = -${platformWidth / 2}.0
offset_top = -32.0
offset_right = ${platformWidth / 2}.0
offset_bottom = 32.0
color = Color(0.3, 0.32, 0.38, 1)

[node name="Player" parent="." instance=ExtResource("1_player")]
position = Vector2(100, ${floorY - 50})
`;

  if (options.hasEnemy && !options.isBossRoom) {
    const enemyId = `enemy_${options.enemyIndex.toString().padStart(3, '0')}`;
    scene += `
[node name="Enemy" parent="." instance=ExtResource("2_enemy")]
position = Vector2(${platformWidth - 150}, ${floorY - 30})
enemy_id = "${enemyId}"

[node name="Sprite" parent="Enemy"]
sheet_path = "assets/enemies/${enemyId}_walk.png"
frame_size = Vector2i(32, 32)
frame_count = 4
`;
  }

  if (options.isBossRoom) {
    scene += `
[node name="Boss" parent="." instance=ExtResource("3_boss")]
position = Vector2(${platformWidth / 2}, ${floorY - 40})
`;
  }

  if (options.hasAbilityPickup) {
    scene += `
[node name="AbilityPickup" parent="." instance=ExtResource("4_pickup")]
position = Vector2(${platformWidth / 2}, ${floorY - 60})
ability_id = "${options.abilityId}"
display_name = "${options.abilityId}"
`;
  }

  for (const conn of options.connections) {
    const spawnSide = spawnSideForEntry(conn.direction);
    let x = 0;
    let y = floorY - 80;
    switch (conn.direction) {
      case 'up':
        x = platformWidth / 2 - 12;
        y = 48;
        break;
      case 'down':
        x = platformWidth / 2 - 12;
        y = floorY - 96;
        break;
      case 'right':
        x = platformWidth - 24;
        y = floorY - 80;
        break;
      case 'left':
        x = 0;
        y = floorY - 80;
        break;
    }
    scene += `
[node name="Transition_${conn.direction}_${conn.targetRoomId}" parent="." instance=ExtResource("5_transition")]
position = Vector2(${x}, ${y})
target_room_id = "${conn.targetRoomId}"
spawn_side = "${spawnSide}"
transition_direction = "${conn.direction}"
is_optional = ${conn.optional ? 'true' : 'false'}${conn.requirements.length > 0 ? `\nrequired_abilities = PackedStringArray(${conn.requirements.map((r) => `"${r}"`).join(', ')})` : ''}
`;
  }

  return scene;
}

export class GodotProjectAssembler {
  assemble(input: AssemblyInput): AssemblyResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!existsSync(TEMPLATE_PATH)) {
      return {
        success: false,
        projectPath: input.outputDir,
        errors: [`Template not found: ${TEMPLATE_PATH}`],
        warnings,
      };
    }

    try {
      cpSync(TEMPLATE_PATH, input.outputDir, { recursive: true });

      const roomsDir = join(input.outputDir, 'scenes', 'rooms');
      mkdirSync(roomsDir, { recursive: true });

      const abilityId = input.gameDna.abilities.find((a) => a.enabled)?.id ?? 'dash';
      const abilityRoomIndex = Math.floor(input.roomIds.length * 0.3);
      const bossRoomIndex = input.roomIds.length - 1;
      const roomConnections = buildRoomConnections(input.roomIds, input.worldGraph.edges);
      let enemyCounter = 0;

      const roomsData: Record<string, unknown> = {};

      for (let i = 0; i < input.roomIds.length; i++) {
        const roomId = input.roomIds[i]!;
        const isBossRoom = i === bossRoomIndex;
        const hasAbilityPickup = i === abilityRoomIndex;
        const hasEnemy = i > 0 && i < bossRoomIndex && i % 2 === 0;
        const biomeIndex = i % input.gameDna.world.biomeCount;
        const biomeTexRel = `assets/tilesets/biome_${biomeIndex}/source.png`;
        const hasTileset = input.textureFiles?.has(biomeTexRel) ?? false;
        const biomeTexturePath = hasTileset ? biomeTexRel : undefined;

        const enemyIndex = hasEnemy ? enemyCounter++ : 0;
        const connections = roomConnections.get(roomId) ?? [];

        const sceneContent = generateRoomScene(roomId, i, {
          hasEnemy,
          enemyIndex,
          hasAbilityPickup,
          abilityId,
          isBossRoom,
          width: 800,
          height: 600,
          biomeIndex,
          connections,
          biomeTexturePath,
          hasTileset,
          tileSize: input.gameDna.technical.tileSize,
        });

        writeFileSync(join(roomsDir, `${roomId}.tscn`), sceneContent);

        roomsData[roomId] = {
          id: roomId,
          index: i,
          biomeId: `biome_${biomeIndex}`,
          archetype: isBossRoom ? 'boss' : hasAbilityPickup ? 'ability_shrine' : 'combat',
          connections: connections.map((c) => ({
            direction: c.direction,
            targetRoomId: c.targetRoomId,
          })),
        };
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

      writeFileSync(
        join(input.outputDir, 'progression_graph.json'),
        JSON.stringify(input.progressionGraph, null, 2),
      );

      if (input.gameContent) {
        const dataDir = join(input.outputDir, 'data');
        mkdirSync(join(dataDir, 'enemies'), { recursive: true });
        mkdirSync(join(dataDir, 'bosses'), { recursive: true });
        mkdirSync(join(dataDir, 'quests'), { recursive: true });
        mkdirSync(join(dataDir, 'items'), { recursive: true });

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
      }

      if (input.audioFiles && input.audioFiles.size > 0) {
        const sfxDir = join(input.outputDir, 'audio', 'sfx');
        const musicDir = join(input.outputDir, 'audio', 'music');
        mkdirSync(sfxDir, { recursive: true });
        mkdirSync(musicDir, { recursive: true });
        for (const [id, buffer] of input.audioFiles) {
          const dest = id.startsWith('music_')
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
          const relPath = id.startsWith('music_')
            ? `audio/music/${id.replace(/^music_/, '')}.wav`
            : `audio/sfx/${id}.wav`;
          artifacts.push({
            id,
            path: relPath,
            type: 'audio',
            provider: 'procedural',
            fallbackGenerated: true,
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

  validate(godotPath: string | null, projectPath: string): { passed: boolean; output: string } {
    if (!godotPath) {
      return { passed: false, output: 'Godot executable not configured' };
    }

    try {
      const output = execSync(`"${godotPath}" --headless --path "${projectPath}" --quit-after 1`, {
        encoding: 'utf-8',
        timeout: 60000,
        windowsHide: true,
      });
      return { passed: true, output };
    } catch (err) {
      const output =
        err instanceof Error && 'stdout' in err
          ? String((err as { stdout?: string }).stdout)
          : String(err);
      return { passed: false, output };
    }
  }
}

export function getTemplatePath(): string {
  return TEMPLATE_PATH;
}
