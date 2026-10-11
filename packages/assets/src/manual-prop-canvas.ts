export interface ManualPropCanvas { width: number; height: number }

/** Canvas edits create new props; replacement and actor contracts remain fixed. */
export function manualPropCanvasOptions(value: unknown, assetType: string, replacing: boolean): ManualPropCanvas | undefined {
  if (value === undefined) return undefined;
  if (assetType !== 'prop' || replacing) throw new Error('Custom prop size applies only to new prop alternatives');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Enter whole prop dimensions from 1 to 4096 pixels');
  const { width, height } = value as Record<string, unknown>;
  if (typeof width !== 'number' || typeof height !== 'number' || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > 4096 || height > 4096)
    throw new Error('Enter whole prop dimensions from 1 to 4096 pixels');
  return { width, height };
}
