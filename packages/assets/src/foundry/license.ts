import type { AssetLicenseStatus } from '@metroforge/schemas';

export interface AssetLicenseSubject {
  license: string;
  commercialUse?: 'allowed' | 'restricted' | 'unknown';
  attributionRequired?: boolean;
  shareAlike?: boolean;
  creator?: string;
  sourceUrl?: string;
}

export interface AssetLicenseDecision {
  status: AssetLicenseStatus;
  reason: string;
  commercialUse: boolean;
  attribution?: string;
}

/**
 * Asset-level license router (Kenney/OpenGameArt/generated artifacts).
 * UNKNOWN never passes when commercial use is required.
 */
export function classifyAssetLicense(
  subject: AssetLicenseSubject,
  commercialUseRequired: boolean,
): AssetLicenseDecision {
  const license = subject.license.trim() || 'unknown';
  const lower = license.toLowerCase();

  if (subject.commercialUse === 'unknown' || /^unknown|unverified|n\/?a$/.test(lower)) {
    return {
      status: 'unknown',
      reason: 'license was never verified — not treated as commercial-safe',
      commercialUse: false,
    };
  }

  if (
    subject.commercialUse === 'restricted' ||
    /non[- ]?commercial|cc[- ]?by[- ]?nc|research only|academic/.test(lower)
  ) {
    return {
      status: commercialUseRequired ? 'blocked' : 'restricted',
      reason: `restricted license (${license})`,
      commercialUse: false,
    };
  }

  const shareAlike = subject.shareAlike === true || /cc[- ]?by[- ]?sa|share[- ]?alike/.test(lower);
  if (shareAlike && commercialUseRequired) {
    return {
      status: 'restricted',
      reason: `share-alike license (${license}) is not auto-approved for commercial shipping`,
      commercialUse: false,
    };
  }

  const cc0 = /cc0|public domain|wtfpl/.test(lower);
  const attributionRequired =
    subject.attributionRequired === true || (/cc[- ]?by/.test(lower) && !cc0);

  if (cc0) {
    return {
      status: 'approved',
      reason: `CC0/public-domain (${license})`,
      commercialUse: true,
    };
  }

  if (subject.commercialUse === 'allowed' || /cc[- ]?by|mit|apache|bsd/.test(lower)) {
    const attribution = attributionRequired
      ? [subject.creator, subject.sourceUrl, license].filter(Boolean).join(' — ')
      : undefined;
    return {
      status: attributionRequired ? 'approved-with-attribution' : 'approved',
      reason: attributionRequired ? `commercial with attribution (${license})` : `commercial-safe (${license})`,
      commercialUse: true,
      attribution,
    };
  }

  return {
    status: 'unknown',
    reason: `could not classify license (${license})`,
    commercialUse: false,
  };
}

export function licensePasses(
  decision: AssetLicenseDecision,
  commercialUseRequired: boolean,
): boolean {
  if (decision.status === 'blocked' || decision.status === 'restricted') return false;
  if (commercialUseRequired && (decision.status === 'unknown' || !decision.commercialUse)) return false;
  return true;
}
