shader_type canvas_item;

uniform float sway_amp : hint_range(0.0, 12.0) = 4.0;
uniform float sway_speed : hint_range(0.2, 4.0) = 1.35;
uniform float phase : hint_range(0.0, 6.3) = 0.0;

void vertex() {
	// Hang from the top of the sprite; sway increases toward the free end.
	float along = UV.y;
	VERTEX.x += sin(TIME * sway_speed + phase) * sway_amp * along * along;
}
