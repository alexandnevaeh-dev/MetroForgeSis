# Native authored-prop integration regression

Copy the current godot-topdown-adventure template into an isolated E: test directory, then copy these two files into its root. Run Godot 4.6 headlessly against res://integration-check.tscn under that project. Use the normal scene path rather than --script: the real manager depends on normal autoload initialization. Redirect temporary/cache/user data to E: using the project's established validation environment.

The scene writes integration-result.json and exits nonzero on failed assertions. A deliberately invalid authored scale produces one expected warning. The checks cover unchanged legacy position/anchor/footprint, authored position/scale/two footprints, and rejection without unsafe fallback. They do not validate desktop IPC, generation placement, under-arch occlusion or final artwork.
