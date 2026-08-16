import type { LicenseSubject } from './license-router.js';

/** Default license posture for artifact providers when manifest entries omit explicit fields. */
export const PROVIDER_LICENSE_DEFAULTS: Record<string, LicenseSubject> = {
  procedural: {
    commercialUse: 'allowed',
    license: 'MetroForge Procedural Generator (original work)',
  },
  'nvidia-image': {
    commercialUse: 'allowed',
    license: 'NVIDIA API Terms / model card',
    usageClass: 'development_prototyping',
  },
  comfyui: {
    commercialUse: 'unknown',
    license: 'ComfyUI workflow — model license unverified',
  },
  diffusers: {
    commercialUse: 'unknown',
    license: 'Local diffusion — model license unverified',
  },
  kenney: {
    commercialUse: 'allowed',
    license: 'CC0-1.0 (Kenney)',
  },
  opengameart: {
    commercialUse: 'unknown',
    license: 'OpenGameArt per-asset — never assumed CC0',
  },
  automatic1111: {
    commercialUse: 'unknown',
    license: 'AUTOMATIC1111 checkpoint — model license unverified',
  },
  'huggingface-image': {
    commercialUse: 'unknown',
    license: 'Hugging Face model card',
  },
  stability: {
    commercialUse: 'allowed',
    license: 'Stability API terms',
  },
  deepai: {
    commercialUse: 'unknown',
    license: 'DeepAI terms — unverified commercial status',
  },
  replicate: {
    commercialUse: 'unknown',
    license: 'Replicate model-dependent',
  },
};

export interface ManifestArtifactLicenseInput {
  id?: string;
  path?: string;
  provider?: string;
  license?: string;
  commercialUse?: 'allowed' | 'restricted' | 'unknown';
  licenseDetail?: LicenseSubject['licenseDetail'];
  fallbackGenerated?: boolean;
  manual?: boolean;
  sourcePath?: string;
  selectedProvider?: string;
  parentArtifactIds?: string[];
}

/**
 * Local compilers (pixel-art-processor, checkpoint) do not hold an independent license.
 * Their pixels inherit the registered license of the source / parent shipping artifact.
 */
export const COMPILER_PROVIDERS = new Set(['pixel-art-processor', 'checkpoint']);

const SHEET_SUFFIX = /_(walk|attack|hurt|death|source)$/;

function findLicenseSource(
  artifact: ManifestArtifactLicenseInput,
  siblings: ManifestArtifactLicenseInput[],
): ManifestArtifactLicenseInput | undefined {
  const path = String(artifact.path ?? '').replace(/\\/g, '/');
  const id = String(artifact.id ?? '');

  if (artifact.sourcePath) {
    const sourcePath = String(artifact.sourcePath).replace(/\\/g, '/');
    const bySourcePath = siblings.find(
      (s) =>
        s !== artifact &&
        (String(s.path ?? '').replace(/\\/g, '/') === sourcePath ||
          String(s.sourcePath ?? '').replace(/\\/g, '/') === sourcePath),
    );
    if (bySourcePath && !COMPILER_PROVIDERS.has(String(bySourcePath.provider ?? ''))) {
      return bySourcePath;
    }
  }

  const tileMatch = path.match(/^assets\/tilesets\/(biome_\d+)\//);
  if (tileMatch) {
    const biome = tileMatch[1];
    const parent = siblings.find(
      (s) =>
        s !== artifact &&
        (s.id === `tileset_${biome}` ||
          String(s.path ?? '').replace(/\\/g, '/') === `assets/tilesets/${biome}/source.png`),
    );
    if (parent) return parent;
  }

  const parentIds = artifact.parentArtifactIds ?? [];
  for (const parentId of parentIds) {
    const parent = siblings.find((s) => s !== artifact && (s.id === parentId || s.path === parentId));
    if (parent) return parent;
  }

  const baseId = id.replace(SHEET_SUFFIX, '');
  if (baseId && baseId !== id) {
    const parent = siblings.find((s) => s !== artifact && s.id === baseId);
    if (parent) return parent;
  }

  return undefined;
}

function isUnresolvedCompiler(artifact: ManifestArtifactLicenseInput): boolean {
  const provider = String(artifact.provider ?? '');
  if (!COMPILER_PROVIDERS.has(provider)) return false;
  return (
    artifact.commercialUse === 'unknown' ||
    artifact.commercialUse === undefined ||
    String(artifact.license ?? '').startsWith('Unverified provider:')
  );
}

export function resolveArtifactLicense(
  artifact: ManifestArtifactLicenseInput,
  siblings?: ManifestArtifactLicenseInput[],
  seen: Set<string> = new Set(),
): LicenseSubject {
  const key = String(artifact.id ?? artifact.path ?? '');
  if (key && seen.has(key)) {
    return fallbackUnknown(artifact);
  }
  if (key) seen.add(key);

  if (siblings && isUnresolvedCompiler(artifact)) {
    const source = findLicenseSource(artifact, siblings);
    if (source) {
      return resolveArtifactLicense(source, siblings, seen);
    }
    const selected = String(artifact.selectedProvider ?? '').trim();
    if (selected && !COMPILER_PROVIDERS.has(selected) && PROVIDER_LICENSE_DEFAULTS[selected]) {
      return PROVIDER_LICENSE_DEFAULTS[selected]!;
    }
  }

  if (
    artifact.commercialUse &&
    artifact.license &&
    (artifact.commercialUse === 'allowed' ||
      artifact.commercialUse === 'restricted' ||
      artifact.commercialUse === 'unknown')
  ) {
    return {
      commercialUse: artifact.commercialUse,
      license: artifact.license,
      licenseDetail: artifact.licenseDetail,
    };
  }

  if (artifact.manual) {
    return PROVIDER_LICENSE_DEFAULTS.manual!;
  }

  const provider = String(artifact.provider ?? '').trim();
  if (provider && PROVIDER_LICENSE_DEFAULTS[provider]) {
    return PROVIDER_LICENSE_DEFAULTS[provider]!;
  }

  return fallbackUnknown(artifact);
}

function fallbackUnknown(artifact: ManifestArtifactLicenseInput): LicenseSubject {
  const provider = String(artifact.provider ?? '').trim();
  return {
    commercialUse: 'unknown',
    license: provider ? `Unverified provider: ${provider}` : 'Provider not recorded',
  };
}

/** Attach canonical license fields for generation_manifest artifact rows. */
export function licenseFieldsForProvider(provider: string): Pick<LicenseSubject, 'license' | 'commercialUse'> {
  const resolved = resolveArtifactLicense({ provider });
  return { license: resolved.license, commercialUse: resolved.commercialUse };
}

export function licenseFieldsForArtifact(
  artifact: ManifestArtifactLicenseInput,
  siblings?: ManifestArtifactLicenseInput[],
): Pick<LicenseSubject, 'license' | 'commercialUse'> {
  const resolved = resolveArtifactLicense(artifact, siblings);
  return { license: resolved.license, commercialUse: resolved.commercialUse };
}

/** Stamp inherited license fields onto compiler rows. Does not invent commercialSafe=true. */
export function repairManifestArtifactLicenses<T extends ManifestArtifactLicenseInput>(
  artifacts: T[],
): { repaired: number; artifacts: T[] } {
  let repaired = 0;
  const next = artifacts.map((artifact) => {
    if (!isUnresolvedCompiler(artifact)) return artifact;
    const fields = licenseFieldsForArtifact(artifact, artifacts);
    if (
      fields.license === artifact.license &&
      fields.commercialUse === artifact.commercialUse
    ) {
      return artifact;
    }
    repaired += 1;
    return { ...artifact, ...fields };
  });
  return { repaired, artifacts: next };
}
