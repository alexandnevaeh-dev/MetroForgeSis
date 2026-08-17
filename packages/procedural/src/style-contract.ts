import type { StyleBible } from '@metroforge/schemas';

/** Machine-readable visual contract consumed by every image-generation prompt. */
export interface VisualStyleContract {
  artStyle: string;
  perspective: string;
  pixelDensity: number;
  targetResolution: { width: number; height: number };
  referenceResolution: { width: number; height: number };
  palette: string[];
  paletteRoles: {
    primary: string[];
    secondary: string[];
    accent: string[];
  };
  contrast: string;
  silhouetteRules: string;
  outlineRules: string;
  materialVocabulary: string;
  biomeMotifs: string;
  lightingDirection: string;
  saturationRange: string;
  foregroundBackgroundSeparation: string;
  characterScale: string;
  enemyScale: string;
  propScale: string;
  uiVocabulary: string;
  characterRules: {
    outlineStrength: number;
    contrast: number;
    saturation: number;
  };
  environmentRules: {
    textureDensity: number;
    detailDensity: number;
    silhouetteComplexity: number;
  };
  backgroundRules: {
    contrastMultiplier: number;
    saturationMultiplier: number;
  };
  uiRules: {
    visualLanguage: string;
  };
  promptFragment: string;
  negativeFragment: string;
}

export function buildVisualStyleContract(styleBible: StyleBible | undefined): VisualStyleContract {
  const palette = (styleBible?.palette ?? []).map((swatch) => swatch.hex);
  const artStyle = styleBible?.artStyle ?? styleBible?.renderingStyle ?? 'readable 2D pixel art';
  const pixelDensity = styleBible?.pixelResolution ?? styleBible?.tileSize ?? 16;
  const target = styleBible?.internalRenderResolution ?? { width: 640, height: 360 };
  const outline = styleBible?.outlineRules ?? '1px dark outline on gameplay sprites';
  const lighting = styleBible?.lightingDirection ?? 'upper-left';
  const contrast = styleBible?.contrast ?? styleBible?.lightingContrast ?? 'readable midtones';
  const saturation = styleBible?.saturation ?? 'controlled biome-locked saturation';
  const characterScale = styleBible?.characterScale ?? 'two-tile humanoid';
  const enemyScale = styleBible?.enemyScaleRange
    ? `${styleBible.enemyScaleRange[0]}-${styleBible.enemyScaleRange[1]}px enemies`
    : 'enemy smaller than or equal to player';
  const ui = styleBible?.UIStyle ?? styleBible?.iconStyle ?? 'minimal HUD, no baked text';
  const materials = styleBible?.materials ?? 'stone, metal, vegetation matching biome';
  const contract: VisualStyleContract = {
    artStyle,
    perspective: 'side-view 2D',
    pixelDensity,
    targetResolution: target,
    referenceResolution: target,
    palette,
    paletteRoles: {
      primary: palette.slice(0, 3),
      secondary: palette.slice(3, 6),
      accent: palette.slice(6, 9),
    },
    contrast,
    silhouetteRules: 'readable silhouettes; player darker than far background; no camouflage',
    outlineRules: outline,
    materialVocabulary: materials,
    biomeMotifs: styleBible?.environmentDensity ?? 'biome-locked motifs, no style drift',
    lightingDirection: lighting,
    saturationRange: saturation,
    foregroundBackgroundSeparation:
      styleBible?.backgroundDepthRules ??
      styleBible?.parallaxRules ??
      'far dimmer, mid midtone, near highest contrast',
    characterScale,
    enemyScale,
    propScale: 'props read as smaller than the player unless architectural',
    uiVocabulary: ui,
    characterRules: { outlineStrength: 1, contrast: 0.7, saturation: 0.55 },
    environmentRules: { textureDensity: 0.55, detailDensity: 0.5, silhouetteComplexity: 0.45 },
    backgroundRules: { contrastMultiplier: 0.72, saturationMultiplier: 0.65 },
    uiRules: { visualLanguage: ui },
    promptFragment: '',
    negativeFragment:
      'UI chrome, HUD, readable text, logos, watermarks, people, person, human figure, character silhouette, pine trees, conifer forest, mountain range, lake vista, outdoor landscape photography, alpine woodland, fjord shoreline, mismatched perspective, wrong biome palette',
  };
  contract.promptFragment = [
    artStyle,
    `${pixelDensity}px pixel density`,
    `palette ${palette.join(' ')}`.trim(),
    outline,
    `${lighting} lighting`,
    contrast,
    saturation,
    characterScale,
    contract.foregroundBackgroundSeparation,
  ]
    .filter(Boolean)
    .join(', ');
  return contract;
}

export function applyVisualStyleContract(prompt: string, styleBible: StyleBible | undefined, extras?: string): string {
  const contract = buildVisualStyleContract(styleBible);
  const extra = extras?.trim() ? ` ${extras.trim()}` : '';
  return `${contract.promptFragment}.${extra} ${prompt}`.trim();
}
