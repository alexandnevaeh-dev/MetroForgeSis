export function registeredAssetId(path: string, assets: ReadonlyArray<{path: string; id: string}>): string | undefined {
  const normalize = (value: string) => value.replace(/\\/g, '/');
  return assets.find(asset => normalize(asset.path) === normalize(path))?.id;
}
