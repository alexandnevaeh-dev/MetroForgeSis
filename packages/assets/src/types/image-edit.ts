import type { ImageGenerationProfile } from './vision.js';

/** Edit intent — separate from provider/model selection. */
export type ImageEditPurpose =
  | 'CHARACTER_REVISION'
  | 'IDENTITY_PRESERVING_EDIT'
  | 'OUTFIT_CHANGE'
  | 'POSE_CHANGE'
  | 'COLOR_VARIATION'
  | 'WEAPON_VARIATION'
  | 'ENEMY_VARIATION'
  | 'BACKGROUND_REVISION'
  | 'UI_REVISION'
  | 'VFX_REVISION'
  | 'STYLE_REFINEMENT'
  | 'GENERAL_EDIT';

/** Reference to a persisted or in-memory source asset. */
export interface AssetReference {
  assetId: string;
  /** Project-relative or absolute path to load bytes when `bytes` is absent. */
  path?: string;
  bytes?: Buffer;
  mimeType?: string;
}

export interface ImageEditRequest {
  sourceAssets: AssetReference[];
  instruction: string;
  mask?: AssetReference;
  seed?: number;
  width?: number;
  height?: number;
  strength?: number;
  purpose?: ImageEditPurpose;
  profile?: ImageGenerationProfile;
  modelOverride?: string;
  signal?: AbortSignal;
  metadata?: Record<string, unknown>;
}

export interface GeneratedImage {
  buffer: Buffer;
  mimeType: string;
  width: number;
  height: number;
}

export interface EditGenerationProvenance {
  provider: string;
  model: string;
  capability: 'IMAGE_EDIT';
  sourceAssetIds: string[];
  parentAssetId?: string;
  rootAssetId?: string;
  versionNumber?: number;
  instructionHash: string;
  seed?: number;
  generatedAt: string;
  nativeDimensions: { width: number; height: number };
  source: 'image_edit';
  purpose?: ImageEditPurpose;
  requestedChangeScope?: string;
  deployment?: string;
  endpointFamily?: string;
  mimeType?: string;
  fileSize?: number;
  requestId?: string;
}

export interface ImageEditResult {
  provider: string;
  model: string;
  sourceAssetIds: string[];
  images: GeneratedImage[];
  seed?: number;
  durationMs?: number;
  provenance: EditGenerationProvenance;
  requestId?: string;
}

export interface ImageEditor {
  id: string;
  editImage(request: ImageEditRequest): Promise<ImageEditResult>;
}
