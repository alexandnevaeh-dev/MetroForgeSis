import type { Command } from 'commander';
import { getVersionString } from '@metroforge/core';
import { loadConfig } from '@metroforge/shared';
import { ToolRegistry } from '@metroforge/tools';

interface CheckResult {
  name: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  message: string;
}

async function checkNode(): Promise<CheckResult> {
  const major = parseInt(process.version.slice(1).split('.')[0] ?? '0', 10);
  if (major >= 20) {
    return { name: 'Node.js', status: 'PASS', message: process.version };
  }
  return {
    name: 'Node.js',
    status: 'FAIL',
    message: `${process.version} — requires Node 20+`,
  };
}

async function checkPnpm(): Promise<CheckResult> {
  try {
    const { execSync } = await import('node:child_process');
    const version = execSync('pnpm --version', { encoding: 'utf-8' }).trim();
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
      const toolRegistry = new ToolRegistry();
      const tools = await toolRegistry.detectAll({
        godotPath: config.godotExecutable,
        ollamaUrl: config.ollamaBaseUrl,
      });

      const checks: CheckResult[] = [
        await checkNode(),
        await checkPnpm(),
        ...tools.map((t) => ({
          name: t.name,
          status: t.status,
          message: t.message,
        })),
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
