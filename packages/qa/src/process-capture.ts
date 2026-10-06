import { spawnSync, type SpawnSyncOptionsWithStringEncoding, type SpawnSyncReturns } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** Windows QA output capture through files; preserves process failures and leaves local evidence. */
export function spawnCapturedSync(command: string, args: string[], options: SpawnSyncOptionsWithStringEncoding): SpawnSyncReturns<string> {
  if (process.platform !== 'win32') return spawnSync(command, args, options);
  const directory = mkdtempSync(join(tmpdir(), 'metroforge-qa-process-'));
  const stdoutPath = join(directory, 'stdout.log');
  const stderrPath = join(directory, 'stderr.log');
  const descriptors: number[] = [];
  let result: SpawnSyncReturns<string>;
  try {
    descriptors.push(openSync(stdoutPath, 'w'));
    descriptors.push(openSync(stderrPath, 'w'));
    result = spawnSync(command, args, { ...options, stdio: ['ignore', descriptors[0]!, descriptors[1]!] });
  } finally {
    for (const descriptor of descriptors) closeSync(descriptor);
  }
  const limit = options.maxBuffer ?? 10 * 1024 * 1024;
  if (statSync(stdoutPath).size + statSync(stderrPath).size > limit) {
    return { ...result, status: null, stdout: '', stderr: `QA output exceeds ${limit} bytes; logs retained in ${directory}`, output: [], error: Object.assign(new Error('QA output limit exceeded'), { code: 'ENOBUFS' }) };
  }
  const stdout = readFileSync(stdoutPath, 'utf8');
  const stderr = readFileSync(stderrPath, 'utf8');
  return { ...result, stdout, stderr, output: ['', stdout, stderr] };
}

export function execFileCapturedSync(command: string, args: string[], options: SpawnSyncOptionsWithStringEncoding): string {
  const result = spawnCapturedSync(command, args, options);
  if (result.error || result.status !== 0) {
    throw Object.assign(new Error(result.error?.message ?? `Process exited with ${result.status}`), {
      stdout: result.stdout, stderr: result.stderr, status: result.status, signal: result.signal,
    });
  }
  // Import diagnostics may be written to stderr even on exit zero.
  return `${result.stdout}\n${result.stderr}`;
}
