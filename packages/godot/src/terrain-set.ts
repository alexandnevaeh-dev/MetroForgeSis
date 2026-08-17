export function compileGodotTerrainSet(opts: {
  biomeId: string;
  texturePath: string;
  tileSize: number;
  roles: Record<string, { col: number; row: number }>;
}): string {
  const lines: string[] = [
    '[gd_resource type="TileSet" format=3]',
    '',
    `[ext_resource type="Texture2D" path="res://${opts.texturePath.replace(/\\/g, '/')}" id="1_atlas"]`,
    '',
    '[sub_resource type="TileSetAtlasSource" id="Atlas_0"]',
    'texture = ExtResource("1_atlas")',
    `texture_region_size = Vector2i(${opts.tileSize}, ${opts.tileSize})`,
  ];
  for (const pos of Object.values(opts.roles)) {
    lines.push(`0:${pos.col}/${pos.row} = 0`);
  }
  lines.push('');
  lines.push('[resource]');
  lines.push(`tile_size = Vector2i(${opts.tileSize}, ${opts.tileSize})`);
  lines.push('terrain_set_0/mode = 0');
  lines.push('terrain_set_0/terrain_0/name = "masonry"');
  lines.push('terrain_set_0/terrain_0/color = Color(0.35, 0.42, 0.4, 1)');
  lines.push('terrain_set_0/terrain_1/name = "platform"');
  lines.push('terrain_set_0/terrain_1/color = Color(0.55, 0.48, 0.32, 1)');
  lines.push('terrain_set_0/terrain_2/name = "hazard"');
  lines.push('terrain_set_0/terrain_2/color = Color(0.7, 0.25, 0.22, 1)');
  lines.push('terrain_set_0/terrain_3/name = "breakable"');
  lines.push('terrain_set_0/terrain_3/color = Color(0.5, 0.5, 0.45, 1)');
  lines.push('sources/0 = SubResource("Atlas_0")');
  lines.push(`; biome=${opts.biomeId} roles=${Object.keys(opts.roles).length}`);
  return `${lines.join('\n')}\n`;
}
