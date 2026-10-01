shader_type canvas_item;
/// Discard NVIDIA registration leftovers that still composite under the feet
/// after studio knockout. Only the contact band so eyes/weapon glow stay.
/// Godot fragment processors cannot `return`; assign COLOR instead.

void fragment() {
	vec4 col = texture(TEXTURE, UV);
	COLOR = col;
	if (UV.y > 0.62 && col.a > 0.12) {
		vec3 c = col.rgb;
		float pale = min(min(c.r, c.g), c.b);
		float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
		bool red_tick = c.r > 0.62 && c.g < 0.48 && c.b < 0.55;
		bool mag = c.r > 0.55 && c.b > 0.55 && c.g < 0.48;
		bool stitch = pale > 0.78 || (lum > 0.82 && abs(c.r - c.g) < 0.14);
		if (red_tick || mag || stitch) {
			COLOR = vec4(0.0);
		}
	}
}
