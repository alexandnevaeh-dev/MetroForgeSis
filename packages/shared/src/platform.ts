import { execFileSync, spawnSync, type ChildProcess } from 'node:child_process';
import {
  accessSync,
  constants,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { arch as hostArch, homedir, platform as hostPlatform, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export type RuntimePlatformId =
  | 'darwin-arm64'
  | 'darwin-x64'
  | 'win32-x64'
  | 'win32-arm64'
  | 'linux-x64'
  | 'linux-arm64'
  | 'unsupported';

export interface PlatformCapabilities {
  metal: boolean;
  directMl: boolean;
  posixSignals: boolean;
  nativeArm64: boolean;
  godotRenderingDriver: 'metal' | 'd3d12' | 'vulkan';
}

export interface PlatformInfo {
  os: NodeJS.Platform;
  architecture: string;
  runtime: RuntimePlatformId;
  isRosetta: boolean;
  capabilities: PlatformCapabilities;
}

export interface WorkspaceWriteProbe {
  writable: boolean;
  root: string;
  message: string;
  errorCode?: string;
}

export function classifyRuntimePlatform(
  os: NodeJS.Platform,
  architecture: string,
): RuntimePlatformId {
  const candidate = `${os}-${architecture}`;
  switch (candidate) {
    case 'darwin-arm64':
    case 'darwin-x64':
    case 'win32-x64':
    case 'win32-arm64':
    case 'linux-x64':
    case 'linux-arm64':
      return candidate;
    default:
      return 'unsupported';
  }
}

function detectRosetta(os: NodeJS.Platform, architecture: string): boolean {
  if (os !== 'darwin' || architecture !== 'x64') return false;
  try {
    return execFileSync('/usr/sbin/sysctl', ['-in', 'sysctl.proc_translated'], {
      encoding: 'utf8',
      timeout: 2_000,
    }).trim() === '1';
  } catch {
    return false;
  }
}

export function getPlatformInfo(
  os: NodeJS.Platform = hostPlatform(),
  architecture: string = hostArch(),
  isRosetta = detectRosetta(os, architecture),
): PlatformInfo {
  const runtime = classifyRuntimePlatform(os, architecture);
  return {
    os,
    architecture,
    runtime,
    isRosetta,
    capabilities: {
      metal: os === 'darwin' && architecture === 'arm64' && !isRosetta,
      directMl: os === 'win32',
      posixSignals: os !== 'win32',
      nativeArm64: architecture === 'arm64' && !isRosetta,
      godotRenderingDriver: os === 'darwin' ? 'metal' : os === 'win32' ? 'd3d12' : 'vulkan',
    },
  };
}

export function canonicalizePath(path: string): string {
  const absolute = resolve(path);
  try {
    return realpathSync.native(absolute);
  } catch {
    return absolute;
  }
}

export function getTempDirectory(prefix = 'metroforge-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function probeWorkspaceWritable(root: string): WorkspaceWriteProbe {
  const canonicalRoot = canonicalizePath(root);
  let probeDir: string | null = null;
  try {
    accessSync(canonicalRoot, constants.W_OK);
    probeDir = mkdtempSync(join(canonicalRoot, '.metroforge-write-probe-'));
    writeFileSync(join(probeDir, 'probe'), 'ok\n', { flag: 'wx' });
    rmSync(probeDir, { recursive: true, force: true });
    return {
      writable: true,
      root: canonicalRoot,
      message: 'Workspace filesystem is writable.',
    };
  } catch (error) {
    if (probeDir) {
      try {
        rmSync(probeDir, { recursive: true, force: true });
      } catch {
        // Preserve the original, actionable failure.
      }
    }
    const code = error instanceof Error && 'code' in error
      ? String((error as NodeJS.ErrnoException).code ?? '')
      : undefined;
    return {
      writable: false,
      root: canonicalRoot,
      errorCode: code || undefined,
      message: code === 'EROFS'
        ? 'Workspace volume is mounted read-only.'
        : `Workspace is not writable${code ? ` (${code})` : ''}.`,
    };
  }
}

/** Child environment that keeps Godot state out of the real user profile on every OS. */
export function isolatedUserDataEnvironment(
  userDataDir: string | undefined,
  os: NodeJS.Platform = hostPlatform(),
): NodeJS.ProcessEnv | undefined {
  if (!userDataDir) return undefined;
  mkdirSync(userDataDir, { recursive: true });
  if (os === 'win32') {
    return { APPDATA: userDataDir, LOCALAPPDATA: userDataDir };
  }
  if (os === 'darwin') {
    return { HOME: userDataDir };
  }
  return { HOME: userDataDir, XDG_DATA_HOME: join(userDataDir, '.local', 'share') };
}

export function terminateProcessTree(
  processOrPid: ChildProcess | number,
  os: NodeJS.Platform = hostPlatform(),
): boolean {
  const pid = typeof processOrPid === 'number' ? processOrPid : processOrPid.pid;
  if (!pid || pid <= 0) return false;
  try {
    if (os === 'win32') {
      const result = spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      return result.status === 0;
    }
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      process.kill(pid, 'SIGTERM');
    }
    return true;
  } catch {
    return false;
  }
}

export function userHomeDirectory(): string {
  return homedir();
}
