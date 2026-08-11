import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ModelEntry, ModelCatalog, ModelCapability, HardwareProfile } from '@metroforge/schemas';
import { ModelCatalogSchema, ModelEntrySchema } from '@metroforge/schemas';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');
const BUILTIN_CATALOG = join(REPO_ROOT, 'config', 'models.catalog.json');

export class ModelCatalogService {
  private catalog: ModelCatalog;
  private userCatalogPath: string;

  constructor(dataDir?: string) {
    this.userCatalogPath = join(dataDir ?? join(REPO_ROOT, '.metroforge'), 'models.catalog.json');
    this.catalog = this.load();
  }

  private load(): ModelCatalog {
    if (existsSync(this.userCatalogPath)) {
      try {
        return ModelCatalogSchema.parse(JSON.parse(readFileSync(this.userCatalogPath, 'utf-8')));
      } catch {
        // fall through to builtin
      }
    }
    if (existsSync(BUILTIN_CATALOG)) {
      return ModelCatalogSchema.parse(JSON.parse(readFileSync(BUILTIN_CATALOG, 'utf-8')));
    }
    return { version: '0.0.0', updatedAt: new Date().toISOString(), models: [] };
  }

  list(): ModelEntry[] {
    return this.catalog.models;
  }

  get(id: string): ModelEntry | undefined {
    return this.catalog.models.find((m) => m.id === id);
  }

  findByCapability(capability: ModelCapability): ModelEntry[] {
    return this.catalog.models.filter((m) => m.enabled && m.capabilities.includes(capability));
  }

  filter(opts: {
    installed?: boolean;
    local?: boolean;
    modality?: ModelEntry['modality'];
    capability?: ModelCapability;
    lowVram?: boolean;
    cpuFriendly?: boolean;
    commercialAllowed?: boolean;
    tag?: string;
  }): ModelEntry[] {
    return this.catalog.models.filter((m) => {
      if (opts.installed !== undefined && m.installed !== opts.installed) return false;
      if (opts.local !== undefined && m.local !== opts.local) return false;
      if (opts.modality && m.modality !== opts.modality) return false;
      if (opts.capability && !m.capabilities.includes(opts.capability)) return false;
      if (opts.lowVram && (m.recommendedVramMb ?? 0) > 4096) return false;
      if (opts.cpuFriendly && (m.recommendedVramMb ?? 0) > 0 && !m.tags.includes('cpu-friendly'))
        return false;
      if (opts.commercialAllowed && m.commercialUse === 'restricted') return false;
      if (opts.tag && !m.tags.includes(opts.tag)) return false;
      return true;
    });
  }

  mergeDiscovered(discovered: ModelEntry[]): { added: number; updated: number } {
    let added = 0;
    let updated = 0;
    const byId = new Map(this.catalog.models.map((m) => [m.id, m]));

    for (const entry of discovered) {
      const parsed = ModelEntrySchema.safeParse(entry);
      if (!parsed.success) continue;

      const existing = byId.get(parsed.data.id);
      if (existing) {
        byId.set(parsed.data.id, {
          ...existing,
          ...parsed.data,
          lastScoutedAt: new Date().toISOString(),
        });
        updated++;
      } else {
        byId.set(parsed.data.id, {
          ...parsed.data,
          lastScoutedAt: new Date().toISOString(),
        });
        added++;
      }
    }

    this.catalog = {
      ...this.catalog,
      updatedAt: new Date().toISOString(),
      models: Array.from(byId.values()),
    };
    return { added, updated };
  }

  markInstalled(id: string, installPath?: string): void {
    const model = this.get(id);
    if (!model) return;
    model.installed = true;
    if (installPath) model.installPath = installPath;
    model.health = 'healthy';
  }

  save(): void {
    mkdirSync(dirname(this.userCatalogPath), { recursive: true });
    writeFileSync(this.userCatalogPath, JSON.stringify(this.catalog, null, 2));
  }

  getCatalogPath(): string {
    return this.userCatalogPath;
  }
}

export interface RankedModel {
  model: ModelEntry;
  score: number;
  reasons: string[];
}

export function rankModelsForCapability(
  models: ModelEntry[],
  capability: ModelCapability,
  hardware: HardwareProfile,
  opts: { freeOnly?: boolean; localOnly?: boolean; preferInstalled?: boolean } = {},
): RankedModel[] {
  const capKey = capabilityToScoreKey(capability);

  return models
    .filter((m) => {
      if (!m.enabled) return false;
      if (!m.capabilities.includes(capability)) return false;
      if (opts.freeOnly && m.costClass !== 'free') return false;
      if (opts.localOnly && !m.local) return false;
      if (m.minRamMb && hardware.totalRamMb < m.minRamMb * 0.85) return false;
      if (m.minVramMb && m.minVramMb > 0) {
        if (!hardware.vramMb || hardware.vramMb < m.minVramMb * 0.85) return false;
      }
      return true;
    })
    .map((model) => {
      const reasons: string[] = [];
      let score = model.priority;

      if (capKey && model.specializationScores?.[capKey]) {
        score += model.specializationScores[capKey]!;
        reasons.push(`${capKey} score +${model.specializationScores[capKey]}`);
      }

      if (model.benchmarkScore) {
        score += model.benchmarkScore * 0.5;
        reasons.push(`benchmark +${(model.benchmarkScore * 0.5).toFixed(0)}`);
      }

      if (opts.preferInstalled && model.installed) {
        score += 50;
        reasons.push('installed +50');
      }

      if (model.health === 'healthy') score += 10;
      if (model.estimatedSpeed === 'fast') score += 5;
      if (model.commercialUse === 'allowed') score += 3;

      return { model, score, reasons };
    })
    .sort((a, b) => b.score - a.score);
}

function capabilityToScoreKey(
  capability: ModelCapability,
): keyof ModelEntry['specializationScores'] | null {
  const map: Partial<Record<ModelCapability, keyof NonNullable<ModelEntry['specializationScores']>>> =
    {
      REASONING: 'REASONING',
      CODE_GENERATION: 'CODE',
      GDSCRIPT: 'GDSCRIPT',
      NARRATIVE: 'NARRATIVE',
      WORLD_DESIGN: 'WORLD_DESIGN',
      JSON_GENERATION: 'JSON',
      VISION_ANALYSIS: 'VISION',
      IMAGE_GENERATION: 'IMAGE',
      PIXEL_ART_PROCESS: 'PIXEL_ART',
      TEXTURE_GENERATION: 'TEXTURE',
      ANIMATION_GENERATION: 'ANIMATION',
      SFX_GENERATION: 'AUDIO',
      MUSIC_GENERATION: 'MUSIC',
      SPEECH_GENERATION: 'SPEECH',
      EMBEDDING: 'EMBEDDING',
      QA_REASONING: 'QA',
    };
  return map[capability] ?? null;
}
