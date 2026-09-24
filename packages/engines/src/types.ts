/** Engine-neutral playable IR. Coordinates are Godot 2D pixels (origin top-left, +Y down). */

export interface GameplayRect {
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GameplaySpriteClip {
  ownerId: string;
  clip: string;
  relativePath: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  /** Unity sprite pixels per world unit; omitted or invalid values use 1. */
  pixelsPerUnit?: number;
  /** Unity bilinear filtering for painted sprites; defaults to point filtering. */
  smoothFiltering?: boolean;
  fps: number;
  loop: boolean;
  /** Normalized pivot. Characters use bottom-center (0.5, 0). */
  pivotX: number;
  pivotY: number;
}

export interface GameplayDoor {
  direction: 'left' | 'right' | 'up' | 'down';
  targetRoomId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  spawnSide: string;
  requirements: string[];
  optional: boolean;
}

export interface GameplayGate {
  requiredAbility: string;
  x: number;
  y: number;
  width: number;
  height: number;
  targetRoomId: string;
}

export interface GameplayActor {
  id: string;
  x: number;
  y: number;
  health?: number;
  damage?: number;
  movement?: string;
  combat?: string;
  /** Unity melee timings in seconds. Other engines may not consume these yet. */
  attackWindupSeconds?: number;
  attackRecoverySeconds?: number;
  attackCooldownSeconds?: number;
}

export interface GameplayBackgrounds {
  farCameraRelative?: boolean;
  farParallax?: number;
  far?: string;
  mid?: string;
  near?: string;
  foreground?: string;
}

export interface GameplayRoom {
  id: string;
  index: number;
  width: number;
  height: number;
  biomeId: string;
  archetype: string;
  tileSize: number;
  floorTop: number;
  spawnX: number;
  spawnY: number;
  solids: GameplayRect[];
  doors: GameplayDoor[];
  gates: GameplayGate[];
  enemy?: GameplayActor;
  abilityPickup?: GameplayActor;
  abilityPickups?: GameplayActor[];
  /** Authored grapple anchor positions in room coordinates. */
  grappleAnchors?: Array<{ x: number; y: number }>;
  checkpoint?: { x: number; y: number };
  victory: boolean;
  backgrounds: GameplayBackgrounds;
}

export interface GameplayCombat {
  attackDamage: number;
  invulnerableSeconds: number;
  hitboxSeconds: number;
  comboWindowMul: number;
  cooldownMul: number;
  maxHealth?: number;
}

export interface GameplayPack {
  version: '1';
  title: string;
  seed: number;
  tileSize: number;
  resolution: { width: number; height: number };
  startRoomId: string;
  victoryRoomId: string;
  movement: {
    walkSpeed: number;
    runSpeed: number;
    jumpHeight: number;
    gravity: number;
    coyoteTime: number;
    jumpBufferTime: number;
    acceleration: number;
    deceleration: number;
    airAcceleration: number;
    maxFallSpeed: number;
    dashSpeed: number;
    dashDuration: number;
    dashCooldown: number;
  };
  combat: GameplayCombat;
  abilities: Array<{ id: string; name: string }>;
  rooms: GameplayRoom[];
  sprites: GameplaySpriteClip[];
}

export interface EngineManifest {
  engine: 'godot' | 'unity' | 'unreal';
  engineVersion: string;
  generated: true;
  compiled: boolean;
  opened: boolean;
  playtested: boolean;
  visualCapture: boolean;
  standaloneBuild: boolean;
  acceptance: 'open' | 'closed';
  blocked: string[];
  gameplayPack: string;
  notes: string[];
}

export interface EngineAssemblyResult {
  success: boolean;
  projectPath: string;
  engine: 'godot' | 'unity' | 'unreal';
  errors: string[];
  warnings: string[];
}
