export type ManualReferenceMode = 'ip_adapter' | 'img2img';

/** Explicit reference options are replacement-only; omitted options retain legacy behavior. */
export function manualReferenceOptions(mode: unknown, strength: unknown, replacing: boolean):
  { mode: ManualReferenceMode; strength: number } | undefined {
  if (mode === undefined && strength === undefined) return undefined;
  if (!replacing) throw new Error('Reference conditioning requires an existing selected asset');
  if (mode !== 'ip_adapter' && mode !== 'img2img') throw new Error('Choose identity reference or structure redraw');
  const value = strength === undefined ? mode === 'img2img' ? 0.35 : 0.55 : strength;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1)
    throw new Error('Reference strength must be greater than 0 and at most 1');
  return { mode, strength: value };
}
