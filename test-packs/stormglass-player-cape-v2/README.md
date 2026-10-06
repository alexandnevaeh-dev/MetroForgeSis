# Stormglass player cape candidate v2

Original generated player strips, copied byte-for-byte from E: development candidates. `manifest.json` records ten PNG hashes and thirteen clips, including the new matching idle, with measured variable frame regions, uniform per-clip scale, and shared foot anchors. Runtime sampling uses clipped AtlasTexture regions; these PNGs have not been resampled. The v1 pack remains recoverable.

Selected automatically only by the explicit Godot Stormglass Gallery creation layout. Existing run and other unrepaired animation metadata remains intact. Top-down, Quantum, procedural, and external-pack-only creation do not select this pack.

This is an incomplete review candidate, not production-approved artwork or a complete matching player family. Run and remaining movement states, enemies, bosses, and NPCs still need coherent replacements. License/commercial provenance is recorded as unknown pending review. It is not attributed to a local NVIDIA run. Idle source and prompt: E:/MetroForgeData/Development/stormglass-player-idle-20261006-v1, generated with the built-in image tool. Native idle checks passed11cases; fresh actual-app generation of v2 remains pending.

Admission fails on altered hashes, unsafe paths, duplicate assets, missing clips, out-of-bounds or overlapping regions, invalid scales/anchors, and a false production-ready flag. Run `node scripts/verify-stormglass-player-admission.mjs` from the repository to verify these contracts. Actual gameplay evidence remains separate from admission checks.
