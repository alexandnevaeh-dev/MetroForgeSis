shader_type canvas_item;
render_mode unshaded;
uniform vec2 region_size = vec2(16384.0, 6144.0);
uniform bool use_authored_texture = false;
uniform sampler2D facade_texture : source_color, repeat_enable, filter_nearest;
varying vec2 masonry_world;

void vertex() {
    masonry_world = (MODEL_MATRIX * vec4(VERTEX, 0.0, 1.0)).xy;
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void fragment() {
    vec2 world = masonry_world;
    if (use_authored_texture) {
        vec4 surface = texture(facade_texture, world / 256.0);
        COLOR = vec4(surface.rgb * vec3(0.31, 0.34, 0.39), surface.a);
    } else {
    // Original local material courses at fixed world scale, not copied scene plates.
    vec2 cell = world / vec2(64.0, 32.0);
    cell.x += mod(floor(cell.y), 2.0) * 0.5;
    vec2 edge = fract(cell);
    float stone = hash(floor(cell));
    float mortar = step(0.035, edge.x) * step(0.07, edge.y);
    float bevel = (1.0 - step(0.11, edge.y)) * 0.024;
    float pore = hash(floor(world / 2.0)) * 0.013;
    vec3 base = mix(vec3(0.038, 0.061, 0.084), vec3(0.086, 0.119, 0.151), stone);
    COLOR = vec4(mix(vec3(0.026, 0.038, 0.052), base + bevel - pore, mortar), 1.0);
    }
}
