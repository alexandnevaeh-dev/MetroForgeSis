import { accessSync, constants, existsSync, readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface UnityResolveResult {
  path: string | null;
  version: string | null;
  source: 'env' | 'hub' | 'path' | 'none';
  message: string;
}

function unityBinaryFromEditorDir(editorDir: string, platform: NodeJS.Platform): string | null {
  if (platform === 'darwin') {
    const mac = join(editorDir, 'Unity.app', 'Contents', 'MacOS', 'Unity');
    return existsSync(mac) ? mac : null;
  }
  if (platform === 'win32') {
    const exe = join(editorDir, 'Editor', 'Unity.exe');
    return existsSync(exe) ? exe : null;
  }
  const linux = join(editorDir, 'Editor', 'Unity');
  return existsSync(linux) ? linux : null;
}

function probeUnityVersion(executable: string): string | null {
  const plist = join(executable, '..', '..', 'Info.plist');
  if (existsSync(plist)) {
    try {
      const xml = readFileSync(plist, 'utf-8');
      const match = xml.match(/<key>CFBundleVersion<\/key>\s*<string>([^<]+)<\/string>/);
      if (match?.[1]) return match[1];
    } catch {
      // fall through to launching the editor
    }
  }
  try {
    const output = execFileSync(executable, ['-version'], {
      encoding: 'utf-8',
      timeout: 12000,
      windowsHide: true,
    });
    return output.trim().split('\n')[0] ?? null;
  } catch {
    return null;
  }
}

export function resolveUnityEditor(options: {
  envPath?: string | null;
  platform?: NodeJS.Platform;
  homeDir?: string;
} = {}): UnityResolveResult {
  const platform = options.platform ?? process.platform;
  const home = options.homeDir ?? homedir();
  const env = options.envPath?.trim() || null;
  if (env && existsSync(env)) {
    try {
      if (platform !== 'win32') accessSync(env, constants.X_OK);
    } catch {
      return { path: env, version: null, source: 'env', message: `Configured but not executable: ${env}` };
    }
    return {
      path: env,
      version: probeUnityVersion(env),
      source: 'env',
      message: env,
    };
  }

  const hubRoots = [
    '/Volumes/DevDrive/Unity/Hub/Editor',
    join(home, 'Unity', 'Hub', 'Editor'),
    '/Applications/Unity/Hub/Editor',
    join(home, 'Applications', 'Unity', 'Hub', 'Editor'),
    'C:\\Program Files\\Unity\\Hub\\Editor',
  ];
  const versions: string[] = [];
  for (const root of hubRoots) {
    if (!existsSync(root)) continue;
    try {
      versions.push(...readdirSync(root).map((name) => join(root, name)));
    } catch {
      // ignore
    }
  }
  versions.sort().reverse();
  const preferred =
    versions.find((dir) => /6000\.3/.test(dir) && unityBinaryFromEditorDir(dir, platform)) ??
    versions.find((dir) => unityBinaryFromEditorDir(dir, platform));
  if (preferred) {
    const bin = unityBinaryFromEditorDir(preferred, platform);
    if (bin) {
      return {
        path: bin,
        version: probeUnityVersion(bin) ?? preferred.split(/[/\\]/).pop() ?? null,
        source: 'hub',
        message: bin,
      };
    }
  }
  return {
    path: null,
    version: null,
    source: 'none',
    message: 'Not detected — install Unity 6.3 LTS or set UNITY_EDITOR',
  };
}

export function unityVersionSupported(version: string | null): boolean {
  if (!version) return false;
  return /6000\.3/.test(version) || /^6000\./.test(version);
}

export interface UnrealResolveResult {
  path: string | null;
  version: string | null;
  source: 'env' | 'known_path' | 'none';
  message: string;
}

function unrealEditorBinary(engineRoot: string, platform: NodeJS.Platform): string | null {
  if (platform === 'darwin') {
    const mac = join(engineRoot, 'Engine', 'Binaries', 'Mac', 'UnrealEditor.app', 'Contents', 'MacOS', 'UnrealEditor');
    return existsSync(mac) ? mac : null;
  }
  if (platform === 'win32') {
    const exe = join(engineRoot, 'Engine', 'Binaries', 'Win64', 'UnrealEditor.exe');
    return existsSync(exe) ? exe : null;
  }
  const linux = join(engineRoot, 'Engine', 'Binaries', 'Linux', 'UnrealEditor');
  return existsSync(linux) ? linux : null;
}

export function resolveUnrealEditor(options: {
  envPath?: string | null;
  platform?: NodeJS.Platform;
  homeDir?: string;
} = {}): UnrealResolveResult {
  const platform = options.platform ?? process.platform;
  const home = options.homeDir ?? homedir();
  const env = options.envPath?.trim() || null;
  if (env && existsSync(env)) {
    const bin = env.endsWith('.exe') || env.includes('UnrealEditor') ? env : unrealEditorBinary(env, platform);
    return {
      path: bin,
      version: env.match(/UE_(\d+\.\d+)/)?.[1] ?? null,
      source: 'env',
      message: bin ?? env,
    };
  }
  const roots = [
    join(home, 'Epic Games'),
    '/Users/Shared/Epic Games',
    'C:\\Program Files\\Epic Games',
  ];
  const found: { root: string; version: string }[] = [];
  for (const base of roots) {
    if (!existsSync(base)) continue;
    try {
      for (const name of readdirSync(base)) {
        const match = name.match(/^UE_(\d+\.\d+)/);
        if (match) found.push({ root: join(base, name), version: match[1]! });
      }
    } catch {
      // ignore
    }
  }
  found.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
  const preferred = found.find((e) => e.version.startsWith('5.8')) ?? found.find((e) => e.version.startsWith('5.')) ?? found[0];
  if (preferred) {
    const bin = unrealEditorBinary(preferred.root, platform);
    return {
      path: bin,
      version: preferred.version,
      source: 'known_path',
      message: bin ?? `Engine root ${preferred.root} has no UnrealEditor binary`,
    };
  }
  return {
    path: null,
    version: null,
    source: 'none',
    message: 'Not detected — install Unreal Engine 5.8 or set UE_ROOT',
  };
}

export function unrealVersionSupported(version: string | null): boolean {
  if (!version) return false;
  return /^5\.(5|6|7|8)/.test(version);
}

export function missingEditorError(
  engine: 'unity' | 'unreal',
  resolved: { path: string | null; version: string | null; message: string },
): string {
  if (engine === 'unity') {
    if (!resolved.path) {
      return `UNITY_EDITOR_NOT_AVAILABLE: ${resolved.message}. Install Unity 6.3 LTS via Unity Hub and set UNITY_EDITOR to the editor binary. Generation still writes a project you can open later.`;
    }
    if (resolved.version && !unityVersionSupported(resolved.version)) {
      return `UNITY_VERSION_UNSUPPORTED: found ${resolved.version} at ${resolved.path}. Supported: Unity 6.3 LTS (6000.3).`;
    }
    return '';
  }
  if (!resolved.path) {
    return `UNREAL_EDITOR_NOT_AVAILABLE: ${resolved.message}. Install Unreal Engine 5.8 and set UE_ROOT to the engine root. Generation still writes a project you can compile later.`;
  }
  if (resolved.version && !unrealVersionSupported(resolved.version)) {
    return `UNREAL_VERSION_UNSUPPORTED: found ${resolved.version} at ${resolved.path}. Supported: Unreal Engine 5.5–5.8 (Paper2D).`;
  }
  return '';
}
