import type { ImageProviderRegistration } from '../image-router.js';
import { capabilitiesFromRegistration } from './provider.js';

export type ReferenceReadiness =
  | 'CONFIGURED'
  | 'HEALTHY'
  | 'REFERENCE_CAPABLE'
  | 'REFERENCE_INVOCATION_VALIDATED'
  | 'PRODUCTION_ELIGIBLE'
  | 'REFERENCE_MODEL_NOT_INSTALLED'
  | 'REFERENCE_CAPABILITY_UNAVAILABLE';

export interface ReferenceProviderStatus {
  provider: string;
  model?: string;
  endpoint?: string;
  configured: boolean;
  enabled: boolean;
  reachable: boolean;
  capabilities: ReturnType<typeof capabilitiesFromRegistration>;
  commercialEligibility: string;
  readiness: ReferenceReadiness;
  reason: string;
}

export function referenceStatusForRegistration(
  registration: ImageProviderRegistration,
  input: { configured: boolean; reachable: boolean; model?: string; endpoint?: string; reason?: string },
): ReferenceProviderStatus {
  const capabilities = capabilitiesFromRegistration(registration);
  const referenceCapable = capabilities.supportsCustomReferenceImage && capabilities.supportsImageEditing;
  let readiness: ReferenceReadiness = 'CONFIGURED';
  if (!input.reachable) readiness = registration.family === 'local-image' ? 'REFERENCE_MODEL_NOT_INSTALLED' : 'REFERENCE_CAPABILITY_UNAVAILABLE';
  else if (!referenceCapable) readiness = 'REFERENCE_CAPABILITY_UNAVAILABLE';
  else readiness = registration.commercialUse === 'allowed' ? 'PRODUCTION_ELIGIBLE' : 'REFERENCE_CAPABLE';
  return {
    provider: registration.provider.id,
    model: input.model,
    endpoint: input.endpoint,
    configured: input.configured,
    enabled: true,
    reachable: input.reachable,
    capabilities,
    commercialEligibility: registration.commercialUse ?? 'unknown',
    readiness,
    reason: input.reason ?? (referenceCapable ? 'Reference-capable route available' : 'Provider does not advertise arbitrary custom reference editing'),
  };
}
