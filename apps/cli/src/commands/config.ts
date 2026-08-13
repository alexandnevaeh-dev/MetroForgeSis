import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Command } from 'commander';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const ENV_PATH = join(REPO_ROOT, '.env');
const NVIDIA_IMAGE_MODEL_KEY = 'NVIDIA_IMAGE_MODEL';

function readEnvVar(key: string): string | null {
  if (process.env[key]?.trim()) return process.env[key]!.trim();
  if (!existsSync(ENV_PATH)) return null;
  const text = readFileSync(ENV_PATH, 'utf-8');
  const match = text.match(new RegExp(`^${key}=(.*)$`, 'm'));
  if (!match) return null;
  return match[1]!.trim().replace(/^["']|["']$/g, '') || null;
}

function upsertEnvVar(key: string, value: string): void {
  const line = `${key}=${value}`;
  if (!existsSync(ENV_PATH)) {
    writeFileSync(ENV_PATH, `${line}\n`, 'utf-8');
    return;
  }
  const text = readFileSync(ENV_PATH, 'utf-8');
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(text)) {
    writeFileSync(ENV_PATH, text.replace(re, line), 'utf-8');
  } else {
    const suffix = text.endsWith('\n') || text.length === 0 ? '' : '\n';
    writeFileSync(ENV_PATH, `${text}${suffix}${line}\n`, 'utf-8');
  }
  process.env[key] = value;
}

export function registerConfigCommand(program: Command): void {
  const config = program.command('config').description('Read or write local MetroForge config');

  config
    .command('nvidia-image-model [modelId]')
    .description('Get or set NVIDIA_IMAGE_MODEL in repo .env (used by image probes/pipeline)')
    .action((modelId?: string) => {
      if (!modelId) {
        const current = readEnvVar(NVIDIA_IMAGE_MODEL_KEY);
        console.log(
          current
            ? `NVIDIA_IMAGE_MODEL=${current}`
            : 'NVIDIA_IMAGE_MODEL is not set (env or .env)',
        );
        return;
      }
      const next = modelId.trim();
      if (!next) {
        console.log('✗ modelId must be non-empty');
        process.exitCode = 1;
        return;
      }
      upsertEnvVar(NVIDIA_IMAGE_MODEL_KEY, next);
      console.log(`✓ Wrote ${NVIDIA_IMAGE_MODEL_KEY}=${next} to ${ENV_PATH}`);
    });
}
