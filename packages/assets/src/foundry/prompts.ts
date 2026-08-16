import { createHash } from 'node:crypto';
import type { AssetRequest, CharacterIdentity, StyleBible } from '@metroforge/schemas';

const BANNED_GAME_STYLE_PHRASES = [
  'hollow knight style',
  'dead cells style',
  'zelda style',
  'octopath traveler style',
];

/** Central prompt builder — generation code must not scatter style strings. */
export function buildFoundryPrompt(
  request: AssetRequest,
  extras?: { styleBible?: StyleBible; identity?: CharacterIdentity },
): { prompt: string; negativePrompt: string } {
  const parts: string[] = [];
  if (extras?.styleBible) {
    parts.push(extras.styleBible.renderingStyle, extras.styleBible.lighting, extras.styleBible.outlineRules);
    const palette = extras.styleBible.palette.map((s) => s.hex).join(' ');
    if (palette) parts.push(`palette ${palette}`);
  }
  parts.push(request.style.visualStyle);
  if (request.style.pixelArt || extras?.styleBible) {
    parts.push('original game identity, not a copy of an existing commercial title');
  }
  if (extras?.identity) {
    parts.push(
      ...[
        extras.identity.visualDescription,
        extras.identity.silhouette,
        extras.identity.costume,
        extras.identity.weapon,
        extras.identity.face,
        extras.identity.hair,
        extras.identity.accessories?.join(', '),
      ].filter((p): p is string => Boolean(p)),
    );
  }
  parts.push(request.prompt);
  if (request.output.transparentBackground) parts.push('transparent background, isolated subject');

  const negative = [
    request.negativePrompt,
    extras?.styleBible?.negativePrompts.join(', '),
    'copyrighted character, trademarked costume, watermark, text overlay',
  ]
    .filter(Boolean)
    .join(', ');

  return {
    prompt: sanitizeStyleLanguage(parts.filter(Boolean).join('. ')),
    negativePrompt: sanitizeStyleLanguage(negative),
  };
}

export function sanitizeStyleLanguage(text: string): string {
  let out = text;
  for (const phrase of BANNED_GAME_STYLE_PHRASES) {
    const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    out = out.replace(re, originalStyleSubstitute(phrase));
  }
  return out.replace(/\s+/g, ' ').trim();
}

function originalStyleSubstitute(phrase: string): string {
  if (phrase.includes('hollow')) return 'hand-painted gothic insectoid 2D';
  if (phrase.includes('dead cells')) return 'high-contrast pixel fantasy';
  if (phrase.includes('octopath')) return 'layered retro-modern HD pixel diorama';
  if (phrase.includes('zelda')) return '16-bit top-down fantasy adventure';
  return 'original stylized 2D game art';
}

export function hashPrompt(prompt: string, negative?: string): string {
  return createHash('sha256').update(`${prompt}\n${negative ?? ''}`).digest('hex');
}

/** Hero/signature types skip stock retrieval unless explicitly requested. */
export function isIdentityCritical(assetType: AssetRequest['assetType']): boolean {
  return (
    assetType === 'player' ||
    assetType === 'npc' ||
    assetType === 'enemy' ||
    assetType === 'boss' ||
    assetType === 'portrait' ||
    assetType === 'weapon'
  );
}

export function shouldTryRetrieval(request: AssetRequest): boolean {
  if (request.preferRetrieved === false) return false;
  if (request.preferRetrieved === true) return true;
  return !isIdentityCritical(request.assetType);
}
