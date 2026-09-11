/** Godot 4 StyleBoxTexture so generated UI PNGs are 9-slice ready without the editor. */
export function compileStyleBoxTexture(opts: {
  texturePath: string;
  margin?: number;
}): string {
  const margin = opts.margin ?? 4;
  const res = opts.texturePath.replace(/\\/g, '/').replace(/^\/+/, '');
  return `[gd_resource type="StyleBoxTexture" format=3]

[ext_resource type="Texture2D" path="res://${res}" id="1_tex"]

[resource]
texture = ExtResource("1_tex")
texture_margin_left = ${margin}
texture_margin_top = ${margin}
texture_margin_right = ${margin}
texture_margin_bottom = ${margin}
`;
}
