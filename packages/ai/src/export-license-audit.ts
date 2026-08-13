import { LicenseRouter, type LicenseClassification, type LicenseStatus } from './license-router.js';
import {
  resolveArtifactLicense,
  type ManifestArtifactLicenseInput,
} from './provider-license-metadata.js';

export interface ExportLicenseArtifactAudit {
  id: string;
  path: string;
  provider: string;
  status: LicenseStatus;
  reason: string;
}

export interface ExportLicenseAudit {
  commercialSafe: boolean;
  blockedArtifacts: ExportLicenseArtifactAudit[];
  artifactAudits: ExportLicenseArtifactAudit[];
}

export function auditExportLicense(
  artifacts: ManifestArtifactLicenseInput[],
): ExportLicenseAudit {
  const router = new LicenseRouter();
  const artifactAudits: ExportLicenseArtifactAudit[] = artifacts.map((artifact) => {
    const subject = resolveArtifactLicense(artifact);
    const classification: LicenseClassification = router.classify(subject);
    return {
      id: String(artifact.id ?? artifact.path ?? 'unknown'),
      path: String(artifact.path ?? ''),
      provider: String(artifact.provider ?? 'unknown'),
      status: classification.status,
      reason: classification.reason,
    };
  });

  const blockedArtifacts = artifactAudits.filter((a) => a.status !== 'COMMERCIAL_SAFE');
  return {
    commercialSafe: blockedArtifacts.length === 0,
    blockedArtifacts,
    artifactAudits,
  };
}
