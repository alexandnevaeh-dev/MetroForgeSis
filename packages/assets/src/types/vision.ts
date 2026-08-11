export interface VisionAnalysisResponse {
  passed: boolean;
  score: number;
  issues: string[];
  tags: string[];
  description: string;
}

export type ImageGenerationProfile =
  | 'CONCEPT_ART'
  | 'CHARACTER'
  | 'ENEMY'
  | 'BOSS'
  | 'NPC'
  | 'PORTRAIT'
  | 'ITEM'
  | 'WEAPON'
  | 'ICON'
  | 'ENVIRONMENT'
  | 'BACKGROUND'
  | 'TILE_SOURCE'
  | 'VFX_TEXTURE'
  | 'UI_ART'
  | 'MARKETING_ART';
