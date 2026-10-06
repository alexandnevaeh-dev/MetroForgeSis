# Original Diver animation candidate

Original articulated geometry rendered through the native Godot NVIDIA path. These are nine fixed-scale strips containing 61 distinct poses, not independently generated diffusion frames. Source geometry, bake receipt, frame hashes and clip metadata are included.

Each frame is 64 by 96 pixels, displayed as 32 by 48 world pixels. All clips use the same bottom-center pivot at (32,96), fixed orthographic camera, palette and bone lengths. Grounded clips reach the visible foot line; jump and levitation poses intentionally lift the boots.

Status: isolated review candidate. `productionApproved=false`, `animationReady=false`, `completeCast=false`. Do not install this player alone into the default world. Matching enemies, boss, terrain, VFX and directional weapon aim still need production and visual review.

From the repository root, use the installed E: Node runtime with `scripts/verify-quantum-animation.mjs --record` to run contact/playback checks and record the real native test. The fixture uses the separately identified mine-wall reference, which is not approved final environment art.

To reproduce the source rather than reuse the packaged strips, run Godot with the prototype project, `--script res://tools/DiverRigBaker.gd`, and user arguments `--output=E:/fresh-native-output --clips=seed,idle,walk,run,attack,hit,death,jump,levitate,dash`. Then run `scripts/package-quantum-diver.py --source E:/fresh-native-output --output E:/fresh-candidate-output` with the installed E: Python runtime. Both commands require fresh output directories and retain source integrity checks.
