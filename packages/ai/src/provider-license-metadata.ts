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
  manual: {
    commercialUse: 'unknown',
    license: 'Manual asset — license unverified',
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
}

export function resolveArtifactLicense(artifact: ManifestArtifactLicenseInput): LicenseSubject {
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
