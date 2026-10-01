shader_type canvas_item;

uniform vec4 outline_color : source_color = vec4(0.96, 0.94, 0.88, 0.7);
uniform float outline_width : hint_range(0.0, 2.0) = 1.0;

void fragment() {
	vec4 col = texture(TEXTURE, UV);
	vec2 px = TEXTURE_PIXEL_SIZE * outline_width;
	float ring = 0.0;
	ring += texture(TEXTURE, UV + vec2(px.x, 0.0)).a;
	ring += texture(TEXTURE, UV + vec2(-px.x, 0.0)).a;
	ring += texture(TEXTURE, UV + vec2(0.0, px.y)).a;
	ring += texture(TEXTURE, UV + vec2(0.0, -px.y)).a;
	if (col.a > 0.18) {
		COLOR = col;
	} else if (ring > 0.18) {
		COLOR = outline_color;
	} else {
		COLOR = col;
	}
}
