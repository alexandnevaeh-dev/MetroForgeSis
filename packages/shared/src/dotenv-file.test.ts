import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readDotEnvVar, upsertDotEnvVar } from './dotenv-file.js';

describe('dotenv-file', () => {
  it('reads and upserts NVIDIA_IMAGE_MODEL', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mf-dotenv-'));
    const envPath = join(dir, '.env');
    writeFileSync(envPath, 'FOO=1\nNVIDIA_IMAGE_MODEL=old-model\nBAR=2\n', 'utf-8');

    expect(readDotEnvVar(envPath, 'NVIDIA_IMAGE_MODEL')).toBe('old-model');

    const result = upsertDotEnvVar(envPath, 'NVIDIA_IMAGE_MODEL', 'black-forest-labs/flux.1-dev');
    expect(result.changed).toBe(true);
    expect(readDotEnvVar(envPath, 'NVIDIA_IMAGE_MODEL')).toBe('black-forest-labs/flux.1-dev');
    const body = readFileSync(envPath, 'utf-8');
    expect(body).toContain('FOO=1');
    expect(body).toContain('BAR=2');
    expect(body).toContain('NVIDIA_IMAGE_MODEL=black-forest-labs/flux.1-dev');
    expect(body).not.toContain('old-model');
  });

  it('appends key when missing and is idempotent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mf-dotenv-miss-'));
    const envPath = join(dir, '.env');
    writeFileSync(envPath, 'FOO=1\n', 'utf-8');

    expect(upsertDotEnvVar(envPath, 'NVIDIA_IMAGE_MODEL', 'm1').changed).toBe(true);
    expect(upsertDotEnvVar(envPath, 'NVIDIA_IMAGE_MODEL', 'm1').changed).toBe(false);
    expect(readDotEnvVar(envPath, 'NVIDIA_IMAGE_MODEL')).toBe('m1');
  });

  it('creates the file when absent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mf-dotenv-new-'));
    const envPath = join(dir, '.env');
    const result = upsertDotEnvVar(envPath, 'NVIDIA_IMAGE_MODEL', 'new');
    expect(result.created).toBe(true);
    expect(readDotEnvVar(envPath, 'NVIDIA_IMAGE_MODEL')).toBe('new');
  });
});
