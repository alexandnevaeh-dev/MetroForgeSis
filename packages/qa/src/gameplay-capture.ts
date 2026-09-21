import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnCapturedSync as spawnSync } from './process-capture.js';
import { critiqueGameplayScreenshot } from '@metroforge/assets';
import {
  getPlatformInfo,
  isolatedUserDataEnvironment,
  terminateProcessTree,
} from '@metroforge/shared';

export type GameplayCaptureStrategy = 'headless' | 'windowed_gpu' | 'failed';

export interface GameplayCaptureTelemetry {
  strategy: GameplayCaptureStrategy;
  attempts: Array<{
    strategy: Exclude<GameplayCaptureStrategy, 'failed'>;
    startedAt: string;
    elapsedMs: number;
    exitCode: number | null;
    textureNull: boolean;
    screenshotWritten: boolean;
    decodeOk: boolean;
    blank: boolean;
    uniqueColors?: number;
    lumaStdDev?: number;
    killed: boolean;
  }>;
  shots: string[];
  reason?: string;
}

export interface CaptureManifestEntry {
  filename: string;
  capturePurpose: string;
  roomId?: string;
  biomeId?: string;
  entityId?: string;
  enemyArchetype?: string;
  playerState?: string;
  bossPhase?: number | string;
  runtimeTimestamp?: string;
  candidateSlug?: string;
  sourceShot?: string;
}

export const REQUIRED_CAPTURE_FILES = [
  'spawn.png',
  'player_idle.png',
  'player_run.png',
  'player_jump.png',
  'player_dash.png',
  'player_combat.png',
  'enemy_A.png',
  'enemy_B.png',
  'enemy_C.png',
  'biome_0.png',
  'biome_1.png',
  'biome_2.png',
  'checkpoint.png',
  'ability_pickup.png',
  'ability_gate.png',
  'npc_dialogue.png',
  'boss_phase_1.png',
  'boss_phase_2.png',
  'boss_death.png',
  'victory.png',
] as const;

export function collectCaptureFiles(qaDir: string): string[] {
  if (!existsSync(qaDir)) return [];
  const present = new Set<string>();
  for (const entry of REQUIRED_CAPTURE_FILES) {
    if (existsSync(join(qaDir, entry))) present.add(entry);
  }
  const entries = readdirSync(qaDir).filter((name) => name.endsWith('.png'));
  for (const name of entries) {
    if (REQUIRED_CAPTURE_FILES.includes(name as (typeof REQUIRED_CAPTURE_FILES)[number])) {
      present.add(name);
    }
  }
  return [...present].sort();
}

export function buildCaptureManifest(
  entries: Array<Partial<CaptureManifestEntry> & Pick<CaptureManifestEntry, 'filename' | 'capturePurpose'>>,
  candidateSlug: string,
): CaptureManifestEntry[] {
  const unique = new Map<string, CaptureManifestEntry>();
  for (const entry of entries) {
    const filename = entry.filename;
    const base: CaptureManifestEntry = {
      filename,
      capturePurpose: entry.capturePurpose,
      roomId: entry.roomId,
      biomeId: entry.biomeId,
      entityId: entry.entityId,
      enemyArchetype: entry.enemyArchetype,
      playerState: entry.playerState,
      bossPhase: entry.bossPhase,
      runtimeTimestamp: entry.runtimeTimestamp ?? new Date().toISOString(),
      candidateSlug,
      sourceShot: entry.sourceShot,
    };
    unique.set(filename, base);
  }
  return [...unique.values()].sort((a, b) => a.filename.localeCompare(b.filename));
}

export function headlessTextureNull(output: string): boolean {
  return (
    /texture_2d_get/i.test(output) ||
    /Parameter ["']t["'] is null/i.test(output) ||
    /CAPTURE_STRATEGY_HEADLESS_TEXTURE_NULL/.test(output)
  );
}

export function needsWindowedCaptureFallback(opts: {
  headlessOutput: string;
  screenshotPath: string;
}): boolean {
  if (headlessTextureNull(opts.headlessOutput)) return true;
  if (!existsSync(opts.screenshotPath)) return true;
  try {
    const critique = critiqueGameplayScreenshot(readFileSync(opts.screenshotPath));
    return critique.blank || !critique.passed && critique.uniqueColors < 4;
  } catch {
    return true;
  }
}

function runGodotSync(opts: {
  godotPath: string;
  projectPath: string;
  args: string[];
  timeoutMs: number;
  windowsHide: boolean;
  env?: NodeJS.ProcessEnv;
}): { output: string; exitCode: number | null; elapsedMs: number; killed: boolean; pid?: number } {
  const started = Date.now();
  const result = spawnSync(opts.godotPath, opts.args, {
    cwd: opts.projectPath,
    encoding: 'utf-8',
    timeout: opts.timeoutMs,
    windowsHide: opts.windowsHide,
    env: { ...process.env, ...opts.env },
    killSignal: 'SIGTERM',
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}${result.error ? `\n${result.error.message}` : ''}`;
  const killed = Boolean(result.error && /TIMEDOUT/i.test(result.error.message));
  if (result.pid && killed) terminateProcessTree(result.pid);
  return {
    output,
    exitCode: result.status,
    elapsedMs: Date.now() - started,
    killed,
    pid: result.pid,
  };
}

function recordShotCritique(screenshotPath: string): {
  decodeOk: boolean;
  blank: boolean;
  uniqueColors?: number;
  lumaStdDev?: number;
} {
  if (!existsSync(screenshotPath)) {
    return { decodeOk: false, blank: true };
  }
  try {
    const critique = critiqueGameplayScreenshot(readFileSync(screenshotPath));
    return {
      decodeOk: true,
      blank: critique.blank,
      uniqueColors: critique.uniqueColors,
      lumaStdDev: critique.lumaStdDev,
    };
  } catch {
    return { decodeOk: false, blank: true };
  }
}

/**
 * Headless dummy renderer on Intel UHD returns a null texture.
 * Fallback: windowed/offscreen Godot run of RuntimeSmokeTest (real gameplay scene), auto-quit.
 */
export function captureGameplayScreenshots(opts: {
  godotPath: string;
  projectPath: string;
  headlessOutput?: string;
  userDataDir?: string;
}): GameplayCaptureTelemetry {
  const qaDir = join(opts.projectPath, 'qa');
  mkdirSync(qaDir, { recursive: true });
  const screenshotPath = join(qaDir, 'screenshot_gameplay.png');
  const telemetry: GameplayCaptureTelemetry = {
    strategy: 'failed',
    attempts: [],
    shots: [],
  };

  const scene = 'res://scenes/test/RuntimeSmokeTest.tscn';

  const tryHeadless = () => {
    const run = runGodotSync({
      godotPath: opts.godotPath,
      projectPath: opts.projectPath,
      args: [
      '--headless',
      '--path',
      opts.projectPath,
      '--resolution',
      readViewportResolution(opts.projectPath),
      scene,
      '--quit-after',
      '3600',
    ],
      timeoutMs: 90_000,
      windowsHide: true,
      env: isolatedUserDataEnvironment(opts.userDataDir),
    });
    const critique = recordShotCritique(screenshotPath);
    telemetry.attempts.push({
      strategy: 'headless',
      startedAt: new Date().toISOString(),
      elapsedMs: run.elapsedMs,
      exitCode: run.exitCode,
      textureNull: headlessTextureNull(run.output) || headlessTextureNull(opts.headlessOutput ?? ''),
      screenshotWritten: existsSync(screenshotPath),
      decodeOk: critique.decodeOk,
      blank: critique.blank,
      uniqueColors: critique.uniqueColors,
      lumaStdDev: critique.lumaStdDev,
      killed: run.killed,
    });
    return run.output;
  };

  let combinedOutput = opts.headlessOutput ?? '';
  if (!opts.headlessOutput) {
    combinedOutput = tryHeadless();
  } else if (existsSync(screenshotPath)) {
    const critique = recordShotCritique(screenshotPath);
    telemetry.attempts.push({
      strategy: 'headless',
      startedAt: new Date().toISOString(),
      elapsedMs: 0,
      exitCode: 0,
      textureNull: headlessTextureNull(combinedOutput),
      screenshotWritten: true,
      decodeOk: critique.decodeOk,
      blank: critique.blank,
      uniqueColors: critique.uniqueColors,
      lumaStdDev: critique.lumaStdDev,
      killed: false,
    });
  }

  if (!needsWindowedCaptureFallback({ headlessOutput: combinedOutput, screenshotPath })) {
    const prior = existsSync(join(qaDir, 'capture_telemetry.json'))
      ? (JSON.parse(readFileSync(join(qaDir, 'capture_telemetry.json'), 'utf-8')) as GameplayCaptureTelemetry)
      : null;
    telemetry.strategy =
      prior?.strategy === 'windowed_gpu' && prior.shots?.includes('screenshot_gameplay.png')
        ? 'windowed_gpu'
        : telemetry.attempts.at(-1)?.strategy ?? 'headless';
    if (prior?.attempts?.length && telemetry.attempts.length === 1 && telemetry.attempts[0]?.elapsedMs === 0) {
      telemetry.attempts = prior.attempts;
    }
    telemetry.shots = collectShots(qaDir);
    writeTelemetry(qaDir, telemetry);
    return telemetry;
  }

  const windowed = runGodotSync({
    godotPath: opts.godotPath,
    projectPath: opts.projectPath,
    args: [
      '--path',
      opts.projectPath,
      '--rendering-driver',
      getPlatformInfo().capabilities.godotRenderingDriver,
      '--audio-driver',
      'Dummy',
      '--resolution',
      readViewportResolution(opts.projectPath),
      scene,
      '--quit-after',
      '3600',
    ],
    timeoutMs: 300_000,
    windowsHide: false,
    env: {
      METROFORGE_CAPTURE: '1',
      METROFORGE_CAPTURE_STRATEGY: 'windowed_gpu',
      METROFORGE_HUD_MODE: 'PRESENTATION_CAPTURE',
      ...isolatedUserDataEnvironment(opts.userDataDir),
    },
  });

  const critique = recordShotCritique(screenshotPath);
  telemetry.attempts.push({
    strategy: 'windowed_gpu',
    startedAt: new Date().toISOString(),
    elapsedMs: windowed.elapsedMs,
    exitCode: windowed.exitCode,
    textureNull: headlessTextureNull(windowed.output),
    screenshotWritten: existsSync(screenshotPath),
    decodeOk: critique.decodeOk,
    blank: critique.blank,
    uniqueColors: critique.uniqueColors,
    lumaStdDev: critique.lumaStdDev,
    killed: windowed.killed,
  });

  if (critique.decodeOk && !critique.blank) {
    telemetry.strategy = 'windowed_gpu';
  } else {
    telemetry.strategy = 'failed';
    telemetry.reason = critique.decodeOk
      ? 'windowed capture decoded but was blank / low-variance'
      : 'windowed capture did not write a decodable PNG';
  }
  telemetry.shots = collectShots(qaDir);
  writeTelemetry(qaDir, telemetry);
  return telemetry;
}

function readViewportResolution(projectPath: string): string {
  let w = 1280;
  let h = 720;
  try {
    const text = readFileSync(join(projectPath, 'project.godot'), 'utf-8');
    const wm = /window\/size\/viewport_width=(\d+)/.exec(text);
    const hm = /window\/size\/viewport_height=(\d+)/.exec(text);
    if (wm) w = Number(wm[1]);
    if (hm) h = Number(hm[1]);
  } catch {
    /* keep defaults */
  }
  return `${w}x${h}`;
}

function collectShots(qaDir: string): string[] {
  const names = [
    ...REQUIRED_CAPTURE_FILES,
    'screenshot_gameplay.png',
    'screenshot_spawn.png',
    'screenshot_exploration.png',
    'screenshot_combat.png',
    'screenshot_ability.png',
    'screenshot_boss.png',
    'screenshot_slice_tutorial.png',
    'screenshot_slice_traversal.png',
    'screenshot_slice_combat.png',
    'screenshot_slice_challenge.png',
    'screenshot_slice_ability_shrine.png',
    'screenshot_slice_secret.png',
    'screenshot_slice_save.png',
  ];
  return [...new Set(names.filter((name) => existsSync(join(qaDir, name))))];
}

function writeTelemetry(qaDir: string, telemetry: GameplayCaptureTelemetry): void {
  const shots = collectShots(qaDir);
  telemetry.shots = shots;
  const manifest = buildCaptureManifest(
    shots.map((filename) => ({
      filename,
      capturePurpose: filename.replace(/\.(png|jpg)$/i, ''),
      runtimeTimestamp: new Date().toISOString(),
      candidateSlug: 'heart-engine-visual-candidate-09',
    })),
    'heart-engine-visual-candidate-09',
  );
  writeFileSync(join(qaDir, 'capture_telemetry.json'), JSON.stringify({ ...telemetry, shots }, null, 2));
  writeFileSync(join(qaDir, 'capture_manifest.json'), JSON.stringify(manifest, null, 2));
}
