import { ipcMain } from 'electron';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getVersionString } from '@metroforge/core';
import { loadConfig, resolveGeneratedGamesPath } from '@metroforge/shared';
import { GenerationPipeline } from '@metroforge/generation';
import { bootstrapProviders, listProviderStatus } from '@metroforge/ai';
import { ToolRegistry } from '@metroforge/tools';
import type { GenerationMode, GenerationProfile } from '@metroforge/shared';

export function registerIpcHandlers(cwd: string): void {
  ipcMain.handle('get-version', () => getVersionString());

  ipcMain.handle('get-config', () => {
    const config = loadConfig();
    return {
      appName: config.appName,
      generatedGamesDir: config.generatedGamesDir,
      defaultMode: config.defaultMode,
      defaultProfile: config.defaultProfile,
    };
  });

  ipcMain.handle('run-doctor', async () => {
    const config = loadConfig();
    const registry = new ToolRegistry();
    const tools = await registry.detectAll({
      godotPath: config.godotExecutable,
      ollamaUrl: config.ollamaBaseUrl,
    });
    return tools.map((t) => ({
      name: t.name,
      status: t.status,
      message: t.message,
    }));
  });

  ipcMain.handle('list-providers', async () => {
    const config = loadConfig();
    const { registry } = await bootstrapProviders({
      mode: 'HYBRID_FREE',
      ollamaBaseUrl: config.ollamaBaseUrl,
      geminiApiKey: process.env.GEMINI_API_KEY,
      groqApiKey: process.env.GROQ_API_KEY,
      openrouterApiKey: process.env.OPENROUTER_API_KEY,
      huggingfaceApiKey: process.env.HUGGINGFACE_API_KEY,
      nvidiaApiKey: process.env.NVIDIA_API_KEY,
      nvidiaApiBaseUrl: process.env.NVIDIA_API_BASE_URL,
    });
    return listProviderStatus(registry);
  });

  ipcMain.handle('list-models', async (_event, filter?: { capability?: string; installed?: boolean }) => {
    const { ModelCatalogService } = await import('@metroforge/ai');
    const catalog = new ModelCatalogService(join(cwd, '.metroforge'));
    let models = catalog.list();
    if (filter?.capability) {
      models = catalog.findByCapability(filter.capability as import('@metroforge/schemas').ModelCapability);
    }
    if (filter?.installed) models = models.filter((m) => m.installed);
    return models;
  });

  ipcMain.handle('get-hardware-profile', async () => {
    const { HardwareProfiler, getStarterPack } = await import('@metroforge/ai');
    const hw = new HardwareProfiler().profile();
    return { ...hw, starterPack: getStarterPack(hw) };
  });

  ipcMain.handle('scout-models', async (_event, opts?: { benchmark?: boolean }) => {
    const config = loadConfig();
    const { ModelScout } = await import('@metroforge/ai');
    const scout = new ModelScout(join(cwd, '.metroforge'));
    return scout.refresh({
      sources: ['ollama', 'local'],
      runBenchmarks: opts?.benchmark,
      ollamaBaseUrl: config.ollamaBaseUrl,
    });
  });

  ipcMain.handle('rank-models', async (_event, capability: string) => {
    const { ModelCatalogService, rankModelsForCapability, HardwareProfiler } = await import('@metroforge/ai');
    const catalog = new ModelCatalogService(join(cwd, '.metroforge'));
    const hw = new HardwareProfiler().profile();
    return rankModelsForCapability(
      catalog.list(),
      capability as import('@metroforge/schemas').ModelCapability,
      hw,
      { preferInstalled: true },
    );
  });

  ipcMain.handle('list-projects', () => {
    const config = loadConfig();
    const base = resolveGeneratedGamesPath(config, cwd);
    if (!existsSync(base)) return [];

    return readdirSync(base, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        const projectPath = join(base, d.name);
        const meta: Record<string, unknown> = { slug: d.name, path: projectPath };
        try {
          const dna = JSON.parse(readFileSync(join(projectPath, 'game_dna.json'), 'utf-8'));
          meta.title = dna.identity?.title;
          meta.profile = dna.profile;
        } catch {
          meta.title = d.name;
        }
        return meta;
      });
  });

  ipcMain.handle(
    'generate-game',
    async (
      _event,
      opts: {
        prompt: string;
        profile: GenerationProfile;
        mode: GenerationMode;
        seed: number;
      },
    ) => {
      const pipeline = new GenerationPipeline();
      const phases: { phase: string; status: string; message?: string }[] = [];

      const result = await pipeline.run({
        ...opts,
        cwd,
        onPhase: (phase, status, message) => {
          phases.push({ phase, status, message });
          _event.sender.send('generation-progress', { phase, status, message });
        },
      });

      return { ...result, phases };
    },
  );
}
