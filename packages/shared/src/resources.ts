import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const developmentRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** Read-only shipped resources. Never use this root for credentials or generated output. */
export function getResourceRoot(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.METROFORGE_RESOURCE_ROOT;
  if (!configured) return developmentRoot;
  if (!isAbsolute(configured)) {
    throw new Error('METROFORGE_RESOURCE_ROOT must be an absolute path');
  }
  return resolve(configured);
}
