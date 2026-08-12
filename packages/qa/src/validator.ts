import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import type { ValidationResult, WorldGraph } from '@metroforge/schemas';
import { generateId } from '@metroforge/shared';
import { validateWorldConnectivity, validateWorldReachability } from '@metroforge/procedural';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');
const TEMPLATE_DIR = join(REPO_ROOT, 'templates', 'godot-metroidvania');
const TEMPLATE_PROJECT_GODOT = join(TEMPLATE_DIR, 'project.godot');

/** Static runtime-template files this generator never customizes per-project (unlike
 *  project.godot and Main.tscn, whose title text gets patched with the game's title —
 *  those are restored separately so the title patch can be reapplied). Safe to restore
 *  verbatim. */
const TEMPLATE_STATIC_FILES = [
  'scenes/world/World.tscn',
  'scenes/player/Player.tscn',
  'scripts/player/PlayerController.gd',
  'scenes/world/SavePoint.tscn',
  'scripts/world/SavePoint.gd',
];

export interface QAGateResult {
  gate: string;
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
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
  'scenes/boot/Main.tscn',
  'scenes/world/World.tscn',
  'scenes/player/Player.tscn',
  'scripts/player/PlayerController.gd',
];

const REQUIRED_INPUT_ACTIONS = [
  'move_left',
  'move_right',
  'jump',
  'attack',
  'dash',
  'pause',
];

export class QAValidator {
  validateProject(projectPath: string, projectId: string): QAReport {
    const results: QAGateResult[] = [];

    // Gate: required files
    const missingFiles = REQUIRED_FILES.filter((f) => !existsSync(join(projectPath, f)));
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
    try {
      const dna = JSON.parse(readFileSync(join(projectPath, 'game_dna.json'), 'utf-8'));
      dnaValid = !!dna.identity?.title && !!dna.world?.roomCount;
    } catch {
      dnaValid = false;
    }
    results.push({
      gate: 'game_dna_valid',
      passed: dnaValid,
      message: dnaValid ? 'Game DNA valid' : 'Game DNA invalid or missing',
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

    // Gate: rooms exist
    const roomsDir = join(projectPath, 'scenes', 'rooms');
    const roomCount = existsSync(roomsDir)
      ? readdirSync(roomsDir).filter((f) => f.endsWith('.tscn')).length
      : 0;
    results.push({
      gate: 'required_scenes_exist',
      passed: roomCount >= 1,
      message: `${roomCount} room scene(s) found`,
      details: { roomCount },
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

    const checks = Array.from(output.matchAll(/^(PASS|FAIL|SOFT_FAIL): (.+)$/gm)).map((m) => ({
      status: m[1] as 'PASS' | 'FAIL' | 'SOFT_FAIL',
      name: m[2]!,
    }));
    const failed = checks.filter((c) => c.status === 'FAIL').map((c) => c.name);
    const passedCount = checks.filter((c) => c.status === 'PASS').length;

    const ranToCompletion = output.includes('SMOKE_TEST_RESULTS_END');
    const passed = ranToCompletion && exitCode === 0 && failed.length === 0;

    return {
      gate: 'godot_runtime',
      passed,
      message: ranToCompletion
        ? `${passedCount}/${checks.length} runtime checks passed${failed.length > 0 ? ` (failed: ${failed.join(', ')})` : ''}`
        : 'Smoke test did not complete — Godot crashed or hung',
      details: { checks, output: output.slice(-2000) },
    };
  }
}

export class RepairEngineer {
  repair(projectPath: string, report: QAReport): { repaired: boolean; actions: string[] } {
    const actions: string[] = [];

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
    }

    return { repaired: actions.length > 0, actions };
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
  const src = join(TEMPLATE_DIR, relPath);
  if (existsSync(dest) || !existsSync(src)) return false;
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  return true;
}

/** Restores scenes/boot/Main.tscn from the template if missing, reapplying the game's title
 *  text patch (the assembler replaces the placeholder title on every normal generation run). */
function restoreMainScene(projectPath: string): boolean {
  const dest = join(projectPath, 'scenes', 'boot', 'Main.tscn');
  const src = join(TEMPLATE_DIR, 'scenes', 'boot', 'Main.tscn');
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
  if (existsSync(dest) || !existsSync(TEMPLATE_PROJECT_GODOT)) return false;

  const title = readProjectTitle(projectPath);
  const content = readFileSync(TEMPLATE_PROJECT_GODOT, 'utf-8');
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
  if (!existsSync(projectGodotPath) || !existsSync(TEMPLATE_PROJECT_GODOT)) return false;

  const current = readFileSync(projectGodotPath, 'utf-8').replace(/\r\n/g, '\n');
  const missing = requiredActions.filter((a) => !current.includes(`${a}=`));
  if (missing.length === 0) return false;

  const template = readFileSync(TEMPLATE_PROJECT_GODOT, 'utf-8').replace(/\r\n/g, '\n');
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
