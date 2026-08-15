/**
 * Hosted NVCF often returns blank/black artifacts when prompts echo vendor brand names
 * (seen with smoke projects titled "NVIDIA …"). Strip those tokens from image prompts only.
 */
export function sanitizeImagePromptText(text: string): string {
  return text
    .replace(/\bNVIDIA\b/gi, '')
    .replace(/\bNVCF\b/gi, '')
    .replace(/\bNVAPI\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
}
