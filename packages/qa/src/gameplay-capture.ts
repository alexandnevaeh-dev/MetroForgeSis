import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { critiqueGameplayScreenshot } from '@metroforge/assets';

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

function killProcessTree(pid: number): void {
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
      process.kill(-pid, 'SIGKILL');
    }
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
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
  if (result.pid) killProcessTree(result.pid);
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
      args: ['--headless', '--path', opts.projectPath, scene, '--quit-after', '900'],
      timeoutMs: 90_000,
      windowsHide: true,
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
    args: ['--path', opts.projectPath, '--rendering-driver', 'd3d12', scene, '--quit-after', '900'],
    timeoutMs: 120_000,
    windowsHide: false,
    env: {
      METROFORGE_CAPTURE: '1',
      METROFORGE_CAPTURE_STRATEGY: 'windowed_gpu',
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

function collectShots(qaDir: string): string[] {
  const names = [
    'screenshot_gameplay.png',
    'screenshot_spawn.png',
    'screenshot_exploration.png',
    'screenshot_combat.png',
    'screenshot_ability.png',
    'screenshot_boss.png',
  ];
  return names.filter((name) => existsSync(join(qaDir, name)));
}

function writeTelemetry(qaDir: string, telemetry: GameplayCaptureTelemetry): void {
  writeFileSync(join(qaDir, 'capture_telemetry.json'), JSON.stringify(telemetry, null, 2));
}
