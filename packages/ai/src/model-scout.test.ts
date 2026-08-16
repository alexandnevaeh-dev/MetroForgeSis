import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ModelScout } from './model-scout.js';
import { HardwareProfiler } from './hardware-profiler.js';
import type { HardwareProfile } from '@metroforge/schemas';

const balancedProfile: HardwareProfile = {
  os: 'win32',
  cpuArch: 'x64',
  cpuCores: 8,
  totalRamMb: 32768,
  profile: 'BALANCED',
  cudaAvailable: false,
  rocmAvailable: false,
  directMlAvailable: false,
  metalAvailable: false,
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function withScratchDir<T>(fn: (dataDir: string) => T): T {
  const dataDir = mkdtempSync(join(tmpdir(), 'metroforge-model-scout-'));
  try {
    return fn(dataDir);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
}

beforeEach(() => {
  // HardwareProfiler.profile() shells out to real OS commands (wmic/nvidia-smi on Windows) —
  // stub it everywhere by default so refresh()'s updateRouterPreferences() call doesn't pay
  // that real, slow (multi-second) cost in every test. The LOW_RESOURCE test below overrides
  // this with its own vi.spyOn(...).mockReturnValue(...) for that specific case.
  vi.spyOn(HardwareProfiler.prototype, 'profile').mockReturnValue(balancedProfile);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ModelScout — Ollama scouting', () => {
  it('marks a catalog model installed on an exact Ollama tag match', async () => {
    await withScratchDir(async (dataDir) => {
      const scout = new ModelScout(dataDir);
      const ollamaModel = scout.getCatalog().list().find((m) => m.provider === 'ollama');
      expect(ollamaModel).toBeDefined();

      vi.stubGlobal(
        'fetch',
        vi.fn(async () => jsonResponse({ models: [{ name: ollamaModel!.id }] })),
      );

      const report = await scout.refresh({ sources: ['ollama'] });

      expect(report.errors).toEqual([]);
      expect(report.sourcesChecked).toEqual(['ollama']);
      expect(scout.getCatalog().get(ollamaModel!.id)?.installed).toBe(true);
      expect(scout.getCatalog().get(ollamaModel!.id)?.health).toBe('healthy');
    });
  });

  it('matches an Ollama tag suffix (name.startsWith(`${id}:`))', async () => {
    await withScratchDir(async (dataDir) => {
      const scout = new ModelScout(dataDir);
      const ollamaModel = scout.getCatalog().list().find((m) => m.provider === 'ollama');
      expect(ollamaModel).toBeDefined();

      vi.stubGlobal(
        'fetch',
        vi.fn(async () => jsonResponse({ models: [{ name: `${ollamaModel!.id}:latest` }] })),
      );

      await scout.refresh({ sources: ['ollama'] });

      expect(scout.getCatalog().get(ollamaModel!.id)?.installed).toBe(true);
    });
  });

  it('leaves Ollama models uninstalled when Ollama reports no matching tag', async () => {
    await withScratchDir(async (dataDir) => {
      const scout = new ModelScout(dataDir);
      const ollamaModel = scout.getCatalog().list().find((m) => m.provider === 'ollama');
      expect(ollamaModel).toBeDefined();

      vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ models: [{ name: 'unrelated-model' }] })));

      await scout.refresh({ sources: ['ollama'] });

      expect(scout.getCatalog().get(ollamaModel!.id)?.installed).toBe(false);
    });
  });

  it('records a scout error and does not throw when Ollama is unreachable', async () => {
    await withScratchDir(async (dataDir) => {
      const scout = new ModelScout(dataDir);
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new Error('ECONNREFUSED');
        }),
      );

      const report = await scout.refresh({ sources: ['ollama'] });

      expect(report.errors).toHaveLength(1);
      expect(report.errors[0]).toContain('Ollama scout failed');
      expect(report.sourcesChecked).toEqual(['ollama']);
    });
  });

  it('discovers nothing from Ollama on a non-OK HTTP response, without throwing', async () => {
    await withScratchDir(async (dataDir) => {
      const scout = new ModelScout(dataDir);
      vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 503)));

      const report = await scout.refresh({ sources: ['ollama'] });

      expect(report.errors).toEqual([]);
      expect(report.modelsDiscovered).toBe(0);
    });
  });

  it('never calls fetch when Ollama is not among the requested sources', async () => {
    await withScratchDir(async (dataDir) => {
      const scout = new ModelScout(dataDir);
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      await scout.refresh({ sources: ['local'] });

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});

describe('ModelScout — local install scouting', () => {
  it('marks native-runtime and metroforge-provider models installed and healthy', async () => {
    await withScratchDir(async (dataDir) => {
      const scout = new ModelScout(dataDir);
      const before = scout
        .getCatalog()
        .list()
        .filter((m) => m.runtime === 'native' || m.provider === 'metroforge');
      expect(before.length).toBeGreaterThan(0);

      await scout.refresh({ sources: ['local'] });

      for (const model of before) {
        const updated = scout.getCatalog().get(model.id);
        expect(updated?.installed).toBe(true);
        expect(updated?.health).toBe('healthy');
      }
    });
  });
});

describe('ModelScout — report bookkeeping', () => {
  it('threads mergeDiscovered add/update counts into the report', async () => {
    await withScratchDir(async (dataDir) => {
      const scout = new ModelScout(dataDir);
      const ollamaModel = scout.getCatalog().list().find((m) => m.provider === 'ollama');
      expect(ollamaModel).toBeDefined();

      // Exactly one existing model reported installed by Ollama (an update, not an add) —
      // scoutOllama() always returns every catalog model tagged provider:'ollama', so this
      // proves modelsUpdated reflects real merge bookkeeping, not just a raw discovered count.
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => jsonResponse({ models: [{ name: ollamaModel!.id }] })),
      );

      const report = await scout.refresh({ sources: ['ollama'] });

      const ollamaModelCount = scout.getCatalog().list().filter((m) => m.provider === 'ollama').length;
      expect(report.modelsDiscovered).toBe(ollamaModelCount);
      expect(report.modelsUpdated).toBe(ollamaModelCount);
      expect(report.modelsAdded).toBe(0);
    });
  });

  it('stamps startedAt/completedAt and a unique scout id', async () => {
    await withScratchDir(async (dataDir) => {
      const scout = new ModelScout(dataDir);
      const report = await scout.refresh({ sources: ['local'] });

      expect(report.id).toMatch(/^scout/);
      expect(report.startedAt).toBeTruthy();
      expect(report.completedAt).toBeTruthy();
      expect(new Date(report.completedAt!).getTime()).toBeGreaterThanOrEqual(
        new Date(report.startedAt).getTime(),
      );
    });
  });
});

describe('ModelScout — hardware-aware router preferences', () => {
  const lowResourceProfile: HardwareProfile = {
    os: 'win32',
    cpuArch: 'x64',
    cpuCores: 2,
    totalRamMb: 8192,
    profile: 'LOW_RESOURCE',
    cudaAvailable: false,
    rocmAvailable: false,
    directMlAvailable: false,
    metalAvailable: false,
  };

  it('boosts cpu-friendly/low-resource models and penalizes high-RAM models on LOW_RESOURCE hardware', async () => {
    await withScratchDir(async (dataDir) => {
      vi.spyOn(HardwareProfiler.prototype, 'profile').mockReturnValue(lowResourceProfile);

      const scout = new ModelScout(dataDir);
      const cpuFriendly = scout.getCatalog().list().find((m) => m.tags.includes('cpu-friendly'));
      const heavy = scout.getCatalog().list().find((m) => (m.recommendedRamMb ?? 0) > 16384);

      const cpuFriendlyBefore = cpuFriendly?.priority;
      const heavyBefore = heavy?.priority;

      await scout.refresh({ sources: ['local'] });

      if (cpuFriendly) {
        expect(scout.getCatalog().get(cpuFriendly.id)!.priority).toBeGreaterThan(cpuFriendlyBefore!);
      }
      if (heavy) {
        expect(scout.getCatalog().get(heavy.id)!.priority).toBeLessThanOrEqual(heavyBefore!);
      }
    });
  });
});

describe('ModelScout — capability recommendations', () => {
  it('recommends a real catalog model for a capability the builtin catalog covers', async () => {
    await withScratchDir(async (dataDir) => {
      const scout = new ModelScout(dataDir);
      const anyCapability = scout.getCatalog().list()[0]?.capabilities[0];
      expect(anyCapability).toBeDefined();

      const recommended = scout.getRecommendedForCapability(anyCapability!);

      expect(recommended).not.toBeNull();
      expect(recommended!.capabilities).toContain(anyCapability);
    });
  });

  it('returns null for a capability no catalog model declares', async () => {
    await withScratchDir(async (dataDir) => {
      const scout = new ModelScout(dataDir);
      const recommended = scout.getRecommendedForCapability(
        '__no_model_declares_this_capability__' as never,
      );

      expect(recommended).toBeNull();
    });
  });
});
