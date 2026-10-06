# Top-down combat and native-path evidence

All candidates and runtime artifacts below reside on E:. The canonical Git index remains unchanged. Stormglass side-view, the canonical sixteen-room canopy design, and the fresh five-room top-down generation fixture are distinct scopes. Artwork remains unapproved.

## Top-down runtime and fixture corrections

`E:/MetroForgeData/Development/topdown-combat-contract-20261005-v1/summary.json` records 35 passing native combat-contract checks and 14 rejected-damage checks. The latter reproduced ten failures before the player/enemy handler guards were applied. Invalid, protected, or dead-target contacts now preserve attack and recovery state; valid contacts still interrupt attacks and apply damage.

The old combat fixture allowed unrelated enemies to interfere, retained facing away from its target, assumed an obsolete hitbox offset, and attempted respawn without a world manager. Each case now has isolated actors. Attack startup/active/recovery are observed after physics processing; movement is measured at settled speed. Checkpoint respawn loads the actual world and verifies a newly instantiated living player with the saved health.

The fresh generated route reached victory through five rooms with four transitions and 21 attacks, finishing the boss fight at 90 HP. Its existing bot resets health before the boss. This proves route and boss functionality, not difficulty balance or a full sixteen-room canopy campaign. See `campaign-telemetry.json` alongside the summary.

`E:/MetroForgeData/Development/topdown-hd2d-visibility-20261005-v1/summary.json` records 29 passing native checks. Actor, label, and warning mirrors now inherit visibility and tint from the authoritative 2D hierarchy, while excluding the intentionally hidden 2D area root from visibility suppression. The baseline failed parent visibility and tint. Animation frames, ground anchors, room rebuilding, and discarded-effect cleanup remain verified. ObjectDB shutdown warnings and a sandbox certificate-store diagnostic remain open.

## Fresh engine validation

`E:/MetroForgeData/Development/unity-fresh-source-20261005-v1/summary.json` describes a fresh 40-room Stormglass export. Unity 6000.3.0f1 compiled it, passed animation/solid/sprite-grid validators, and built a Windows Mono player with zero build errors. Source binding covers 4,226 unchanged authored inputs. The initial successful player build was correctly rejected because its target backend setting changed during the build; the rejected binary and manifest are preserved. The wrapper now prepares that required Mono setting before hashing and retains the unchanged-input guard.

The native Unity route failed at room_029 after visiting 27 rooms, with zero runtime exceptions. That room has a required downward exit gated by ground_slam. The player collects the ability in room_023, but the Unity controller has no ground-slam movement implementation and the driver currently only handles forward and upward exits. Full Unity campaign acceptance remains incomplete; implement the mechanic and input-driven descent before rerunning the route. Native proof: `reports/game-tests/20261003-unity-route/run-1791210846746/proof.json`.

`E:/MetroForgeData/Development/unreal-fresh-source-20261005-v1/summary.json` records successful source assembly from the same side-view candidate, with 40 rooms and 660 PNG/JSON assets. Native C++ compilation is not accepted. The isolated host first exposed an engine-root resolution failure, then a missing native dependency manifest. With the original dependency manifest retained, Windows Application Control blocked the generated host assembly (0x800711C7). Do not bypass that policy. Unreal gameplay and packaging remain unverified; the installed engine is unchanged.

## Local NVIDIA and publication

`E:/MetroForgeData/Development/local-nvidia-20261005-v2/` retains bounded worker timeouts and DLL-loading traces. PyTorch DLL loading continues but exceeds the short health deadlines; inference is not proved by those traces or the NVIDIA renderer. A separate extended worker validation uses the installed SDXL model, offline mode, E: caches, a 600-second health deadline, and a 600-second generation deadline. The extended run completed: health passed in 228.61 seconds; actual CUDA generation passed in 394.73 seconds with cached SDXL, 512x512, 20 steps, seed 9302026, and no model download. The inspected castle study has unsuitable perspective and an opaque blue arch; it is not admitted as production art.

An approved remote read and push dry run succeeded. Three reviewed validation files were uploaded on metroforge-native-validation-20261005 at commit 447fb9219a7e93ae1eb4f652a1387b80c6c8d7fa, then verified with git ls-remote. The snapshot uses remote base b747befa2e4505d622ad85ed377106ffc1ba4146 in a separate E: object database. Canonical local HEAD remains 1ea87a73976671d222f61f57f41b3b72e306937a, and its index hash is unchanged. This is a scoped validation publication; the broader gameplay and UI changes remain pending dependency review.

Unity ground slam and input-driven downward navigation have now been implemented in the isolated unity-ground-slam-20261005-v1 candidate. Native compilation and source-bound Windows build passed; its visible 600-second route test is running in reports/game-tests/20261003-unity-route/run-1791212557863. Full-route acceptance remains pending its actual result.

