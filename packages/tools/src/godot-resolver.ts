import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
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
  /** `GODOT_EXECUTABLE` / loadConfig().godotExecutable. */
  envPath?: string | null;
  /** Extra candidate absolute paths (tests / custom). */
  extraKnownPaths?: string[];
  /** When false, skip `--version` probe (path existence only). Default true. */
  probeVersion?: boolean;
}

const SOURCE_LABELS: Record<GodotResolveSource, string> = {
  preference: 'App preference',
  project_override: 'Project override',
  env: 'GODOT_EXECUTABLE',
  path: 'PATH',
  known_path: 'Known install path',
  none: 'Not found',
};

function normalizePath(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim().replace(/^["']|["']$/g, '');
  return trimmed.length > 0 ? trimmed : null;
}

function pathExists(candidate: string): boolean {
  try {
    return existsSync(candidate);
  } catch {
    return false;
  }
}

function probeVersion(executable: string): string | null {
  try {
    const output = execSync(`"${executable}" --version`, {
      encoding: 'utf-8',
      timeout: 8000,
      windowsHide: true,
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

function defaultKnownPaths(): string[] {
  const home = homedir();
  const localAppData = process.env.LOCALAPPDATA;
  const programFiles = process.env.ProgramFiles;
  const programFilesX86 = process.env['ProgramFiles(x86)'];
  const candidates: string[] = [];

  if (process.platform === 'win32') {
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
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Godot.app/Contents/MacOS/Godot',
      join(home, 'Applications', 'Godot.app', 'Contents', 'MacOS', 'Godot'),
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

function tryAbsolute(
  candidate: string,
  source: GodotResolveSource,
  probe: boolean,
): GodotResolveResult | null {
  if (!pathExists(candidate)) return null;
  const version = probe ? probeVersion(candidate) : null;
  // Preference/env/project may point at a path that exists but fails --version (wrong binary).
  // Still accept existence for preference/project/env so Settings "Test" can surface the failure.
  if (probe && version == null && (source === 'path' || source === 'known_path')) {
    return null;
  }
  return {
    path: candidate,
    source,
    version,
    sourceLabel: SOURCE_LABELS[source],
  };
}

function tryPathCommand(cmd: string, probe: boolean): GodotResolveResult | null {
  try {
    const output = execSync(`${cmd} --version`, {
      encoding: 'utf-8',
      timeout: 8000,
      windowsHide: true,
    });
    const version = output.trim().split('\n')[0] ?? null;
    // Resolve which binary PATH used when possible
    let resolved: string | null = cmd;
    try {
      if (process.platform === 'win32') {
        const whereOut = execSync(`where ${cmd}`, {
          encoding: 'utf-8',
          timeout: 5000,
          windowsHide: true,
        });
        resolved = whereOut.trim().split(/\r?\n/)[0] ?? cmd;
      } else {
        const whichOut = execSync(`command -v ${cmd}`, {
          encoding: 'utf-8',
          timeout: 5000,
          windowsHide: true,
          shell: '/bin/sh',
        });
        resolved = whichOut.trim() || cmd;
      }
    } catch {
      resolved = cmd;
    }
    return {
      path: resolved,
      source: 'path',
      version: probe ? version : version,
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
  const preference = normalizePath(options.preference);
  const projectOverride = normalizePath(options.projectOverride);
  const envPath = normalizePath(options.envPath ?? process.env.GODOT_EXECUTABLE);

  const ordered: Array<{ value: string; source: GodotResolveSource }> = [];
  if (preference) ordered.push({ value: preference, source: 'preference' });
  if (projectOverride) ordered.push({ value: projectOverride, source: 'project_override' });
  if (envPath) ordered.push({ value: envPath, source: 'env' });

  for (const entry of ordered) {
    const hit = tryAbsolute(entry.value, entry.source, probe);
    if (hit) return hit;
    // Preference / override / env that do not exist still "win" as the declared path so UI can show
    // the configured value and Test can fail honestly — only when the path string was set.
    if (!pathExists(entry.value) && (entry.source === 'preference' || entry.source === 'project_override' || entry.source === 'env')) {
      return {
        path: entry.value,
        source: entry.source,
        version: null,
        sourceLabel: SOURCE_LABELS[entry.source],
      };
    }
  }

  for (const cmd of pathCommands()) {
    const hit = tryPathCommand(cmd, probe);
    if (hit) return hit;
  }

  const known = [...(options.extraKnownPaths ?? []), ...defaultKnownPaths()];
  for (const candidate of known) {
    const hit = tryAbsolute(candidate, 'known_path', probe);
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
