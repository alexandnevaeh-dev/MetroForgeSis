# wall_jump

## Purpose
Wall brace, explosive push away, tucked travel, jump-compatible extension.

## Gameplay Timing
Visual readability window is approximately 0.18s.

## Target Frame Count
4

## Target FPS
14

## Loop / Non-Loop
Non-loop

## Starting Pose
Match the transition-in state while preserving the SunnyLand head, orange clothing, peach skin, dark outline, and 37x32-source proportions.

## Key Poses
Wall brace, explosive push away, tucked travel, jump-compatible extension.

## Ending Pose
Visual readability window is approximately 0.18s.

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
Visual readability window is approximately 0.18s.

## Transition Out
Visual readability window is approximately 0.18s.

## Do Not Use
Unrelated SunnyLand poses, a repeated single frame, whole-sprite transforms, softened resampling, or V2 art.

## Acceptance Criteria
Distinct action-specific pose sequence; crisp palette-constrained pixels; stable identity; valid 64x64 horizontal strip; no duplicate frames.

## Frame-by-Frame Plan
Frame 0: entry/readable setup; redraw limbs, torso and head for this pose, not the whole sprite.

Frame 1: anatomical in-between progressing the stated action; redraw limbs, torso and head for this pose, not the whole sprite.

Frame 2: anatomical in-between progressing the stated action; redraw limbs, torso and head for this pose, not the whole sprite.

Frame 3: transition-ready ending pose; redraw limbs, torso and head for this pose, not the whole sprite.
