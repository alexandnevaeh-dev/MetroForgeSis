import { execSync } from 'node:child_process';

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

async function tryExec(commands: string[]): Promise<{ version: string; path: string } | null> {
  for (const cmd of commands) {
    try {
      const output = execSync(cmd, { encoding: 'utf-8', timeout: 8000, windowsHide: true });
      return { version: output.trim().split('\n')[0] ?? 'detected', path: cmd.split(' ')[0] ?? cmd };
    } catch {
      // try next
    }
  }
  return null;
}

export async function detectGodot(customPath?: string | null): Promise<ToolInfo> {
  const commands = customPath
    ? [`"${customPath}" --version`]
    : ['godot --version', 'godot4 --version'];
  const result = await tryExec(commands);
  return {
    id: 'godot',
    name: 'Godot',
    installed: !!result,
    version: result?.version ?? null,
    path: customPath ?? result?.path ?? null,
    status: result ? 'PASS' : 'WARN',
    message: result?.version ?? 'Not detected — set GODOT_EXECUTABLE in .env',
    capabilities: result ? ['headless_validation', 'project_run'] : [],
  };
}

export async function detectOllama(baseUrl?: string): Promise<ToolInfo> {
  const cliResult = await tryExec(['ollama --version']);
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
  commands: string[],
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

export class ToolRegistry {
  private tools: Map<string, ToolInfo> = new Map();

  async detectAll(options: { godotPath?: string | null; ollamaUrl?: string } = {}): Promise<ToolInfo[]> {
    const results = await Promise.all([
      detectGodot(options.godotPath),
      detectOllama(options.ollamaUrl ?? 'http://localhost:11434'),
      detectGeneric('python', 'Python', ['python --version', 'python3 --version'], ['scripting', 'diffusers_worker']),
      detectGeneric('ffmpeg', 'FFmpeg', ['ffmpeg -version'], ['audio_processing']),
      detectGeneric('git', 'Git', ['git --version'], ['version_control']),
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
