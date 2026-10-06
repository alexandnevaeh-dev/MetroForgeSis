import { readTopDownPropAsset } from '@metroforge/generation';

/** Malformed placement metadata must not hide unrelated assets from the library. */
export function resolvePropAsset(projectPath: string, assetPath: string): {
  propAsset?: {image:string;layout:Record<string,unknown>}; propAssetError?: string;
} {
  if (!assetPath.startsWith('assets/') || !assetPath.endsWith('.png')) return {};
  try {
    const propAsset = readTopDownPropAsset(projectPath, assetPath);
    return propAsset ? {propAsset} : {};
  } catch (error) {
    return {propAssetError:error instanceof Error ? error.message : String(error)};
  }
}
