import { writeFileSync } from 'node:fs';

/** Pixel-art Godot 4 texture import: nearest, no mipmaps, lossless. */
export function pixelArtImportFile(sourceRel: string): string {
  const resPath = sourceRel.replace(/\\/g, '/').replace(/^\/+/, '');
  return `[remap]

importer="texture"
type="CompressedTexture2D"
uid="uid://mf_${hashUid(resPath)}"
path="res://.godot/imported/_pending.ctex"
metadata={
"vram_texture": false
}

[deps]

source_file="res://${resPath}"
dest_files=["res://.godot/imported/_pending.ctex"]

[params]

compress/mode=0
compress/high_quality=false
compress/lossy_quality=0.7
compress/uastc_level=0
compress/rdo_quality_loss=0.0
compress/hdr_compression=1
compress/normal_map=0
compress/channel_pack=0
mipmaps/generate=false
mipmaps/limit=-1
roughness/mode=0
roughness/src_normal=""
process/fix_alpha_border=false
process/premult_alpha=false
process/size_limit=0
detect_3d/compress_to=0
`;
}

function hashUid(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function writePixelArtImport(fullPngPath: string, sourceRel: string): void {
  writeFileSync(`${fullPngPath}.import`, pixelArtImportFile(sourceRel));
}
