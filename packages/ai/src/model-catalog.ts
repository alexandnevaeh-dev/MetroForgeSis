import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ModelEntry, ModelCatalog, ModelCapability, HardwareProfile } from '@metroforge/schemas';
import { ModelCatalogSchema, ModelEntrySchema } from '@metroforge/schemas';
import { LicenseRouter } from './license-router.js';

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
      // Remote/API models must not be filtered by local VRAM — only local runtimes need GPU room.
      if (m.local && m.minVramMb && m.minVramMb > 0) {
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

/** The structural subset explainModelRouting actually needs beyond ModelEntry — deliberately
 *  not importing ReconciledCatalogEntry from catalog-reconciliation.ts (which itself imports
 *  from this file) to avoid a circular module dependency. ReconciledCatalogEntry already has
 *  this field, so it satisfies this type structurally with no cast needed at call sites. */
export interface RoutableModelEntry extends ModelEntry {
  providerEnabled: boolean;
}

export interface ModelRoutingCandidate {
  modelId: string;
  provider: string;
  score: number;
  reasons: string[];
}

export interface ModelRoutingRejection {
  modelId: string;
  provider: string;
  reasons: string[];
}

export interface ModelRoutingExplanation {
  capability: string;
  requirements: string[];
  selected?: { modelId: string; provider: string; score: number };
  candidates: ModelRoutingCandidate[];
  rejected: ModelRoutingRejection[];
  fallbacks: Array<{ modelId: string; provider: string }>;
  license?: string;
  hardware?: { profile: string; ramMb: number; vramMb?: number };
}

/**
 * Real, source-verified routing trace for a capability — the counterpart to rankModelsForCapability
 * that also explains *why* a model was excluded, not just who won. rankModelsForCapability's own
 * .filter() silently drops non-matching models with no record of the reason; this function re-derives
 * that reason for every entry the filter would have dropped, using the exact same conditions, rather
 * than reimplementing (and risking drift from) its scoring logic — the ranked list itself is reused
 * as-is for `candidates`/`selected`/`fallbacks`.
 */
export function explainModelRouting(
  entries: RoutableModelEntry[],
  capability: ModelCapability,
  hardware: HardwareProfile,
  opts: { freeOnly?: boolean; localOnly?: boolean; preferInstalled?: boolean } = {},
): ModelRoutingExplanation {
  const relevant = entries.filter((e) => e.capabilities.includes(capability));
  const ranked = rankModelsForCapability(relevant, capability, hardware, opts);
  const rankedIds = new Set(ranked.map((r) => r.model.id));
  const licenseRouter = new LicenseRouter();

  const candidates: ModelRoutingCandidate[] = ranked.map((r) => ({
    modelId: r.model.id,
    provider: r.model.provider,
    score: r.score,
    reasons: [...r.reasons, `license: ${licenseRouter.classify(r.model).status}`],
  }));

  const rejected: ModelRoutingRejection[] = relevant
    .filter((e) => !rankedIds.has(e.id))
    .map((e) => ({ modelId: e.id, provider: e.provider, reasons: rejectionReasons(e, hardware, opts) }));

  const top = candidates[0];
  const selectedEntry = top ? relevant.find((e) => e.id === top.modelId) : undefined;

  return {
    capability,
    requirements: requirementsForCapability(capability),
    selected: top ? { modelId: top.modelId, provider: top.provider, score: top.score } : undefined,
    candidates,
    rejected,
    fallbacks: candidates.slice(1, 4).map((c) => ({ modelId: c.modelId, provider: c.provider })),
    license: selectedEntry?.license,
    hardware: { profile: hardware.profile, ramMb: hardware.totalRamMb, vramMb: hardware.vramMb },
  };
}

/** Mirrors rankModelsForCapability's own filter conditions (kept in sync manually — the two are
 *  small and stable) so a rejected entry's reasons are true statements about why it didn't rank,
 *  not guesses. */
function rejectionReasons(
  entry: RoutableModelEntry,
  hardware: HardwareProfile,
  opts: { freeOnly?: boolean; localOnly?: boolean },
): string[] {
  const reasons: string[] = [];
  if (!entry.providerEnabled) reasons.push('provider not configured or not enabled');
  if (!entry.enabled) reasons.push('model not routable (disabled or provider unreachable)');
  if (opts.freeOnly && entry.costClass !== 'free') reasons.push('not a free-tier model');
  if (opts.localOnly && !entry.local) reasons.push('not a local model');
  if (entry.minRamMb && hardware.totalRamMb < entry.minRamMb * 0.85) {
    reasons.push(`requires ~${entry.minRamMb}MB RAM (detected ${hardware.totalRamMb}MB)`);
  }
  if (
    entry.local &&
    entry.minVramMb &&
    entry.minVramMb > 0 &&
    (!hardware.vramMb || hardware.vramMb < entry.minVramMb * 0.85)
  ) {
    reasons.push(`requires ~${entry.minVramMb}MB VRAM (detected ${hardware.vramMb ?? 0}MB)`);
  } else if (!entry.local && entry.minVramMb && entry.minVramMb > 0) {
    // Explicitly note that remote models are not gated on local VRAM.
    /* no rejection */
  }
  if (reasons.length === 0) reasons.push('excluded by routing filters');
  return reasons;
}

const VISION_CAPABILITIES = new Set<ModelCapability>(['VISION_ANALYSIS', 'IMAGE_CRITIQUE', 'ASSET_TAGGING']);

function requirementsForCapability(capability: ModelCapability): string[] {
  const reqs = [`capability: ${capability}`, 'provider registered and enabled', 'hardware fits detected RAM/VRAM'];
  if (VISION_CAPABILITIES.has(capability)) reqs.push('vision support');
  if (capability === 'JSON_GENERATION') reqs.push('structured output support (preferred)');
  return reqs;
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
