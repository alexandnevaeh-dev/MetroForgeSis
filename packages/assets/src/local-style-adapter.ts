import { extname, isAbsolute, resolve, parse } from 'node:path';
import type { LocalStyleAdapter } from './types/image-gen.js';

export function validateLocalStyleAdapter(value: unknown): LocalStyleAdapter {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid local style adapter');
  const data = value as Record<string, unknown>;
  if (Object.keys(data).sort().join(',') !== 'path,scale,sha256') throw new Error('Invalid local style adapter fields');
  if (typeof data.path !== 'string' || !isAbsolute(data.path) || extname(data.path).toLowerCase() !== '.safetensors') throw new Error('Local style adapter needs an absolute safetensors path');
  const path = resolve(data.path);
  if (process.platform === 'win32' && parse(path).root.toLowerCase() !== 'e:\\') throw new Error('Local style adapter must stay on E:');
  if (typeof data.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(data.sha256)) throw new Error('Invalid local style adapter hash');
  if (typeof data.scale !== 'number' || !Number.isFinite(data.scale) || data.scale <= 0 || data.scale > 2) throw new Error('Invalid local style adapter scale');
  return { path, sha256: data.sha256, scale: data.scale };
}

export function localStyleAdapterMatches(expected: LocalStyleAdapter | undefined, actual: unknown): boolean {
  if (!expected) return actual == null;
  try {
    const requested = validateLocalStyleAdapter(expected), applied = validateLocalStyleAdapter(actual);
    const normalize = (path: string) => process.platform === 'win32' ? path.toLowerCase() : path;
    return normalize(requested.path) === normalize(applied.path) && requested.sha256 === applied.sha256 && requested.scale === applied.scale;
  } catch { return false; }
}
