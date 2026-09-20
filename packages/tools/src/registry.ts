import { execFileSync } from 'node:child_process';

export type ToolStatus = 'PASS' | 'WARN' | 'FAIL';

export interface ToolInfo {
  id: string;
  name: string;
  installed: boolean;
  version: string | null;
  path: string | null;
  status: ToolStatus;
  message: string;
  capabilities: string[];
}

type CommandSpec = readonly [executable: string, ...args: string[]];

async function tryExec(commands: CommandSpec[]): Promise<{ version: string; path: string } | null> {
  for (const [executable, ...args] of commands) {
    try {
      const output = execFileSync(executable, args, {
        encoding: 'utf-8',
        timeout: 8000,
        windowsHide: true,
      });
      return { version: output.trim().split('\n')[0] ?? 'detected', path: executable };
    } catch {
      // try next
    }
  }
  return null;
}

export async function detectGodot(
  customPath?: string | null,
  options: {
    preference?: string | null;
    projectOverride?: string | null;
    envPath?: string | null;
  } = {},
): Promise<ToolInfo> {
  // Lazy import to keep registry usable without circular init issues in tests.
  const { resolveGodotExecutableCanonical } = await import('./godot-resolver.js');
  const resolved = resolveGodotExecutableCanonical({
    preference: options.preference ?? customPath,
    projectOverride: options.projectOverride,
    envPath: options.envPath ?? (customPath ? null : process.env.GODOT_EXECUTABLE),
  });
  const installed = Boolean(resolved.path && resolved.version);
  const pathLabel = resolved.path ?? 'none';
  return {
    id: 'godot',
    name: 'Godot',
    installed: Boolean(resolved.path),
    version: resolved.version,
    path: resolved.path,
    status: installed ? 'PASS' : resolved.path ? 'WARN' : 'WARN',
    message: installed
      ? `${resolved.version} · ${resolved.sourceLabel} · ${pathLabel}`
      : resolved.path
        ? `Configured but --version failed (${resolved.sourceLabel}): ${pathLabel}`
        : 'Not detected — set Settings Godot path or GODOT_EXECUTABLE',
    capabilities: installed ? ['headless_validation', 'project_run'] : [],
  };
}

export async function detectOllama(baseUrl?: string): Promise<ToolInfo> {
  const cliResult = await tryExec([['ollama', '--version']]);
  let serverHealthy = false;
  if (baseUrl) {
    try {
      const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      serverHealthy = res.ok;
    } catch {
      serverHealthy = false;
    }
  }

  const installed = !!cliResult || serverHealthy;
  return {
    id: 'ollama',
    name: 'Ollama',
    installed,
    version: cliResult?.version ?? null,
    path: cliResult?.path ?? null,
    status: serverHealthy ? 'PASS' : cliResult ? 'WARN' : 'WARN',
    message: serverHealthy
      ? `Server running at ${baseUrl}`
      : cliResult
        ? 'CLI found but server not reachable'
        : 'Not detected',
    capabilities: serverHealthy ? ['text_generation', 'local_models'] : [],
  };
}

export async function detectGeneric(
  id: string,
  name: string,
  commands: CommandSpec[],
  capabilities: string[] = [],
): Promise<ToolInfo> {
  const result = await tryExec(commands);
  return {
    id,
    name,
    installed: !!result,
    version: result?.version ?? null,
    path: result?.path ?? null,
    status: result ? 'PASS' : 'WARN',
    message: result?.version ?? 'Not detected',
    capabilities: result ? capabilities : [],
  };
}

export async function detectUnity(customPath?: string | null): Promise<ToolInfo> {
  const { resolveUnityEditor, unityVersionSupported } = await import('./engine-resolver.js');
  const resolved = resolveUnityEditor({ envPath: customPath ?? process.env.UNITY_EDITOR ?? process.env.UNITY_PATH });
  const supported = unityVersionSupported(resolved.version);
  return {
    id: 'unity',
    name: 'Unity',
    installed: Boolean(resolved.path),
    version: resolved.version,
    path: resolved.path,
    status: resolved.path && supported ? 'PASS' : resolved.path ? 'WARN' : 'WARN',
    message: resolved.path
      ? `${resolved.version ?? 'detected'} · ${resolved.source} · ${resolved.path}${supported ? '' : ' (supported: 6000.3 LTS)'}`
      : resolved.message,
    capabilities: resolved.path ? ['project_open', 'batch_compile'] : [],
  };
}

export async function detectUnreal(customPath?: string | null): Promise<ToolInfo> {
  const { resolveUnrealEditor, unrealVersionSupported } = await import('./engine-resolver.js');
  const resolved = resolveUnrealEditor({
    envPath: customPath ?? process.env.UE_ROOT ?? process.env.UNREAL_ENGINE ?? process.env.UNREAL_EDITOR,
  });
  const supported = unrealVersionSupported(resolved.version);
  return {
    id: 'unreal',
    name: 'Unreal Engine',
    installed: Boolean(resolved.path),
    version: resolved.version,
    path: resolved.path,
    status: resolved.path && supported ? 'PASS' : resolved.path ? 'WARN' : 'WARN',
    message: resolved.path
      ? `${resolved.version ?? 'detected'} · ${resolved.source} · ${resolved.path}${supported ? '' : ' (supported: 5.5–5.8)'}`
      : resolved.message,
    capabilities: resolved.path ? ['project_open', 'compile'] : [],
  };
}

export class ToolRegistry {
  private tools: Map<string, ToolInfo> = new Map();

  async detectAll(
    options: {
      godotPath?: string | null;
      godotPreference?: string | null;
      godotProjectOverride?: string | null;
      godotEnvPath?: string | null;
      unityPath?: string | null;
      unrealPath?: string | null;
      ollamaUrl?: string;
    } = {},
  ): Promise<ToolInfo[]> {
    const results = await Promise.all([
      detectGodot(options.godotPath, {
        preference: options.godotPreference ?? options.godotPath,
        projectOverride: options.godotProjectOverride,
        envPath: options.godotEnvPath,
      }),
      detectUnity(options.unityPath),
      detectUnreal(options.unrealPath),
      detectOllama(options.ollamaUrl ?? 'http://localhost:11434'),
      detectGeneric('python', 'Python', [['python', '--version'], ['python3', '--version']], ['scripting', 'diffusers_worker']),
      detectGeneric('ffmpeg', 'FFmpeg', [['ffmpeg', '-version']], ['audio_processing']),
      detectGeneric('git', 'Git', [['git', '--version']], ['version_control']),
    ]);

    for (const tool of results) {
      this.tools.set(tool.id, tool);
    }
    return results;
  }

  get(id: string): ToolInfo | undefined {
    return this.tools.get(id);
  }

  list(): ToolInfo[] {
    return Array.from(this.tools.values());
  }
}
