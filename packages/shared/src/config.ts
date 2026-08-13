import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { PRODUCT } from './constants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');

/** Absolute path to the monorepo root (where `.env` and `GeneratedGames` live). */
export function getRepoRoot(): string {
  return REPO_ROOT;
}

// Loaded once at module import time, consistent with how every other repo-root config file
// (config/*.json, the Godot template) is resolved relative to this package's own location
// rather than process.cwd() — so `.env` is found regardless of which directory `metroforge`
// is invoked from. Never overrides variables already set in the shell environment (dotenv's
// default), so explicit env vars always win over the file.
loadDotenv({ path: join(REPO_ROOT, '.env') });

export interface AppConfig {
  appName: string;
  dataDir: string;
  generatedGamesDir: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  defaultMode: 'FREE_ONLY' | 'LOCAL_ONLY' | 'HYBRID_FREE' | 'CUSTOM';
  defaultProfile: 'TINY_TEST' | 'SMALL' | 'MEDIUM' | 'LARGE';
  godotExecutable: string | null;
  ollamaBaseUrl: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    appName: env.METROFORGE_APP_NAME ?? PRODUCT.defaultName,
    dataDir: env.METROFORGE_DATA_DIR ?? '',
    generatedGamesDir: env.METROFORGE_GENERATED_GAMES_DIR ?? 'GeneratedGames',
    logLevel: (env.METROFORGE_LOG_LEVEL as AppConfig['logLevel']) ?? 'info',
    defaultMode: (env.METROFORGE_DEFAULT_MODE as AppConfig['defaultMode']) ?? 'LOCAL_ONLY',
    defaultProfile: (env.METROFORGE_DEFAULT_PROFILE as AppConfig['defaultProfile']) ?? 'TINY_TEST',
    godotExecutable: env.GODOT_EXECUTABLE ?? null,
    ollamaBaseUrl: env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
  };
}

export function resolveGeneratedGamesPath(config: AppConfig, cwd: string): string {
  const { generatedGamesDir } = config;
  if (generatedGamesDir.startsWith('/') || /^[A-Za-z]:/.test(generatedGamesDir)) {
    return generatedGamesDir;
  }
  return `${cwd}/${generatedGamesDir}`.replace(/\\/g, '/');
}
