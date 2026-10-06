import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { validateTopDownProps } from './topdown-area-edit.js';

/** Only authored assets are offered for placement; never infer collision from an image. */
export function readTopDownPropAsset(projectPath: string, assetPath: string): { image: string; layout: Record<string, unknown> } | null {
  if (!assetPath.startsWith('assets/') || !assetPath.endsWith('.png') || assetPath.includes('..') || /[\\:]/.test(assetPath)) throw new Error('Invalid prop asset path');
  const root = realpathSync(projectPath);
  const contained = (path: string) => {
    const rel = relative(root, realpathSync(path));
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Prop asset escapes project');
    return path;
  };
  const imagePath = join(root, assetPath);
  const metadataPath = imagePath.replace(/\.png$/, '.prop.json');
  if (!existsSync(metadataPath)) return null;
  contained(metadataPath);
  if (statSync(metadataPath).size > 262144) throw new Error('Prop layout metadata is too large');
  const layout = JSON.parse(readFileSync(metadataPath, 'utf8')) as Record<string, unknown>;
  const image = `res://${assetPath}`;
  validateTopDownProps([{id:'asset-validation',image,x:0,y:0,layout}]);
  const size = layout.sourceSize as [number, number];
  const validateImage = (path: string) => {
    const png = readFileSync(contained(path));
    if (png.length < 24 || png.subarray(0,8).toString('hex') !== '89504e470d0a1a0a' || png.toString('ascii',12,16) !== 'IHDR') throw new Error('Prop image is not a PNG');
    if (png.readUInt32BE(16) !== size[0] || png.readUInt32BE(20) !== size[1]) throw new Error('Prop image dimensions do not match its layout');
  };
  validateImage(imagePath);
  for (const layer of (layout.layers ?? []) as Array<{image:string}>) validateImage(join(dirname(imagePath), layer.image));
  return { image, layout: structuredClone(layout) };
}
