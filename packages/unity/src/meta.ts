import { createHash } from 'node:crypto';

export function unityGuid(seed: string): string {
  return createHash('md5').update(`metroforge:${seed}`).digest('hex');
}

export function unityMeta(guid: string, extra = ''): string {
  return `fileFormatVersion: 2\nguid: ${guid}\n${extra}`;
}

export function scriptMeta(guid: string): string {
  return unityMeta(
    guid,
    `MonoImporter:
  externalObjects: {}
  serializedVersion: 2
  defaultReferences: []
  executionOrder: 0
  icon: {instanceID: 0}
  userData: 
  assetBundleName: 
  assetBundleVariant: 
`,
  );
}

export function folderMeta(guid: string): string {
  return unityMeta(
    guid,
    `folderAsset: yes
DefaultImporter:
  externalObjects: {}
  userData: 
  assetBundleName: 
  assetBundleVariant: 
`,
  );
}

export function pngTextureLimit(png: Buffer): number {
  if (png.length < 24 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
      || png.toString('ascii', 12, 16) !== 'IHDR') throw new Error('Invalid PNG header');
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const largest = Math.max(width, height);
  if (!width || !height || largest > 16384) throw new Error('Unity sprite dimensions must be between 1 and 16384 pixels');
  return Math.max(2048, 2 ** Math.ceil(Math.log2(largest)));
}

export function pngSpriteMeta(
  guid: string,
  pixelsPerUnit = 1,
  options: { filterMode?: number; spriteMeshType?: number; spriteExtrude?: number; maxTextureSize?: number } = {},
): string {
  const maxTextureSize = options.maxTextureSize ?? 2048;
  const filterMode = options.filterMode ?? 0;
  const spriteMeshType = options.spriteMeshType ?? 0;
  const spriteExtrude = options.spriteExtrude ?? 0;
  return `fileFormatVersion: 2
guid: ${guid}
TextureImporter:
  internalIDToNameTable: []
  externalObjects: {}
  serializedVersion: 13
  mipmaps:
    mipMapMode: 0
    enableMipMap: 0
    sRGBTexture: 1
    linearTexture: 0
    fadeOut: 0
    borderMipMap: 0
    mipMapsPreserveCoverage: 0
    alphaTestReferenceValue: 0.5
    mipMapFadeDistanceStart: 1
    mipMapFadeDistanceEnd: 3
  bumpmap:
    convertToNormalMap: 0
    externalNormalMap: 0
    heightScale: 0.25
    normalMapFilter: 0
    flipGreenChannel: 0
  isReadable: 1
  streamingMipmaps: 0
  streamingMipmapsPriority: 0
  vTOnly: 0
  ignoreMipmapLimit: 0
  grayScaleToAlpha: 0
  generateCubemap: 6
  cubemapConvolution: 0
  seamlessCubemap: 0
  textureFormat: 1
  maxTextureSize: ${maxTextureSize}
  textureSettings:
    serializedVersion: 2
    filterMode: ${filterMode}
    aniso: 1
    mipBias: 0
    wrapU: 1
    wrapV: 1
    wrapW: 1
  nPOTScale: 0
  lightmap: 0
  compressionQuality: 50
  spriteMode: 1
  spriteExtrude: ${spriteExtrude}
  spriteMeshType: ${spriteMeshType}
  alignment: 7
  spritePivot: {x: 0.5, y: 0}
  spritePixelsToUnits: ${pixelsPerUnit}
  spriteBorder: {x: 0, y: 0, z: 0, w: 0}
  spriteGenerateFallbackPhysicsShape: 0
  alphaUsage: 1
  alphaIsTransparency: 1
  spriteTessellationDetail: -1
  textureType: 8
  textureShape: 1
  singleChannelComponent: 0
  flipbookRows: 1
  flipbookColumns: 1
  maxTextureSizeSet: 0
  compressionQualitySet: 0
  textureFormatSet: 0
  ignorePngGamma: 0
  applyGammaDecoding: 0
  swizzle: 50462976
  cookieLightType: 0
  platformSettings:
  - serializedVersion: 4
    buildTarget: DefaultTexturePlatform
    maxTextureSize: ${maxTextureSize}
    resizeAlgorithm: 0
    textureFormat: -1
    textureCompression: 0
    compressionQuality: 50
    crunchedCompression: 0
    allowsAlphaSplitting: 0
    overridden: 0
    ignorePlatformSupport: 0
    androidETC2FallbackOverride: 0
    forceMaximumCompressionQuality_BC6H_BC7: 0
  spriteSheet:
    serializedVersion: 2
    sprites: []
    outline: []
    physicsShape: []
    bones: []
    spriteID: 
    internalID: 0
    vertices: []
    indices: 
    edges: []
    weights: []
  spritePackingTag: 
  pSDRemoveMatte: 0
  mipmapLimitGroupPrefix: 
  userData: 
  assetBundleName: 
  assetBundleVariant: 
`;
}
