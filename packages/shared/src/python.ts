import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { platform as hostPlatform } from 'node:os';

/**
 * Resolve a real Python interpreter for MetroForge workers (diffusers, local-sprite,
 * JPEG→PNG, local visual fleet). Never return the Windows Store App Execution Alias
 * stubs under WindowsApps — those print "Python was not found" and exit non-zero.
 */
export function isWindowsStorePythonStub(pythonPath: string): boolean {
  const normalized = pythonPath.replace(/\//g, '\\').toLowerCase();
  return (
    normalized.includes('\\windowsapps\\') ||
    normalized.endsWith('\\microsoft\\windowsapps\\python.exe') ||
    normalized.endsWith('\\microsoft\\windowsapps\\python3.exe')
  );
}

function candidateFromDataDir(env: NodeJS.ProcessEnv): string | undefined {
  const dataDir = env.METROFORGE_DATA_DIR?.trim();
  if (!dataDir) return undefined;
  const native = join(dataDir, 'Python', 'diffusers-native', 'Scripts', 'python.exe');
  if (existsSync(native)) return native;
  const junction = join(dataDir, 'Python', 'diffusers', 'Scripts', 'python.exe');
  if (existsSync(junction)) return junction;
  const plain = join(dataDir, 'Python', 'python.exe');
  if (existsSync(plain)) return plain;
  return undefined;
}

/**
 * Preferred order: explicit override → DIFFUSERS_PYTHON → METROFORGE_DATA_DIR native runtime →
 * platform default (`python` / `python3`). Rejects Windows Store stubs when the candidate
 * is an absolute path we can inspect; bare command names are returned as-last-resort so
 * callers that already put a real interpreter on PATH still work.
 *
 * An explicit `override` always wins (even if the file is currently missing) so misconfigured
 * call sites surface a clear spawn error instead of silently falling through to the Store stub.
 */
export function resolvePythonExecutable(
  override?: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = hostPlatform(),
): string {
  const explicit = override?.trim();
  if (explicit && !isWindowsStorePythonStub(explicit)) {
    return explicit;
  }

  const ordered = [
    env.DIFFUSERS_PYTHON?.trim(),
    env.METROFORGE_PYTHON?.trim(),
    candidateFromDataDir(env),
  ].filter((v): v is string => Boolean(v));

  for (const candidate of ordered) {
    if (isWindowsStorePythonStub(candidate)) continue;
    if (candidate.includes('\\') || candidate.includes('/') || candidate.endsWith('.exe')) {
      if (!existsSync(candidate)) continue;
    }
    return candidate;
  }

  return platform === 'win32' ? 'python' : 'python3';
}
