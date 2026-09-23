/** Pose guidance, not runtime timings. Keep gameplay events in the canonical clip metadata.
 * See docs/METROIDVANIA_DESIGN_STUDY.md for the animation review contract.
 */
export function animationPoseGuidance(state?: string): string {
  const common = 'full body inside frame, stable canvas anchor, consistent proportions and equipment';
  if (!state || state === 'idle') return common + ', balanced stance on ground baseline, subtle breathing and head balance';
  const motion = 'articulated shoulders elbows hips knees and head';
  const poses: Record<string, string> = {
    walk: 'opposing arm and leg swing, weight transfer through planted foot, relaxed torso counter-rotation',
    run: 'forward torso lean, stronger arm drive, clear contact and flight poses, trailing cloth',
    jump_start: 'brief hip and knee compression then extension, arms assist takeoff',
    jump: 'airborne tucked legs, arms balancing torso, no planted feet',
    fall: 'airborne descending pose, limbs preparing for landing, cloth follows descent',
    land: 'feet contact first, knees and hips absorb weight, torso settles with head balance',
    dash: 'directional full-body extension, compact readable silhouette, trailing cloth',
    wall_slide: 'contact-side hand and foot brace the wall, controlled descending posture',
    wall_jump: 'contact leg pushes off wall, hips and chest turn into launch, arms counterbalance',
    swim: 'coordinated arm stroke and leg kick, buoyant torso, drifting cloth',
    hurt: 'localized recoil through torso and head, limbs react while silhouette remains recognizable',
    death: 'loss of support followed by body weight settling, no rigid whole-body sinking',
  };
  const action = state.startsWith('attack')
    ? 'weapon motion driven by hips shoulder elbow and wrist, distinct anticipation strike and recovery poses, stable grip'
    : poses[state] ?? 'pose appropriate to action, clear weight shift';
  return [common, motion, action].join(', ');
}
