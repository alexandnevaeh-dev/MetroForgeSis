# swim

## Purpose
Horizontal propulsion: reaching arm, pull, kick, glide, opposite reach, opposite pull.

## Gameplay Timing
Water locomotion; use floating baseline, not ground foot contacts.

## Target Frame Count
6

## Target FPS
10

## Loop / Non-Loop
Loop

## Starting Pose
Match the transition-in state while preserving the SunnyLand head, orange clothing, peach skin, dark outline, and 37x32-source proportions.

## Key Poses
Horizontal propulsion: reaching arm, pull, kick, glide, opposite reach, opposite pull.

## Ending Pose
Water locomotion; use floating baseline, not ground foot contacts.

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
Water locomotion; use floating baseline, not ground foot contacts.

## Transition Out
Water locomotion; use floating baseline, not ground foot contacts.

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
