import { decodePngRgba } from './png.js';
import { hasRealAlpha, type ForegroundIsolationProvider } from './pipeline-v2/isolate.js';

export async function isolateManualForeground(
  source: Buffer,
  plan: { transparent: boolean; grounded: boolean },
  provider?: ForegroundIsolationProvider,
): Promise<{ buffer: Buffer; metadata: Record<string, unknown> }> {
  if (!plan.transparent || !plan.grounded)
    return { buffer: source, metadata: { applied: false, matteSource: 'skipped_category' } };
  if (hasRealAlpha(source))
    return { buffer: source, metadata: { applied: false, matteSource: 'existing_alpha' } };
  if (!provider)
    return { buffer: source, metadata: { applied: false, matteSource: 'unavailable_fallback' } };
  let result: Awaited<ReturnType<ForegroundIsolationProvider['segmentForeground']>>;
  try { result = await provider.segmentForeground(source); }
  catch { throw new Error('Local foreground isolation failed'); }
  if (!result.ok || !result.buffer) throw new Error('Local foreground isolation failed');
  const before = decodePngRgba(source), after = decodePngRgba(result.buffer);
  if (before.width !== after.width || before.height !== after.height)
    throw new Error('Foreground isolation changed source dimensions');
  if (!hasRealAlpha(result.buffer)) throw new Error('Foreground isolation returned no usable matte');
  for (let i = 0; i < before.rgba.length; i += 4)
    if (before.rgba[i] !== after.rgba[i] || before.rgba[i + 1] !== after.rgba[i + 1] || before.rgba[i + 2] !== after.rgba[i + 2])
      throw new Error('Foreground isolation changed source colors');
  return { buffer: result.buffer, metadata: { applied: true, matteSource: 'segmentation_model', model: result.model, modelVersion: result.modelVersion } };
}
