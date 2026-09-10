import type { RuntimeManifestEntryV2 } from './types.js';

/** Structurally matches packages/godot/src/assembler.ts's `AssetManifestEntry` (texture/audio
 *  manifest entries consumed by project generation). Defined locally rather than imported to
 *  avoid adding a packages/assets → packages/godot dependency edge; the calling layer that
 *  already depends on both (packages/generation) is the natural place to assign these onto
 *  `AssemblyInput.assetMetadata`. This is the one conversion boundary between pipeline v2's
 *  RuntimeManifestEntryV2 and the legacy manifest shape — do not duplicate this mapping. */
export interface LegacyAssetManifestEntryV2 {
  id: string;
  path: string;
  type: 'texture' | 'audio';
  provider: string;
  modelId?: string;
  fallbackGenerated: boolean;
  maturity: RuntimeManifestEntryV2['maturity'];
  productionReady: boolean;
  sourceType: RuntimeManifestEntryV2['sourceType'];
  compiler: string;
  godotResourcePath: string;
  /** Tag so a legacy generation_manifest.json can distinguish v2-produced entries from v1's,
   *  per the "legacy compatibility" requirement — never silently reinterpreted. */
  pipelineVersion: string;
  category: RuntimeManifestEntryV2['category'];
  sourceHash: string;
  finalHash: string;
  validationPassed: boolean;
  requestHash?: string;
  provenance?: RuntimeManifestEntryV2['provenance'];
}

export function toLegacyAssetManifestEntry(entry: RuntimeManifestEntryV2, compiler: string): LegacyAssetManifestEntryV2 {
  return {
    id: entry.assetId,
    path: entry.compiledAssetPath,
    type: 'texture',
    provider: entry.provider,
    modelId: entry.model,
    fallbackGenerated: entry.generationExecutionPath === 'procedural_fallback',
    maturity: entry.maturity,
    productionReady: entry.productionReady,
    sourceType: entry.sourceType,
    compiler,
    godotResourcePath: entry.runtimeResourcePath,
    pipelineVersion: entry.pipelineVersion,
    category: entry.category,
    sourceHash: entry.sourceHash,
    finalHash: entry.finalHash,
    validationPassed: entry.validation.passed,
    requestHash: entry.requestHash,
    provenance: entry.provenance,
  };
}

export function toLegacyAssetManifestEntries(entries: RuntimeManifestEntryV2[], compiler = 'asset_pipeline_v2'): LegacyAssetManifestEntryV2[] {
  return entries.map((entry) => toLegacyAssetManifestEntry(entry, compiler));
}
