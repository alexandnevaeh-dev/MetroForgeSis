import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { VisualReferenceTemplate } from '@metroforge/schemas';
import type { ImageConditioning } from '../types/image-gen.js';
import { REFERENCE_LIBRARY_DIR } from './library.js';

/** Minimal shape of packages/assets/src/image-router.ts's ImageProviderRegistration that this
 *  module actually reads — declared structurally so this file doesn't import the full router
 *  (which pulls in every concrete provider). */
export interface ConditioningCapableRegistration {
  provider: { id: string };
  capabilities?: string[];
  supportsReferenceImages?: boolean;
}

export interface ConditioningResolution {
  conditioning?: ImageConditioning;
  /** Set whenever a reference image was NOT attached as conditioning — always non-empty when
   *  conditioning is undefined, per this milestone's "disclose, don't silently drop" instruction. */
  disclosure?: string;
}

/**
 * Resolves whether the given template's first reference image may be attached as real
 * conditioning for the given provider registration — only when that provider genuinely declares
 * support (either the boolean `supportsReferenceImages` flag or a `REFERENCE_IMAGE`-family
 * capability string, matching the two conventions actually used across
 * packages/assets/src/providers/local-visual-fleet.ts and image-router.ts). Otherwise returns a
 * disclosure string explaining why text-only constraints were used instead.
 */
export function resolveConditioning(
  root: string,
  template: VisualReferenceTemplate,
  registration: ConditioningCapableRegistration | undefined,
): ConditioningResolution {
  if (!registration) {
    return { disclosure: `no provider selected — reference image not supplied as conditioning for template ${template.id}` };
  }
  const capabilities = registration.capabilities ?? [];
  const supportsReference =
    registration.supportsReferenceImages === true ||
    capabilities.some((c) => c === 'REFERENCE_IMAGE' || c === 'IMAGE_TO_IMAGE' || c === 'IDENTITY_CONDITIONING');
  if (!supportsReference) {
    return {
      disclosure: `provider ${registration.provider.id} does not declare reference-image support (capabilities=${JSON.stringify(capabilities)}, supportsReferenceImages=${registration.supportsReferenceImages ?? false}) — applied text-only style constraints for template ${template.id} instead of image conditioning`,
    };
  }
  const referencePath = template.referencePaths[0];
  if (!referencePath) {
    return { disclosure: `template ${template.id} has no reference image path to condition on` };
  }
  const fullPath = join(root, REFERENCE_LIBRARY_DIR, referencePath);
  const image = readFileSync(fullPath);
  return {
    conditioning: {
      mode: 'ip_adapter',
      image,
      strength: 0.5,
      sourceAssetId: template.id,
    },
  };
}
