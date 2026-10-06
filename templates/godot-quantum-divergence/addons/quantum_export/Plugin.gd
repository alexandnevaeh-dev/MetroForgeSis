@tool
extends EditorPlugin
const RawFiles = preload("res://addons/quantum_export/RawFiles.gd")
var exporter: EditorExportPlugin

func _enter_tree() -> void:
	exporter = RawFiles.new()
	add_export_plugin(exporter)

func _exit_tree() -> void:
	remove_export_plugin(exporter)
