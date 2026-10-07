# Stormglass player cape candidate v3

Original generated player strips, copied byte-for-byte from E: development candidates. `manifest.json` records eleven PNG hashes and fourteen clips, including matching idle and run, with measured variable frame regions, uniform per-clip scale, and shared foot anchors. Runtime sampling uses clipped AtlasTexture regions; these PNGs have not been resampled. The v1 and v2 packs remain recoverable.

Selected automatically only by the explicit Godot Stormglass Gallery creation layout. Other unrepaired animation metadata remains intact. Top-down, Quantum, procedural, and external-pack-only creation do not select this pack.

This is an incomplete review candidate, not production-approved artwork or a complete matching player family. Remaining movement states, enemies, bosses, and NPCs still need coherent replacements. License/commercial provenance is recorded as unknown pending review. It is not attributed to a local NVIDIA run. Idle and run sources/prompts are in E:/MetroForgeData/Development/stormglass-player-idle-20261006-v1 and stormglass-player-run-20261006-v1, generated with the built-in image tool. Native run inputs played all eight source poses in both directions and restored idle. Fresh app generation run 1791319381664 selected all eleven PNGs with matching hashes and all fourteen measured clip source regions.

Admission fails on altered hashes, unsafe paths, duplicate assets, missing clips, out-of-bounds or overlapping regions, invalid scales/anchors, and a false production-ready flag. Run `node scripts/verify-stormglass-player-admission.mjs` from the repository to verify these contracts. Actual gameplay evidence remains separate from admission checks.
