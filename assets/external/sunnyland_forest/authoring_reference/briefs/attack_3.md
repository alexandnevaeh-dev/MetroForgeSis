# attack_3

## Purpose
Finisher: coiled startup, broad overhead/downward strike, largest reach, heavy follow-through, recovery.

## Gameplay Timing
Attack 2 combo entry; frame 2 is the visual hit.

## Target Frame Count
6

## Target FPS
18

## Loop / Non-Loop
Non-loop

## Starting Pose
Match the transition-in state while preserving the SunnyLand head, orange clothing, peach skin, dark outline, and 37x32-source proportions.

## Key Poses
Finisher: coiled startup, broad overhead/downward strike, largest reach, heavy follow-through, recovery.

## Ending Pose
Attack 2 combo entry; frame 2 is the visual hit.

## Silhouette Goal
Readable at the existing 64px cell presentation without changing character identity.

## Body Motion
Redraw torso lean/compression for each key pose; no whole-body translation, rotation, or scale animation.

## Head Motion
Maintain head size and face direction; aim or look toward the active force where applicable.

## Arm Motion
Use state-specific opposing arm, reach, brace, strike, or propulsion motion.

## Leg Motion
Use state-specific contacts, tuck, kick, brace, or collapse; do not reuse a static leg silhouette.

## Foot Contact
Grounded feet: Y=63 ±1. Airborne/water states: intentional lift only.

## Center-of-Mass Motion
Move through anatomical pose change, not by shifting a complete sprite cell.

## Expected Baseline
Grounded baseline at normalized Y=63 ±1.

## Transition In
Attack 2 combo entry; frame 2 is the visual hit.

## Transition Out
Attack 2 combo entry; frame 2 is the visual hit.

## Do Not Use
Unrelated SunnyLand poses, a repeated single frame, whole-sprite transforms, softened resampling, or V2 art.

## Acceptance Criteria
Distinct action-specific pose sequence; crisp palette-constrained pixels; stable identity; valid 64x64 horizontal strip; no duplicate frames.

## Frame-by-Frame Plan
Frame 0: entry/readable setup; redraw limbs, torso and head for this pose, not the whole sprite.

Frame 1: anatomical in-between progressing the stated action; redraw limbs, torso and head for this pose, not the whole sprite.

Frame 2: anatomical in-between progressing the stated action; redraw limbs, torso and head for this pose, not the whole sprite.

Frame 3: anatomical in-between progressing the stated action; redraw limbs, torso and head for this pose, not the whole sprite.

Frame 4: anatomical in-between progressing the stated action; redraw limbs, torso and head for this pose, not the whole sprite.

Frame 5: transition-ready ending pose; redraw limbs, torso and head for this pose, not the whole sprite.
