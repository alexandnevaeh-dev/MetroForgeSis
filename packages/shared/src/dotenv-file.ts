import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * Read a single KEY=value from a dotenv-style file (no expansion / multiline support).
 * Returns null when the file or key is missing.
 */
export function readDotEnvVar(envPath: string, key: string): string | null {
  if (!existsSync(envPath)) return null;
  const lines = readFileSync(envPath, 'utf-8').split(/\r?\n/);
  const prefix = `${key}=`;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed.startsWith(prefix) || line.startsWith(prefix)) {
      const raw = line.startsWith(prefix) ? line.slice(prefix.length) : trimmed.slice(prefix.length);
      return stripQuotes(raw.trim());
    }
  }
  return null;
}

/**
 * Insert or replace KEY=value in a dotenv file. Creates the file when missing.
 * Preserves other lines and comments. Does not export into process.env.
 */
export function upsertDotEnvVar(envPath: string, key: string, value: string): { created: boolean; changed: boolean } {
  const line = `${key}=${value}`;
  if (!existsSync(envPath)) {
    writeFileSync(envPath, `${line}\n`, 'utf-8');
    return { created: true, changed: true };
  }

  const original = readFileSync(envPath, 'utf-8');
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  const lines = original.split(/\r?\n/);
  const prefix = `${key}=`;
  let found = false;
  let changed = false;
  const next = lines.map((existing) => {
    const trimmed = existing.trim();
    if (!trimmed || trimmed.startsWith('#')) return existing;
    if (trimmed.startsWith(prefix) || existing.startsWith(prefix)) {
      found = true;
      if (existing === line) return existing;
      changed = true;
      return line;
    }
    return existing;
  });

  if (!found) {
    if (next.length > 0 && next[next.length - 1] === '') {
      next[next.length - 1] = line;
      next.push('');
    } else {
      next.push(line);
    }
    changed = true;
  }

  if (!changed) return { created: false, changed: false };

  let body = next.join(eol);
  if (!body.endsWith(eol)) body += eol;
  writeFileSync(envPath, body, 'utf-8');
  return { created: false, changed: true };
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
