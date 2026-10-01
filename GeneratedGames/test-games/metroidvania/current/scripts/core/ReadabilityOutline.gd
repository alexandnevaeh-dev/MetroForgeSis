extends CanvasItem
## Optional 1px silhouette outline for player/enemy readability.

const SHADER_PATH := "res://scripts/shaders/sprite_outline.gdshader"
const PROFILE_PATH := "res://data/quality/install_readability_outline.json"

func _ready() -> void:
	if not FileAccess.file_exists(PROFILE_PATH):
		return
	if not ResourceLoader.exists(SHADER_PATH):
		return
	var shader: Shader = load(SHADER_PATH)
	if shader == null:
		return
	var mat := ShaderMaterial.new()
	mat.shader = shader
	material = mat
