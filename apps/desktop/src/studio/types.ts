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

export function categorizeAssetPath(path: string): string {
  const p = path.toLowerCase();
  if (p.includes('/characters/player')) return 'Player';
  if (p.includes('/characters/')) return 'Characters';
  if (p.includes('/enemies/')) return 'Enemies';
  if (p.includes('/bosses/')) return 'Bosses';
  if (p.includes('/tilesets/')) return p.endsWith('source.png') ? 'Tilesets' : 'Tilesets';
  if (p.includes('/items/')) return 'Items';
  if (p.includes('/ui/')) return 'UI';
  if (p.includes('/audio/') || p.endsWith('.wav')) return 'SFX';
  if (p.includes('/music/') || p.endsWith('.mid')) return 'Music';
  if (p.includes('_walk') || p.includes('_attack') || p.includes('_hurt')) return 'Animations';
  return 'Props';
}
