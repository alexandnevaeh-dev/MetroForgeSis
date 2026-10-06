import { accessSync, constants, existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Where the resolved Godot binary came from — single source of truth for Settings / Doctor / Play. */
export type GodotResolveSource =
  | 'preference'
  | 'project_override'
  | 'env'
  | 'path'
  | 'known_path'
  | 'none';

export interface GodotResolveResult {
  path: string | null;
  source: GodotResolveSource;
  version: string | null;
  /** Human-readable label for UI (no secrets). */
  sourceLabel: string;
}

export interface ResolveGodotOptions {
  /** App preference `app.godotExecutable` (Settings). Highest priority when non-empty. */
  preference?: string | null;
  /** Optional per-project override from project.json `godotExecutable`. */
  projectOverride?: string | null;
  /** Explicit environment/config path. Falls back to GODOT_EXECUTABLE, GODOT4_PATH, GODOT_PATH. */
  envPath?: string | null;
  /** Dependency-injection seams for cross-platform tests and embedded runtimes. */
  platform?: NodeJS.Platform;
  architecture?: string;
  environment?: NodeJS.ProcessEnv;
  homeDir?: string;
  /** Extra candidate absolute paths (tests / custom). */
  extraKnownPaths?: string[];
  /** When false, skip `--version` probe (path existence only). Default true. */
  probeVersion?: boolean;
}

const SOURCE_LABELS: Record<GodotResolveSource, string> = {
  preference: 'App preference',
  project_override: 'Project override',
  env: 'Godot environment override',
  path: 'PATH',
  known_path: 'Known install path',
  none: 'Not found',
};

function normalizePath(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim().replace(/^["']|["']$/g, '');
  return trimmed.length > 0 ? trimmed : null;
}

function executableFromCandidate(candidate: string, platform: NodeJS.Platform): string {
  if (platform === 'darwin' && /\.app\/?$/i.test(candidate)) {
    return join(candidate.replace(/\/$/, ''), 'Contents', 'MacOS', 'Godot');
  }
  return candidate;
}

function pathExists(candidate: string, platform: NodeJS.Platform): boolean {
  try {
    if (!existsSync(candidate)) return false;
    if (platform !== 'win32') accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function probeVersion(executable: string, environment: NodeJS.ProcessEnv): string | null {
  try {
    const output = execFileSync(executable, ['--version'], {
      encoding: 'utf-8',
      timeout: 8000,
      windowsHide: true,
      env: environment,
    });
    return output.trim().split('\n')[0] ?? null;
  } catch {
    return null;
  }
}

/** Commands that rely on PATH lookup (no absolute path required upfront). */
function pathCommands(): string[] {
  return ['godot', 'godot4'];
}

export function defaultGodotKnownPaths(
  platform: NodeJS.Platform = process.platform,
  home = homedir(),
  environment: NodeJS.ProcessEnv = process.env,
): string[] {
  const localAppData = environment.LOCALAPPDATA;
  const programFiles = environment.ProgramFiles;
  const programFilesX86 = environment['ProgramFiles(x86)'];
  const candidates: string[] = [];

  if (platform === 'win32') {
    if (localAppData) {
      candidates.push(
        join(localAppData, 'Godot', 'Godot_v4.exe'),
        join(localAppData, 'Programs', 'Godot', 'Godot.exe'),
      );
    }
    if (programFiles) {
      candidates.push(
        join(programFiles, 'Godot', 'Godot.exe'),
        join(programFiles, 'Godot', 'Godot_v4.exe'),
      );
    }
    if (programFilesX86) {
      candidates.push(join(programFilesX86, 'Godot', 'Godot.exe'));
    }
    candidates.push('C:\\Godot\\Godot.exe', 'C:\\Godot\\Godot_v4.exe');
  } else if (platform === 'darwin') {
    candidates.push(
      '/Applications/Godot.app/Contents/MacOS/Godot',
      join(home, 'Applications', 'Godot.app', 'Contents', 'MacOS', 'Godot'),
      '/opt/homebrew/bin/godot',
      '/usr/local/bin/godot',
    );
  } else {
    candidates.push(
      '/usr/bin/godot',
      '/usr/local/bin/godot',
      '/usr/bin/godot4',
      '/usr/local/bin/godot4',
      join(home, '.local', 'bin', 'godot'),
    );
  }
  return candidates;
}

/** Where `remote:model:install` / prior sessions have cached a downloaded Godot runtime. */
function managedRuntimeDir(
  platform: NodeJS.Platform,
  home: string,
  environment: NodeJS.ProcessEnv,
): string | null {
  if (platform === 'win32') {
    const localAppData = environment.LOCALAPPDATA;
    return localAppData ? join(localAppData, 'MetroForge', 'Godot') : null;
  }
  if (platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'MetroForge', 'Godot');
  }
  return join(home, '.local', 'share', 'MetroForge', 'Godot');
}

/** Scans the managed runtime cache for a Godot executable without hardcoding a version number. */
function managedRuntimeCandidates(
  platform: NodeJS.Platform,
  home: string,
  environment: NodeJS.ProcessEnv,
): string[] {
  const dir = managedRuntimeDir(platform, home, environment);
  if (!dir || !existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((f) => /^godot/i.test(f) && !/console/i.test(f))
      .filter((f) => (platform === 'win32' ? f.toLowerCase().endsWith('.exe') : true))
      .map((f) => executableFromCandidate(join(dir, f), platform));
  } catch {
    return [];
  }
}

function tryAbsolute(
  candidate: string,
  source: GodotResolveSource,
  probe: boolean,
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv,
): GodotResolveResult | null {
  const executable = executableFromCandidate(candidate, platform);
  if (!pathExists(executable, platform)) return null;
  const version = probe ? probeVersion(executable, environment) : null;
  // Preference/env/project may point at a path that exists but fails --version (wrong binary).
  // Still accept existence for preference/project/env so Settings "Test" can surface the failure.
  if (probe && version == null && (source === 'path' || source === 'known_path')) {
    return null;
  }
  return {
    path: executable,
    source,
    version,
    sourceLabel: SOURCE_LABELS[source],
  };
}

function tryPathCommand(
  cmd: string,
  probe: boolean,
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv,
): GodotResolveResult | null {
  try {
    const locator = platform === 'win32' ? 'where.exe' : '/usr/bin/which';
    const whereOut = execFileSync(locator, [cmd], {
      encoding: 'utf-8',
      timeout: 5000,
      windowsHide: true,
      env: environment,
    });
    const resolved = whereOut.trim().split(/\r?\n/)[0] ?? cmd;
    const version = probeVersion(resolved, environment);
    if (probe && version == null) return null;
    return {
      path: resolved,
      source: 'path',
      version,
      sourceLabel: SOURCE_LABELS.path,
    };
  } catch {
    return null;
  }
}

/**
 * Canonical Godot executable resolver.
 * Precedence: preference → project override → GODOT_EXECUTABLE → PATH → known install paths.
 */
export function resolveGodotExecutableCanonical(
  options: ResolveGodotOptions = {},
): GodotResolveResult {
  const probe = options.probeVersion !== false;
  const platform = options.platform ?? process.platform;
  const environment = options.environment ?? process.env;
  const home = options.homeDir ?? homedir();
  const preference = normalizePath(options.preference);
  const projectOverride = normalizePath(options.projectOverride);
  const explicitEnvPath = Object.prototype.hasOwnProperty.call(options, 'envPath')
    ? options.envPath
    : environment.GODOT_EXECUTABLE ?? environment.GODOT4_PATH ?? environment.GODOT_PATH;
  const envPath = normalizePath(explicitEnvPath);

  const ordered: Array<{ value: string; source: GodotResolveSource }> = [];
  if (preference) ordered.push({ value: preference, source: 'preference' });
  if (projectOverride) ordered.push({ value: projectOverride, source: 'project_override' });
  if (envPath) ordered.push({ value: envPath, source: 'env' });

  for (const entry of ordered) {
    const hit = tryAbsolute(entry.value, entry.source, probe, platform, environment);
    if (hit) return hit;
    // Preference / override / env that do not exist still "win" as the declared path so UI can show
    // the configured value and Test can fail honestly — only when the path string was set.
    if (!pathExists(executableFromCandidate(entry.value, platform), platform) && (entry.source === 'preference' || entry.source === 'project_override' || entry.source === 'env')) {
      return {
        path: entry.value,
        source: entry.source,
        version: null,
        sourceLabel: SOURCE_LABELS[entry.source],
      };
    }
  }

  for (const cmd of pathCommands()) {
    const hit = tryPathCommand(cmd, probe, platform, environment);
    if (hit) return hit;
  }

  const known = [
    ...(options.extraKnownPaths ?? []),
    ...managedRuntimeCandidates(platform, home, environment),
    ...defaultGodotKnownPaths(platform, home, environment),
  ];
  for (const candidate of known) {
    const hit = tryAbsolute(candidate, 'known_path', probe, platform, environment);
    if (hit) return hit;
  }

  return {
    path: null,
    source: 'none',
    version: null,
    sourceLabel: SOURCE_LABELS.none,
  };
}

/** Read optional `godotExecutable` from project.json when present. */
export function readProjectGodotOverride(projectPath: string | null | undefined): string | null {
  if (!projectPath) return null;
  try {
    const metaPath = join(projectPath, 'project.json');
    if (!existsSync(metaPath)) return null;
    const raw = JSON.parse(readFileSync(metaPath, 'utf-8')) as Record<string, unknown>;
    return normalizePath(typeof raw.godotExecutable === 'string' ? raw.godotExecutable : null);
  } catch {
    return null;
  }
}
