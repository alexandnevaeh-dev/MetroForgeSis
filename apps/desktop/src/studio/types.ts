export type StudioProject = {
  slug: string;
  path: string;
  title?: string;
  profile?: string;
};

export type GenerationPhaseState = {
  phase: string;
  status: string;
  message?: string;
};

export type GenerationState = {
  projectPath: string;
  phases: GenerationPhaseState[];
  overallProgress: number;
  events: import('@metroforge/generation').GenerationEvent[];
  validationReport?: {
    passed?: boolean;
    validationLevel?: string;
    results?: Array<{ gate: string; passed: boolean; message: string }>;
  };
};

export type AssetRecord = {
  id: string;
  path: string;
  category: string;
  provider?: string;
  fallbackGenerated?: boolean;
  critiquePassed?: boolean;
  critiqueScore?: number;
  maturity?: string;
  productionReady?: boolean;
  sourceType?: string;
  manual?: boolean;
  prompt?: string;
  seed?: number;
  dataUrl?: string;
  isAnimation?: boolean;
  frameCount?: number;
};

export type ActivityFilter =
  | 'ALL'
  | 'AI'
  | 'ASSETS'
  | 'WORLD'
  | 'CODE'
  | 'GODOT'
  | 'QA'
  | 'ERROR';

export const GALLERY_CATEGORIES = [
  'All',
  'Player',
  'NPC',
  'Enemy',
  'Boss',
  'Tileset',
  'Background',
  'Prop',
  'Weapon',
  'Item',
  'UI',
  'Icon',
  'VFX',
  'Animation',
  'Music',
  'SFX',
  'Voice',
] as const;

export function categorizeAssetPath(path: string): string {
  const p = path.toLowerCase().replace(/\\/g, '/');
  if (p.includes('/characters/player') || p.includes('/player/')) return 'Player';
  if (p.includes('/npc') || p.includes('/characters/npc')) return 'NPC';
  if (p.includes('/enemies/') || p.includes('/enemy_')) return 'Enemy';
  if (p.includes('/bosses/') || p.includes('/boss_')) return 'Boss';
  if (p.includes('/tilesets/') || p.includes('/tiles/')) return 'Tileset';
  if (p.includes('/background') || p.includes('/parallax')) return 'Background';
  if (p.includes('/weapons/') || p.includes('weapon')) return 'Weapon';
  if (p.includes('/items/')) return 'Item';
  if (p.includes('/icons/')) return 'Icon';
  if (p.includes('/vfx/') || p.includes('/fx/')) return 'VFX';
  if (p.includes('/ui/')) return 'UI';
  if (p.includes('/voice/') || p.includes('/speech/')) return 'Voice';
  if (p.includes('/music/') || p.endsWith('.mid')) return 'Music';
  if (p.includes('/audio/') || p.includes('/sfx/') || p.endsWith('.wav')) return 'SFX';
  if (p.includes('_walk') || p.includes('_attack') || p.includes('_hurt') || p.includes('/anim')) {
    return 'Animation';
  }
  if (p.includes('/props/') || p.includes('/prop')) return 'Prop';
  return 'Prop';
}
