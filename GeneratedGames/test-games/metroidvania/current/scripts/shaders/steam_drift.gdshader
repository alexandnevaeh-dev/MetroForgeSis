shader_type canvas_item;

uniform float drift : hint_range(0.0, 2.0) = 0.35;

void vertex() {
	VERTEX.x += sin(TIME * 1.1 + VERTEX.y * 0.08) * drift;
	VERTEX.y += sin(TIME * 0.7) * drift * 0.4;
}
