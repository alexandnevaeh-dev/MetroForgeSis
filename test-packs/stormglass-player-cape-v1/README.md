# Stormglass player cape candidate

Original generated player strips, copied byte-for-byte from the E: development candidate. `manifest.json` records nine PNG hashes and twelve clips with measured variable frame regions, uniform per-clip scale, and shared foot anchors. Runtime sampling uses clipped AtlasTexture regions; these PNGs have not been resampled.

Selected automatically only by the explicit Godot Stormglass Gallery creation layout. Existing idle, run, and other animation metadata remains intact. Top-down, Quantum, procedural, and external-pack-only creation do not select this pack.

This is an incomplete review candidate, not production-approved artwork or a complete matching player family. Idle/run and remaining movement states, enemies, bosses, and NPCs still need coherent replacements. License/commercial provenance is recorded as unknown pending review. It is not attributed to a local NVIDIA run.

Admission fails on altered hashes, unsafe paths, duplicate assets, missing clips, out-of-bounds or overlapping regions, invalid scales/anchors, and a false production-ready flag. Run `node scripts/verify-stormglass-player-admission.mjs` from the repository to verify these contracts. Actual gameplay evidence remains separate from admission checks.
