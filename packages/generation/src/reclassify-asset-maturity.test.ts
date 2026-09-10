import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reclassifyProjectAssetMaturity } from './reclassify-asset-maturity.js';

function writeManifest(dir: string, artifacts: unknown[]): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'generation_manifest.json'), JSON.stringify({ artifacts }, null, 2));
}

function readManifest(dir: string): { artifacts: Array<Record<string, unknown>> } {
  return JSON.parse(readFileSync(join(dir, 'generation_manifest.json'), 'utf-8'));
}

describe('reclassifyProjectAssetMaturity', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'metroforge-reclassify-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reports failure when generation_manifest.json is missing', () => {
    const result = reclassifyProjectAssetMaturity(dir);
    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/generation_manifest/);
  });

  it('reclassification_positive: promotes a stale PLACEHOLDER whose current evidence satisfies the predicate', () => {
    writeManifest(dir, [
      {
        id: 'ability_icon_quest',
        path: 'assets/ui/icons/quest.png',
        provider: 'procedural',
        fallbackGenerated: true,
        critiquePassed: true,
        critiqueScore: 100,
        maturity: 'PLACEHOLDER',
        productionReady: false,
      },
    ]);

    const result = reclassifyProjectAssetMaturity(dir);

    expect(result.success).toBe(true);
    expect(result.changedCount).toBe(1);
    expect(result.changes[0]).toMatchObject({
      id: 'ability_icon_quest',
      oldMaturity: 'PLACEHOLDER',
      newMaturity: 'PROCEDURAL_PRODUCTION',
      oldProductionReady: false,
      newProductionReady: true,
    });

    const manifest = readManifest(dir);
    const artifact = manifest.artifacts[0]!;
    expect(artifact.maturity).toBe('PROCEDURAL_PRODUCTION');
    expect(artifact.productionReady).toBe(true);
    // provenance preserved exactly
    expect(artifact.provider).toBe('procedural');
    expect(artifact.critiqueScore).toBe(100);
    expect(artifact.critiquePassed).toBe(true);
    expect(artifact.id).toBe('ability_icon_quest');
  });

  it('reclassification_negative_failed_critique: a PLACEHOLDER whose critique failed stays blocked', () => {
    writeManifest(dir, [
      {
        id: 'player_land_pose',
        path: 'assets/characters/player_land_pose.png',
        provider: 'procedural',
        fallbackGenerated: true,
        critiquePassed: false,
        critiqueScore: 30,
        maturity: 'PLACEHOLDER',
        productionReady: false,
      },
    ]);

    const result = reclassifyProjectAssetMaturity(dir);

    expect(result.changedCount).toBe(0);
    const manifest = readManifest(dir);
    expect(manifest.artifacts[0]!.maturity).toBe('PLACEHOLDER');
    expect(manifest.artifacts[0]!.productionReady).toBe(false);
  });

  it('reclassification_unsupported_provider: a fallback-sourced, non-procedural-provider artifact stays blocked', () => {
    writeManifest(dir, [
      {
        id: 'standalone_portrait',
        path: 'assets/ui/portraits/standalone.png',
        // fallbackGenerated:true means the underlying content is placeholder-sourced regardless
        // of the compiled provider label — inferAssetMaturity's fallback check forces PLACEHOLDER
        // before provider/critique are even considered, and proceduralProductionIntent separately
        // requires provider === 'procedural', which 'pixel-art-processor' never satisfies either.
        provider: 'pixel-art-processor',
        fallbackGenerated: true,
        critiquePassed: true,
        critiqueScore: 90,
        maturity: 'PLACEHOLDER',
        productionReady: false,
      },
    ]);

    const result = reclassifyProjectAssetMaturity(dir);

    expect(result.changedCount).toBe(0);
    const manifest = readManifest(dir);
    expect(manifest.artifacts[0]!.maturity).toBe('PLACEHOLDER');
    expect(manifest.artifacts[0]!.productionReady).toBe(false);
  });

  it('reclassifies a non-procedural-provider, non-fallback artifact to QA_REVIEW (real evidence, not silently promoted to production)', () => {
    writeManifest(dir, [
      {
        id: 'compiled_asset',
        path: 'assets/ui/portraits/compiled.png',
        provider: 'pixel-art-processor',
        fallbackGenerated: false,
        critiquePassed: true,
        critiqueScore: 90,
        maturity: 'PLACEHOLDER',
        productionReady: false,
      },
    ]);

    const result = reclassifyProjectAssetMaturity(dir);

    // Real evidence recomputation: a critique-passed, non-fallback compiled asset is QA_REVIEW
    // under the current predicate (not PLACEHOLDER, and never auto-promoted to PROCEDURAL_PRODUCTION
    // since its provider isn't 'procedural') — this is a genuine, honest recomputation, not a
    // silent promotion to production-ready.
    const change = result.changes.find((c) => c.id === 'compiled_asset');
    expect(change?.newMaturity).toBe('QA_REVIEW');
    expect(change?.newProductionReady).toBe(false);
  });

  it('reclassification_production_stable: an already-PROCEDURAL_PRODUCTION artifact is left untouched', () => {
    writeManifest(dir, [
      {
        id: 'tileset_biome_0',
        path: 'assets/tilesets/biome_0/source.png',
        provider: 'procedural',
        fallbackGenerated: true,
        critiquePassed: true,
        critiqueScore: 95,
        maturity: 'PROCEDURAL_PRODUCTION',
        productionReady: true,
        sourceType: 'procedural',
      },
    ]);

    const result = reclassifyProjectAssetMaturity(dir);

    expect(result.changedCount).toBe(0);
    expect(result.unchangedCount).toBe(1);
    const manifest = readManifest(dir);
    expect(manifest.artifacts[0]!.maturity).toBe('PROCEDURAL_PRODUCTION');
  });

  it('reclassification_idempotent: running twice produces no additional mutation', () => {
    writeManifest(dir, [
      {
        id: 'ability_icon_phase',
        path: 'assets/ui/icons/ability_phase.png',
        provider: 'procedural',
        fallbackGenerated: true,
        critiquePassed: true,
        critiqueScore: 100,
        maturity: 'PLACEHOLDER',
        productionReady: false,
      },
    ]);

    const first = reclassifyProjectAssetMaturity(dir);
    expect(first.changedCount).toBe(1);

    const second = reclassifyProjectAssetMaturity(dir);
    expect(second.changedCount).toBe(0);
    expect(second.unchangedCount).toBe(1);
  });

  it('reclassification_preserves_provenance: id, path, provider, critique evidence, and generation metadata survive unchanged', () => {
    writeManifest(dir, [
      {
        id: 'ability_icon_swim',
        path: 'assets/ui/icons/ability_swim.png',
        provider: 'procedural',
        fallbackGenerated: true,
        critiquePassed: true,
        critiqueScore: 90,
        maturity: 'PLACEHOLDER',
        productionReady: false,
        promptHash: 'abc123',
        commercialUse: 'allowed',
        license: 'MetroForge Procedural Generator (original work)',
        godotResourcePath: 'res://assets/ui/icons/ability_swim.png',
      },
    ]);

    reclassifyProjectAssetMaturity(dir);

    const artifact = readManifest(dir).artifacts[0]!;
    expect(artifact.id).toBe('ability_icon_swim');
    expect(artifact.path).toBe('assets/ui/icons/ability_swim.png');
    expect(artifact.provider).toBe('procedural');
    expect(artifact.critiquePassed).toBe(true);
    expect(artifact.critiqueScore).toBe(90);
    expect(artifact.promptHash).toBe('abc123');
    expect(artifact.commercialUse).toBe('allowed');
    expect(artifact.godotResourcePath).toBe('res://assets/ui/icons/ability_swim.png');
    // audit trail added, original evidence untouched
    expect(artifact.reclassifiedFrom).toBe('PLACEHOLDER');
    expect(typeof artifact.reclassifiedAt).toBe('string');
    expect(typeof artifact.reclassifyReason).toBe('string');
  });

  it('reclassification_dry_run: reports expected changes without writing the manifest', () => {
    writeManifest(dir, [
      {
        id: 'ability_icon_wall_jump',
        path: 'assets/ui/icons/ability_wall_jump.png',
        provider: 'procedural',
        fallbackGenerated: true,
        critiquePassed: true,
        critiqueScore: 100,
        maturity: 'PLACEHOLDER',
        productionReady: false,
      },
    ]);
    const before = readFileSync(join(dir, 'generation_manifest.json'), 'utf-8');

    const result = reclassifyProjectAssetMaturity(dir, { dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.changedCount).toBe(1);
    expect(result.changes[0]!.newMaturity).toBe('PROCEDURAL_PRODUCTION');
    const after = readFileSync(join(dir, 'generation_manifest.json'), 'utf-8');
    expect(after).toBe(before);
  });

  it('inherits evidence from the parent artifact for an npc-portrait-crop instead of trusting its own fabricated evidence', () => {
    writeManifest(dir, [
      {
        id: 'npc_000',
        path: 'assets/npcs/npc_000.png',
        provider: 'procedural',
        fallbackGenerated: true,
        critiquePassed: true,
        critiqueScore: 90,
        maturity: 'PROCEDURAL_PRODUCTION',
        productionReady: true,
      },
      {
        id: 'portrait_quest_giver',
        path: 'assets/ui/portraits/quest_giver.png',
        provider: 'pixel-art-processor',
        fallbackGenerated: true,
        critiquePassed: true,
        critiqueScore: 45,
        maturity: 'PLACEHOLDER',
        productionReady: false,
        transformation: 'npc-portrait-crop',
        parentArtifactIds: ['npc_000'],
      },
    ]);

    const result = reclassifyProjectAssetMaturity(dir);

    const portraitChange = result.changes.find((c) => c.id === 'portrait_quest_giver');
    expect(portraitChange).toBeDefined();
    expect(portraitChange!.newMaturity).toBe('PROCEDURAL_PRODUCTION');
    expect(portraitChange!.reason).toMatch(/inherited from parent artifact "npc_000"/);

    const manifest = readManifest(dir);
    const portrait = manifest.artifacts.find((a) => a.id === 'portrait_quest_giver')!;
    expect(portrait.maturity).toBe('PROCEDURAL_PRODUCTION');
    // original (fabricated) evidence fields are still preserved verbatim on the artifact —
    // only the derived maturity fields change, with an audit trail explaining why.
    expect(portrait.provider).toBe('pixel-art-processor');
    expect(portrait.critiqueScore).toBe(45);
  });

  it('does not promote an npc-portrait-crop when its parent itself fails the predicate', () => {
    writeManifest(dir, [
      {
        id: 'npc_001',
        path: 'assets/npcs/npc_001.png',
        provider: 'procedural',
        fallbackGenerated: true,
        critiquePassed: false,
        critiqueScore: 20,
        maturity: 'REJECTED',
        productionReady: false,
      },
      {
        id: 'portrait_merchant',
        path: 'assets/ui/portraits/merchant.png',
        provider: 'pixel-art-processor',
        fallbackGenerated: true,
        critiquePassed: true,
        critiqueScore: 45,
        maturity: 'PLACEHOLDER',
        productionReady: false,
        transformation: 'npc-portrait-crop',
        parentArtifactIds: ['npc_001'],
      },
    ]);

    const result = reclassifyProjectAssetMaturity(dir);

    // parent's critiquePassed=false flows through as the effective evidence, so the portrait's
    // own recomputed maturity is PLACEHOLDER (same as before) — no promotion, no change recorded.
    const portraitChange = result.changes.find((c) => c.id === 'portrait_merchant');
    expect(portraitChange).toBeUndefined();
    const manifest = readManifest(dir);
    const portrait = manifest.artifacts.find((a) => a.id === 'portrait_merchant')!;
    expect(portrait.maturity).toBe('PLACEHOLDER');
    expect(portrait.productionReady).toBe(false);
  });

  it('never touches non-.png artifacts (audio has its own maturity pathway, not proceduralProductionIntent)', () => {
    writeManifest(dir, [
      {
        id: 'sfx_jump',
        path: 'audio/sfx/jump.wav',
        provider: 'procedural',
        fallbackGenerated: true,
        maturity: 'PROCEDURAL_PRODUCTION',
        productionReady: true,
      },
    ]);

    const result = reclassifyProjectAssetMaturity(dir);

    expect(result.evaluatedCount).toBe(0);
    expect(result.changedCount).toBe(0);
    const manifest = readManifest(dir);
    expect(manifest.artifacts[0]!.maturity).toBe('PROCEDURAL_PRODUCTION');
  });

  it('leaves an already-correct PROCEDURAL_PRODUCTION architecture/interactive asset stable (regression: these used to be misrouted to a bare "texture" assetType and downgraded)', () => {
    writeManifest(dir, [
      {
        id: 'arch_0',
        path: 'assets/architecture/biome_0/biome_0_arch_0.png',
        provider: 'procedural',
        fallbackGenerated: true,
        critiquePassed: true,
        critiqueScore: 80,
        maturity: 'PROCEDURAL_PRODUCTION',
        productionReady: true,
      },
      {
        id: 'interactive_checkpoint',
        path: 'assets/generated/checkpoint/interactive_checkpoint.png',
        provider: 'procedural',
        fallbackGenerated: true,
        critiquePassed: true,
        critiqueScore: 82,
        maturity: 'PROCEDURAL_PRODUCTION',
        productionReady: true,
      },
    ]);

    const result = reclassifyProjectAssetMaturity(dir);

    expect(result.changedCount).toBe(0);
    const manifest = readManifest(dir);
    expect(manifest.artifacts.find((a) => a.id === 'arch_0')!.maturity).toBe('PROCEDURAL_PRODUCTION');
    expect(manifest.artifacts.find((a) => a.id === 'interactive_checkpoint')!.maturity).toBe('PROCEDURAL_PRODUCTION');
  });

  it('supports targeting specific artifactIds without touching the rest of the manifest', () => {
    writeManifest(dir, [
      {
        id: 'ability_icon_a',
        path: 'assets/ui/icons/a.png',
        provider: 'procedural',
        fallbackGenerated: true,
        critiquePassed: true,
        critiqueScore: 100,
        maturity: 'PLACEHOLDER',
        productionReady: false,
      },
      {
        id: 'ability_icon_b',
        path: 'assets/ui/icons/b.png',
        provider: 'procedural',
        fallbackGenerated: true,
        critiquePassed: true,
        critiqueScore: 100,
        maturity: 'PLACEHOLDER',
        productionReady: false,
      },
    ]);

    const result = reclassifyProjectAssetMaturity(dir, { artifactIds: ['ability_icon_a'] });

    expect(result.evaluatedCount).toBe(1);
    expect(result.changedCount).toBe(1);
    const manifest = readManifest(dir);
    expect(manifest.artifacts.find((a) => a.id === 'ability_icon_a')!.maturity).toBe('PROCEDURAL_PRODUCTION');
    expect(manifest.artifacts.find((a) => a.id === 'ability_icon_b')!.maturity).toBe('PLACEHOLDER');
  });
});
