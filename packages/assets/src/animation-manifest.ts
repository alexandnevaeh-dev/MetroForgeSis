export type AnimationStateId =
  | 'idle'
  | 'run'
  | 'jump_start'
  | 'jump_rise'
  | 'fall'
  | 'land'
  | 'attack_anticipation'
  | 'attack_active'
  | 'attack_recovery'
  | 'hurt'
  | 'death'
  | 'dash'
  | 'wall_slide'
  | 'wall_jump'
  | 'ground_slam'
  | 'grapple'
  | 'swim'
  | 'phase';

export interface AnimationStateSpec {
  id: AnimationStateId;
  loop: boolean;
  /** Filename suffix for `<id>_<suffix>_pose.png` or dedicated sheet. */
  poseSuffix: string;
  sheetSuffix?: string;
  required: boolean;
}

export interface AnimationManifest {
  characterId: string;
  canonicalParentId: string;
  canonicalParentPath: string;
  fps: number;
  states: AnimationStateSpec[];
  generator: 'procedural-pose' | 'conditioned-image' | 'mixed';
}

const PLAYER_BASE: AnimationStateSpec[] = [
  { id: 'idle', loop: true, poseSuffix: 'idle', required: true },
  { id: 'run', loop: true, poseSuffix: 'run', required: true },
  { id: 'jump_start', loop: false, poseSuffix: 'jump_start', required: true },
  { id: 'jump_rise', loop: false, poseSuffix: 'jump', required: true },
  { id: 'fall', loop: false, poseSuffix: 'fall', required: true },
  { id: 'land', loop: false, poseSuffix: 'land', required: true },
  { id: 'attack_anticipation', loop: false, poseSuffix: 'attack', sheetSuffix: 'attack', required: true },
  { id: 'attack_active', loop: false, poseSuffix: 'attack', sheetSuffix: 'attack', required: true },
  { id: 'attack_recovery', loop: false, poseSuffix: 'attack', sheetSuffix: 'attack', required: true },
  { id: 'hurt', loop: false, poseSuffix: 'hurt', sheetSuffix: 'hurt', required: true },
  { id: 'death', loop: false, poseSuffix: 'death', sheetSuffix: 'death', required: true },
];

export function buildPlayerAnimationManifest(input: {
  abilities: string[];
  parentPath?: string;
  generator?: AnimationManifest['generator'];
}): AnimationManifest {
  const abilities = new Set(input.abilities);
  const states = [...PLAYER_BASE];
  if (abilities.has('dash') || abilities.has('air_dash')) {
    states.push({ id: 'dash', loop: false, poseSuffix: 'dash', required: true });
  }
  if (abilities.has('wall_slide')) {
    states.push({ id: 'wall_slide', loop: true, poseSuffix: 'wall_slide', required: true });
  }
  if (abilities.has('wall_jump')) {
    states.push({ id: 'wall_jump', loop: false, poseSuffix: 'wall_jump', required: true });
  }
  if (abilities.has('ground_slam')) {
    states.push({ id: 'ground_slam' as AnimationStateId, loop: false, poseSuffix: 'ground_slam', required: true });
  }
  if (abilities.has('grapple')) {
    states.push({ id: 'grapple' as AnimationStateId, loop: false, poseSuffix: 'grapple', required: true });
  }
  if (abilities.has('swim')) {
    states.push({ id: 'swim' as AnimationStateId, loop: false, poseSuffix: 'swim', required: true });
  }
  if (abilities.has('phase')) {
    states.push({ id: 'phase' as AnimationStateId, loop: false, poseSuffix: 'phase', required: true });
  }
  return {
    characterId: 'player',
    canonicalParentId: 'player',
    canonicalParentPath: input.parentPath ?? 'assets/characters/player.png',
    fps: 10,
    states,
    generator: input.generator ?? 'procedural-pose',
  };
}

export function poseNamesFromManifest(manifest: AnimationManifest): string[] {
  return [...new Set(manifest.states.map((s) => s.poseSuffix))];
}
