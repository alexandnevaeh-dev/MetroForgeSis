import { licenseFieldsForArtifact, type ManifestArtifactLicenseInput } from '@metroforge/ai';

export interface DerivativeLicenseRecord {
  parentArtifactId: string;
  sourceLicense: string;
  derivedLicense: 'allowed' | 'restricted' | 'unknown';
  transformation: string;
  commercialUse: 'allowed' | 'restricted' | 'unknown';
}

/**
 * Derived compiler output inherits parent commercialUse. Never upgrades unknown/restricted.
 */
export function inheritDerivativeLicense(input: {
  parent: ManifestArtifactLicenseInput;
  child: ManifestArtifactLicenseInput;
  transformation: string;
  siblings?: ManifestArtifactLicenseInput[];
}): DerivativeLicenseRecord {
  const parentFields = licenseFieldsForArtifact(input.parent, input.siblings);
  const parentUse = parentFields.commercialUse ?? 'unknown';
  let derived: 'allowed' | 'restricted' | 'unknown' = 'unknown';
  if (parentUse === 'allowed') derived = 'allowed';
  else if (parentUse === 'restricted') derived = 'restricted';
  else derived = 'unknown';
  return {
    parentArtifactId: String(input.parent.id ?? input.parent.path ?? ''),
    sourceLicense: parentFields.license ?? 'unknown',
    derivedLicense: derived,
    transformation: input.transformation,
    commercialUse: derived,
  };
}
