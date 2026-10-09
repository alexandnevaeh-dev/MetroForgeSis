import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileCapturedSync as execFileSync, spawnCapturedSync as spawnSync } from './process-capture.js';
import type { ValidationResult, WorldGraph } from '@metroforge/schemas';
import {
  generateId,
  isRegisteredAbilityId,
  genreSupports,
  genreUsesDungeonTools,
  TOP_DOWN_DUNGEON_ITEMS,
  getGameArchetypePlugin,
  resolveGameArchetype,
  type GameArchetype,
  isolatedUserDataEnvironment,
} from '@metroforge/shared';

const TOP_DOWN_ITEM_IDS = new Set<string>(TOP_DOWN_DUNGEON_ITEMS.map((item) => item.id));
import {
  validateWorldConnectivity,
  validateWorldReachability,
  validateMovementFeasibility,
  movementStatsFromJson,
  validateWorldDesign,
  evaluateFullWorldApplicability,
  validateExportFidelity,
  propAllowedInBiome,
  scoreSideViewRoom,
  roomPurposeFromGameplay,
  type ExportedRoomData,
  type BiomeConsistencyContext,
  type EnvironmentArchetypeId,
} from '@metroforge/procedural';
import type { ProgressionGraph } from '@metroforge/schemas';
import { auditRoomArchetypeFidelity, exportedStairApproaches } from '@metroforge/godot';
import { critiqueGameplayScreenshot, critiqueScreenshotDiversity } from '@metroforge/assets';
import { parseSmokeTestOutput } from './smoke-output.js';
import { parsePlaytestOutput, summarizePlaytestBalance } from './playtest-output.js';
import { captureGameplayScreenshots } from './gameplay-capture.js';
import { detectProjectEngine, validateForeignEngineProject } from './engine-validator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');
const DEFAULT_TEMPLATE_DIR = join(REPO_ROOT, 'templates', 'godot-metroidvania');

/**
 * Resolves the correct runtime template to repair-restore from, based on the actual project's
 * own archetype — not a single hardcoded side-view path. A generated TOP_DOWN_ACTION_ADVENTURE
 * project was previously repaired from templates/godot-metroidvania regardless, which meant a
 * missing top-down file would incorrectly get "restored" as its unrelated side-view counterpart
 * (e.g. reintroducing PlayerController.gd's gravity/wall-jump logic into a top-down project that
 * had already replaced it with TopDownPlayerController.gd). Falls back to side-view when
 * game_dna.json is missing/unparseable, matching the previous unconditional behavior.
 */
function resolveTemplateDir(projectPath: string): string {
  try {
    const dna = JSON.parse(readFileSync(join(projectPath, 'game_dna.json'), 'utf-8')) as {
      archetype?: string;
    };
    const plugin = getGameArchetypePlugin(resolveGameArchetype(dna.archetype));
    return join(REPO_ROOT, plugin.runtimeTemplate);
  } catch {
    return DEFAULT_TEMPLATE_DIR;
  }
}

/** Static runtime-template files this generator never customizes per-project (unlike
 *  project.godot and Main.tscn, whose title text gets patched with the game's title —
 *  those are restored separately so the title patch can be reapplied). Safe to restore
 *  verbatim. */
const TEMPLATE_STATIC_FILES = [
  'scenes/world/World.tscn',
  'scenes/player/Player.tscn',
  'scripts/player/PlayerController.gd',
  'scripts/player/AbilityController.gd',
  'scripts/player/AbilityRegistry.gd',
  'scripts/player/PlayerAbility.gd',
  'scripts/player/PlayerMovementConfig.gd',
  'scripts/player/abilities/DashAbility.gd',
  'scripts/player/abilities/DoubleJumpAbility.gd',
  'scripts/player/abilities/WallSlideAbility.gd',
  'scripts/player/abilities/WallJumpAbility.gd',
  'scripts/player/abilities/AirDashAbility.gd',
  'scripts/player/abilities/GroundSlamAbility.gd',
  'scripts/player/abilities/GrappleAbility.gd',
  'scripts/player/abilities/SwimAbility.gd',
  'scripts/player/abilities/PhaseAbility.gd',
  'scenes/world/WeakFloor.tscn',
  'scripts/world/WeakFloor.gd',
  'scenes/world/GrapplePoint.tscn',
  'scripts/world/GrapplePoint.gd',
  'scenes/world/WaterZone.tscn',
  'scripts/world/WaterZone.gd',
  'scenes/world/PhaseBarrier.tscn',
  'scripts/world/PhaseBarrier.gd',
  'scenes/world/SavePoint.tscn',
  'scripts/world/SavePoint.gd',
  'scenes/world/PauseMenu.tscn',
  'scripts/UI/PauseMenu.gd',
  'scripts/UI/QuestPanel.gd',
  'scripts/UI/QuestTrackerPanel.gd',
  'scripts/UI/WorldMapPanel.gd',
  'scripts/UI/MinimapPanel.gd',
  'scripts/UI/GameHUD.gd',
  'scripts/world/WorldManager.gd',
  'scripts/UI/InventoryPanel.gd',
  'scripts/core/SettingsManager.gd',
  'scripts/core/SaveManager.gd',
  'scripts/core/MapManager.gd',
  'scripts/core/InventoryManager.gd',
  'scripts/core/EventBus.gd',
  'scripts/UI/TitleScreen.gd',
  'scripts/test/RuntimeSmokeTest.gd',
  'scenes/test/RuntimeSmokeTest.tscn',
  'scenes/world/NPC.tscn',
  'scripts/world/NPC.gd',
  'scripts/core/QuestManager.gd',
  'scripts/core/DialogueManager.gd',
  'scripts/UI/DialogueOverlay.gd',
  'scenes/world/DialogueOverlay.tscn',
  'scripts/core/ShopManager.gd',
  'scripts/core/VFXManager.gd',
  'scripts/core/QualityPresentation.gd',
  'scripts/combat/CombatFeedback.gd',
  'scripts/player/CameraDirector.gd',
  'scripts/core/ReadabilityOutline.gd',
  'scripts/shaders/sprite_outline.gdshader',
  'scripts/world/TransitionFader.gd',
  'scripts/UI/ShopOverlay.gd',
  'scenes/world/ShopOverlay.tscn',
  'scenes/world/ItemPickup.tscn',
  'scripts/world/ItemPickup.gd',
  'scripts/core/WorldPropSprite.gd',
  'scenes/enemies/Projectile.tscn',
  'scripts/combat/Projectile.gd',
  'scripts/test/PlaytestAgent.gd',
  'scripts/test/PlaytestRunner.gd',
  'scenes/test/PlaytestRunner.tscn',
  // TOP_DOWN_ACTION_ADVENTURE-only entries — harmlessly skipped for side-view projects via
  // restoreTemplateFile's existsSync(src) guard, since these paths don't exist in that template.
  // No per-area .tscn files here: OverworldManager.gd spawns everything at runtime from
  // data/world/overworld.json instead of loading a pre-baked scene per room (see assembler.ts).
  'scripts/player/TopDownPlayerController.gd',
  'scripts/player/TopDownCamera.gd',
  'scripts/world/OverworldManager.gd',
  'scripts/world/ChestPickup.gd',
  'scripts/world/LockedDoor.gd',
  'scripts/world/ItemGate.gd',
  'scripts/world/AreaPortal.gd',
  'scripts/world/FloorSwitch.gd',
  'scripts/world/VictoryShrine.gd',
];

/** Richer than `passed` alone: SOFT_FAIL/SKIPPED both count as `passed: true` (they don't
 *  block completion) but callers that need to distinguish "genuinely verified" from
 *  "couldn't be verified" or "had a non-blocking issue" should read this instead of just
 *  `passed`. Optional so existing call sites/tests that construct a QAGateResult literal
 *  without it keep compiling — callers should treat a missing `state` as `passed ? 'PASS' :
 *  'FAIL'`. */
export type QAGateState = 'PASS' | 'FAIL' | 'SOFT_FAIL' | 'SKIPPED' | 'UNKNOWN';

export interface QAGateResult {
  gate: string;
  passed: boolean;
  message: string;
  state?: QAGateState;
  details?: Record<string, unknown>;
}

/** `result.state` if set, else derived from `passed` for older call sites/test literals that
 *  predate the `state` field. */
export function gateState(result: QAGateResult): QAGateState {
  return result.state ?? (result.passed ? 'PASS' : 'FAIL');
}

export interface QAReport {
  passed: boolean;
  results: QAGateResult[];
  validationResults: ValidationResult[];
}

const REQUIRED_FILES = [
  'project.godot',
  'project.json',
  'game_dna.json',
  'world_graph.json',
  'progression_graph.json',
  'generation_manifest.json',
  'data/player/movement.json',
  'scenes/boot/Main.tscn',
  'scenes/world/World.tscn',
  'scenes/player/Player.tscn',
  'scenes/world/PauseMenu.tscn',
  'scripts/UI/PauseMenu.gd',
  'scripts/core/MapManager.gd',
  'scripts/UI/WorldMapPanel.gd',
  'scripts/UI/MinimapPanel.gd',
  'scripts/core/InventoryManager.gd',
  'scripts/UI/InventoryPanel.gd',
  'scripts/UI/QuestPanel.gd',
  'scripts/UI/QuestTrackerPanel.gd',
  'scripts/core/SettingsManager.gd',
  'scenes/world/NPC.tscn',
  'scripts/world/NPC.gd',
  'scripts/core/QuestManager.gd',
  'scripts/core/EventBus.gd',
  'scripts/core/DialogueManager.gd',
  'scripts/UI/DialogueOverlay.gd',
  'scenes/world/DialogueOverlay.tscn',
  'scripts/core/ShopManager.gd',
  'scripts/core/VFXManager.gd',
  'scripts/UI/ShopOverlay.gd',
  'scenes/world/ShopOverlay.tscn',
  'scenes/world/ItemPickup.tscn',
  'scripts/world/ItemPickup.gd',
  'scripts/core/WorldPropSprite.gd',
  'scenes/enemies/Projectile.tscn',
  'scripts/combat/Projectile.gd',
  'scenes/world/WeakFloor.tscn',
  'scripts/world/WeakFloor.gd',
];

const REQUIRED_INPUT_ACTIONS = [
  'move_left',
  'move_right',
  'move_up',
  'move_down',
  'jump',
  'attack',
  'dash',
  'pause',
  'interact',
];

export class QAValidator {
  validateProject(projectPath: string, projectId: string): QAReport {
    const engine = detectProjectEngine(projectPath);
    if (engine === 'unity' || engine === 'unreal') {
      return validateForeignEngineProject(projectPath, engine);
    }

    const results: QAGateResult[] = [];

    // Gate: required files. The player controller filename genuinely differs by archetype
    // (PlayerController.gd for side-view, TopDownPlayerController.gd for top-down) — read here
    // early since REQUIRED_FILES itself can't hardcode one or the other.
    const earlyArchetype = readProjectArchetype(projectPath);
    const requiredFiles = [
      ...REQUIRED_FILES,
      genreSupports(earlyArchetype, 'supportsFreePlanarMovement')
        ? 'scripts/player/TopDownPlayerController.gd'
        : 'scripts/player/PlayerController.gd',
    ];
    const missingFiles = requiredFiles.filter((f) => !existsSync(join(projectPath, f)));
    results.push({
      gate: 'required_files',
      passed: missingFiles.length === 0,
      message:
        missingFiles.length === 0
          ? 'All required files present'
          : `Missing: ${missingFiles.join(', ')}`,
      details: { missingFiles },
    });

    // Gate: game DNA valid
    let dnaValid = false;
    let dnaAbilities: string[] = [];
    let dnaArchetype: string | undefined;
    try {
      const dna = JSON.parse(readFileSync(join(projectPath, 'game_dna.json'), 'utf-8'));
      dnaValid = !!dna.identity?.title && !!dna.world?.roomCount;
      dnaAbilities = (dna.abilities ?? [])
        .filter((a: { enabled?: boolean }) => a.enabled !== false)
        .map((a: { id: string }) => a.id);
      dnaArchetype = dna.archetype;
    } catch {
      dnaValid = false;
    }
    results.push({
      gate: 'game_dna_valid',
      passed: dnaValid,
      message: dnaValid ? 'Game DNA valid' : 'Game DNA invalid or missing',
    });

    // TOP_DOWN_ACTION_ADVENTURE's GameDNA.abilities holds dungeon tool items
    // (pickTopDownDungeonItems() — see generators/game-dna.ts), not movement ability IDs, so
    // this gate checks each id against the right registry for the project's actual archetype
    // rather than always assuming side-view REGISTERED_ABILITIES.
    const isTopDown = genreUsesDungeonTools(dnaArchetype as GameArchetype | undefined);
    const unknownAbilities = dnaAbilities.filter((id) =>
      isTopDown ? !TOP_DOWN_ITEM_IDS.has(id) : !isRegisteredAbilityId(id),
    );
    results.push({
      gate: 'registered_abilities_valid',
      passed: unknownAbilities.length === 0,
      message:
        unknownAbilities.length === 0
          ? 'All generated abilities have runtime implementations'
          : `Unimplemented ${isTopDown ? 'dungeon item' : 'ability'} IDs (repairable=false): ${unknownAbilities.join(', ')}. ` +
            `Remap to registered runtime ids — do not invent GDScript stubs.`,
      details: {
        unknownAbilities,
        abilityIds: dnaAbilities,
        archetype: dnaArchetype,
        repairable: false,
      },
    });

    // Gates: world connectivity and ability-gated reachability, both proven against the real
    // assembled world graph (not just the small abstract progression chain — see
    // packages/procedural/src/world.ts for why both checks exist and what each isolates).
    let connected = false;
    let disconnectedCount = 0;
    let worldReachable = false;
    let worldUnreachableCount = 0;
    try {
      const worldGraph = JSON.parse(
        readFileSync(join(projectPath, 'world_graph.json'), 'utf-8'),
      ) as WorldGraph;
      const connectivity = validateWorldConnectivity(worldGraph);
      connected = connectivity.connected;
      disconnectedCount = connectivity.unreachableRoomIds.length;

      const reachability = validateWorldReachability(worldGraph, new Set());
      worldReachable = reachability.reachable;
      worldUnreachableCount = reachability.unreachableRoomIds.length;
    } catch {
      connected = false;
      worldReachable = false;
    }
    results.push({
      gate: 'world_connectivity',
      passed: connected,
      message: connected
        ? 'All rooms reachable from start'
        : `${disconnectedCount} room(s) disconnected from start`,
    });
    results.push({
      gate: 'world_reachability',
      passed: worldReachable,
      message: worldReachable
        ? 'All rooms reachable via progressive ability pickup'
        : `${worldUnreachableCount} room(s) unreachable via ability pickup`,
    });

    let movementFeasible = true;
    let movementIssueCount = 0;
    try {
      const worldGraph = JSON.parse(
        readFileSync(join(projectPath, 'world_graph.json'), 'utf-8'),
      ) as WorldGraph;
      const movementPath = join(projectPath, 'data', 'player', 'movement.json');
      const movementRaw = existsSync(movementPath)
        ? (JSON.parse(readFileSync(movementPath, 'utf-8')) as Record<string, unknown>)
        : {};
      const feasibility = validateMovementFeasibility(
        worldGraph,
        movementStatsFromJson(movementRaw),
        undefined,
        exportedStairApproaches(projectPath,worldGraph),
      );
      movementFeasible = feasibility.feasible;
      movementIssueCount = feasibility.issues.length;
      results.push({
        gate: 'movement_feasibility',
        passed: movementFeasible,
        message: movementFeasible
          ? 'Ability gates align with jump/dash reach and transition axes'
          : `${movementIssueCount} movement-infeasible gate(s): ${feasibility.issues
              .slice(0, 3)
              .map((i) => i.reason)
              .join('; ')}`,
        details: {
          issues: feasibility.issues,
          metrics: feasibility.metrics,
        },
      });
    } catch {
      results.push({
        gate: 'movement_feasibility',
        passed: false,
        message: 'Could not evaluate movement feasibility',
      });
    }

    try {
      const worldGraph = JSON.parse(
        readFileSync(join(projectPath, 'world_graph.json'), 'utf-8'),
      ) as WorldGraph;
      const roomsJson = JSON.parse(
        readFileSync(join(projectPath, 'data', 'rooms', 'rooms.json'), 'utf-8'),
      ) as { rooms?: Record<string, { archetype?: string; worldArchetype?: string }> };
      const fidelity = auditRoomArchetypeFidelity(worldGraph, roomsJson.rooms ?? {});
      results.push({
        gate: 'room_archetype_fidelity',
        passed: fidelity.passed,
        message: fidelity.passed
          ? `Room archetypes preserved (${fidelity.preserved} matched, ${fidelity.overridden} intentional overrides)`
          : `${fidelity.issues.length} archetype collapse(s): ${fidelity.issues
              .slice(0, 3)
              .map((i) => `${i.roomId} ${i.worldArchetype}->${i.publishedArchetype}`)
              .join('; ')}`,
        details: fidelity,
      });

      const envTagged = worldGraph.nodes.filter(
        (n) => n.type === 'room' && typeof n.metadata?.environmentArchetype === 'string',
      );
      const envDistinct = new Set(
        envTagged.map((n) => String(n.metadata?.environmentArchetype ?? '')),
      );
      const envOk = envTagged.length === 0 || envDistinct.size >= Math.min(2, envTagged.length);
      results.push({
        gate: 'environment_archetype_identity',
        passed: envOk,
        message:
          envTagged.length === 0
            ? 'No environmentArchetype metadata (pre-architecture projects) — skip'
            : envOk
              ? `Environment archetypes present (${envDistinct.size} distinct across ${envTagged.length} rooms)`
              : 'All rooms share one environmentArchetype — architectural identity collapsed',
        details: { tagged: envTagged.length, distinct: [...envDistinct] },
      });

      // Side-view composition: chronically flat boxes / missing gallery bands fail clearly.
      // Top-down projects skip (their layoutMetrics / gallery bands are N/A).
      const gameDnaPath = join(projectPath, 'game_dna.json');
      let projectArchetype = 'SIDE_VIEW_METROIDVANIA';
      try {
        if (existsSync(gameDnaPath)) {
          const dna = JSON.parse(readFileSync(gameDnaPath, 'utf-8')) as { archetype?: string };
          projectArchetype = dna.archetype ?? projectArchetype;
        }
      } catch {
        /* keep default */
      }
      const isTopDownProject = /top.?down/i.test(projectArchetype);
      if (isTopDownProject) {
        results.push({
          gate: 'side_view_room_composition',
          passed: true,
          state: 'SKIPPED',
          message: 'Top-down project — side-view gallery/composition checks do not apply',
        });
      } else {
        const roomsFull = JSON.parse(
          readFileSync(join(projectPath, 'data', 'rooms', 'rooms.json'), 'utf-8'),
        ) as {
          rooms?: Record<
            string,
            {
              archetype?: string;
              worldArchetype?: string;
              width?: number;
              height?: number;
              tileSize?: number;
              layoutMetrics?: {
                platformCount?: number;
                uniquePlatformHeights?: number;
                decorationDensity?: number;
                traversableAreaRatio?: number;
                combatSpacePx?: number;
              };
            }
          >;
        };
        const roomEntries = Object.entries(roomsFull.rooms ?? {});
        const scored: Array<{ roomId: string; total: number; reasons: string[] }> = [];
        for (const [roomId, room] of roomEntries) {
          const node = worldGraph.nodes.find((n) => n.id === roomId);
          const envRaw = node?.metadata?.environmentArchetype;
          const envId =
            typeof envRaw === 'string' && envRaw.length > 0
              ? (envRaw as EnvironmentArchetypeId)
              : ('generic_chamber' as EnvironmentArchetypeId);
          const gp =
            (typeof node?.metadata?.archetype === 'string'
              ? node.metadata.archetype
              : room.worldArchetype ?? room.archetype) ?? 'combat';
          const m = room.layoutMetrics ?? {};
          const tileSize = room.tileSize ?? 16;
          const wTiles = Math.max(1, Math.floor((room.width ?? 800) / tileSize));
          const hTiles = Math.max(1, Math.floor((room.height ?? 600) / tileSize));
          const quality = scoreSideViewRoom({
            environmentArchetype: envId,
            roomPurpose: roomPurposeFromGameplay(String(gp)),
            widthTiles: wTiles,
            heightTiles: hTiles,
            platformCount: m.platformCount ?? 0,
            uniquePlatformHeights: m.uniquePlatformHeights ?? 0,
            galleryBandsAchieved: Math.max(0, (m.uniquePlatformHeights ?? 0) - 1),
            hasLandmark: (m.platformCount ?? 0) >= 2 || (m.uniquePlatformHeights ?? 0) >= 2,
            decorationDensity: m.decorationDensity ?? 0,
            traversableAreaRatio: m.traversableAreaRatio ?? 0.5,
            biomeMaterialMatch: true,
            combatBowlOpen:
              String(gp) === 'combat' || String(gp) === 'boss' || String(gp) === 'arena'
                ? (m.combatSpacePx ?? 0) > 8000 || (m.traversableAreaRatio ?? 0) >= 0.4
                : true,
          });
          const reasons: string[] = [];
          if (quality.galleryStructure < 50) reasons.push('weak gallery/balcony structure');
          if (quality.composition < 50) reasons.push('flat or jumbled composition');
          if (quality.silhouetteVariety < 50) reasons.push('silhouette lacks height variety');
          if (quality.decorationIntegration < 40) reasons.push('chronically sparse decoration');
          scored.push({ roomId, total: quality.total, reasons });
        }
        const chronic = scored.filter((s) => s.total < 55);
        const avgTotal =
          scored.length > 0
            ? Math.round(scored.reduce((a, s) => a + s.total, 0) / scored.length)
            : 0;
        const compositionOk = scored.length === 0 || chronic.length / scored.length <= 0.35;
        results.push({
          gate: 'side_view_room_composition',
          passed: compositionOk,
          message: compositionOk
            ? `Side-view room composition OK (avg score ${avgTotal}, ${chronic.length}/${scored.length} chronically weak)`
            : `Chronic side-view composition failure: ${chronic.length}/${scored.length} rooms score <55 (avg ${avgTotal}) — flat boxes / missing galleries. Examples: ${chronic
                .slice(0, 3)
                .map((c) => `${c.roomId}(${c.total}${c.reasons.length ? ':' + c.reasons.join('+') : ''})`)
                .join('; ')}`,
          details: {
            avgScore: avgTotal,
            chronicCount: chronic.length,
            roomCount: scored.length,
            chronic: chronic.slice(0, 8),
          },
        });
      }

      // Hard biome material reject — kit props must not match BiomeVisualDNA.forbiddenPatterns.
      // Pipeline writes biomes under data/visual/ (see generation pipeline visualDir).
      const biomesPathCandidates = [
        join(projectPath, 'data', 'visual', 'biomes.json'),
        join(projectPath, 'visual', 'biomes.json'),
      ];
      const kitsPathCandidates = [
        join(projectPath, 'data', 'visual', 'environment_kits.json'),
        join(projectPath, 'visual', 'environment_kits.json'),
      ];
      const biomesPath = biomesPathCandidates.find((p) => existsSync(p));
      const kitsPath = kitsPathCandidates.find((p) => existsSync(p));
      if (!biomesPath) {
        results.push({
          gate: 'biome_material_hard_reject',
          passed: true,
          state: 'SKIPPED',
          message: 'No data/visual/biomes.json — skip biome material hard-reject',
        });
      } else {
        const biomes = JSON.parse(readFileSync(biomesPath, 'utf-8')) as BiomeConsistencyContext[];
        const kits = kitsPath
          ? (JSON.parse(readFileSync(kitsPath, 'utf-8')) as Array<{
              biomeId?: string;
              props?: Array<{ family?: string; id?: string; description?: string }>;
            }>)
          : [];
        const violations: string[] = [];
        for (const biome of biomes) {
          for (const family of biome.propFamilies ?? []) {
            if (!propAllowedInBiome(family, biome)) {
              violations.push(`${biome.biomeId}:propFamily:${family}`);
            }
          }
          const kit = kits.find((k) => k.biomeId === biome.biomeId);
          for (const prop of kit?.props ?? []) {
            const label = prop.family ?? prop.id ?? prop.description ?? '';
            if (label && !propAllowedInBiome(label, biome)) {
              violations.push(`${biome.biomeId}:kit:${label}`);
            }
          }
        }
        results.push({
          gate: 'biome_material_hard_reject',
          passed: violations.length === 0,
          message:
            violations.length === 0
              ? `Biome material hard-reject clean (${biomes.length} biome(s))`
              : `${violations.length} forbidden material/prop hit(s): ${violations.slice(0, 4).join('; ')}`,
          details: { violations: violations.slice(0, 20), biomeCount: biomes.length },
        });
      }
    } catch {
      results.push({
        gate: 'room_archetype_fidelity',
        passed: false,
        message: 'Could not evaluate room archetype fidelity',
      });
    }

    // Gate: full-world Metroidvania structure (zones, layout consistency, distinct gate kinds,
    // return loops, teaching rooms, tease metadata — see packages/procedural/src/world-design.ts).
    // Side-view only: the checks reason about Metroidvania zone/gate concepts that don't apply to
    // TOP_DOWN_ACTION_ADVENTURE's single-overworld model. Not applicable (and reported as such,
    // not silently passed) for any world declaring fewer than MIN_FULL_WORLD_ZONES zones — a
    // VISUAL_VERTICAL_SLICE or TINY_TEST slice is not expected to contain a whole four-zone world.
    if (isTopDown) {
      results.push({ gate: 'world_design_metroidvania', passed: true, state: 'SKIPPED', message: 'Not applicable to TOP_DOWN_ACTION_ADVENTURE' });
    } else {
      try {
        const worldGraph = JSON.parse(readFileSync(join(projectPath, 'world_graph.json'), 'utf-8')) as WorldGraph;
        const progressionGraph = JSON.parse(readFileSync(join(projectPath, 'progression_graph.json'), 'utf-8')) as ProgressionGraph;
        const applicability = evaluateFullWorldApplicability(worldGraph);
        if (!applicability.applicable) {
          results.push({ gate: 'world_design_metroidvania', passed: true, state: 'SKIPPED', message: applicability.reason });
        } else {
          const roomsJson = JSON.parse(readFileSync(join(projectPath, 'data', 'rooms', 'rooms.json'), 'utf-8')) as {
            rooms?: Record<string, { width?: number; height?: number }>;
          };
          const roomExtents = Object.entries(roomsJson.rooms ?? {}).map(([id, r]) => ({
            id,
            width: r.width ?? 800,
            height: r.height ?? 600,
          }));
          const design = validateWorldDesign({ worldGraph, progressionGraph, roomExtents });
          results.push({
            gate: 'world_design_metroidvania',
            passed: design.passed,
            message: design.passed
              ? `${design.zoneCount} zones, ${design.gateTypeCounts.movement} movement + ${design.gateTypeCounts.combat} combat gate(s), ${design.shortcutCount} shortcut(s), ${design.teachingRoomCount} teaching room(s)`
              : `${design.issues.length} world-design issue(s): ${design.issues.slice(0, 3).map((i) => `[${i.code}] ${i.message}`).join('; ')}`,
            details: { issues: design.issues, zoneCount: design.zoneCount, gateTypeCounts: design.gateTypeCounts, layout: design.layout },
          });
        }
      } catch (err) {
        results.push({
          gate: 'world_design_metroidvania',
          passed: false,
          message: `Could not evaluate world design: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    // Gate: export fidelity (packages/procedural/src/export-fidelity.ts) — does the actual
    // exported project (data/rooms/rooms.json's real doors/obstacles) agree with the WorldGraph
    // that was supposed to produce it? world_design_metroidvania and generateWorldDesignReport
    // both read the same in-memory WorldGraph the pipeline just built, which proves the graph and
    // the report agree with *each other* but nothing about whether room-assembler.ts's own
    // door/obstacle-placement logic actually preserved every edge/requirement/physical obstacle
    // when it built the real project. Applies to every side-view world regardless of zone count —
    // export fidelity is not a "full world" concept, a VISUAL_VERTICAL_SLICE's doors can drift
    // from its graph just as easily.
    if (isTopDown) {
      results.push({ gate: 'export_fidelity', passed: true, state: 'SKIPPED', message: 'Not applicable to TOP_DOWN_ACTION_ADVENTURE' });
    } else {
      try {
        const worldGraph = JSON.parse(readFileSync(join(projectPath, 'world_graph.json'), 'utf-8')) as WorldGraph;
        const roomsJson = JSON.parse(readFileSync(join(projectPath, 'data', 'rooms', 'rooms.json'), 'utf-8')) as {
          rooms?: Record<string, ExportedRoomData>;
        };
        const fidelity = validateExportFidelity(worldGraph, roomsJson.rooms ?? {});
        results.push({
          gate: 'export_fidelity',
          passed: fidelity.passed,
          message: fidelity.passed
            ? `${worldGraph.edges.length} edge(s) verified against the exported project's real doors/obstacles`
            : `${fidelity.issues.length} export-fidelity issue(s): ${fidelity.issues.slice(0, 3).map((i) => `[${i.code}] ${i.message}`).join('; ')}`,
          details: { issues: fidelity.issues },
        });
      } catch (err) {
        results.push({
          gate: 'export_fidelity',
          passed: false,
          message: `Could not evaluate export fidelity: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    // Gate: rooms exist. TOP_DOWN_ACTION_ADVENTURE has no per-room .tscn files at all —
    // OverworldManager.gd reads data/world/overworld.json directly at runtime and spawns
    // ground/collision/POIs from that data instead of loading a pre-baked scene per area — so
    // "required scenes" for that archetype means the overworld data file, not scenes/rooms/*.tscn.
    let roomCount = 0;
    let scenesPassed: boolean;
    if (isTopDown) {
      scenesPassed = existsSync(join(projectPath, 'data', 'world', 'overworld.json'));
    } else {
      const roomsDir = join(projectPath, 'scenes', 'rooms');
      roomCount = existsSync(roomsDir)
        ? readdirSync(roomsDir).filter((f) => f.endsWith('.tscn')).length
        : 0;
      scenesPassed = roomCount >= 1;
    }
    results.push({
      gate: 'required_scenes_exist',
      passed: scenesPassed,
      message: isTopDown
        ? scenesPassed
          ? 'Top-down overworld data present'
          : 'Missing data/world/overworld.json'
        : `${roomCount} room scene(s) found`,
      details: { roomCount, isTopDown },
    });

    // Gate: scenes/world/World.tscn's root "World" node actually uses this archetype's own
    // manager script — catches a step (a genre-blind post-processing pass, a stray manual copy,
    // anything run after the rest of these gates already passed) silently swapping the scene for
    // the other genre's. Not hypothetical: a genre-blind quality-repair pass used to copy the
    // side-view WorldManager.gd into a top-down project and rewrite World.tscn to use it, *after*
    // every other gate here had already validated the real OverworldManager.gd-based scene — see
    // docs/debug/TOPDOWN_GENRE_MILESTONE.md. That pass is now archetype-gated off
    // (packages/generation/src/pipeline.ts), but this gate is the regression check that would
    // actually catch it (or anything else with the same failure shape) if that scoping ever
    // regresses, rather than relying on the scoping fix alone.
    results.push(validateWorldSceneArchetypeIntegrity(projectPath, isTopDown));

    // Gate: every ext_resource path referenced by a scene file actually exists on disk —
    // catches missing textures/audio/scripts/scenes the asset pipeline or assembler failed to
    // write (spec §33), which no other gate here checks.
    const missingReferences = findMissingAssetReferences(projectPath);
    results.push({
      gate: 'asset_references_valid',
      passed: missingReferences.length === 0,
      message:
        missingReferences.length === 0
          ? 'All scene resource references resolve'
          : `${missingReferences.length} missing resource reference(s)`,
      details: { missingReferences },
    });

    // Gate: input actions
    let inputValid = false;
    try {
      const godotProject = readFileSync(join(projectPath, 'project.godot'), 'utf-8');
      inputValid = REQUIRED_INPUT_ACTIONS.every((a) => godotProject.includes(`${a}=`));
    } catch {
      inputValid = false;
    }
    results.push({
      gate: 'input_actions_exist',
      passed: inputValid,
      message: inputValid ? 'Input actions configured' : 'Missing input actions',
    });

    // Gate: player spawn (Player.tscn exists and rooms reference player)
    const playerExists = existsSync(join(projectPath, 'scenes', 'player', 'Player.tscn'));
    results.push({
      gate: 'player_spawn_valid',
      passed: playerExists,
      message: playerExists ? 'Player scene exists' : 'Player scene missing',
    });

    // Gate: main scene
    let mainSceneValid = false;
    try {
      const godotProject = readFileSync(join(projectPath, 'project.godot'), 'utf-8');
      mainSceneValid =
        godotProject.includes('run/main_scene=') &&
        existsSync(join(projectPath, 'scenes', 'boot', 'Main.tscn'));
    } catch {
      mainSceneValid = false;
    }
    results.push({
      gate: 'main_scene_starts',
      passed: mainSceneValid,
      message: mainSceneValid ? 'Main scene configured' : 'Main scene invalid',
    });

    const readAttackPaths = (relativeJson: string, key: string, prefix: string): string[] => {
      const jsonPath = join(projectPath, relativeJson);
      if (!existsSync(jsonPath)) return [];
      try {
        const data = JSON.parse(readFileSync(jsonPath, 'utf-8')) as Record<string, Array<{ id: string }>>;
        return (data[key] ?? []).map((entry) => `${prefix}/${entry.id}_attack.png`);
      } catch {
        return [];
      }
    };

    const attackSheets = [
      'assets/characters/player_attack.png',
      ...readAttackPaths('data/enemies/enemies.json', 'enemies', 'assets/enemies'),
      ...readAttackPaths('data/bosses/bosses.json', 'bosses', 'assets/bosses'),
    ];
    const missingAttackSheets = attackSheets.filter((p) => !existsSync(join(projectPath, p)));
    results.push({
      gate: 'attack_sheets_exist',
      passed: missingAttackSheets.length === 0,
      message:
        missingAttackSheets.length === 0
          ? `${attackSheets.length} attack sheet(s) present`
          : `${missingAttackSheets.length} attack sheet(s) missing`,
      details: { missingAttackSheets },
    });

    const vfxTextures = [
      'assets/vfx/hit_spark.png',
      'assets/vfx/death_puff.png',
      'assets/vfx/dash_trail.png',
      'assets/vfx/pickup_spark.png',
      'assets/vfx/ability_unlock.png',
      'assets/vfx/boss_phase_shift.png',
      'assets/vfx/area_burst.png',
      'assets/vfx/slam_shock.png',
    ];
    const missingVfx = vfxTextures.filter((p) => !existsSync(join(projectPath, p)));
    results.push({
      gate: 'vfx_textures_exist',
      passed: missingVfx.length === 0,
      message:
        missingVfx.length === 0
          ? `${vfxTextures.length} VFX texture(s) present`
          : `${missingVfx.length} VFX texture(s) missing`,
      details: { missingVfx },
    });

    // All static gates above are plain pass/fail — fill in `state` uniformly here.
    for (const r of results) {
      r.state ??= r.passed ? 'PASS' : 'FAIL';
    }

    const passed = results.every((r) => r.passed);
    const now = new Date().toISOString();

    const validationResults: ValidationResult[] = results.map((r) => ({
      id: generateId('val'),
      projectId,
      gate: r.gate,
      passed: r.passed,
      message: r.message,
      details: r.details,
      timestamp: now,
    }));

    return { passed, results, validationResults };
  }

  /** Runs Godot's own headless import pass — required once for any project before
   *  global `class_name` scripts resolve or textures/audio load as typed resources.
   *  Without this, a fresh (never-opened) project spuriously reports "Could not find
   *  type X" / "No loader found for resource" errors that have nothing to do with
   *  whether the generated project is actually correct. Failure here is tolerated
   *  (best-effort) — the subsequent gate still runs and will surface any real problem. */
  private runGodotImport(godotPath: string, projectPath: string, userDataDir?: string): void {
    try {
      execFileSync(godotPath, ['--headless', '--path', projectPath, '--import'], {
        encoding: 'utf-8',
        timeout: 120000,
        windowsHide: true,
        env: userDataDir
          ? { ...process.env, ...isolatedUserDataEnvironment(userDataDir) }
          : undefined,
      });
    } catch {
      // best-effort — an import failure will surface as a real error in the gate that follows
    }
  }

  validateGodotHeadless(godotPath: string, projectPath: string, options?: { userDataDir?: string }): QAGateResult {
    if (!existsSync(godotPath)) {
      return {
        gate: 'godot_imports',
        passed: true,
        state: 'SKIPPED',
        message: 'NEEDS_RUNTIME_VALIDATION: GODOT_NOT_AVAILABLE',
      };
    }
    this.runGodotImport(godotPath, projectPath, options?.userDataDir);

    try {
      const output = execFileSync(godotPath, ['--headless', '--path', projectPath, '--quit-after', '1'], {
        encoding: 'utf-8',
        timeout: 60000,
        windowsHide: true,
        env: options?.userDataDir
          ? { ...process.env, ...isolatedUserDataEnvironment(options.userDataDir) }
          : undefined,
      });
      const hasParseError =
        output.includes('Parse Error') ||
        output.includes('Failed to load') ||
        output.includes('ERROR:');
      return {
        gate: 'godot_imports',
        passed: !hasParseError,
        state: hasParseError ? 'FAIL' : 'PASS',
        message: hasParseError ? 'Godot reported errors' : 'Godot headless OK',
        details: { output: output.slice(0, 2000) },
      };
    } catch (err) {
      const stdout =
        err instanceof Error && 'stdout' in err ? String((err as { stdout?: string }).stdout ?? '') : '';
      const stderr =
        err instanceof Error && 'stderr' in err ? String((err as { stderr?: string }).stderr ?? '') : '';
      const message = err instanceof Error ? err.message : String(err);
      const output = [stdout, stderr, message].filter(Boolean).join('\n');
      return {
        gate: 'godot_imports',
        passed: false,
        state: 'FAIL',
        message: 'Godot headless failed',
        details: { output: output.slice(0, 2000) },
      };
    }
  }

  /** Runs the generated project's own runtime smoke-test scene
   *  (scripts/test/RuntimeSmokeTest.gd, copied into every project from the template) —
   *  a real Godot execution that spawns the player, loads rooms, instantiates
   *  enemies/boss, triggers an ability pickup, proves an ability-gated transition
   *  actually blocks/unblocks, and exercises save/load. Distinct from
   *  `validateGodotHeadless`, which only proves the project *imports* — this proves
   *  core gameplay systems actually run. */
  validateGodotRuntime(godotPath: string, projectPath: string, options?: { userDataDir?: string }): QAGateResult {
    const smokeTestScene = join(projectPath, 'scenes', 'test', 'RuntimeSmokeTest.tscn');
    if (!existsSync(smokeTestScene)) {
      return {
        gate: 'godot_runtime',
        passed: false,
        state: 'UNKNOWN',
        message: 'Runtime smoke test scene not found in project (stale template copy?)',
      };
    }

    this.runGodotImport(godotPath, projectPath, options?.userDataDir);

    const runtime = spawnSync(godotPath, [
      '--headless',
      '--path',
      projectPath,
      '--scene',
      'res://scenes/test/RuntimeSmokeTest.tscn',
      '--quit-after',
      '1800',
    ], {
      encoding: 'utf-8',
      timeout: 90000,
      windowsHide: true,
      env: options?.userDataDir
        ? { ...process.env, ...isolatedUserDataEnvironment(options.userDataDir) }
        : undefined,
    });
    const output = `${runtime.stdout ?? ''}\n${runtime.stderr ?? ''}${runtime.error ? `\n${runtime.error.message}` : ''}`;
    const exitCode = runtime.status ?? 1;

    const parsed = parseSmokeTestOutput(output);
    const { checks, ranToCompletion, passedCount, failed } = parsed;
    const runtimeReady = output.includes('METROFORGE_RUNTIME_READY');
    const softFailed = parsed.softFailed.length > 0;
    // A soft-fail (e.g. "this seed happened to generate zero projectile-type enemies, so
    // there was nothing to test") must never be conflated with a hard failure — it's still a
    // PASS for completion purposes, just flagged distinctly so a human/log can see it. A run
    // that didn't reach the results marker at all (crash/hang/timeout) is UNKNOWN, not a
    // silent pass — we genuinely don't know whether the gameplay it never got to exercise
    // actually works.
    const state: QAGateState = !ranToCompletion || !runtimeReady
      ? 'UNKNOWN'
      : failed.length > 0 || exitCode !== 0
        ? 'FAIL'
        : softFailed
          ? 'SOFT_FAIL'
          : 'PASS';
    const passed = state === 'PASS' || state === 'SOFT_FAIL';

    return {
      gate: 'godot_runtime',
      passed,
      state,
      message: ranToCompletion
        ? `${passedCount}/${checks.length} runtime checks passed${failed.length > 0 ? ` (failed: ${failed.join(', ')})` : ''}`
        : 'Smoke test did not emit gameplay-ready evidence — Godot crashed or hung',
      details: {
        checks: parsed.checks,
        runtimeReady,
        runtimeReadyMarker: runtimeReady ? 'METROFORGE_RUNTIME_READY' : null,
        exitCode,
        timedOut: runtime.error?.message?.includes('ETIMEDOUT') ?? false,
        output: output.slice(-4000),
      },
    };
  }

  /** Critiques `qa/screenshot_gameplay.png` written by RuntimeSmokeTest.
   *  For non-RC profiles, missing/blank frames are SKIPPED (not a generation failure).
   *  For RELEASE_CANDIDATE (`required: true`), missing or blank capture is a hard FAIL. */
  validateGameplayScreenshot(
    projectPath: string,
    options?: { required?: boolean; godotPath?: string; headlessOutput?: string; userDataDir?: string },
  ): QAGateResult {
    const required = options?.required === true;
    if (options?.godotPath && (required || options.headlessOutput)) {
      try {
        const capture = captureGameplayScreenshots({
          godotPath: options.godotPath,
          projectPath,
          headlessOutput: options.headlessOutput,
          userDataDir: options.userDataDir,
        });
        if (capture.strategy === 'failed') return { gate: 'gameplay_screenshot_qa', passed: false, state: 'FAIL', message: capture.reason ?? 'Gameplay capture failed', details: { capture } };
      } catch (error) {
        return { gate: 'gameplay_screenshot_qa', passed: false, state: 'FAIL', message: `Gameplay capture failed: ${String(error)}` };
      }
    }
    const screenshotPath = join(projectPath, 'qa', 'screenshot_gameplay.png');
    if (!existsSync(screenshotPath)) {
      return {
        gate: 'gameplay_screenshot_qa',
        passed: !required,
        state: required ? 'FAIL' : 'SKIPPED',
        message: required
          ? 'RELEASE_CANDIDATE requires gameplay screenshot evidence — qa/screenshot_gameplay.png missing'
          : 'No gameplay screenshot (capture missing or runtime smoke did not run)',
      };
    }

    const png = readFileSync(screenshotPath);
    const critique = critiqueGameplayScreenshot(png);
    const critiquePath = join(projectPath, 'qa', 'screenshot_critique.json');
    let captureDetails: Record<string, unknown> | undefined;
    try {
      const telemetryPath = join(projectPath, 'qa', 'capture_telemetry.json');
      if (existsSync(telemetryPath)) {
        captureDetails = JSON.parse(readFileSync(telemetryPath, 'utf-8')) as Record<string, unknown>;
      }
    } catch {
      captureDetails = undefined;
    }
    try {
      mkdirSync(join(projectPath, 'qa'), { recursive: true });
      writeFileSync(critiquePath, JSON.stringify(critique, null, 2));
    } catch {
      /* best-effort sidecar */
    }

    if (critique.blank) {
      return {
        gate: 'gameplay_screenshot_qa',
        passed: !required,
        state: required ? 'FAIL' : 'SKIPPED',
        message: required
          ? 'RELEASE_CANDIDATE gameplay screenshot is blank (not valid evidence)'
          : 'Gameplay screenshot is blank (typical of GPU-less Godot --headless)',
        details: { ...critique, capture: captureDetails },
      };
    }

    if (!critique.passed) {
      const hardVisual = critique.issues.some(
        (issue) =>
          issue.includes('wallpapered') ||
          issue.includes('occupancy') ||
          issue.toLowerCase().includes('victory') ||
          issue.includes('flat') ||
          issue.includes('near-solid'),
      );
      return {
        gate: 'gameplay_screenshot_qa',
        passed: !hardVisual && !required,
        state: hardVisual || required ? 'FAIL' : 'SOFT_FAIL',
        message: `Gameplay screenshot QA score ${critique.score}: ${critique.description}`,
        details: { ...critique, capture: captureDetails },
      };
    }

    let diversityIssues: string[] = [];
    try {
      const qaDir = join(projectPath, 'qa');
      const sliceShots = existsSync(qaDir)
        ? readdirSync(qaDir)
            .filter((name) => name.startsWith('screenshot_slice_') && name.endsWith('.png'))
            .map((name) => readFileSync(join(qaDir, name)))
        : [];
      if (sliceShots.length >= 3) {
        const diversity = critiqueScreenshotDiversity(sliceShots);
        diversityIssues = diversity.issues;
        if (!diversity.passed) {
          return {
            gate: 'gameplay_screenshot_qa',
            passed: false,
            state: 'FAIL',
            message: diversity.issues.join('; '),
            details: { ...critique, diversity, capture: captureDetails },
          };
        }
      }
    } catch {
      diversityIssues = [];
    }

    return {
      gate: 'gameplay_screenshot_qa',
      passed: true,
      state: 'PASS',
      message: `Gameplay screenshot QA score ${critique.score}`,
      details: { ...critique, diversityIssues, capture: captureDetails },
    };
  }

  /** Runs the generated project's input-simulating PlaytestRunner — walks the planned
   *  victory route with simulated movement/attack input instead of calling internal methods. */
  validateGodotPlaytest(godotPath: string, projectPath: string): QAGateResult {
    const playtestScene = join(projectPath, 'scenes', 'test', 'PlaytestRunner.tscn');
    const routePath = join(projectPath, 'playtest_route.json');
    if (!existsSync(playtestScene)) {
      return {
        gate: 'godot_playtest',
        passed: true,
        state: 'SKIPPED',
        message: 'Playtest runner scene not found in project (stale template copy?)',
      };
    }
    if (!existsSync(routePath)) {
      return {
        gate: 'godot_playtest',
        passed: true,
        state: 'SKIPPED',
        message: 'playtest_route.json missing — regenerate project to enable playtest bot',
      };
    }

    this.runGodotImport(godotPath, projectPath);

    // --quit-after counts engine main-loop iterations (≈ physics frames at the default 60Hz
    // tick), not wall-clock seconds. 12000 was enough for 8-room TINY worlds, but RELEASE_CANDIDATE
    // maps (30+ transitions, several minibosses at MIN_BOSS_ATTACK_TIMEOUT_SEC=45, plus a final
    // boss) need a frame budget that cannot fire before the runner's own _finish(). The outer
    // The child-process timeout is what actually bounds the gate.
    let output: string;
    let exitCode = 0;
    try {
      // 10 minutes: 45-room critical-path with 4 real boss fights and 10s walk timeouts per room.
      output = execFileSync(
        godotPath,
        [
          '--headless',
          '--path',
          projectPath,
          'res://scenes/test/PlaytestRunner.tscn',
          '--quit-after',
          '360000',
        ],
        { encoding: 'utf-8', timeout: 600000, windowsHide: true },
      );
    } catch (err) {
      exitCode = 1;
      output =
        err instanceof Error && 'stdout' in err
          ? String((err as { stdout?: string }).stdout ?? err.message)
          : String(err);
    }

    const parsed = parsePlaytestOutput(output);
    const { checks, ranToCompletion, passedCount, failed, telemetry } = parsed;
    const state: QAGateState = !ranToCompletion
      ? 'UNKNOWN'
      : failed.length > 0 || exitCode !== 0
        ? 'FAIL'
        : 'PASS';
    const passed = state === 'PASS';

    if (telemetry) {
      const payload = {
        ...telemetry,
        balanceSummary: summarizePlaytestBalance(telemetry),
      };
      writeFileSync(join(projectPath, 'playtest_telemetry.json'), JSON.stringify(payload, null, 2));
      try {
        mkdirSync(join(projectPath, 'playtest'), { recursive: true });
        writeFileSync(
          join(projectPath, 'playtest', 'telemetry.jsonl'),
          `${JSON.stringify({ ...payload, timestamp: new Date().toISOString() })}\n`,
        );
      } catch {
        /* jsonl sidecar is best-effort */
      }
    }

    return {
      gate: 'godot_playtest',
      passed,
      state,
      message: ranToCompletion
        ? `${passedCount}/${checks.length} playtest checks passed${failed.length > 0 ? ` (failed: ${failed.join(', ')})` : ''}${telemetry ? ` — persona ${telemetry.personaId}, ${telemetry.elapsedMs}ms` : ''}`
        : 'Playtest did not complete — Godot crashed or hung',
      details: {
        checks: parsed.checks,
        telemetry,
        balanceSummary: telemetry ? summarizePlaytestBalance(telemetry) : undefined,
        output: output.slice(-2000),
      },
    };
  }
}

export class RepairEngineer {
  repair(projectPath: string, report: QAReport): { repaired: boolean; actions: string[] } {
    const actions: string[] = [];
    const notes: string[] = [];

    for (const result of report.results) {
      if (result.passed) continue;

      if (result.gate === 'generation_manifest' || result.gate === 'required_files') {
        const manifestPath = join(projectPath, 'generation_manifest.json');
        if (!existsSync(manifestPath)) {
          writeManifest(manifestPath);
          actions.push('Created missing generation_manifest.json');
        }
      }

      if (result.gate === 'input_actions_exist') {
        if (repairInputActions(projectPath, REQUIRED_INPUT_ACTIONS)) {
          actions.push('Restored missing InputMap actions from runtime template');
        }
      }

      if (result.gate === 'required_files' || result.gate === 'player_spawn_valid') {
        for (const relPath of TEMPLATE_STATIC_FILES) {
          if (restoreTemplateFile(projectPath, relPath)) {
            actions.push(`Restored missing ${relPath} from runtime template`);
          }
        }
      }

      if (result.gate === 'required_files' || result.gate === 'main_scene_starts') {
        if (restoreMainScene(projectPath)) {
          actions.push('Restored missing scenes/boot/Main.tscn from runtime template');
        }
        if (restoreProjectGodot(projectPath)) {
          actions.push('Restored missing project.godot from runtime template');
        }
      }

      if (result.gate === 'registered_abilities_valid') {
        notes.push(
          'Skipped auto-repair for unknown abilities (repairable=false) — remap game_dna.json to registered runtime ability ids; do not invent GDScript',
        );
      }
    }

    return { repaired: actions.length > 0, actions: [...actions, ...notes] };
  }
}

function writeManifest(path: string): void {
  writeFileSync(
    path,
    JSON.stringify(
      {
        version: '0.1.0',
        artifacts: [],
        createdAt: new Date().toISOString(),
        repaired: true,
      },
      null,
      2,
    ),
  );
}

/** Extracts a `[section]` block (up to the next `[section]` heading or EOF) from a .godot/.ini-style file. */
function extractSection(content: string, sectionHeading: string): string | null {
  const start = content.indexOf(`${sectionHeading}\n`);
  if (start === -1) return null;
  const rest = content.slice(start + sectionHeading.length + 1);
  const nextHeadingMatch = rest.match(/\n\[[A-Za-z_]+\]\n/);
  const body = nextHeadingMatch ? rest.slice(0, nextHeadingMatch.index) : rest;
  return body.replace(/\s+$/, '');
}

function listFilesRecursive(dir: string, extension: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(full, extension));
    } else if (entry.name.endsWith(extension)) {
      results.push(full);
    }
  }
  return results;
}

const EXT_RESOURCE_PATH_RE = /\[ext_resource\b[^\]]*\bpath="res:\/\/([^"]+)"/g;

/** Scans every .tscn file under scenes/ for `[ext_resource ... path="res://..."]` declarations
 *  and reports any whose target file doesn't actually exist in the project. */
function findMissingAssetReferences(
  projectPath: string,
): { scene: string; resource: string }[] {
  const missing: { scene: string; resource: string }[] = [];
  const sceneFiles = listFilesRecursive(join(projectPath, 'scenes'), '.tscn');

  for (const sceneFile of sceneFiles) {
    let content: string;
    try {
      content = readFileSync(sceneFile, 'utf-8');
    } catch {
      continue;
    }
    for (const match of content.matchAll(EXT_RESOURCE_PATH_RE)) {
      const resourcePath = match[1]!;
      if (!existsSync(join(projectPath, resourcePath))) {
        missing.push({
          scene: relative(projectPath, sceneFile).replace(/\\/g, '/'),
          resource: resourcePath,
        });
      }
    }
  }

  return missing;
}

/** Reads this project's archetype from its persisted game_dna.json, if present and parseable. */
function readProjectArchetype(projectPath: string): GameArchetype | undefined {
  try {
    const dna = JSON.parse(readFileSync(join(projectPath, 'game_dna.json'), 'utf-8')) as {
      archetype?: string;
    };
    // Always normalize through resolveGameArchetype so unknown/legacy strings cannot
    // fall through as a raw cast and pick the wrong required player controller file.
    if (!dna.archetype) return undefined;
    return resolveGameArchetype(dna.archetype);
  } catch {
    return undefined;
  }
}

/** Which scripts/world/*.gd a genuine World.tscn for this archetype should — and must not —
 *  resolve its root "World" node's script to. Exported so a caller can re-run this specific
 *  check on its own right after a step that can rewrite scene files (see pipeline.ts's
 *  quality-pass call site), not only as part of the full validateProject() gate list. */
export function validateWorldSceneArchetypeIntegrity(
  projectPath: string,
  isTopDown: boolean,
): QAGateResult {
  const expectedScript = isTopDown ? 'OverworldManager.gd' : 'WorldManager.gd';
  const wrongScript = isTopDown ? 'WorldManager.gd' : 'OverworldManager.gd';
  const scenePath = join(projectPath, 'scenes', 'world', 'World.tscn');

  let scene: string;
  try {
    scene = readFileSync(scenePath, 'utf-8');
  } catch {
    return {
      gate: 'world_scene_archetype_integrity',
      passed: false,
      message: 'scenes/world/World.tscn missing or unreadable',
    };
  }

  // Resolve the ext_resource id declared for this archetype's expected script, then confirm the
  // root "World" node's own script= line actually points at that id — not just that the right
  // path string appears somewhere in the file (e.g. an unrelated ext_resource another node uses).
  const expectedIdMatch = scene.match(
    new RegExp(`\\[ext_resource type="Script" path="res://scripts/world/${expectedScript}" id="([^"]+)"`),
  );
  const hasWrongScriptReference = scene.includes(`res://scripts/world/${wrongScript}`);

  if (!expectedIdMatch) {
    return {
      gate: 'world_scene_archetype_integrity',
      passed: false,
      message: hasWrongScriptReference
        ? `World.tscn references ${wrongScript} instead of ${expectedScript} — overwritten by an incompatible genre pass`
        : `World.tscn does not reference the expected ${expectedScript} at all`,
      details: { expectedScript, wrongScript, hasWrongScriptReference },
    };
  }

  const expectedId = expectedIdMatch[1];
  const worldNodeMatch = scene.match(/\[node name="World"[^\]]*\]\s*\n(?:[^\n[][^\n]*\n)*/);
  const rootScriptMatch = worldNodeMatch?.[0]?.match(/script = ExtResource\("([^"]+)"\)/);
  const rootUsesExpectedScript = rootScriptMatch?.[1] === expectedId;

  return {
    gate: 'world_scene_archetype_integrity',
    passed: rootUsesExpectedScript,
    message: rootUsesExpectedScript
      ? `World.tscn's root node correctly uses ${expectedScript}`
      : `World.tscn's root "World" node does not use ${expectedScript} (id ${expectedId}) — likely overwritten by an incompatible genre pass`,
    details: { expectedScript, wrongScript, hasWrongScriptReference },
  };
}

/** Reads this project's title from its persisted game_dna.json, if present and parseable. */
function readProjectTitle(projectPath: string): string | null {
  try {
    const dna = JSON.parse(readFileSync(join(projectPath, 'game_dna.json'), 'utf-8'));
    return typeof dna?.identity?.title === 'string' ? dna.identity.title : null;
  } catch {
    return null;
  }
}

/** Restores a static runtime-template file verbatim if it's missing from the generated project. */
function restoreTemplateFile(projectPath: string, relPath: string): boolean {
  const dest = join(projectPath, relPath);
  const src = join(resolveTemplateDir(projectPath), relPath);
  if (existsSync(dest) || !existsSync(src)) return false;
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  return true;
}

/** Restores scenes/boot/Main.tscn from the template if missing, reapplying the game's title
 *  text patch (the assembler replaces the placeholder title on every normal generation run). */
function restoreMainScene(projectPath: string): boolean {
  const dest = join(projectPath, 'scenes', 'boot', 'Main.tscn');
  const src = join(resolveTemplateDir(projectPath), 'scenes', 'boot', 'Main.tscn');
  if (existsSync(dest) || !existsSync(src)) return false;

  mkdirSync(dirname(dest), { recursive: true });
  const title = readProjectTitle(projectPath);
  const content = readFileSync(src, 'utf-8');
  writeFileSync(dest, title ? content.replace('MetroForge Game', title) : content);
  return true;
}

/** Restores project.godot from the template if missing, reapplying the game's config/name
 *  patch (the assembler replaces the placeholder name on every normal generation run). */
function restoreProjectGodot(projectPath: string): boolean {
  const dest = join(projectPath, 'project.godot');
  const templateProjectGodot = join(resolveTemplateDir(projectPath), 'project.godot');
  if (existsSync(dest) || !existsSync(templateProjectGodot)) return false;

  const title = readProjectTitle(projectPath);
  const content = readFileSync(templateProjectGodot, 'utf-8');
  writeFileSync(
    dest,
    title
      ? content.replace('config/name="MetroForge Template"', `config/name="${title.replace(/"/g, '\\"')}"`)
      : content,
  );
  return true;
}

/** Restores the required InputMap actions in a generated project's project.godot from the
 *  canonical runtime template, in case the [input] section was corrupted or manually edited. */
function repairInputActions(projectPath: string, requiredActions: string[]): boolean {
  const projectGodotPath = join(projectPath, 'project.godot');
  const templateProjectGodot = join(resolveTemplateDir(projectPath), 'project.godot');
  if (!existsSync(projectGodotPath) || !existsSync(templateProjectGodot)) return false;

  const current = readFileSync(projectGodotPath, 'utf-8').replace(/\r\n/g, '\n');
  const missing = requiredActions.filter((a) => !current.includes(`${a}=`));
  if (missing.length === 0) return false;

  const template = readFileSync(templateProjectGodot, 'utf-8').replace(/\r\n/g, '\n');
  const templateInputSection = extractSection(template, '[input]');
  if (!templateInputSection) return false;

  const hasInputHeading = current.includes('[input]\n');
  const patched = hasInputHeading
    ? current.replace(
        /\[input\]\n[\s\S]*?(?=\n\[[A-Za-z_]+\]\n|$)/,
        `[input]\n${templateInputSection}\n`,
      )
    : `${current.replace(/\s+$/, '')}\n\n[input]\n${templateInputSection}\n`;

  writeFileSync(projectGodotPath, patched);
  return true;
}
