# SunnyLand V3.1 Batch A Authoring Handoff

## Project
MetroForge / Forged

## Art Source
SunnyLand Forest by Ansimuz

## License
Creative Commons Zero v1.0 Universal (CC0 1.0)

## Objective
Author four missing player animations while preserving the existing SunnyLand character identity.

## Required Outputs

| File | Frames | Frame cell | Horizontal strip |
|---|---:|---:|---:|
| `walk.png` | 6 | 64x64 | 384x64 |
| `run.png` | 8 | 64x64 | 512x64 |
| `jump_start.png` | 3 | 64x64 | 192x64 |
| `land.png` | 3 | 64x64 | 192x64 |

## Format
- PNG with transparent background
- Horizontal frame strip
- Nearest-neighbor pixel-art treatment only
- No antialiasing, soft resampling, whole-sprite transforms, or V2 character art

## Character Requirements
Preserve the SunnyLand palette, character proportions, head design, clothing, outline treatment, limb proportions, pixel density, right-facing source convention, and visual scale.

## Grounding
Grounded poses use the documented normalized floor baseline, Y=63 with a tolerance of plus or minus one pixel.

## Transition Requirements
- Walk transitions naturally from idle.
- Run transitions naturally between walk and sustained run.
- Jump start transitions from idle/run into the accepted existing jump.
- Land transitions from the accepted fall into idle/run.

## Prohibited
Do not reuse skip as walk/run, duck as land, hurt as another action, or any V2 player art. Do not translate, rotate, or scale a static whole sprite to fake motion. Do not fabricate source provenance.