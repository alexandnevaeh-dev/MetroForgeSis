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
    const subject = resolveArtifactLicense(artifact, artifacts);
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

export function buildAttributionsMarkdown(audit: ExportLicenseAudit): string {
  const byLicense = new Map<string, string[]>();
  for (const row of audit.artifactAudits) {
    const key = `${row.status} — ${row.reason}`;
    const list = byLicense.get(key) ?? [];
    if (list.length < 8) list.push(row.path || row.id);
    byLicense.set(key, list);
  }
  const nvidiaUsed = audit.artifactAudits.some((a) => a.provider === 'nvidia-image');
  const lines = [
    '# Attributions',
    '',
    'Shipping visual assets are classified from the MetroForge provider license registry.',
    'Unknown commercialUse is never treated as allowed. Compiler artifacts inherit the source license.',
    '',
  ];
  if (nvidiaUsed) {
    lines.push(
      '## NVIDIA Visual Generative AI',
      '',
      'Character, enemy, NPC, boss, tileset, and VFX source images were generated with NVIDIA hosted',
      'Visual GenAI (`nvidia-image` / `black-forest-labs/flux.1-dev`) under the NVIDIA API Terms / model card',
      'registered for this provider. FLUX.1-dev additional model-card terms apply to those source pixels.',
      'Pixel-art compiled sprites are local MetroForge transformations of those sources and inherit that license.',
      '',
    );
  }
  lines.push(
    '## MetroForge procedural audio / fallbacks',
    '',
    'Procedural generator output is original MetroForge work (`commercialUse: allowed` in the registry).',
    '',
    '## Classification summary',
    '',
  );
  for (const [reason, samples] of byLicense) {
    lines.push(`- ${reason}`);
    for (const sample of samples) lines.push(`  - ${sample}`);
  }
  lines.push('');
  return lines.join('\n');
}
