import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import type { ValidationResult, WorldGraph } from '@metroforge/schemas';
import {
  generateId,
  isRegisteredAbilityId,
  isTopDownArchetype,
  TOP_DOWN_DUNGEON_ITEMS,
  getGameArchetypePlugin,
  resolveGameArchetype,
  type GameArchetype,
} from '@metroforge/shared';

const TOP_DOWN_ITEM_IDS = new Set<string>(TOP_DOWN_DUNGEON_ITEMS.map((item) => item.id));
import { validateWorldConnectivity, validateWorldReachability, validateMovementFeasibility, movementStatsFromJson } from '@metroforge/procedural';
import { auditRoomArchetypeFidelity } from '@metroforge/godot';
import { critiqueGameplayScreenshot } from '@metroforge/assets';
import { parseSmokeTestOutput } from './smoke-output.js';
import { parsePlaytestOutput, summarizePlaytestBalance } from './playtest-output.js';

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
  'scripts/UI/ShopOverlay.gd',
  'scenes/world/ShopOverlay.tscn',
  'scenes/world/ItemPickup.tscn',
  'scripts/world/ItemPickup.gd',
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
    const results: QAGateResult[] = [];

    // Gate: required files. The player controller filename genuinely differs by archetype
    // (PlayerController.gd for side-view, TopDownPlayerController.gd for top-down) — read here
    // early since REQUIRED_FILES itself can't hardcode one or the other.
    const earlyArchetype = readProjectArchetype(projectPath);
    const requiredFiles = [
      ...REQUIRED_FILES,
      isTopDownArchetype(earlyArchetype)
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
    const isTopDown = isTopDownArchetype(dnaArchetype as GameArchetype | undefined);
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
    } catch {
      results.push({
        gate: 'room_archetype_fidelity',
        passed: false,
        message: 'Could not evaluate room archetype fidelity',
      });
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
  private runGodotImport(godotPath: string, projectPath: string): void {
    try {
      execSync(`"${godotPath}" --headless --path "${projectPath}" --import`, {
        encoding: 'utf-8',
        timeout: 120000,
        windowsHide: true,
      });
    } catch {
      // best-effort — an import failure will surface as a real error in the gate that follows
    }
  }

  validateGodotHeadless(godotPath: string, projectPath: string): QAGateResult {
    this.runGodotImport(godotPath, projectPath);

    try {
      const output = execSync(`"${godotPath}" --headless --path "${projectPath}" --quit-after 1`, {
        encoding: 'utf-8',
        timeout: 60000,
        windowsHide: true,
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
        details: { output: output.slice(0, 500) },
      };
    } catch (err) {
      const output =
        err instanceof Error && 'stdout' in err
          ? String((err as { stdout?: string }).stdout ?? err.message)
          : String(err);
      return {
        gate: 'godot_imports',
        passed: false,
        state: 'FAIL',
        message: 'Godot headless failed',
        details: { output: output.slice(0, 500) },
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
  validateGodotRuntime(godotPath: string, projectPath: string): QAGateResult {
    const smokeTestScene = join(projectPath, 'scenes', 'test', 'RuntimeSmokeTest.tscn');
    if (!existsSync(smokeTestScene)) {
      return {
        gate: 'godot_runtime',
        passed: false,
        state: 'UNKNOWN',
        message: 'Runtime smoke test scene not found in project (stale template copy?)',
      };
    }

    this.runGodotImport(godotPath, projectPath);

    const command = `"${godotPath}" --headless --path "${projectPath}" res://scenes/test/RuntimeSmokeTest.tscn --quit-after 600`;
    let output: string;
    let exitCode = 0;
    try {
      output = execSync(command, { encoding: 'utf-8', timeout: 60000, windowsHide: true });
    } catch (err) {
      exitCode = 1;
      output =
        err instanceof Error && 'stdout' in err
          ? String((err as { stdout?: string }).stdout ?? err.message)
          : String(err);
    }

    const parsed = parseSmokeTestOutput(output);
    const { checks, ranToCompletion, passedCount, failed } = parsed;
    const softFailed = parsed.softFailed.length > 0;
    // A soft-fail (e.g. "this seed happened to generate zero projectile-type enemies, so
    // there was nothing to test") must never be conflated with a hard failure — it's still a
    // PASS for completion purposes, just flagged distinctly so a human/log can see it. A run
    // that didn't reach the results marker at all (crash/hang/timeout) is UNKNOWN, not a
    // silent pass — we genuinely don't know whether the gameplay it never got to exercise
    // actually works.
    const state: QAGateState = !ranToCompletion
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
        : 'Smoke test did not complete — Godot crashed or hung',
      details: { checks: parsed.checks, output: output.slice(-2000) },
    };
  }

  /** Critiques `qa/screenshot_gameplay.png` written by RuntimeSmokeTest. Blank headless
   *  frames are SKIPPED (not a generation failure). Structured frames that fail the
   *  critic are SOFT_FAIL so vision issues never block a playable project. */
  validateGameplayScreenshot(projectPath: string): QAGateResult {
    const screenshotPath = join(projectPath, 'qa', 'screenshot_gameplay.png');
    if (!existsSync(screenshotPath)) {
      return {
        gate: 'gameplay_screenshot_qa',
        passed: true,
        state: 'SKIPPED',
        message: 'No gameplay screenshot (capture missing or runtime smoke did not run)',
      };
    }

    const png = readFileSync(screenshotPath);
    const critique = critiqueGameplayScreenshot(png);
    const critiquePath = join(projectPath, 'qa', 'screenshot_critique.json');
    try {
      mkdirSync(join(projectPath, 'qa'), { recursive: true });
      writeFileSync(critiquePath, JSON.stringify(critique, null, 2));
    } catch {
      /* best-effort sidecar */
    }

    if (critique.blank) {
      return {
        gate: 'gameplay_screenshot_qa',
        passed: true,
        state: 'SKIPPED',
        message: 'Gameplay screenshot is blank (typical of GPU-less Godot --headless)',
        details: { ...critique },
      };
    }

    if (!critique.passed) {
      return {
        gate: 'gameplay_screenshot_qa',
        passed: true,
        state: 'SOFT_FAIL',
        message: `Gameplay screenshot QA score ${critique.score}: ${critique.description}`,
        details: { ...critique },
      };
    }

    return {
      gate: 'gameplay_screenshot_qa',
      passed: true,
      state: 'PASS',
      message: `Gameplay screenshot QA score ${critique.score}`,
      details: { ...critique },
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

    const command = `"${godotPath}" --headless --path "${projectPath}" res://scenes/test/PlaytestRunner.tscn --quit-after 600`;
    let output: string;
    let exitCode = 0;
    try {
      output = execSync(command, { encoding: 'utf-8', timeout: 90000, windowsHide: true });
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
      writeFileSync(
        join(projectPath, 'playtest_telemetry.json'),
        JSON.stringify(
          {
            ...telemetry,
            balanceSummary: summarizePlaytestBalance(telemetry),
          },
          null,
          2,
        ),
      );
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
