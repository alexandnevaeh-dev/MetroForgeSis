import { spawnSync } from 'node:child_process';

export function isPngBuffer(buf: Buffer): boolean {
  return buf.length >= 8 && buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG';
}

export function isJpegBuffer(buf: Buffer): boolean {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

/**
 * Normalizes provider output to PNG. Several providers (NVIDIA hosted, Pollinations depending on
 * model) may return JPEG — everything downstream (decodePngRgba, PixelArtProcessor, the visual-
 * enhancement validator) only decodes PNG. Shells out to Pillow rather than adding a JPEG decoder
 * dependency, matching the pattern nvidia-image-edit.ts already established.
 */
export function ensurePngBuffer(image: Buffer, pythonPath = process.env.DIFFUSERS_PYTHON ?? 'python'): Buffer {
  if (isPngBuffer(image)) return image;
  if (!isJpegBuffer(image)) {
    throw new Error('Image bytes are neither PNG nor JPEG — cannot normalize');
  }
  const script = [
    'import sys,io',
    'from PIL import Image',
    'img=Image.open(io.BytesIO(sys.stdin.buffer.read())).convert("RGBA")',
    'out=io.BytesIO()',
    'img.save(out, format="PNG")',
    'sys.stdout.buffer.write(out.getvalue())',
  ].join('; ');
  const result = spawnSync(pythonPath, ['-c', script], {
    input: image,
    maxBuffer: 32 * 1024 * 1024,
    encoding: 'buffer',
  });
  if (result.status !== 0 || !isPngBuffer(result.stdout as Buffer)) {
    throw new Error('JPEG->PNG conversion failed (Pillow unavailable or conversion error)');
  }
  return result.stdout as Buffer;
}
