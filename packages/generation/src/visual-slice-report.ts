import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CharacterVisualDNA, StyleBible, VisualReviewState } from '@metroforge/schemas';
import { assembleContactSheet } from '@metroforge/assets';
import { readFileSync } from 'node:fs';

export interface VisualSliceReportInput {
  projectPath: string;
  slug: string;
  styleBible: StyleBible;
  characterDna: CharacterVisualDNA;
  providerModels: Record<string, string>;
  spriteQa: unknown;
  tilesetQa: unknown;
  roomQa: unknown;
  fakeAnimation: boolean;
  performance?: unknown;
  screenshots: string[];
  review: VisualReviewState;
}

const EVIDENCE_COPIES: Array<{ from: string; to: string }> = [
  { from: 'reports/01-start.png', to: 'reports/01-start.png' },
  { from: 'reports/02-traversal.png', to: 'reports/02-traversal.png' },
  { from: 'reports/03-combat.png', to: 'reports/03-combat.png' },
  { from: 'reports/04-vertical-room.png', to: 'reports/04-vertical-room.png' },
  { from: 'reports/05-ability-room.png', to: 'reports/05-ability-room.png' },
  { from: 'reports/06-secret.png', to: 'reports/06-secret.png' },
  { from: 'reports/07-checkpoint.png', to: 'reports/07-checkpoint.png' },
  { from: 'reports/08-boss-room.png', to: 'reports/08-boss-room.png' },
  { from: 'reports/09-boss-combat.png', to: 'reports/09-boss-combat.png' },
  { from: 'reports/hud.png', to: 'reports/hud.png' },
  { from: 'assets/qa/player-animation-sheet.png', to: 'reports/player-animation-sheet.png' },
  { from: 'assets/qa/enemy-animation-sheet.png', to: 'reports/enemy-animation-sheet.png' },
  { from: 'assets/qa/boss-animation-sheet.png', to: 'reports/boss-animation-sheet.png' },
  { from: 'assets/qa/tileset-test.png', to: 'reports/tileset-test.png' },
  { from: 'assets/qa/biome-layers.png', to: 'reports/biome-layers.png' },
  { from: 'qa/screenshot_gameplay.png', to: 'reports/qa-gameplay.png' },
];

/** Copies generated QA sheets and room shots into reports/, then builds a contact sheet. */
export function collectVisualSliceEvidence(projectPath: string): string[] {
  const reportsDir = join(projectPath, 'reports');
  mkdirSync(reportsDir, { recursive: true });
  mkdirSync(join(projectPath, 'assets', 'qa'), { recursive: true });
  const present: string[] = [];
  const contactFrames: { label: string; png: Buffer }[] = [];
  const contactAllow = new Set([
    'reports/player-animation-sheet.png',
    'reports/enemy-animation-sheet.png',
    'reports/boss-animation-sheet.png',
    'reports/tileset-test.png',
    'reports/biome-layers.png',
  ]);

  for (const pair of EVIDENCE_COPIES) {
    const src = join(projectPath, pair.from);
    const dest = join(projectPath, pair.to);
    if (!existsSync(src)) continue;
    if (src !== dest) copyFileSync(src, dest);
    present.push(pair.to.replace(/\\/g, '/'));
    if (contactAllow.has(pair.to.replace(/\\/g, '/'))) {
      try {
        contactFrames.push({
          label: pair.to.replace(/^reports\//, '').replace(/\.png$/, ''),
          png: readFileSync(dest),
        });
      } catch {
        /* skip unreadable frame */
      }
    }
  }

  if (contactFrames.length > 0) {
    const sheet = assembleContactSheet(contactFrames.slice(0, 16));
    const sheetRel = 'reports/visual-slice-contact-sheet.png';
    writeFileSync(join(projectPath, sheetRel), sheet);
    present.push(sheetRel);
  }
  return present;
}

export function writeVisualSliceReports(input: VisualSliceReportInput): { md: string; json: string } {
  const reportsDir = join(input.projectPath, 'reports');
  mkdirSync(reportsDir, { recursive: true });
  const jsonPath = join(reportsDir, 'VISUAL_VERTICAL_SLICE.json');
  const mdPath = join(reportsDir, 'VISUAL_VERTICAL_SLICE.md');

  const payload = {
    status: 'VISUAL SLICE READY FOR HUMAN REVIEW',
    notFullGameReady: true,
    visualReviewStatus: input.review.status,
    heartEngineFrozen: 'git tag heart-engine-p7-technical-checkpoint',
    styleBible: input.styleBible,
    characterVisualDNA: input.characterDna,
    providerModels: input.providerModels,
    spriteQa: input.spriteQa,
    tilesetQa: input.tilesetQa,
    roomQa: input.roomQa,
    fakeAnimation: input.fakeAnimation,
    performance: input.performance ?? null,
    screenshots: input.screenshots,
    rubric: {
      artCoherence: '1-5 human',
      playerReadability: '1-5 human',
      environmentCoherence: '1-5 human',
      tilesetQuality: '1-5 human',
      animationQuality: '1-5 human',
      lightingDepth: '1-5 human',
      combatReadability: '1-5 human',
      vfxIntegration: '1-5 human',
      roomComposition: '1-5 human',
      hud: '1-5 human',
      bossPresentation: '1-5 human',
      overallPolish: '1-5 human',
    },
    note:
      'Technical visual QA (dimensions, alpha, seams, anchors) is separate from aesthetic/human review. ' +
      'A deterministic critic PASS does not approve this slice.',
  };
  writeFileSync(jsonPath, JSON.stringify(payload, null, 2));

  const md = [
    '# Visual Vertical Slice',
    '',
    `**Status:** VISUAL SLICE READY FOR HUMAN REVIEW`,
    `**Not:** FULL GAME READY`,
    `**Human gate:** ${input.review.status}`,
    '',
    'Heart of the Drowned remains a technical regression project (git tag `heart-engine-p7-technical-checkpoint`).',
    '',
    '## StyleBible',
    '',
    `- artStyle: ${input.styleBible.artStyle ?? input.styleBible.renderingStyle}`,
    `- tileSize: ${input.styleBible.tileSize ?? input.styleBible.pixelResolution}`,
    `- player: ${input.styleBible.playerSpriteWidth ?? 64}×${input.styleBible.playerSpriteHeight ?? 64}`,
    `- cameraZoom: ${input.styleBible.cameraZoom ?? '?'} (integer)`,
    `- nearestNeighbor: ${input.styleBible.nearestNeighbor ?? true}`,
    `- animationFPS: ${input.styleBible.animationFPS ?? 10}`,
    '',
    '## CharacterVisualDNA',
    '',
    `- silhouette: ${input.characterDna.silhouette}`,
    `- weapon: ${input.characterDna.weapon}`,
    `- anchor: ${input.characterDna.anchor}`,
    '',
    '## Provider / model selections',
    '',
    ...Object.entries(input.providerModels).map(([k, v]) => `- ${k}: ${v}`),
    '',
    '## Animation',
    '',
    input.fakeAnimation
      ? 'FAKE OR UNSTABLE animation detected. This slice is **not** production-ready for animation. Human revision is required.'
      : 'Pose generation ran; still requires human review of identity consistency.',
    '',
    '## Technical vs aesthetic',
    '',
    'Technical visual QA may pass while the game still looks wrong. Do not expand to RELEASE_CANDIDATE / LARGE mass art until Approve Visual Direction.',
    '',
    '## Screenshots',
    '',
    ...input.screenshots.map((s) => `- ${s}`),
    '',
  ].join('\n');
  writeFileSync(mdPath, md);
  return { md: mdPath, json: jsonPath };
}
