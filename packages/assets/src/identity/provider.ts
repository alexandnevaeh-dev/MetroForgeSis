import type { ImageProviderCapability } from '@metroforge/schemas';
import type { ImageGenerator, ImageGenRequest, ImageGenResult } from '../types/image-gen.js';
import type { ImageProviderRegistration } from '../image-router.js';

export const DEFAULT_IMAGE_CAPABILITIES: ImageProviderCapability = {
  supportsReferenceImage: false,
  supportsCustomReferenceImage: false,
  supportsPoseControl: false,
  supportsTransparency: false,
  supportsImageEditing: false,
  supportsCharacterConsistency: false,
  supportsPixelArt: true,
  supportsSeed: true,
  supportsNegativePrompt: true,
  maxReferenceImages: 0,
};

/** NVIDIA hosted Kontext preview only accepts canned example_id images, not custom sprites. */
export const NVIDIA_KONTEXT_CUSTOM_REFERENCE_SUPPORTED = false;

export function capabilitiesFromRegistration(reg?: ImageProviderRegistration): ImageProviderCapability {
  if (!reg) return { ...DEFAULT_IMAGE_CAPABILITIES };
  const editing = (reg.capabilities ?? []).includes('image-editing');
  const consistency = (reg.capabilities ?? []).includes('image-consistency');
  const nvidiaHosted = reg.family === 'nvidia';
  const customRef =
    Boolean(reg.supportsReferenceImages) && (!nvidiaHosted || NVIDIA_KONTEXT_CUSTOM_REFERENCE_SUPPORTED);
  return {
    supportsReferenceImage: Boolean(reg.supportsReferenceImages),
    supportsCustomReferenceImage: customRef,
    supportsPoseControl: editing && customRef,
    supportsTransparency: false,
    supportsImageEditing: editing,
    supportsCharacterConsistency: consistency && customRef,
    supportsPixelArt: true,
    supportsSeed: true,
    supportsNegativePrompt: true,
    maxReferenceImages: customRef ? 1 : 0,
  };
}

export interface IdentityGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  seed: number;
  referenceImage: Buffer;
  signal?: AbortSignal;
}

export interface PoseGenerationRequest extends IdentityGenerationRequest {
  poseName: string;
  posePrompt: string;
}

export interface IdentityGenerationResult extends ImageGenResult {
  capability: 'identity-variation' | 'identity-pose';
  usedReference: boolean;
  unavailableReason?: string;
}

export interface IdentityPreservingImageProvider {
  supportsReferenceImage(): boolean;
  generateVariation(request: IdentityGenerationRequest): Promise<IdentityGenerationResult>;
  generatePose(request: PoseGenerationRequest): Promise<IdentityGenerationResult>;
}

export class IdentityProviderUnavailableError extends Error {
  readonly code = 'IDENTITY_PROVIDER_UNAVAILABLE' as const;
  constructor(message: string) {
    super(message);
    this.name = 'IdentityProviderUnavailableError';
  }
}

export function wrapIdentityProvider(
  generator: ImageGenerator | null,
  capabilities: ImageProviderCapability,
): IdentityPreservingImageProvider {
  return {
    supportsReferenceImage() {
      return Boolean(generator) && capabilities.supportsCustomReferenceImage;
    },
    async generateVariation(request) {
      return runIdentity(generator, capabilities, request, 'identity-variation', request.prompt);
    },
    async generatePose(request) {
      return runIdentity(
        generator,
        capabilities,
        request,
        'identity-pose',
        `${request.prompt}. ${request.posePrompt}`,
      );
    },
  };
}

async function runIdentity(
  generator: ImageGenerator | null,
  capabilities: ImageProviderCapability,
  request: IdentityGenerationRequest,
  capability: IdentityGenerationResult['capability'],
  prompt: string,
): Promise<IdentityGenerationResult> {
  if (!generator || !capabilities.supportsCustomReferenceImage) {
    throw new IdentityProviderUnavailableError(
      'No identity-preserving image provider supports custom reference images. Deterministic pose fallback required.',
    );
  }
  const payload: ImageGenRequest = {
    profile: 'CHARACTER',
    prompt,
    negativePrompt: request.negativePrompt,
    width: request.width,
    height: request.height,
    seed: request.seed,
    signal: request.signal,
    conditioning: capabilities.supportsImageEditing
      ? { mode: 'img2img', image: request.referenceImage, strength: 0.35 }
      : undefined,
  };
  const result = await generator.generateImage(payload);
  return {
    ...result,
    capability,
    usedReference: true,
  };
}

export function selectAnimationTier(input: {
  hasSource: boolean;
  identityProviderAvailable: boolean;
  humanApproved?: boolean;
}): import('@metroforge/schemas').AnimationGenerationTier {
  if (input.humanApproved) return 'HUMAN_APPROVED';
  if (input.identityProviderAvailable && input.hasSource) return 'AI_IDENTITY_PRESERVED';
  if (input.hasSource) return 'DETERMINISTIC_DERIVED';
  return 'PROCEDURAL_FALLBACK';
}
