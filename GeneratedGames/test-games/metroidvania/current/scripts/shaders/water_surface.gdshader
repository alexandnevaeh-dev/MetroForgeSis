shader_type canvas_item;

uniform vec4 deep_color : source_color = vec4(0.07, 0.16, 0.20, 0.72);
uniform vec4 foam_color : source_color = vec4(0.55, 0.82, 0.86, 0.85);
uniform float wave_speed : hint_range(0.1, 3.0) = 0.55;
uniform float foam_band : hint_range(0.02, 0.25) = 0.08;

void fragment() {
	float t = TIME * wave_speed;
	float wave = sin(UV.x * 28.0 + t * 2.4) * 0.012 + sin(UV.x * 11.0 - t) * 0.02;
	float foam = smoothstep(foam_band, 0.0, UV.y + wave);
	vec4 body = mix(deep_color, foam_color, foam * 0.65);
	float spark = step(0.82, sin(UV.x * 40.0 + t * 5.0 + UV.y * 8.0));
	body.rgb = mix(body.rgb, foam_color.rgb, spark * foam * 0.35);
	vec4 tex = texture(TEXTURE, UV + vec2(wave * 0.4, 0.0));
	COLOR = mix(tex, body, 0.72);
	COLOR.a = max(tex.a * 0.5, body.a);
}
