# SunnyLand Player V3.1 Rejection Report

## Status
`PLAYER_V3_1_STATUS = REJECTED`

## Final Verdict
**PLAYER V3.1 REJECTED — RETAIN V2 PLAYER**

## Verified Outcome
- SunnyLand Forest provenance and CC0 1.0 derivative rights were verified from the official creator-hosted itch.io license metadata.
- The preserved archive remains available at `original/Sunny-land-forest-files/`; its SHA-256 is `AAD985F40DCD1BA808B1CC9FD6C4FAC2D87F8F42B8BC4C8EB0E3EA59B54D9FF8`.
- The V3.1 authoring experiment identified a 27-state target list. The production V2 metadata contains 26 states, while `PlayerController.gd` additionally requests an optional `attack_3` clip and falls back to `attack` when that third combo sheet is absent.
- Four SunnyLand source states were acceptable after nearest-neighbor normalization: `idle`, `jump`, `fall`, and `hurt`.
- The remaining 23 states required genuine derivative pixel-art authoring.
- The procedural alias build was rejected because it substituted unrelated source poses and whole-sprite operations for authored state-specific animation.
- The external/generated Batch A work did not reach production quality. No incoming authored frames were accepted.

## Production Isolation
- No V3.1 artwork was accepted into the production player.
- `templates/godot-metroidvania/scenes/player/Player.tscn` remains the V2 production scene.
- The experimental V3.1 scene was removed after its rejected assets were archived.
- Enemies and bosses were not migrated.
- The V2 player remains the production visual baseline.

## Preserved Audit Material
The following remain preserved for provenance and future reference: `SOURCE.md`, the original archive copy, normalized V3 evaluation output, the rejected alias build, authoring references, Batch A handoff, validators, art status manifest, and review sheets. These materials are non-production and must not be wired into startup scenes, autoloads, levels, or export paths.