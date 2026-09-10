import type { StyleBible, VisualReferenceTemplate } from '@metroforge/schemas';
import { sanitizeStyleLanguage } from '../foundry/prompts.js';

/** Resolves {{biome}} / {{role}} placeholders in a template's subjectTemplate. Unknown
 *  placeholders are left as-is rather than silently dropped, so a typo is visible in the output
 *  prompt instead of disappearing. */
export function resolveSubjectTemplate(template: VisualReferenceTemplate): string {
  return template.promptRecipe.subjectTemplate
    .replaceAll('{{biome}}', template.biome)
    .replaceAll('{{role}}', template.assetRole);
}

/**
 * Builds the actual prompt/negativePrompt for a resolved template, composing with an optional
 * StyleBible using the same sanitizeStyleLanguage() pass the real Foundry prompt builder uses
 * (packages/assets/src/foundry/prompts.ts) so banned-style-phrase substitution and whitespace
 * normalization stay identical to the rest of the pipeline rather than reimplemented here.
 */
export function buildTemplatePrompt(
  template: VisualReferenceTemplate,
  extras?: { styleBible?: StyleBible },
): { prompt: string; negativePrompt: string } {
  const parts = [template.promptRecipe.promptPrefix];
  if (extras?.styleBible) {
    parts.push(extras.styleBible.renderingStyle, extras.styleBible.lighting);
  }
  parts.push(resolveSubjectTemplate(template));

  const negative = [template.promptRecipe.negativePrompt, extras?.styleBible?.negativePrompts.join(', ')]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(', ');

  return {
    prompt: sanitizeStyleLanguage(parts.filter(Boolean).join('. ')),
    negativePrompt: sanitizeStyleLanguage(negative),
  };
}

export interface TokenBudgetResult {
  ok: boolean;
  tokenCount: number;
  maxTokens: number;
  overflow: boolean;
  overflowBy: number;
  /** True when this came from the real provider tokenizer (e.g. DiffusersProvider.checkPromptBudget);
   *  false when it's the character-count heuristic fallback used when no real tokenizer is
   *  available — disclosed rather than presented as an exact count. */
  estimated: boolean;
}

/** Minimal shape of the real tokenizer check (packages/assets/src/providers/diffusers.ts's
 *  DiffusersProvider.checkPromptBudget) — declared structurally here so this module doesn't
 *  depend on the diffusers provider module (which spawns a Python subprocess) unless a caller
 *  actually passes one in. */
export interface PromptBudgetChecker {
  checkPromptBudget(prompt: string, negativePrompt?: string): Promise<{
    positive: { tokenCount: number; maxTokens: number; overflow: boolean; overflowBy: number };
    anyOverflow: boolean;
  }>;
}

/** Conservative CLIP-family estimate: ~4 characters per token, 77-token budget (the same ceiling
 *  packages/assets/src/providers/prompt-budget.real-tokenizer.evidence.test.ts confirms against
 *  the real CLIPTokenizer). Used only when no real tokenizer checker is available — callers must
 *  treat `estimated: true` results as advisory, not authoritative. */
const HEURISTIC_MAX_TOKENS = 77;
const HEURISTIC_CHARS_PER_TOKEN = 4;

export async function checkTemplateTokenBudget(
  prompt: string,
  negativePrompt: string,
  checker?: PromptBudgetChecker,
): Promise<TokenBudgetResult> {
  if (checker) {
    const result = await checker.checkPromptBudget(prompt, negativePrompt);
    return {
      ok: !result.anyOverflow,
      tokenCount: result.positive.tokenCount,
      maxTokens: result.positive.maxTokens,
      overflow: result.positive.overflow,
      overflowBy: result.positive.overflowBy,
      estimated: false,
    };
  }
  const estimatedTokens = Math.ceil(prompt.length / HEURISTIC_CHARS_PER_TOKEN);
  const overflow = estimatedTokens > HEURISTIC_MAX_TOKENS;
  return {
    ok: !overflow,
    tokenCount: estimatedTokens,
    maxTokens: HEURISTIC_MAX_TOKENS,
    overflow,
    overflowBy: overflow ? estimatedTokens - HEURISTIC_MAX_TOKENS : 0,
    estimated: true,
  };
}
