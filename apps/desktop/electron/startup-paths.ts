import { dirname, isAbsolute, join, resolve } from 'node:path';

/** Resolve portable application paths without importing workspace packages or loading secrets. */
export function configureDesktopPaths(options: {
  packaged: boolean; executable: string; resources: string; developmentRoot: string;
}, env: NodeJS.ProcessEnv): string {
  const workspace = env.METROFORGE_WORKSPACE_DIR || (options.packaged
    ? join(dirname(options.executable), 'MetroForgeData') : options.developmentRoot);
  if (!isAbsolute(workspace)) throw new Error('METROFORGE_WORKSPACE_DIR must be absolute');
  if (options.packaged) {
    env.METROFORGE_RESOURCE_ROOT ||= join(options.resources, 'metroforge');
    env.METROFORGE_DATA_DIR ||= join(workspace, '.metroforge');
    env.METROFORGE_GENERATED_GAMES_DIR ||= join(workspace, 'GeneratedGames');
    env.METROFORGE_ENV_FILE ||= join(env.METROFORGE_DATA_DIR, '.env');
    for (const key of ['METROFORGE_RESOURCE_ROOT', 'METROFORGE_DATA_DIR',
      'METROFORGE_GENERATED_GAMES_DIR', 'METROFORGE_ENV_FILE']) {
      if (!isAbsolute(env[key]!)) throw new Error(`${key} must be absolute in a packaged application`);
    }
  }
  return resolve(workspace);
}

/** Keep child processes and model tooling inside the selected portable data directory.
 * Inherited OS cache paths are intentionally replaced for packaged launches.
 */
export function configurePortableStorage(env: NodeJS.ProcessEnv): string[] {
  const data = env.METROFORGE_DATA_DIR;
  if (!data || !isAbsolute(data)) throw new Error('Portable storage requires an absolute data directory');
  const paths: Record<string, string> = {
    TEMP: 'temp', TMP: 'temp', TMPDIR: 'temp',
    APPDATA: 'appdata', LOCALAPPDATA: 'localappdata',
    XDG_CACHE_HOME: 'cache', XDG_CONFIG_HOME: 'config', XDG_DATA_HOME: 'data',
    HF_HOME: 'cache/huggingface', HF_HUB_CACHE: 'cache/huggingface/hub',
    HUGGINGFACE_HUB_CACHE: 'cache/huggingface/hub',
    TRANSFORMERS_CACHE: 'cache/huggingface/transformers',
    HF_DATASETS_CACHE: 'cache/huggingface/datasets', TORCH_HOME: 'cache/torch',
    CUDA_CACHE_PATH: 'cache/cuda', TRITON_CACHE_DIR: 'cache/triton',
    npm_config_cache: 'cache/npm', PIP_CACHE_DIR: 'cache/pip',
    ELECTRON_CACHE: 'cache/electron', PLAYWRIGHT_BROWSERS_PATH: 'cache/playwright',
    PYTHONPYCACHEPREFIX: 'cache/python',
  };
  for (const [key, suffix] of Object.entries(paths)) env[key] = join(data, suffix);
  env.PYTHONDONTWRITEBYTECODE = '1';
  return [...new Set(Object.keys(paths).map(key => env[key]!))];
}
