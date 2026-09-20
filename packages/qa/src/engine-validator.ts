import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { TargetEngine } from '@metroforge/shared';
import type { QAGateResult, QAReport } from './validator.js';

export function detectProjectEngine(projectPath: string): TargetEngine {
  const manifestPath = join(projectPath, 'engine.json');
  if (existsSync(manifestPath)) {
    try {
      const parsed = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { engine?: string };
      if (parsed.engine === 'godot' || parsed.engine === 'unity' || parsed.engine === 'unreal') {
        return parsed.engine;
      }
    } catch {
      // fingerprint
    }
  }
  if (existsSync(join(projectPath, 'project.godot'))) return 'godot';
  if (existsSync(join(projectPath, 'ProjectSettings', 'ProjectVersion.txt'))) return 'unity';
  try {
    if (readdirSync(projectPath).some((name) => name.endsWith('.uproject'))) return 'unreal';
  } catch {
    return 'godot';
  }
  return 'godot';
}

function gate(
  name: string,
  passed: boolean,
  message: string,
  details?: Record<string, unknown>,
  state?: QAGateResult['state'],
): QAGateResult {
  return { gate: name, passed, message, details, state };
}

export function validateForeignEngineProject(projectPath: string, engine: Exclude<TargetEngine, 'godot'>): QAReport {
  const results: QAGateResult[] = [];
  const required =
    engine === 'unity'
      ? [
          'engine.json',
          'gameplay.json',
          'game_dna.json',
          'world_graph.json',
          'ProjectSettings/ProjectVersion.txt',
          'Packages/manifest.json',
          'Assets/Scenes/World.unity',
          'Assets/Scripts/GameBootstrap.cs',
          'Assets/Scripts/PlayerActor.cs',
          'Assets/StreamingAssets/gameplay.json',
        ]
      : [
          'engine.json',
          'gameplay.json',
          'game_dna.json',
          'world_graph.json',
          'MetroForgeGame.uproject',
          'Source/MetroForgeGame/MetroForgeGame.Build.cs',
          'Source/MetroForgeGame/MFGameMode.cpp',
          'Source/MetroForgeGame/MFPawn.cpp',
          'Source/MetroForgeGame/MFEnemy.cpp',
          'Content/Raw/gameplay.json',
        ];
  const missing = required.filter((rel) => !existsSync(join(projectPath, rel)));
  results.push(
    gate(
      'required_files',
      missing.length === 0,
      missing.length === 0 ? `${engine} project files present` : `Missing: ${missing.join(', ')}`,
      { missing },
    ),
  );

  let packOk = false;
  let packMessage = 'gameplay.json missing';
  try {
    const pack = JSON.parse(readFileSync(join(projectPath, 'gameplay.json'), 'utf-8')) as {
      rooms?: unknown[];
      movement?: { walkSpeed?: number };
      sprites?: unknown[];
      startRoomId?: string;
    };
    packOk = Array.isArray(pack.rooms) && pack.rooms.length > 0 && Boolean(pack.movement?.walkSpeed) && Boolean(pack.startRoomId);
    packMessage = packOk
      ? `Gameplay pack: ${pack.rooms?.length ?? 0} rooms`
      : 'Gameplay pack missing rooms, movement, or startRoomId';
  } catch (err) {
    packMessage = err instanceof Error ? err.message : String(err);
  }
  results.push(gate('gameplay_pack_valid', packOk, packMessage));

  let dnaOk = false;
  try {
    const dna = JSON.parse(readFileSync(join(projectPath, 'game_dna.json'), 'utf-8')) as {
      identity?: { title?: string };
    };
    dnaOk = Boolean(dna.identity?.title);
  } catch {
    dnaOk = false;
  }
  results.push(gate('game_dna_valid', dnaOk, dnaOk ? 'Game DNA valid' : 'Game DNA invalid or missing'));

  const godotLeak = existsSync(join(projectPath, 'project.godot'));
  results.push(
    gate(
      'engine_isolation',
      !godotLeak,
      godotLeak
        ? `${engine} folder contains project.godot — refuse to treat it as a ${engine} runtime proof`
        : `${engine} project is isolated from Godot runtime files`,
    ),
  );

  let spriteOk = true;
  let spriteMessage = 'No sprite clips in gameplay pack';
  try {
    const pack = JSON.parse(readFileSync(join(projectPath, 'gameplay.json'), 'utf-8')) as {
      sprites?: Array<{ relativePath?: string }>;
    };
    const sprites = pack.sprites ?? [];
    const roots =
      engine === 'unity'
        ? [join(projectPath, 'Assets', 'StreamingAssets'), projectPath]
        : [join(projectPath, 'Content', 'Raw'), projectPath];
    const missing: string[] = [];
    for (const clip of sprites) {
      const rel = clip.relativePath;
      if (!rel) continue;
      const found = roots.some((root) => existsSync(join(root, rel)));
      if (!found) missing.push(rel);
    }
    spriteOk = missing.length === 0;
    spriteMessage = sprites.length === 0
      ? 'No sprite clips in gameplay pack'
      : spriteOk
        ? `${sprites.length} sprite clips present on disk (generation-level only)`
        : `Missing sprite files: ${missing.slice(0, 8).join(', ')}`;
  } catch (err) {
    spriteOk = false;
    spriteMessage = err instanceof Error ? err.message : String(err);
  }
  results.push(gate('sprite_files', spriteOk, spriteMessage));

  const editorCode = engine === 'unity' ? 'UNITY_EDITOR_NOT_AVAILABLE' : 'UNREAL_EDITOR_NOT_AVAILABLE';
  results.push(
    gate(`${engine}_compile`, true, `${editorCode}: compile blocked — generated only`, undefined, 'SKIPPED'),
  );
  results.push(
    gate(`${engine}_open`, true, `${editorCode}: editor launch blocked — generated only`, undefined, 'SKIPPED'),
  );
  results.push(
    gate(`${engine}_playtest`, true, 'PLAYTEST_SKIPPED: missing editor — not acceptance', undefined, 'SKIPPED'),
  );
  results.push(
    gate(
      `${engine}_visual_capture`,
      true,
      'VISUAL_CAPTURE_SKIPPED: missing editor — not animation-feel approval',
      undefined,
      'SKIPPED',
    ),
  );
  results.push(
    gate(`${engine}_standalone_build`, true, 'STANDALONE_BUILD_SKIPPED: missing editor/SDK', undefined, 'SKIPPED'),
  );

  const blocking = results.filter((r) => r.state !== 'SKIPPED');
  return {
    passed: blocking.every((r) => r.passed),
    results,
    validationResults: [],
  };
}
