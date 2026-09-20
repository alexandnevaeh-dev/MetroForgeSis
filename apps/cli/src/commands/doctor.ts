import type { Command } from 'commander';
import { getVersionString } from '@metroforge/core';
import { loadConfig } from '@metroforge/shared';
import { getPlatformInfo, probeWorkspaceWritable, ToolRegistry } from '@metroforge/tools';
import { NvidiaProvider } from '@metroforge/ai';

interface CheckResult {
  name: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  message: string;
}

/** Reports configuration + reachability only — never the key itself, per NVIDIA_API_KEY
 *  handling requirements (secrets must never be printed, logged, or surfaced in the UI). */
async function checkNvidia(): Promise<CheckResult> {
  const provider = new NvidiaProvider({
    apiKey: process.env.NVIDIA_API_KEY,
    baseUrl: process.env.NVIDIA_API_BASE_URL || 'https://integrate.api.nvidia.com/v1',
    defaultModel: 'meta/llama-3.1-8b-instruct',
    enabled: true,
  });

  const details = await provider.getHealthDetails();
  if (!details.configured) {
    return { name: 'NVIDIA NIM', status: 'WARN', message: 'API Key: NOT CONFIGURED' };
  }
  if (details.reachable) {
    return { name: 'NVIDIA NIM', status: 'PASS', message: `API Key: CONFIGURED — API: REACHABLE (${details.latencyMs}ms)` };
  }
  return {
    name: 'NVIDIA NIM',
    status: 'WARN',
    message: `API Key: CONFIGURED — API: UNREACHABLE (${details.errorCode ?? 'unknown error'})`,
  };
}

async function checkNode(): Promise<CheckResult> {
  const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
  if (major > 22 || (major === 22 && minor >= 5)) {
    return { name: 'Node.js', status: 'PASS', message: process.version };
  }
  return {
    name: 'Node.js',
    status: 'FAIL',
    message: `${process.version} — requires Node 22.5+`,
  };
}

async function checkPnpm(): Promise<CheckResult> {
  try {
    const { execFileSync } = await import('node:child_process');
    let version: string;
    try {
      version = execFileSync('pnpm', ['--version'], { encoding: 'utf-8' }).trim();
    } catch {
      version = execFileSync('corepack', ['pnpm', '--version'], { encoding: 'utf-8' }).trim();
    }
    return { name: 'pnpm', status: 'PASS', message: `v${version}` };
  } catch {
    return { name: 'pnpm', status: 'WARN', message: 'Not found in PATH' };
  }
}

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Inspect environment and dependencies')
    .action(async () => {
      console.log(getVersionString());
      console.log('--- Environment Check ---\n');

      const config = loadConfig();
      const platform = getPlatformInfo();
      const workspace = probeWorkspaceWritable(process.cwd());
      const toolRegistry = new ToolRegistry();
      const tools = await toolRegistry.detectAll({
        godotPath: config.godotExecutable,
        unityPath: config.unityEditor,
        unrealPath: config.unrealEditor,
        ollamaUrl: config.ollamaBaseUrl,
      });

      const checks: CheckResult[] = [
        await checkNode(),
        await checkPnpm(),
        {
          name: 'Platform',
          status: platform.runtime === 'unsupported' || platform.isRosetta ? 'WARN' : 'PASS',
          message: `${platform.runtime}${platform.isRosetta ? ' (Rosetta translated)' : ' (native)'}`,
        },
        {
          name: 'Workspace filesystem',
          status: workspace.writable ? 'PASS' : 'FAIL',
          message: `${workspace.message} ${workspace.root}`,
        },
        ...tools.map((t) => ({
          name: t.name,
          status: t.status,
          message: t.message,
        })),
        await checkNvidia(),
        {
          name: 'Generated games dir',
          status: 'PASS' as const,
          message: config.generatedGamesDir,
        },
      ];

      let hasFail = false;
      for (const check of checks) {
        const icon = check.status === 'PASS' ? '✓' : check.status === 'WARN' ? '!' : '✗';
        console.log(`[${icon}] ${check.name}: ${check.message}`);
        if (check.status === 'FAIL') hasFail = true;
      }

      console.log('');
      if (hasFail) {
        console.log('Some checks FAILED. Fix issues above before generating.');
        process.exitCode = 1;
      } else {
        console.log('Environment check complete.');
      }
    });
}
