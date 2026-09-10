import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AutomatedVisualVerdict, VisualDNA, VisualQualityScore, VisualDefect } from '@metroforge/schemas';

export function writeVgf2VisualSliceReport(input: {
  projectPath: string;
  slug: string;
  seed: number;
  profile: string;
  archetype: string;
  providerSummary: Record<string, string>;
  visualDNA: VisualDNA;
  biomeName: string;
  maturity: { production: number; placeholder: number; rejected: number; unknownLicense: number };
  scores: VisualQualityScore;
  defects: VisualDefect[];
  repairs: string[];
  verdict: AutomatedVisualVerdict;
  screenshots: string[];
  hardFailReasons: string[];
}): { md: string; json: string } {
  const reportsDir = join(input.projectPath, 'reports');
  mkdirSync(reportsDir, { recursive: true });
  const jsonPath = join(reportsDir, 'VGF2_VISUAL_VERTICAL_SLICE.json');
  const mdPath = join(reportsDir, 'VGF2_VISUAL_VERTICAL_SLICE.md');
  const payload = {
    ...input,
    visualDNA: {
      styleFingerprint: input.visualDNA.styleFingerprint,
      artStyle: input.visualDNA.artStyle,
      renderingStyle: input.visualDNA.renderingStyle,
      palette: input.visualDNA.palette,
      lighting: input.visualDNA.lighting,
    },
    humanApproval: 'Only a human can set HUMAN_APPROVED or HUMAN_REJECTED.',
  };
  writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
  const md = [
    '# VGF-2 Visual Vertical Slice',
    '',
    `**Project:** ${input.slug}`,
    `**Seed:** ${input.seed}`,
    `**Profile:** ${input.profile}`,
    `**Archetype:** ${input.archetype}`,
    `**Automated verdict:** ${input.verdict}`,
    '',
    'Human approval is not assigned automatically.',
    '',
    '## Provider / model',
    '',
    ...Object.entries(input.providerSummary).map(([k, v]) => `- ${k}: ${v}`),
    '',
    '## VisualDNA',
    '',
    `- fingerprint: \`${input.visualDNA.styleFingerprint}\``,
    `- art style: ${input.visualDNA.artStyle.label}`,
    `- rendering: ${input.visualDNA.renderingStyle}`,
    `- biome: ${input.biomeName}`,
    '',
    '## Asset maturity',
    '',
    `- production-ready: ${input.maturity.production}`,
    `- placeholder: ${input.maturity.placeholder}`,
    `- rejected: ${input.maturity.rejected}`,
    `- unknown license: ${input.maturity.unknownLicense}`,
    '',
    '## Visual QA scores',
    '',
    ...Object.entries(input.scores).map(([k, v]) => `- ${k}: ${Math.round(Number(v))}`),
    '',
    '## Defects',
    '',
    input.defects.length ? input.defects.map((d) => `- ${d}`).join('\n') : '- none',
    '',
    '## Hard-fail reasons',
    '',
    input.hardFailReasons.length ? input.hardFailReasons.map((d) => `- ${d}`).join('\n') : '- none',
    '',
    '## Repairs',
    '',
    input.repairs.length ? input.repairs.map((d) => `- ${d}`).join('\n') : '- none applied',
    '',
    '## Screenshots',
    '',
    ...input.screenshots.map((s) => `- ${s}${existsSync(join(input.projectPath, s)) ? '' : ' (missing)'}`),
    '',
  ].join('\n');
  writeFileSync(mdPath, md);
  return { md: mdPath, json: jsonPath };
}
