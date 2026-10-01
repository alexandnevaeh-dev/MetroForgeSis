# Quantum art production and review

Updated 2026-10-01. This is the separate Quantum Divergence candidate pipeline. It does not replace the woodland top-down or Stormglass Metroidvania assets, and no candidate has been admitted into the playable Quantum world.

## Local NVIDIA path

The installed SDXL base runs on the RTX 5060 Laptop GPU with model CPU offload. Tested runtime: Python 3.12, torch 2.7.1+cu128, diffusers 0.31.0, transformers 4.46.3 and optional peft 0.14.0. These are the verified local versions, not a claim that every newer combination in the general worker requirements was tested.

`install-quantum-style.py` acquires Pixel Art XL from `nerijs/pixel-art-xl` at revision `8bf4a4d9ea283e00a51fafda8e0539f8248ea037`. It verifies the published SHA256 `4234637cb80c998f41e348e6a6cb6bc20d8d038b2b0f256b6129b3b5e353eef7` and 170,543,052 bytes. The pinned card declares CreativeML Open RAIL-M; the base model retains its separate Open RAIL++-M license. Model weights and cards stay under E:/MetroForgeData/Models and the installed base model remains in E:/Metroforge/Recovery-Audit/models/sdxl-base-1.0.

The worker accepts an optional `local_style_adapter` containing an absolute local safetensors path, its SHA256 and a finite scale in (0,2]. On Windows the resolved file must be on E:. The worker verifies the actual bytes, loads only local weights before offload, and separates ordinary, styled and different-strength pipeline caches. Existing requests without this option retain their previous path. ControlNet/IP-Adapter composition and OpenVINO with this option explicitly fail instead of dropping the adapter. The returned receipt identifies the adapter that actually ran.

`produce-quantum-art.py` reuses the installed pipeline within a batch, preserves prompt-budget evidence, and writes raw PNGs, requests, logs, timing and actual-device receipts into a fresh E: directory. It refuses overflowed prompts, missing models and non-CUDA results. It never marks an image production approved. First generation includes substantial loading overhead; warm v3 jobs took approximately 10–21 seconds. This is generator timing, not game frame-rate evidence.

## Isolation and normalization

`install-quantum-matte.py` acquires the existing worker's U2-Net weights from `Carve/u2net-universal` at revision `10305d785481cf4b2eee1d447c39cd6e5f43d74b`, with SHA256 `10025a17f49cd3208afc342b589890e402ee63123d6f2d289a4a0903695cce58` and 176,290,937 bytes. The pinned card declares Apache-2.0. `isolate-quantum-art.py` validates those bytes and unchanged CUDA source receipts, then runs the existing `foreground_isolation.py` with its weights-only checkpoint loading. It retains soft alpha PNGs and actual CUDA isolation receipts. Installation does not change .env or global user configuration.

`prepare-quantum-art.py` requires visual decisions tied to each selected source hash. Rejected or changed sources fail before publishing any candidate files. Normalization validates receipt/dimensions/checksums, thresholds verified alpha, rejects insufficient isolation or clipped bounds, uses nearest sampling, and aligns a single still to the actor's feet or center. A separate wall batch must have its own unchanged Quantum CUDA receipt. Candidate packs retain raw sources, reviews, model cards, provenance and hashes. A one-frame seed remains one frame: it is never duplicated into fake animations.

## Visual findings and current limit

| Batch | Result |
| --- | --- |
| v1 | Diver was an abstract pattern; rejected. Interior retained only as a machinery reference. |
| v2 | Recognizable designs, but incorrect views, painted backgrounds, clipped Wraith, two Drillers without a drill, and perspective corridor. No production admission. |
| v3, Pixel Art XL 0.85 | Improved pixel detail. Right-profile Diver B and a cyan/violet mine hall retained for a **static technical review**. Other actor sources rejected for view, silhouette, clipping or duplicate bodies. |
| v4, Pixel Art XL 0.70 | Stronger sprite wording caused unwanted sprite sheets for Diver, Wraith and Driller; Skitter and Golem still faced the camera. All actor sources rejected. |

The v3 review pack contains only a Diver still and mine wall; `completeCast=false`, `productionApproved=false`, `animationReady=false`. The source's small flag patch, visor/palette differences and painted foot-shadow residue need revision. U2-Net isolation and a bottom alpha anchor do **not** establish that the visible boot, rather than a painted shadow, makes perfect contact. This seed is not approved to anchor production animation strips. The native static review checks geometry and provenance; visual approval remains a separate failed/pending gate.

The wall review crops an integer 2x region to keep pixels crisp. The lower source floor band does not become collision terrain. The current playable world continues to use its existing diagnostic presentation until a complete matching cast and terrain set are reviewed together.

## Verified checks

- 16 adapter admission/cache checks: actual installed digest, invalid paths/hashes/strengths, no implicit loading and explicit local activation.
- 16 worker regression tests: conditioning branches (five subcases within one test), placement/offload and prompt/OpenVINO response behavior. Most inference is mocked in these tests; real v3/v4 CUDA receipts provide separate inference evidence.
- 2 real normalization rejection checks: a visually rejected source and a mismatched review hash, with no output pack created.
- 10 native static review checks: dimensions, alpha clearance, numeric foot pivot, wall dimensions, selected actor anchors, set separation, integrity, honest one-frame status, collision-floor contact and rendered alpha-foot alignment. Actual RTX OpenGL viewport capture at 60 ticks.

An initial native run failed the foot-pivot comparison because Godot JSON numbers were compared against an integer array. The fixed check compares numeric vectors. The failed screenshot/report is retained; the successful rerun does not erase it.

Repeat verification from the repository with the E: Node runtime:

```powershell
& 'E:\MetroForgeData\Node\node-v22.19.0-win-x64\node.exe' scripts\verify-quantum-art.mjs --candidate=E:/MetroForgeData/ArtProduction/quantum-static-review-v3-20261001
```

The evidence is in reports/game-tests/20261001-quantum-divergence/art-latest.json; larger source batches remain in E:/MetroForgeData/ArtProduction. No final animation, whole-world visual replacement or MetroForge app generation is proven by this review. Next: obtain a clean production seed and matching side-view enemies, then generate complete reference-guided strips, normalize shared scale/anchors, and review every required state in the actual game before admission.

Primary model sources: [Pixel Art XL](https://huggingface.co/nerijs/pixel-art-xl), [U2-Net weights](https://huggingface.co/Carve/u2net-universal), [U2-Net architecture](https://github.com/xuebinqin/U-2-Net).

## Original rig and movement contact, 2026-10-01

The newer Diver candidate uses original articulated geometry instead of the rejected diffusion actor seeds. `DiverRigBaker.gd` renders one source through a fixed transparent orthographic viewport on the NVIDIA GPU. Armor bevels, panels, visor, backpack, scanner and joint poses share the same materials, camera and scale. Joint reach and bone lengths are checked while baking; a bad pose or clipped frame fails the bake instead of producing an approved receipt. Failed v3/v4 bakes remain on E:.

The successful v5 bake contains all 61 distinct poses across idle, walk, run, attack, hit, death, jump, levitation and dash. `package-quantum-diver.py` checks the source scene, script and frame hashes, RGBA bounds, unique poses, complete clip counts and common foot projection before publishing strips. The isolated candidate is under `prototypes/quantum-divergence/assets/diver-candidate-v1`; all production/full-cast flags remain false. The mine-wall image is explicitly a separate unapproved reference backdrop.

Native playback exposed a movement bug: one-pixel collision stepping could stop feet short of a material face, while the one-pixel floor probe declared the actor grounded. `MaterialContact.gd` now resolves the remaining attempted step to the exact blocking face, requires complete-body clearance, and accepts floor support only at actual contact. Player, Skitter, Driller and Golem use the shared bounds; the Wraith keeps its intentional floating center pivot. No sprite offset, expanded tolerance or movement buff hides the problem.

`ContactTests.gd` reproduced 18 failures before the fix and passes 22 checks after it. Cases include twenty repeated jumps, subpixel falling, single-cell ledges, fluid, ceiling and both wall directions, maximum fall speed, large-world coordinates and all grounded actor families. `SpriteClipTests.gd` covers 18 state/cadence/interruption/repeated-attack/death checks. The native nine-state review covers ten additional integrity/playback/contact gates with actual movement, three Photon windups, hit and death events, and an inspectable viewport recording. These are technical candidate checks, not final visual approval or MetroForge app generation.

Run `scripts/verify-quantum-animation.mjs --record` with the E: Node runtime. It captures both output streams, rejects native script failures, hashes the source/candidate/background, records on E:, and decodes the finished MP4. Results are retained under `reports/game-tests/20261001-quantum-divergence/diver-animation-latest.json`. The full-size world and save verifiers also include the new contact source in their proof hashes.

Two benign hosted NVIDIA FLUX seed requests returned `CONTENT_FILTERED` without images; that route did not yield an approved source. Blender 4.5.14's official portable archive and executable signature were verified on E:, but Windows Code Integrity blocked `shaderc_shared.dll` before Blender could run. Security policy was not modified. The working Godot geometry renderer provided the original candidate; neither a successful Blender bake nor final complete cast is claimed.

## Matching articulated cast candidates, 2026-10-01

`QuantumActorBaker.gd` adds original Skitter, Driller, Wraith and Probability Golem geometry using the unchanged Diver mesh helpers, palette, lighting and camera pixel density. The crawler chassis has jointed contact claws, sealed armor and sensor optics; the Driller adds a helical motor-driven cone. The Wraith is a deliberately levitating core and suspended armor fragments. The larger Golem has articulated armor, a guarded core and separate slam, burst and roar strips. Its slam fist reaches the floor on the active segment, and death folds the body farther onto the ground while energy systems dim.

The v5 raw bakes are retained on E:. The reviewed package lives in `assets/cast-candidate-v2`: 231 source frames across 29 clips, with 203 distinct images across the complete set. Every clip contains its required number of distinct images; expected cross-clip aliases, such as generic Golem attack/slam, are not counted as new globally unique poses. Fixed dimensions are 64x64 Skitter, 96x64 Driller, 64x96 Wraith and 128x192 Golem, at half-size logical dimensions. Grounded actors share exact bottom-center anchors; Wraith uses its center anchor. Frame/source hashes, original scene geometry, alpha bounds and complete contracts are checked before any output pack is written. Earlier incorrect glow, repeated-pose and unreachable-joint attempts remain recoverable, not promoted as accepted source.

`EnemyClipBinding.gd` reads the real enemy state and phase clocks without changing collision, damage, movement or projectile timing. Golem strips divide into anticipation/active/recovery windows; slam frame 6 is selected when the actual slam activates. Skitter uses its run strip during the active dash; Driller uses its drill strip; the Wraith reaches its terminal firing pose at the real shot event. Hit interruptions resume the existing attack phase, and death never wraps.

`verify-quantum-cast.mjs --record` runs 23 actual-simulation interruption/death checks, 43 existing enemy behavior checks, 22 contact checks and 18 shared clip checks (106 total), followed by 21 native cast-review gates. The fixture exercises 2472 ticks, all six core states for each family, every source frame, all three Golem attacks, 1854 exact grounded contacts and intentional Wraith levitation. Fourteen screenshots and a fully decoded 60 FPS native recording accompany source and asset hashes under `reports/game-tests/20261001-quantum-divergence/cast-animation-latest.json`.

These are controlled native AI fixtures with explicit stage resets, not a complete game generated through MetroForge. The technical candidate review does not establish final art approval, Wraith teleport, a coherent finished environment or stable 60 FPS gameplay. Candidate/animation/complete-cast approval flags remain false; the default world's diagnostic graphics remain until the matching environment and full visual admission are ready. The top-down and Stormglass sets remain separate.
